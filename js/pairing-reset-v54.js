// Calculator 0209 v54 — one-time pairing reset
// 試運転で残った「この端末側のルーム接続情報」だけを初期化する。
// Firestore上の既存room/messagesや、写真・Calendar・設定・背景は削除しない。

const RESET_KEY = 'calculator0209_pairing_reset_v54_done';

function clearMatchingStorage(storage) {
  if (!storage) return;

  const exactKeys = [
    'roomId',
    'currentRoomId',
    'activeRoomId',
    'pairedRoomId',
    'inviteCode',
    'currentInviteCode',
  ];

  const fuzzy = /(room.?id|pair|invite)/i;

  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    if (!key || key === RESET_KEY) continue;

    if (exactKeys.includes(key) || fuzzy.test(key)) {
      storage.removeItem(key);
    }
  }
}

try {
  if (localStorage.getItem(RESET_KEY) !== '1') {
    clearMatchingStorage(localStorage);
    clearMatchingStorage(sessionStorage);

    localStorage.setItem(RESET_KEY, '1');

    // 古いJS状態を確実に捨て、初期状態から起動し直す。
    window.location.reload();
  }
} catch (error) {
  console.warn('[pairing-reset-v54] local pairing reset failed', error);
}
