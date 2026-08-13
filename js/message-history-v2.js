// ============================================================
// message-history-v2.js
// Calculator 0209
//
// 既存AI Spaceの送信処理には触れない「履歴専用・読み取り専用」画面。
// 画面順:
// AI Space -> 履歴ボタン -> 既存パスコード認証
// -> 履歴一覧 -> 日付詳細 -> 履歴一覧 -> AI Space
// ============================================================

import Firebase from './firebase.js';

const LIST_ID = 'messageHistoryV2';
const DETAIL_ID = 'messageHistoryDetailV2';

let unsubscribeHistory = null;
let latestMessages = [];
let currentQuery = '';
let selectedDateKey = null;
let isBuilt = false;

function messageTimeMs(message) {
  const ts = message?.timestamp;

  if (typeof ts?.toMillis === 'function') {
    return ts.toMillis();
  }

  if (typeof ts?.seconds === 'number') {
    return ts.seconds * 1000;
  }

  if (typeof ts === 'number') {
    return ts;
  }

  if (typeof message?.createdAt?.toMillis === 'function') {
    return message.createdAt.toMillis();
  }

  if (typeof message?.createdAt?.seconds === 'number') {
    return message.createdAt.seconds * 1000;
  }

  if (typeof message?.createdAt === 'number') {
    return message.createdAt;
  }

  return 0;
}

function dateKeyFromMessage(message) {
  const ms = messageTimeMs(message);

  if (!ms) {
    return 'unknown';
  }

  const date = new Date(ms);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateLabel(key) {
  if (key === 'unknown') {
    return '日付不明';
  }

  const [year, month, day] =
    key.split('-').map(Number);

  const date =
    new Date(year, month - 1, day);

  try {
    return new Intl.DateTimeFormat(
      'ja-JP',
      {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      },
    ).format(date);
  } catch {
    return `${year}年${month}月${day}日`;
  }
}

function formatTime(message) {
  const ms = messageTimeMs(message);

  if (!ms) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(
      'ja-JP',
      {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      },
    ).format(new Date(ms));
  } catch {
    return '';
  }
}

function createCoupleSilhouette() {
  const wrap =
    document.createElement('div');

  wrap.className =
    'history-v2-couple';

  wrap.setAttribute(
    'aria-hidden',
    'true',
  );

  wrap.innerHTML = `
    <div class="history-v2-sky-glow"></div>
    <div class="history-v2-city"></div>
    <div class="history-v2-person history-v2-person--left">
      <span class="history-v2-head"></span>
      <span class="history-v2-body"></span>
    </div>
    <div class="history-v2-person history-v2-person--right">
      <span class="history-v2-head"></span>
      <span class="history-v2-body"></span>
    </div>
  `;

  return wrap;
}

