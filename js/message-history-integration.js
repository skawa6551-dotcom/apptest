// ============================================================
// message-history-integration.js
// Calculator 0209 - rollback47
//
// AI Spaceの送受信を最優先で安定させるため、
// 履歴追加機能の自動処理を一時停止する。
// 既存messages.js / app.js / Firebase送信処理には触れない。
// ============================================================

export function installMessageHistoryIntegration() {
  return Promise.resolve();
}

export default {
  installMessageHistoryIntegration,
};
