// ============================================================

// photo.js

// Calculator 0209

//

// 写真画面 完成版

//

// ・iPhoneから写真選択

// ・ペアリング済み：Supabase Storageへ共有保存

// ・未ペアリング：IndexedDBへ端末内保存

// ・共有写真一覧取得

// ・定期更新で相手側の写真も反映

// ・写真プレビュー

// ・ローカル写真削除

// ・共有写真削除

// ・背景カスタマイズ

//

// Supabase接続処理は supabase.js に分離

// ============================================================

import Customization from './customization.js';

import Supabase from './supabase.js';

// ============================================================

// 画面定数

// ============================================================

const CONTAINER_ID =

  'photo';

const FILE_INPUT_ID =

  'photoFileInput';

const STATUS_ID =

  'photoStatus';

const GALLERY_ID =

  'photoGallery';

const VIEWER_ID =

  'photoViewer';

const VIEWER_IMAGE_ID =

  'photoViewerImage';

const VIEWER_DATE_ID =

  'photoViewerDate';

// ============================================================

// IndexedDB

// ============================================================

const DB_NAME =

  'calculator-0209-photo-db';

const DB_VERSION =

  3;

const PHOTO_STORE_NAME =

  'photos';

// ============================================================

// 共有写真更新

// ============================================================

const SHARED_REFRESH_INTERVAL_MS =

  10000;

// ============================================================

// 状態

// ============================================================

let isBuilt =

  false;

let databasePromise =

  null;

let unsubscribeCustomization =

  null;

let sharedRefreshTimer =

  null;

let sharedPhotos =

  [];

let isSharedMode =

  false;

let isRefreshingShared =

  false;

let galleryRenderToken =

  0;

const activeObjectUrls =

  new Set();

// ============================================================

// ステータス

// ============================================================

function setStatus(

  message,

  type = 'normal',

) {

  const status =

    document.getElementById(

      STATUS_ID,

    );

  if (!status) {

    return;

  }

  status.textContent =

    message ?? '';

  status.dataset.status =

    type;

}

function clearStatus() {

  setStatus(

    '',

    'normal',

  );

}

function clearStatusLater(

  delayMs = 2200,

) {

  window.setTimeout(

    () => {

      if (

        isOpen()

      ) {

        clearStatus();

      }

    },

    delayMs,

  );

}

// ============================================================

// IndexedDBを開く

// ============================================================

function openDatabase() {

  if (databasePromise) {

    return databasePromise;

  }

  databasePromise =

    new Promise(

      (

        resolve,

        reject,

      ) => {

        if (

          !(

            'indexedDB' in

            window

          )

        ) {

          reject(

            new Error(

              'IndexedDBが利用できません。',

            ),

          );

          return;

        }

        const request =

          indexedDB.open(

            DB_NAME,

            DB_VERSION,

          );

        request.onupgradeneeded =

          () => {

            const db =

              request.result;

            /*

             * 既存写真を消さない。

             *

             * 過去版のように

             * deleteObjectStore() は実行しない。

             */

            if (

              !db.objectStoreNames.contains(

                PHOTO_STORE_NAME,

              )

            ) {

              const store =

                db.createObjectStore(

                  PHOTO_STORE_NAME,

                  {

                    keyPath:

                      'id',

                  },

                );

              store.createIndex(

                'createdAt',

                'createdAt',

                {

                  unique:

                    false,

                },

              );

            }

          };

        request.onsuccess =

          () => {

            const db =

              request.result;

            db.onversionchange =

              () => {

                db.close();

                databasePromise =

                  null;

              };

            resolve(

              db,

            );

          };

        request.onerror =

          () => {

            databasePromise =

              null;

            reject(

              request.error ??

              new Error(

                '写真データベースを開けませんでした。',

              ),

            );

          };

        request.onblocked =

          () => {

            console.warn(

              '[photo.js] IndexedDB更新がブロックされています',

            );

          };

      },

    );

  return databasePromise;

}

// ============================================================

// ID生成

// ============================================================

