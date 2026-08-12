// ============================================================
// messages-send-retry-patch.js
// Calculator 0209
// AI Space送信の復旧補助
// ============================================================

import Firebase from './firebase.js';
import { repairCurrentRoomMembership } from './room-membership-repair.js';

function showStatus(text, isError = false) {
  let el = document.getElementById('aiSpaceSendStatus');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aiSpaceSendStatus';
    el.style.cssText = [
      'position:fixed',
      'left:18px',
      'right:18px',
      'bottom:calc(max(16px, env(safe-area-inset-bottom)) + 72px)',
      'z-index:10100',
      'padding:10px 14px',
      'border-radius:14px',
      'font-size:12px',
      'text-align:center',
      'backdrop-filter:blur(16px)',
      '-webkit-backdrop-filter:blur(16px)',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity .18s ease'
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.color = isError ? '#ffd5d5' : '#d8ffff';
  el.style.background = isError ? 'rgba(105,25,35,.72)' : 'rgba(20,75,80,.72)';
  el.style.opacity = '1';
  window.clearTimeout(el._hideTimer);
  el._hideTimer = window.setTimeout(() => {
    el.style.opacity = '0';
  }, 2200);
}

async function retrySendFromCurrentInput() {
  const input = document.getElementById('messagesInput');
  if (!input) return false;

  const text = input.value.trim();
  if (!text) return false;

  const roomId = Firebase.getLocalRoomId();
  if (!roomId) {
    showStatus('ルームに接続されていません', true);
    return false;
  }

  try {
    const uid = await Firebase.ensureSignedIn();

    try {
      await Firebase.sendMessage(roomId, { text, senderId: uid });
    } catch (error) {
      const code = String(error?.code || '');
      const msg = String(error?.message || '');

      if (
        code.includes('permission-denied') ||
        msg.toLowerCase().includes('permission')
      ) {
        showStatus('接続を復旧しています…');
        await repairCurrentRoomMembership();
        await Firebase.sendMessage(roomId, { text, senderId: uid });
      } else {
        throw error;
      }
    }

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    showStatus('送信しました');
    return true;
  } catch (error) {
    console.error('[messages-send-retry-patch] 送信失敗', error);
    showStatus(error?.message || '送信できませんでした', true);
    return false;
  }
}

document.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('[data-action="send-message"]');
  if (!button) return;

  // 通常messages.jsの送信を先に動かし、入力が残っていれば失敗とみなして再試行。
  window.setTimeout(async () => {
    const input = document.getElementById('messagesInput');
    if (input && input.value.trim()) {
      await retrySendFromCurrentInput();
    }
  }, 700);
}, true);

export { retrySendFromCurrentInput };
