// ============================================================

// workspace.js

// Workspace画面のDOM生成・開閉・鑑賞モードUI・

// カスタマイズ反映を担当するモジュール。

// ============================================================

import Customization from './customization.js';

// ------------------------------------------------------------

// 定数

// ------------------------------------------------------------

const CONTAINER_ID = 'workspace';

const SETTINGS_CARD = Object.freeze({

  key: 'settings',

  label: '設定',

  icon: '⚙️',

});

// ------------------------------------------------------------

// 状態

// ------------------------------------------------------------

let isBuilt = false;

let unsubscribeCustomization = null;

// ------------------------------------------------------------

// DOM取得

// ------------------------------------------------------------

function getContainer() {

  return document.getElementById(

    CONTAINER_ID,

  );

}

// ------------------------------------------------------------

// カード定義

// ------------------------------------------------------------

function getEffectiveCards() {

  const merged =

    Customization.getEffectiveCards();

  merged.push(

    SETTINGS_CARD,

  );

  return merged;

}

// ------------------------------------------------------------

// ヘッダー生成

// ------------------------------------------------------------

function createHeader() {

  const header =

    document.createElement(

      'header',

    );

  header.className =

    'workspace-header';

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

    'close-workspace';

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

  title.id =

    'workspaceTitle';

  title.className =

    'workspace-title';

  title.textContent =

    'Workspace';

  // 右側操作

  const actions =

    document.createElement(

      'div',

    );

  actions.className =

    'workspace-header-actions';

  // 鑑賞モード

  const viewModeButton =

    document.createElement(

      'button',

    );

  viewModeButton.type =

    'button';

  viewModeButton.className =

    'icon-btn';

  viewModeButton.id =

    'viewModeToggleBtn';

  viewModeButton.dataset.action =

    'toggle-view-mode';

  viewModeButton.setAttribute(

    'aria-label',

    '閲覧モード',

  );

  viewModeButton.textContent =

    '👁';

  // 即時ロック

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

  actions.appendChild(

    viewModeButton,

  );

  actions.appendChild(

    lockButton,

  );

  header.appendChild(

    backButton,

  );

  header.appendChild(

    title,

  );

  header.appendChild(

    actions,

  );

  return header;

}

// ------------------------------------------------------------

// カード生成

// ------------------------------------------------------------

function createCard(

  definition,

) {

  const card =

    document.createElement(

      'button',

    );

  card.type =

    'button';

  card.className =

    'workspace-card';

  card.dataset.secret =

    definition.key;

  const icon =

    document.createElement(

      'span',

    );

  icon.className =

    'workspace-card-icon';

  icon.textContent =

    definition.icon;

  const label =

    document.createElement(

      'span',

    );

  label.className =

    'workspace-card-label';

  label.textContent =

    definition.label;

  card.appendChild(

    icon,

  );

  card.appendChild(

    label,

  );

  return card;

}

// ------------------------------------------------------------

// カード一覧再描画

// ------------------------------------------------------------

function renderCards() {

  const main =

    document.getElementById(

      'workspaceMain',

    );

  if (!main) {

    return;

  }

  const fragment =

    document.createDocumentFragment();

  getEffectiveCards().forEach(

    (definition) => {

      fragment.appendChild(

        createCard(

          definition,

        ),

      );

    },

  );

  main.replaceChildren(

    fragment,

  );

}

// ------------------------------------------------------------

// タイトル反映

// ------------------------------------------------------------

function renderTitle() {

  const titleEl =

    document.getElementById(

      'workspaceTitle',

    );

  if (!titleEl) {

    return;

  }

  const customTitle =

    Customization

      .getCached()

      .workspaceTitle;

  titleEl.textContent =

    customTitle ??

    'Workspace';

}

// ------------------------------------------------------------

// 背景反映

// ------------------------------------------------------------

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

      ?.workspace;

  Customization.applyBackgroundClass(

    container,

    'workspace',

    presetId,

  );

  /*

   * iPhone PWAでクラス変更直後に

   * 背景再描画が遅れる場合の対策。

   */

  container.style.display =

    container.classList.contains(

      'is-open',

    )

      ? 'flex'

      : '';

  window.requestAnimationFrame(

    () => {

      container.style.display =

        '';

    },

  );

}