function createPhotoId() {

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

// Blob → ArrayBuffer

// ============================================================

function blobToArrayBuffer(

  blob,

) {

  if (

    blob &&

    typeof blob.arrayBuffer ===

      'function'

  ) {

    return blob.arrayBuffer();

  }

  return new Promise(

    (

      resolve,

      reject,

    ) => {

      const reader =

        new FileReader();

      reader.onload =

        () => {

          resolve(

            reader.result,

          );

        };

      reader.onerror =

        () => {

          reject(

            reader.error ??

            new Error(

              '写真データを読み込めませんでした。',

            ),

          );

        };

      reader.readAsArrayBuffer(

        blob,

      );

    },

  );

}

// ============================================================

// ローカル写真保存

// ============================================================

async function saveLocalPhoto(

  file,

) {

  if (!file) {

    throw new Error(

      '写真データがありません。',

    );

  }

  const buffer =

    await blobToArrayBuffer(

      file,

    );

  if (

    !(buffer instanceof ArrayBuffer)

  ) {

    throw new Error(

      '写真データの変換に失敗しました。',

    );

  }

  const db =

    await openDatabase();

  const record = {

    id:

      createPhotoId(),

    name:

      typeof file.name ===

        'string' &&

      file.name

        ? file.name

        : 'photo',

    type:

      typeof file.type ===

        'string' &&

      file.type

        ? file.type

        : 'image/jpeg',

    size:

      Number(

        file.size,

      ) ||

      buffer.byteLength,

    createdAt:

      Date.now(),

    buffer,

  };

  return new Promise(

    (

      resolve,

      reject,

    ) => {

      const transaction =

        db.transaction(

          PHOTO_STORE_NAME,

          'readwrite',

        );

      const store =

        transaction.objectStore(

          PHOTO_STORE_NAME,

        );

      const request =

        store.put(

          record,

        );

      request.onerror =

        () => {

          reject(

            request.error ??

              new Error(

                '写真保存に失敗しました。',

              ),

          );

        };

      transaction.oncomplete =

        () => {

          resolve(

            record,

          );

        };

      transaction.onerror =

        () => {

          reject(

            transaction.error ??

              new Error(

                '写真保存に失敗しました。',

              ),

          );

        };

      transaction.onabort =

        () => {

          reject(

            transaction.error ??

              new Error(

                '写真保存が中断されました。',

              ),

          );

        };

    },

  );

}

// ============================================================

// ローカル写真一覧取得

// ============================================================

async function loadLocalPhotos() {

  const db =

    await openDatabase();

  return new Promise(

    (

      resolve,

      reject,

    ) => {

      const transaction =

        db.transaction(

          PHOTO_STORE_NAME,

          'readonly',

        );

      const store =

        transaction.objectStore(

          PHOTO_STORE_NAME,

        );

      const request =

        store.getAll();

      request.onsuccess =

        () => {

          const records =

            Array.isArray(

              request.result,

            )

              ? request.result

              : [];

          records.sort(

            (

              a,

              b,

            ) =>

              Number(

                b.createdAt,

              ) -

              Number(

                a.createdAt,

              ),

          );

          resolve(

            records,

          );

        };

      request.onerror =

        () => {

          reject(

            request.error ??

              new Error(

                '端末内の写真を読み込めませんでした。',

              ),

          );

        };

    },

  );

}

// ============================================================

// ローカル写真削除

// ============================================================

async function deleteLocalPhotoById(

  photoId,

) {

  if (!photoId) {

    return;

  }

  const db =

    await openDatabase();

  return new Promise(

    (

      resolve,

      reject,

    ) => {

      const transaction =

        db.transaction(

          PHOTO_STORE_NAME,

          'readwrite',

        );

      const store =

        transaction.objectStore(

          PHOTO_STORE_NAME,

        );

      const request =

        store.delete(

          photoId,

        );

      request.onerror =

        () => {

          reject(

            request.error ??

              new Error(

                '写真削除に失敗しました。',

              ),

          );

        };

      transaction.oncomplete =

        () => {

          resolve();

        };

      transaction.onerror =

        () => {

          reject(

            transaction.error ??

              new Error(

                '写真削除に失敗しました。',

              ),

          );

        };

    },

  );

}

// ============================================================

// 保存データ → Blob

// ============================================================

function createBlobFromRecord(

  record,

) {

  if (!record) {

    return null;

  }

  if (

    record.buffer instanceof

      ArrayBuffer

  ) {

    return new Blob(

      [

        record.buffer,

      ],

      {

        type:

          record.type ||

          'image/jpeg',

      },

    );

  }

  /*

   * 古い保存形式にも対応。

   */

  if (

    record.blob instanceof

      Blob

  ) {

    return record.blob;

  }

  return null;

}

// ============================================================

// Object URL管理

// ============================================================

function revokeAllObjectUrls() {

  activeObjectUrls.forEach(

    (

      url,

    ) => {

      try {

        URL.revokeObjectURL(

          url,

        );

      } catch (error) {

        console.warn(

          '[photo.js] Object URLの解放に失敗しました',

          error,

        );

      }

    },

  );

  activeObjectUrls.clear();

}

// ============================================================

// Supabase共有モード確認

// ============================================================

function updateSharedMode() {

  const roomId =

    Supabase.getRoomId();

  isSharedMode =

    Boolean(

      roomId,

    );

  return isSharedMode;

}

// ============================================================

// 共有写真取得

// ============================================================

async function refreshSharedPhotos(

  {

    rerender = false,

    silent = false,

  } = {},

) {

  if (

    isRefreshingShared

  ) {

    return;

  }

  if (

    !updateSharedMode()

  ) {

    sharedPhotos =

      [];

    return;

  }

  isRefreshingShared =

    true;

  try {

    await Supabase.ensureSignedIn();

    const photos =

      await Supabase.listPhotos();

    sharedPhotos =

      Array.isArray(

        photos,

      )

        ? photos

        : [];

    if (

      rerender &&

      isOpen()

    ) {

      await renderGallery();

    }

  } catch (error) {

    console.error(

      '[photo.js] 共有写真の取得に失敗しました',

      error,

    );

    if (!silent) {

      setStatus(

        '共有写真を読み込めませんでした',

        'error',

      );

    }

  } finally {

    isRefreshingShared =

      false;

  }

}

// ============================================================

// 共有写真定期更新

// ============================================================

function stopSharedRefreshTimer() {

  if (

    sharedRefreshTimer !==

    null

  ) {

    window.clearInterval(

      sharedRefreshTimer,

    );

    sharedRefreshTimer =

      null;

  }

}

function startSharedRefreshTimer() {

  stopSharedRefreshTimer();

  if (

    !isSharedMode

  ) {

    return;

  }

  sharedRefreshTimer =

    window.setInterval(

      () => {

        if (

          !isOpen() ||

          document.visibilityState ===

            'hidden'

        ) {

          return;

        }

        refreshSharedPhotos({

          rerender:

            true,

          silent:

            true,

        }).catch(

          (

            error,

          ) => {

            console.warn(

              '[photo.js] 共有写真の定期更新に失敗しました',

              error,

            );

          },

        );

      },

      SHARED_REFRESH_INTERVAL_MS,

    );

}

// ============================================================

// コンテナ

// ============================================================

function getContainer() {

  return document.getElementById(

    CONTAINER_ID,

  );

}

function createContainer() {

  const container =

    document.createElement(

      'div',

    );

  container.id =

    CONTAINER_ID;

  container.className =

    'photo';

  container.setAttribute(

    'aria-hidden',

    'true',

  );

  document.body.appendChild(

    container,

  );

  return container;

}

// ============================================================

// ヘッダー

// ============================================================

function createHeader() {

  const header =

    document.createElement(

      'header',

    );

  header.className =

    'photo-header';

  const backButton =

    document.createElement(

      'button',

    );

  backButton.type =

    'button';

  backButton.className =

    'icon-btn';

  backButton.dataset.action =

    'close-photo';

  backButton.setAttribute(

    'aria-label',

    'Workspaceへ戻る',

  );

  backButton.textContent =

    '‹';

  const title =

    document.createElement(

      'h2',

    );

  title.className =

    'photo-title';

  title.textContent =

    '写真';

  const lockButton =

    document.createElement(

      'button',

    );

  lockButton.type =

    'button';

  lockButton.className =

    'icon-btn';

  lockButton.dataset.action =

    'lock-now';

  lockButton.setAttribute(

    'aria-label',

    '今すぐロック',

  );

  lockButton.textContent =

    '🔒';

  header.appendChild(

    backButton,

  );

  header.appendChild(

    title,

  );

  header.appendChild(

    lockButton,

  );

  return header;

}

// ============================================================

// 写真選択input

// ============================================================

function createFileInput() {

  const input =

    document.createElement(

      'input',

    );

  input.type =

    'file';

  input.id =

    FILE_INPUT_ID;

  input.className =

    'photo-file-input';

  input.accept =

    'image/*';

  input.multiple =

    true;

  input.hidden =

    true;

  input.setAttribute(

    'aria-label',

    '写真を選択',

  );

  return input;

}

// ============================================================

// 上部カード

// ============================================================

function createIntro() {

  const intro =

    document.createElement(

      'section',

    );

  intro.className =

    'photo-intro';

  const textWrap =

    document.createElement(

      'div',

    );

  textWrap.className =

    'photo-intro-text';

  const title =

    document.createElement(

      'h3',

    );

  title.className =

    'photo-intro-title';

  title.textContent =

    'Photos';

  const description =

    document.createElement(

      'p',

    );

  description.className =

    'photo-intro-description';

  description.textContent =

    'ふたりの写真をまとめて見る';

  textWrap.appendChild(

    title,

  );

  textWrap.appendChild(

    description,

  );

  /*

   * iPhone Safari / PWA対策。

   *

   * JavaScriptのinput.click()だけでなく

   * label → file input の標準動作を使用する。

   */

  const addLabel =

    document.createElement(

      'label',

    );

  addLabel.className =

    'photo-add-btn';

  addLabel.htmlFor =

    FILE_INPUT_ID;

  addLabel.setAttribute(

    'role',

    'button',

  );

  addLabel.setAttribute(

    'aria-label',

    '写真を追加',

  );

  addLabel.setAttribute(

    'tabindex',

    '0',

  );

  addLabel.textContent =

    '＋';

  intro.appendChild(

    textWrap,

  );

  intro.appendChild(

    addLabel,

  );

  return intro;

}

// ============================================================

// ステータス

// ============================================================

function createStatus() {

  const status =

    document.createElement(

      'div',

    );

  status.id =

    STATUS_ID;

  status.className =

    'photo-status';

  status.setAttribute(

    'role',

    'status',

  );

  status.setAttribute(

    'aria-live',

    'polite',

  );

  status.dataset.status =

    'normal';

  status.textContent =

    '';

  return status;

}

// ============================================================

// メイン領域

// ============================================================

function createMain() {

  const main =

    document.createElement(

      'main',

    );

  main.className =

    'photo-main';

  const gallery =

    document.createElement(

      'div',

    );

  gallery.id =

    GALLERY_ID;

  gallery.className =

    'photo-gallery';

  main.appendChild(

    gallery,

  );

  return main;

}

// ============================================================

// 空表示

// ============================================================

function createEmptyState() {

  const empty =

    document.createElement(

      'div',

    );

  empty.className =

    'photo-empty';

  const icon =

    document.createElement(

      'div',

    );

  icon.className =

    'photo-empty-icon';

  icon.setAttribute(

    'aria-hidden',

    'true',

  );

  icon.textContent =

    '📷';

  const title =

    document.createElement(

      'p',

    );

  title.className =

    'photo-empty-title';

  title.textContent =

    'まだ写真がありません';

  const description =

    document.createElement(

      'p',

    );

  description.className =

    'photo-empty-text';

  description.textContent =

    isSharedMode

      ? '＋をタップして、ふたりの写真を追加'

      : '＋をタップして写真を追加';

  empty.appendChild(

    icon,

  );

  empty.appendChild(

    title,

  );

  empty.appendChild(

    description,

  );

  return empty;

}

// ============================================================

// ローディング

// ============================================================

function createLoadingState() {

  const loading =

    document.createElement(

      'div',

    );

  loading.className =

    'photo-loading';

  const spinner =

    document.createElement(

      'span',

    );

  spinner.className =

    'photo-loading-spinner';

  spinner.setAttribute(

    'aria-hidden',

    'true',

  );

  const text =

    document.createElement(

      'span',

    );

  text.textContent =

    '写真を読み込み中…';

  loading.appendChild(

    spinner,

  );

  loading.appendChild(

    text,

  );

  return loading;

}

// ============================================================

// エラー表示

// ============================================================

function createErrorState() {

  const errorState =

    document.createElement(

      'div',

    );

  errorState.className =

    'photo-empty';

  const title =

    document.createElement(

      'p',

    );

  title.className =

    'photo-empty-title';

  title.textContent =

    '写真を読み込めませんでした';

  const description =

    document.createElement(

      'p',

    );

  description.className =

    'photo-empty-text';

  description.textContent =

    '通信状態を確認して、もう一度開いてください';

  errorState.appendChild(

    title,

  );

  errorState.appendChild(

    description,

  );

  return errorState;

}

// ============================================================

// 日付

// ============================================================

function normalizeTimestamp(

  value,

) {

  if (

    typeof value ===

      'number' &&

    Number.isFinite(

      value,

    )

  ) {

    return value;

  }

  if (

    typeof value ===

    'string'

  ) {

    const parsed =

      Date.parse(

        value,

      );

    if (

      Number.isFinite(

        parsed,

      )

    ) {

      return parsed;

    }

  }

  if (

    value &&

    typeof value.toMillis ===

      'function'

  ) {

    try {

      return value.toMillis();

    } catch {

      return Date.now();

    }

  }

  return Date.now();

}

function formatPhotoDate(

  timestamp,

) {

  const date =

    new Date(

      normalizeTimestamp(

        timestamp,

      ),

    );

  const year =

    date.getFullYear();

  const month =

    String(

      date.getMonth() +

        1,

    ).padStart(

      2,

      '0',

    );

  const day =

    String(

      date.getDate(),

    ).padStart(

      2,

      '0',

    );

  return `${year}.${month}.${day}`;

}

// ============================================================

// 共通カード部品

// ============================================================

function createCardShell({

  photoId,

  photoUrl,

  photoPath = '',

  source,

  name,

  createdAt,

}) {

  if (

    !photoId ||

    !photoUrl

  ) {

    return null;

  }

  const card =

    document.createElement(

      'div',

    );

  card.className =

    'photo-card';

  card.dataset.photoId =

    photoId;

  card.dataset.photoSource =

    source;

  if (photoPath) {

    card.dataset.photoPath =

      photoPath;

  }

  const openButton =

    document.createElement(

      'button',

    );

  openButton.type =

    'button';

  openButton.className =

    'photo-card-open';

  openButton.dataset.action =

    'open-photo-preview';

  openButton.dataset.photoUrl =

    photoUrl;

  openButton.dataset.photoId =

    photoId;

  openButton.dataset.photoSource =

    source;

  openButton.dataset.photoDate =

    formatPhotoDate(

      createdAt,

    );

  if (photoPath) {

    openButton.dataset.photoPath =

      photoPath;

  }

  openButton.setAttribute(

    'aria-label',

    name

      ? `${name}を開く`

      : '写真を開く',

  );

  const image =

    document.createElement(

      'img',

    );

  image.className =

    'photo-card-image';

  image.src =

    photoUrl;

  image.alt =

    name ||

    '写真';

  image.loading =

    'lazy';

  image.decoding =

    'async';

  openButton.appendChild(

    image,

  );

  const info =

    document.createElement(

      'div',

    );

  info.className =

    'photo-card-info';

  const date =

    document.createElement(

      'span',

    );

  date.className =

    'photo-card-date';

  date.textContent =

    formatPhotoDate(

      createdAt,

    );

  const deleteButton =

    document.createElement(

      'button',

    );

  deleteButton.type =

    'button';

  deleteButton.className =

    'photo-delete-btn';

  /*

   * app.jsを再修正しなくてもよいよう、

   * ローカル・共有とも同じactionにする。

   */

  deleteButton.dataset.action =

    'delete-photo';

  deleteButton.dataset.photoId =

    photoId;

  deleteButton.dataset.photoSource =

    source;

  if (photoPath) {

    deleteButton.dataset.photoPath =

      photoPath;

  }

  deleteButton.setAttribute(

    'aria-label',

    'この写真を削除',

  );

  deleteButton.textContent =

    '×';

  info.appendChild(

    date,

  );

  info.appendChild(

    deleteButton,

  );

  card.appendChild(

    openButton,

  );

  card.appendChild(

    info,

  );

  return card;

}

// ============================================================

// ローカル写真カード

// ============================================================

function createLocalPhotoCard(

  record,

) {

  if (

    !record ||

    !record.id

  ) {

    return null;

  }

  const blob =

    createBlobFromRecord(

      record,

    );

  if (!blob) {

    console.warn(

      '[photo.js] ローカル写真Blobを生成できませんでした',

      record.id,

    );

    return null;

  }

  const objectUrl =

    URL.createObjectURL(

      blob,

    );

  activeObjectUrls.add(

    objectUrl,

  );

  return createCardShell({

    photoId:

      record.id,

    photoUrl:

      objectUrl,

    source:

      'local',

    name:

      record.name ||

      '写真',

    createdAt:

      record.createdAt,

  });

}

// ============================================================

// 共有写真カード

// ============================================================

function createSharedPhotoCard(

  record,

) {

  if (

    !record ||

    !record.path ||

    !record.signedUrl

  ) {

    return null;

  }

  return createCardShell({

    photoId:

      record.id ||

      record.path,

    photoUrl:

      record.signedUrl,

    photoPath:

      record.path,

    source:

      'shared',

    name:

      record.name ||

      '共有写真',

    createdAt:

      record.createdAt,

  });

}

// ============================================================

// ギャラリー描画

// ============================================================

async function renderGallery() {

  const gallery =

    document.getElementById(

      GALLERY_ID,

    );

  if (!gallery) {

    return;

  }

  const renderToken =

    ++galleryRenderToken;

  gallery.replaceChildren(

    createLoadingState(),

  );

  revokeAllObjectUrls();

  try {

    updateSharedMode();

    const localPhotos =

      await loadLocalPhotos();

    if (

      renderToken !==

      galleryRenderToken

    ) {

      return;

    }

    /*

     * ペアリング後も過去に端末内へ保存した写真は

     * 消さずに表示する。

     */

    const photoItems = [

      ...sharedPhotos.map(

        (

          photo,

        ) => ({

          source:

            'shared',

          timestamp:

            normalizeTimestamp(

              photo.createdAt,

            ),

          record:

            photo,

        }),

      ),

      ...localPhotos.map(

        (

          photo,

        ) => ({

          source:

            'local',

          timestamp:

            normalizeTimestamp(

              photo.createdAt,

            ),

          record:

            photo,

        }),

      ),

    ];

    photoItems.sort(

      (

        a,

        b,

      ) =>

        b.timestamp -

        a.timestamp,

    );

    if (

      photoItems.length ===

      0

    ) {

      gallery.replaceChildren(

        createEmptyState(),

      );

      return;

    }

    const fragment =

      document.createDocumentFragment();

    let renderedCount =

      0;

    photoItems.forEach(

      (

        item,

      ) => {

        const card =

          item.source ===

          'shared'

            ? createSharedPhotoCard(

                item.record,

              )

            : createLocalPhotoCard(

                item.record,

              );

        if (!card) {

          return;

        }

        fragment.appendChild(

          card,

        );

        renderedCount +=

          1;

      },

    );

    if (

      renderedCount ===

      0

    ) {

      gallery.replaceChildren(

        createEmptyState(),

      );

      return;

    }

    gallery.replaceChildren(

      fragment,

    );

  } catch (error) {

    console.error(

      '[photo.js] ギャラリー描画に失敗しました',

      error,

    );

    gallery.replaceChildren(

      createErrorState(),

    );

  }

}

// ============================================================

// 写真保存

// ============================================================

async function handleSelectedFiles(

  files,

) {

  if (

    !files ||

    files.length ===

      0

  ) {

    return;

  }

  const imageFiles =

    Array.from(

      files,

    ).filter(

      (

        file,

      ) =>

        file &&

        typeof file.size ===

          'number',

    );

  if (

    imageFiles.length ===

    0

  ) {

    setStatus(

      '写真データを取得できませんでした',

      'error',

    );

    return;

  }

  updateSharedMode();

  try {

    if (

      isSharedMode

    ) {

      /*

       * 先に認証しておくことで、

       * 複数写真アップロード時に

       * 毎回サインイン処理を走らせない。

       */

      await Supabase.ensureSignedIn();

    }

    let savedCount =

      0;

    for (

      const file of

      imageFiles

    ) {

      setStatus(

        `${savedCount + 1}/${imageFiles.length} 保存中…`,

        'saving',

      );

      if (

        isSharedMode

      ) {

        await Supabase.uploadPhoto(

          file,

        );

      } else {

        await saveLocalPhoto(

          file,

        );

      }

      savedCount +=

        1;

    }

    if (

      isSharedMode

    ) {

      await refreshSharedPhotos({

        rerender:

          false,

        silent:

          false,

      });

    }

    await renderGallery();

    setStatus(

      savedCount ===

        1

        ? (

            isSharedMode

              ? '共有写真を保存しました'

              : '写真を保存しました'

          )

        : `${savedCount}枚の写真を保存しました`,

      'success',

    );

    clearStatusLater(

      2500,

    );

  } catch (error) {

    console.error(

      '[photo.js] 写真保存に失敗しました',

      error,

    );

    let message =

      error?.message ||

      '写真の保存に失敗しました';

    if (

      typeof message ===

        'string' &&

      (

        message.includes(

          'row-level security',

        ) ||

        message.includes(

          'Unauthorized',

        ) ||

        message.includes(

          '403',

        )

      )

    ) {

      message =

        '写真の保存権限を確認できませんでした';

    }

    setStatus(

      message,

      'error',

    );

  }

}

// ============================================================

// file inputイベント

// ============================================================

function registerFileInputListener() {

  const input =

    document.getElementById(

      FILE_INPUT_ID,

    );

  if (!input) {

    console.warn(

      '[photo.js] photoFileInputが見つかりません',

    );

    return;

  }

  input.addEventListener(

    'change',

    async (

      event,

    ) => {

      const target =

        event.target;

      const files =

        target?.files

          ? Array.from(

              target.files,

            )

          : [];

      /*

       * 同じ写真をもう一度選択できるように

       * filesをコピーしてからinputを空にする。

       */

      if (target) {

        target.value =

          '';

      }

      await handleSelectedFiles(

        files,

      );

    },

  );

}

// ============================================================

// ＋ボタン キーボード操作

// ============================================================

function registerAddLabelKeyboard() {

  const addLabel =

    document.querySelector(

      '.photo-add-btn',

    );

  if (!addLabel) {

    return;

  }

  addLabel.addEventListener(

    'keydown',

    (

      event,

    ) => {

      if (

        event.key !==

          'Enter' &&

        event.key !==

          ' '

      ) {

        return;

      }

      event.preventDefault();

      selectPhotos();

    },

  );

}

// ============================================================

// プレビュー

// ============================================================

function createViewer() {

  const viewer =

    document.createElement(

      'div',

    );

  viewer.id =

    VIEWER_ID;

  viewer.className =

    'photo-viewer';

  viewer.setAttribute(

    'aria-hidden',

    'true',

  );

  const closeButton =

    document.createElement(

      'button',

    );

  closeButton.type =

    'button';

  closeButton.className =

    'photo-viewer-close';

  closeButton.dataset.action =

    'close-photo-preview';

  closeButton.setAttribute(

    'aria-label',

    '写真を閉じる',

  );

  closeButton.textContent =

    '×';

  const image =

    document.createElement(

      'img',

    );

  image.id =

    VIEWER_IMAGE_ID;

  image.className =

    'photo-viewer-image';

  image.alt =

    '選択した写真';

  const date =

    document.createElement(

      'div',

    );

  date.id =

    VIEWER_DATE_ID;

  date.className =

    'photo-viewer-date';

  viewer.appendChild(

    closeButton,

  );

  viewer.appendChild(

    image,

  );

  viewer.appendChild(

    date,

  );

  return viewer;

}

// ============================================================

// プレビュー日付

// ============================================================

function setPreviewDateFromTarget(

  target,

) {

  const dateLabel =

    document.getElementById(

      VIEWER_DATE_ID,

    );

  if (!dateLabel) {

    return;

  }

  if (

    target instanceof

      HTMLElement &&

    target.dataset.photoDate

  ) {

    dateLabel.textContent =

      target.dataset.photoDate;

    return;

  }

  const card =

    target instanceof Element

      ? target.closest(

          '.photo-card',

        )

      : null;

  const cardDate =

    card?.querySelector(

      '.photo-card-date',

    );

  dateLabel.textContent =

    cardDate?.textContent ??

    '';

}

// ============================================================

// プレビューを開く

// ============================================================

export function openPreview(

  photoUrl,

) {

  if (

    typeof photoUrl !==

      'string' ||

    photoUrl ===

      ''

  ) {

    return;

  }

  const viewer =

    document.getElementById(

      VIEWER_ID,

    );

  const image =

    document.getElementById(

      VIEWER_IMAGE_ID,

    );

  if (

    !viewer ||

    !image

  ) {

    return;

  }

  image.src =

    photoUrl;

  viewer.classList.add(

    'is-open',

  );

  viewer.setAttribute(

    'aria-hidden',

    'false',

  );

}

// ============================================================

// ターゲットからプレビュー

// ============================================================

export function openPreviewFromTarget(

  target,

) {

  const photoUrl =

    getPhotoUrlFromTarget(

      target,

    );

  if (!photoUrl) {

    return;

  }

  setPreviewDateFromTarget(

    target,

  );

  openPreview(

    photoUrl,

  );

}

// ============================================================

// プレビューを閉じる

// ============================================================

export function closePreview() {

  const viewer =

    document.getElementById(

      VIEWER_ID,

    );

  const image =

    document.getElementById(

      VIEWER_IMAGE_ID,

    );

  const dateLabel =

    document.getElementById(

      VIEWER_DATE_ID,

    );

  if (viewer) {

    viewer.classList.remove(

      'is-open',

    );

    viewer.setAttribute(

      'aria-hidden',

      'true',

    );

  }

  if (image) {

    image.removeAttribute(

      'src',

    );

  }

  if (dateLabel) {

    dateLabel.textContent =

      '';

  }

}

// ============================================================

// 写真URL取得

// ============================================================

export function getPhotoUrlFromTarget(

  target,

) {

  if (

    !(target instanceof Element)

  ) {

    return '';

  }

  const owner =

    target.closest(

      '[data-photo-url]',

    );

  if (!owner) {

    return '';

  }

  /*

   * 古いapp.jsは

   * getPhotoUrlFromTarget → openPreview

   * の順で呼ぶため、

   * ここで日付もセットして互換性を保つ。

   */

  setPreviewDateFromTarget(

    owner,

  );

  return owner.dataset.photoUrl ??

    '';

}

// ============================================================

// 写真ID取得

// ============================================================

export function getPhotoIdFromTarget(

  target,

) {

  if (

    !(target instanceof Element)

  ) {

    return '';

  }

  const owner =

    target.closest(

      '[data-photo-id]',

    );

  return owner?.dataset.photoId ??

    '';

}

// ============================================================

// 写真source取得

// ============================================================

function getPhotoSourceFromTarget(

  target,

) {

  if (

    !(target instanceof Element)

  ) {

    return '';

  }

  const owner =

    target.closest(

      '[data-photo-source]',

    );

  return owner?.dataset.photoSource ??

    '';

}

// ============================================================

// 写真path取得

// ============================================================

function getPhotoPathFromTarget(

  target,

) {

  if (

    !(target instanceof Element)

  ) {

    return '';

  }

  const owner =

    target.closest(

      '[data-photo-path]',

    );

  return owner?.dataset.photoPath ??

    '';

}

// ============================================================

// ローカル写真削除

// ============================================================

export async function deletePhoto(

  photoId,

) {

  if (!photoId) {

    return;

  }

  try {

    await deleteLocalPhotoById(

      photoId,

    );

    await renderGallery();

    setStatus(

      '写真を削除しました',

      'success',

    );

    clearStatusLater(

      1800,

    );

  } catch (error) {

    console.error(

      '[photo.js] ローカル写真削除に失敗しました',

      error,

    );

    setStatus(

      '写真の削除に失敗しました',

      'error',

    );

  }

}

// ============================================================

// ターゲットから写真削除

// ============================================================

export async function deletePhotoFromTarget(

  target,

) {

  const photoId =

    getPhotoIdFromTarget(

      target,

    );

  const source =

    getPhotoSourceFromTarget(

      target,

    );

  const path =

    getPhotoPathFromTarget(

      target,

    );

  if (!photoId) {

    return;

  }

  const confirmed =

    window.confirm(

      source ===

        'shared'

        ? 'この共有写真を削除しますか？'

        : 'この写真を削除しますか？',

    );

  if (!confirmed) {

    return;

  }

  if (

    source ===

    'shared'

  ) {

    if (!path) {

      setStatus(

        '共有写真の情報を取得できませんでした',

        'error',

      );

      return;

    }

    try {

      setStatus(

        '削除中…',

        'saving',

      );

      await Supabase.deletePhoto(

        path,

      );

      await refreshSharedPhotos({

        rerender:

          false,

        silent:

          false,

      });

      await renderGallery();

      setStatus(

        '共有写真を削除しました',

        'success',

      );

      clearStatusLater(

        1800,

      );

    } catch (error) {

      console.error(

        '[photo.js] 共有写真削除に失敗しました',

        error,

      );

      setStatus(

        error?.message ||

          '共有写真の削除に失敗しました',

        'error',

      );

    }

    return;

  }

  await deletePhoto(

    photoId,

  );

}

// ============================================================

// 新app.jsとの互換用

// ============================================================

export async function deleteSharedPhotoFromTarget(

  target,

) {

  /*

   * 新しいapp.jsが

   * deleteSharedPhotoFromTarget()を呼んだ場合も

   * 同じ共通削除処理へ流す。

   */

  await deletePhotoFromTarget(

    target,

  );

}

// ============================================================

// 写真選択

// ============================================================

export function selectPhotos() {

  const input =

    document.getElementById(

      FILE_INPUT_ID,

    );

  if (!input) {

    console.warn(

      '[photo.js] photoFileInputが見つかりません',

    );

    setStatus(

      '写真選択を開始できませんでした',

      'error',

    );

    return;

  }

  input.click();

}

// ============================================================

// 背景

// ============================================================

function applyBackground() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  const cached =

    Customization.getCached();

  const backgroundId =

    cached?.backgrounds?.photo ??

    'default';

  /*

   * photo.css側の

   * .photo-bg--xxx に合わせる。

   */

  Array.from(

    container.classList,

  ).forEach(

    (

      className,

    ) => {

      if (

        className.startsWith(

          'photo-bg--',

        ) ||

        className.startsWith(

          'custom-bg-',

        )

      ) {

        container.classList.remove(

          className,

        );

      }

    },

  );

  container.classList.add(

    `photo-bg--${backgroundId}`,

  );

}

