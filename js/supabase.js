// ============================================================
// supabase.js
// Calculator 0209
// Shared photo module v28
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import Storage, { STORAGE_KEYS } from './storage.js';

const SUPABASE_URL = 'https://njqbnvzkpazxbwpcajlu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uAfVZH35jFQNK2emEpR8ag_jb0kaQvJ';
const PHOTO_BUCKET = 'photos';
const ROOM_MEMBERS_TABLE = 'photo_room_members';
const DIAGNOSTIC_EVENT_NAME = 'calculator-supabase-diagnostic';
const SESSION_BACKUP_KEY = 'calculator-0209-supabase-session-backup-v1';
let authListenerRegistered = false;

let client = null;
let signInPromise = null;
let diagnosticState = {
  stage: 'idle',
  message: 'Supabase初期化待ち',
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
  } catch (_) {}
}

function updateDiagnostic(stage, message, error = null, extra = {}) {
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

function saveSessionBackup(session) {
  try {
    if (!session?.access_token || !session?.refresh_token) return;
    window.localStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user_id: session.user?.id || null,
      saved_at: Date.now(),
    }));
  } catch (error) {
    console.warn('[supabase.js] セッション予備保存に失敗しました', error);
  }
}

function readSessionBackup() {
  try {
    const raw = window.localStorage.getItem(SESSION_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token || !parsed?.refresh_token) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function registerAuthListener(supabase) {
  if (authListenerRegistered) return;
  authListenerRegistered = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) saveSessionBackup(session);
  });
}

async function restoreBackedUpSession(supabase) {
  const backup = readSessionBackup();
  if (!backup) return null;
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: backup.access_token,
      refresh_token: backup.refresh_token,
    });
    if (error) throw error;
    if (data?.session) saveSessionBackup(data.session);
    return data?.session?.user || null;
  } catch (error) {
    console.warn('[supabase.js] 保存済みセッションの復元に失敗しました', error);
    return null;
  }
}

function requireClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'calculator-0209-supabase-auth',
      },
    });
    registerAuthListener(client);
  }
  return client;
}

function safeExt(file) {
  const raw = String(file?.name || '').split('.').pop()?.toLowerCase() || 'jpg';
  const ext = raw.replace(/[^a-z0-9]/g, '').slice(0, 8);
  return ext || 'jpg';
}

