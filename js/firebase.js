// ============================================================
// firebase.js
// アプリ全体で唯一 Firebase（Auth / Firestore）にアクセスするモジュール。
// storage.jsがlocalStorageの唯一の窓口であるのと同じ考え方で、
// 他のモジュール（pairing.js / messages.js）はFirebaseへ直接アクセスせず
// 必ずこのファイルの関数を経由すること。DOM操作はここでは一切行わない。
//
// 【重要】Firebase SDKは意図的に動的import（遅延読み込み）にしている。
// もし通常のimport文（静的import）でCDN（gstatic.com）から読み込むと、
// ネットワーク不通や設定ミスでこのファイルの読み込み自体が失敗した際に、
// router.js → app.js まで読み込み失敗が連鎖し、電卓本体まで含めた
// アプリ全体が起動できなくなってしまう。
// 実際にメッセージ機能を使う瞬間（ensureSignedIn()等の呼び出し時）に
// 初めてSDKを読み込むことで、Firebase側で何が起きても電卓・Workspace・
// カレンダー等の既存機能を巻き込まないようにしている。
//
// 設計書（Phase1）で定義したコレクション構成に対応する：
//   /users/{uid}
//   /rooms/{roomId}
//   /rooms/{roomId}/messages/{messageId}
//   /inviteCodes/{code}
// ============================================================

import Storage, { STORAGE_KEYS } from './storage.js';

// ------------------------------------------------------------
// 定数
// ------------------------------------------------------------

/** Firebase JS SDKのバージョン。更新する場合はこの1箇所だけ変更すればよい。 */
const SDK_VERSION = '10.12.2';

/** 現在のドキュメントスキーマの世代。新規作成するドキュメントは常にこの値を書き込む。 */
const SCHEMA_VERSION = 1;

/** 招待コードの桁数 */
const INVITE_CODE_LENGTH = 6;

/** 招待コードの有効期限（ミリ秒）。発行から10分。 */
const INVITE_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * 招待コードに使う文字集合。
 * '0'/'O'、'1'/'I' のような見間違えやすい文字はあらかじめ除外している。
 */
const INVITE_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 招待コード生成時、既存コードと衝突した場合の最大リトライ回数 */
const INVITE_CODE_MAX_ATTEMPTS = 5;

/** メッセージ購読時に一度に取得する最大件数（Phase1はページングなしの簡易実装） */
const MESSAGE_LIST_LIMIT = 200;

// ------------------------------------------------------------
// 遅延初期化
// ------------------------------------------------------------

/**
 * 読み込み済みのSDK関数群・appインスタンス等をまとめて保持する。
 * loadFirebase()完了後にのみ中身が入る。
 * @type {null | {
 *   auth: import('firebase/auth').Auth,
 *   db: import('firebase/firestore').Firestore,
 *   authFns: object,
 *   firestoreFns: object,
 * }}
 */
let firebaseState = null;

/** loadFirebase()の多重実行防止用キャッシュ（実行中/完了したPromiseを保持） */
let loadPromise = null;

/**
 * Firebase SDK（Auth / Firestore）を動的importで読み込み、初期化する。
 * 何度呼んでも実際の読み込み・初期化処理は1回しか走らない。
 * ネットワーク不通や設定不備で失敗した場合はエラーをそのまま投げる
 * （呼び出し元のensureSignedIn()等がそれをそのまま上位へ伝播させ、
 * pairing.js/messages.js側で「接続できませんでした」等の表示につなげる）。
 * @returns {Promise<{auth: object, db: object, authFns: object, firestoreFns: object}>}
 */
function loadFirebase() {
  if (firebaseState) return Promise.resolve(firebaseState);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [{ initializeApp }, authFns, firestoreFns, configModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
      import('./firebase-config.js'),
    ]);

    const firebaseConfig = configModule.default;
    const app = initializeApp(firebaseConfig);
    const auth = authFns.getAuth(app);
    const db = firestoreFns.getFirestore(app);

    firebaseState = { auth, db, authFns, firestoreFns };
    return firebaseState;
  })().catch((error) => {
    // 失敗時は次回呼び出しでもう一度読み込みを試せるよう、キャッシュをリセットする。
    loadPromise = null;
    console.error('[firebase.js] Firebase SDKの読み込みに失敗しました', error);
    throw error;
  });

  return loadPromise;
}

// ------------------------------------------------------------
// 認証
// ------------------------------------------------------------

/** signInAnonymously()の多重発火防止用キャッシュ */
let signInPromise = null;