// ------------------------------------------------------------

// Workspace全体のカスタマイズ再反映

// ------------------------------------------------------------

function renderCustomization() {

  renderTitle();

  renderCards();

  renderBackground();

}

// ------------------------------------------------------------

// メイン生成

// ------------------------------------------------------------

function createMain() {

  const main =

    document.createElement(

      'main',

    );

  main.id =

    'workspaceMain';

  main.className =

    'workspace-main';

  return main;

}

// ------------------------------------------------------------

// 鑑賞モード認証パネル生成

// ------------------------------------------------------------

function createViewModeAuthPanel() {

  const panel =

    document.createElement(

      'div',

    );

  panel.id =

    'viewModeAuthPanel';

  panel.className =

    'view-mode-auth';

  const message =

    document.createElement(

      'p',

    );

  message.className =

    'view-mode-auth-message';

  message.textContent =

    'パスコードを入力してください';

  const input =

    document.createElement(

      'input',

    );

  input.type =

    'tel';

  input.inputMode =

    'numeric';

  input.autocomplete =

    'off';

  input.id =

    'viewModeAuthInput';

  input.className =

    'view-mode-auth-input';

  input.maxLength =

    8;

  const actions =

    document.createElement(

      'div',

    );

  actions.className =

    'view-mode-auth-actions';

  const cancelButton =

    document.createElement(

      'button',

    );

  cancelButton.type =

    'button';

  cancelButton.className =

    'view-mode-auth-btn view-mode-auth-btn--cancel';

  cancelButton.dataset.action =

    'cancel-view-mode';

  cancelButton.textContent =

    'キャンセル';

  const confirmButton =

    document.createElement(

      'button',

    );

  confirmButton.type =

    'button';

  confirmButton.className =

    'view-mode-auth-btn view-mode-auth-btn--confirm';

  confirmButton.dataset.action =

    'confirm-view-mode';

  confirmButton.textContent =

    '確認';

  actions.appendChild(

    cancelButton,

  );

  actions.appendChild(

    confirmButton,

  );

  panel.appendChild(

    message,

  );

  panel.appendChild(

    input,

  );

  panel.appendChild(

    actions,

  );

  return panel;

}

// ------------------------------------------------------------

// Workspace構築

// ------------------------------------------------------------

export function create() {

  if (isBuilt) {

    return;

  }

  const container =

    getContainer();

  if (!container) {

    console.warn(

      `[workspace.js] #${CONTAINER_ID} が見つかりません`,

    );

    return;

  }

  const fragment =

    document.createDocumentFragment();

  fragment.appendChild(

    createHeader(),

  );

  fragment.appendChild(

    createMain(),

  );

  fragment.appendChild(

    createViewModeAuthPanel(),

  );

  container.appendChild(

    fragment,

  );

  /*

   * customization.jsの変更を購読。

   *

   * タイトル・カード・背景のどれを変えても

   * Workspace側へ即時反映する。

   */

  if (

    unsubscribeCustomization

  ) {

    unsubscribeCustomization();

  }

  unsubscribeCustomization =

    Customization.subscribe(

      () => {

        renderCustomization();

      },

    );

  /*

   * 念のため初回も明示的に反映。

   */

  renderCustomization();

  isBuilt = true;

}

// ------------------------------------------------------------

// Workspaceを開く

// ------------------------------------------------------------

export function open() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  /*

   * 開く直前にも最新カスタマイズを反映。

   *

   * 設定画面を閉じた直後や

   * iPhone PWAの再描画遅延があっても

   * 最新状態で表示されるようにする。

   */

  renderCustomization();

  container.scrollTop =

    0;

  container.classList.add(

    'is-open',

  );

  container.setAttribute(

    'aria-hidden',

    'false',

  );

  /*

   * iPhone Safari / PWA向けの

   * 再描画補助。

   */

  window.requestAnimationFrame(

    () => {

      renderBackground();

    },

  );

}

