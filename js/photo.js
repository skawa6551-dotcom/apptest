// ============================================================

// photo.js

// Workspace内「写真」画面

//

// ・写真画面DOM生成

// ・写真選択

// ・写真一覧表示

// ・写真拡大表示

// ・背景カスタマイズ

//

// 写真データの共有保存は後続工程で実装する。

// 現段階では選択した写真を端末メモリ上で表示する。

// ============================================================

import Customization from './customization.js';

// ------------------------------------------------------------

// 定数

// ------------------------------------------------------------

const CONTAINER_ID =

  'photo';

// ------------------------------------------------------------

// 状態

// ------------------------------------------------------------

let isBuilt =

  false;

let unsubscribeCustomization =

  null;

/**

 * 現在作成しているObject URL。

 * 写真一覧を削除する際に解放する。

 */

const photoObjectUrls =

  new Set();

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

  // ＋ボタン

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

  intro.appendChild(

    textWrap,

  );

  intro.appendChild(

    addButton,

  );

  return intro;

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

  // 写真一覧

  const gallery =

    document.createElement(

      'div',

    );

  gallery.id =

    'photoGallery';

  gallery.className =

    'photo-gallery';

  // 空状態

  gallery.appendChild(

    createEmptyState(),

  );

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

// 写真カード

// ============================================================

function createPhotoCard(

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

  photoObjectUrls.add(

    objectUrl,

  );

  const card =

    document.createElement(

      'button',

    );

  card.type =

    'button';

  card.className =

    'photo-card';

  card.dataset.action =

    'open-photo-preview';

  card.dataset.photoUrl =

    objectUrl;

  card.setAttribute(

    'aria-label',

    file.name

      ? `${file.name}を開く`

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

    file.name ||

    '写真';

  image.loading =

    'lazy';

  card.appendChild(

    image,

  );

  return card;

}

// ============================================================

// 空状態更新

// ============================================================

function updateEmptyState() {

  const gallery =

    document.getElementById(

      'photoGallery',

    );

  const empty =

    document.getElementById(

      'photoEmptyState',

    );

  if (

    !gallery ||

    !empty

  ) {

    return;

  }

  const hasPhoto =

    gallery.querySelector(

      '.photo-card',

    ) !== null;

  empty.hidden =

    hasPhoto;

}

// ============================================================

// 写真選択

// ============================================================

export function selectPhotos() {

  const input =

    document.getElementById(

      'photoFileInput',

    );

  if (!input) {

    return;

  }

  input.value =

    '';

  input.click();

}

// ============================================================

// 選択写真追加

// ============================================================

export function addSelectedPhotos(

  files,

) {

  const gallery =

    document.getElementById(

      'photoGallery',

    );

  if (

    !gallery ||

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

      const card =

        createPhotoCard(

          file,

        );

      if (card) {

        fragment.appendChild(

          card,

        );

      }

    },

  );

  gallery.appendChild(

    fragment,

  );

  updateEmptyState();

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

  viewer.appendChild(

    closeButton,

  );

  viewer.appendChild(

    image,

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

}

// ============================================================

// 写真URL取得

// ============================================================

export function getPhotoUrlFromTarget(

  target,

) {

  if (

    !(target instanceof HTMLElement)

  ) {

    return '';

  }

  return target.dataset.photoUrl ??

    '';

}

// ============================================================

// file inputイベント

// ============================================================

function registerFileInputListener() {

  const input =

    document.getElementById(

      'photoFileInput',

    );

  if (!input) {

    return;

  }

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

// ============================================================

// 背景反映

// ============================================================

function renderBackground() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

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

// ============================================================

// 外部から背景再反映

// ============================================================

export function refreshCustomization() {

  renderBackground();

}

// ============================================================

// 写真一覧クリア

// ============================================================

export function clearPhotos() {

  closePreview();

  photoObjectUrls.forEach(

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

  photoObjectUrls.clear();

  const gallery =

    document.getElementById(

      'photoGallery',

    );

  if (!gallery) {

    return;

  }

  gallery.replaceChildren(

    createEmptyState(),

  );

  updateEmptyState();

}

// ============================================================

// 初期構築

// ============================================================

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

  fragment.appendChild(

    createMain(),

  );

  fragment.appendChild(

    createViewer(),

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

// ============================================================

// 開く

// ============================================================

export function open() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

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

}

// ============================================================

// 閉じる

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

  container.scrollTop =

    0;

}

// ============================================================

// 開いているか

// ============================================================

export function isOpen() {

  const container =

    getContainer();

  return container

    ? container.classList.contains(

        'is-open',

      )

    : false;

}

// ============================================================

// default export

// ============================================================

const Photo = {

  create,

  open,

  close,

  isOpen,

  selectPhotos,

  addSelectedPhotos,

  openPreview,

  closePreview,

  getPhotoUrlFromTarget,

  clearPhotos,

  refreshCustomization,

};

export default Photo;