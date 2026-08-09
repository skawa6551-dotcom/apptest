// ============================================================

// photo.js

// Workspace内「写真」画面を管理するモジュール。

//

// 【担当するもの】

// ・写真画面のDOM生成

// ・画面の開閉

// ・写真一覧の描画

// ・写真追加UI

// ・写真プレビュー

// ・背景カスタマイズの反映

//

// 【担当しないもの】

// ・Workspace⇔写真の画面遷移 → router.js

// ・クリックイベントの解釈 → app.js

// ・共有写真のFirestore保存 → 後続工程

//

// Phase1では、まず写真画面そのものを完成させる。

// ============================================================

import Customization from './customization.js';

/** 写真画面コンテナID */

const CONTAINER_ID = 'photo';

/** 二重生成防止 */

let isBuilt = false;

/** customization.js購読解除関数 */

let unsubscribeCustomization = null;

/**

 * 現在プレビュー中のObject URL。

 * 新しい画像を開くとき／画面を閉じるときに解放する。

 */

let currentPreviewObjectUrl = null;

/* ------------------------------------------------------------

   コンテナ

   ------------------------------------------------------------ */

/**

 * #photo を取得する。

 * @returns {HTMLElement|null}

 */

function getContainer() {

  return document.getElementById(

    CONTAINER_ID,

  );

}

/**

 * 写真画面のコンテナを作成する。

 * @returns {HTMLElement}

 */

