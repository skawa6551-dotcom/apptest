// ============================================================

// firebase.js

// Calculator 0209

//

// Firebase共通モジュール 完成版

//

// 使用するFirebase機能：

// ・Anonymous Authentication

// ・Cloud Firestore

// ・Firebase Cloud Messaging

//

// 写真本体はFirebase Storageを使わない。

// 写真共有はSupabase側で管理する。

//

// Firebase SDKは動的importにする。

// Firebase側で問題が起きても、電卓本体の読み込みを

// 巻き込まないため。

// ============================================================

import Storage, {

  STORAGE_KEYS,

} from './storage.js';

import firebaseConfig, {

  VAPID_KEY,

} from './firebase-config.js';

// ============================================================

// Firebase SDK

// ============================================================

const SDK_VERSION =

  '12.16.0';

// ============================================================

// 共通定数

// ============================================================

const SCHEMA_VERSION =

  1;

const INVITE_CODE_LENGTH =

  6;

const INVITE_CODE_TTL_MS =

  10 * 60 * 1000;

const RECOVERY_CODE_LENGTH = 12;
const RECOVERY_CODE_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';



const INVITE_CODE_CHARSET =

  '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const INVITE_CODE_MAX_ATTEMPTS =

  10;

const MESSAGE_LIST_LIMIT =

  300;

// ============================================================

// Firebase状態

// ============================================================

let firebaseState =

  null;

let firebaseLoadPromise =

  null;

// ============================================================

// Messaging状態

// ============================================================

let messagingState =

  null;

let messagingLoadPromise =

  null;

// ============================================================

// 認証状態

// ============================================================

let signInPromise =

  null;

// ============================================================

// Firebase SDK読み込み

// ============================================================

async function loadFirebase() {

  if (

    firebaseState

  ) {

    return firebaseState;

  }

  if (

    firebaseLoadPromise

  ) {

    return firebaseLoadPromise;

  }

  firebaseLoadPromise =

    (async () => {

      const [

        appFns,

        authFns,

        firestoreFns,

      ] =

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

        ]);

      let app;

      /*

       * 同じページ内ですでにFirebase Appが

       * 初期化済みの場合にも対応する。

       */

      if (

        typeof appFns.getApps ===

          'function' &&

        appFns.getApps().length >

          0

      ) {

        app =

          appFns.getApp();

      } else {

        app =

          appFns.initializeApp(

            firebaseConfig,

          );

      }

      const auth =

        authFns.getAuth(

          app,

        );

      const db =

        firestoreFns.getFirestore(

          app,

        );

      firebaseState = {

        app,

        auth,

        db,

        appFns,

        authFns,

        firestoreFns,

      };

      return firebaseState;

    })()

      .catch(

        (

          error,

        ) => {

          firebaseLoadPromise =

            null;

          firebaseState =

            null;

          console.error(

            '[firebase.js] Firebase SDKの読み込みに失敗しました',

            error,

          );

          throw error;

        },

      );

  return firebaseLoadPromise;

}

// ============================================================

// Messaging SDK読み込み

// ============================================================

async function loadMessaging() {

  if (

    messagingState

  ) {

    return messagingState;

  }

  if (

    messagingLoadPromise

  ) {

    return messagingLoadPromise;

  }

  messagingLoadPromise =

    (async () => {

      const {

        app,

      } =

        await loadFirebase();

      const fns =

        await import(

          `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-messaging.js`

        );

      /*

       * iPhone Safari / PWAを含め、

       * Messagingを利用できない環境では

       * ここで終了する。

       */

      if (

        typeof fns.isSupported ===

        'function'

      ) {

        const supported =

          await fns.isSupported();

        if (

          !supported

        ) {

          throw new Error(

            'この環境はFirebase Messagingに対応していません。',

          );

        }

      }

      const messaging =

        fns.getMessaging(

          app,

        );

      /*

       * 新しいFirebase Messagingでは

       * FIDベースのregister / onRegisteredを使用する。

       *

       * 万一利用できないFirebase SDKへ戻した場合は

       * getTokenへフォールバックできる。

       */

      const supportsFid =

        typeof fns.register ===

          'function' &&

        typeof fns.onRegistered ===

          'function';

      messagingState = {

        fns,

        messaging,

        supportsFid,

      };

      return messagingState;

    })()

      .catch(

        (

          error,

        ) => {

          messagingLoadPromise =

            null;

          messagingState =

            null;

          console.warn(

            '[firebase.js] Messaging SDKの読み込みに失敗しました',

            error,

          );

          throw error;

        },

      );

  return messagingLoadPromise;

}

// ============================================================

// Firebase利用可能確認

// ============================================================

export async function isFirebaseAvailable() {

  try {

    await loadFirebase();

    return true;

  } catch (

    error

  ) {

    console.error(

      '[firebase.js] Firebaseを利用できません',

      error,

    );

    return false;

  }

}

// ============================================================

// Firebase初期化

// ============================================================

export async function initFirebase() {

  return loadFirebase();

}

// ============================================================

// Firebase Messaging対応確認

// ============================================================

export async function isMessagingSupported() {

  if (

    typeof window ===

      'undefined'

  ) {

    return false;

  }

  if (

    !(

      'Notification' in

      window

    )

  ) {

    return false;

  }

  if (

    !(

      'serviceWorker' in

      navigator

    )

  ) {

    return false;

  }

  try {

    await loadMessaging();

    return true;

  } catch {

    return false;

  }

}

// ============================================================

// Push登録

// ============================================================

