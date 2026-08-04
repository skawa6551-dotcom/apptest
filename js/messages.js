// ============================================================
// messages.js
// Workspace内「メッセージ」画面のDOM生成・開閉・リアルタイム送受信・
// 既読表示・入力中表示・オンライン状態・長押しアクション（リアクション/
// コピー/削除）を管理するモジュール。records.js/calendar.js/archive.jsと
// 同じ設計方針：
//
//   ・DOM生成・開閉・画面の中身の更新 … このファイル（messages.js）
//   ・画面遷移の調整（Workspace⇔Messages） … router.js
//   ・クリックの解釈・ディスパッチ … app.js
//   ・Firebaseとの通信 … firebase.js経由
//
// 【例外】長押し（ポインター押下の継続時間）検知だけは、app.jsの
// data-action委譲では表現できない「時間に基づくジェスチャー」のため、
// このファイル自身がメッセージ一覧要素へpointerdown/pointermove/
// pointerup/pointercancelを登録する。既存のkeypad長押し風フィードバック
// （app.js内のhandleKeypadPointerDown等）と同じ、局所的な例外として扱う。
//
// Firestoreのリアルタイム購読（メッセージ／ルーム）は、開いている間
// だけ張り続ける必要があるリスナーのため、open()で購読を開始し、
// close()で必ず解除する。
// ============================================================

import Firebase from './firebase.js';

/** メッセージ画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'messages';

/** 長押しと判定するまでの保持時間（ms） */
const LONG_PRESS_MS = 500;

/** 長押し判定中、これ以上動いたらキャンセルするしきい値（px） */
const LONG_PRESS_MOVE_THRESHOLD = 10;

/** 入力中表示を「まだ入力中」とみなす有効期限（ms） */
const TYPING_STALE_MS = 4000;

/** 入力中状態の書き込みを間引く間隔（ms） */
const TYPING_WRITE_THROTTLE_MS = 1500;

/** 入力が止まってから、自分から「入力中」を明示的に解除するまでの時間（ms） */
const TYPING_STOP_DEBOUNCE_MS = 2000;

/** オンライン状態のハートビート間隔（ms） */
const PRESENCE_HEARTBEAT_MS = 20000;

/** state:'online'でもlastSeenAtがこれより古ければオフライン扱いにする猶予（ms） */
const PRESENCE_ONLINE_STALE_MS = 45000;

/** 長押しメニューのクイックリアクション候補 */
const QUICK_REACTIONS = Object.freeze(['👍', '❤️', '😂', '😮', '😢', '🙏']);

// ------------------------------------------------------------
// モジュール内の状態
// ------------------------------------------------------------

let isBuilt = false;

let unsubscribeMessages = null;
let unsubscribeRoom = null;

let currentRoomId = null;
let currentUid = null;
let otherUid = null;

/** 直近のルームドキュメントの中身（memberIds/typing/presence等） */
let latestRoomData = null;

/** 直近のメッセージ一覧（長押しアクション時にidから本文等を引くためのキャッシュ） */
let latestMessages = [];

/** 直近の描画で存在が確認済みのメッセージid集合（新規メッセージの入場アニメーション判定用） */
let knownMessageIds = new Set();

let typingHideTimeoutId = null;
let typingStopTimer = null;
let lastTypingWriteAt = 0;

let presenceHeartbeatId = null;

let longPressTimer = null;
let longPressStartX = 0;
let longPressStartY = 0;

/** 長押しで選択中のメッセージ（アクションシートの対象） */
let selectedMessage = null;

// ------------------------------------------------------------
// DOM構築
// ------------------------------------------------------------

function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

function createContainer() {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = 'messages';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);
  return container;
}

