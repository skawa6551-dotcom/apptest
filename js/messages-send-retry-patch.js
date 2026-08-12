// ============================================================
// messages-send-retry-patch.js
// Calculator 0209 - fix40
//
// 旧版は通常送信から700ms後に入力が残っていると再送していたため、
// 通信が少し遅いだけでも同じメッセージを二重送信する可能性があった。
// fix40では自動再送を完全に停止する。
// 実際の送信は messages.js の sendMessage() だけが担当する。
// ============================================================

export function retrySendFromCurrentInput() {
  return Promise.resolve(false);
}
