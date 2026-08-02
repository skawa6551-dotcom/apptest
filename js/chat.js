// ============================================================
// chat.js
// Secret Home内「チャット」画面のDOM生成と開閉状態を管理するモジュール。
//
// 現時点ではUIのみを提供する。Firebase等のバックエンド接続・永続化は
// 一切行わない。addMessage()もローカルの画面表示に1件追加するだけで、
// 送信先や保存先は持たない。
//
// secret-home.jsと同じ方針：この画面専用のDOM操作（生成・開閉）だけを
// 担当し、「送信ボタンが押されたときに何をするか」という判断はapp.js側で行う。
// ============================================================

/** チャット画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'chatScreen';

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/**
 * コンテナ要素（#chatScreen）を取得する。
 * @returns {HTMLElement|null}
 */
function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

/**
 * コンテナ要素（#chatScreen）を新規作成し、bodyへ追加する。
 * secret-home.jsと異なり、静的HTMLにコンテナを用意していないため、
 * ここで最初にdivごと作る。
 * @returns {HTMLElement}
 */
function createContainer() {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = 'chat-screen';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);
  return container;
}

/**
 * ヘッダー（戻るボタン＋タイトル）を作る。
 * @returns {HTMLElement}
 */
function createHeader() {
  const header = document.createElement('header');
  header.className = 'chat-header';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-btn';
  backButton.dataset.action = 'close-chat';
  backButton.setAttribute('aria-label', '戻る');
  backButton.textContent = '‹';

  const title = document.createElement('h2');
  title.className = 'chat-title';
  title.textContent = 'チャット';

  header.appendChild(backButton);
  header.appendChild(title);

  return header;
}

/**
 * メッセージ一覧（空の状態）を作る。
 * @returns {HTMLElement}
 */
function createMessageList() {
  const list = document.createElement('ul');
  list.id = 'chatMessageList';
  list.className = 'chat-message-list';
  list.setAttribute('aria-live', 'polite');
  return list;
}

/**
 * 入力欄＋送信ボタンを作る。
 * フォーム送信によるページ遷移を避けるため<form>は使わず、
 * 送信ボタンはtype="button"にしてクリックイベント委譲だけで処理する。
 * @returns {HTMLElement}
 */
function createComposer() {
  const composer = document.createElement('div');
  composer.className = 'chat-composer';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'chatInput';
  input.className = 'chat-input';
  input.placeholder = 'メッセージを入力';
  input.autocomplete = 'off';

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'chat-send-btn';
  sendButton.dataset.action = 'send-chat-message';
  sendButton.textContent = '送信';

  composer.appendChild(input);
  composer.appendChild(sendButton);

  return composer;
}

/**
 * #chatScreen の中身（ヘッダー＋メッセージ一覧＋入力欄）を構築する。
 * 既に構築済みの場合は何もしない（二重生成防止）。
 */
export function create() {
  if (isBuilt) return;

  const container = getContainer() ?? createContainer();

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(createMessageList());
  fragment.appendChild(createComposer());
  container.appendChild(fragment);

  isBuilt = true;
}

/**
 * チャット画面を表示する。
 */
export function open() {
  const container = getContainer();
  if (!container) return;

  container.scrollTop = 0;
  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');
}

/**
 * チャット画面を非表示にする。
 */
export function close() {
  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
  container.scrollTop = 0;
}

/**
 * チャット画面が現在開いているかどうかを返す。
 * @returns {boolean}
 */
export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

/**
 * メッセージ一覧の末尾に1件追加する（画面表示のみ。送信・保存は行わない）。
 * 空文字列は追加しない。
 * @param {string} text
 */
export function addMessage(text) {
  if (typeof text !== 'string' || text.trim() === '') return;

  const list = document.getElementById('chatMessageList');
  if (!list) return;

  const item = document.createElement('li');
  item.className = 'chat-message';
  item.textContent = text;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

/**
 * 入力欄の現在の値を取得する。
 * @returns {string}
 */
export function getInputValue() {
  const input = document.getElementById('chatInput');
  return input ? input.value : '';
}

/**
 * 入力欄を空にする。
 */
export function clearInput() {
  const input = document.getElementById('chatInput');
  if (input) input.value = '';
}

const Chat = {
  create,
  open,
  close,
  isOpen,
  addMessage,
  getInputValue,
  clearInput,
};

export default Chat;