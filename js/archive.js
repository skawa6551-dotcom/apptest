// ============================================================
// archive.js
// Workspace内「Archive」画面のDOM生成・開閉・記録一覧表示・検索・
// 背景プリセット切替を管理するモジュール。records.js/calendar.jsと
// 同じ設計方針を踏襲する：
//
//   ・DOM生成・開閉・画面の中身の更新 … このファイル（archive.js）
//   ・画面遷移の調整（Workspace⇔Archive） … router.js
//   ・クリック／入力の解釈・ディスパッチ … app.js
//   ・記録データそのものの永続化 … records.js（Storage経由）
//   ・背景プリセットの選択状態の永続化 … storage.js経由
//
// Archiveは「記録（records.js）で保存された内容を読むだけ」の画面で、
// 記録データを自分で書き込むことはしない（Records.getArchive()を
// 参照するだけ）。
// ============================================================

import Records from './records.js';
import Settings from './settings.js';
import Passcode from './passcode.js';
import Customization from './customization.js';

/** Archive画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'archive';

/*
 * 背景プリセットは、以前はArchive専用（black-gold/dark-navy/glass/
 * abstract）をStorage（端末ごと）へ保存していたが、Phase1.6より
 * customization.jsが持つ共有プリセット（Workspace/メッセージ/
 * カレンダー等と共通の8種類）をFirestore（ペアリング相手と共有）へ
 * 保存する方式に統一した。画面内のスウォッチUI自体は変更していない
 * （二重実装を避けるため、保存先だけを差し替えている）。
 * 旧プリセットidとの対応: black-gold→'default' / dark-navy→'navy' /
 * glass→'black-glass' / abstract→'abstract'（メニュー表示順もこれに揃える）。
 */
const BACKGROUND_PRESETS = Object.freeze([
  Object.freeze({ id: 'default', label: 'デフォルト' }),
  Object.freeze({ id: 'navy', label: 'ネイビー' }),
  Object.freeze({ id: 'black-glass', label: 'ブラックガラス' }),
  Object.freeze({ id: 'abstract', label: '抽象グラデーション' }),
]);

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/** customization.jsの購読解除関数。 */
let unsubscribeCustomization = null;

/**
 * Archiveロック（設定でON時）を、今回の表示セッション中に
 * 解除済みかどうか。close()のたびにfalseへ戻すため、次にArchiveを
 * 開いたときは再度パスコードの入力を求める。
 */
let isUnlockedThisSession = false;

/** 検索欄の現在の絞り込み条件（本文のみ。将来ここに日付・タグ等を追加できる）。 */
let searchFilter = {
  text: '',
};

/**
 * タイムスタンプ（ms）を「YYYY年M月D日 H:MM」の表示用文言に整形する。
 * @param {number} timestamp
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes}`;
}

/**
 * コンテナ要素（#archive）を取得する。
 * @returns {HTMLElement|null}
 */
function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

/**
 * コンテナ要素（#archive）を新規作成し、bodyへ追加する。
 * 静的HTMLにコンテナを用意していないため、records.js/calendar.jsと
 * 同様ここで最初にdivごと作る。
 * @returns {HTMLElement}
 */
function createContainer() {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = 'archive';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);
  return container;
}

/**
 * ヘッダー（戻るボタン＋タイトル＋ロックボタン）を作る。
 * @returns {HTMLElement}
 */
function createHeader() {
  const header = document.createElement('header');
  header.className = 'archive-header';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-btn';
  backButton.dataset.action = 'close-archive';
  backButton.setAttribute('aria-label', '戻る');
  backButton.textContent = '‹';

  const title = document.createElement('h2');
  title.className = 'archive-title';
  title.textContent = 'Archive';

  const lockButton = document.createElement('button');
  lockButton.type = 'button';
  lockButton.className = 'icon-btn';
  lockButton.dataset.action = 'lock-now';
  lockButton.setAttribute('aria-label', '今すぐロック');
  lockButton.textContent = '🔒';

  header.appendChild(backButton);
  header.appendChild(title);
  header.appendChild(lockButton);

  return header;
}

/**
 * 検索欄を作る。
 * @returns {HTMLElement}
 */
function createSearchBar() {
  const wrapper = document.createElement('div');
  wrapper.className = 'archive-search';

  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'archiveSearchInput';
  input.className = 'archive-search-input';
  input.placeholder = '記録を検索';
  input.autocomplete = 'off';

  wrapper.appendChild(input);

  return wrapper;
}

/**
 * 背景プリセット選択UIを作る。
 * @returns {HTMLElement}
 */
function createBackgroundPicker() {
  const wrapper = document.createElement('div');
  wrapper.id = 'archiveBackgroundPicker';
  wrapper.className = 'archive-bg-picker';
  wrapper.setAttribute('role', 'radiogroup');
  wrapper.setAttribute('aria-label', '背景を選択');

  BACKGROUND_PRESETS.forEach((preset) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `archive-bg-swatch archive-bg-swatch--${preset.id}`;
    swatch.dataset.action = 'select-background';
    swatch.dataset.backgroundId = preset.id;
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-checked', 'false');
    swatch.setAttribute('aria-label', preset.label);
    wrapper.appendChild(swatch);
  });

  return wrapper;
}

