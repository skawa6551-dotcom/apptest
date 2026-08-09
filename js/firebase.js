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

// ============================================================

// メッセージ

// ============================================================

function buildSearchKeywords(

  text,

) {

  return text

    .toLowerCase()

    .split(/\s+/)

    .filter(

      (word) =>

        word.length > 0,

    )

    .slice(

      0,

      20,

    );

}

export async function sendTextMessage(

  roomId,

  uid,

  clientId,

  text,

) {

  const trimmed =

    typeof text ===

      'string'

      ? text.trim()

      : '';

  if (

    trimmed === ''

  ) {

    return null;

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

  const messageRef =

    await firestoreFns.addDoc(

      messagesRef,

      {

        schemaVersion:

          SCHEMA_VERSION,

        senderId:

          uid,

        clientId,

        type:

          'text',

        text:

          trimmed,

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

            uid,

          ],

        reactions:

          {},

        replyToMessageId:

          null,

        editedAt:

          null,

        deletedForEveryone:

          false,

        deletedFor:

          [],

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

  loadFirebase().then(

    ({

      db,

      firestoreFns,

    }) => {

      if (cancelled) {

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

              '[firebase.js] メッセージの購読でエラーが発生しました',

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

    emoji === null

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

// 自分のメッセージをすべて削除

// ============================================================

export async function deleteAllOwnMessages(

  roomId,

  uid,

) {

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

// 写真共有

// ============================================================

function sanitizePhotoFileName(

  fileName,

) {

  const raw =

    typeof fileName ===

      'string' &&

    fileName.trim()

      ? fileName.trim()

      : 'photo.jpg';

  return raw.replace(

    /[^a-zA-Z0-9._-]/g,

    '_',

  );

}

// ============================================================

// 写真アップロード

// ============================================================

export async function uploadRoomPhoto(

  roomId,

  uid,

  file,

) {

  if (

    !roomId ||

    !uid

  ) {

    throw new Error(

      '写真共有に必要なルーム情報がありません。',

    );

  }

  if (!file) {

    throw new Error(

      '写真データがありません。',

    );

  }

  const size =

    Number(

      file.size,

    ) || 0;

  if (

    size >

    MAX_PHOTO_SIZE_BYTES

  ) {

    throw new Error(

      '写真サイズが大きすぎます。15MB以下の写真を選んでください。',

    );

  }

  const {

    db,

    storage,

    firestoreFns,

    storageFns,

  } =

    await loadFirebase();

  /*

   * Firestore側の写真IDを先に作る。

   * Storage側でも同じIDを使う。

   */

  const photosRef =

    firestoreFns.collection(

      db,

      'rooms',

      roomId,

      'photos',

    );

  const photoRef =

    firestoreFns.doc(

      photosRef,

    );

  const photoId =

    photoRef.id;

  const originalName =

    sanitizePhotoFileName(

      file.name ||

      `photo-${photoId}.jpg`,

    );

  const storagePath =

    `rooms/${roomId}/photos/${photoId}/${originalName}`;

  const storageRef =

    storageFns.ref(

      storage,

      storagePath,

    );

  let uploaded =

    false;

  try {

    const metadata = {

      contentType:

        file.type ||

        'image/jpeg',

      customMetadata: {

        roomId,

        photoId,

        uploaderId:

          uid,

      },

    };

    const uploadResult =

      await storageFns.uploadBytes(

        storageRef,

        file,

        metadata,

      );

    uploaded =

      true;

    const downloadUrl =

      await storageFns.getDownloadURL(

        uploadResult.ref,

      );

    await firestoreFns.setDoc(

      photoRef,

      {

        schemaVersion:

          SCHEMA_VERSION,

        uploaderId:

          uid,

        fileName:

          originalName,

        contentType:

          file.type ||

          'image/jpeg',

        size,

        storagePath,

        downloadUrl,

        createdAt:

          firestoreFns.serverTimestamp(),

      },

    );

    return {

      id:

        photoId,

      roomId,

      uploaderId:

        uid,

      fileName:

        originalName,

      contentType:

        file.type ||

        'image/jpeg',

      size,

      storagePath,

      downloadUrl,

    };

  } catch (error) {

    /*

     * Storageへのアップロードだけ成功して

     * Firestore保存に失敗した場合、

     * 孤立ファイルを残さない。

     */

    if (uploaded) {

      try {

        await storageFns.deleteObject(

          storageRef,

        );

      } catch (

        cleanupError

      ) {

        console.warn(

          '[firebase.js] 写真アップロード失敗後のStorage削除に失敗しました',

          cleanupError,

        );

      }

    }

    console.error(

      '[firebase.js] 写真アップロードに失敗しました',

      error,

    );

    throw error;

  }

}

// ============================================================

// 共有写真一覧をリアルタイム購読

// ============================================================

export function subscribeToPhotos(

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

        if (cancelled) {

          return;

        }

        const photosRef =

          firestoreFns.collection(

            db,

            'rooms',

            roomId,

            'photos',

          );

        const photosQuery =

          firestoreFns.query(

            photosRef,

            firestoreFns.orderBy(

              'createdAt',

              'desc',

            ),

            firestoreFns.limit(

              PHOTO_LIST_LIMIT,

            ),

          );

        unsubscribeFn =

          firestoreFns.onSnapshot(

            photosQuery,

            (

              snapshot,

            ) => {

              const photos =

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

                  photos,

                );

              }

            },

            (

              error,

            ) => {

              console.error(

                '[firebase.js] 写真一覧の購読に失敗しました',

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

          '[firebase.js] 写真購読の初期化に失敗しました',

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

// 共有写真を1枚削除

// ============================================================

export async function deleteRoomPhoto(

  roomId,

  photoId,

) {

  if (

    !roomId ||

    !photoId

  ) {

    return;

  }

  const {

    db,

    storage,

    firestoreFns,

    storageFns,

  } =

    await loadFirebase();

  const photoRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'photos',

      photoId,

    );

  const snapshot =

    await firestoreFns.getDoc(

      photoRef,

    );

  if (

    !snapshot.exists()

  ) {

    return;

  }

  const data =

    snapshot.data();

  /*

   * 先にStorage本体を削除。

   * 既に消えている場合でも

   * Firestoreレコード削除へ進める。

   */

  if (

    data.storagePath

  ) {

    try {

      const storageRef =

        storageFns.ref(

          storage,

          data.storagePath,

        );

      await storageFns.deleteObject(

        storageRef,

      );

    } catch (error) {

      /*

       * object-not-found は

       * 既にStorage側から消えているだけなので許容。

       */

      if (

        error?.code !==

        'storage/object-not-found'

      ) {

        throw error;

      }

    }

  }

  await firestoreFns.deleteDoc(

    photoRef,

  );

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

// 入力中状態を購読

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

        if (cancelled) {

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

// オンライン状態更新

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

// オンライン状態購読

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

        if (cancelled) {

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

// カスタマイズ保存

// ============================================================

export async function saveCustomization(

  roomId,

  uid,

  customization,

) {

  if (

    !roomId ||

    !uid

  ) {

    throw new Error(

      'カスタマイズ保存に必要な情報がありません。',

    );

  }

  const {

    db,

    firestoreFns,

  } =

    await loadFirebase();

  const customizationRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'customization',

      uid,

    );

  await firestoreFns.setDoc(

    customizationRef,

    {

      ...(customization ?? {}),

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

// カスタマイズ取得

// ============================================================

export async function loadCustomization(

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

  const customizationRef =

    firestoreFns.doc(

      db,

      'rooms',

      roomId,

      'customization',

      uid,

    );

  const snapshot =

    await firestoreFns.getDoc(

      customizationRef,

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

// カスタマイズ購読

// ============================================================

export function subscribeToCustomization(

  roomId,

  uid,

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

        if (cancelled) {

          return;

        }

        const customizationRef =

          firestoreFns.doc(

            db,

            'rooms',

            roomId,

            'customization',

            uid,

          );

        unsubscribeFn =

          firestoreFns.onSnapshot(

            customizationRef,

            (

              snapshot,

            ) => {

              const data =

                snapshot.exists()

                  ? {

                      id:

                        snapshot.id,

                      ...snapshot.data(),

                    }

                  : null;

              if (

                typeof callback ===

                  'function'

              ) {

                callback(

                  data,

                );

              }

            },

            (

              error,

            ) => {

              console.error(

                '[firebase.js] カスタマイズ購読に失敗しました',

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

          '[firebase.js] カスタマイズ購読の初期化に失敗しました',

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

// 通知設定保存

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

      ...(settings ?? {}),

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

// 通知設定取得

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

// Firebase利用可能確認

// ============================================================

export async function isFirebaseAvailable() {

  try {

    await loadFirebase();

    return true;

  } catch (error) {

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

// 公開API

// ============================================================

// ============================================================

// 公開API

// ============================================================

const Firebase = {

  // ----------------------------------------

  // Firebase

  // ----------------------------------------

  initFirebase,

  isFirebaseAvailable,

  // ----------------------------------------

  // 認証

  // ----------------------------------------

  ensureSignedIn,

  getCurrentUid,

  // ----------------------------------------

  // ローカル情報

  // ----------------------------------------

  getOrCreateClientId,

  getLocalDisplayName,

  saveLocalDisplayName,

  getLocalRoomId,

  saveLocalRoomId,

  // ----------------------------------------

  // User

  // ----------------------------------------

  ensureUserProfile,

  // ----------------------------------------

  // Pairing / Room

  // ----------------------------------------

  createRoomAndInviteCode,

  joinRoomWithCode,

  subscribeToRoom,

  // ----------------------------------------

  // Messages

  // ----------------------------------------

  sendTextMessage,

  subscribeToMessages,

  markMessageAsRead,

  setMessageReaction,

  deleteMessage,

  deleteAllOwnMessages,

  // ----------------------------------------

  // Photos

  // ----------------------------------------

  uploadRoomPhoto,

  subscribeToPhotos,

  deleteRoomPhoto,

  // ----------------------------------------

  // Typing

  // ----------------------------------------

  setTypingState,

  subscribeToTyping,

  // ----------------------------------------

  // Presence

  // ----------------------------------------

  updatePresence,

  subscribeToPresence,

  // ----------------------------------------

  // Customization

  // ----------------------------------------

  saveCustomization,

  loadCustomization,

  subscribeToCustomization,

  // ----------------------------------------

  // Notifications

  // ----------------------------------------

  saveNotificationSettings,

  loadNotificationSettings,

  // ----------------------------------------

  // Push

  // ----------------------------------------

  registerForPush,

  onForegroundMessage,

};

export default Firebase;