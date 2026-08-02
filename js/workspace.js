// ============================================================
// workspace.js
// Workspace画面（旧Secret Home。パスコード入力成立後に表示されるホーム画面）の
// DOM生成・開閉・鑑賞モードUIを管理するモジュール。
//
// 「パスコードが合っているか」の判定（passcode.js）や、画面遷移の調整
// （router.js）はここでは一切行わない。あくまでこの画面自体のDOM操作
// だけを担当する（secret-home.jsから続く設計方針）。
// ============================================================

/** WorkspaceのDOMを差し込む先のコンテナのid（index.htmlに静的に用意済み） */
const CONTAINER_ID = 'workspace';

/**
 * カードの定義データ。表示ラベルと data-secret 属性の値の対応表。
 * ここに1件追加するだけでカードが1枚増える。
 * 「チャット」は廃止し、「記録」（Records）に置き換えている。
 */
const CARD_DEFINITIONS = Object.freeze([
  Object.freeze({ label: '記録', key: 'records', icon: '📝' }),
  Object.freeze({ label: 'カレンダー', key: 'calendar', icon: '📅' }),
  Object.freeze({ label: '写真', key: 'photo', icon: '🖼️' }),
  Object.freeze({ label: '行きたい場所', key: 'places', icon: '📍' }),
  Object.freeze({ label: '設定', key: 'settings', icon: '⚙️' }),
]);

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/**
 * コンテナ要素（#workspace）を取得する。
 * @returns {HTMLElement|null}
 */
function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

/**
 * ヘッダー（戻るボタン＋タイトル＋鑑賞モード／ロックボタン）を作る。
 * @returns {HTMLElement}
 */
function createHeader() {
  const header = document.createElement('header');
  header.className = 'workspace-header';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-btn';
  backButton.dataset.action = 'close-workspace';
  backButton.setAttribute('aria-label', '戻る');
  backButton.textContent = '‹';

  const title = document.createElement('h2');
  title.className = 'workspace-title';
  title.textContent = 'Workspace';

  const actions = document.createElement('div');
  actions.className = 'workspace-header-actions';

  const viewModeButton = document.createElement('button');
  viewModeButton.type = 'button';
  viewModeButton.className = 'icon-btn';
  viewModeButton.id = 'viewModeToggleBtn';
  viewModeButton.dataset.action = 'toggle-view-mode';
  viewModeButton.setAttribute('aria-label', '鑑賞モード');
  viewModeButton.textContent = '👁';

  const lockButton = document.createElement('button');
  lockButton.type = 'button';
  lockButton.className = 'icon-btn';
  lockButton.dataset.action = 'lock-now';
  lockButton.setAttribute('aria-label', '今すぐロック');
  lockButton.textContent = '🔒';

  actions.appendChild(viewModeButton);
  actions.appendChild(lockButton);

  header.appendChild(backButton);
  header.appendChild(title);
  header.appendChild(actions);

  return header;
}

/**
 * 1枚分のカード（button要素）を作る。
 * @param {{label: string, key: string, icon: string}} definition
 * @returns {HTMLButtonElement}
 */
function createCard(definition) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'workspace-card';
  card.dataset.secret = definition.key;

  const icon = document.createElement('span');
  icon.className = 'workspace-card-icon';
  icon.textContent = definition.icon;

  const label = document.createElement('span');
  label.className = 'workspace-card-label';
  label.textContent = definition.label;

  card.appendChild(icon);
  card.appendChild(label);

  return card;
}

/**
 * CARD_DEFINITIONSからカード一覧（main要素）を作る。
 * @returns {HTMLElement}
 */
function createMain() {
  const main = document.createElement('main');
  main.className = 'workspace-main';

  const fragment = document.createDocumentFragment();
  CARD_DEFINITIONS.forEach((definition) => {
    fragment.appendChild(createCard(definition));
  });
  main.appendChild(fragment);

  return main;
}

/**
 * 鑑賞モードに入るためのパスコード確認パネルを作る。
 * 通常は非表示（.is-open クラスが付いたときだけ表示する）。
 * @returns {HTMLElement}
 */
function createViewModeAuthPanel() {
  const panel = document.createElement('div');
  panel.id = 'viewModeAuthPanel';
  panel.className = 'view-mode-auth';

  const message = document.createElement('p');
  message.className = 'view-mode-auth-message';
  message.textContent = 'パスコードを入力してください';

  const input = document.createElement('input');
  input.type = 'tel';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.id = 'viewModeAuthInput';
  input.className = 'view-mode-auth-input';
  input.maxLength = 8;

  const actions = document.createElement('div');
  actions.className = 'view-mode-auth-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'view-mode-auth-btn view-mode-auth-btn--cancel';
  cancelButton.dataset.action = 'cancel-view-mode';
  cancelButton.textContent = 'キャンセル';

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'view-mode-auth-btn view-mode-auth-btn--confirm';
  confirmButton.dataset.action = 'confirm-view-mode';
  confirmButton.textContent = '確認';

  actions.appendChild(cancelButton);
  actions.appendChild(confirmButton);

  panel.appendChild(message);
  panel.appendChild(input);
  panel.appendChild(actions);

  return panel;
}

/**
 * #workspace の中身（ヘッダー＋カード一覧＋鑑賞モード認証パネル）を構築する。
 * 既に構築済みの場合は何もしない（二重生成防止）。
 */
export function create() {
  if (isBuilt) return;

  const container = getContainer();
  if (!container) {
    console.warn(`[workspace.js] #${CONTAINER_ID} が見つかりません`);
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(createMain());
  fragment.appendChild(createViewModeAuthPanel());
  container.appendChild(fragment);

  isBuilt = true;
}

/**
 * Workspace画面を表示する。
 */
export function open() {
  const container = getContainer();
  if (!container) return;

  container.scrollTop = 0;
  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');
}

/**
 * Workspace画面を非表示にする。開いたままだった鑑賞モード認証パネルも閉じる。
 */
export function close() {
  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
  container.scrollTop = 0;
  hideViewModeAuth();
  clearViewModeAuthInput();
}

/**
 * Workspace画面が現在開いているかどうかを返す。
 * @returns {boolean}
 */
export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

/** 鑑賞モードのパスコード確認パネルを表示する。 */
export function showViewModeAuth() {
  const panel = document.getElementById('viewModeAuthPanel');
  if (panel) panel.classList.add('is-open');
}

/** 鑑賞モードのパスコード確認パネルを非表示にする。 */
export function hideViewModeAuth() {
  const panel = document.getElementById('viewModeAuthPanel');
  if (panel) panel.classList.remove('is-open');
}

/**
 * 鑑賞モード確認パネルの入力欄の値を取得する。
 * @returns {string}
 */
export function getViewModeAuthValue() {
  const input = document.getElementById('viewModeAuthInput');
  return input ? input.value : '';
}

/** 鑑賞モード確認パネルの入力欄を空にする。 */
export function clearViewModeAuthInput() {
  const input = document.getElementById('viewModeAuthInput');
  if (input) input.value = '';
}

/**
 * 鑑賞モードのON/OFFに応じて👁ボタン・画面全体の見た目を切り替える。
 * @param {boolean} active
 */
export function setViewModeActive(active) {
  const button = document.getElementById('viewModeToggleBtn');
  const container = getContainer();
  if (button) button.classList.toggle('active', active);
  if (container) container.classList.toggle('view-mode', active);
}

/**
 * 現在鑑賞モードが有効かどうかを返す。
 * @returns {boolean}
 */
export function isViewModeActive() {
  const container = getContainer();
  return container ? container.classList.contains('view-mode') : false;
}

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
};

export default Workspace;