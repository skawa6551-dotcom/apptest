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

import { VAPID_KEY } from './firebase-config.js';

// ------------------------------------------------------------

// 定数

// ------------------------------------------------------------

const SDK_VERSION = '10.12.2';

const SCHEMA_VERSION = 1;

const INVITE_CODE_LENGTH = 6;

const INVITE_CODE_TTL_MS = 10 * 60 * 1000;

const INVITE_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const INVITE_CODE_MAX_ATTEMPTS = 5;

const MESSAGE_LIST_LIMIT = 200;

const NOTIFICATION_WORKER_URL =

  'https://calculator-0209-notifications.skawa6551.workers.dev';

// ------------------------------------------------------------

// 遅延初期化

// ------------------------------------------------------------

let firebaseState = null;

let loadPromise = null;

function loadFirebase() {

  if (firebaseState) return Promise.resolve(firebaseState);

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {

    const [{ initializeApp }, authFns, firestoreFns, configModule] =

      await Promise.all([

        import(

          `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`

        ),

        import(

          `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`

        ),

        import(

          `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`

        ),

        import('./firebase-config.js'),

      ]);

    const firebaseConfig = configModule.default;

    const app = initializeApp(firebaseConfig);

    const auth = authFns.getAuth(app);

    const db = firestoreFns.getFirestore(app);

    firebaseState = {

      app,

      auth,

      db,

      authFns,

      firestoreFns,

    };

    return firebaseState;

  })().catch((error) => {

    loadPromise = null;

    console.error(

      '[firebase.js] Firebase SDKの読み込みに失敗しました',

      error,

    );

    throw error;

  });

  return loadPromise;

}

// ------------------------------------------------------------

// Messaging（通知）

// ------------------------------------------------------------

let messagingState = null;

let messagingLoadPromise = null;

function loadMessaging() {

  if (messagingState) return Promise.resolve(messagingState);

  if (messagingLoadPromise) return messagingLoadPromise;

  messagingLoadPromise = (async () => {

    const { app } = await loadFirebase();

    const fns = await import(

      `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-messaging.js`

    );

    const messaging = fns.getMessaging(app);

    const supportsFid =

      typeof fns.register === 'function' &&

      typeof fns.onRegistered === 'function';

    if (!supportsFid) {

      console.warn(

        `[firebase.js] Firebase SDK v${SDK_VERSION} では register()/onRegistered() が利用できないため getToken() を使用します。`,

      );

    }

    messagingState = {

      messaging,

      fns,

      supportsFid,

    };

    return messagingState;

  })().catch((error) => {

    messagingLoadPromise = null;

    console.error(

      '[firebase.js] Firebase Messaging SDKの読み込みに失敗しました',

      error,

    );

    throw error;

  });

  return messagingLoadPromise;

}

export async function registerForPush(swRegistration) {

  const { fns, messaging, supportsFid } = await loadMessaging();

  if (supportsFid) {

    const id = await new Promise((resolve, reject) => {

      let unsubscribe = () => {};

      unsubscribe = fns.onRegistered(

        messaging,

        (installationId) => {

          unsubscribe();

          resolve(installationId);

        },

      );

      fns

        .register(messaging, {

          vapidKey: VAPID_KEY,

          serviceWorkerRegistration: swRegistration,

        })

        .catch((error) => {

          unsubscribe();

          reject(error);

        });

    });

    return {

      id,

      method: 'fid',

    };

  }

  const token = await fns.getToken(messaging, {

    vapidKey: VAPID_KEY,

    serviceWorkerRegistration: swRegistration,

  });

  if (!token) {

    throw new Error('通知の登録に失敗しました。');

  }

  return {

    id: token,

    method: 'token',

  };

}

export async function onForegroundMessage(callback) {

  const { fns, messaging } = await loadMessaging();

  if (typeof callback !== 'function') return () => {};

  return fns.onMessage(messaging, callback);

}

// ------------------------------------------------------------

// 認証

// ------------------------------------------------------------

let signInPromise = null;

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

export function getCurrentUid() {

  if (!firebaseState) return null;

  return firebaseState.auth.currentUser

    ? firebaseState.auth.currentUser.uid

    : null;

}