function createContainer() {

  const container =

    document.createElement('div');

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

/* ------------------------------------------------------------

   ヘッダー

   ------------------------------------------------------------ */

/**

 * 戻る / 写真 / ロック

 * のヘッダーを作成する。

 *

 * @returns {HTMLElement}

 */

function createHeader() {

  const header =

    document.createElement(

      'header',

    );

  header.className =

    'photo-header';

  // 戻る

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

    '戻る',

  );

  backButton.textContent =

    '‹';

  // タイトル

  const title =

    document.createElement(

      'h2',

    );

  title.className =

    'photo-title';

  title.textContent =

    '写真';

  // ロック

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

/* ------------------------------------------------------------

   上部説明

   ------------------------------------------------------------ */

/**

 * 写真画面上部の説明部分を作る。

 *

 * @returns {HTMLElement}

 */

function createIntro() {

  const section =

    document.createElement(

      'section',

    );

  section.className =

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

  // 写真追加ボタン

  const addButton =

    document.createElement(

      'button',

    );

  addButton.type =

    'button';

  addButton.className =

    'photo-add-btn';

  addButton.dataset.action =

    'select-photo';

  addButton.setAttribute(

    'aria-label',

    '写真を追加',

  );

  addButton.textContent =

    '＋';

  section.appendChild(

    textWrap,

  );

  section.appendChild(

    addButton,

  );

  return section;

}

/* ------------------------------------------------------------

   写真選択input

   ------------------------------------------------------------ */

/**

 * iPhoneの写真ライブラリを開くための

 * 非表示inputを作る。

 *

 * @returns {HTMLInputElement}

 */

function createFileInput() {

  const input =

    document.createElement(

      'input',

    );

  input.type =

    'file';

  input.id =

    'photoFileInput';

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

/* ------------------------------------------------------------

   写真グリッド

   ------------------------------------------------------------ */

/**

 * 写真一覧のグリッドを作る。

 *

 * @returns {HTMLElement}

 */

function createGrid() {

  const grid =

    document.createElement(

      'main',

    );

  grid.id =

    'photoGrid';

  grid.className =

    'photo-grid';

  return grid;

}

/* ------------------------------------------------------------

   空状態

   ------------------------------------------------------------ */

/**

 * 写真がまだ無い場合の表示を作る。

 *

 * @returns {HTMLElement}

 */

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

    'photo-empty-description';

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

/* ------------------------------------------------------------

   写真プレビュー

   ------------------------------------------------------------ */

/**

 * 写真を拡大表示するプレビュー画面を作る。

 *

 * @returns {HTMLElement}

 */

function createPreview() {

  const preview =

    document.createElement(

      'div',

    );

  preview.id =

    'photoPreview';

  preview.className =

    'photo-preview';

  preview.setAttribute(

    'aria-hidden',

    'true',

  );

  // 閉じるボタン

  const closeButton =

    document.createElement(

      'button',

    );

  closeButton.type =

    'button';

  closeButton.className =

    'photo-preview-close';

  closeButton.dataset.action =

    'close-photo-preview';

  closeButton.setAttribute(

    'aria-label',

    '写真を閉じる',

  );

  closeButton.textContent =

    '×';

  // 拡大画像

  const image =

    document.createElement(

      'img',

    );

  image.id =

    'photoPreviewImage';

  image.className =

    'photo-preview-image';

  image.alt =

    '選択した写真';

  preview.appendChild(

    closeButton,

  );

  preview.appendChild(

    image,

  );

  return preview;

}

/* ------------------------------------------------------------

   1枚分の写真

   ------------------------------------------------------------ */

/**

 * 選択されたFileから写真カードを作る。

 *

 * @param {File} file

 * @returns {HTMLElement|null}

 */

function createPhotoItem(

  file,

) {

  if (

    !(file instanceof File) ||

    !file.type.startsWith(

      'image/',

    )

  ) {

    return null;

  }

  const objectUrl =

    URL.createObjectURL(

      file,

    );

  const button =

    document.createElement(

      'button',

    );

  button.type =

    'button';

  button.className =

    'photo-item';

  button.dataset.action =

    'open-photo-preview';

  button.dataset.photoUrl =

    objectUrl;

  button.setAttribute(

    'aria-label',

    file.name

      ? `${file.name}を表示`

      : '写真を表示',

  );

  const image =

    document.createElement(

      'img',

    );

  image.className =

    'photo-item-image';

  image.src =

    objectUrl;

  image.alt =

    file.name || '写真';

  image.loading =

    'lazy';

  button.appendChild(

    image,

  );

  return button;

}

/* ------------------------------------------------------------

   空状態の表示切替

   ------------------------------------------------------------ */

/**

 * 写真が1枚以上ある場合は空状態を隠す。

 */

function updateEmptyState() {

  const grid =

    document.getElementById(

      'photoGrid',

    );

  const empty =

    document.getElementById(

      'photoEmptyState',

    );

  if (

    !grid ||

    !empty

  ) {

    return;

  }

  const hasPhotos =

    grid.querySelector(

      '.photo-item',

    ) !== null;

  empty.hidden =

    hasPhotos;

}

/* ------------------------------------------------------------

   写真選択

   ------------------------------------------------------------ */

/**

 * iPhoneの写真選択画面を開く。

 */

export function selectPhotos() {

  const input =

    document.getElementById(

      'photoFileInput',

    );

  if (!input) return;

  /*

   * 同じ写真を続けて選んだ場合でも

   * changeイベントが発火するように、

   * 選択前にvalueを空にする。

   */

  input.value =

    '';

  input.click();

}

/**

 * file inputで選択された写真を

 * グリッドへ追加する。

 *

 * Phase1では端末メモリ上だけに保持する。

 * Firestore / Storage共有は後続工程で追加する。

 *

 * @param {FileList|File[]} files

 */

export function addSelectedPhotos(

  files,

) {

  const grid =

    document.getElementById(

      'photoGrid',

    );

  if (

    !grid ||

    !files

  ) {

    return;

  }

  const fragment =

    document.createDocumentFragment();

  Array.from(

    files,

  ).forEach(

    (file) => {

      const item =

        createPhotoItem(

          file,

        );

      if (item) {

        fragment.appendChild(

          item,

        );

      }

    },

  );

  grid.appendChild(

    fragment,

  );

  updateEmptyState();

}

/* ------------------------------------------------------------

   プレビューを開く

   ------------------------------------------------------------ */

/**

 * 指定されたObject URLの写真を

 * 全画面プレビューで表示する。

 *

 * @param {string} objectUrl

 */

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

  const preview =

    document.getElementById(

      'photoPreview',

    );

  const image =

    document.getElementById(

      'photoPreviewImage',

    );

  if (

    !preview ||

    !image

  ) {

    return;

  }

  currentPreviewObjectUrl =

    objectUrl;

  image.src =

    objectUrl;

  preview.classList.add(

    'is-open',

  );

  preview.setAttribute(

    'aria-hidden',

    'false',

  );

}

/* ------------------------------------------------------------

   プレビューを閉じる

   ------------------------------------------------------------ */

/**

 * 写真プレビューを閉じる。

 *

 * 写真グリッドでも同じObject URLを使用しているため、

 * ここではURL.revokeObjectURL()は実行しない。

 */

export function closePreview() {

  const preview =

    document.getElementById(

      'photoPreview',

    );

  const image =

    document.getElementById(

      'photoPreviewImage',

    );

  if (preview) {

    preview.classList.remove(

      'is-open',

    );

    preview.setAttribute(

      'aria-hidden',

      'true',

    );

  }

  if (image) {

    image.removeAttribute(

      'src',

    );

  }

  currentPreviewObjectUrl =

    null;

}

/* ------------------------------------------------------------

   Object URL解放

   ------------------------------------------------------------ */

/**

 * 写真グリッド内で使用している

 * Object URLをすべて解放する。

 *

 * 現在は画面を閉じても写真一覧を残すため

 * 通常のclose()では呼ばない。

 *

 * 将来、写真一覧を再構築するときや

 * destroy()を追加した場合に利用できる。

 */

function revokeAllPhotoUrls() {

  const grid =

    document.getElementById(

      'photoGrid',

    );

  if (!grid) return;

  const items =

    grid.querySelectorAll(

      '.photo-item[data-photo-url]',

    );

  items.forEach(

    (item) => {

      const url =

        item.dataset.photoUrl;

      if (url) {

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

      }

    },

  );

  currentPreviewObjectUrl =

    null;

}

/* ------------------------------------------------------------

   背景反映

   ------------------------------------------------------------ */

/**

 * customization.jsの現在値から

 * 写真画面の背景を反映する。

 */

function renderBackground() {

  const container =

    getContainer();

  if (!container) return;

  const presetId =

    Customization

      .getCached()

      .backgrounds

      ?.photo;

  Customization.applyBackgroundClass(

    container,

    'photo',

    presetId,

  );

}

/* ------------------------------------------------------------

   file inputイベント

   ------------------------------------------------------------ */

/**

 * 写真選択input専用のchangeイベントを登録する。

 */

function registerFileInputListener() {

  const input =

    document.getElementById(

      'photoFileInput',

    );

  if (!input) return;

  input.addEventListener(

    'change',

    () => {

      if (

        !input.files ||

        input.files.length === 0

      ) {

        return;

      }

      addSelectedPhotos(

        input.files,

      );

    },

  );

}

/* ------------------------------------------------------------

   外部から背景再反映

   ------------------------------------------------------------ */

export function refreshCustomization() {

  renderBackground();

}

/* ------------------------------------------------------------

   初期構築

   ------------------------------------------------------------ */

export function create() {

  if (isBuilt) {

    return;

  }

  const container =

    getContainer() ??

    createContainer();

  const fragment =

    document.createDocumentFragment();

  fragment.appendChild(

    createHeader(),

  );

  fragment.appendChild(

    createIntro(),

  );

  fragment.appendChild(

    createFileInput(),

  );

  const grid =

    createGrid();

  grid.appendChild(

    createEmptyState(),

  );

  fragment.appendChild(

    grid,

  );

  fragment.appendChild(

    createPreview(),

  );

  container.replaceChildren(

    fragment,

  );

  renderBackground();

  registerFileInputListener();

  if (

    unsubscribeCustomization

  ) {

    unsubscribeCustomization();

  }

  unsubscribeCustomization =

    Customization.subscribe(

      () => {

        renderBackground();

      },

    );

  isBuilt =

    true;

}

/* ------------------------------------------------------------

   開く

   ------------------------------------------------------------ */

export function open() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  /*

   * 設定変更直後でも

   * 最新背景を確実に反映する。

   */

  renderBackground();

  container.classList.add(

    'is-open',

  );

  container.setAttribute(

    'aria-hidden',

    'false',

  );

  container.scrollTop =

    0;

  window.requestAnimationFrame(

    () => {

      renderBackground();

    },

  );

}

