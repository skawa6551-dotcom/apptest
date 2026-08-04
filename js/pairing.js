// ============================================================
// pairing.js
// メッセージ機能を初めて使う際の「ペアリング」画面
// （表示名入力 → 招待コードを発行する／入力する）のDOM生成・開閉・
// 状態管理を行うモジュール。records.js/calendar.js/archive.jsと
// 同じ設計方針を踏襲する：
//
//   ・DOM生成・開閉・画面の中身の更新 … このファイル（pairing.js）
//   ・画面遷移の調整（Workspace⇔Pairing⇔Messages） … router.js
//   ・クリックの解釈・ディスパッチ … app.js
//   ・Firebaseとの通信 … firebase.js経由（このファイル自身がFirestore/Auth
//     のAPIを直接呼び出す。ただしDOM操作と混同しないよう、通信処理と
//     DOM更新の関数ははっきり分けて書く）
// ============================================================

import Firebase from './firebase.js';

/** ペアリング画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'pairing';

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/** ルームがactiveになったこと（ペアリング成立）を検知した時に呼ぶコールバック */
let onPairedCallback = null;

/** generateInvite()実行中に張っているルーム購読の解除関数。未購読ならnull。 */
let unsubscribeRoom = null;

/** 発行したルームID（成立検知時にonPairedCallbackへ渡す） */
let pendingRoomId = null;

// ------------------------------------------------------------
// DOM構築
// ------------------------------------------------------------

function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

function createContainer() {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = 'pairing';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);
  return container;
}

function createHeader() {
  const header = document.createElement('header');
  header.className = 'pairing-header';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-btn';
  backButton.dataset.action = 'close-pairing';
  backButton.setAttribute('aria-label', '戻る');
  backButton.textContent = '‹';

  const title = document.createElement('h2');
  title.className = 'pairing-title';
  title.textContent = 'メッセージを始める';

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

/** 表示名入力パネル（初回のみ表示） */
function createNamePanel() {
  const panel = document.createElement('div');
  panel.id = 'pairingNamePanel';
  panel.className = 'pairing-panel';

  const message = document.createElement('p');
  message.className = 'pairing-message';
  message.textContent = '相手に表示する名前を入力してください。';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'pairingNameInput';
  input.className = 'pairing-input';
  input.placeholder = 'お名前';
  input.maxLength = 20;
  input.autocomplete = 'off';

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'pairing-primary-btn';
  submitButton.dataset.action = 'save-display-name';
  submitButton.textContent = '次へ';

  panel.appendChild(message);
  panel.appendChild(input);
  panel.appendChild(submitButton);

  return panel;
}

/** 「発行する／入力する」選択パネル */
function createChoicePanel() {
  const panel = document.createElement('div');
  panel.id = 'pairingChoicePanel';
  panel.className = 'pairing-panel';

  const message = document.createElement('p');
  message.className = 'pairing-message';
  message.textContent = '招待コードを発行するか、受け取ったコードを入力してください。';

  const generateButton = document.createElement('button');
  generateButton.type = 'button';
  generateButton.className = 'pairing-primary-btn';
  generateButton.dataset.action = 'choose-generate';
  generateButton.textContent = '招待コードを発行する';

  const joinButton = document.createElement('button');
  joinButton.type = 'button';
  joinButton.className = 'pairing-secondary-btn';
  joinButton.dataset.action = 'choose-join';
  joinButton.textContent = '招待コードを入力する';

  panel.appendChild(message);
  panel.appendChild(generateButton);
  panel.appendChild(joinButton);

  return panel;
}

/** 招待コード発行・待機パネル */
function createGeneratePanel() {
  const panel = document.createElement('div');
  panel.id = 'pairingGeneratePanel';
  panel.className = 'pairing-panel';

  const message = document.createElement('p');
  message.className = 'pairing-message';
  message.textContent = 'このコードを相手に伝えてください（10分間有効）。';

  const codeDisplay = document.createElement('p');
  codeDisplay.id = 'pairingCodeDisplay';
  codeDisplay.className = 'pairing-code-display';
  codeDisplay.setAttribute('aria-live', 'polite');

  const status = document.createElement('p');
  status.id = 'pairingGenerateStatus';
  status.className = 'pairing-status';
  status.setAttribute('aria-live', 'polite');

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'pairing-secondary-btn';
  backButton.dataset.action = 'back-to-choice';
  backButton.textContent = '戻る';

  panel.appendChild(message);
  panel.appendChild(codeDisplay);
  panel.appendChild(status);
  panel.appendChild(backButton);

  return panel;
}

/** 招待コード入力パネル */
function createJoinPanel() {
  const panel = document.createElement('div');
  panel.id = 'pairingJoinPanel';
  panel.className = 'pairing-panel';

  const message = document.createElement('p');
  message.className = 'pairing-message';
  message.textContent = '受け取った6桁のコードを入力してください。';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'pairingJoinInput';
  input.className = 'pairing-input pairing-code-input';
  input.placeholder = '例：A2B4C6';
  input.maxLength = 6;
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';

  const error = document.createElement('p');
  error.id = 'pairingJoinError';
  error.className = 'pairing-error';
  error.hidden = true;
  error.setAttribute('aria-live', 'assertive');

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'pairing-primary-btn';
  submitButton.dataset.action = 'submit-join-code';
  submitButton.textContent = '参加する';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'pairing-secondary-btn';
  backButton.dataset.action = 'back-to-choice';
  backButton.textContent = '戻る';

  panel.appendChild(message);
  panel.appendChild(input);
  panel.appendChild(error);
  panel.appendChild(submitButton);
  panel.appendChild(backButton);

  return panel;
}

/**
 * #pairing の中身を構築する。既に構築済みの場合は何もしない（二重生成防止）。
 */
export function create() {
  if (isBuilt) return;

  const container = getContainer() ?? createContainer();

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeader());
  fragment.appendChild(createNamePanel());
  fragment.appendChild(createChoicePanel());
  fragment.appendChild(createGeneratePanel());
  fragment.appendChild(createJoinPanel());
  container.replaceChildren(fragment);

  isBuilt = true;
}