// ------------------------------------------------------------

// clientId / 表示名 / roomId

// ------------------------------------------------------------

export function getOrCreateClientId() {

  const existing = Storage.get(

    STORAGE_KEYS.CLIENT_ID,

    null,

  );

  if (existing) return existing;

  const generated =

    typeof crypto !== 'undefined' &&

    typeof crypto.randomUUID === 'function'

      ? crypto.randomUUID()

      : `client-${Date.now()}-${Math.random()

          .toString(36)

          .slice(2)}`;

  Storage.set(

    STORAGE_KEYS.CLIENT_ID,

    generated,

  );

  return generated;

}

export function getLocalDisplayName() {

  return Storage.get(

    STORAGE_KEYS.DISPLAY_NAME,

    null,

  );

}

export function saveLocalDisplayName(displayName) {

  Storage.set(

    STORAGE_KEYS.DISPLAY_NAME,

    displayName,

  );

}

export function getLocalRoomId() {

  return Storage.get(

    STORAGE_KEYS.CURRENT_ROOM_ID,

    null,

  );

}

export function saveLocalRoomId(roomId) {

  Storage.set(

    STORAGE_KEYS.CURRENT_ROOM_ID,

    roomId,

  );

}

// ------------------------------------------------------------

// /users/{uid}

// ------------------------------------------------------------

export async function ensureUserProfile(

  uid,

  displayName,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const userRef = firestoreFns.doc(

    db,

    'users',

    uid,

  );

  const snapshot =

    await firestoreFns.getDoc(userRef);

  if (snapshot.exists()) return;

  await firestoreFns.setDoc(

    userRef,

    {

      displayName,

      roomIds: [],

      createdAt:

        firestoreFns.serverTimestamp(),

      schemaVersion: SCHEMA_VERSION,

    },

  );

}

// ------------------------------------------------------------

// 招待コード／ペアリング

// ------------------------------------------------------------

function generateInviteCode() {

  let code = '';

  for (

    let i = 0;

    i < INVITE_CODE_LENGTH;

    i += 1

  ) {

    const index = Math.floor(

      Math.random() *

        INVITE_CODE_CHARSET.length,

    );

    code +=

      INVITE_CODE_CHARSET[index];

  }

  return code;

}

async function createInviteCodeDoc(

  db,

  firestoreFns,

  roomId,

  uid,

  purpose,

  replacesUid,

) {

  for (

    let attempt = 0;

    attempt < INVITE_CODE_MAX_ATTEMPTS;

    attempt += 1

  ) {

    const code = generateInviteCode();

    const codeRef = firestoreFns.doc(

      db,

      'inviteCodes',

      code,

    );

    const existing =

      await firestoreFns.getDoc(codeRef);

    if (existing.exists()) continue;

    await firestoreFns.setDoc(

      codeRef,

      {

        roomId,

        createdBy: uid,

        createdAt:

          firestoreFns.serverTimestamp(),

        expiresAt:

          firestoreFns.Timestamp.fromMillis(

            Date.now() +

              INVITE_CODE_TTL_MS,

          ),

        used: false,

        purpose,

        replacesUid,

      },

    );

    return code;

  }

  throw new Error(

    '招待コードの発行に失敗しました。もう一度お試しください。',

  );

}

export async function createRoomAndInviteCode(

  uid,

  displayName,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      firestoreFns.collection(

        db,

        'rooms',

      ),

    );

  const roomId = roomRef.id;

  await firestoreFns.setDoc(

    roomRef,

    {

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

          joinedAt:

            firestoreFns.serverTimestamp(),

          leftAt: null,

        },

      },

      createdBy: uid,

      createdAt:

        firestoreFns.serverTimestamp(),

      lastMessageAt: null,

      lastMessagePreview: null,

      customization: {

        workspaceTitle: null,

        cards: {},

        backgrounds: {},

      },

    },

  );

  const code =

    await createInviteCodeDoc(

      db,

      firestoreFns,

      roomId,

      uid,

      'initial',

      null,

    );

  await firestoreFns.updateDoc(

    firestoreFns.doc(

      db,

      'users',

      uid,

    ),

    {

      roomIds:

        firestoreFns.arrayUnion(roomId),

    },

  );

  return {

    roomId,

    code,

    expiresAt: new Date(

      Date.now() +

        INVITE_CODE_TTL_MS,

    ),

  };

}

