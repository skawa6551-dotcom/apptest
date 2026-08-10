// ============================================================

// supabase.js

// Calculator 0209

//

// Supabase接続・診断対応版

//

// ・Supabase Client初期化

// ・匿名認証

// ・セッション維持

// ・Firebase側のroomIdをSupabaseへ登録

// ・photo_room_membersへ自動登録

// ・photosバケットへのアップロード

// ・写真一覧取得

// ・Signed URL生成

// ・写真削除

// ・Supabase接続状態の診断

//

// ※ Secret key / service_role は絶対に使用しない

// ============================================================

import Storage, {

  STORAGE_KEYS,

} from './storage.js';

// ============================================================

// Supabase設定

// ============================================================

const SUPABASE_URL =

  'https://njqbnvzkpazxbwpcajlu.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =

  'sb_publishable_uAfVZH35jFQNK2emEpR8ag_jb0kaQvJ';

const SUPABASE_BUCKET =

  'photos';

const ROOM_MEMBERS_TABLE =

  'photo_room_members';

// ============================================================

// Supabase JS SDK

// ============================================================

const SUPABASE_SDK_URL =

  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm';

// ============================================================

// 定数

// ============================================================

const SIGNED_URL_EXPIRES_SECONDS =

  60 * 60;

const PHOTO_LIST_LIMIT =

  100;

const MAX_PHOTO_SIZE_BYTES =

  15 * 1024 * 1024;

// ============================================================

// 診断イベント

// ============================================================

const DIAGNOSTIC_EVENT_NAME =

  'calculator-supabase-diagnostic';

// ============================================================

// 状態

// ============================================================

let sdkPromise =

  null;

let clientPromise =

  null;

let signInPromise =

  null;

let roomRegistrationPromise =

  null;

let registeredRoomId =

  null;

// ============================================================

// 診断状態

// ============================================================

let diagnosticState = {

  stage:

    'idle',

  message:

    'Supabaseはまだ初期化されていません',

  error:

    null,

  userId:

    null,

  roomId:

    null,

  updatedAt:

    Date.now(),

};

// ============================================================

// エラー文字列化

// ============================================================

function getErrorMessage(

  error,

) {

  if (

    !error

  ) {

    return '';

  }

  if (

    typeof error ===

    'string'

  ) {

    return error;

  }

  if (

    typeof error.message ===

      'string' &&

    error.message.trim() !==

      ''

  ) {

    return error.message.trim();

  }

  try {

    return JSON.stringify(

      error,

    );

  } catch {

    return String(

      error,

    );

  }

}

// ============================================================

// 診断状態更新

// ============================================================

function updateDiagnostic(

  stage,

  message,

  error = null,

  extra = {},

) {

  diagnosticState = {

    ...diagnosticState,

    ...extra,

    stage,

    message,

    error:

      error

        ? getErrorMessage(

            error,

          )

        : null,

    updatedAt:

      Date.now(),

  };

  console.info(

    '[supabase.js]',

    stage,

    message,

    error ?? '',

  );

  /*

   * photo.jsなどがリアルタイムで

   * 状態を受け取れるように通知する。

   */

  try {

    window.dispatchEvent(

      new CustomEvent(

        DIAGNOSTIC_EVENT_NAME,

        {

          detail:

            getDiagnosticState(),

        },

      ),

    );

  } catch (

    eventError

  ) {

    console.warn(

      '[supabase.js] 診断イベント送信に失敗しました',

      eventError,

    );

  }

}

// ============================================================

// 診断状態取得

// ============================================================

export function getDiagnosticState() {

  return {

    ...diagnosticState,

  };

}

// ============================================================

// 診断イベント名取得

// ============================================================

export function getDiagnosticEventName() {

  return DIAGNOSTIC_EVENT_NAME;

}

// ============================================================

// SDK読み込み

// ============================================================

async function loadSdk() {

  if (

    sdkPromise

  ) {

    return sdkPromise;

  }

  updateDiagnostic(

    'sdk-loading',

    'Supabase SDKを読み込んでいます',

  );

  sdkPromise =

    import(

      SUPABASE_SDK_URL

    )

      .then(

        (

          sdk,

        ) => {

          if (

            typeof sdk?.createClient !==

            'function'

          ) {

            throw new Error(

              'Supabase SDKにcreateClientがありません。',

            );

          }

          updateDiagnostic(

            'sdk-ready',

            'Supabase SDKの読み込みに成功しました',

          );

          return sdk;

        },

      )

      .catch(

        (

          error,

        ) => {

          sdkPromise =

            null;

          updateDiagnostic(

            'sdk-error',

            'Supabase SDKを読み込めませんでした',

            error,

          );

          console.error(

            '[supabase.js] Supabase SDKの読み込みに失敗しました',

            error,

          );

          throw error;

        },

      );

  return sdkPromise;

}

