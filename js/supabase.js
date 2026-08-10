// ============================================================

// supabase.js

// Calculator 0209

//

// Supabase接続専用モジュール

//

// ・Supabase Client初期化

// ・匿名認証

// ・セッション維持

// ・photosバケットへのアップロード

// ・写真一覧取得

// ・Signed URL生成

// ・写真削除

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

// 状態

// ============================================================

let sdkPromise =

  null;

let clientPromise =

  null;

let signInPromise =

  null;

// ============================================================

// SDK読み込み

// ============================================================

async function loadSdk() {

  if (!sdkPromise) {

    sdkPromise =

      import(

        SUPABASE_SDK_URL

      ).catch(

        (error) => {

          sdkPromise =

            null;

          console.error(

            '[supabase.js] Supabase SDKの読み込みに失敗しました',

            error,

          );

          throw error;

        },

      );

  }

  return sdkPromise;

}

// ============================================================

// Client生成

// ============================================================

async function getClient() {

  if (!clientPromise) {

    clientPromise =

      loadSdk()

        .then(

          ({

            createClient,

          }) => {

            return createClient(

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

          },

        )

        .catch(

          (error) => {

            clientPromise =

              null;

            throw error;

          },

        );

  }

  return clientPromise;

}

// ============================================================

// 現在のFirebase roomIdを取得

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

// Supabase匿名認証

// ============================================================

export async function ensureSignedIn() {

  const client =

    await getClient();

  const {

    data:

      sessionData,

    error:

      sessionError,

  } =

    await client.auth

      .getSession();

  if (sessionError) {

    console.warn(

      '[supabase.js] 既存セッション確認に失敗しました',

      sessionError,

    );

  }

  if (

    sessionData?.session?.user

  ) {

    return sessionData

      .session

      .user;

  }

  if (signInPromise) {

    return signInPromise;

  }

  signInPromise =

    client.auth

      .signInAnonymously()

      .then(

        ({

          data,

          error,

        }) => {

          if (error) {

            throw error;

          }

          if (

            !data?.user

          ) {

            throw new Error(

              'Supabase匿名認証に失敗しました。',

            );

          }

          return data.user;

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

// 現在のSupabaseユーザー

// ============================================================

export async function getCurrentUser() {

  const client =

    await getClient();

  const {

    data,

    error,

  } =

    await client.auth

      .getUser();

  if (error) {

    return null;

  }

  return data?.user ??

    null;

}

// ============================================================

// 現在のSupabase uid

// ============================================================

export async function getCurrentUid() {

  const user =

    await getCurrentUser();

  return user?.id ??

    null;

}

// ============================================================

// ファイル名を安全化

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

// UUID生成

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

// Storage path生成

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

  if (!file) {

    throw new Error(

      '写真データがありません。',

    );

  }

  const roomId =

    getRoomId();

  if (!roomId) {

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

  await ensureSignedIn();

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

  if (error) {

    console.error(

      '[supabase.js] 写真アップロードに失敗しました',

      error,

    );

    throw error;

  }

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

  if (error) {

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

// 写真一覧取得

// ============================================================

export async function listPhotos() {

  const roomId =

    getRoomId();

  if (!roomId) {

    return [];

  }

  await ensureSignedIn();

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

  if (error) {

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

          (item) =>

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

  return photos.filter(

    (photo) =>

      Boolean(

        photo.signedUrl,

      ),

  );

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

  if (!roomId) {

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

  await ensureSignedIn();

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

  if (error) {

    console.error(

      '[supabase.js] 写真削除に失敗しました',

      error,

    );

    throw error;

  }

}

// ============================================================

// Supabase利用可能確認

// ============================================================

export async function isAvailable() {

  try {

    await getClient();

    return true;

  } catch (error) {

    console.error(

      '[supabase.js] Supabaseを利用できません',

      error,

    );

    return false;

  }

}

// ============================================================

// 初期化

// ============================================================

export async function init() {

  const client =

    await getClient();

  return client;

}

// ============================================================

// 公開API

// ============================================================

const Supabase = {

  init,

  isAvailable,

  getRoomId,

  ensureSignedIn,

  getCurrentUser,

  getCurrentUid,

  uploadPhoto,

  listPhotos,

  deletePhoto,

};

export default Supabase;