// ------------------------------------------------------------

// Workspaceを閉じる

// ------------------------------------------------------------

export function close() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  container.classList.remove(

    'is-open',

  );

  container.setAttribute(

    'aria-hidden',

    'true',

  );

  container.scrollTop =

    0;

  hideViewModeAuth();

  clearViewModeAuthInput();

}

// ------------------------------------------------------------

// 開閉状態

// ------------------------------------------------------------

export function isOpen() {

  const container =

    getContainer();

  return container

    ? container.classList.contains(

        'is-open',

      )

    : false;

}

// ------------------------------------------------------------

// 鑑賞モード認証パネル

// ------------------------------------------------------------

export function showViewModeAuth() {

  const panel =

    document.getElementById(

      'viewModeAuthPanel',

    );

  if (!panel) {

    return;

  }

  panel.classList.add(

    'is-open',

  );

  const input =

    document.getElementById(

      'viewModeAuthInput',

    );

  if (input) {

    window.setTimeout(

      () => {

        input.focus();

      },

      50,

    );

  }

}

export function hideViewModeAuth() {

  const panel =

    document.getElementById(

      'viewModeAuthPanel',

    );

  if (!panel) {

    return;

  }

  panel.classList.remove(

    'is-open',

  );

}

// ------------------------------------------------------------

// 鑑賞モード入力

// ------------------------------------------------------------

export function getViewModeAuthValue() {

  const input =

    document.getElementById(

      'viewModeAuthInput',

    );

  return input

    ? input.value

    : '';

}

export function clearViewModeAuthInput() {

  const input =

    document.getElementById(

      'viewModeAuthInput',

    );

  if (input) {

    input.value =

      '';

  }

}

// ------------------------------------------------------------

// 鑑賞モードON/OFF

// ------------------------------------------------------------

function ensureGlobalViewModeIndicator() {

  let indicator =

    document.getElementById(

      'globalViewModeIndicator',

    );

  if (

    indicator

  ) {

    return indicator;

  }

  indicator =

    document.createElement(

      'div',

    );

  indicator.id =

    'globalViewModeIndicator';

  indicator.className =

    'global-view-mode-indicator';

  indicator.setAttribute(

    'aria-live',

    'polite',

  );

  indicator.setAttribute(

    'aria-hidden',

    'true',

  );

  indicator.innerHTML =

    '<span aria-hidden="true">👁</span><span>閲覧モード</span>';

  document.body.appendChild(

    indicator,

  );

  return indicator;

}

export function setViewModeActive(

  active,

) {

  const button =

    document.getElementById(

      'viewModeToggleBtn',

    );

  const container =

    getContainer();

  if (button) {

    button.classList.toggle(

      'active',

      active,

    );

    button.setAttribute(

      'aria-pressed',

      String(

        active,

      ),

    );

    button.setAttribute(

      'aria-label',

      active

        ? '閲覧モードを終了'

        : '閲覧モードを開始',

    );

  }

  if (container) {

    container.classList.toggle(

      'view-mode',

      active,

    );

  }

  document.body.classList.toggle(

    'global-view-mode-active',

    active,

  );

  const indicator =

    ensureGlobalViewModeIndicator();

  indicator.classList.toggle(

    'is-active',

    active,

  );

  indicator.setAttribute(

    'aria-hidden',

    String(

      !active,

    ),

  );

}

export function isViewModeActive() {

  const container =

    getContainer();

  return container

    ? container.classList.contains(

        'view-mode',

      )

    : false;

}

// ------------------------------------------------------------

// 外部から強制再描画

// ------------------------------------------------------------

export function refreshCustomization() {

  renderCustomization();

}

// ------------------------------------------------------------

// default export

// ------------------------------------------------------------

const Workspace = {

  create,

  open,

  close,

  isOpen,

  showViewModeAuth,

  hideViewModeAuth,

  getViewModeAuthValue,

  clearViewModeAuthInput,

  setViewModeActive,

  isViewModeActive,

  refreshCustomization,

};

export default Workspace;