/**
 * 記録一覧の入れ物（空）を作る。中身はrenderList()が埋める。
 * @returns {HTMLElement}
 */
function createList() {
  const list = document.createElement('ul');
  list.id = 'archiveList';
  list.className = 'archive-list';
  list.setAttribute('aria-live', 'polite');
  return list;
}

/**
 * 記録が1件も無い（または検索結果が0件の）ときの案内文を作る。
 * @returns {HTMLElement}
 */
function createEmptyState() {
  const empty = document.createElement('p');
  empty.id = 'archiveEmptyState';
  empty.className = 'archive-empty-state';
  empty.hidden = true;
  return empty;
}

/**
 * Archiveロック（設定でON時）用の、パスコード再入力パネルを作る。
 * workspace.jsの鑑賞モード認証パネルと同じ考え方で、Workspace入場時と
 * 同じパスコードをここでも使う（Archive専用の別パスコードは設けない）。
 * 通常は非表示（.is-open が付いたときだけ表示する）。
 * @returns {HTMLElement}
 */
function createAuthPanel() {
  const panel = document.createElement('div');
  panel.id = 'archiveAuthPanel';
  panel.className = 'archive-auth';

  const message = document.createElement('p');
  message.className = 'archive-auth-message';
  message.textContent = 'Archiveを開くにはパスコードを入力してください';

  const input = document.createElement('input');
  input.type = 'tel';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.id = 'archiveAuthInput';
  input.className = 'archive-auth-input';
  input.maxLength = 8;

  const error = document.createElement('p');
  error.id = 'archiveAuthError';
  error.className = 'archive-auth-error';
  error.hidden = true;
  error.setAttribute('aria-live', 'assertive');

  const actions = document.createElement('div');
  actions.className = 'archive-auth-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'archive-auth-btn archive-auth-btn--cancel';
  cancelButton.dataset.action = 'cancel-archive-auth';
  cancelButton.textContent = 'キャンセル';

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'archive-auth-btn archive-auth-btn--confirm';
  confirmButton.dataset.action = 'confirm-archive-auth';
  confirmButton.textContent = '確認';

  actions.appendChild(cancelButton);
  actions.appendChild(confirmButton);

  panel.appendChild(message);
  panel.appendChild(input);
  panel.appendChild(error);
  panel.appendChild(actions);

  return panel;
}

/**
 * 1件分の記録カードを作る。
 * @param {{text: string, timestamp: number}} entry
 * @returns {HTMLElement}
 */
function createEntryCard(entry) {
  const card = document.createElement('li');
  card.className = 'archive-entry';

  const date = document.createElement('p');
  date.className = 'archive-entry-date';
  date.textContent = formatTimestamp(entry.timestamp);

  const text = document.createElement('p');
  text.className = 'archive-entry-text';
  text.textContent = entry.text;

  card.appendChild(date);
  card.appendChild(text);

  return card;
}

/**
 * searchFilterの条件でRecords.getArchive()の結果を絞り込む。
 * 本文の部分一致（大文字小文字を区別しない）のみ対応。
 * 将来、日付・タグ・写真での絞り込みを追加する場合は、
 * searchFilterにプロパティを増やし、ここに条件を1つ足すだけでよい。
 * @returns {{text: string, timestamp: number}[]}
 */
function getFilteredEntries() {
  const entries = Records.getArchive();
  const query = searchFilter.text.trim().toLowerCase();

  if (query === '') return entries;

  return entries.filter((entry) => entry.text.toLowerCase().includes(query));
}

/**
 * 現在の絞り込み条件で記録一覧を再構築する。
 */
function renderList() {
  const list = document.getElementById('archiveList');
  const emptyState = document.getElementById('archiveEmptyState');
  if (!list || !emptyState) return;

  const entries = getFilteredEntries();

  if (entries.length === 0) {
    list.hidden = true;
    emptyState.hidden = false;
    emptyState.textContent =
      searchFilter.text.trim() === ''
        ? 'まだ記録がありません。'
        : '一致する記録が見つかりませんでした。';
    return;
  }

  list.hidden = false;
  emptyState.hidden = true;

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    fragment.appendChild(createEntryCard(entry));
  });
  list.replaceChildren(fragment);
}

/**
 * 背景プリセットのUI（コンテナのクラス・スウォッチの選択状態）を、
 * 指定したidに合わせて更新する。
 * @param {string} backgroundId
 */
function applyBackground(backgroundId) {
  const container = getContainer();
  if (container) {
    Customization.applyBackgroundClass(container, 'archive', backgroundId);
  }

  const picker = document.getElementById('archiveBackgroundPicker');
  if (picker) {
    Array.from(picker.children).forEach((swatch) => {
      const isActive = swatch.dataset.backgroundId === (backgroundId ?? 'default');
      swatch.classList.toggle('active', isActive);
      swatch.setAttribute('aria-checked', String(isActive));
    });
  }
}

