// ============================================================
// calendar.js
// Workspace内「カレンダー」画面のDOM生成・開閉・月表示・メモ機能を
// 管理するモジュール。records.js/workspace.jsと同じ設計方針を踏襲する：
//
//   ・DOM生成・開閉・画面の中身の更新 … このファイル（calendar.js）
//   ・画面遷移の調整（Workspace⇔Calendar） … router.js
//   ・クリックの解釈・ディスパッチ … app.js
//   ・永続化（メモの保存/読込） … storage.js経由（calendar.js自身は
//     localStorageへ直接アクセスしない）
//
// 「0209」の判定やAutoLockのタイマー管理など、他画面の責務には
// 一切踏み込まない。
// ============================================================

import Storage, { STORAGE_KEYS } from './storage.js';
import Customization from './customization.js';

/** カレンダー画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'calendar';

/** 曜日ヘッダーの表示ラベル（日曜始まり、iPhone純正カレンダーと同じ並び） */
const WEEKDAY_LABELS = Object.freeze(['日', '月', '火', '水', '木', '金', '土']);

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/** customization.jsの購読解除関数。 */
let unsubscribeCustomization = null;

/** 「今日」の日付（起動時に1度だけ確定させ、日をまたいでも当日中は固定で扱う） */
const today = new Date();

/** 現在グリッドに表示している年・月（月は0〜11）。初期値は今日の月。 */
let viewedYear = today.getFullYear();
let viewedMonth = today.getMonth();

/** メモ編集パネルで選択中の日付キー（'YYYY-MM-DD'）。未選択時はnull。 */
let selectedDateKey = null;

/**
 * @typedef {Object.<string, string>} NotesMap
 * 'YYYY-MM-DD' 形式の日付キー → メモ本文、の対応表。
 */

/**
 * 保存済みメモ一式をStorage経由で読み込む。
 * @returns {NotesMap}
 */
function loadNotes() {
  return Storage.get(STORAGE_KEYS.CALENDAR_NOTES, {});
}

/**
 * メモ一式をStorage経由で保存する。
 * @param {NotesMap} notes
 */
function saveNotes(notes) {
  Storage.set(STORAGE_KEYS.CALENDAR_NOTES, notes);
}

/**
 * 数値を2桁ゼロ埋め文字列にする（'3' → '03'）。
 * @param {number} value
 * @returns {string}
 */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * 年・月（0〜11）・日から、Storageのキーとして使う'YYYY-MM-DD'を作る。
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
function buildDateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/**
 * 'YYYY-MM-DD'を画面表示用の日本語表記に整形する。
 * @param {string} dateKey
 * @returns {string}
 */
