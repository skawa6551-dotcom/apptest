import Firebase from './firebase.js';

function renderCurrentRoomId() {
  const label = document.getElementById('currentRoomIdDiagnostic');
  if (!label) return;
  const roomId = Firebase.getLocalRoomId();
  label.textContent = roomId || 'ルームIDなし';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderCurrentRoomId, { once: true });
} else {
  renderCurrentRoomId();
}
