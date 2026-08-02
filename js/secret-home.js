// ============================================================
// secret-home.js
// 秘密ホーム画面（#secretHome）のDOM生成と開閉状態を管理するモジュール。
//
// 「0209」の入力判定はここでは一切行わない（app.js側の責務）。
// このファイルはあくまで「秘密ホームという画面そのもの」の
//   ・DOM構築（create）
//   ・表示（open）
//   ・非表示（close）
//   ・現在開いているかどうかの参照（isOpen）
// だけを担当する。calculator.js等の他モジュールと異なり、
// この画面専用にDOM操作を行うことを役割として持つ。
// ============================================================

/** 秘密ホームのDOMを差し込む先のコンテナのid（index.htmlに静的に用意済み） */
const CONTAINER_ID = 'secretHome';

/**
 * カードの定義データ。表示ラベルと data-secret 属性の値の対応表。
 * ここに1件追加するだけでカードが1枚増える。
 */
const CARD_DEFINITIONS = Object.freeze([
  Object.freeze({ label: 'チャット', key: 'chat', icon: '💬' }),
  Object.freeze({ label: 'カレンダー', key: 'calendar', icon: '📅' }),
  Object.freeze({ label: '写真', key: 'photo', icon: '🖼️' }),
  Object.freeze({ label: '行きたい場所', key: 'places', icon: '📍' }),
  Object.freeze({ label: '設定', key: 'settings', icon: '⚙️' }),
]);

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/**
 * コンテナ要素（#secretHome）を取得する。
 * @returns {HTMLElement|null}
 */
function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

/**
 * ヘッダー（戻るボタン＋タイトル）を作る。
 * @returns {HTMLElement}
 */
function createHeader() {
  const header = document.createElement('header');
  header.className = 'secret-home-header';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-btn';
  backButton.dataset.action = 'close-secret-home';
  backButton.setAttribute('aria-label', '戻る');
  backButton.textContent = '‹';

  const title = document.createElement('h2');
  title.className = 'secret-home-title';
  title.textContent = 'Secret Home';

  header.appendChild(backButton);
  header.appendChild(title);

  return header;
}

/**
 * 1枚分のカード（button要素）を作る。
 * @param {{label: string, key: string, icon: string}} definition
 * @returns {HTMLButtonElement}
 */
function createCard(definition) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'secret-home-card';
  card.dataset.secret = definition.key;

  const icon = document.createElement('span');
  icon.className = 'secret-home-card-icon';
  icon.textContent = definition.icon;

  const label = document.createElement('span');
  label.className = 'secret-home-card-label';
  label.textContent = definition.label;

  card.appendChild(icon);
  card.appendChild(label);

  return card;
}

/**
 * CARD_DEFINITIONSからカード一覧（main要素）を作る。
 * @returns {HTMLElement}
 */
function createMain() {
  const main = document.createElement('main');
  main.className = 'secret-home-main';

  const fragment = document.createDocumentFragment();
  CARD_DEFINITIONS.forEach((definition) => {
    fragment.appendChild(createCard(definition));
  });
  main.appendChild(fragment);

  return main;
}

/**
 * #secretHome の中身（ヘッダー＋カード一覧）を構築する。
 * 既に構築済みの場合は何もしない（二重生成防止）。
 * createElementとDocumentFragmentのみを使い、innerHTML等は使用しない。
 */
export function create() {
  if (isBuilt) return;

  const container = getContainer();
  if (!container) {
    console.warn(`[secret-home.js] #${CONTAINER_ID} が見つかりません`);
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(createMain());
  container.appendChild(fragment);

  isBuilt = true;
}

/**
 * 秘密ホーム画面を表示する。
 */
export function open() {
  const container = getContainer();
  if (!container) return;

  container.scrollTop = 0;
  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');
}

/**
 * 秘密ホーム画面を非表示にする。
 */
export function close() {
  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
  container.scrollTop = 0;
}

/**
 * 秘密ホーム画面が現在開いているかどうかを返す。
 * @returns {boolean}
 */
export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

const SecretHome = {
  create,
  open,
  close,
  isOpen,
};

export default SecretHome;