function formatDateKeyForDisplay(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

/**
 * コンテナ要素（#calendar）を取得する。
 * @returns {HTMLElement|null}
 */
function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

/**
 * コンテナ要素（#calendar）を新規作成し、bodyへ追加する。
 * workspace.jsと異なり、静的HTMLにコンテナを用意していないため、
 * records.jsと同様ここで最初にdivごと作る。
 * @returns {HTMLElement}
 */
function createContainer() {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = 'calendar';
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
  header.className = 'calendar-header';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-btn';
  backButton.dataset.action = 'close-calendar';
  backButton.setAttribute('aria-label', '戻る');
  backButton.textContent = '‹';

  const title = document.createElement('h2');
  title.className = 'calendar-title';
  title.textContent = 'カレンダー';

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
 * 月送りナビ（前月／年月ラベル／次月）を作る。
 * @returns {HTMLElement}
 */
function createMonthNav() {
  const nav = document.createElement('div');
  nav.className = 'calendar-nav';

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'icon-btn calendar-nav-btn';
  prevButton.dataset.action = 'prev-month';
  prevButton.setAttribute('aria-label', '前の月');
  prevButton.textContent = '‹';

  const label = document.createElement('span');
  label.id = 'calendarMonthLabel';
  label.className = 'calendar-month-label';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'icon-btn calendar-nav-btn';
  nextButton.dataset.action = 'next-month';
  nextButton.setAttribute('aria-label', '次の月');
  nextButton.textContent = '›';

  nav.appendChild(prevButton);
  nav.appendChild(label);
  nav.appendChild(nextButton);

  return nav;
}

/**
 * 曜日ヘッダー行（日〜土）を作る。
 * @returns {HTMLElement}
 */
function createWeekdaysRow() {
  const row = document.createElement('div');
  row.className = 'calendar-weekdays';

  WEEKDAY_LABELS.forEach((weekdayLabel) => {
    const cell = document.createElement('span');
    cell.className = 'calendar-weekday';
    cell.textContent = weekdayLabel;
    row.appendChild(cell);
  });

  return row;
}

/**
 * 日付グリッドの入れ物（空）を作る。中身はrenderGrid()が埋める。
 * @returns {HTMLElement}
 */
function createGrid() {
  const grid = document.createElement('div');
  grid.id = 'calendarGrid';
  grid.className = 'calendar-grid';
  return grid;
}

/**
 * メモ編集パネルを作る。通常は非表示（.is-open が付いたときだけ表示する）。
 * @returns {HTMLElement}
 */
function createNoteEditor() {
  const panel = document.createElement('div');
  panel.id = 'calendarNoteEditor';
  panel.className = 'calendar-note-editor';

  const dateLabel = document.createElement('p');
  dateLabel.id = 'calendarNoteDateLabel';
  dateLabel.className = 'calendar-note-date-label';

  const textarea = document.createElement('textarea');
  textarea.id = 'calendarNoteInput';
  textarea.className = 'calendar-note-input';
  textarea.rows = 4;
  textarea.placeholder = 'メモを入力…';

  const actions = document.createElement('div');
  actions.className = 'calendar-note-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'calendar-note-btn calendar-note-btn--cancel';
  cancelButton.dataset.action = 'cancel-note';
  cancelButton.textContent = 'キャンセル';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'calendar-note-btn calendar-note-btn--save';
  saveButton.dataset.action = 'save-note';
  saveButton.textContent = '保存';

  actions.appendChild(cancelButton);
  actions.appendChild(saveButton);

  panel.appendChild(dateLabel);
  panel.appendChild(textarea);
  panel.appendChild(actions);

  return panel;
}

/**
 * 1マス分の日付セル（button）を作る。
 * @param {number} day
 * @param {boolean} isToday
 * @param {boolean} hasNote
 * @returns {HTMLButtonElement}
 */
function createDayCell(day, isToday, hasNote) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'calendar-day';
  if (isToday) cell.classList.add('is-today');
  if (hasNote) cell.classList.add('has-note');
  cell.dataset.action = 'select-date';
  cell.dataset.date = buildDateKey(viewedYear, viewedMonth, day);
  cell.setAttribute('aria-label', `${viewedMonth + 1}月${day}日${isToday ? '（今日）' : ''}${hasNote ? ' メモあり' : ''}`);

  const number = document.createElement('span');
  number.className = 'calendar-day-number';
  number.textContent = String(day);
  cell.appendChild(number);

  if (hasNote) {
    const dot = document.createElement('span');
    dot.className = 'calendar-day-dot';
    dot.setAttribute('aria-hidden', 'true');
    cell.appendChild(dot);
  }

  return cell;
}

/**
 * 月初の曜日合わせ用の空白セルを作る（クリック対象ではない）。
 * @returns {HTMLElement}
 */
function createBlankCell() {
  const cell = document.createElement('span');
  cell.className = 'calendar-day calendar-day--blank';
  cell.setAttribute('aria-hidden', 'true');
  return cell;
}

/**
 * viewedYear/viewedMonthの内容で日付グリッドを再構築する。
 * 月初の曜日に合わせて空白セルを先頭に敷き詰め、今日のセルには
 * .is-today、メモがあるセルには .has-note を付与する。
 */
function renderGrid() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const notes = loadNotes();
  const firstWeekday = new Date(viewedYear, viewedMonth, 1).getDay();
  const daysInMonth = new Date(viewedYear, viewedMonth + 1, 0).getDate();

  const isViewingCurrentMonth = viewedYear === today.getFullYear() && viewedMonth === today.getMonth();
  const todayDate = today.getDate();

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < firstWeekday; i += 1) {
    fragment.appendChild(createBlankCell());
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = buildDateKey(viewedYear, viewedMonth, day);
    const isToday = isViewingCurrentMonth && day === todayDate;
    const hasNote = typeof notes[dateKey] === 'string' && notes[dateKey].trim() !== '';
    fragment.appendChild(createDayCell(day, isToday, hasNote));
  }

  grid.replaceChildren(fragment);
}