// ============================================================

// カスタマイズ購読

// ============================================================

function subscribeCustomization() {

  if (

    unsubscribeCustomization

  ) {

    return;

  }

  const unsubscribe =

    Customization.subscribe(

      () => {

        applyBackground();

      },

    );

  if (

    typeof unsubscribe ===

      'function'

  ) {

    unsubscribeCustomization =

      unsubscribe;

  }

}

// ============================================================

// visibilitychange

// ============================================================

function handleVisibilityChange() {

  if (

    document.visibilityState !==

      'visible' ||

    !isOpen() ||

    !isSharedMode

  ) {

    return;

  }

  refreshSharedPhotos({

    rerender:

      true,

    silent:

      true,

  }).catch(

    (

      error,

    ) => {

      console.warn(

        '[photo.js] 復帰時の共有写真更新に失敗しました',

        error,

      );

    },

  );

}

// ============================================================

// 画面構築

// ============================================================

export function build() {

  let container =

    getContainer();

  if (

    container &&

    isBuilt

  ) {

    applyBackground();

    return container;

  }

  if (!container) {

    container =

      createContainer();

  }

  container.replaceChildren();

  const fileInput =

    createFileInput();

  const header =

    createHeader();

  const intro =

    createIntro();

  const status =

    createStatus();

  const main =

    createMain();

  const viewer =

    createViewer();

  container.appendChild(

    fileInput,

  );

  container.appendChild(

    header,

  );

  container.appendChild(

    intro,

  );

  container.appendChild(

    status,

  );

  container.appendChild(

    main,

  );

  container.appendChild(

    viewer,

  );

  registerFileInputListener();

  registerAddLabelKeyboard();

  subscribeCustomization();

  applyBackground();

  document.addEventListener(

    'visibilitychange',

    handleVisibilityChange,

  );

  isBuilt =

    true;

  return container;

}

