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

import Storage, { STORAGE_KEYS } from './storage.js';
import Records from './records.js';

/** Archive画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'archive';

/**
 * 背景プリセットの定義。
 * 個人の日記・思い出全般に合う、恋愛関係に限定しない抽象的な
 * デザインのみを用意する。
 * 色は archive.css 側でこのidに対応するクラス（archive-bg--{id}）として
 * 定義する。プリセット固有の色のため、app.cssの共通変数は使わず
 * archive.css内に閉じた値として持たせる。
 */
const BACKGROUND_PRESETS = Object.freeze([
  Object.freeze({ id: 'black-gold', label: 'Black & Gold' }),
  Object.freeze({ id: 'dark-navy', label: 'Dark Navy' }),
  Object.freeze({ id: 'glass', label: 'Glass' }),
  Object.freeze({ id: 'abstract', label: 'Abstract Art' }),
]);

/** 背景プリセット未選択時のデフォルト値 */
const DEFAULT_BACKGROUND_ID = BACKGROUND_PRESETS[0].id;

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/** 検索欄の現在の絞り込み条件（本文のみ。将来ここに日付・タグ等を追加できる）。 */
let searchFilter = {
  text: '',
};

/**
 * 現在保存されている背景プリセットidをStorage経由で読み込む。
 * 未保存・不正な値の場合はデフォルトを返す。
 * @returns {string}
 */
function loadBackgroundId() {
  const saved = Storage.get(STORAGE_KEYS.ARCHIVE_BACKGROUND, DEFAULT_BACKGROUND_ID);
  const isValid = BACKGROUND_PRESETS.some((preset) => preset.id === saved);
  return isValid ? saved : DEFAULT_BACKGROUND_ID;
}

/**
 * 背景プリセットidをStorage経由で保存する。
 * @param {string} id
 */
function saveBackgroundId(id) {
  Storage.set(STORAGE_KEYS.ARCHIVE_BACKGROUND, id);
}

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
    BACKGROUND_PRESETS.forEach((preset) => {
      container.classList.toggle(`archive-bg--${preset.id}`, preset.id === backgroundId);
    });
  }

  const picker = document.getElementById('archiveBackgroundPicker');
  if (picker) {
    Array.from(picker.children).forEach((swatch) => {
      const isActive = swatch.dataset.backgroundId === backgroundId;
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

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(createSearchBar());
  fragment.appendChild(createBackgroundPicker());
  fragment.appendChild(createList());
  fragment.appendChild(createEmptyState());
  container.replaceChildren(fragment);

  applyBackground(loadBackgroundId());

  isBuilt = true;
}

/**
 * Archive画面を表示する。開くたびに最新の記録・検索条件なしの状態で再描画する。
 */
export function open() {
  const container = getContainer();
  if (!container) return;

  searchFilter = { text: '' };
  const searchInput = document.getElementById('archiveSearchInput');
  if (searchInput) searchInput.value = '';

  renderList();

  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');
}

/**
 * Archive画面を非表示にする。
 */
export function close() {
  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
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

  applyBackground(backgroundId);
  saveBackgroundId(backgroundId);
}

const Archive = {
  create,
  open,
  close,
  isOpen,
  search,
  selectBackground,
};

export default Archive;