export async function joinRoomWithCode(

  code,

  uid,

  displayName,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const normalizedCode =

    code.trim().toUpperCase();

  const codeRef = firestoreFns.doc(

    db,

    'inviteCodes',

    normalizedCode,

  );

  const roomId =

    await firestoreFns.runTransaction(

      db,

      async (transaction) => {

        const codeSnap =

          await transaction.get(

            codeRef,

          );

        if (!codeSnap.exists()) {

          throw new Error(

            '招待コードが見つかりません。入力内容をご確認ください。',

          );

        }

        const codeData =

          codeSnap.data();

        if (codeData.used) {

          throw new Error(

            'この招待コードは既に使用されています。',

          );

        }

        if (

          codeData.expiresAt.toMillis() <

          Date.now()

        ) {

          throw new Error(

            'この招待コードの有効期限が切れています。新しいコードを発行してもらってください。',

          );

        }

        const roomRef =

          firestoreFns.doc(

            db,

            'rooms',

            codeData.roomId,

          );

        const roomSnap =

          await transaction.get(

            roomRef,

          );

        if (!roomSnap.exists()) {

          throw new Error(

            'ルームが見つかりませんでした。',

          );

        }

        const roomData =

          roomSnap.data();

        if (

          roomData.memberIds.includes(

            uid,

          )

        ) {

          transaction.update(

            codeRef,

            {

              used: true,

            },

          );

          return codeData.roomId;

        }

        let finalMemberIds = [

          ...roomData.memberIds,

          uid,

        ];

        let finalFormerMemberIds =

          roomData.formerMemberIds ?? [];

        const finalProfiles = {

          ...roomData.memberProfiles,

          [uid]: {

            displayName,

            avatarUrl: null,

            accentColor: null,

            status: 'active',

            joinedAt:

              firestoreFns.serverTimestamp(),

            leftAt: null,

          },

        };

        if (

          codeData.purpose ===

            'replace' &&

          codeData.replacesUid

        ) {

          finalMemberIds =

            finalMemberIds.filter(

              (memberId) =>

                memberId !==

                codeData.replacesUid,

            );

          finalFormerMemberIds = [

            ...finalFormerMemberIds,

            codeData.replacesUid,

          ];

          if (

            finalProfiles[

              codeData.replacesUid

            ]

          ) {

            finalProfiles[

              codeData.replacesUid

            ] = {

              ...finalProfiles[

                codeData.replacesUid

              ],

              status: 'replaced',

              leftAt:

                firestoreFns.serverTimestamp(),

            };

          }

        }

        transaction.update(

          roomRef,

          {

            memberIds:

              finalMemberIds,

            formerMemberIds:

              finalFormerMemberIds,

            memberProfiles:

              finalProfiles,

            status: 'active',

          },

        );

        transaction.update(

          codeRef,

          {

            used: true,

          },

        );

        return codeData.roomId;

      },

    );

  await firestoreFns.updateDoc(

    firestoreFns.doc(

      db,

      'users',

      uid,

    ),

    {

      roomIds:

        firestoreFns.arrayUnion(

          roomId,

        ),

    },

  );

  return roomId;

}

export function subscribeToRoom(

  roomId,

  callback,

  onError,

) {

  let unsubscribeFn = () => {};

  let cancelled = false;

  loadFirebase().then(

    ({ db, firestoreFns }) => {

      if (cancelled) return;

      const roomRef =

        firestoreFns.doc(

          db,

          'rooms',

          roomId,

        );

      unsubscribeFn =

        firestoreFns.onSnapshot(

          roomRef,

          (snapshot) => {

            if (snapshot.exists()) {

              callback(

                snapshot.data(),

              );

            }

          },

          (error) => {

            console.error(

              '[firebase.js] ルームの購読でエラーが発生しました',

              error,

            );

            if (

              typeof onError ===

              'function'

            ) {

              onError(error);

            }

          },

        );

    },

  );

  return () => {

    cancelled = true;

    unsubscribeFn();

  };

}