// ============================================================

// Client生成

// ============================================================

async function getClient() {

  if (

    clientPromise

  ) {

    return clientPromise;

  }

  updateDiagnostic(

    'client-loading',

    'Supabase Clientを準備しています',

  );

  clientPromise =

    loadSdk()

      .then(

        ({

          createClient,

        }) => {

          const client =

            createClient(

              SUPABASE_URL,

              SUPABASE_PUBLISHABLE_KEY,

              {

                auth: {

                  autoRefreshToken:

                    true,

                  persistSession:

                    true,

                  detectSessionInUrl:

                    false,

                },

              },

            );

          if (

            !client

          ) {

            throw new Error(

              'Supabase Clientの生成に失敗しました。',

            );

          }

          updateDiagnostic(

            'client-ready',

            'Supabase Clientを準備しました',

          );

          return client;

        },

      )

      .catch(

        (

          error,

        ) => {

          clientPromise =

            null;

          updateDiagnostic(

            'client-error',

            'Supabase Clientを準備できませんでした',

            error,

          );

          throw error;

        },

      );

  return clientPromise;

}

// ============================================================

// 現在のroomId

// ============================================================

export function getRoomId() {

  const roomId =

    Storage.get(

      STORAGE_KEYS.CURRENT_ROOM_ID,

      null,

    );

  if (

    typeof roomId !==

      'string' ||

    roomId.trim() ===

      ''

  ) {

    return null;

  }

  return roomId.trim();

}

// ============================================================

// 匿名認証

// ============================================================

export async function ensureSignedIn() {

  updateDiagnostic(

    'auth-start',

    'Supabase認証を確認しています',

  );

  let client;

  try {

    client =

      await getClient();

  } catch (

    error

  ) {

    updateDiagnostic(

      'auth-client-error',

      'Supabase認証用Clientを取得できませんでした',

      error,

    );

    throw error;

  }

  // ----------------------------------------------------------

  // 既存セッション確認

  // ----------------------------------------------------------

  let sessionData =

    null;

  let sessionError =

    null;

  try {

    const response =

      await client.auth

        .getSession();

    sessionData =

      response?.data ??

      null;

    sessionError =

      response?.error ??

      null;

  } catch (

    error

  ) {

    sessionError =

      error;

  }

  if (

    sessionError

  ) {

    console.warn(

      '[supabase.js] 既存セッション確認に失敗しました',

      sessionError,

    );

    updateDiagnostic(

      'session-warning',

      '既存のSupabaseセッションを確認できませんでした',

      sessionError,

    );

  }

  if (

    sessionData?.session?.user

  ) {

    const user =

      sessionData.session.user;

    updateDiagnostic(

      'authenticated',

      'Supabase認証済みです',

      null,

      {

        userId:

          user.id ??

          null,

        roomId:

          getRoomId(),

      },

    );

    return user;

  }

  // ----------------------------------------------------------

  // 同時サインイン防止

  // ----------------------------------------------------------

  if (

    signInPromise

  ) {

    return signInPromise;

  }

  // ----------------------------------------------------------

  // 匿名ログイン

  // ----------------------------------------------------------

  updateDiagnostic(

    'anonymous-sign-in',

    'Supabase匿名ログインを開始しています',

  );

  signInPromise =

    (async () => {

      let result;

      try {

        result =

          await client.auth

            .signInAnonymously();

      } catch (

        error

      ) {

        updateDiagnostic(

          'anonymous-sign-in-error',

          'Supabase匿名ログイン通信に失敗しました',

          error,

        );

        throw error;

      }

      const data =

        result?.data ??

        null;

      const error =

        result?.error ??

        null;

      if (

        error

      ) {

        updateDiagnostic(

          'anonymous-sign-in-error',

          'Supabase匿名ログインに失敗しました',

          error,

        );

        console.error(

          '[supabase.js] 匿名ログインに失敗しました',

          error,

        );

        throw error;

      }

      if (

        !data?.user

      ) {

        const missingUserError =

          new Error(

            'Supabaseから匿名ユーザー情報が返されませんでした。',

          );

        updateDiagnostic(

          'anonymous-user-missing',

          '匿名ユーザー情報を取得できませんでした',

          missingUserError,

        );

        throw missingUserError;

      }

      updateDiagnostic(

        'authenticated',

        'Supabase匿名ログインに成功しました',

        null,

        {

          userId:

            data.user.id,

          roomId:

            getRoomId(),

        },

      );

      return data.user;

    })()

      .finally(

        () => {

          signInPromise =

            null;

        },

      );

  return signInPromise;

}

