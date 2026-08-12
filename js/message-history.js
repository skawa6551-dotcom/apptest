// ============================================================
// message-history.js
// Calculator 0209
// AI Space本体は変更せず、履歴専用の独立2画面を追加する。
// ============================================================

import Firebase from './firebase.js';

const LIST_ID = 'messageHistoryScreen';
const DETAIL_ID = 'messageHistoryDetailScreen';

let latestMessages = [];
let currentQuery = '';
let selectedDateKey = null;

function ensureScreens() {
  if (document.getElementById(LIST_ID) && document.getElementById(DETAIL_ID)) return;

  const list = document.createElement('section');
  list.id = LIST_ID;
  list.className = 'message-history-screen';
  list.setAttribute('aria-hidden', 'true');
  list.innerHTML = `
    <div class="message-history-bg" aria-hidden="true"></div>
    <header class="message-history-header">
      <button type="button" class="message-history-back" data-history-action="close-list" aria-label="AI Spaceに戻る">‹</button>
      <div class="message-history-heading">
        <h2>メッセージ履歴</h2>
        <p>大切なやりとりの記録</p>
      </div>
      <div class="message-history-header-spacer"></div>
    </header>

    <div class="message-history-search-wrap">
      <div class="message-history-search">
        <span class="message-history-search-icon" aria-hidden="true">⌕</span>
        <input id="messageHistorySearchInput" type="search" placeholder="キーワードで検索" autocomplete="off" />
      </div>
    </div>

    <div class="message-history-body">
      <div id="messageHistoryGroups" class="message-history-groups"></div>
      <div id="messageHistoryEmpty" class="message-history-empty" hidden>履歴はまだありません</div>
    </div>
  `;

  const detail = document.createElement('section');
  detail.id = DETAIL_ID;
  detail.className = 'message-history-detail-screen';
  detail.setAttribute('aria-hidden', 'true');
  detail.innerHTML = `
    <div class="message-history-detail-bg" aria-hidden="true"></div>
    <header class="message-history-header">
      <button type="button" class="message-history-back" data-history-action="close-detail" aria-label="履歴一覧に戻る">‹</button>
      <div class="message-history-heading">
        <h2>履歴詳細</h2>
        <p id="messageHistoryDetailDate"></p>
      </div>
      <div class="message-history-header-spacer"></div>
    </header>
    <div id="messageHistoryDetailList" class="message-history-detail-list"></div>
  `;

  document.body.append(list, detail);

  list.addEventListener('click', handleHistoryClick);
  detail.addEventListener('click', handleHistoryClick);

  const searchInput = list.querySelector('#messageHistorySearchInput');
  searchInput?.addEventListener('input', () => {
    currentQuery = searchInput.value.trim().toLowerCase();
    renderList();
  });
}

function handleHistoryClick(event) {
  if (!(event.target instanceof Element)) return;

  const actionTarget = event.target.closest('[data-history-action]');
  if (actionTarget) {
    const action = actionTarget.dataset.historyAction;
    if (action === 'close-list') {
      closeHistory();
      return;
    }
    if (action === 'close-detail') {
      closeDetail();
      return;
    }
  }

  const dayCard = event.target.closest('[data-history-date]');
  if (dayCard) {
    selectedDateKey = dayCard.dataset.historyDate || null;
    if (selectedDateKey) openDetail(selectedDateKey);
  }
}

function messageTimeMs(message) {
  const ts = message?.timestamp;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return 0;
}

