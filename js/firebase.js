export async function registerForPush(

  swRegistration,

) {

  const {

    fns,

    messaging,

    supportsFid,

  } =

    await loadMessaging();

  if (supportsFid) {

    const id =

      await new Promise(

        (

          resolve,

          reject,

        ) => {

          let unsubscribe =

            () => {};

          unsubscribe =

            fns.onRegistered(

              messaging,

              (

                installationId,

              ) => {

                unsubscribe();

                resolve(

                  installationId,

                );

              },

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

              (error) => {

                unsubscribe();

                reject(

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

  if (!token) {

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

  const {

    fns,

    messaging,

  } =

    await loadMessaging();

  if (

    typeof callback !==

    'function'

  ) {

    return () => {};

  }

  return fns.onMessage(

    messaging,

    callback,

  );

}

// ------------------------------------------------------------

// 認証

// ------------------------------------------------------------

let signInPromise =

  null;

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

        (credential) =>

          credential.user.uid,

      )

      .catch(

        (error) => {

          signInPromise =

            null;

          throw error;

        },

      );

  return signInPromise;

}

export function getCurrentUid() {

  if (!firebaseState) {

    return null;

  }

  return firebaseState.auth.currentUser

    ? firebaseState.auth.currentUser.uid

    : null;

}

// ------------------------------------------------------------

// clientId / 表示名 / roomId

// ------------------------------------------------------------

export function getOrCreateClientId() {

  const existing =

    Storage.get(

      STORAGE_KEYS.CLIENT_ID,

      null,

    );

  if (existing) {

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

    displayName,

  );

}

export function getLocalRoomId() {

  return Storage.get(

    STORAGE_KEYS.CURRENT_ROOM_ID,

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

}

// ------------------------------------------------------------

// /users/{uid}

// ------------------------------------------------------------

export async function ensureUserProfile(

  uid,

  displayName,

) {

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

    return;

  }

  await firestoreFns.setDoc(

    userRef,

    {

      displayName,

      roomIds:

        [],

      createdAt:

        firestoreFns.serverTimestamp(),

      schemaVersion:

        SCHEMA_VERSION,

    },

  );

}

// ------------------------------------------------------------

// 招待コード生成

// ------------------------------------------------------------

function generateInviteCode() {

  let code =

    '';

  for (

    let i = 0;

    i < INVITE_CODE_LENGTH;

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

// ------------------------------------------------------------

// 招待コード作成

// ------------------------------------------------------------

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

// ------------------------------------------------------------

// ルーム作成＋招待コード発行

// ------------------------------------------------------------

export async function createRoomAndInviteCode(

  uid,

  displayName,

) {

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

      memberProfiles:

        {

          [uid]:

            {

              displayName,

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

      customization:

        {

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

// ------------------------------------------------------------

// 招待コードでルーム参加

// ------------------------------------------------------------

export async function joinRoomWithCode(

  code,

  uid,

  displayName,

) {

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

        if (

          roomData.memberIds.includes(

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

        let finalMemberIds =

          [

            ...roomData.memberIds,

            uid,

          ];

        let finalFormerMemberIds =

          roomData.formerMemberIds ??

          [];

        const finalProfiles =

          {

            ...roomData.memberProfiles,

            [uid]:

              {

                displayName,

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

              },

          };

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

          finalFormerMemberIds =

            [

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

            ] =

              {

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

// ------------------------------------------------------------

// ルーム購読

// ------------------------------------------------------------

export function subscribeToRoom(

  roomId,

  callback,

  onError,

) {

  let unsubscribeFn =

    () => {};

  let cancelled =

    false;

  loadFirebase().then(

    ({

      db,

      firestoreFns,

    }) => {

      if (cancelled) {

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

              snapshot.exists()

            ) {

              callback(

                snapshot.data(),

              );

            }

          },

          (

            error,

          ) => {

            console.error(

              '[firebase.js] ルームの購読でエラーが発生しました',

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

  );

  return () => {

    cancelled =

      true;

    unsubscribeFn();

  };

}