export async function registerForPush(

  swRegistration,

) {

  if (

    !swRegistration

  ) {

    throw new Error(

      'Service Workerの登録情報がありません。',

    );

  }

  const {

    fns,

    messaging,

    supportsFid,

  } =

    await loadMessaging();

  /*

   * Firebase 12系の推奨方式。

   *

   * register()完了後、

   * onRegistered()からFirebase Installation IDを受け取る。

   */

  if (

    supportsFid

  ) {

    const id =

      await new Promise(

        (

          resolve,

          reject,

        ) => {

          let settled =

            false;

          let timeoutId =

            null;

          let unsubscribe =

            () => {};

          const finishSuccess =

            (

              installationId,

            ) => {

              if (

                settled

              ) {

                return;

              }

              settled =

                true;

              if (

                timeoutId !==

                null

              ) {

                window.clearTimeout(

                  timeoutId,

                );

              }

              try {

                unsubscribe();

              } catch {

                // no-op

              }

              resolve(

                installationId,

              );

            };

          const finishError =

            (

              error,

            ) => {

              if (

                settled

              ) {

                return;

              }

              settled =

                true;

              if (

                timeoutId !==

                null

              ) {

                window.clearTimeout(

                  timeoutId,

                );

              }

              try {

                unsubscribe();

              } catch {

                // no-op

              }

              reject(

                error,

              );

            };

          try {

            unsubscribe =

              fns.onRegistered(

                messaging,

                (

                  installationId,

                ) => {

                  if (

                    typeof installationId !==

                      'string' ||

                    installationId.trim() ===

                      ''

                  ) {

                    return;

                  }

                  finishSuccess(

                    installationId.trim(),

                  );

                },

              );

          } catch (

            error

          ) {

            finishError(

              error,

            );

            return;

          }

          timeoutId =

            window.setTimeout(

              () => {

                finishError(

                  new Error(

                    '通知登録の完了確認がタイムアウトしました。',

                  ),

                );

              },

              15000,

            );

          fns

            .register(

              messaging,

              {

                vapidKey:

                  VAPID_KEY,

                serviceWorkerRegistration:

                  swRegistration,

              },

            )

            .catch(

              (

                error,

              ) => {

                finishError(

                  error,

                );

              },

            );

        },

      );

    return {

      id,

      method:

        'fid',

    };

  }

  /*

   * 古いFirebase Messagingとの互換用。

   * 現在は通常ここには入らない。

   */

  if (

    typeof fns.getToken !==

      'function'

  ) {

    throw new Error(

      '通知登録APIを利用できません。',

    );

  }

  const token =

    await fns.getToken(

      messaging,

      {

        vapidKey:

          VAPID_KEY,

        serviceWorkerRegistration:

          swRegistration,

      },

    );

  if (

    !token

  ) {

    throw new Error(

      '通知の登録に失敗しました。',

    );

  }

  return {

    id:

      token,

    method:

      'token',

  };

}

// ============================================================

// フォアグラウンド通知

// ============================================================

export async function onForegroundMessage(

  callback,

) {

  if (

    typeof callback !==

      'function'

  ) {

    return () => {};

  }

  const {

    fns,

    messaging,

  } =

    await loadMessaging();

  return fns.onMessage(

    messaging,

    callback,

  );

}

// ============================================================

// 旧API互換

// ============================================================

export async function subscribeToForegroundMessages(

  callback,

) {

  return onForegroundMessage(

    callback,

  );

}

// ============================================================

// Firebase匿名認証

// ============================================================

export async function ensureSignedIn() {

  const {

    auth,

    authFns,

  } =

    await loadFirebase();

  if (

    auth.currentUser

  ) {

    return auth.currentUser.uid;

  }

  if (

    signInPromise

  ) {

    return signInPromise;

  }

  signInPromise =

    authFns

      .signInAnonymously(

        auth,

      )

      .then(

        (

          credential,

        ) => {

          if (

            !credential?.user?.uid

          ) {

            throw new Error(

              'Firebase匿名認証に失敗しました。',

            );

          }

          return credential

            .user

            .uid;

        },

      )

      .catch(

        (

          error,

        ) => {

          signInPromise =

            null;

          throw error;

        },

      )

      .finally(

        () => {

          signInPromise =

            null;

        },

      );

  return signInPromise;

}

// ============================================================

// 現在のFirebase uid

// ============================================================

export function getCurrentUid() {

  if (

    !firebaseState

  ) {

    return null;

  }

  return firebaseState

    .auth

    .currentUser

      ? firebaseState

          .auth

          .currentUser

          .uid

      : null;

}

// ============================================================

// Firebase ID Token

// ============================================================

export async function getFirebaseIdToken(

  forceRefresh = false,

) {

  const {

    auth,

  } =

    await loadFirebase();

  await ensureSignedIn();

  if (

    !auth.currentUser

  ) {

    throw new Error(

      'Firebaseにサインインしていません。',

    );

  }

  return auth.currentUser

    .getIdToken(

      Boolean(

        forceRefresh,

      ),

    );

}

// ============================================================

// clientId

// ============================================================

export function getOrCreateClientId() {

  const existing =

    Storage.get(

      STORAGE_KEYS.CLIENT_ID,

      null,

    );

  if (

    typeof existing ===

      'string' &&

    existing.trim() !==

      ''

  ) {

    return existing;

  }

  const generated =

    typeof crypto !==

      'undefined' &&

    typeof crypto.randomUUID ===

      'function'

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

// ============================================================

// 表示名

// ============================================================

export function getLocalDisplayName() {

  return Storage.get(

    STORAGE_KEYS.DISPLAY_NAME,

    null,

  );

}

export function saveLocalDisplayName(

  displayName,

) {

  Storage.set(

    STORAGE_KEYS.DISPLAY_NAME,

    typeof displayName ===

      'string'

      ? displayName

      : '',

  );

}

// ============================================================

// roomId

// ============================================================

export function getLocalRoomId() {

  return Storage.get(

    STORAGE_KEYS.CURRENT_ROOM_ID,

    null,

  );

}

export function getRecoveryRoomId() {

  return Storage.get(

    STORAGE_KEYS.RECOVERY_ROOM_ID,

    null,

  );

}

export function saveLocalRoomId(

  roomId,

) {

  Storage.set(

    STORAGE_KEYS.CURRENT_ROOM_ID,

    roomId,

  );

  // 接続解除時にroomIdをnullへしても、
  // データ復旧用roomIdは消さない。
  if (
    typeof roomId ===
      'string' &&
    roomId.trim()
  ) {
    Storage.set(
      STORAGE_KEYS.RECOVERY_ROOM_ID,
      roomId.trim(),
    );
  }

}

export function clearRecoveryRoomId() {

  Storage.remove(

    STORAGE_KEYS.RECOVERY_ROOM_ID,

  );

}

export function getRecoveredSenderIds() {

  const value =
    Storage.get(
      STORAGE_KEYS.RECOVERED_SENDER_IDS,
      [],
    );

  return Array.isArray(value)
    ? value.filter(
        (
          item,
        ) =>
          typeof item ===
          'string' &&
          item.trim(),
      )
    : [];

}

export function isOwnSenderId(
  senderId,
) {

  if (
    !senderId
  ) {
    return false;
  }

  const currentUid =
    getCurrentUid();

  if (
    senderId ===
    currentUid
  ) {
    return true;
  }

  return getRecoveredSenderIds()
    .includes(
      senderId,
    );

}

function rememberRecoveredSenderId(
  senderId,
) {

  if (
    !senderId
  ) {
    return;
  }

  const current =
    getRecoveredSenderIds();

  if (
    current.includes(
      senderId,
    )
  ) {
    return;
  }

  Storage.set(
    STORAGE_KEYS.RECOVERED_SENDER_IDS,
    [
      ...current,
      senderId,
    ].slice(-8),
  );

}

function normalizeRecoveryCode(
  code,
) {

  return String(
    code ?? '',
  )
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      '',
    );

}