// ------------------------------------------------------------
// パネルの切り替え
// ------------------------------------------------------------

const PANEL_IDS = Object.freeze([
  'pairingNamePanel',
  'pairingChoicePanel',
  'pairingGeneratePanel',
  'pairingJoinPanel',
]);

/**
 * 指定したパネルだけを表示し、他は隠す。
 * @param {string} visiblePanelId
 */
function showOnlyPanel(visiblePanelId) {
  PANEL_IDS.forEach((panelId) => {
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = panelId !== visiblePanelId;
  });
}

/** 表示名入力パネルを表示する。 */
export function showNamePanel() {
  showOnlyPanel('pairingNamePanel');
}

/** 「発行する／入力する」選択パネルを表示する。 */
export function showChoicePanel() {
  showOnlyPanel('pairingChoicePanel');
}

/** 招待コード入力パネルを表示する（エラー表示はクリアする）。 */
export function showJoinPanel() {
  clearJoinError();
  showOnlyPanel('pairingJoinPanel');
}

/** 招待コード発行・待機パネルを表示する。 */
export function showGeneratePanel() {
  showOnlyPanel('pairingGeneratePanel');
}

/**
 * 選択パネルへ戻る。招待コード発行中の待機（購読）があれば止める。
 */
export function backToChoice() {
  stopWaitingForPartner();
  showChoicePanel();
}

// ------------------------------------------------------------
// 表示名
// ------------------------------------------------------------

/**
 * 表示名入力欄の現在の値を取得する。
 * @returns {string}
 */
export function getDisplayNameInputValue() {
  const input = document.getElementById('pairingNameInput');
  return input ? input.value.trim() : '';
}

/**
 * 表示名をローカルへ保存する。
 * @param {string} displayName
 */
export function saveDisplayName(displayName) {
  Firebase.saveLocalDisplayName(displayName);
}

// ------------------------------------------------------------
// 招待コード発行
// ------------------------------------------------------------

/**
 * 招待コード発行フローを開始する。
 * サインイン → ユーザープロフィール作成 → ルーム作成＋コード発行、
 * まで行い、コードを画面に表示したうえで、ルームがactiveになる
 * （＝相手が参加した）のを購読して待つ。
 * @returns {Promise<void>}
 */
export async function generateInvite() {
  const statusEl = document.getElementById('pairingGenerateStatus');
  const codeEl = document.getElementById('pairingCodeDisplay');
  if (statusEl) statusEl.textContent = '招待コードを発行しています…';
  if (codeEl) codeEl.textContent = '';

  try {
    const displayName = Firebase.getLocalDisplayName() ?? '';
    const uid = await Firebase.ensureSignedIn();
    await Firebase.ensureUserProfile(uid, displayName);

    const { roomId, code } = await Firebase.createRoomAndInviteCode(uid, displayName);

    if (codeEl) codeEl.textContent = code;
    if (statusEl) statusEl.textContent = '相手の参加を待っています…';

    pendingRoomId = roomId;
    waitForPartner(roomId);
  } catch (error) {
    console.error('[pairing.js] 招待コードの発行に失敗しました', error);
    if (statusEl) statusEl.textContent = '発行に失敗しました。もう一度お試しください。';
    throw error;
  }
}