/**
 * 匿名認証でサインインする。既にサインイン済みならそのuidを返すだけで、
 * 何度呼んでも実際のサインイン処理は1回しか走らない。
 * SDKの読み込みに失敗した場合は、そのままエラーを投げる。
 * @returns {Promise<string>} uid
 */
export async function ensureSignedIn() {
  const { auth, authFns } = await loadFirebase();

  if (auth.currentUser) return auth.currentUser.uid;
  if (signInPromise) return signInPromise;

  signInPromise = authFns
    .signInAnonymously(auth)
    .then((credential) => credential.user.uid)
    .catch((error) => {
      signInPromise = null;
      throw error;
    });

  return signInPromise;
}

/**
 * 現在サインイン中のuidを返す（未サインイン、またはSDK未読み込みならnull）。
 * @returns {string|null}
 */
export function getCurrentUid() {
  if (!firebaseState) return null;
  return firebaseState.auth.currentUser ? firebaseState.auth.currentUser.uid : null;
}

// ------------------------------------------------------------
// clientId（端末識別子）／表示名（ローカルキャッシュ）
// ------------------------------------------------------------

/**
 * ローカルに保存された端末識別子（clientId）を取得する。
 * 無ければ生成してStorageへ保存する（以後その端末で使い回す）。
 * uid（＝アカウント）とは別物で、「どの端末から送ったか」を表す。
 * Firebase SDKの読み込みは不要なため、同期関数のまま提供する。
 * @returns {string}
 */
export function getOrCreateClientId() {
  const existing = Storage.get(STORAGE_KEYS.CLIENT_ID, null);
  if (existing) return existing;

  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  Storage.set(STORAGE_KEYS.CLIENT_ID, generated);
  return generated;
}

/**
 * ローカルに保存済みの表示名を取得する（無ければnull）。
 * @returns {string|null}
 */
export function getLocalDisplayName() {
  return Storage.get(STORAGE_KEYS.DISPLAY_NAME, null);
}

/**
 * 表示名をローカルへ保存する。
 * @param {string} displayName
 */
export function saveLocalDisplayName(displayName) {
  Storage.set(STORAGE_KEYS.DISPLAY_NAME, displayName);
}

/**
 * 現在接続中のルームIDをローカルから取得する（無ければnull）。
 * @returns {string|null}
 */
export function getLocalRoomId() {
  return Storage.get(STORAGE_KEYS.CURRENT_ROOM_ID, null);
}

/**
 * 現在接続中のルームIDをローカルへ保存する。
 * @param {string} roomId
 */
export function saveLocalRoomId(roomId) {
  Storage.set(STORAGE_KEYS.CURRENT_ROOM_ID, roomId);
}

// ------------------------------------------------------------
// /users/{uid}
// ------------------------------------------------------------

/**
 * /users/{uid} ドキュメントを作成する。既に存在する場合は何もしない。
 * @param {string} uid
 * @param {string} displayName
 * @returns {Promise<void>}
 */
export async function ensureUserProfile(uid, displayName) {
  const { db, firestoreFns } = await loadFirebase();
  const userRef = firestoreFns.doc(db, 'users', uid);
  const snapshot = await firestoreFns.getDoc(userRef);
  if (snapshot.exists()) return;

  await firestoreFns.setDoc(userRef, {
    displayName,
    roomIds: [],
    createdAt: firestoreFns.serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  });
}

// ------------------------------------------------------------
// 招待コード／ペアリング
// ------------------------------------------------------------

/**
 * ランダムな招待コードを1つ生成する（文字の重複や衝突チェックは行わない、
 * 純粋な文字列生成だけを担当する）。
 * @returns {string}
 */
function generateInviteCode() {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * INVITE_CODE_CHARSET.length);
    code += INVITE_CODE_CHARSET[index];
  }
  return code;
}

/**
 * /inviteCodes/{code} ドキュメントを作成する。
 * 生成したコードが既存ドキュメントと衝突していた場合は、
 * INVITE_CODE_MAX_ATTEMPTS回まで作り直す。
 * @param {object} db
 * @param {object} firestoreFns
 * @param {string} roomId
 * @param {string} uid
 * @param {'initial'|'reinvite'|'replace'} purpose
 * @param {string|null} replacesUid
 * @returns {Promise<string>} 発行できたコード
 */
