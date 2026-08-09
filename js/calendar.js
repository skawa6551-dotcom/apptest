// ============================================================

// calendar.js

// Workspace内「カレンダー」画面のDOM生成・開閉・月表示・メモ機能・

// 共有背景カスタマイズ反映を管理するモジュール。

//

// 役割分担：

// ・DOM生成・開閉・画面更新 → calendar.js

// ・Workspace⇔Calendarの遷移 → router.js

// ・クリックの解釈 → app.js

// ・メモ永続化 → storage.js

// ・背景設定 → customization.js

// ============================================================

import Storage, {

  STORAGE_KEYS,

} from './storage.js';

import Customization

  from './customization.js';

// ------------------------------------------------------------

// 定数

// ------------------------------------------------------------

const CONTAINER_ID =

  'calendar';

const WEEKDAY_LABELS =

  Object.freeze([

    '日',

    '月',

    '火',

    '水',

    '木',

    '金',

    '土',

  ]);

// ------------------------------------------------------------

// 状態

// ------------------------------------------------------------

let isBuilt =

  false;

let unsubscribeCustomization =

  null;

const today =

  new Date();

let viewedYear =

  today.getFullYear();

let viewedMonth =

  today.getMonth();

let selectedDateKey =

  null;

// ------------------------------------------------------------

// Storage

// ------------------------------------------------------------

function loadNotes() {

  return Storage.get(

    STORAGE_KEYS.CALENDAR_NOTES,

    {},

  );

}

function saveNotes(notes) {

  Storage.set(

    STORAGE_KEYS.CALENDAR_NOTES,

    notes,

  );

}

// ------------------------------------------------------------

// 日付ユーティリティ

// ------------------------------------------------------------

function pad2(value) {

  return String(value)

    .padStart(

      2,

      '0',

    );

}

function buildDateKey(

  year,

  month,

  day,

) {

  return (

    `${year}-` +

    `${pad2(month + 1)}-` +

    `${pad2(day)}`

  );

}

function formatDateKeyForDisplay(

  dateKey,

) {

  const [

    year,

    month,

    day,

  ] =

    dateKey

      .split('-')

      .map(Number);

  return (

    `${year}年` +

    `${month}月` +

    `${day}日`

  );

}

// ------------------------------------------------------------

// コンテナ

// ------------------------------------------------------------

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

    'calendar';

  container.setAttribute(

    'aria-hidden',

    'true',

  );

  document.body.appendChild(

    container,

  );

  return container;

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

      ?.calendar;

  Customization.applyBackgroundClass(

    container,

    'calendar',

    presetId,

  );

}

/**

 * app.jsなど外部から必要になった場合に

 * 現在の背景設定を再適用できる。

 */

export function refreshCustomization() {

  renderBackground();

}

// ------------------------------------------------------------

// ヘッダー

// ------------------------------------------------------------

