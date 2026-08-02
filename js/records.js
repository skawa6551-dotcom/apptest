// ============================================================
// records.js
// Workspace内「記録」画面のDOM生成・開閉・入力送信を管理するモジュール。
//
// 見た目は「AIチャット」ではなく、ちょっとした質問やメモを書き留める
// シンプルなツールという体裁にする（吹き出し形式の会話ログ等は表示しない）。
// 送信すると入力欄はすぐに空になり、通常画面には何も残らない
// （＝chat.jsが持っていたメッセージ一覧表示は廃止）。
// 送信内容はメモリ上のアーカイブ配列にだけ保持する。
// 現時点ではアーカイブを閲覧するUIは無いが、将来のArchive画面・検索・
// Firebase同期のために、データ構造（RecordEntry）だけ先に用意しておく。
// ============================================================

/** 記録画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'records';

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/**
 * @typedef {Object} RecordEntry
 * @property {string} text
 * @property {number} timestamp
 */

/**
 * 送信された内容の保管庫。
 * 通常画面では一切表示せず、将来のArchive画面から参照する想定。
 * push()するだけで再代入はしないため const にする。
 * @type {RecordEntry[]}
 */
const archive = [];

/**
 * コンテナ要素（#records）を取得する。
 * @returns {HTMLElement|null}
 */
function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

/**
 * コンテナ要素（#records）を新規作成し、bodyへ追加する。
 * workspace.jsと異なり、静的HTMLにコンテナを用意していないため、
 * chat.jsと同様ここで最初にdivごと作る。
 * @returns {HTMLElement}
 */
function createContainer() {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = 'records';
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
  header.className = 'records-header';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-btn';
  backButton.dataset.action = 'close-records';
  backButton.setAttribute('aria-label', '戻る');
  backButton.textContent = '‹';

  const title = document.createElement('h2');
  title.className = 'records-title';
  title.textContent = '記録';

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
 * 本文（案内文＋入力欄＋送信ボタン）を作る。
 * 過去のやり取りを一覧表示する要素は意図的に持たない。
 * @returns {HTMLElement}
 */
function createBody() {
  const body = document.createElement('div');
  body.className = 'records-body';

  const prompt = document.createElement('p');
  prompt.className = 'records-prompt';
  prompt.textContent = '気になることや、残しておきたいことを書いてください。';

  const input = document.createElement('textarea');
  input.id = 'recordsInput';
  input.className = 'records-input';
  input.rows = 4;
  input.placeholder = 'ここに入力…';

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'records-send-btn';
  sendButton.dataset.action = 'send-record';
  sendButton.textContent = '送信';

  body.appendChild(prompt);
  body.appendChild(input);
  body.appendChild(sendButton);

  return body;
}

/**
 * #records の中身（ヘッダー＋本文）を構築する。
 * 既に構築済みの場合は何もしない（二重生成防止）。
 * appendChild()ではなくreplaceChildren()を使うことで、将来create()が
 * 再度呼ばれるケースになっても、既存の子要素を置き換える形で安全に動作する。
 */
export function create() {
  if (isBuilt) return;

  const container = getContainer() ?? createContainer();

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(createBody());
  container.replaceChildren(fragment);

  isBuilt = true;
}

/**
 * 記録画面を表示する。
 */
export function open() {
  const container = getContainer();
  if (!container) return;

  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');
}

/**
 * 記録画面を非表示にする。
 */
export function close() {
  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
}

/**
 * 記録画面が現在開いているかどうかを返す。
 * @returns {boolean}
 */
export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

/**
 * 入力欄の現在の値を取得する。
 * @returns {string}
 */
export function getInputValue() {
  const input = document.getElementById('recordsInput');
  return input ? input.value : '';
}

/**
 * 入力欄を空にする（送信後、画面から内容を消すために使う）。
 * 空にした直後にフォーカスも戻し、連続で次のメモを入力しやすくする。
 */
export function clearInput() {
  const input = document.getElementById('recordsInput');
  if (!input) return;

  input.value = '';
  input.focus();
}

/**
 * 入力内容をアーカイブへ保存する（通常画面には一切表示しない）。
 * 空文字列・空白のみの内容は保存しない。
 *
 * TODO: 現在はメモリ上の配列に保存するだけ。将来的には
 *   saveToArchive() → ArchiveService.save() のような形で、
 *   保存先を Storage（localStorage）や Firebase へ差し替えられる
 *   ようにする。呼び出し側（app.jsのhandleSendRecord）は
 *   このシグネチャ（textを受け取るだけ）を変えずに済むようにしたい。
 * @param {string} text
 */
export function saveToArchive(text) {
  if (typeof text !== 'string' || text.trim() === '') return;
  archive.push({ text: text.trim(), timestamp: Date.now() });
}

/**
 * アーカイブ全件を返す（将来のArchive画面・検索・Firebase同期用）。
 * 内部配列そのものへの参照は渡さず、複製を返す。
 * @returns {RecordEntry[]}
 */
export function getArchive() {
  return archive.map((entry) => ({ ...entry }));
}

const Records = {
  create,
  open,
  close,
  isOpen,
  getInputValue,
  clearInput,
  saveToArchive,
  getArchive,
};

export default Records;