// ============================================================

// 現在ユーザー

// ============================================================

export async function getCurrentUser() {

  try {

    const client =

      await getClient();

    const {

      data,

      error,

    } =

      await client.auth

        .getUser();

    if (

      error

    ) {

      updateDiagnostic(

        'get-user-error',

        'Supabaseユーザー情報を取得できませんでした',

        error,

      );

      return null;

    }

    return data?.user ??

      null;

  } catch (

    error

  ) {

    updateDiagnostic(

      'get-user-error',

      'Supabaseユーザー確認中にエラーが発生しました',

      error,

    );

    return null;

  }

}

// ============================================================

// 現在uid

// ============================================================

export async function getCurrentUid() {

  const user =

    await getCurrentUser();

  return user?.id ??

    null;

}

// ============================================================

// roomId登録

// ============================================================

async function registerCurrentRoom() {

  const roomId =

    getRoomId();

  if (

    !roomId

  ) {

    registeredRoomId =

      null;

    updateDiagnostic(

      'room-missing',

      'Firebase側のroomIdがまだありません',

      null,

      {

        roomId:

          null,

      },

    );

    return false;

  }

  if (

    registeredRoomId ===

      roomId

  ) {

    updateDiagnostic(

      'room-registered',

      'Supabaseルーム登録済みです',

      null,

      {

        roomId,

      },

    );

    return true;

  }

  if (

    roomRegistrationPromise

  ) {

    return roomRegistrationPromise;

  }

  roomRegistrationPromise =

    (async () => {

      updateDiagnostic(

        'room-register-start',

        'Supabaseへルームを登録しています',

        null,

        {

          roomId,

        },

      );

      const user =

        await ensureSignedIn();

      if (

        !user?.id

      ) {

        const error =

          new Error(

            'Supabaseユーザー情報を取得できませんでした。',

          );

        updateDiagnostic(

          'room-user-error',

          'ルーム登録用ユーザーを取得できませんでした',

          error,

          {

            roomId,

          },

        );

        throw error;

      }

      const client =

        await getClient();

      let response;

      try {

        response =

          await client

            .from(

              ROOM_MEMBERS_TABLE,

            )

            .insert({

              room_id:

                roomId,

              user_id:

                user.id,

            });

      } catch (

        error

      ) {

        updateDiagnostic(

          'room-insert-error',

          'photo_room_membersへの通信に失敗しました',

          error,

          {

            userId:

              user.id,

            roomId,

          },

        );

        throw error;

      }

      const error =

        response?.error ??

        null;

      /*

       * 23505 =

       * room_id + user_id が既に登録済み。

       * その場合は正常扱い。

       */

      if (

        error &&

        error.code !==

          '23505'

      ) {

        updateDiagnostic(

          'room-insert-error',

          'photo_room_membersへの登録に失敗しました',

          error,

          {

            userId:

              user.id,

            roomId,

          },

        );

        console.error(

          '[supabase.js] roomId登録に失敗しました',

          error,

        );

        throw error;

      }

      registeredRoomId =

        roomId;

      updateDiagnostic(

        'room-registered',

        error?.code ===

          '23505'

          ? 'Supabaseルームは既に登録済みです'

          : 'Supabaseルーム登録に成功しました',

        null,

        {

          userId:

            user.id,

          roomId,

        },

      );

      return true;

    })()

      .finally(

        () => {

          roomRegistrationPromise =

            null;

        },

      );

  return roomRegistrationPromise;

}

// ============================================================

// 公開用 room同期

// ============================================================

export async function syncCurrentRoom() {

  return registerCurrentRoom();

}

// ============================================================

// ファイル名安全化

// ============================================================

function sanitizeFileName(

  fileName,

) {

  const raw =

    typeof fileName ===

      'string' &&

    fileName.trim()

      ? fileName.trim()

      : 'photo.jpg';

  return raw

    .replace(

      /[^a-zA-Z0-9._-]/g,

      '_',

    )

    .slice(

      0,

      120,

    );

}

// ============================================================

// ID生成

// ============================================================

function createId() {

  if (

    typeof crypto !==

      'undefined' &&

    typeof crypto.randomUUID ===

      'function'

  ) {

    return crypto.randomUUID();

  }

  return `${Date.now()}-${Math.random()

    .toString(36)

    .slice(2)}`;

}