function dateKeyFromMessage(message) {
  const ms = messageTimeMs(message);
  if (!ms) return 'unknown';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateKey) {
  if (dateKey === 'unknown') return '日付不明';
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function formatTime(message) {
  const ms = messageTimeMs(message);
  if (!ms) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

function getCurrentUid() {
  return Firebase.getCurrentUid();
}

function normalizedMessages() {
  const uid = getCurrentUid();
  const filtered = latestMessages.filter((m) => {
    if (!m) return false;
    if (!currentQuery) return true;
    return String(m.text ?? '').toLowerCase().includes(currentQuery);
  });

  return filtered
    .map((message) => ({
      ...message,
      _isOwn: message.senderId === uid,
      _dateKey: dateKeyFromMessage(message),
    }))
    .sort((a, b) => messageTimeMs(b) - messageTimeMs(a));
}

function groupByDate(messages) {
  const map = new Map();
  messages.forEach((message) => {
    if (!map.has(message._dateKey)) map.set(message._dateKey, []);
    map.get(message._dateKey).push(message);
  });
  return map;
}

function renderList() {
  ensureScreens();

  const groupsEl = document.getElementById('messageHistoryGroups');
  const emptyEl = document.getElementById('messageHistoryEmpty');
  if (!groupsEl || !emptyEl) return;

  const messages = normalizedMessages();
  const groups = groupByDate(messages);

  if (messages.length === 0) {
    groupsEl.replaceChildren();
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  const fragment = document.createDocumentFragment();

  groups.forEach((items, dateKey) => {
    const section = document.createElement('section');
    section.className = 'message-history-day';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'message-history-day-header';
    header.dataset.historyDate = dateKey;

    const dateLabel = document.createElement('span');
    dateLabel.className = 'message-history-day-date';
    dateLabel.textContent = formatDateLabel(dateKey);

    const count = document.createElement('span');
    count.className = 'message-history-day-count';
    count.textContent = `${items.length}件`;

    header.append(dateLabel, count);
    section.appendChild(header);

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'message-history-card';
    card.dataset.historyDate = dateKey;

    items.slice(0, 4).forEach((message) => {
      const row = document.createElement('div');
      row.className = 'message-history-row';

      const avatar = document.createElement('div');
      avatar.className = `message-history-avatar ${message._isOwn ? 'is-own' : 'is-other'}`;
      avatar.textContent = '♥';

      const content = document.createElement('div');
      content.className = 'message-history-row-content';

      const meta = document.createElement('div');
      meta.className = 'message-history-row-meta';

      const who = document.createElement('span');
      who.className = `message-history-who ${message._isOwn ? 'is-own' : 'is-other'}`;
      who.textContent = message._isOwn ? 'あなた' : 'あの人';

      const time = document.createElement('span');
      time.className = 'message-history-time';
      time.textContent = formatTime(message);

      meta.append(who, time);

      const text = document.createElement('div');
      text.className = 'message-history-text';
      text.textContent = message.text ?? '';

      content.append(meta, text);
      row.append(avatar, content);
      card.appendChild(row);
    });

    if (items.length > 4) {
      const more = document.createElement('div');
      more.className = 'message-history-more';
      more.textContent = `ほか ${items.length - 4}件`;
      card.appendChild(more);
    }

    section.appendChild(card);
    fragment.appendChild(section);
  });

  groupsEl.replaceChildren(fragment);
}

function renderDetail(dateKey) {
  const detailList = document.getElementById('messageHistoryDetailList');
  const detailDate = document.getElementById('messageHistoryDetailDate');
  if (!detailList || !detailDate) return;

  detailDate.textContent = formatDateLabel(dateKey);

  const uid = getCurrentUid();
  const messages = latestMessages
    .filter((m) => dateKeyFromMessage(m) === dateKey)
    .sort((a, b) => messageTimeMs(a) - messageTimeMs(b));

  const fragment = document.createDocumentFragment();

  messages.forEach((message) => {
    const isOwn = message.senderId === uid;
    const row = document.createElement('div');
    row.className = `message-history-detail-row ${isOwn ? 'is-own' : 'is-other'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-history-detail-bubble';

    const text = document.createElement('div');
    text.className = 'message-history-detail-text';
    text.textContent = message.text ?? '';

    const time = document.createElement('div');
    time.className = 'message-history-detail-time';
    time.textContent = formatTime(message);

    bubble.append(text, time);
    row.appendChild(bubble);
    fragment.appendChild(row);
  });

  detailList.replaceChildren(fragment);
}

export function setMessages(messages) {
  latestMessages = Array.isArray(messages) ? messages : [];
  renderList();
  if (selectedDateKey) renderDetail(selectedDateKey);
}

export function openHistory(messages = null) {
  ensureScreens();
  if (Array.isArray(messages)) latestMessages = messages;

  const list = document.getElementById(LIST_ID);
  const detail = document.getElementById(DETAIL_ID);

  detail?.classList.remove('is-open');
  detail?.setAttribute('aria-hidden', 'true');

  list?.classList.add('is-open');
  list?.setAttribute('aria-hidden', 'false');

  document.body.classList.add('message-history-open');
  renderList();
}

export function closeHistory() {
  const list = document.getElementById(LIST_ID);
  const detail = document.getElementById(DETAIL_ID);

  list?.classList.remove('is-open');
  list?.setAttribute('aria-hidden', 'true');
  detail?.classList.remove('is-open');
  detail?.setAttribute('aria-hidden', 'true');

  selectedDateKey = null;
  document.body.classList.remove('message-history-open');
}

export function openDetail(dateKey) {
  ensureScreens();
  selectedDateKey = dateKey;

  const list = document.getElementById(LIST_ID);
  const detail = document.getElementById(DETAIL_ID);

  list?.classList.remove('is-open');
  list?.setAttribute('aria-hidden', 'true');

  detail?.classList.add('is-open');
  detail?.setAttribute('aria-hidden', 'false');

  renderDetail(dateKey);
}

export function closeDetail() {
  selectedDateKey = null;

  const list = document.getElementById(LIST_ID);
  const detail = document.getElementById(DETAIL_ID);

  detail?.classList.remove('is-open');
  detail?.setAttribute('aria-hidden', 'true');

  list?.classList.add('is-open');
  list?.setAttribute('aria-hidden', 'false');
}

export function isHistoryScreenOpen() {
  return document.getElementById(LIST_ID)?.classList.contains('is-open') ||
    document.getElementById(DETAIL_ID)?.classList.contains('is-open') ||
    false;
}

const MessageHistory = {
  setMessages,
  openHistory,
  closeHistory,
  openDetail,
  closeDetail,
  isHistoryScreenOpen,
};

export default MessageHistory;