function formatRecoveryCode(
  code,
) {

  const normalized =
    normalizeRecoveryCode(
      code,
    );

  return normalized
    .match(/.{1,4}/g)
    ?.join('-') ??
    normalized;

}

function generateRecoveryCodeValue() {

  const bytes =
    new Uint8Array(
      RECOVERY_CODE_LENGTH,
    );

  crypto.getRandomValues(
    bytes,
  );

  let code = '';

  for (
    const byte of bytes
  ) {
    code +=
      RECOVERY_CODE_ALPHABET[
        byte %
        RECOVERY_CODE_ALPHABET.length
      ];
  }

  return code;

}


// ============================================================

// /users/{uid}

// ============================================================


// ============================================================
// ペアリング済み状態の復元
// ============================================================

export async function resolvePersistentRoomId() {

  const uid =
    await ensureSignedIn();

  const candidates =
    [
      getLocalRoomId(),
      getRecoveryRoomId(),
    ]
      .filter(
        (
          value,
          index,
          array,
        ) =>
          typeof value ===
            'string' &&
          value.trim() &&
          array.indexOf(value) ===
            index,
      );

  for (
    const roomId of candidates
  ) {
    try {
      const room =
        await getRoom(
          roomId,
        );

      if (!room) {
        continue;
      }

      const memberIds =
        Array.isArray(
          room.memberIds,
        )
          ? room.memberIds
          : [];

      if (
        memberIds.includes(
          uid,
        )
      ) {
        saveLocalRoomId(
          roomId,
        );

        return roomId;
      }
    } catch (
      error
    ) {
      console.warn(
        '[firebase.js] 保存済みルームの確認に失敗しました',
        error,
      );
    }
  }

  return null;
}