// ============================================================

// 写真パス生成

// ============================================================

function createPhotoPath(

  roomId,

  file,

) {

  const safeName =

    sanitizeFileName(

      file?.name,

    );

  const id =

    createId();

  return `${roomId}/${id}-${safeName}`;

}

// ============================================================

// 写真アップロード

// ============================================================

export async function uploadPhoto(

  file,

) {

  if (

    !file

  ) {

    throw new Error(

      '写真データがありません。',

    );

  }

  const roomId =

    getRoomId();

  if (

    !roomId

  ) {

    throw new Error(

      'ルーム情報がありません。先にペアリングしてください。',

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

  updateDiagnostic(

    'upload-start',

    '共有写真をアップロードしています',

    null,

    {

      roomId,

    },

  );

  await registerCurrentRoom();

  const client =

    await getClient();

  const path =

    createPhotoPath(

      roomId,

      file,

    );

  const {

    data,

    error,

  } =

    await client.storage

      .from(

        SUPABASE_BUCKET,

      )

      .upload(

        path,

        file,

        {

          cacheControl:

            '3600',

          upsert:

            false,

          contentType:

            file.type ||

            'image/jpeg',

        },

      );

  if (

    error

  ) {

    updateDiagnostic(

      'upload-error',

      '共有写真のアップロードに失敗しました',

      error,

      {

        roomId,

      },

    );

    console.error(

      '[supabase.js] 写真アップロードに失敗しました',

      error,

    );

    throw error;

  }

  updateDiagnostic(

    'upload-success',

    '共有写真のアップロードに成功しました',

    null,

    {

      roomId,

    },

  );

  return {

    path:

      data?.path ??

      path,

    roomId,

    fileName:

      file.name ||

      'photo',

    contentType:

      file.type ||

      'image/jpeg',

    size,

  };

}

// ============================================================

// Signed URL生成

// ============================================================

async function createSignedPhotoUrl(

  client,

  path,

) {

  const {

    data,

    error,

  } =

    await client.storage

      .from(

        SUPABASE_BUCKET,

      )

      .createSignedUrl(

        path,

        SIGNED_URL_EXPIRES_SECONDS,

      );

  if (

    error

  ) {

    console.warn(

      '[supabase.js] Signed URL生成に失敗しました',

      path,

      error,

    );

    return null;

  }

  return data?.signedUrl ??

    null;

}

// ============================================================

// 写真一覧

// ============================================================

export async function listPhotos() {

  const roomId =

    getRoomId();

  if (

    !roomId

  ) {

    updateDiagnostic(

      'photo-room-missing',

      '写真共有用roomIdがありません',

    );

    return [];

  }

  updateDiagnostic(

    'photo-list-start',

    '共有写真一覧を取得しています',

    null,

    {

      roomId,

    },

  );

  await registerCurrentRoom();

  const client =

    await getClient();

  const {

    data,

    error,

  } =

    await client.storage

      .from(

        SUPABASE_BUCKET,

      )

      .list(

        roomId,

        {

          limit:

            PHOTO_LIST_LIMIT,

          offset:

            0,

          sortBy: {

            column:

              'created_at',

            order:

              'desc',

          },

        },

      );

  if (

    error

  ) {

    updateDiagnostic(

      'photo-list-error',

      '共有写真一覧の取得に失敗しました',

      error,

      {

        roomId,

      },

    );

    console.error(

      '[supabase.js] 写真一覧取得に失敗しました',

      error,

    );

    throw error;

  }

  const files =

    Array.isArray(

      data,

    )

      ? data

      : [];

  const photos =

    await Promise.all(

      files

        .filter(

          (

            item,

          ) =>

            item &&

            typeof item.name ===

              'string' &&

            item.name !==

              '.emptyFolderPlaceholder',

        )

        .map(

          async (

            item,

          ) => {

            const path =

              `${roomId}/${item.name}`;

            const signedUrl =

              await createSignedPhotoUrl(

                client,

                path,

              );

            return {

              id:

                item.id ||

                path,

              path,

              name:

                item.name,

              createdAt:

                item.created_at ||

                item.updated_at ||

                null,

              updatedAt:

                item.updated_at ||

                null,

              metadata:

                item.metadata ||

                {},

              signedUrl,

            };

          },

        ),

    );

  const result =

    photos.filter(

      (

        photo,

      ) =>

        Boolean(

          photo.signedUrl,

        ),

    );

  updateDiagnostic(

    'photo-list-success',

    `共有写真を${result.length}件取得しました`,

    null,

    {

      roomId,

    },

  );

  return result;

}

// ============================================================

// 写真削除

// ============================================================

export async function deletePhoto(

  path,

) {

  if (

    typeof path !==

      'string' ||

    path.trim() ===

      ''

  ) {

    return;

  }

  const roomId =

    getRoomId();

  if (

    !roomId

  ) {

    throw new Error(

      'ルーム情報がありません。',

    );

  }

  const normalizedPath =

    path.trim();

  if (

    !normalizedPath.startsWith(

      `${roomId}/`,

    )

  ) {

    throw new Error(

      'この写真は現在のルームに属していません。',

    );

  }

  updateDiagnostic(

    'delete-start',

    '共有写真を削除しています',

    null,

    {

      roomId,

    },

  );

  await registerCurrentRoom();

  const client =

    await getClient();

  const {

    error,

  } =

    await client.storage

      .from(

        SUPABASE_BUCKET,

      )

      .remove([

        normalizedPath,

      ]);

  if (

    error

  ) {

    updateDiagnostic(

      'delete-error',

      '共有写真の削除に失敗しました',

      error,

      {

        roomId,

      },

    );

    console.error(

      '[supabase.js] 写真削除に失敗しました',

      error,

    );

    throw error;

  }

  updateDiagnostic(

    'delete-success',

    '共有写真を削除しました',

    null,

    {

      roomId,

    },

  );

}

// ============================================================

// 利用可能確認

// ============================================================

export async function isAvailable() {

  try {

    await getClient();

    return true;

  } catch (

    error

  ) {

    updateDiagnostic(

      'availability-error',

      'Supabaseを利用できません',

      error,

    );

    console.error(

      '[supabase.js] Supabaseを利用できません',

      error,

    );

    return false;

  }

}

// ============================================================

// 接続診断

// ============================================================

export async function runDiagnostic() {

  updateDiagnostic(

    'diagnostic-start',

    'Supabase接続診断を開始しました',

  );

  try {

    const user =

      await ensureSignedIn();

    const roomId =

      getRoomId();

    let roomRegistered =

      false;

    if (

      roomId

    ) {

      roomRegistered =

        await registerCurrentRoom();

    }

    const result = {

      ok:

        true,

      userId:

        user?.id ??

        null,

      roomId,

      roomRegistered,

      diagnostic:

        getDiagnosticState(),

    };

    updateDiagnostic(

      'diagnostic-success',

      roomId

        ? 'Supabase認証・ルーム登録の確認に成功しました'

        : 'Supabase認証に成功しました。roomIdはまだありません',

      null,

      {

        userId:

          user?.id ??

          null,

        roomId,

      },

    );

    return result;

  } catch (

    error

  ) {

    updateDiagnostic(

      'diagnostic-error',

      'Supabase接続診断に失敗しました',

      error,

    );

    return {

      ok:

        false,

      error:

        getErrorMessage(

          error,

        ),

      diagnostic:

        getDiagnosticState(),

    };

  }

}

// ============================================================

// 初期化

// ============================================================

export async function init() {

  updateDiagnostic(

    'init-start',

    'Supabase初期化を開始しました',

  );

  const client =

    await getClient();

  /*

   * roomIdの有無に関係なく

   * 匿名認証を必ず実行する。

   */

  await ensureSignedIn();

  const roomId =

    getRoomId();

  if (

    roomId

  ) {

    try {

      await registerCurrentRoom();

    } catch (

      error

    ) {

      updateDiagnostic(

        'init-room-error',

        'Supabase初期化中のroom登録に失敗しました',

        error,

        {

          roomId,

        },

      );

      console.warn(

        '[supabase.js] 初期room登録に失敗しました',

        error,

      );

      /*

       * Clientと認証自体は使用可能なので

       * init全体を失敗扱いにはしない。

       */

    }

  }

  updateDiagnostic(

    'init-success',

    roomId

      ? 'Supabase初期化が完了しました'

      : 'Supabase認証が完了しました',

    null,

    {

      roomId,

    },

  );

  return client;

}

// ============================================================

// 公開API

// ============================================================

const Supabase = {

  init,

  isAvailable,

  runDiagnostic,

  getDiagnosticState,

  getDiagnosticEventName,

  getRoomId,

  ensureSignedIn,

  getCurrentUser,

  getCurrentUid,

  syncCurrentRoom,

  uploadPhoto,

  listPhotos,

  deletePhoto,

};

export default Supabase;