function createHeader() {
  const header = document.createElement('header');
  header.className = 'messages-header';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-btn';
  backButton.dataset.action = 'close-messages';
  backButton.setAttribute('aria-label', '戻る');
  backButton.textContent = '‹';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'messages-title-group';

  const title = document.createElement('h2');
  title.className = 'messages-title';
  title.textContent = 'メッセージ';

  const status = document.createElement('p');
  status.id = 'messagesStatusLine';
  status.className = 'messages-status';
  status.setAttribute('aria-live', 'polite');

  titleGroup.appendChild(title);
  titleGroup.appendChild(status);

  const lockButton = document.createElement('button');
  lockButton.type = 'button';
  lockButton.className = 'icon-btn';
  lockButton.dataset.action = 'lock-now';
  lockButton.setAttribute('aria-label', '今すぐロック');
  lockButton.textContent = '🔒';

  header.appendChild(backButton);
  header.appendChild(titleGroup);
  header.appendChild(lockButton);

  return header;
}

function createMessageList() {
  const list = document.createElement('div');
  list.id = 'messagesList';
  list.className = 'messages-list';
  list.setAttribute('aria-live', 'polite');

  list.addEventListener('pointerdown', handleListPointerDown);
  list.addEventListener('pointermove', handleListPointerMove);
  list.addEventListener('pointerup', handleListPointerEnd);
  list.addEventListener('pointercancel', handleListPointerEnd);

  return list;
}

function createComposer() {
  const composer = document.createElement('div');
  composer.className = 'messages-composer';

  const input = document.createElement('textarea');
  input.id = 'messagesInput';
  input.className = 'messages-input';
  input.rows = 1;
  input.placeholder = 'メッセージを入力…';

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'messages-send-btn';
  sendButton.dataset.action = 'send-message';
  sendButton.textContent = '送信';

  composer.appendChild(input);
  composer.appendChild(sendButton);

  return composer;
}

/** 長押しメニュー（リアクション／コピー／削除）を作る。通常は非表示。 */
function createActionSheet() {
  const sheet = document.createElement('div');
  sheet.id = 'messagesActionSheet';
  sheet.className = 'messages-action-sheet';

  const preview = document.createElement('p');
  preview.id = 'messagesActionPreview';
  preview.className = 'messages-action-preview';

  const reactionsRow = document.createElement('div');
  reactionsRow.className = 'messages-action-reactions';
  QUICK_REACTIONS.forEach((emoji) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'messages-action-emoji-btn';
    button.dataset.action = 'react';
    button.dataset.emoji = emoji;
    button.textContent = emoji;
    reactionsRow.appendChild(button);
  });

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'messages-action-btn';
  copyButton.dataset.action = 'copy-message';
  copyButton.textContent = 'コピー';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.id = 'messagesActionDelete';
  deleteButton.className = 'messages-action-btn messages-action-btn--danger';
  deleteButton.dataset.action = 'delete-message';
  deleteButton.textContent = '削除';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'messages-action-btn messages-action-btn--cancel';
  cancelButton.dataset.action = 'cancel-action-sheet';
  cancelButton.textContent = 'キャンセル';

  sheet.appendChild(preview);
  sheet.appendChild(reactionsRow);
  sheet.appendChild(copyButton);
  sheet.appendChild(deleteButton);
  sheet.appendChild(cancelButton);

  return sheet;
}

/**
 * #messages の中身を構築する。既に構築済みの場合は何もしない（二重生成防止）。
 */
export function create() {
  if (isBuilt) return;

  const container = getContainer() ?? createContainer();

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(createMessageList());
  fragment.appendChild(createComposer());
  fragment.appendChild(createActionSheet());
  container.replaceChildren(fragment);

  isBuilt = true;
}

// ------------------------------------------------------------
// メッセージ一覧の描画
// ------------------------------------------------------------

/**
 * Firestoreのtimestampフィールドを「HH:MM」形式の表示用文字列に整形する。
 * サーバーで確定する前（送信直後の楽観的更新中）はtimestampがnullになる
 * ことがあるため、その場合は「送信中…」を返す。
 * @param {{toDate: () => Date}|null} timestamp
 * @returns {string}
 */
function formatMessageTime(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '送信中…';
  return formatClockTime(timestamp.toDate());
}

/**
 * DateをHH:MM形式に整形する（オンライン状態の最終確認時刻表示にも使う）。
 * @param {Date} date
 * @returns {string}
 */
function formatClockTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 自分が送ったメッセージについて、相手が読んだかどうかを判定する。
 * @param {object} message
 * @returns {boolean}
 */
function isReadByOther(message) {
  if (!otherUid) return false;
  return Array.isArray(message.readBy) && message.readBy.includes(otherUid);
}

/**
 * リアクションのmap（{uid: emoji}）から、絵文字ごとの件数表示行を作る。
 * 中身が無ければnullを返す。
 * @param {Object.<string,string>|undefined} reactions
 * @returns {HTMLElement|null}
 */
function createReactionsRow(reactions) {
  const entries = Object.values(reactions ?? {});
  if (entries.length === 0) return null;

  const counts = {};
  entries.forEach((emoji) => {
    counts[emoji] = (counts[emoji] ?? 0) + 1;
  });

  const row = document.createElement('div');
  row.className = 'messages-reactions';

  Object.entries(counts).forEach(([emoji, count]) => {
    const badge = document.createElement('span');
    badge.className = 'messages-reaction-badge';
    badge.textContent = count > 1 ? `${emoji} ${count}` : emoji;
    row.appendChild(badge);
  });

  return row;
}

/**
 * 1件分のメッセージ吹き出しを作る。
 * @param {object} message
 * @param {boolean} isNew - 直近の描画では存在しなかった、新規到着メッセージかどうか
 * @returns {HTMLElement}
 */
function createMessageBubble(message, isNew) {
  const isOwn = message.senderId === currentUid;

  const row = document.createElement('div');
  row.className = `messages-row ${isOwn ? 'messages-row--own' : 'messages-row--other'}${isNew ? ' messages-row--enter' : ''}`;
  row.dataset.messageId = message.id;

  const bubble = document.createElement('div');
  bubble.className = 'messages-bubble';

  const text = document.createElement('p');
  text.className = 'messages-bubble-text';
  text.textContent = message.text ?? '';

  const footer = document.createElement('div');
  footer.className = 'messages-bubble-footer';

  const time = document.createElement('span');
  time.className = 'messages-bubble-time';
  time.textContent = formatMessageTime(message.timestamp);
  footer.appendChild(time);

  if (isOwn) {
    const isRead = isReadByOther(message);
    const receipt = document.createElement('span');
    receipt.className = `messages-receipt${isRead ? ' is-read' : ''}`;
    receipt.textContent = isRead ? '✓✓' : '✓';
    receipt.setAttribute('aria-label', isRead ? '既読' : '送信済み');
    footer.appendChild(receipt);
  }

  bubble.appendChild(text);
  bubble.appendChild(footer);
  row.appendChild(bubble);

  const reactionsRow = createReactionsRow(message.reactions);
  if (reactionsRow) row.appendChild(reactionsRow);

  return row;
}

/** 入力中インジケーター（3つの点が並ぶ吹き出し）を作る。 */
function createTypingIndicatorRow() {
  const row = document.createElement('div');
  row.id = 'messagesTypingRow';
  row.className = 'messages-row messages-row--other';

  const bubble = document.createElement('div');
  bubble.className = 'messages-bubble messages-typing-bubble';

  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'messages-typing-dot';
    bubble.appendChild(dot);
  }

  row.appendChild(bubble);
  return row;
}

/**
 * メッセージ一覧を再描画し、最下部までスクロールする。
 * 新規到着メッセージにだけ入場アニメーション用のクラスを付け、
 * 既存メッセージ（既読・リアクション更新等での再描画）はアニメーションしない。
 * 描画後、まだ自分が既読にしていない他者のメッセージがあれば既読を付ける。
 * @param {object[]} messageList
 */