// ============================================================

// Router互換 create

// ============================================================

export function create() {

  return build();

}

// ============================================================

// 初期化

// ============================================================

export function init() {

  return build();

}

// ============================================================

// 写真画面を開く

// ============================================================

export async function open() {

  const container =

    build();

  container.classList.add(

    'is-open',

  );

  container.setAttribute(

    'aria-hidden',

    'false',

  );

  applyBackground();

  clearStatus();

  updateSharedMode();

  try {

    if (

      isSharedMode

    ) {

      setStatus(

        '共有写真を読み込み中…',

        'saving',

      );

      await refreshSharedPhotos({

        rerender:

          false,

        silent:

          false,

      });

      clearStatus();

    } else {

      sharedPhotos =

        [];

    }

    await renderGallery();

    startSharedRefreshTimer();

  } catch (error) {

    console.error(

      '[photo.js] 写真画面を開けませんでした',

      error,

    );

    setStatus(

      '写真を読み込めませんでした',

      'error',

    );

    await renderGallery();

  }

}

// ============================================================

// 写真画面を閉じる

// ============================================================

export function close() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  stopSharedRefreshTimer();

  closePreview();

  container.classList.remove(

    'is-open',

  );

  container.setAttribute(

    'aria-hidden',

    'true',

  );

}