function makeObjectPath(roomId, uid, file) {
  const stamp = Date.now();
  const random = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${roomId}/${stamp}-${uid.slice(0, 8)}-${random}.${safeExt(file)}`;
}

function normalizeCreatedAt(value, fallback = Date.now()) {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDiagnosticEventName() {
  return DIAGNOSTIC_EVENT_NAME;
}

export function getRoomId() {
  try {
    const savedRoomId = Storage.get(STORAGE_KEYS.CURRENT_ROOM_ID, null);
    if (typeof savedRoomId === 'string' && savedRoomId.trim()) {
      return savedRoomId.trim();
    }

    // Calculator 0209 の共有写真ルーム。
    // 端末側に room_id がまだ保存されていない場合でも、
    // 写真をローカル保存へ逃がさず同じSupabaseルームへ保存する。
    const defaultRoomId = '0209';
    Storage.set(STORAGE_KEYS.CURRENT_ROOM_ID, defaultRoomId);
    return defaultRoomId;
  } catch (_) {
    return '0209';
  }
}

export function getDiagnosticState() {
  return {
    ...diagnosticState,
    roomId: getRoomId(),
  };
}

export async function getCurrentUser() {
  const supabase = requireClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && !String(error.message || '').toLowerCase().includes('session')) {
    throw error;
  }
  return data?.user || null;
}

export async function getCurrentUid() {
  const user = await getCurrentUser();
  return user?.id || null;
}

export async function ensureSignedIn() {
  const supabase = requireClient();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.warn('[supabase.js] 現在セッションの取得に失敗しました', sessionError);
  }
  if (sessionData?.session?.user) {
    const user = sessionData.session.user;
    saveSessionBackup(sessionData.session);
    updateDiagnostic('authenticated', 'Supabase認証済みです', null, {
      userId: user.id,
      roomId: getRoomId(),
    });
    return user;
  }

  if (signInPromise) return signInPromise;

  signInPromise = (async () => {
    // iOS/Safariが写真ピッカー復帰時などにSDKの通常セッションを一時的に
    // 見失っても、直前のrefresh tokenから同一匿名ユーザーを復元する。
    const restoredUser = await restoreBackedUpSession(supabase);
    if (restoredUser) {
      updateDiagnostic('authenticated-restored', '保存済みSupabase認証を復元しました', null, {
        userId: restoredUser.id,
        roomId: getRoomId(),
      });
      return restoredUser;
    }

    updateDiagnostic('anonymous-sign-in', 'Supabase匿名ログインを開始しています');
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      const message = /anonymous/i.test(String(error.message || ''))
        ? `匿名ログインに失敗しました。Supabaseの「Allow anonymous sign-ins」がONか確認してください。 (${error.message})`
        : `Supabase認証に失敗しました。 ${error.message || ''}`;
      updateDiagnostic('anonymous-sign-in-error', message, error);
      throw new Error(message);
    }
    if (!data?.user) {
      const missing = new Error('Supabaseから匿名ユーザー情報が返されませんでした。');
      updateDiagnostic('anonymous-user-missing', missing.message, missing);
      throw missing;
    }
    if (data.session) saveSessionBackup(data.session);
    updateDiagnostic('authenticated', 'Supabase匿名ログインに成功しました', null, {
      userId: data.user.id,
      roomId: getRoomId(),
    });
    return data.user;
  })().finally(() => {
    signInPromise = null;
  });

  return signInPromise;
}

export async function syncCurrentRoom() {
  const roomId = getRoomId();
  if (!roomId) {
    updateDiagnostic('room-missing', '写真共有ルームがまだ設定されていません。');
    return false;
  }

  const user = await ensureSignedIn();
  const supabase = requireClient();
  updateDiagnostic('room-sync', '写真共有ルームを同期しています', null, {
    userId: user.id,
    roomId,
  });

  // Existing row first: this avoids unnecessary writes when the membership
  // has already been created by a previous session/device.
  const { data: existing, error: selectError } = await supabase
    .from(ROOM_MEMBERS_TABLE)
    .select('room_id,user_id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .limit(1);

  if (selectError) {
    updateDiagnostic('room-select-error', '写真共有ルームの確認に失敗しました', selectError);
    throw selectError;
  }

  if (!Array.isArray(existing) || existing.length === 0) {
    const { error: insertError } = await supabase
      .from(ROOM_MEMBERS_TABLE)
      .insert({ room_id: roomId, user_id: user.id });
    if (insertError) {
      updateDiagnostic('room-insert-error', '写真共有ルームへの参加登録に失敗しました', insertError);
      throw insertError;
    }
  }

  updateDiagnostic('room-ready', '写真共有ルームの同期が完了しました', null, {
    userId: user.id,
    roomId,
  });
  return true;
}

export async function listPhotos() {
  const roomId = getRoomId();
  if (!roomId) return [];

  await ensureSignedIn();
  await syncCurrentRoom();
  const supabase = requireClient();
  updateDiagnostic('photo-list', '共有写真を読み込んでいます');

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .list(roomId, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) {
    updateDiagnostic('photo-list-error', '共有写真一覧の取得に失敗しました', error);
    throw error;
  }

  const files = (Array.isArray(data) ? data : []).filter((item) => item?.name && item?.id);
  const result = await Promise.all(files.map(async (item) => {
    const path = `${roomId}/${item.name}`;
    const { data: signed, error: signedError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (signedError) throw signedError;
    return {
      id: item.id || path,
      path,
      name: item.name,
      createdAt: normalizeCreatedAt(item.created_at || item.updated_at),
      signedUrl: signed?.signedUrl || '',
    };
  }));

  updateDiagnostic('photo-list-ready', `${result.length}件の共有写真を読み込みました`);
  return result.filter((item) => item.signedUrl);
}

export async function uploadPhoto(file) {
  if (!(file instanceof Blob)) {
    throw new Error('アップロードする写真データが不正です。');
  }

  const roomId = getRoomId();
  if (!roomId) throw new Error('写真共有ルームが設定されていません。');

  const user = await ensureSignedIn();
  await syncCurrentRoom();
  const supabase = requireClient();
  const path = makeObjectPath(roomId, user.id, file);

  updateDiagnostic('photo-upload', '共有写真をアップロードしています', null, {
    userId: user.id,
    roomId,
  });

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });

  if (error) {
    updateDiagnostic('photo-upload-error', '共有写真のアップロードに失敗しました', error);
    throw error;
  }

  updateDiagnostic('photo-upload-ready', '共有写真を保存しました');
  return data;
}

export async function deletePhoto(path) {
  const roomId = getRoomId();
  if (!roomId) throw new Error('写真共有ルームが設定されていません。');
  if (!path || !String(path).startsWith(`${roomId}/`)) {
    throw new Error('削除対象の写真パスが不正です。');
  }

  await ensureSignedIn();
  await syncCurrentRoom();
  const supabase = requireClient();
  updateDiagnostic('photo-delete', '共有写真を削除しています');

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove([String(path)]);

  if (error) {
    updateDiagnostic('photo-delete-error', '共有写真の削除に失敗しました', error);
    throw error;
  }

  updateDiagnostic('photo-delete-ready', '共有写真を削除しました');
  return data;
}

export async function runDiagnostic() {
  try {
    const user = await ensureSignedIn();
    const roomId = getRoomId();
    if (roomId) await syncCurrentRoom();
    return updateDiagnostic('diagnostic-ok', 'Supabase接続は正常です', null, {
      userId: user?.id || null,
      roomId,
    });
  } catch (error) {
    return updateDiagnostic('diagnostic-error', 'Supabase接続診断に失敗しました', error);
  }
}

export async function init() {
  try {
    requireClient();
    updateDiagnostic('client-ready', 'Supabaseクライアントを初期化しました');
    // Do not make app startup depend on network/auth. Photo screen will
    // authenticate when shared-photo operations are actually used.
    return true;
  } catch (error) {
    updateDiagnostic('client-error', 'Supabase初期化に失敗しました', error);
    console.error('[supabase.js]', error);
    return false;
  }
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