/**
 * #archive の中身（ヘッダー＋検索欄＋背景ピッカー＋記録一覧）を構築する。
 * 既に構築済みの場合は何もしない（二重生成防止）。
 */
export function create() {
  if (isBuilt) return;

  const container = getContainer() ?? createContainer();

  const content = document.createElement('div');
  content.id = 'archiveContent';
  content.className = 'archive-content';
  content.appendChild(createSearchBar());
  content.appendChild(createBackgroundPicker());
  content.appendChild(createList());
  content.appendChild(createEmptyState());

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(content);
  fragment.appendChild(createAuthPanel());
  container.replaceChildren(fragment);

  if (unsubscribeCustomization) unsubscribeCustomization();
  unsubscribeCustomization = Customization.subscribe((customization) => {
    applyBackground(customization.backgrounds?.archive);
  });

  isBuilt = true;
}

/**
 * Archive画面を表示する。開くたびに最新の記録・検索条件なしの状態で再描画する。
 */
export function open() {
  const container = getContainer();
  if (!container) return;

  if (Settings.isArchiveLockEnabled() && !isUnlockedThisSession) {
    showAuthPanel();
  } else {
    showContent();
  }

  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');
}

/**
 * Archive画面を非表示にする。ロックが有効な場合は、次に開いたときに
 * 再度パスコード入力を求めるため、解除済み状態をリセットする。
 */
export function close() {
  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');

  isUnlockedThisSession = false;
  hideAuthPanel();
  clearAuthInput();
}

/**
 * Archive画面が現在開いているかどうかを返す。
 * @returns {boolean}
 */
export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

/**
 * 検索欄の入力値で記録一覧を絞り込み直す。
 * @param {string} query
 */
export function search(query) {
  searchFilter = { text: typeof query === 'string' ? query : '' };
  renderList();
}

/**
 * 背景プリセットを切り替え、Storageへ選択状態を保存する。
 * @param {string} backgroundId
 */
export function selectBackground(backgroundId) {
  const isValid = BACKGROUND_PRESETS.some((preset) => preset.id === backgroundId);
  if (!isValid) return;

  // 即座に見た目へ反映してから保存する（保存の往復を待たせない）。
  // 保存自体はcustomization.js経由でFirestoreへ書き込まれ、
  // 設定画面の背景セレクトからの変更とまったく同じ保存先を共有する。
  applyBackground(backgroundId);
  Customization.updateBackground('archive', backgroundId).catch((error) => {
    console.error('[archive.js] 背景の保存に失敗しました', error);
  });
}

// ------------------------------------------------------------
// Archiveロック（設定でON時のパスコード再認証）
// ------------------------------------------------------------

/** 記録一覧・検索欄・背景ピッカーを表示し、パネルは隠す。実際のコンテンツ表示状態にする。 */
function showContent() {
  hideAuthPanel();

  const content = document.getElementById('archiveContent');
  if (content) content.hidden = false;

  searchFilter = { text: '' };
  const searchInput = document.getElementById('archiveSearchInput');
  if (searchInput) searchInput.value = '';

  renderList();
}

/** パスコード認証パネルを表示し、コンテンツ側は隠す。 */
function showAuthPanel() {
  const content = document.getElementById('archiveContent');
  if (content) content.hidden = true;

  clearAuthInput();
  clearAuthError();

  const panel = document.getElementById('archiveAuthPanel');
  if (panel) panel.classList.add('is-open');
}

/** パスコード認証パネルを非表示にする。 */
function hideAuthPanel() {
  const panel = document.getElementById('archiveAuthPanel');
  if (panel) panel.classList.remove('is-open');
}

/**
 * 認証パネルの入力欄の値を取得する。
 * @returns {string}
 */
export function getAuthInputValue() {
  const input = document.getElementById('archiveAuthInput');
  return input ? input.value : '';
}

/** 認証パネルの入力欄を空にする。 */
export function clearAuthInput() {
  const input = document.getElementById('archiveAuthInput');
  if (input) input.value = '';
}

/** 認証パネルのエラー表示を出す。 */
export function showAuthError() {
  const error = document.getElementById('archiveAuthError');
  if (!error) return;
  error.textContent = 'パスコードが違います';
  error.hidden = false;
}

/** 認証パネルのエラー表示を消す。 */
export function clearAuthError() {
  const error = document.getElementById('archiveAuthError');
  if (error) error.hidden = true;
}

/**
 * 入力されたパスコードを検証し、正しければ今回のセッションだけ
 * Archiveのロックを解除してコンテンツを表示する。
 * @returns {boolean} 検証に成功したかどうか
 */
export function confirmAuth() {
  const value = getAuthInputValue();
  if (!Passcode.validate(value)) {
    showAuthError();
    clearAuthInput();
    return false;
  }

  isUnlockedThisSession = true;
  clearAuthInput();
  clearAuthError();
  showContent();
  return true;
}

const Archive = {
  create,
  open,
  close,
  isOpen,
  search,
  selectBackground,
  getAuthInputValue,
  clearAuthInput,
  confirmAuth,
};

export default Archive;