/** ヘッダー直下の「◯年◯月」ラベルを、現在のviewedYear/viewedMonthで更新する。 */
function updateMonthLabel() {
  const label = document.getElementById('calendarMonthLabel');
  if (!label) return;
  label.textContent = `${viewedYear}年${viewedMonth + 1}月`;
}

/**
 * #calendar の中身（ヘッダー＋月送りナビ＋曜日行＋日付グリッド＋メモ編集パネル）
 * を構築する。既に構築済みの場合は何もしない（二重生成防止）。
 * appendChild()ではなくreplaceChildren()を使い、将来create()が再度
 * 呼ばれるケースになっても安全に動作するようにする。
 */
export function create() {
  if (isBuilt) return;

  const container = getContainer() ?? createContainer();

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(createMonthNav());
  fragment.appendChild(createWeekdaysRow());
  fragment.appendChild(createGrid());
  fragment.appendChild(createNoteEditor());
  container.replaceChildren(fragment);

  updateMonthLabel();
  renderGrid();

  if (unsubscribeCustomization) unsubscribeCustomization();
  unsubscribeCustomization = Customization.subscribe((customization) => {
    Customization.applyBackgroundClass(container, 'calendar', customization.backgrounds?.calendar);
  });

  isBuilt = true;
}

/**
 * カレンダー画面を表示する。
 */
export function open() {
  const container = getContainer();
  if (!container) return;

  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');
}

/**
 * カレンダー画面を非表示にする。開いたままだったメモ編集パネルも閉じる。
 */
export function close() {
  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
  closeNoteEditor();
}

/**
 * カレンダー画面が現在開いているかどうかを返す。
 * @returns {boolean}
 */
export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

/** 表示中の月を1つ前に戻し、ラベル・グリッドを再描画する。 */
export function goToPreviousMonth() {
  viewedMonth -= 1;
  if (viewedMonth < 0) {
    viewedMonth = 11;
    viewedYear -= 1;
  }
  updateMonthLabel();
  renderGrid();
}

/** 表示中の月を1つ先に進め、ラベル・グリッドを再描画する。 */
export function goToNextMonth() {
  viewedMonth += 1;
  if (viewedMonth > 11) {
    viewedMonth = 0;
    viewedYear += 1;
  }
  updateMonthLabel();
  renderGrid();
}

/**
 * 指定した日付のメモ編集パネルを開く。既存メモがあれば入力欄に反映する。
 * @param {string} dateKey - 'YYYY-MM-DD'
 */
export function selectDate(dateKey) {
  selectedDateKey = dateKey;

  const notes = loadNotes();
  const input = document.getElementById('calendarNoteInput');
  if (input) input.value = notes[dateKey] ?? '';

  const dateLabel = document.getElementById('calendarNoteDateLabel');
  if (dateLabel) dateLabel.textContent = formatDateKeyForDisplay(dateKey);

  const panel = document.getElementById('calendarNoteEditor');
  if (panel) panel.classList.add('is-open');
}

/** メモ編集パネルを閉じ、選択中の日付をクリアする。 */
export function closeNoteEditor() {
  const panel = document.getElementById('calendarNoteEditor');
  if (panel) panel.classList.remove('is-open');
  selectedDateKey = null;
}

/**
 * メモ入力欄の現在の値を取得する。
 * @returns {string}
 */
export function getNoteInputValue() {
  const input = document.getElementById('calendarNoteInput');
  return input ? input.value : '';
}

/**
 * 現在選択中の日付に対してメモを保存する（Storage経由）。
 * 空文字・空白のみの場合は、その日のメモを削除する扱いにする。
 * 保存後はグリッドの●表示を更新するため再描画し、編集パネルを閉じる。
 * 日付が選択されていない状態（想定外の呼び出し）では何もしない。
 * @param {string} text
 */
export function saveNote(text) {
  if (!selectedDateKey) return;

  const notes = loadNotes();
  const trimmed = typeof text === 'string' ? text.trim() : '';

  if (trimmed === '') {
    delete notes[selectedDateKey];
  } else {
    notes[selectedDateKey] = trimmed;
  }

  saveNotes(notes);
  closeNoteEditor();
  renderGrid();
}

const Calendar = {
  create,
  open,
  close,
  isOpen,
  goToPreviousMonth,
  goToNextMonth,
  selectDate,
  closeNoteEditor,
  getNoteInputValue,
  saveNote,
};

export default Calendar;