function renderMessages(messageList) {
  latestMessages = messageList;

  const listEl = document.getElementById('messagesList');
  if (!listEl) return;

  const fragment = document.createDocumentFragment();
  const currentIds = new Set();

  messageList.forEach((message) => {
    currentIds.add(message.id);
    const isNew = !knownMessageIds.has(message.id);
    fragment.appendChild(createMessageBubble(message, isNew));
  });

  listEl.replaceChildren(fragment);
  knownMessageIds = currentIds;

  updateTypingIndicatorDisplay();
  listEl.scrollTop = listEl.scrollHeight;

  messageList.forEach((message) => {
    if (message.senderId === currentUid) return;
    const readBy = message.readBy ?? [];
    if (readBy.includes(currentUid)) return;

    Firebase.markMessageAsRead(currentRoomId, message.id, currentUid, readBy).catch((error) => {
      console.error('[messages.js] 既読の更新に失敗しました', error);
    });
  });
}

// ------------------------------------------------------------
// ルーム情報（相手の入力中／オンライン状態）
// ------------------------------------------------------------

/**
 * 相手が「入力中」とみなせる状態かどうかを返す。
 * @returns {boolean}
 */
function isOtherTyping() {
  if (!latestRoomData || !otherUid) return false;
  const entry = latestRoomData.typing?.[otherUid];
  if (!entry || typeof entry.toMillis !== 'function') return false;
  return Date.now() - entry.toMillis() < TYPING_STALE_MS;
}

/**
 * 入力中インジケーターの表示/非表示を、一覧全体を再描画せずに切り替える。
 */
function updateTypingIndicatorDisplay() {
  const listEl = document.getElementById('messagesList');
  if (!listEl) return;

  const existingRow = document.getElementById('messagesTypingRow');

  if (isOtherTyping()) {
    if (!existingRow) {
      listEl.appendChild(createTypingIndicatorRow());
      listEl.scrollTop = listEl.scrollHeight;
    }
  } else if (existingRow) {
    existingRow.remove();
  }
}

/**
 * 入力中表示の有効期限が来た時点で、自動的に非表示へ切り替わるよう
 * タイマーを予約し直す（相手が入力を再開しない限り、次のスナップショットは
 * 来ないため、期限切れをこちら側のタイマーで検知する必要がある）。
 */
function scheduleTypingStaleCheck() {
  if (typingHideTimeoutId) {
    clearTimeout(typingHideTimeoutId);
    typingHideTimeoutId = null;
  }

  const entry = latestRoomData?.typing?.[otherUid];
  if (!entry || typeof entry.toMillis !== 'function') return;

  const remaining = TYPING_STALE_MS - (Date.now() - entry.toMillis());
  if (remaining > 0) {
    typingHideTimeoutId = setTimeout(updateTypingIndicatorDisplay, remaining + 50);
  }
}

/**
 * ヘッダー下の状態行（オンライン／最終オンライン時刻／入力中…）の文言を決める。
 * @returns {string}
 */
function computeStatusText() {
  if (!otherUid) return '';
  if (isOtherTyping()) return '入力中…';

  const presence = latestRoomData?.presence?.[otherUid];
  if (!presence || !presence.lastSeenAt || typeof presence.lastSeenAt.toMillis !== 'function') {
    return '';
  }

  const elapsed = Date.now() - presence.lastSeenAt.toMillis();
  if (presence.state === 'online' && elapsed < PRESENCE_ONLINE_STALE_MS) {
    return 'オンライン';
  }

  return `最終オンライン ${formatClockTime(presence.lastSeenAt.toDate())}`;
}

function updateStatusLine() {
  const el = document.getElementById('messagesStatusLine');
  if (el) el.textContent = computeStatusText();
}

/**
 * ルームドキュメントの変化を受け取る（相手のuid特定・入力中・オンライン状態）。
 * @param {object} roomData
 */
function onRoomUpdate(roomData) {
  latestRoomData = roomData;

  if (Array.isArray(roomData.memberIds)) {
    otherUid = roomData.memberIds.find((id) => id !== currentUid) ?? null;
  }

  updateStatusLine();
  updateTypingIndicatorDisplay();
  scheduleTypingStaleCheck();
}

// ------------------------------------------------------------
// 送信・入力中通知
// ------------------------------------------------------------