function buildScreens() {
  if (isBuilt) {
    return;
  }

  const list =
    document.createElement('section');

  list.id = LIST_ID;
  list.className =
    'message-history-v2';
  list.setAttribute(
    'aria-hidden',
    'true',
  );

  list.innerHTML = `
    <div class="history-v2-bg-layer" aria-hidden="true"></div>

    <header class="history-v2-header">
      <button
        type="button"
        class="history-v2-back"
        data-history-v2-action="close-history"
        aria-label="AI Spaceへ戻る"
      >‹</button>

      <div class="history-v2-header-title">
        <h2>メッセージ履歴</h2>
        <p>大切なやりとりの記録 <span aria-hidden="true">♡</span></p>
      </div>

      <div class="history-v2-header-spacer"></div>
    </header>

    <div class="history-v2-hero" id="historyV2Hero"></div>

    <div class="history-v2-search-row">
      <label class="history-v2-search">
        <span aria-hidden="true">⌕</span>
        <input
          id="historyV2SearchInput"
          type="search"
          autocomplete="off"
          placeholder="キーワードで検索"
          aria-label="履歴を検索"
        >
      </label>
    </div>

    <div class="history-v2-scroll">
      <div
        id="historyV2Groups"
        class="history-v2-groups"
      ></div>

      <div
        id="historyV2Empty"
        class="history-v2-empty"
        hidden
      >
        <div class="history-v2-empty-heart" aria-hidden="true">♡</div>
        <p>履歴はまだありません</p>
      </div>
    </div>
  `;

  const detail =
    document.createElement('section');

  detail.id = DETAIL_ID;
  detail.className =
    'message-history-detail-v2';
  detail.setAttribute(
    'aria-hidden',
    'true',
  );

  detail.innerHTML = `
    <div class="history-v2-bg-layer" aria-hidden="true"></div>

    <header class="history-v2-header">
      <button
        type="button"
        class="history-v2-back"
        data-history-v2-action="close-detail"
        aria-label="履歴一覧へ戻る"
      >‹</button>

      <div class="history-v2-header-title">
        <h2>履歴詳細</h2>
        <p id="historyV2DetailDate"></p>
      </div>

      <div class="history-v2-header-spacer"></div>
    </header>

    <div class="history-v2-detail-hero" id="historyV2DetailHero"></div>

    <div
      id="historyV2DetailList"
      class="history-v2-detail-list"
    ></div>
  `;

  document.body.append(
    list,
    detail,
  );

  list.querySelector(
    '#historyV2Hero',
  )?.appendChild(
    createCoupleSilhouette(),
  );

  detail.querySelector(
    '#historyV2DetailHero',
  )?.appendChild(
    createCoupleSilhouette(),
  );

  list.addEventListener(
    'click',
    handleClick,
  );

  detail.addEventListener(
    'click',
    handleClick,
  );

  list.querySelector(
    '#historyV2SearchInput',
  )?.addEventListener(
    'input',
    (event) => {
      currentQuery =
        String(
          event.target?.value ?? '',
        )
          .trim()
          .toLowerCase();

      renderList();
    },
  );

  isBuilt = true;

  // 背景カスタマイズ側へDOM生成完了を通知。
  window.dispatchEvent(
    new CustomEvent(
      'calculator0209-history-v2-ready',
    ),
  );
}

function dedupeMessages(messages) {
  const result = [];
  const seenIds = new Set();

  for (
    const message
    of Array.isArray(messages)
      ? messages
      : []
  ) {
    if (!message) {
      continue;
    }

    if (message.id) {
      if (
        seenIds.has(
          message.id,
        )
      ) {
        continue;
      }

      seenIds.add(
        message.id,
      );
    }

    result.push(
      message,
    );
  }

  return result;
}

function normalizedMessages() {
  const uid =
    Firebase.getCurrentUid();

  return dedupeMessages(
    latestMessages,
  )
    .filter(
      (message) => {
        if (!currentQuery) {
          return true;
        }

        return String(
          message?.text ?? '',
        )
          .toLowerCase()
          .includes(
            currentQuery,
          );
      },
    )
    .map(
      (message) => ({
        ...message,
        _dateKey:
          dateKeyFromMessage(
            message,
          ),
        _isOwn:
          message?.senderId ===
          uid,
      }),
    )
    .sort(
      (a, b) =>
        messageTimeMs(b) -
        messageTimeMs(a),
    );
}

function groupByDate(messages) {
  const groups =
    new Map();

  messages.forEach(
    (message) => {
      const key =
        message._dateKey;

      if (
        !groups.has(key)
      ) {
        groups.set(
          key,
          [],
        );
      }

      groups
        .get(key)
        .push(message);
    },
  );

  return groups;
}

function createHistoryPreview(
  message,
) {
  const row =
    document.createElement('div');

  row.className =
    'history-v2-preview-row';

  const avatar =
    document.createElement('div');

  avatar.className =
    `history-v2-avatar ${
      message._isOwn
        ? 'is-own'
        : 'is-other'
    }`;

  avatar.textContent = '♥';

  const body =
    document.createElement('div');

  body.className =
    'history-v2-preview-body';

  const meta =
    document.createElement('div');

  meta.className =
    'history-v2-preview-meta';

  const who =
    document.createElement('strong');

  who.className =
    message._isOwn
      ? 'is-own'
      : 'is-other';

  who.textContent =
    message._isOwn
      ? 'あなた'
      : 'あの人';

  const time =
    document.createElement('time');

  time.textContent =
    formatTime(
      message,
    );

  meta.append(
    who,
    time,
  );

  const text =
    document.createElement('div');

  text.className =
    'history-v2-preview-text';

  text.textContent =
    message?.text ?? '';

  body.append(
    meta,
    text,
  );

  row.append(
    avatar,
    body,
  );

  return row;
}

