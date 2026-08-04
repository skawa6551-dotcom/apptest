// ============================================================
// messages.js
// Workspace内「メッセージ」画面のDOM生成・開閉・リアルタイム送受信を
// 管理するモジュール。records.js/calendar.js/archive.jsと同じ設計方針：
//
//   ・DOM生成・開閉・画面の中身の更新 … このファイル（messages.js）
//   ・画面遷移の調整（Workspace⇔Messages） … router.js
//   ・クリックの解釈・ディスパッチ … app.js
//   ・Firebaseとの通信 … firebase.js経由
//
// Firestoreのリアルタイム購読（onSnapshot）は、他の画面には無い
// 「開いている間だけ張り続ける必要があるリスナー」のため、
// open()で購読を開始し、close()で必ず解除する
// （画面を閉じた後も裏で読み取りが走り続けるのを防ぐため）。
// ============================================================

import Firebase from './firebase.js';

/** メッセージ画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'messages';

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/** 現在購読中のメッセージ一覧の解除関数。未購読ならnull。 */
let unsubscribeMessages = null;

/** 現在接続中のルームID（open()のたびにFirebase.getLocalRoomId()から取得する） */
let currentRoomId = null;

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

  const title = document.createElement('h2');
  title.className = 'messages-title';
  title.textContent = 'メッセージ';

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

function createMessageList() {
  const list = document.createElement('div');
  list.id = 'messagesList';
  list.className = 'messages-list';
  list.setAttribute('aria-live', 'polite');
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

  const date = timestamp.toDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 1件分のメッセージ吹き出しを作る。
 * @param {object} message
 * @param {string} currentUid
 * @returns {HTMLElement}
 */
function createMessageBubble(message, currentUid) {
  const isOwn = message.senderId === currentUid;

  const row = document.createElement('div');
  row.className = `messages-row ${isOwn ? 'messages-row--own' : 'messages-row--other'}`;

  const bubble = document.createElement('div');
  bubble.className = 'messages-bubble';

  const text = document.createElement('p');
  text.className = 'messages-bubble-text';
  text.textContent = message.text ?? '';

  const time = document.createElement('span');
  time.className = 'messages-bubble-time';
  time.textContent = formatMessageTime(message.timestamp);

  bubble.appendChild(text);
  bubble.appendChild(time);
  row.appendChild(bubble);

  return row;
}

/**
 * メッセージ一覧を再描画し、最下部までスクロールする。
 * @param {object[]} messageList
 */
function renderMessages(messageList) {
  const listEl = document.getElementById('messagesList');
  if (!listEl) return;

  const currentUid = Firebase.getCurrentUid();
  const fragment = document.createDocumentFragment();

  messageList.forEach((message) => {
    fragment.appendChild(createMessageBubble(message, currentUid));
  });

  listEl.replaceChildren(fragment);
  listEl.scrollTop = listEl.scrollHeight;
}

// ------------------------------------------------------------
// 送信
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
 * 現在の入力内容を送信する。
 * @returns {Promise<void>}
 */
export async function sendMessage() {
  const text = getInputValue();
  if (text.trim() === '' || !currentRoomId) return;

  const uid = Firebase.getCurrentUid();
  const clientId = Firebase.getOrCreateClientId();

  clearInput();
  await Firebase.sendTextMessage(currentRoomId, uid, clientId, text);
}

// ------------------------------------------------------------
// 画面の開閉
// ------------------------------------------------------------

/**
 * メッセージ画面を表示する。サインインを確認したうえで、
 * 現在のルームのメッセージ購読を開始する。
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

  await Firebase.ensureSignedIn();

  stopSubscription();
  unsubscribeMessages = Firebase.subscribeToMessages(currentRoomId, renderMessages);
}

/**
 * メッセージ画面を非表示にする。開いていた購読は必ず解除する。
 */
export function close() {
  stopSubscription();

  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
}

/** メッセージ購読を解除する（close()から呼ぶ、または再購読前のクリーンアップ用）。 */
function stopSubscription() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
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
};

export default Messages;