/**
 * 入力欄の現在の値を取得する。
 * @returns {string}
 */
export function getInputValue() {
  const input = document.getElementById('messagesInput');
  return input ? input.value : '';
}

/** 入力欄を空にする（送信後に呼ぶ）。 */
export function clearInput() {
  const input = document.getElementById('messagesInput');
  if (input) input.value = '';
}

/**
 * 入力欄への入力イベントのたびに呼ぶ。書き込み頻度を間引きつつ、
 * 「入力中」状態をルームドキュメントへ反映する。一定時間入力が
 * 止まったら、自分から明示的に「入力中」を解除する。
 */
export function notifyTyping() {
  if (!currentRoomId || !currentUid) return;

  const now = Date.now();
  if (now - lastTypingWriteAt > TYPING_WRITE_THROTTLE_MS) {
    lastTypingWriteAt = now;
    Firebase.updateTypingState(currentRoomId, currentUid, true).catch(() => {});
  }

  if (typingStopTimer) clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(() => {
    lastTypingWriteAt = 0;
    Firebase.updateTypingState(currentRoomId, currentUid, false).catch(() => {});
  }, TYPING_STOP_DEBOUNCE_MS);
}

/**
 * 現在の入力内容を送信する。送信と同時に「入力中」状態は明示的に解除する。
 * @returns {Promise<void>}
 */
export async function sendMessage() {
  const text = getInputValue();
  if (text.trim() === '' || !currentRoomId) return;

  if (typingStopTimer) {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
  }
  lastTypingWriteAt = 0;
  if (currentUid) {
    Firebase.updateTypingState(currentRoomId, currentUid, false).catch(() => {});
  }

  const uid = Firebase.getCurrentUid();
  const clientId = Firebase.getOrCreateClientId();

  clearInput();
  await Firebase.sendTextMessage(currentRoomId, uid, clientId, text);
}

// ------------------------------------------------------------
// オンライン状態
// ------------------------------------------------------------

function handleVisibilityChange() {
  if (!currentRoomId || !currentUid) return;

  if (document.visibilityState === 'hidden') {
    Firebase.updatePresence(currentRoomId, currentUid, false).catch(() => {});
  } else {
    Firebase.updatePresence(currentRoomId, currentUid, true).catch(() => {});
  }
}

function startPresence() {
  if (!currentRoomId || !currentUid) return;

  Firebase.updatePresence(currentRoomId, currentUid, true).catch(() => {});

  presenceHeartbeatId = setInterval(() => {
    Firebase.updatePresence(currentRoomId, currentUid, true).catch(() => {});
  }, PRESENCE_HEARTBEAT_MS);

  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function stopPresence() {
  if (presenceHeartbeatId) {
    clearInterval(presenceHeartbeatId);
    presenceHeartbeatId = null;
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  if (currentRoomId && currentUid) {
    Firebase.updatePresence(currentRoomId, currentUid, false).catch(() => {});
  }
}

// ------------------------------------------------------------
// 長押しアクション（リアクション／コピー／削除）
// ------------------------------------------------------------

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleListPointerDown(event) {
  const row = event.target.closest('.messages-row');
  if (!row || !row.dataset.messageId) return;

  clearLongPressTimer();
  longPressStartX = event.clientX;
  longPressStartY = event.clientY;

  longPressTimer = setTimeout(() => {
    openActionSheetForMessage(row.dataset.messageId);
  }, LONG_PRESS_MS);
}

function handleListPointerMove(event) {
  if (!longPressTimer) return;

  const dx = Math.abs(event.clientX - longPressStartX);
  const dy = Math.abs(event.clientY - longPressStartY);
  if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
    clearLongPressTimer();
  }
}

function handleListPointerEnd() {
  clearLongPressTimer();
}

/**
 * 指定したメッセージのアクションシートを開く。
 * @param {string} messageId
 */
function openActionSheetForMessage(messageId) {
  const message = latestMessages.find((entry) => entry.id === messageId);
  if (!message) return;

  selectedMessage = message;

  const preview = document.getElementById('messagesActionPreview');
  if (preview) preview.textContent = (message.text ?? '').slice(0, 60);

  const deleteButton = document.getElementById('messagesActionDelete');
  if (deleteButton) deleteButton.hidden = message.senderId !== currentUid;

  const sheet = document.getElementById('messagesActionSheet');
  if (sheet) sheet.classList.add('is-open');
}

/** アクションシートを閉じる。 */
export function closeActionSheet() {
  const sheet = document.getElementById('messagesActionSheet');
  if (sheet) sheet.classList.remove('is-open');
  selectedMessage = null;
}

/**
 * 選択中のメッセージへリアクションする。既に同じ絵文字でリアクション済みなら取り消す。
 * @param {string} emoji
 */
export function reactToSelectedMessage(emoji) {
  if (!selectedMessage || !currentRoomId || !currentUid) return;

  const myCurrentReaction = selectedMessage.reactions?.[currentUid];
  const nextEmoji = myCurrentReaction === emoji ? null : emoji;

  Firebase.setMessageReaction(currentRoomId, selectedMessage.id, currentUid, nextEmoji).catch((error) => {
    console.error('[messages.js] リアクションの更新に失敗しました', error);
  });

  closeActionSheet();
}

/**
 * 選択中のメッセージの本文をクリップボードへコピーする。
 * @returns {Promise<void>}
 */
export async function copySelectedMessage() {
  if (!selectedMessage) return;

  const text = selectedMessage.text ?? '';
  closeActionSheet();

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
  }
}