// ============================================================

// 表示状態

// ============================================================

export function isOpen() {

  const container =

    getContainer();

  return Boolean(

    container &&

      container.classList.contains(

        'is-open',

      ),

  );

}

// ============================================================

// 再描画

// ============================================================

export async function refresh() {

  if (!isBuilt) {

    return;

  }

  applyBackground();

  updateSharedMode();

  if (

    isSharedMode

  ) {

    await refreshSharedPhotos({

      rerender:

        false,

      silent:

        true,

    });

  }

  await renderGallery();

}

// ============================================================

// 破棄

// ============================================================

export function destroy() {

  stopSharedRefreshTimer();

  closePreview();

  revokeAllObjectUrls();

  document.removeEventListener(

    'visibilitychange',

    handleVisibilityChange,

  );

  if (

    typeof unsubscribeCustomization ===

      'function'

  ) {

    try {

      unsubscribeCustomization();

    } catch (error) {

      console.warn(

        '[photo.js] カスタマイズ購読解除に失敗しました',

        error,

      );

    }

  }

  unsubscribeCustomization =

    null;

  sharedPhotos =

    [];

  isSharedMode =

    false;

  databasePromise =

    null;

  isBuilt =

    false;

}

// ============================================================

// Photo API

// ============================================================

const Photo = {

  create,

  init,

  build,

  open,

  close,

  isOpen,

  refresh,

  selectPhotos,

  openPreview,

  openPreviewFromTarget,

  closePreview,

  getPhotoUrlFromTarget,

  getPhotoIdFromTarget,

  deletePhoto,

  deletePhotoFromTarget,

  deleteSharedPhotoFromTarget,

  destroy,

};

export default Photo;