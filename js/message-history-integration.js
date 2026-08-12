// ============================================================
// message-history-integration.js
// Calculator 0209 - History data fix46
//
// AI Space本体は変更しない。
// 履歴ロック認証が成功して実際に履歴を開く瞬間に、
// Firebase購読を開始してFirestoreの全メッセージを履歴画面へ渡す。
// ============================================================

import MessageHistory from './message-history.js';
import Firebase from './firebase.js';

let installed = false;
let unsubscribeHistory = null;
let latestSnapshot = [];

function stopHistorySubscription() {
  if (unsubscribeHistory) {
    unsubscribeHistory();
    unsubscribeHistory = null;
  }
}

function startHistorySubscription() {
  stopHistorySubscription();

  const roomId = Firebase.getLocalRoomId();

  if (!roomId) {
    MessageHistory.setMessages([]);
    return;
  }

  unsubscribeHistory = Firebase.subscribeToMessages(
    roomId,
    (messages) => {
      latestSnapshot = Array.isArray(messages) ? messages : [];
      MessageHistory.setMessages(latestSnapshot);
    },
    (error) => {
      console.warn(
        '[message-history-integration] 履歴データの取得に失敗しました',
        error,
      );
    },
  );
}

function openSeparateHistory() {
  // ここではroomId/Auth初期化がすでに終わっているため、
  // 起動直後に購読するより確実。
  startHistorySubscription();
  MessageHistory.openHistory(latestSnapshot);
}

export async function installMessageHistoryIntegration() {
  if (installed) return;
  installed = true;

  const container = document.getElementById('messages');

  if (!container) {
    console.warn(
      '[message-history-integration] #messages が見つかりません',
    );
    return;
  }

  const observer = new MutationObserver(() => {
    const historyOpen =
      container.classList.contains('is-history-mode');

    if (historyOpen) {
      openSeparateHistory();
    }
  });

  observer.observe(container, {
    attributes: true,
    attributeFilter: ['class'],
  });

  document.addEventListener(
    'click',
    async (event) => {
      if (!(event.target instanceof Element)) return;

      const closeList =
        event.target.closest('[data-history-action="close-list"]');

      if (!closeList) return;

      stopHistorySubscription();

      try {
        const Messages = (await import('./messages.js')).default;

        if (Messages.isHistoryOpen()) {
          Messages.toggleHistoryMode();
        }
      } catch (error) {
        console.warn(
          '[message-history-integration] 履歴モード終了に失敗しました',
          error,
        );
      }
    },
    true,
  );

  window.addEventListener('pagehide', stopHistorySubscription);
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      installMessageHistoryIntegration().catch((error) => {
        console.warn(
          '[message-history-integration] 初期化失敗',
          error,
        );
      });
    },
    { once: true },
  );
} else {
  installMessageHistoryIntegration().catch((error) => {
    console.warn(
      '[message-history-integration] 初期化失敗',
      error,
    );
  });
}
