// ============================================================
// workspace.js
// Workspace画面（旧Secret Home。パスコード入力成立後に表示されるホーム画面）の
// DOM生成・開閉・鑑賞モードUIを管理するモジュール。
//
// 「パスコードが合っているか」の判定（passcode.js）や、画面遷移の調整
// （router.js）はここでは一切行わない。あくまでこの画面自体のDOM操作
// だけを担当する（secret-home.jsから続く設計方針）。
//
// カードの表示名・アイコン・並び順・Workspaceタイトルは、
// customization.js（Firestore共有、ペアリング相手と同期される）の
// 値で上書きできる。上書きが無ければ以下のDEFAULT_CARD_DEFINITIONSの
// 内容がそのまま使われる。
// ============================================================

import Customization from './customization.js';

/** WorkspaceのDOMを差し込む先のコンテナのid（index.htmlに静的に用意済み） */
const CONTAINER_ID = 'workspace';

/**
 * 常に一番最後に固定表示する、カスタマイズ対象外の設定カード。
 * カードの既定の定義（表示ラベル・アイコン・並び順）自体は
 * customization.jsのDEFAULT_CARD_DEFINITIONSが唯一の定義元であり、
 * ここでは重複して持たない（app.jsの設定画面側のカード編集UIも
 * 同じ定義を参照する）。
 */
const SETTINGS_CARD = Object.freeze({ key: 'settings', label: '設定', icon: '⚙️' });

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/** customization.jsの購読解除関数。 */
let unsubscribeCustomization = null;

/**
 * コンテナ要素（#workspace）を取得する。
 * @returns {HTMLElement|null}
 */
function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

/**
 * customization.jsのgetEffectiveCards()（表示名・アイコン・並び順の
 * 上書きをマージ済みの一覧）に、カスタマイズ対象外の設定カードを
 * 最後に1枚追加して返す。
 * @returns {{key: string, label: string, icon: string}[]}
 */
function getEffectiveCards() {
  const merged = Customization.getEffectiveCards();
  merged.push(SETTINGS_CARD);

  return merged;
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
  title.id = 'workspaceTitle';
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
 * 現在のカスタマイズ内容にもとづき、カード一覧（main要素の中身）を
 * 作り直す。create()時の初回描画だけでなく、customization.jsからの
 * 変更通知のたびにも呼ばれる。
 */
function renderCards() {
  const main = document.getElementById('workspaceMain');
  if (!main) return;

  const fragment = document.createDocumentFragment();
  getEffectiveCards().forEach((definition) => {
    fragment.appendChild(createCard(definition));
  });
  main.replaceChildren(fragment);
}

/** 現在のWorkspaceタイトル（未設定ならデフォルト「Workspace」）を反映する。 */
function renderTitle() {
  const titleEl = document.getElementById('workspaceTitle');
  if (!titleEl) return;

  const customTitle = Customization.getCached().workspaceTitle;
  titleEl.textContent = customTitle ?? 'Workspace';
}

/** 現在の背景プリセットをWorkspace画面へ反映する。 */
function renderBackground() {
  const container = getContainer();
  if (!container) return;

  const presetId = Customization.getCached().backgrounds?.workspace;
  Customization.applyBackgroundClass(container, 'workspace', presetId);
}

/**
 * カード一覧（main要素、まだ中身は空）を作る。
 * @returns {HTMLElement}
 */
function createMain() {
  const main = document.createElement('main');
  main.id = 'workspaceMain';
  main.className = 'workspace-main';
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
 * customization.jsを購読し、タイトル・カード・背景が変わるたびに
 * 該当箇所だけを再描画する（Workspaceを開いていなくても、購読自体は
 * create()の時点から継続する）。
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

  if (unsubscribeCustomization) unsubscribeCustomization();
  unsubscribeCustomization = Customization.subscribe(() => {
    renderTitle();
    renderCards();
    renderBackground();
  });

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