/* ------------------------------------------------------------

   閉じる

   ------------------------------------------------------------ */

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

  container.scrollTop =

    0;

}

/* ------------------------------------------------------------

   開いているか

   ------------------------------------------------------------ */

export function isOpen() {

  const container =

    getContainer();

  return container

    ? container.classList.contains(

        'is-open',

      )

    : false;

}

/* ------------------------------------------------------------

   data-action補助

   ------------------------------------------------------------ */

/**

 * app.jsから

 * open-photo-preview の対象URLを取得するときに使う。

 *

 * @param {HTMLElement} target

 * @returns {string}

 */

export function getPhotoUrlFromTarget(

  target,

) {

  if (

    !(target instanceof HTMLElement)

  ) {

    return '';

  }

  return (

    target.dataset.photoUrl ??

    ''

  );

}

/* ------------------------------------------------------------

   写真一覧リセット

   ------------------------------------------------------------ */

/**

 * 現在画面上に表示している写真を

 * すべて削除する。

 *

 * Phase1の写真はObject URLのみなので、

 * 削除時にURLも解放する。

 */

export function clearPhotos() {

  closePreview();

  revokeAllPhotoUrls();

  const grid =

    document.getElementById(

      'photoGrid',

    );

  if (!grid) {

    return;

  }

  grid.replaceChildren(

    createEmptyState(),

  );

  updateEmptyState();

}

/* ------------------------------------------------------------

   default export

   ------------------------------------------------------------ */

const Photo = {

  create,

  open,

  close,

  isOpen,

  selectPhotos,

  addSelectedPhotos,

  openPreview,

  closePreview,

  clearPhotos,

  getPhotoUrlFromTarget,

  refreshCustomization,

};

export default Photo;