// ============================================================
// room-membership-repair.js
// Calculator 0209
//
// Safari / PWA側でFirebase匿名UIDが変わった場合に、
// 保存済みroomIdへ現在UIDを再登録してメッセージ送信を復旧する。
// ============================================================

import Firebase from './firebase.js';

const SDK_VERSION = '12.16.0';

async function repairCurrentRoomMembership() {
  const roomId = Firebase.getLocalRoomId();
  if (!roomId) return false;

  const uid = await Firebase.ensureSignedIn();
  if (!uid) return false;

  const [
    appFns,
    firestoreFns,
  ] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
  ]);

  const apps = appFns.getApps();
  if (!apps.length) return false;

  const app = appFns.getApp();
  const db = firestoreFns.getFirestore(app);
  const roomRef = firestoreFns.doc(db, 'rooms', roomId);
  const roomSnap = await firestoreFns.getDoc(roomRef);

  if (!roomSnap.exists()) {
    throw new Error('保存されているルームが見つかりません。');
  }

  const data = roomSnap.data() || {};
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];

  if (memberIds.includes(uid)) {
    return true;
  }

  if (data.status !== 'active') {
    throw new Error('ルームが有効状態ではありません。');
  }

  // Firestore rulesの「新規参加」条件に合わせて、
  // 既存memberIdsの末尾へ現在UIDを1件だけ追加する。
  await firestoreFns.updateDoc(roomRef, {
    memberIds: [...memberIds, uid],
  });

  return true;
}

async function startRepair() {
  try {
    await repairCurrentRoomMembership();
    window.dispatchEvent(new CustomEvent('calculator0209-room-membership-ready'));
  } catch (error) {
    console.warn('[room-membership-repair] ルームメンバー復旧に失敗しました', error);
    window.dispatchEvent(new CustomEvent('calculator0209-room-membership-error', {
      detail: {
        message: error?.message || 'ルーム接続の復旧に失敗しました。',
      },
    }));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startRepair, { once: true });
} else {
  startRepair();
}

export { repairCurrentRoomMembership };