function renderList() {
  buildScreens();

  const groupsEl =
    document.getElementById(
      'historyV2Groups',
    );

  const emptyEl =
    document.getElementById(
      'historyV2Empty',
    );

  if (
    !groupsEl ||
    !emptyEl
  ) {
    return;
  }

  const messages =
    normalizedMessages();

  if (
    messages.length === 0
  ) {
    groupsEl.replaceChildren();
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;

  const fragment =
    document.createDocumentFragment();

  const groups =
    groupByDate(
      messages,
    );

  groups.forEach(
    (
      items,
      dateKey,
    ) => {
      const section =
        document.createElement(
          'section',
        );

      section.className =
        'history-v2-day';

      const heading =
        document.createElement(
          'button',
        );

      heading.type =
        'button';

      heading.className =
        'history-v2-day-heading';

      heading.dataset
        .historyV2Date =
          dateKey;

      const date =
        document.createElement(
          'span',
        );

      date.className =
        'history-v2-date';

      date.textContent =
        formatDateLabel(
          dateKey,
        );

      const count =
        document.createElement(
          'span',
        );

      count.className =
        'history-v2-count';

      count.textContent =
        `${items.length}件`;

      heading.append(
        date,
        count,
      );

      const card =
        document.createElement(
          'button',
        );

      card.type =
        'button';

      card.className =
        'history-v2-card';

      card.dataset
        .historyV2Date =
          dateKey;

      items
        .slice(
          0,
          4,
        )
        .forEach(
          (message) => {
            card.appendChild(
              createHistoryPreview(
                message,
              ),
            );
          },
        );

      if (
        items.length > 4
      ) {
        const more =
          document.createElement(
            'div',
          );

        more.className =
          'history-v2-more';

        more.textContent =
          `ほか ${
            items.length - 4
          }件`;

        card.appendChild(
          more,
        );
      }

      section.append(
        heading,
        card,
      );

      fragment.appendChild(
        section,
      );
    },
  );

  groupsEl.replaceChildren(
    fragment,
  );
}

function renderDetail(
  dateKey,
) {
  const dateEl =
    document.getElementById(
      'historyV2DetailDate',
    );

  const listEl =
    document.getElementById(
      'historyV2DetailList',
    );

  if (
    !dateEl ||
    !listEl
  ) {
    return;
  }

  dateEl.textContent =
    formatDateLabel(
      dateKey,
    );

  const uid =
    Firebase.getCurrentUid();

  const messages =
    dedupeMessages(
      latestMessages,
    )
      .filter(
        (message) =>
          dateKeyFromMessage(
            message,
          ) ===
          dateKey,
      )
      .sort(
        (a, b) =>
          messageTimeMs(a) -
          messageTimeMs(b),
      );

  const fragment =
    document.createDocumentFragment();

  messages.forEach(
    (message) => {
      const isOwn =
        message?.senderId ===
        uid;

      const row =
        document.createElement(
          'div',
        );

      row.className =
        `history-v2-detail-row ${
          isOwn
            ? 'is-own'
            : 'is-other'
        }`;

      const bubble =
        document.createElement(
          'div',
        );

      bubble.className =
        'history-v2-detail-bubble';

      const text =
        document.createElement(
          'div',
        );

      text.className =
        'history-v2-detail-text';

      text.textContent =
        message?.text ?? '';

      const time =
        document.createElement(
          'time',
        );

      time.className =
        'history-v2-detail-time';

      time.textContent =
        formatTime(
          message,
        );

      bubble.append(
        text,
        time,
      );

      row.appendChild(
        bubble,
      );

      fragment.appendChild(
        row,
      );
    },
  );

  listEl.replaceChildren(
    fragment,
  );

  listEl.scrollTop = 0;
}

function stopSubscription() {
  if (
    unsubscribeHistory
  ) {
    unsubscribeHistory();
    unsubscribeHistory =
      null;
  }
}

async function startSubscription() {
  stopSubscription();

  if (
    typeof Firebase
      .ensureSignedIn ===
    'function'
  ) {
    try {
      await Firebase
        .ensureSignedIn();
    } catch (
      error
    ) {
      console.warn(
        '[message-history-v2] 認証確認に失敗しました',
        error,
      );
    }
  }

  const roomId =
    Firebase.getLocalRoomId();

  if (!roomId) {
    latestMessages = [];
    renderList();
    return;
  }

  unsubscribeHistory =
    Firebase
      .subscribeToMessages(
        roomId,
        (messages) => {
          latestMessages =
            Array.isArray(
              messages,
            )
              ? messages
              : [];

          renderList();

          if (
            selectedDateKey
          ) {
            renderDetail(
              selectedDateKey,
            );
          }
        },
        (error) => {
          console.warn(
            '[message-history-v2] 履歴取得に失敗しました',
            error,
          );
        },
      );
}

function openHistory() {
  buildScreens();

  const list =
    document.getElementById(
      LIST_ID,
    );

  const detail =
    document.getElementById(
      DETAIL_ID,
    );

  detail?.classList.remove(
    'is-open',
  );

  detail?.setAttribute(
    'aria-hidden',
    'true',
  );

  list?.classList.add(
    'is-open',
  );

  list?.setAttribute(
    'aria-hidden',
    'false',
  );

  document.body
    .classList
    .add(
      'history-v2-open',
    );

  startSubscription();
}

async function closeHistory() {
  const list =
    document.getElementById(
      LIST_ID,
    );

  const detail =
    document.getElementById(
      DETAIL_ID,
    );

  list?.classList.remove(
    'is-open',
  );

  detail?.classList.remove(
    'is-open',
  );

  list?.setAttribute(
    'aria-hidden',
    'true',
  );

  detail?.setAttribute(
    'aria-hidden',
    'true',
  );

  document.body
    .classList
    .remove(
      'history-v2-open',
    );

  selectedDateKey = null;

  stopSubscription();

  // 既存AI Space側の「履歴モード」も終了。
  try {
    const Messages =
      (
        await import(
          './messages.js'
        )
      ).default;

    if (
      Messages
        .isHistoryOpen()
    ) {
      Messages
        .toggleHistoryMode();
    }
  } catch (
    error
  ) {
    console.warn(
      '[message-history-v2] AI Spaceへの復帰に失敗しました',
      error,
    );
  }
}

function openDetail(
  dateKey,
) {
  selectedDateKey =
    dateKey;

  const list =
    document.getElementById(
      LIST_ID,
    );

  const detail =
    document.getElementById(
      DETAIL_ID,
    );

  list?.classList.remove(
    'is-open',
  );

  list?.setAttribute(
    'aria-hidden',
    'true',
  );

  detail?.classList.add(
    'is-open',
  );

  detail?.setAttribute(
    'aria-hidden',
    'false',
  );

  renderDetail(
    dateKey,
  );
}

function closeDetail() {
  selectedDateKey = null;

  const list =
    document.getElementById(
      LIST_ID,
    );

  const detail =
    document.getElementById(
      DETAIL_ID,
    );

  detail?.classList.remove(
    'is-open',
  );

  detail?.setAttribute(
    'aria-hidden',
    'true',
  );

  list?.classList.add(
    'is-open',
  );

  list?.setAttribute(
    'aria-hidden',
    'false',
  );
}

function handleClick(
  event,
) {
  if (
    !(
      event.target
      instanceof Element
    )
  ) {
    return;
  }

  const actionTarget =
    event.target.closest(
      '[data-history-v2-action]',
    );

  if (
    actionTarget
  ) {
    const action =
      actionTarget
        .dataset
        .historyV2Action;

    if (
      action ===
      'close-history'
    ) {
      closeHistory();
      return;
    }

    if (
      action ===
      'close-detail'
    ) {
      closeDetail();
      return;
    }
  }

  const dateTarget =
    event.target.closest(
      '[data-history-v2-date]',
    );

  const dateKey =
    dateTarget
      ?.dataset
      ?.historyV2Date;

  if (dateKey) {
    openDetail(
      dateKey,
    );
  }
}

function install() {
  buildScreens();

  const messages =
    document.getElementById(
      'messages',
    );

  if (!messages) {
    return;
  }

  const observer =
    new MutationObserver(
      () => {
        if (
          messages
            .classList
            .contains(
              'is-history-mode',
            )
        ) {
          openHistory();
        }
      },
    );

  observer.observe(
    messages,
    {
      attributes: true,
      attributeFilter: [
        'class',
      ],
    },
  );

  // 初期状態がすでに履歴の場合。
  if (
    messages
      .classList
      .contains(
        'is-history-mode',
      )
  ) {
    openHistory();
  }
}

if (
  document.readyState ===
  'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    install,
    {
      once: true,
    },
  );
} else {
  install();
}
