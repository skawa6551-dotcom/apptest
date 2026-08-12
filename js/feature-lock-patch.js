// ============================================================
// feature-lock-patch.js
// Calculator 0209 - feature entry lock
//
// Workspaceから以下へ入るたびに必ずパスコード認証:
// ・メッセージ
// ・カレンダー
// ・写真
// ・記録
//
// app.jsの設定トグル状態に関係なく、入口で毎回ロックする。
// ============================================================

import Passcode from './passcode.js';
import Router from './router.js';
import Firebase from './firebase.js';
import Messages from './messages.js';

const PROTECTED = new Set([
  'messages',
  'calendar',
  'photo',
  'records',
]);

let pendingSecret = null;

const MESSAGE_HISTORY_SECRET = 'messageHistory';

function getOverlay() {
  return document.getElementById('featureAuthOverlay');
}

function getInput() {
  return document.getElementById('featureAuthInput');
}

function getError() {
  return document.getElementById('featureAuthError');
}

function getMessage() {
  return document.getElementById('featureAuthMessage');
}

function showLock(secret) {
  pendingSecret = secret;

  const overlay = getOverlay();
  const input = getInput();
  const error = getError();
  const message = getMessage();

  const labels = {
    messages: 'メッセージ',
    calendar: 'カレンダー',
    photo: '写真',
    records: '記録',
    messageHistory: 'メッセージ履歴',
  };

  if (message) {
    message.textContent =
      `${labels[secret] || 'この機能'}を開くにはパスコードを入力してください`;
  }

  if (error) error.hidden = true;
  if (input) input.value = '';

  if (overlay) {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  window.requestAnimationFrame(() => input?.focus());
}

function hideLock() {
  const overlay = getOverlay();
  const input = getInput();

  if (overlay) {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (input) input.value = '';
}

function openFeature(secret) {
  switch (secret) {
    case 'messages':
      if (Firebase.getLocalRoomId()) {
        Router.openMessages();
      } else {
        Router.openPairing();
      }
      break;

    case 'calendar':
      Router.openCalendar();
      break;

    case 'photo':
      Router.openPhoto();
      break;

    case 'records':
      Router.openRecords();
      break;

    case MESSAGE_HISTORY_SECRET:
      Messages.toggleHistoryMode();
      break;

    default:
      break;
  }
}

function handleCaptureClick(event) {
  if (!(event.target instanceof Element)) return;

  // AI Spaceの履歴。開く時だけ毎回パスコード認証する。
  const historyTarget = event.target.closest('[data-action="toggle-message-history"]');
  if (historyTarget && Router.getCurrentScreen() === Router.Screen.MESSAGES) {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (Messages.isHistoryOpen()) {
      Messages.toggleHistoryMode();
    } else {
      showLock(MESSAGE_HISTORY_SECRET);
    }
    return;
  }

  // Workspaceカードを押した時
  const featureTarget = event.target.closest('[data-secret]');
  const secret = featureTarget?.dataset?.secret;

  if (
    secret &&
    PROTECTED.has(secret) &&
    Router.getCurrentScreen() === Router.Screen.WORKSPACE
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showLock(secret);
    return;
  }

  // 認証決定
  const confirm = event.target.closest('[data-action="confirm-feature-auth"]');
  if (confirm && pendingSecret) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const input = getInput();
    const error = getError();

    if (!input || !Passcode.validate(input.value)) {
      if (error) error.hidden = false;
      input?.select();
      return;
    }

    const secretToOpen = pendingSecret;
    pendingSecret = null;
    hideLock();
    openFeature(secretToOpen);
    return;
  }

  // 認証キャンセル
  const cancel = event.target.closest('[data-action="cancel-feature-auth"]');
  if (cancel && pendingSecret) {
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingSecret = null;
    hideLock();
  }
}

document.addEventListener('click', handleCaptureClick, true);
