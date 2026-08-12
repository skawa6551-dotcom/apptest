// ============================================================
// messages-send-retry-patch.js
// Calculator 0209 - send fix48
// ============================================================

import Messages from './messages.js';

let sending = false;

function getToast() {
  let toast = document.getElementById('messageSendStatusToast');

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'messageSendStatusToast';
    toast.style.position = 'fixed';
    toast.style.left = '18px';
    toast.style.right = '18px';
    toast.style.bottom = 'calc(max(18px, env(safe-area-inset-bottom)) + 88px)';
    toast.style.zIndex = '20000';
    toast.style.padding = '12px 14px';
    toast.style.borderRadius = '16px';
    toast.style.fontSize = '13px';
    toast.style.lineHeight = '1.45';
    toast.style.textAlign = 'center';
    toast.style.color = '#ffffff';
    toast.style.background = 'rgba(112, 26, 41, .95)';
    toast.style.boxShadow = '0 12px 32px rgba(0,0,0,.35)';
    toast.style.backdropFilter = 'blur(16px)';
    toast.style.webkitBackdropFilter = 'blur(16px)';
    toast.style.opacity = '0';
    toast.style.pointerEvents = 'none';
    toast.style.transition = 'opacity .18s ease';
    document.body.appendChild(toast);
  }

  return toast;
}

function showError(error) {
  const toast = getToast();
  const code =
    typeof error?.code === 'string'
      ? ` (${error.code})`
      : '';

  const message =
    typeof error?.message === 'string' && error.message.trim()
      ? error.message.trim()
      : 'メッセージを送信できませんでした。';

  toast.textContent = `${message}${code}`;
  toast.style.opacity = '1';

  window.clearTimeout(toast._hideTimer);
  toast._hideTimer = window.setTimeout(() => {
    toast.style.opacity = '0';
  }, 7000);
}

async function handleSend(event) {
  if (!(event.target instanceof Element)) return;

  const sendButton =
    event.target.closest('#messages [data-action="send-message"]');

  if (!sendButton) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (sending) return;

  const input = document.getElementById('messagesInput');
  if (!input || !input.value.trim()) return;

  sending = true;

  try {
    await Messages.sendMessage();
  } catch (error) {
    console.error(
      '[messages-send-fix48] メッセージ送信に失敗しました',
      error,
    );
    showError(error);
  } finally {
    sending = false;
  }
}

document.addEventListener('click', handleSend, true);

export function retrySendFromCurrentInput() {
  return Promise.resolve(false);
}
