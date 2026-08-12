// ============================================================
// feature-lock-patch.js
// Calculator 0209 - fix43
//
// Workspaceから以下へ入るたびに必ずパスコード認証:
// ・メッセージ
// ・カレンダー
// ・写真
// ・記録
// ・Archive
// ・設定
//
// メッセージ履歴 / 閲覧モードの再認証は messages.js 側で処理。
// ============================================================

import Passcode from './passcode.js';
import Router from './router.js';
import Firebase from './firebase.js';

const PROTECTED = new Set([
  'messages',
  'calendar',
  'photo',
  'records',
  'archive',
  'settings',
]);

let pendingSecret = null;

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
    archive: 'Archive',
    settings: '設定',
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
  const error = getError();

  if (overlay) {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (input) input.value = '';
  if (error) error.hidden = true;
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

    case 'archive':
      Router.openArchive();
      break;

    case 'settings': {
      // app.jsのopenSettings()はexportされていないため、
      // 既存のsettingsOverlayを直接開く。
      const overlay = document.getElementById('settingsOverlay');
      if (overlay) {
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');

        const closeButton = document.getElementById('settingsCloseBtn');
        window.requestAnimationFrame(() => closeButton?.focus());
      }
      break;
    }

    default:
      break;
  }
}

function handleCaptureClick(event) {
  if (!(event.target instanceof Element)) return;

  const currentScreen = Router.getCurrentScreen();

  // Workspaceカード(data-secret)から入るケース
  const secretTarget = event.target.closest('[data-secret]');
  const secret = secretTarget?.dataset?.secret;

  if (
    secret &&
    PROTECTED.has(secret) &&
    currentScreen === Router.Screen.WORKSPACE
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showLock(secret);
    return;
  }

  // Workspace上の設定ボタンが data-action="open-settings" の場合も必ずロック
  const settingsTarget = event.target.closest('[data-action="open-settings"]');
  if (
    settingsTarget &&
    currentScreen === Router.Screen.WORKSPACE
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showLock('settings');
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
