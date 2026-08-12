// ============================================================
// message-history-integration.js
// Calculator 0209
// 既存AI Spaceの通常画面は変更しない。
// ============================================================

import MessageHistory from './message-history.js';

let installed = false;

async function startHistorySubscription() {
  const Firebase = (await import('./firebase.js')).default;
  const roomId = Firebase.getLocalRoomId();
  if (!roomId) return () => {};

  return Firebase.subscribeToMessages(
    roomId,
    (messages) => {
      MessageHistory.setMessages(Array.isArray(messages) ? messages : []);
    },
    (error) => {
      console.warn('[message-history-integration] 履歴購読に失敗しました', error);
    },
  );
}

export async function installMessageHistoryIntegration() {
  if (installed) return;
  installed = true;

  await startHistorySubscription();

  const container = document.getElementById('messages');
  if (!container) return;

  const observer = new MutationObserver(() => {
    const historyOpen = container.classList.contains('is-history-mode');
    if (historyOpen) {
      MessageHistory.openHistory();
    }
  });

  observer.observe(container, {
    attributes: true,
    attributeFilter: ['class'],
  });

  document.addEventListener('click', async (event) => {
    if (!(event.target instanceof Element)) return;
    const close = event.target.closest('[data-history-action="close-list"]');
    if (!close) return;

    try {
      const Messages = (await import('./messages.js')).default;
      if (Messages.isHistoryOpen()) {
        Messages.toggleHistoryMode();
      }
    } catch (error) {
      console.warn('[message-history-integration] 履歴モード終了に失敗しました', error);
    }
  }, true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installMessageHistoryIntegration().catch((error) => {
      console.warn('[message-history-integration] 初期化失敗', error);
    });
  }, { once: true });
} else {
  installMessageHistoryIntegration().catch((error) => {
    console.warn('[message-history-integration] 初期化失敗', error);
  });
}