function createHeader() {

  const header =

    document.createElement(

      'header',

    );

  header.className =

    'calendar-header';

  const backButton =

    document.createElement(

      'button',

    );

  backButton.type =

    'button';

  backButton.className =

    'icon-btn';

  backButton.dataset.action =

    'close-calendar';

  backButton.setAttribute(

    'aria-label',

    '戻る',

  );

  backButton.textContent =

    '‹';

  const title =

    document.createElement(

      'h2',

    );

  title.className =

    'calendar-title';

  title.textContent =

    'カレンダー';

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

// ------------------------------------------------------------

// 月送り

// ------------------------------------------------------------

function createMonthNav() {

  const nav =

    document.createElement(

      'div',

    );

  nav.className =

    'calendar-nav';

  const prevButton =

    document.createElement(

      'button',

    );

  prevButton.type =

    'button';

  prevButton.className =

    'icon-btn calendar-nav-btn';

  prevButton.dataset.action =

    'prev-month';

  prevButton.setAttribute(

    'aria-label',

    '前の月',

  );

  prevButton.textContent =

    '‹';

  const label =

    document.createElement(

      'span',

    );

  label.id =

    'calendarMonthLabel';

  label.className =

    'calendar-month-label';

  const nextButton =

    document.createElement(

      'button',

    );

  nextButton.type =

    'button';

  nextButton.className =

    'icon-btn calendar-nav-btn';

  nextButton.dataset.action =

    'next-month';

  nextButton.setAttribute(

    'aria-label',

    '次の月',

  );

  nextButton.textContent =

    '›';

  nav.appendChild(

    prevButton,

  );

  nav.appendChild(

    label,

  );

  nav.appendChild(

    nextButton,

  );

  return nav;

}

// ------------------------------------------------------------

// 曜日

// ------------------------------------------------------------

function createWeekdaysRow() {

  const row =

    document.createElement(

      'div',

    );

  row.className =

    'calendar-weekdays';

  WEEKDAY_LABELS.forEach(

    (weekdayLabel) => {

      const cell =

        document.createElement(

          'span',

        );

      cell.className =

        'calendar-weekday';

      cell.textContent =

        weekdayLabel;

      row.appendChild(

        cell,

      );

    },

  );

  return row;

}

// ------------------------------------------------------------

// 日付グリッド

// ------------------------------------------------------------

function createGrid() {

  const grid =

    document.createElement(

      'div',

    );

  grid.id =

    'calendarGrid';

  grid.className =

    'calendar-grid';

  return grid;

}

// ------------------------------------------------------------

// メモ編集

// ------------------------------------------------------------

function createNoteEditor() {

  const panel =

    document.createElement(

      'div',

    );

  panel.id =

    'calendarNoteEditor';

  panel.className =

    'calendar-note-editor';

  const dateLabel =

    document.createElement(

      'p',

    );

  dateLabel.id =

    'calendarNoteDateLabel';

  dateLabel.className =

    'calendar-note-date-label';

  const textarea =

    document.createElement(

      'textarea',

    );

  textarea.id =

    'calendarNoteInput';

  textarea.className =

    'calendar-note-input';

  textarea.rows =

    4;

  textarea.placeholder =

    'メモを入力…';

  const actions =

    document.createElement(

      'div',

    );

  actions.className =

    'calendar-note-actions';

  const cancelButton =

    document.createElement(

      'button',

    );

  cancelButton.type =

    'button';

  cancelButton.className =

    'calendar-note-btn calendar-note-btn--cancel';

  cancelButton.dataset.action =

    'cancel-note';

  cancelButton.textContent =

    'キャンセル';

  const saveButton =

    document.createElement(

      'button',

    );

  saveButton.type =

    'button';

  saveButton.className =

    'calendar-note-btn calendar-note-btn--save';

  saveButton.dataset.action =

    'save-note';

  saveButton.textContent =

    '保存';

  actions.appendChild(

    cancelButton,

  );

  actions.appendChild(

    saveButton,

  );

  panel.appendChild(

    dateLabel,

  );

  panel.appendChild(

    textarea,

  );

  panel.appendChild(

    actions,

  );

  return panel;

}

// ------------------------------------------------------------

// 日付セル

// ------------------------------------------------------------

function createDayCell(

  day,

  isToday,

  hasNote,

) {

  const cell =

    document.createElement(

      'button',

    );

  cell.type =

    'button';

  cell.className =

    'calendar-day';

  if (isToday) {

    cell.classList.add(

      'is-today',

    );

  }

  if (hasNote) {

    cell.classList.add(

      'has-note',

    );

  }

  cell.dataset.action =

    'select-date';

  cell.dataset.date =

    buildDateKey(

      viewedYear,

      viewedMonth,

      day,

    );

  cell.setAttribute(

    'aria-label',

    `${viewedMonth + 1}月${day}日` +

      `${isToday ? '（今日）' : ''}` +

      `${hasNote ? ' メモあり' : ''}`,

  );

  const number =

    document.createElement(

      'span',

    );

  number.className =

    'calendar-day-number';

  number.textContent =

    String(day);

  cell.appendChild(

    number,

  );

  if (hasNote) {

    const dot =

      document.createElement(

        'span',

      );

    dot.className =

      'calendar-day-dot';

    dot.setAttribute(

      'aria-hidden',

      'true',

    );

    cell.appendChild(

      dot,

    );

  }

  return cell;

}

function createBlankCell() {

  const cell =

    document.createElement(

      'span',

    );

  cell.className =

    'calendar-day calendar-day--blank';

  cell.setAttribute(

    'aria-hidden',

    'true',

  );

  return cell;

}

// ------------------------------------------------------------

// グリッド描画

// ------------------------------------------------------------

function renderGrid() {

  const grid =

    document.getElementById(

      'calendarGrid',

    );

  if (!grid) {

    return;

  }

  const notes =

    loadNotes();

  const firstWeekday =

    new Date(

      viewedYear,

      viewedMonth,

      1,

    ).getDay();

  const daysInMonth =

    new Date(

      viewedYear,

      viewedMonth + 1,

      0,

    ).getDate();

  const isViewingCurrentMonth =

    viewedYear ===

      today.getFullYear() &&

    viewedMonth ===

      today.getMonth();

  const todayDate =

    today.getDate();

  const fragment =

    document.createDocumentFragment();

  for (

    let i = 0;

    i < firstWeekday;

    i += 1

  ) {

    fragment.appendChild(

      createBlankCell(),

    );

  }

  for (

    let day = 1;

    day <= daysInMonth;

    day += 1

  ) {

    const dateKey =

      buildDateKey(

        viewedYear,

        viewedMonth,

        day,

      );

    const isToday =

      isViewingCurrentMonth &&

      day === todayDate;

    const hasNote =

      typeof notes[dateKey] ===

        'string' &&

      notes[dateKey].trim() !==

        '';

    fragment.appendChild(

      createDayCell(

        day,

        isToday,

        hasNote,

      ),

    );

  }

  grid.replaceChildren(

    fragment,

  );

}

// ------------------------------------------------------------

// 月ラベル

// ------------------------------------------------------------

function updateMonthLabel() {

  const label =

    document.getElementById(

      'calendarMonthLabel',

    );

  if (!label) {

    return;

  }

  label.textContent =

    `${viewedYear}年` +

    `${viewedMonth + 1}月`;

}

// ------------------------------------------------------------

// 初期構築

// ------------------------------------------------------------

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

    createMonthNav(),

  );

  fragment.appendChild(

    createWeekdaysRow(),

  );

  fragment.appendChild(

    createGrid(),

  );

  fragment.appendChild(

    createNoteEditor(),

  );

  container.replaceChildren(

    fragment,

  );

  updateMonthLabel();

  renderGrid();

  renderBackground();

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

  isBuilt = true;

}

