// ============================================================

// photo.js

// Calculator 0209

// 写真画面

//

// ・iPhoneから写真を選択

// ・IndexedDBへ写真保存

// ・アプリ再起動後も写真を復元

// ・写真一覧表示

// ・写真プレビュー

// ・写真削除

// ・背景カスタマイズ

//

// iPhone対策：

// ・写真選択は label for="photoFileInput" を使用

// ・file.type が空でも保存対象にする

// ============================================================

import Customization from './customization.js';

// ------------------------------------------------------------

// 画面定数

// ------------------------------------------------------------

const CONTAINER_ID =

  'photo';

const FILE_INPUT_ID =

  'photoFileInput';

// ------------------------------------------------------------

// IndexedDB定数

// ------------------------------------------------------------

const DB_NAME =

  'calculator-0209-photo-db';

const DB_VERSION =

  1;

const PHOTO_STORE_NAME =

  'photos';

// ------------------------------------------------------------

// 状態

// ------------------------------------------------------------

let isBuilt =

  false;

let unsubscribeCustomization =

  null;

let databasePromise =

  null;

const activeObjectUrls =

  new Set();

// ============================================================

// IndexedDBを開く

// ============================================================

function openDatabase() {

  if (databasePromise) {

    return databasePromise;

  }

  databasePromise =

    new Promise(

      (resolve, reject) => {

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

              '[photo.js] IndexedDBの更新がブロックされています',

            );

          };

      },

    );

  return databasePromise;

}

// ============================================================

// 写真ID生成

// ============================================================

function createPhotoId() {

  if (

    'crypto' in window &&

    typeof crypto.randomUUID ===

      'function'

  ) {

    return crypto.randomUUID();

  }

  return [

    Date.now(),

    Math.random()

      .toString(36)

      .slice(2),

  ].join(

    '-',

  );

}

// ============================================================

// 写真1枚を保存

// ============================================================

async function savePhotoFile(

  file,

) {

  /*

   * iPhoneでは写真選択時に

   * file.type が空文字になる場合があるため、

   * MIMEタイプだけでは弾かない。

   */

  if (

    !(file instanceof File)

  ) {

    return null;

  }

  const db =

    await openDatabase();

  const record = {

    id:

      createPhotoId(),

    name:

      file.name ||

      'photo',

    type:

      file.type ||

      'image/jpeg',

    size:

      Number(

        file.size,

      ) || 0,

    createdAt:

      Date.now(),

    blob:

      file,

  };

  return new Promise(

    (resolve, reject) => {

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

              '写真の保存に失敗しました。',

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

              '写真の保存に失敗しました。',

            ),

          );

        };

      transaction.onabort =

        () => {

          reject(

            transaction.error ??

            new Error(

              '写真の保存が中断されました。',

            ),

          );

        };

    },

  );

}

// ============================================================

// 保存済み写真をすべて取得

// ============================================================

async function loadAllPhotos() {

  const db =

    await openDatabase();

  return new Promise(

    (resolve, reject) => {

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

            (a, b) =>

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

              '保存写真の読み込みに失敗しました。',

            ),

          );

        };

    },

  );

}

// ============================================================

// 写真1枚を削除

// ============================================================

async function deletePhotoById(

  photoId,

) {

  if (!photoId) {

    return;

  }

  const db =

    await openDatabase();

  return new Promise(

    (resolve, reject) => {

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

              '写真の削除に失敗しました。',

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

              '写真の削除に失敗しました。',

            ),

          );

        };

    },

  );

}

// ============================================================

// 全写真を削除

// ============================================================

async function deleteAllPhotoRecords() {

  const db =

    await openDatabase();

  return new Promise(

    (resolve, reject) => {

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

        store.clear();

      request.onerror =

        () => {

          reject(

            request.error ??

            new Error(

              '全写真の削除に失敗しました。',

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

              '全写真の削除に失敗しました。',

            ),

          );

        };

    },

  );

}

// ============================================================

// コンテナ取得

// ============================================================

function getContainer() {

  return document.getElementById(

    CONTAINER_ID,

  );

}

// ============================================================

// コンテナ作成

// ============================================================

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

   * iPhone対策：

   * JavaScriptのinput.click()ではなく

   * label for="photoFileInput" を使う。

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

    'photoGallery';

  gallery.className =

    'photo-gallery';

  main.appendChild(

    gallery,

  );

  return main;

}

// ============================================================

// 空状態

// ============================================================