// ------------------------------------------------------------

// メッセージ

// ------------------------------------------------------------

function buildSearchKeywords(text) {

  return text

    .toLowerCase()

    .split(/\s+/)

    .filter(

      (word) =>

        word.length > 0,

    )

    .slice(0, 20);

}

export async function sendTextMessage(

  roomId,

  uid,

  clientId,

  text,

) {

  const trimmed =

    typeof text === 'string'

      ? text.trim()

      : '';

  if (trimmed === '') {

    return null;

  }

  const { db, firestoreFns } =

    await loadFirebase();

  const messagesRef =

    firestoreFns.collection(

      db,

      'rooms',

      roomId,

      'messages',

    );

  const messageRef =

    await firestoreFns.addDoc(

      messagesRef,

      {

        schemaVersion:

          SCHEMA_VERSION,

        senderId: uid,

        clientId,

        type: 'text',

        text: trimmed,

        media: null,

        location: null,

        stickerId: null,

        timestamp:

          firestoreFns.serverTimestamp(),

        readBy: [uid],

        reactions: {},

        replyToMessageId: null,

        editedAt: null,

        deletedForEveryone:

          false,

        deletedFor: [],

        searchKeywords:

          buildSearchKeywords(

            trimmed,

          ),

      },

    );

  const preview =

    trimmed.length > 40

      ? `${trimmed.slice(

          0,

          40,

        )}…`

      : trimmed;

  await firestoreFns.updateDoc(

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    ),

    {

      lastMessageAt:

        firestoreFns.serverTimestamp(),

      lastMessagePreview:

        preview,

    },

  );

  return messageRef.id;

}

export function subscribeToMessages(

  roomId,

  callback,

  onError,

) {

  let unsubscribeFn = () => {};

  let cancelled = false;

  loadFirebase().then(

    ({ db, firestoreFns }) => {

      if (cancelled) return;

      const messagesRef =

        firestoreFns.collection(

          db,

          'rooms',

          roomId,

          'messages',

        );

      const messagesQuery =

        firestoreFns.query(

          messagesRef,

          firestoreFns.orderBy(

            'timestamp',

            'asc',

          ),

          firestoreFns.limit(

            MESSAGE_LIST_LIMIT,

          ),

        );

      unsubscribeFn =

        firestoreFns.onSnapshot(

          messagesQuery,

          (snapshot) => {

            const messages =

              snapshot.docs.map(

                (docSnapshot) => ({

                  id:

                    docSnapshot.id,

                  ...docSnapshot.data(),

                }),

              );

            callback(messages);

          },

          (error) => {

            console.error(

              '[firebase.js] メッセージの購読でエラーが発生しました',

              error,

            );

            if (

              typeof onError ===

              'function'

            ) {

              onError(error);

            }

          },

        );

    },

  );

  return () => {

    cancelled = true;

    unsubscribeFn();

  };

}

export async function markMessageAsRead(

  roomId,

  messageId,

  uid,

  currentReadBy,

) {

  if (

    Array.isArray(currentReadBy) &&

    currentReadBy.includes(uid)

  ) {

    return;

  }

  const { db, firestoreFns } =

    await loadFirebase();

  const messageRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'messages',

      messageId,

    );

  await firestoreFns.updateDoc(

    messageRef,

    {

      readBy:

        firestoreFns.arrayUnion(

          uid,

        ),

    },

  );

}

export async function setMessageReaction(

  roomId,

  messageId,

  uid,

  emoji,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const messageRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'messages',

      messageId,

    );

  if (emoji === null) {

    await firestoreFns.updateDoc(

      messageRef,

      {

        [`reactions.${uid}`]:

          firestoreFns.deleteField(),

      },

    );

    return;

  }

  await firestoreFns.updateDoc(

    messageRef,

    {

      [`reactions.${uid}`]:

        emoji,

    },

  );

}

export async function deleteMessage(

  roomId,

  messageId,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const messageRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'messages',

      messageId,

    );

  await firestoreFns.deleteDoc(

    messageRef,

  );

}