export async function ensureUserProfile(

  uid,

  displayName,

) {

  if (

    !uid

  ) {

    throw new Error(

      'ユーザーIDがありません。',

    );

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const userRef =

    firestoreFns.doc(

      db,

      'users',

      uid,

    );

  const snapshot =

    await firestoreFns.getDoc(

      userRef,

    );

  if (

    snapshot.exists()

  ) {

    /*

     * 既存ユーザーでも表示名が変更されていたら更新する。

     */

    const current =

      snapshot.data();

    if (

      typeof displayName ===

        'string' &&

      displayName.trim() !==

        '' &&

      current?.displayName !==

        displayName.trim()

    ) {

      await firestoreFns.setDoc(

        userRef,

        {

          displayName:

            displayName.trim(),

          updatedAt:

            firestoreFns.serverTimestamp(),

        },

        {

          merge:

            true,

        },

      );

    }

    return;

  }

  await firestoreFns.setDoc(

    userRef,

    {

      displayName:

        typeof displayName ===

          'string'

          ? displayName.trim()

          : '',

      roomIds:

        [],

      createdAt:

        firestoreFns.serverTimestamp(),

      schemaVersion:

        SCHEMA_VERSION,

    },

  );

}

// ============================================================

// 招待コード生成

// ============================================================

function generateInviteCode() {

  let code =

    '';

  for (

    let i = 0;

    i <

      INVITE_CODE_LENGTH;

    i += 1

  ) {

    const index =

      Math.floor(

        Math.random() *

          INVITE_CODE_CHARSET.length,

      );

    code +=

      INVITE_CODE_CHARSET[

        index

      ];

  }

  return code;

}

// ============================================================

// 招待コード作成

// ============================================================

async function createInviteCodeDoc(

  db,

  firestoreFns,

  roomId,

  uid,

  purpose = 'initial',

  replacesUid = null,

) {

  for (

    let attempt = 0;

    attempt <

      INVITE_CODE_MAX_ATTEMPTS;

    attempt += 1

  ) {

    const code =

      generateInviteCode();

    const codeRef =

      firestoreFns.doc(

        db,

        'inviteCodes',

        code,

      );

    const existing =

      await firestoreFns.getDoc(

        codeRef,

      );

    if (

      existing.exists()

    ) {

      continue;

    }

    await firestoreFns.setDoc(

      codeRef,

      {

        roomId,

        createdBy:

          uid,

        createdAt:

          firestoreFns.serverTimestamp(),

        expiresAt:

          firestoreFns.Timestamp.fromMillis(

            Date.now() +

              INVITE_CODE_TTL_MS,

          ),

        used:

          false,

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

// ============================================================

// ルーム作成＋招待コード

// ============================================================

export async function createRoomAndInviteCode(

  uid,

  displayName,

) {

  if (

    !uid

  ) {

    throw new Error(

      'ユーザー情報がありません。',

    );

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      firestoreFns.collection(

        db,

        'rooms',

      ),

    );

  const roomId =

    roomRef.id;

  await firestoreFns.setDoc(

    roomRef,

    {

      status:

        'pending',

      schemaVersion:

        SCHEMA_VERSION,

      memberIds:

        [

          uid,

        ],

      formerMemberIds:

        [],

      memberProfiles: {

        [uid]: {

          displayName:

            typeof displayName ===

              'string'

              ? displayName

              : '',

          avatarUrl:

            null,

          accentColor:

            null,

          status:

            'active',

          joinedAt:

            firestoreFns.serverTimestamp(),

          leftAt:

            null,

          pushRegistrations:

            {},

          notificationContentEnabled:

            false,

        },

      },

      createdBy:

        uid,

      createdAt:

        firestoreFns.serverTimestamp(),

      lastMessageAt:

        null,

      lastMessagePreview:

        null,

      customization: {

        workspaceTitle:

          null,

        cards:

          {},

        backgrounds:

          {},

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

  const userRef =

    firestoreFns.doc(

      db,

      'users',

      uid,

    );

  await firestoreFns.setDoc(

    userRef,

    {

      roomIds:

        firestoreFns.arrayUnion(

          roomId,

        ),

      updatedAt:

        firestoreFns.serverTimestamp(),

    },

    {

      merge:

        true,

    },

  );

  return {

    roomId,

    code,

    expiresAt:

      new Date(

        Date.now() +

          INVITE_CODE_TTL_MS,

      ),

  };

}



// ============================================================
// 永続復旧コード
// ============================================================

export async function createRecoveryCode(
  roomId,
  uid,
) {

  if (
    !roomId ||
    !uid
  ) {
    throw new Error(
      '復旧コードを発行できません。',
    );
  }

  const {
    db,
    firestoreFns,
  } =
    await loadFirebase();

  const roomRef =
    firestoreFns.doc(
      db,
      'rooms',
      roomId,
    );

  const roomSnap =
    await firestoreFns.getDoc(
      roomRef,
    );

  if (
    !roomSnap.exists()
  ) {
    throw new Error(
      'ルームが見つかりません。',
    );
  }

  const roomData =
    roomSnap.data();

  const memberIds =
    Array.isArray(
      roomData.memberIds,
    )
      ? roomData.memberIds
      : [];

  if (
    !memberIds.includes(
      uid,
    )
  ) {
    throw new Error(
      'この端末はルームのメンバーではありません。',
    );
  }

  for (
    let attempt = 0;
    attempt < 10;
    attempt += 1
  ) {
    const rawCode =
      generateRecoveryCodeValue();

    const codeRef =
      firestoreFns.doc(
        db,
        'recoveryCodes',
        rawCode,
      );

    const existing =
      await firestoreFns.getDoc(
        codeRef,
      );

    if (
      existing.exists()
    ) {
      continue;
    }

    await firestoreFns.setDoc(
      codeRef,
      {
        roomId,
        ownerUid:
          uid,
        createdBy:
          uid,
        createdAt:
          firestoreFns.serverTimestamp(),
        schemaVersion:
          SCHEMA_VERSION,
      },
    );

    return formatRecoveryCode(
      rawCode,
    );
  }

  throw new Error(
    '復旧コードの発行に失敗しました。',
  );

}

export async function recoverRoomWithCode(
  code,
  newUid,
  displayName = '',
) {

  const normalizedCode =
    normalizeRecoveryCode(
      code,
    );

  if (
    normalizedCode.length !==
    RECOVERY_CODE_LENGTH
  ) {
    throw new Error(
      '復旧コードは12桁です。',
    );
  }

  if (
    !newUid
  ) {
    throw new Error(
      'ユーザー情報がありません。',
    );
  }

  const {
    db,
    firestoreFns,
  } =
    await loadFirebase();

  const codeRef =
    firestoreFns.doc(
      db,
      'recoveryCodes',
      normalizedCode,
    );

  const codeSnap =
    await firestoreFns.getDoc(
      codeRef,
    );

  if (
    !codeSnap.exists()
  ) {
    throw new Error(
      '復旧コードが見つかりません。',
    );
  }

  const codeData =
    codeSnap.data();

  const roomId =
    codeData.roomId;

  const ownerUid =
    codeData.ownerUid;

  if (
    !roomId ||
    !ownerUid
  ) {
    throw new Error(
      '復旧コードの情報が壊れています。',
    );
  }

  const roomRef =
    firestoreFns.doc(
      db,
      'rooms',
      roomId,
    );

  await firestoreFns.runTransaction(
    db,
    async (
      transaction,
    ) => {
      const roomSnap =
        await transaction.get(
          roomRef,
        );

      if (
        !roomSnap.exists()
      ) {
        throw new Error(
          '以前のルームが見つかりません。',
        );
      }

      const room =
        roomSnap.data();

      const memberIds =
        Array.isArray(
          room.memberIds,
        )
          ? room.memberIds
          : [];

      if (
        memberIds.includes(
          newUid,
        )
      ) {
        return;
      }

      if (
        !memberIds.includes(
          ownerUid,
        )
      ) {
        throw new Error(
          'この復旧コードは現在のルーム状態では使用できません。',
        );
      }

      const nextMemberIds =
        memberIds.map(
          (
            memberId,
          ) =>
            memberId ===
              ownerUid
              ? newUid
              : memberId,
        );

      const oldProfile =
        room.memberProfiles?.[
          ownerUid
        ] ??
        {};

      transaction.update(
        roomRef,
        {
          memberIds:
            nextMemberIds,
          formerMemberIds:
            firestoreFns.arrayUnion(
              ownerUid,
            ),
          [`memberProfiles.${newUid}`]:
            {
              ...oldProfile,
              displayName:
                typeof displayName ===
                  'string'
                  ? displayName
                  : '',
              status:
                'active',
              joinedAt:
                firestoreFns.serverTimestamp(),
              leftAt:
                null,
            },
          [`memberProfiles.${ownerUid}.status`]:
            'recovered',
          [`memberProfiles.${ownerUid}.leftAt`]:
            firestoreFns.serverTimestamp(),
        },
      );
    },
  );

  const userRef =
    firestoreFns.doc(
      db,
      'users',
      newUid,
    );

  await firestoreFns.setDoc(
    userRef,
    {
      roomIds:
        firestoreFns.arrayUnion(
          roomId,
        ),
      updatedAt:
        firestoreFns.serverTimestamp(),
    },
    {
      merge:
        true,
    },
  );

  rememberRecoveredSenderId(
    ownerUid,
  );

  saveLocalRoomId(
    roomId,
  );

  return {
    roomId,
    previousUid:
      ownerUid,
  };

}

// ============================================================
// 既存ルームへ再接続するための招待コード
// ============================================================

export async function createInviteForExistingRoom(
  roomId,
  uid,
) {
  if (
    !roomId ||
    !uid
  ) {
    throw new Error(
      '再接続情報がありません。',
    );
  }

  const {
    db,
    firestoreFns,
  } =
    await loadFirebase();

  const roomRef =
    firestoreFns.doc(
      db,
      'rooms',
      roomId,
    );

  const roomSnap =
    await firestoreFns.getDoc(
      roomRef,
    );

  if (
    !roomSnap.exists()
  ) {
    throw new Error(
      '以前のルームが見つかりませんでした。',
    );
  }

  const roomData =
    roomSnap.data();

  const memberIds =
    Array.isArray(
      roomData.memberIds,
    )
      ? roomData.memberIds
      : [];

  if (
    !memberIds.includes(
      uid,
    )
  ) {
    throw new Error(
      'この端末は以前のルームのメンバーとして確認できませんでした。',
    );
  }

  const code =
    await createInviteCodeDoc(
      db,
      firestoreFns,
      roomId,
      uid,
      'initial',
      null,
    );

  return {
    roomId,
    code,
    recovered:
      true,
    expiresAt:
      new Date(
        Date.now() +
        INVITE_CODE_TTL_MS,
      ),
  };
}

// ============================================================

// 招待コードで参加

// ============================================================

export async function joinRoomWithCode(

  code,

  uid,

  displayName,

) {

  if (

    typeof code !==

      'string' ||

    code.trim() ===

      ''

  ) {

    throw new Error(

      '招待コードを入力してください。',

    );

  }

  if (

    !uid

  ) {

    throw new Error(

      'ユーザー情報がありません。',

    );

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const normalizedCode =

    code

      .trim()

      .toUpperCase();

  const codeRef =

    firestoreFns.doc(

      db,

      'inviteCodes',

      normalizedCode,

    );

  const roomId =

    await firestoreFns.runTransaction(

      db,

      async (

        transaction,

      ) => {

        const codeSnap =

          await transaction.get(

            codeRef,

          );

        if (

          !codeSnap.exists()

        ) {

          throw new Error(

            '招待コードが見つかりません。入力内容をご確認ください。',

          );

        }

        const codeData =

          codeSnap.data();

        if (

          codeData.used

        ) {

          throw new Error(

            'この招待コードは既に使用されています。',

          );

        }

        if (

          !codeData.expiresAt ||

          typeof codeData.expiresAt.toMillis !==

            'function' ||

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

        if (

          !roomSnap.exists()

        ) {

          throw new Error(

            'ルームが見つかりませんでした。',

          );

        }

        const roomData =

          roomSnap.data();

        const currentMembers =

          Array.isArray(

            roomData.memberIds,

          )

            ? roomData.memberIds

            : [];

        /*

         * 既にメンバーの場合は

         * コードだけ使用済みにして終了。

         */

        if (

          currentMembers.includes(

            uid,

          )

        ) {

          transaction.update(

            codeRef,

            {

              used:

                true,

            },

          );

          return codeData.roomId;

        }

        /*

         * Phase1は2人用。

         */

        if (

          currentMembers.length >=

            2 &&

          codeData.purpose !==

            'replace'

        ) {

          throw new Error(

            'このルームには既に2人参加しています。',

          );

        }

        let finalMemberIds =

          [

            ...currentMembers,

            uid,

          ];

        let finalFormerMemberIds =

          Array.isArray(

            roomData.formerMemberIds,

          )

            ? [

                ...roomData.formerMemberIds,

              ]

            : [];

        const finalProfiles = {

          ...(

            roomData.memberProfiles ??

            {}

          ),

          [uid]: {

            displayName:

              typeof displayName ===

                'string'

                ? displayName

                : '',

            avatarUrl:

              null,

            accentColor:

              null,

            status:

              'active',

            joinedAt:

              firestoreFns.serverTimestamp(),

            leftAt:

              null,

            pushRegistrations:

              {},

            notificationContentEnabled:

              false,

          },

        };

        /*

         * 将来のreplace互換。

         */

        if (

          codeData.purpose ===

            'replace' &&

          codeData.replacesUid

        ) {

          finalMemberIds =

            finalMemberIds.filter(

              (

                memberId,

              ) =>

                memberId !==

                codeData.replacesUid,

            );

          if (

            !finalFormerMemberIds.includes(

              codeData.replacesUid,

            )

          ) {

            finalFormerMemberIds.push(

              codeData.replacesUid,

            );

          }

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

              status:

                'replaced',

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

            status:

              'active',

          },

        );

        transaction.update(

          codeRef,

          {

            used:

              true,

          },

        );

        return codeData.roomId;

      },

    );

  const userRef =

    firestoreFns.doc(

      db,

      'users',

      uid,

    );

  await firestoreFns.setDoc(

    userRef,

    {

      roomIds:

        firestoreFns.arrayUnion(

          roomId,

        ),

      updatedAt:

        firestoreFns.serverTimestamp(),

    },

    {

      merge:

        true,

    },

  );

  return roomId;

}

// ============================================================

// 旧Pairing API互換

// ============================================================

export async function createPairingRoom(

  uid,

  displayName,

) {

  return createRoomAndInviteCode(

    uid,

    displayName,

  );

}

export async function joinPairingRoom(

  code,

  uid,

  displayName,

) {

  return joinRoomWithCode(

    code,

    uid,

    displayName,

  );

}

// ============================================================

// ルーム取得

// ============================================================

export async function getRoom(

  roomId,

) {

  if (

    !roomId

  ) {

    return null;

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  const snapshot =

    await firestoreFns.getDoc(

      roomRef,

    );

  if (

    !snapshot.exists()

  ) {

    return null;

  }

  return {

    id:

      snapshot.id,

    ...snapshot.data(),

  };

}

// ============================================================

// ルーム購読

// ============================================================

export function subscribeToRoom(

  roomId,

  callback,

  onError,

) {

  let unsubscribeFn =

    () => {};

  let cancelled =

    false;

  loadFirebase()

    .then(

      ({

        db,

        firestoreFns,

      }) => {

        if (

          cancelled

        ) {

          return;

        }

        const roomRef =

          firestoreFns.doc(

            db,

            'rooms',

            roomId,

          );

        unsubscribeFn =

          firestoreFns.onSnapshot(

            roomRef,

            (

              snapshot,

            ) => {

              if (

                typeof callback !==

                  'function'

              ) {

                return;

              }

              if (

                snapshot.exists()

              ) {

                callback({

                  id:

                    snapshot.id,

                  ...snapshot.data(),

                });

              } else {

                callback(

                  null,

                );

              }

            },

            (

              error,

            ) => {

              console.error(

                '[firebase.js] ルーム購読でエラーが発生しました',

                error,

              );

              if (

                typeof onError ===

                  'function'

              ) {

                onError(

                  error,

                );

              }

            },

          );

      },

    )

    .catch(

      (

        error,

      ) => {

        console.error(

          '[firebase.js] ルーム購読の初期化に失敗しました',

          error,

        );

        if (

          typeof onError ===

            'function'

        ) {

          onError(

            error,

          );

        }

      },

    );

  return () => {

    cancelled =

      true;

    unsubscribeFn();

  };

}

// ============================================================

// 検索キーワード生成

// ============================================================

function buildSearchKeywords(

  text,

) {

  return text

    .toLowerCase()

    .split(

      /\s+/,

    )

    .filter(

      (

        word,

      ) =>

        word.length >

        0,

    )

    .slice(

      0,

      20,

    );

}

// ============================================================

// メッセージ送信

// ============================================================

export async function sendMessage(

  roomId,

  message,

) {

  if (

    !roomId

  ) {

    throw new Error(

      'ルーム情報がありません。',

    );

  }

  const text =

    typeof message?.text ===

      'string'

      ? message.text.trim()

      : '';

  const senderId =

    message?.senderId;

  if (

    !senderId

  ) {

    throw new Error(

      '送信者情報がありません。',

    );

  }

  if (

    text ===

    ''

  ) {

    return null;

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const clientId =

    getOrCreateClientId();

  const messagesRef =

    firestoreFns.collection(

      db,

      'rooms',

      roomId,

      'messages',

    );

  const messageData = {

    schemaVersion:

      SCHEMA_VERSION,

    senderId,

    clientId,

    type:

      'text',

    text,

    media:

      null,

    location:

      null,

    stickerId:

      null,

    timestamp:

      firestoreFns.serverTimestamp(),

    readBy:

      [

        senderId,

      ],

    reactions:

      {},

    replyToMessageId:

      message?.replyToMessageId ??

      null,

    editedAt:

      null,

    deletedForEveryone:

      false,

    deletedFor:

      [],

    searchKeywords:

      buildSearchKeywords(

        text,

      ),

  };

  const messageRef =

    await firestoreFns.addDoc(

      messagesRef,

      messageData,

    );

  const preview =

    text.length >

      40

      ? `${text.slice(

          0,

          40,

        )}…`

      : text;

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  await firestoreFns.updateDoc(

    roomRef,

    {

      lastMessageAt:

        firestoreFns.serverTimestamp(),

      lastMessagePreview:

        preview,

    },

  );

  return messageRef.id;

}

// ============================================================

// 旧メッセージAPI互換

// ============================================================

export async function sendTextMessage(

  roomId,

  uid,

  clientId,

  text,

) {

  void clientId;

  return sendMessage(

    roomId,

    {

      text,

      senderId:

        uid,

    },

  );

}

// ============================================================

// メッセージ購読

// ============================================================

export function subscribeToMessages(

  roomId,

  callback,

  onError,

) {

  let unsubscribeFn =

    () => {};

  let cancelled =

    false;

  loadFirebase()

    .then(

      ({

        db,

        firestoreFns,

      }) => {

        if (

          cancelled

        ) {

          return;

        }

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

            (

              snapshot,

            ) => {

              if (

                typeof callback !==

                  'function'

              ) {

                return;

              }

              const messages =

                snapshot.docs.map(

                  (

                    docSnapshot,

                  ) => ({

                    id:

                      docSnapshot.id,

                    ...docSnapshot.data(),

                  }),

                );

              callback(

                messages,

              );

            },

            (

              error,

            ) => {

              console.error(

                '[firebase.js] メッセージ購読でエラーが発生しました',

                error,

              );

              if (

                typeof onError ===

                  'function'

              ) {

                onError(

                  error,

                );

              }

            },

          );

      },

    )

    .catch(

      (

        error,

      ) => {

        console.error(

          '[firebase.js] メッセージ購読の初期化に失敗しました',

          error,

        );

        if (

          typeof onError ===

            'function'

        ) {

          onError(

            error,

          );

        }

      },

    );

  return () => {

    cancelled =

      true;

    unsubscribeFn();

  };

}

// ============================================================

// 既読

// ============================================================

export async function markMessageAsRead(

  roomId,

  messageId,

  uid,

  currentReadBy,

) {

  if (

    !roomId ||

    !messageId ||

    !uid

  ) {

    return;

  }

  if (

    Array.isArray(

      currentReadBy,

    ) &&

    currentReadBy.includes(

      uid,

    )

  ) {

    return;

  }

  const {

    db,

    firestoreFns,

  } =

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

// ============================================================

// リアクション

// ============================================================

export async function setMessageReaction(

  roomId,

  messageId,

  uid,

  emoji,

) {

  if (

    !roomId ||

    !messageId ||

    !uid

  ) {

    return;

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const messageRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'messages',

      messageId,

    );

  if (

    emoji ===

    null

  ) {

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

// ============================================================

// メッセージ削除

// ============================================================

export async function deleteMessage(

  roomId,

  messageId,

) {

  if (

    !roomId ||

    !messageId

  ) {

    return;

  }

  const {

    db,

    firestoreFns,

  } =

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

// ============================================================

// 自分のメッセージを一括削除

// ============================================================

export async function deleteAllOwnMessages(

  roomId,

  uid,

) {

  if (

    !roomId ||

    !uid

  ) {

    return 0;

  }

  const {

    db,

    firestoreFns,

  } =

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

      (

        docSnapshot,

      ) =>

        firestoreFns.deleteDoc(

          docSnapshot.ref,

        ),

    ),

  );

  return snapshot.size;

}

// ============================================================

// 入力中状態

// ============================================================

export async function setTypingState(

  roomId,

  uid,

  isTyping,

) {

  if (

    !roomId ||

    !uid

  ) {

    return;

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const typingRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'typing',

      uid,

    );

  await firestoreFns.setDoc(

    typingRef,

    {

      uid,

      isTyping:

        Boolean(

          isTyping,

        ),

      updatedAt:

        firestoreFns.serverTimestamp(),

    },

    {

      merge:

        true,

    },

  );

}

// ============================================================

// 入力中状態購読

// ============================================================

export function subscribeToTyping(

  roomId,

  callback,

  onError,

) {

  let unsubscribeFn =

    () => {};

  let cancelled =

    false;

  loadFirebase()

    .then(

      ({

        db,

        firestoreFns,

      }) => {

        if (

          cancelled

        ) {

          return;

        }

        const typingRef =

          firestoreFns.collection(

            db,

            'rooms',

            roomId,

            'typing',

          );

        unsubscribeFn =

          firestoreFns.onSnapshot(

            typingRef,

            (

              snapshot,

            ) => {

              const states =

                snapshot.docs.map(

                  (

                    docSnapshot,

                  ) => ({

                    id:

                      docSnapshot.id,

                    ...docSnapshot.data(),

                  }),

                );

              if (

                typeof callback ===

                  'function'

              ) {

                callback(

                  states,

                );

              }

            },

            (

              error,

            ) => {

              console.error(

                '[firebase.js] 入力中状態の購読に失敗しました',

                error,

              );

              if (

                typeof onError ===

                  'function'

              ) {

                onError(

                  error,

                );

              }

            },

          );

      },

    )

    .catch(

      (

        error,

      ) => {

        console.error(

          '[firebase.js] 入力中状態の初期化に失敗しました',

          error,

        );

        if (

          typeof onError ===

            'function'

        ) {

          onError(

            error,

          );

        }

      },

    );

  return () => {

    cancelled =

      true;

    unsubscribeFn();

  };

}

// ============================================================

// Presence更新

// ============================================================

export async function updatePresence(

  roomId,

  uid,

  isOnline = true,

) {

  if (

    !roomId ||

    !uid

  ) {

    return;

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const presenceRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'presence',

      uid,

    );

  await firestoreFns.setDoc(

    presenceRef,

    {

      uid,

      online:

        Boolean(

          isOnline,

        ),

      lastSeenAt:

        firestoreFns.serverTimestamp(),

      updatedAt:

        firestoreFns.serverTimestamp(),

    },

    {

      merge:

        true,

    },

  );

}

// ============================================================

// Presence購読

// ============================================================

export function subscribeToPresence(

  roomId,

  callback,

  onError,

) {

  let unsubscribeFn =

    () => {};

  let cancelled =

    false;

  loadFirebase()

    .then(

      ({

        db,

        firestoreFns,

      }) => {

        if (

          cancelled

        ) {

          return;

        }

        const presenceRef =

          firestoreFns.collection(

            db,

            'rooms',

            roomId,

            'presence',

          );

        unsubscribeFn =

          firestoreFns.onSnapshot(

            presenceRef,

            (

              snapshot,

            ) => {

              const members =

                snapshot.docs.map(

                  (

                    docSnapshot,

                  ) => ({

                    id:

                      docSnapshot.id,

                    ...docSnapshot.data(),

                  }),

                );

              if (

                typeof callback ===

                  'function'

              ) {

                callback(

                  members,

                );

              }

            },

            (

              error,

            ) => {

              console.error(

                '[firebase.js] Presence購読に失敗しました',

                error,

              );

              if (

                typeof onError ===

                  'function'

              ) {

                onError(

                  error,

                );

              }

            },

          );

      },

    )

    .catch(

      (

        error,

      ) => {

        console.error(

          '[firebase.js] Presence初期化に失敗しました',

          error,

        );

        if (

          typeof onError ===

            'function'

        ) {

          onError(

            error,

          );

        }

      },

    );

  return () => {

    cancelled =

      true;

    unsubscribeFn();

  };

}

// ============================================================

// Roomカスタマイズ更新

// ============================================================

export async function updateRoomCustomization(

  roomId,

  partialCustomization,

) {

  if (

    !roomId

  ) {

    return;

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  const payload =

    {};

  if (

    partialCustomization &&

    Object.prototype.hasOwnProperty.call(

      partialCustomization,

      'workspaceTitle',

    )

  ) {

    payload[

      'customization.workspaceTitle'

    ] =

      partialCustomization

        .workspaceTitle;

  }

  if (

    partialCustomization &&

    Object.prototype.hasOwnProperty.call(

      partialCustomization,

      'cards',

    )

  ) {

    payload[

      'customization.cards'

    ] =

      partialCustomization

        .cards ??

      {};

  }

  if (

    partialCustomization &&

    Object.prototype.hasOwnProperty.call(

      partialCustomization,

      'backgrounds',

    )

  ) {

    payload[

      'customization.backgrounds'

    ] =

      partialCustomization

        .backgrounds ??

      {};

  }

  if (

    Object.keys(

      payload,

    ).length ===

    0

  ) {

    return;

  }

  await firestoreFns.updateDoc(

    roomRef,

    payload,

  );

}

// ============================================================

// 旧カスタマイズ保存API

// ============================================================

export async function saveCustomization(

  roomId,

  uid,

  customization,

) {

  void uid;

  await updateRoomCustomization(

    roomId,

    customization,

  );

}

// ============================================================

// カスタマイズ取得

// ============================================================

export async function loadCustomization(

  roomId,

  uid,

) {

  void uid;

  const room =

    await getRoom(

      roomId,

    );

  if (

    !room

  ) {

    return null;

  }

  return room.customization ??

    null;

}

// ============================================================

// カスタマイズ購読

// ============================================================

export function subscribeToCustomization(

  roomId,

  uid,

  callback,

  onError,

) {

  void uid;

  return subscribeToRoom(

    roomId,

    (

      roomData,

    ) => {

      if (

        typeof callback ===

          'function'

      ) {

        callback(

          roomData?.customization ??

            null,

        );

      }

    },

    onError,

  );

}

// ============================================================

// Push登録情報保存

// ============================================================

export async function savePushRegistration(

  roomId,

  uid,

  clientId,

  registrationId,

  registrationMethod = 'token',

) {

  if (

    !roomId ||

    !uid ||

    !clientId ||

    !registrationId

  ) {

    throw new Error(

      '通知登録に必要な情報がありません。',

    );

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  const roomSnap =

    await firestoreFns.getDoc(

      roomRef,

    );

  if (

    !roomSnap.exists()

  ) {

    throw new Error(

      '通知登録先のルームが見つかりません。',

    );

  }

  const roomData =

    roomSnap.data();

  const memberProfiles =

    roomData.memberProfiles ??

    {};

  const currentProfile =

    memberProfiles[

      uid

    ] ??

    {};

  const currentRegistrations =

    currentProfile

      .pushRegistrations ??

    {};

  const nextRegistrations = {

    ...currentRegistrations,

    [clientId]: {

      id:

        registrationId,

      method:

        registrationMethod,

      enabled:

        true,

      updatedAt:

        firestoreFns.serverTimestamp(),

    },

  };

  await firestoreFns.updateDoc(

    roomRef,

    {

      [`memberProfiles.${uid}.pushRegistrations`]:

        nextRegistrations,

    },

  );

}

// ============================================================

// Push登録無効化

// ============================================================

export async function disablePushRegistration(

  roomId,

  uid,

  clientId,

) {

  if (

    !roomId ||

    !uid ||

    !clientId

  ) {

    return;

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const roomRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

    );

  const roomSnap =

    await firestoreFns.getDoc(

      roomRef,

    );

  if (

    !roomSnap.exists()

  ) {

    return;

  }

  const roomData =

    roomSnap.data();

  const profile =

    roomData

      .memberProfiles?.[

        uid

      ];

  const registrations =

    profile

      ?.pushRegistrations ??

    {};

  const currentRegistration =

    registrations[

      clientId

    ];

  if (

    !currentRegistration

  ) {

    return;

  }

  const nextRegistrations = {

    ...registrations,

    [clientId]: {

      ...currentRegistration,

      enabled:

        false,

      updatedAt:

        firestoreFns.serverTimestamp(),

    },

  };

  await firestoreFns.updateDoc(

    roomRef,

    {

      [`memberProfiles.${uid}.pushRegistrations`]:

        nextRegistrations,

    },

  );

}

// ============================================================

// 通知内容表示設定

// ============================================================

export async function saveNotificationContentPreference(

  roomId,

  uid,

  enabled,

) {

  if (

    !roomId ||

    !uid

  ) {

    return;

  }

  const {

    db,

    firestoreFns,

  } =

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

        Boolean(

          enabled,

        ),

    },

  );

}

// ============================================================

// 旧通知設定保存API

// ============================================================

export async function saveNotificationSettings(

  roomId,

  uid,

  settings,

) {

  if (

    !roomId ||

    !uid

  ) {

    throw new Error(

      '通知設定の保存に必要な情報がありません。',

    );

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const settingsRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'notificationSettings',

      uid,

    );

  await firestoreFns.setDoc(

    settingsRef,

    {

      ...(

        settings ??

        {}

      ),

      uid,

      updatedAt:

        firestoreFns.serverTimestamp(),

    },

    {

      merge:

        true,

    },

  );

}

// ============================================================

// 旧通知設定取得API

// ============================================================

export async function loadNotificationSettings(

  roomId,

  uid,

) {

  if (

    !roomId ||

    !uid

  ) {

    return null;

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const settingsRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'notificationSettings',

      uid,

    );

  const snapshot =

    await firestoreFns.getDoc(

      settingsRef,

    );

  if (

    !snapshot.exists()

  ) {

    return null;

  }

  return {

    id:

      snapshot.id,

    ...snapshot.data(),

  };

}

// ============================================================

// 写真API互換

// ============================================================

//

// 写真は現在Supabaseで管理するため、

// Firebase Storageの写真APIは実処理をしない。

//

// 古いコードから呼ばれても

// 起動エラーにならないための互換関数だけ残す。

// ============================================================

export async function uploadRoomPhoto() {

  throw new Error(

    '写真共有はSupabaseへ移行しました。',

  );

}

export function subscribeToPhotos(

  roomId,

  callback,

) {

  void roomId;

  if (

    typeof callback ===

      'function'

  ) {

    callback(

      [],

    );

  }

  return () => {};

}

export async function deleteRoomPhoto() {

  throw new Error(

    '写真共有はSupabaseへ移行しました。',

  );

}

// ============================================================

// 旧認証API互換

// ============================================================

export async function ensureAnonymousUser() {

  const uid =

    await ensureSignedIn();

  return {

    uid,

  };

}

export function getCurrentUser() {

  if (

    !firebaseState

  ) {

    return null;

  }

  return firebaseState

    .auth

    .currentUser ??

    null;

}

// ============================================================

// Firebase公開API

// ============================================================

const Firebase = {

  // ----------------------------------------------------------

  // Firebase

  // ----------------------------------------------------------

  initFirebase,

  isFirebaseAvailable,

  isMessagingSupported,

  // ----------------------------------------------------------

  // Authentication

  // ----------------------------------------------------------

  ensureSignedIn,

  ensureAnonymousUser,

  getCurrentUid,

  getCurrentUser,

  getFirebaseIdToken,

  // ----------------------------------------------------------

  // Local

  // ----------------------------------------------------------

  getOrCreateClientId,

  getLocalDisplayName,

  saveLocalDisplayName,

  getLocalRoomId,

  getRecoveryRoomId,

  getRecoveredSenderIds,

  isOwnSenderId,

  resolvePersistentRoomId,

  saveLocalRoomId,

  clearRecoveryRoomId,

  // ----------------------------------------------------------

  // User

  // ----------------------------------------------------------

  ensureUserProfile,

  // ----------------------------------------------------------

  // Pairing / Room

  // ----------------------------------------------------------

  createRoomAndInviteCode,

  createRecoveryCode,

  recoverRoomWithCode,

  createInviteForExistingRoom,

  joinRoomWithCode,

  createPairingRoom,

  joinPairingRoom,

  getRoom,

  subscribeToRoom,

  // ----------------------------------------------------------

  // Messages

  // ----------------------------------------------------------

  sendMessage,

  sendTextMessage,

  subscribeToMessages,

  markMessageAsRead,

  setMessageReaction,

  deleteMessage,

  deleteAllOwnMessages,

  // ----------------------------------------------------------

  // Typing

  // ----------------------------------------------------------

  setTypingState,

  subscribeToTyping,

  // ----------------------------------------------------------

  // Presence

  // ----------------------------------------------------------

  updatePresence,

  subscribeToPresence,

  // ----------------------------------------------------------

  // Customization

  // ----------------------------------------------------------

  updateRoomCustomization,

  saveCustomization,

  loadCustomization,

  subscribeToCustomization,

  // ----------------------------------------------------------

  // Notifications

  // ----------------------------------------------------------

  registerForPush,

  onForegroundMessage,

  subscribeToForegroundMessages,

  savePushRegistration,

  disablePushRegistration,

  saveNotificationContentPreference,

  saveNotificationSettings,

  loadNotificationSettings,

  // ----------------------------------------------------------

  // Photos

  // ----------------------------------------------------------

  uploadRoomPhoto,

  subscribeToPhotos,

  deleteRoomPhoto,

};

export default Firebase;