async function createInviteCodeDoc(db, firestoreFns, roomId, uid, purpose, replacesUid) {
  for (let attempt = 0; attempt < INVITE_CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = generateInviteCode();
    const codeRef = firestoreFns.doc(db, 'inviteCodes', code);
    const existing = await firestoreFns.getDoc(codeRef);
    if (existing.exists()) continue;

    await firestoreFns.setDoc(codeRef, {
      roomId,
      createdBy: uid,
      createdAt: firestoreFns.serverTimestamp(),
      expiresAt: firestoreFns.Timestamp.fromMillis(Date.now() + INVITE_CODE_TTL_MS),
      used: false,
      purpose,
      replacesUid,
    });
    return code;
  }

  throw new Error('招待コードの発行に失敗しました。もう一度お試しください。');
}

/**
 * 新しいルームを作成し、初回ペアリング用の招待コードを発行する。
 * @param {string} uid
 * @param {string} displayName
 * @returns {Promise<{roomId: string, code: string, expiresAt: Date}>}
 */
export async function createRoomAndInviteCode(uid, displayName) {
  const { db, firestoreFns } = await loadFirebase();

  const roomRef = firestoreFns.doc(firestoreFns.collection(db, 'rooms'));
  const roomId = roomRef.id;

  await firestoreFns.setDoc(roomRef, {
    status: 'pending',
    schemaVersion: SCHEMA_VERSION,
    memberIds: [uid],
    formerMemberIds: [],
    memberProfiles: {
      [uid]: {
        displayName,
        avatarUrl: null,
        accentColor: null,
        status: 'active',
        joinedAt: firestoreFns.serverTimestamp(),
        leftAt: null,
      },
    },
    createdBy: uid,
    createdAt: firestoreFns.serverTimestamp(),
    lastMessageAt: null,
    lastMessagePreview: null,
    customization: {
      workspaceTitle: null,
      cards: {},
      backgrounds: {},
    },
  });

  const code = await createInviteCodeDoc(db, firestoreFns, roomId, uid, 'initial', null);

  await firestoreFns.updateDoc(firestoreFns.doc(db, 'users', uid), {
    roomIds: firestoreFns.arrayUnion(roomId),
  });

  return { roomId, code, expiresAt: new Date(Date.now() + INVITE_CODE_TTL_MS) };
}

/**
 * 招待コードを使ってルームへ参加する。
 * 'replace'目的のコードだった場合は、置き換え対象のuidをformerMemberIdsへ
 * 移す処理もあわせて行う。
 * すべての読み書きを1つのトランザクションにまとめ、複数人が同時に
 * 同じコードを使おうとした場合の競合を防ぐ。
 * @param {string} code
 * @param {string} uid
 * @param {string} displayName
 * @returns {Promise<string>} roomId
 */
export async function joinRoomWithCode(code, uid, displayName) {
  const { db, firestoreFns } = await loadFirebase();
  const normalizedCode = code.trim().toUpperCase();
  const codeRef = firestoreFns.doc(db, 'inviteCodes', normalizedCode);

  const roomId = await firestoreFns.runTransaction(db, async (transaction) => {
    const codeSnap = await transaction.get(codeRef);
    if (!codeSnap.exists()) {
      throw new Error('招待コードが見つかりません。入力内容をご確認ください。');
    }

    const codeData = codeSnap.data();
    if (codeData.used) {
      throw new Error('この招待コードは既に使用されています。');
    }
    if (codeData.expiresAt.toMillis() < Date.now()) {
      throw new Error('この招待コードの有効期限が切れています。新しいコードを発行してもらってください。');
    }

    const roomRef = firestoreFns.doc(db, 'rooms', codeData.roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('ルームが見つかりませんでした。');
    }

    const roomData = roomSnap.data();

    if (roomData.memberIds.includes(uid)) {
      // 既に参加済み（同じコードを誤って2回使った等）。エラーにはせず成功扱いにする。
      transaction.update(codeRef, { used: true });
      return codeData.roomId;
    }

    let finalMemberIds = [...roomData.memberIds, uid];
    let finalFormerMemberIds = roomData.formerMemberIds ?? [];
    const finalProfiles = {
      ...roomData.memberProfiles,
      [uid]: {
        displayName,
        avatarUrl: null,
        accentColor: null,
        status: 'active',
        joinedAt: firestoreFns.serverTimestamp(),
        leftAt: null,
      },
    };

    if (codeData.purpose === 'replace' && codeData.replacesUid) {
      finalMemberIds = finalMemberIds.filter((memberId) => memberId !== codeData.replacesUid);
      finalFormerMemberIds = [...finalFormerMemberIds, codeData.replacesUid];
      if (finalProfiles[codeData.replacesUid]) {
        finalProfiles[codeData.replacesUid] = {
          ...finalProfiles[codeData.replacesUid],
          status: 'replaced',
          leftAt: firestoreFns.serverTimestamp(),
        };
      }
    }

    transaction.update(roomRef, {
      memberIds: finalMemberIds,
      formerMemberIds: finalFormerMemberIds,
      memberProfiles: finalProfiles,
      status: 'active',
    });
    transaction.update(codeRef, { used: true });

    return codeData.roomId;
  });

  await firestoreFns.updateDoc(firestoreFns.doc(db, 'users', uid), {
    roomIds: firestoreFns.arrayUnion(roomId),
  });

  return roomId;
}