/**
 * ルームの状態を購読し、statusが'active'になった時点でペアリング成立とみなす。
 * @param {string} roomId
 */
function waitForPartner(roomId) {
  stopWaitingForPartner();

  unsubscribeRoom = Firebase.subscribeToRoom(roomId, (roomData) => {
    if (roomData.status === 'active') {
      Firebase.saveLocalRoomId(roomId);
      stopWaitingForPartner();
      if (typeof onPairedCallback === 'function') {
        onPairedCallback(roomId);
      }
    }
  });
}

/** ルーム購読を止める（画面を離れる・戻る操作等で呼ぶ）。 */
function stopWaitingForPartner() {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
  pendingRoomId = null;
}

// ------------------------------------------------------------
// 招待コード入力（参加）
// ------------------------------------------------------------

/**
 * 招待コード入力欄の現在の値を取得する。
 * @returns {string}
 */
export function getJoinCodeValue() {
  const input = document.getElementById('pairingJoinInput');
  return input ? input.value.trim() : '';
}

/** 招待コード入力のエラー表示を出す。 */
export function showJoinError(message) {
  const error = document.getElementById('pairingJoinError');
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

/** 招待コード入力のエラー表示を消す。 */
export function clearJoinError() {
  const error = document.getElementById('pairingJoinError');
  if (!error) return;
  error.hidden = true;
  error.textContent = '';
}

/**
 * 入力された招待コードでルームへ参加する。
 * 成功した場合はローカルにroomIdを保存し、onPairedCallbackを呼ぶ。
 * 失敗した場合は例外をそのまま投げる（呼び出し元でエラー表示させるため）。
 * @returns {Promise<string>} roomId
 */
export async function submitJoinCode() {
  const code = getJoinCodeValue();
  if (code === '') {
    throw new Error('招待コードを入力してください。');
  }

  const displayName = Firebase.getLocalDisplayName() ?? '';
  const uid = await Firebase.ensureSignedIn();
  await Firebase.ensureUserProfile(uid, displayName);

  const roomId = await Firebase.joinRoomWithCode(code, uid, displayName);
  Firebase.saveLocalRoomId(roomId);

  if (typeof onPairedCallback === 'function') {
    onPairedCallback(roomId);
  }

  return roomId;
}

// ------------------------------------------------------------
// 画面の開閉／初期化
// ------------------------------------------------------------

/**
 * ペアリング成立時に呼ばれるコールバックを登録する。
 * app.jsの初期化時に一度だけ呼ばれる想定（Router.completePairing()等に接続する）。
 * @param {(roomId: string) => void} callback
 */
export function setOnPaired(callback) {
  onPairedCallback = callback;
}

/**
 * ペアリング画面を表示する。表示名が未保存なら名前入力から、
 * 保存済みなら選択パネルから始める。
 */
export function open() {
  const container = getContainer();
  if (!container) return;

  const displayName = Firebase.getLocalDisplayName();
  const joinInput = document.getElementById('pairingJoinInput');
  if (joinInput) joinInput.value = '';
  clearJoinError();

  if (displayName) {
    showChoicePanel();
  } else {
    showNamePanel();
  }

  container.classList.add('is-open');
  container.setAttribute('aria-hidden', 'false');
}

/**
 * ペアリング画面を非表示にする。招待コード待機中であれば購読を止める。
 */
export function close() {
  stopWaitingForPartner();

  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open');
  container.setAttribute('aria-hidden', 'true');
}

/**
 * ペアリング画面が現在開いているかどうかを返す。
 * @returns {boolean}
 */
export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

const Pairing = {
  create,
  open,
  close,
  isOpen,
  setOnPaired,
  showNamePanel,
  showChoicePanel,
  showJoinPanel,
  showGeneratePanel,
  backToChoice,
  getDisplayNameInputValue,
  saveDisplayName,
  generateInvite,
  getJoinCodeValue,
  showJoinError,
  clearJoinError,
  submitJoinCode,
};

export default Pairing;