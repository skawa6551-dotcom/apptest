// ============================================================
// room-membership-repair.js
// Calculator 0209 - Safe Pairing Recovery
//
// 目的:
// ・保存済みroomIdがFirebase上に存在しない場合だけ、
//   ペアリング情報(CURRENT_ROOM_ID)を安全に解除する。
// ・写真、カレンダー、記録、テーマ、各種設定は削除しない。
// ・正常なroomがある場合は現在UIDのmembership復旧を試す。
// ============================================================

import Firebase from './firebase.js';
import Storage, { STORAGE_KEYS } from './storage.js';

const SDK_VERSION = '12.16.0';

function clearOnlyBrokenPairing() {
  // 壊れたペアリングだけ解除する。
  Storage.remove(STORAGE_KEYS.CURRENT_ROOM_ID);

  // 旧roomに紐づく「通常画面から隠したmessage id」だけリセット。
  // Firestore上のメッセージそのものは削除しない。
  Storage.remove(STORAGE_KEYS.MESSAGE_HIDDEN_IDS);

  window.dispatchEvent(new CustomEvent('calculator0209-pairing-reset'));
}

async function repairCurrentRoomMembership() {
  const roomId = Firebase.getLocalRoomId();

  // すでにペアリング解除済みなら正常終了。
  if (!roomId) {
    return {
      ok: true,
      state: 'unpaired',
    };
  }

  const uid = await Firebase.ensureSignedIn();
  if (!uid) {
    throw new Error('ユーザー情報を取得できませんでした。');
  }

  const [appFns, firestoreFns] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
  ]);

  const apps = appFns.getApps();
  if (!apps.length) {
    throw new Error('Firebaseが初期化されていません。');
  }

  const app = appFns.getApp();
  const db = firestoreFns.getFirestore(app);
  const roomRef = firestoreFns.doc(db, 'rooms', roomId);
  const roomSnap = await firestoreFns.getDoc(roomRef);

  // ここが今回の本命。
  // Firebaseにroomが存在しないなら、古いroomIdだけを削除して再ペアリング可能にする。
  if (!roomSnap.exists()) {
    clearOnlyBrokenPairing();

    return {
      ok: true,
      state: 'pairing-reset',
      oldRoomId: roomId,
    };
  }

  const data = roomSnap.data() || {};
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];

  if (memberIds.includes(uid)) {
    return {
      ok: true,
      state: 'ready',
      roomId,
    };
  }

  if (data.status !== 'active') {
    // activeでない古いroomも安全に解除。
    clearOnlyBrokenPairing();

    return {
      ok: true,
      state: 'pairing-reset',
      oldRoomId: roomId,
    };
  }

  // roomは存在するが、Safari/PWAの匿名UIDだけ変わったケース。
  // 既存memberIdsへ現在UIDを1件追加して復旧を試す。
  await firestoreFns.updateDoc(roomRef, {
    memberIds: [...memberIds, uid],
  });

  return {
    ok: true,
    state: 'membership-repaired',
    roomId,
  };
}

function showRecoveryNotice() {
  let el = document.getElementById('pairingRecoveryNotice');

  if (!el) {
    el = document.createElement('div');
    el.id = 'pairingRecoveryNotice';
    el.style.cssText = [
      'position:fixed',
      'left:18px',
      'right:18px',
      'bottom:calc(max(16px, env(safe-area-inset-bottom)) + 18px)',
      'z-index:12000',
      'padding:12px 14px',
      'border-radius:15px',
      'background:rgba(24,72,78,.92)',
      'color:#e0ffff',
      'font-size:13px',
      'text-align:center',
      'box-shadow:0 10px 30px rgba(0,0,0,.28)',
      'backdrop-filter:blur(18px)',
      '-webkit-backdrop-filter:blur(18px)',
      'opacity:0',
      'transition:opacity .2s ease',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(el);
  }

  el.textContent = '古い接続情報を解除しました。メッセージから再ペアリングしてください。';
  el.style.opacity = '1';

  window.clearTimeout(el._hideTimer);
  el._hideTimer = window.setTimeout(() => {
    el.style.opacity = '0';
  }, 4500);
}

async function startRepair() {
  try {
    const result = await repairCurrentRoomMembership();

    if (result?.state === 'pairing-reset') {
      showRecoveryNotice();
    }

    window.dispatchEvent(new CustomEvent(
      'calculator0209-room-membership-ready',
      { detail: result },
    ));
  } catch (error) {
    console.warn(
      '[room-membership-repair] ルームメンバー復旧に失敗しました',
      error,
    );

    window.dispatchEvent(new CustomEvent(
      'calculator0209-room-membership-error',
      {
        detail: {
          message: error?.message || 'ルーム接続の復旧に失敗しました。',
        },
      },
    ));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startRepair, { once: true });
} else {
  startRepair();
}

export {
  repairCurrentRoomMembership,
  clearOnlyBrokenPairing,
};