function createEmptyState() {

  const empty =

    document.createElement(

      'div',

    );

  empty.id =

    'photoEmptyState';

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

    '＋をタップして写真を追加';

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

// ローディング表示

// ============================================================

function createLoadingState() {

  const loading =

    document.createElement(

      'div',

    );

  loading.id =

    'photoLoadingState';

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

// Object URL管理

// ============================================================

function revokeAllObjectUrls() {

  activeObjectUrls.forEach(

    (url) => {

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

// 写真カード生成

// ============================================================

function createPhotoCard(

  record,

) {

  if (

    !record ||

    !record.id ||

    !(record.blob instanceof Blob)

  ) {

    return null;

  }

  const objectUrl =

    URL.createObjectURL(

      record.blob,

    );

  activeObjectUrls.add(

    objectUrl,

  );

  const card =

    document.createElement(

      'div',

    );

  card.className =

    'photo-card';

  card.dataset.photoId =

    record.id;

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

    objectUrl;

  openButton.dataset.photoId =

    record.id;

  openButton.setAttribute(

    'aria-label',

    record.name

      ? `${record.name}を開く`

      : '写真を開く',

  );

  const image =

    document.createElement(

      'img',

    );

  image.className =

    'photo-card-image';

  image.src =

    objectUrl;

  image.alt =

    record.name ||

    '写真';

  image.loading =

    'lazy';

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

      record.createdAt,

    );

  const deleteButton =

    document.createElement(

      'button',

    );

  deleteButton.type =

    'button';

  deleteButton.className =

    'photo-delete-btn';

  deleteButton.dataset.action =

    'delete-photo';

  deleteButton.dataset.photoId =

    record.id;

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

// 日付表示

// ============================================================

function formatPhotoDate(

  timestamp,

) {

  const date =

    new Date(

      Number(timestamp) ||

      Date.now(),

    );

  const year =

    date.getFullYear();

  const month =

    String(

      date.getMonth() + 1,

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

// ギャラリー描画

// ============================================================

async function renderGallery() {

  const gallery =

    document.getElementById(

      'photoGallery',

    );

  if (!gallery) {

    return;

  }

  gallery.replaceChildren(

    createLoadingState(),

  );

  revokeAllObjectUrls();

  try {

    const records =

      await loadAllPhotos();

    if (

      records.length === 0

    ) {

      gallery.replaceChildren(

        createEmptyState(),

      );

      return;

    }

    const fragment =

      document.createDocumentFragment();

    records.forEach(

      (record) => {

        const card =

          createPhotoCard(

            record,

          );

        if (card) {

          fragment.appendChild(

            card,

          );

        }

      },

    );

    gallery.replaceChildren(

      fragment,

    );

  } catch (error) {

    console.error(

      '[photo.js] 写真一覧の読み込みに失敗しました',

      error,

    );

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

      'アプリを開き直してもう一度お試しください';

    errorState.appendChild(

      title,

    );

    errorState.appendChild(

      description,

    );

    gallery.replaceChildren(

      errorState,

    );

  }

}

// ============================================================

// 選択された写真を保存

// ============================================================

async function handleSelectedFiles(

  files,

) {

  if (

    !files ||

    files.length === 0

  ) {

    return;

  }

  /*

   * iPhone対策：

   * file.type が空でも File であれば保存対象にする。

   */

  const imageFiles =

    Array.from(

      files,

    ).filter(

      (file) =>

        file instanceof File,

    );

  if (

    imageFiles.length === 0

  ) {

    return;

  }

  try {

    for (

      const file of

      imageFiles

    ) {

      await savePhotoFile(

        file,

      );

    }

    await renderGallery();

  } catch (error) {

    console.error(

      '[photo.js] 写真の保存に失敗しました',

      error,

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

    return;

  }

  input.addEventListener(

    'change',

    async () => {

      const files =

        input.files

          ? Array.from(

              input.files,

            )

          : [];

      /*

       * 同じ写真を連続で選んでも

       * changeイベントが発火できるようにする。

       */

      input.value =

        '';

      await handleSelectedFiles(

        files,

      );

    },

  );

}

// ============================================================

// ＋ラベルのキーボード操作

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

    (event) => {

      if (

        event.key !==

          'Enter' &&

        event.key !==

          ' '

      ) {

        return;

      }

      event.preventDefault();

      const input =

        document.getElementById(

          FILE_INPUT_ID,

        );

      if (input) {

        input.click();

      }

    },

  );

}

// ============================================================

// プレビュー生成

// ============================================================

function createViewer() {

  const viewer =

    document.createElement(

      'div',

    );

  viewer.id =

    'photoViewer';

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

    'photoViewerImage';

  image.className =

    'photo-viewer-image';

  image.alt =

    '選択した写真';

  const date =

    document.createElement(

      'div',

    );

  date.id =

    'photoViewerDate';

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

// プレビューを開く

// ============================================================

export function openPreview(

  objectUrl,

) {

  if (

    typeof objectUrl !==

      'string' ||

    objectUrl === ''

  ) {

    return;

  }

  const viewer =

    document.getElementById(

      'photoViewer',

    );

  const image =

    document.getElementById(

      'photoViewerImage',

    );

  if (

    !viewer ||

    !image

  ) {

    return;

  }

  image.src =

    objectUrl;

  viewer.classList.add(

    'is-open',

  );

  viewer.setAttribute(

    'aria-hidden',

    'false',

  );

}

// ============================================================

// プレビュー日付

// ============================================================

function setPreviewDateFromTarget(

  target,

) {

  const dateLabel =

    document.getElementById(

      'photoViewerDate',

    );

  if (!dateLabel) {

    return;

  }

  const card =

    target.closest(

      '.photo-card',

    );

  const cardDate =

    card?.querySelector(

      '.photo-card-date',

    );

  dateLabel.textContent =

    cardDate?.textContent ??

    '';

}

// ============================================================

// プレビューを閉じる

// ============================================================

export function closePreview() {

  const viewer =

    document.getElementById(

      'photoViewer',

    );

  const image =

    document.getElementById(

      'photoViewerImage',

    );

  const dateLabel =

    document.getElementById(

      'photoViewerDate',

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

// ターゲットから写真URL取得

// ============================================================

export function getPhotoUrlFromTarget(

  target,

) {

  if (

    !(target instanceof HTMLElement)

  ) {

    return '';

  }

  const owner =

    target.closest(

      '[data-photo-url]',

    );

  return owner?.dataset.photoUrl ??

    '';

}

// ============================================================

// ターゲットから写真ID取得

// ============================================================

export function getPhotoIdFromTarget(

  target,

) {

  if (

    !(target instanceof HTMLElement)

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

// ターゲットからプレビューを開く

// ============================================================

export function openPreviewFromTarget(

  target,

) {

  const objectUrl =

    getPhotoUrlFromTarget(

      target,

    );

  if (!objectUrl) {

    return;

  }

  setPreviewDateFromTarget(

    target,

  );

  openPreview(

    objectUrl,

  );

}

// ============================================================

// 写真1枚削除

// ============================================================

export async function deletePhoto(

  photoId,

) {

  if (!photoId) {

    return;

  }

  try {

    await deletePhotoById(

      photoId,

    );

    await renderGallery();

  } catch (error) {

    console.error(

      '[photo.js] 写真の削除に失敗しました',

      error,

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

  if (!photoId) {

    return;

  }

  const confirmed =

    window.confirm(

      'この写真を削除しますか？',

    );

  if (!confirmed) {

    return;

  }

  await deletePhoto(

    photoId,

  );

}

// ============================================================

// 全写真削除

// ============================================================

export async function deleteAllPhotos() {

  const confirmed =

    window.confirm(

      '保存している写真をすべて削除しますか？',

    );

  if (!confirmed) {

    return;

  }

  try {

    closePreview();

    await deleteAllPhotoRecords();

    await renderGallery();

  } catch (error) {

    console.error(

      '[photo.js] 全写真の削除に失敗しました',

      error,

    );

  }

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

      '[photo.js] 写真選択inputが見つかりません',

    );

    return;

  }

  input.click();

}

// ============================================================

// 背景カスタマイズ

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

   * 過去に付けた背景クラスを削除。

   */

  Array.from(

    container.classList,

  ).forEach(

    (className) => {

      if (

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

    `custom-bg-${backgroundId}`,

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

// 写真画面構築

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

    main,

  );

  container.appendChild(

    viewer,

  );

  registerFileInputListener();

  registerAddLabelKeyboard();

  subscribeCustomization();

  applyBackground();

  isBuilt =

    true;

  return container;

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

  await renderGallery();

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

// 写真画面表示状態

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

  await renderGallery();

}

// ============================================================

// Router互換用 create

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

// 破棄

// ============================================================

export function destroy() {

  closePreview();

  revokeAllObjectUrls();

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

  deleteAllPhotos,

};

export default Photo;