// ------------------------------------------------------------

// 開く

// ------------------------------------------------------------

export function open() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  /*

   * 開く直前にも背景を再適用する。

   * iPhone PWAで古い見た目が残るケースを防ぐ。

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

  /*

   * is-open付与後のフレームでも再確認。

   */

  window.requestAnimationFrame(

    () => {

      renderBackground();

    },

  );

}

// ------------------------------------------------------------

// 閉じる

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

  closeNoteEditor();

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

// 前月

// ------------------------------------------------------------

export function goToPreviousMonth() {

  viewedMonth -=

    1;

  if (

    viewedMonth < 0

  ) {

    viewedMonth =

      11;

    viewedYear -=

      1;

  }

  updateMonthLabel();

  renderGrid();

  renderBackground();

}

// ------------------------------------------------------------

// 次月

// ------------------------------------------------------------

export function goToNextMonth() {

  viewedMonth +=

    1;

  if (

    viewedMonth > 11

  ) {

    viewedMonth =

      0;

    viewedYear +=

      1;

  }

  updateMonthLabel();

  renderGrid();

  renderBackground();

}

// ------------------------------------------------------------

// 日付選択

// ------------------------------------------------------------

export function selectDate(

  dateKey,

) {

  if (

    typeof dateKey !==

      'string' ||

    dateKey === ''

  ) {

    return;

  }

  selectedDateKey =

    dateKey;

  const notes =

    loadNotes();

  const input =

    document.getElementById(

      'calendarNoteInput',

    );

  if (input) {

    input.value =

      notes[dateKey] ??

      '';

  }

  const dateLabel =

    document.getElementById(

      'calendarNoteDateLabel',

    );

  if (dateLabel) {

    dateLabel.textContent =

      formatDateKeyForDisplay(

        dateKey,

      );

  }

  const panel =

    document.getElementById(

      'calendarNoteEditor',

    );

  if (panel) {

    panel.classList.add(

      'is-open',

    );

  }

  if (input) {

    window.setTimeout(

      () => {

        input.focus();

      },

      50,

    );

  }

}

// ------------------------------------------------------------

// メモ編集を閉じる

// ------------------------------------------------------------

export function closeNoteEditor() {

  const panel =

    document.getElementById(

      'calendarNoteEditor',

    );

  if (panel) {

    panel.classList.remove(

      'is-open',

    );

  }

  selectedDateKey =

    null;

}

// ------------------------------------------------------------

// 入力値取得

// ------------------------------------------------------------

export function getNoteInputValue() {

  const input =

    document.getElementById(

      'calendarNoteInput',

    );

  return input

    ? input.value

    : '';

}

// ------------------------------------------------------------

// メモ保存

// ------------------------------------------------------------

export function saveNote(

  text,

) {

  if (!selectedDateKey) {

    return;

  }

  const notes =

    loadNotes();

  const trimmed =

    typeof text === 'string'

      ? text.trim()

      : '';

  if (

    trimmed === ''

  ) {

    delete notes[

      selectedDateKey

    ];

  } else {

    notes[

      selectedDateKey

    ] =

      trimmed;

  }

  saveNotes(

    notes,

  );

  closeNoteEditor();

  renderGrid();

  renderBackground();

}

// ------------------------------------------------------------

// default export

// ------------------------------------------------------------

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

  refreshCustomization,

};

export default Calendar;