export async function deleteAllOwnMessages(

  roomId,

  uid,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const messagesRef =

    firestoreFns.collection(

      db,

      'rooms',

      roomId,

      'messages',

    );

  const ownMessagesQuery =

    firestoreFns.query(

      messagesRef,

      firestoreFns.where(

        'senderId',

        '==',

        uid,

      ),

    );

  const snapshot =

    await firestoreFns.getDocs(

      ownMessagesQuery,

    );

  await Promise.all(

    snapshot.docs.map(

      (docSnapshot) =>

        firestoreFns.deleteDoc(

          docSnapshot.ref,

        ),

    ),

  );

  return snapshot.size;

}

// ------------------------------------------------------------

// 入力中 / Presence

// ------------------------------------------------------------

export async function updateTypingState(

  roomId,

  uid,

  isTyping,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  await firestoreFns.updateDoc(

    roomRef,

    {

      [`typing.${uid}`]:

        isTyping

          ? firestoreFns.serverTimestamp()

          : firestoreFns.deleteField(),

    },

  );

}

export async function updatePresence(

  roomId,

  uid,

  isOnline,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  await firestoreFns.updateDoc(

    roomRef,

    {

      [`presence.${uid}`]: {

        state: isOnline

          ? 'online'

          : 'offline',

        lastSeenAt:

          firestoreFns.serverTimestamp(),

      },

    },

  );

}

// ------------------------------------------------------------

// カスタマイズ

// ------------------------------------------------------------

export async function updateRoomCustomization(

  roomId,

  partial,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  const updates = {};

  Object.entries(partial).forEach(

    ([path, value]) => {

      updates[

        `customization.${path}`

      ] = value;

    },

  );

  await firestoreFns.updateDoc(

    roomRef,

    updates,

  );

}

// ------------------------------------------------------------

// 通知登録

// ------------------------------------------------------------

export async function savePushRegistration(

  roomId,

  uid,

  clientId,

  registrationId,

  method,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  await firestoreFns.updateDoc(

    roomRef,

    {

      [`memberProfiles.${uid}.pushRegistrations.${clientId}`]:

        {

          id: registrationId,

          method,

          enabled: true,

          updatedAt:

            firestoreFns.serverTimestamp(),

          platform: 'ios-pwa',

        },

    },

  );

}

export async function disablePushRegistration(

  roomId,

  uid,

  clientId,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  await firestoreFns.updateDoc(

    roomRef,

    {

      [`memberProfiles.${uid}.pushRegistrations.${clientId}.enabled`]:

        false,

      [`memberProfiles.${uid}.pushRegistrations.${clientId}.updatedAt`]:

        firestoreFns.serverTimestamp(),

    },

  );

}

export async function saveNotificationContentPreference(

  roomId,

  uid,

  enabled,

) {

  const { db, firestoreFns } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  await firestoreFns.updateDoc(

    roomRef,

    {

      [`memberProfiles.${uid}.notificationContentEnabled`]:

        enabled,

    },

  );

}

// ------------------------------------------------------------

// Cloudflare Worker通知依頼

// ------------------------------------------------------------

export async function requestNotificationSend(

  roomId,

  messageId,

) {

  const { auth } =

    await loadFirebase();

  if (!auth.currentUser) {

    return false;

  }

  const idToken =

    await auth.currentUser.getIdToken();

  const response = await fetch(

    NOTIFICATION_WORKER_URL,

    {

      method: 'POST',

      headers: {

        'Content-Type':

          'application/json',

        Authorization:

          `Bearer ${idToken}`,

      },

      body: JSON.stringify({

        roomId,

        messageId,

      }),

    },

  );

  if (!response.ok) {

    throw new Error(

      `通知の送信依頼に失敗しました (status: ${response.status})`,

    );

  }

  return true;

}

// ------------------------------------------------------------

// default export

// ------------------------------------------------------------

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

  markMessageAsRead,

  setMessageReaction,

  deleteMessage,

  deleteAllOwnMessages,

  updateTypingState,

  updatePresence,

  updateRoomCustomization,

  registerForPush,

  onForegroundMessage,

  savePushRegistration,

  disablePushRegistration,

  saveNotificationContentPreference,

  requestNotificationSend,

};

export default Firebase;