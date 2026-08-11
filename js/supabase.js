// ============================================================
// supabase.js
// Calculator 0209
// ============================================================
// Recovery module for v27.
// The previously committed file was truncated and prevented the
// whole ES-module graph (including calculator input handlers) from loading.
// This module keeps the app bootable and exposes the API expected by
// app.js / photo.js. Shared-photo writes are intentionally unavailable
// until the full Supabase implementation is restored.
// ============================================================

import Storage, { STORAGE_KEYS } from './storage.js';

const DIAGNOSTIC_EVENT_NAME = 'calculator-supabase-diagnostic';

let diagnosticState = {
  stage: 'recovery-ready',
  message: 'Supabase recovery module is active',
  error: null,
  userId: null,
  roomId: null,
  updatedAt: Date.now(),
};

function emitDiagnostic() {
  try {
    window.dispatchEvent(new CustomEvent(DIAGNOSTIC_EVENT_NAME, {
      detail: getDiagnosticState(),
    }));
  } catch (_) {
    // Diagnostic events must never block app startup.
  }
}

function setDiagnostic(stage, message, error = null, extra = {}) {
  diagnosticState = {
    ...diagnosticState,
    ...extra,
    stage,
    message,
    error: error ? String(error?.message || error) : null,
    updatedAt: Date.now(),
  };
  emitDiagnostic();
  return getDiagnosticState();
}

export function getDiagnosticState() {
  return { ...diagnosticState, roomId: getRoomId() };
}

export function getDiagnosticEventName() {
  return DIAGNOSTIC_EVENT_NAME;
}

export function getRoomId() {
  try {
    const roomId = Storage.get(STORAGE_KEYS.CURRENT_ROOM_ID, null);
    return typeof roomId === 'string' && roomId.trim() ? roomId.trim() : null;
  } catch (_) {
    return null;
  }
}

export async function ensureSignedIn() {
  setDiagnostic(
    'recovery-auth-skipped',
    'Supabase共有写真機能は復旧待ちです。アプリ本体は通常利用できます。',
  );
  return null;
}

export async function init() {
  setDiagnostic(
    'recovery-ready',
    'Supabase共有写真機能は復旧待ちです。アプリ本体は通常利用できます。',
  );
  return true;
}

export async function syncCurrentRoom() {
  setDiagnostic(
    'recovery-room-skipped',
    '共有写真ルーム同期は復旧待ちです。',
    null,
    { roomId: getRoomId() },
  );
  return false;
}

export async function runDiagnostic() {
  return setDiagnostic(
    'recovery-ready',
    'アプリ本体は利用可能です。Supabase共有写真のみ復旧待ちです。',
  );
}

export async function getCurrentUser() {
  return null;
}

export async function getCurrentUid() {
  return null;
}

export async function listPhotos() {
  setDiagnostic('recovery-photo-list', '共有写真一覧は復旧待ちです。');
  return [];
}

export async function uploadPhoto() {
  const error = new Error('共有写真のアップロード機能は現在復旧中です。');
  setDiagnostic('recovery-upload-unavailable', error.message, error);
  throw error;
}

export async function deletePhoto() {
  const error = new Error('共有写真の削除機能は現在復旧中です。');
  setDiagnostic('recovery-delete-unavailable', error.message, error);
  throw error;
}

const Supabase = Object.freeze({
  init,
  ensureSignedIn,
  syncCurrentRoom,
  runDiagnostic,
  getDiagnosticState,
  getDiagnosticEventName,
  getRoomId,
  getCurrentUser,
  getCurrentUid,
  listPhotos,
  uploadPhoto,
  deletePhoto,
});

export default Supabase;