/**
 * 選択中のメッセージを削除する（自分が送信したものだけ。念のためここでも確認する。
 * 最終的な強制はFirestoreのセキュリティルール側で行う）。
 * @returns {Promise<void>}
 */
export async function deleteSelectedMessage() {
  if (!selectedMessage || !currentRoomId) return;
  if (selectedMessage.senderId !== currentUid) return;

  const messageId = selectedMessage.id;
  closeActionSheet();

  await Firebase.deleteMessage(currentRoomId, messageId);
}

// ------------------------------------------------------------
// 画面の開閉
// ------------------------------------------------------------

/**
 * メッセージ画面を表示する。サインインを確認したうえで、
 * メッセージ・ルーム両方の購読とオンライン状態の送信を開始する。
 * @returns {Promise<void>}
 */
export async function open() {
  const container = getContainer();
  if (!container) return;

  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');

  currentRoomId = Firebase.getLocalRoomId();
  if (!currentRoomId) {
    console.warn('[messages.js] ルームIDが見つからないため、メッセージを購読できません。');
    return;
  }

  currentUid = await Firebase.ensureSignedIn();

  stopSubscriptions();
  knownMessageIds = new Set();
  unsubscribeMessages = Firebase.subscribeToMessages(currentRoomId, renderMessages);
  unsubscribeRoom = Firebase.subscribeToRoom(currentRoomId, onRoomUpdate);

  startPresence();
}

/**
 * メッセージ画面を非表示にする。購読・タイマー・オンライン状態を必ず後片付けする。
 */
export function close() {
  stopSubscriptions();
  stopPresence();
  clearLongPressTimer();
  closeActionSheet();

  if (typingStopTimer) {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
  }
  if (currentRoomId && currentUid) {
    Firebase.updateTypingState(currentRoomId, currentUid, false).catch(() => {});
  }

  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
}

/** メッセージ／ルームの購読と、入力中表示の期限切れタイマーを解除する。 */
function stopSubscriptions() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
  if (typingHideTimeoutId) {
    clearTimeout(typingHideTimeoutId);
    typingHideTimeoutId = null;
  }
}

/**
 * メッセージ画面が現在開いているかどうかを返す。
 * @returns {boolean}
 */
export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

const Messages = {
  create,
  open,
  close,
  isOpen,
  getInputValue,
  clearInput,
  sendMessage,
  notifyTyping,
  closeActionSheet,
  reactToSelectedMessage,
  copySelectedMessage,
  deleteSelectedMessage,
};

export default Messages;