/**
 * ルームドキュメントの変化を購読する（ペアリング成立の検知等に使う）。
 * SDKの読み込みが未完了の場合は、読み込み完了後に改めて購読を開始する
 * （その間は何もしないno-op関数を購読解除関数として返す）。
 * @param {string} roomId
 * @param {(roomData: object) => void} callback
 * @returns {() => void} 購読解除関数
 */
export function subscribeToRoom(roomId, callback) {
  let unsubscribeFn = () => {};
  let cancelled = false;

  loadFirebase().then(({ db, firestoreFns }) => {
    if (cancelled) return;
    const roomRef = firestoreFns.doc(db, 'rooms', roomId);
    unsubscribeFn = firestoreFns.onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) callback(snapshot.data());
    });
  });

  return () => {
    cancelled = true;
    unsubscribeFn();
  };
}

// ------------------------------------------------------------
// メッセージ
// ------------------------------------------------------------

/**
 * 検索用キーワード配列を作る（Phase1の簡易実装：小文字化して空白で分割するだけ）。
 * 本格的な全文検索が必要になった場合は、外部検索サービス連携時にこの関数を
 * 差し替えるだけで済むよう、呼び出し側とは分離してある。
 * @param {string} text
 * @returns {string[]}
 */
function buildSearchKeywords(text) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 20);
}

/**
 * テキストメッセージを送信する。
 * 送信後、ルームの lastMessageAt / lastMessagePreview もあわせて更新する
 * （将来のルーム一覧表示のためのフィールドを、Phase1のうちから維持しておく）。
 * @param {string} roomId
 * @param {string} uid
 * @param {string} clientId
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function sendTextMessage(roomId, uid, clientId, text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') return;

  const { db, firestoreFns } = await loadFirebase();
  const messagesRef = firestoreFns.collection(db, 'rooms', roomId, 'messages');

  await firestoreFns.addDoc(messagesRef, {
    schemaVersion: SCHEMA_VERSION,
    senderId: uid,
    clientId,
    type: 'text',
    text: trimmed,
    media: null,
    location: null,
    stickerId: null,
    timestamp: firestoreFns.serverTimestamp(),
    readBy: [uid],
    reactions: {},
    replyToMessageId: null,
    editedAt: null,
    deletedForEveryone: false,
    deletedFor: [],
    searchKeywords: buildSearchKeywords(trimmed),
  });

  const preview = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
  await firestoreFns.updateDoc(firestoreFns.doc(db, 'rooms', roomId), {
    lastMessageAt: firestoreFns.serverTimestamp(),
    lastMessagePreview: preview,
  });
}

/**
 * メッセージ一覧の変化を購読する（直近MESSAGE_LIST_LIMIT件、古い→新しい順）。
 * SDKの読み込みが未完了の場合は、読み込み完了後に改めて購読を開始する。
 * @param {string} roomId
 * @param {(messages: object[]) => void} callback
 * @returns {() => void} 購読解除関数
 */
export function subscribeToMessages(roomId, callback) {
  let unsubscribeFn = () => {};
  let cancelled = false;

  loadFirebase().then(({ db, firestoreFns }) => {
    if (cancelled) return;
    const messagesRef = firestoreFns.collection(db, 'rooms', roomId, 'messages');
    const messagesQuery = firestoreFns.query(
      messagesRef,
      firestoreFns.orderBy('timestamp', 'asc'),
      firestoreFns.limit(MESSAGE_LIST_LIMIT),
    );

    unsubscribeFn = firestoreFns.onSnapshot(messagesQuery, (snapshot) => {
      const messages = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }));
      callback(messages);
    });
  });

  return () => {
    cancelled = true;
    unsubscribeFn();
  };
}

const Firebase = {
  ensureSignedIn,
  getCurrentUid,
  getOrCreateClientId,
  getLocalDisplayName,
  saveLocalDisplayName,
  getLocalRoomId,
  saveLocalRoomId,
  ensureUserProfile,
  createRoomAndInviteCode,
  joinRoomWithCode,
  subscribeToRoom,
  sendTextMessage,
  subscribeToMessages,
};

export default Firebase;