// ============================================================
// storage.js
// アプリ全体で唯一 localStorage にアクセスするモジュール。
// 他のモジュール（calculator.js / settings.js など）は
// localStorage を直接操作せず、必ずこのファイルの関数を経由すること。
// ============================================================

const PREFIX = 'cal0209_';

const VERSION_KEY = `${PREFIX}__version__`;
const CURRENT_VERSION = 1;

export const STORAGE_KEYS = Object.freeze({
  HISTORY: 'history',
  THEME: 'theme',
  SOUND_ENABLED: 'sound_enabled',
  VIBRATION_ENABLED: 'vibration_enabled',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  CALENDAR_NOTES: 'calendar_notes',
  RECORDS_ARCHIVE: 'records_archive',
  ARCHIVE_BACKGROUND: 'archive_background',
  CLIENT_ID: 'client_id',
  CURRENT_ROOM_ID: 'current_room_id',
  DISPLAY_NAME: 'display_name',
  AUTO_LOCK_DURATION_MS: 'auto_lock_duration_ms',
  ARCHIVE_LOCK_ENABLED: 'archive_lock_enabled',
  NOTIFICATIONS_ENABLED: 'notifications_enabled',
  NOTIFICATION_CONTENT_ENABLED: 'notification_content_enabled',
  NOTIFICATION_SOUND_ENABLED: 'notification_sound_enabled',
  NOTIFICATION_VIBRATION_ENABLED: 'notification_vibration_enabled',
  CONVERSATION_ORGANIZE_MODE: 'conversation_organize_mode',
  CONVERSATION_ORGANIZE_DURATION_MS: 'conversation_organize_duration_ms',
  READ_RECEIPTS_ENABLED: 'read_receipts_enabled',
  ONLINE_VISIBILITY_ENABLED: 'online_visibility_enabled',
});

const VALID_KEYS = new Set(Object.values(STORAGE_KEYS));

const LIST_LIMITS = Object.freeze({
  [STORAGE_KEYS.HISTORY]: 100,
  [STORAGE_KEYS.RECORDS_ARCHIVE]: 500,
});

const memoryFallback = new Map();

let storageAvailable = null;

const listeners = new Map();

function isStorageAvailable() {
  if (storageAvailable !== null) return storageAvailable;

  try {
    const testKey = `${PREFIX}__test__`;
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch (error) {
    storageAvailable = false;
  }

  return storageAvailable;
}

function buildKey(key) {
  return `${PREFIX}${key}`;
}

function validateKey(key) {
  if (!VALID_KEYS.has(key)) {
    console.warn(`[storage.js] 未定義のキーへのアクセスを拒否しました: "${key}"`);
    return false;
  }
  return true;
}

function safeClone(value) {
  if (value === null || typeof value !== 'object') return value;

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      // 循環参照や非対応型を含む場合はJSONフォールバックへ
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('[storage.js] 値のクローンに失敗しました。参照をそのまま返します', error);
    return value;
  }
}

function isEqual(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (error) {
    return false;
  }
}

function notify(key, oldValue, newValue) {
  const keyListeners = listeners.get(key);
  if (!keyListeners) return;

  keyListeners.forEach((callback) => {
    try {
      callback(oldValue, newValue);
    } catch (error) {
      console.warn(`[storage.js] subscribeコールバックでエラーが発生しました (key: "${key}")`, error);
    }
  });
}

export function get(key, fallback = null) {
  if (!validateKey(key)) return fallback;

  const fullKey = buildKey(key);

  if (!isStorageAvailable()) {
    if (memoryFallback.has(fullKey)) {
      return safeClone(memoryFallback.get(fullKey));
    }
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(fullKey);
    if (raw === null) return fallback;
    return safeClone(JSON.parse(raw));
  } catch (error) {
    console.warn(`[storage.js] JSON.parseに失敗しました (key: "${key}")`, error);
    return fallback;
  }
}

export function set(key, value) {
  if (!validateKey(key)) return false;

  const limit = LIST_LIMITS[key];
  let valueToStore = value;
  if (limit && Array.isArray(value) && value.length > limit) {
    valueToStore = value.slice(0, limit);
  }

  const oldValue = get(key, null);

  if (isEqual(oldValue, valueToStore)) {
    return true;
  }

  const fullKey = buildKey(key);

  let serialized;
  try {
    serialized = JSON.stringify(valueToStore);
  } catch (error) {
    console.warn(`[storage.js] JSON.stringifyに失敗しました (key: "${key}")`, error);
    memoryFallback.set(fullKey, valueToStore);
    notify(key, oldValue, safeClone(valueToStore));
    return false;
  }

  if (!isStorageAvailable()) {
    memoryFallback.set(fullKey, valueToStore);
    notify(key, oldValue, safeClone(valueToStore));
    return false;
  }

  try {
    window.localStorage.setItem(fullKey, serialized);
    memoryFallback.delete(fullKey);
    notify(key, oldValue, safeClone(valueToStore));
    return true;
  } catch (error) {
    console.warn(`[storage.js] localStorageへの保存に失敗しました (key: "${key}")`, error);
    memoryFallback.set(fullKey, valueToStore);
    notify(key, oldValue, safeClone(valueToStore));
    return false;
  }
}

export function remove(key) {
  if (!validateKey(key)) return;

  const oldValue = get(key, null);
  const fullKey = buildKey(key);
  memoryFallback.delete(fullKey);

  if (isStorageAvailable()) {
    try {
      window.localStorage.removeItem(fullKey);
    } catch (error) {
      console.warn(`[storage.js] localStorageからの削除に失敗しました (key: "${key}")`, error);
    }
  }

  notify(key, oldValue, null);
}

export function clearAll() {
  const oldValues = {};
  Object.values(STORAGE_KEYS).forEach((key) => {
    oldValues[key] = get(key, null);
  });

  Array.from(memoryFallback.keys())
    .filter((fullKey) => fullKey.startsWith(PREFIX) && fullKey !== VERSION_KEY)
    .forEach((fullKey) => memoryFallback.delete(fullKey));

  if (isStorageAvailable()) {
    try {
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const fullKey = window.localStorage.key(i);
        if (fullKey && fullKey.startsWith(PREFIX) && fullKey !== VERSION_KEY) {
          keysToRemove.push(fullKey);
        }
      }
      keysToRemove.forEach((fullKey) => window.localStorage.removeItem(fullKey));
    } catch (error) {
      console.warn('[storage.js] clearAllの実行中にエラーが発生しました', error);
    }
  }

  Object.values(STORAGE_KEYS).forEach((key) => notify(key, oldValues[key], null));
}

export function subscribe(key, callback) {
  if (!validateKey(key)) return () => {};

  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);

  return () => unsubscribe(key, callback);
}

export function unsubscribe(key, callback) {
  const keyListeners = listeners.get(key);
  if (!keyListeners) return;

  keyListeners.delete(callback);
  if (keyListeners.size === 0) {
    listeners.delete(key);
  }
}

const migrations = [];

function readRawVersion() {
  if (!isStorageAvailable()) {
    return memoryFallback.has(VERSION_KEY) ? memoryFallback.get(VERSION_KEY) : null;
  }
  try {
    const raw = window.localStorage.getItem(VERSION_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function writeRawVersion(version) {
  if (!isStorageAvailable()) {
    memoryFallback.set(VERSION_KEY, version);
    return;
  }
  try {
    window.localStorage.setItem(VERSION_KEY, JSON.stringify(version));
  } catch (error) {
    console.warn('[storage.js] バージョン情報の保存に失敗しました', error);
    memoryFallback.set(VERSION_KEY, version);
  }
}

export function runMigrations() {
  const storedVersion = readRawVersion() ?? 0;

  if (storedVersion === CURRENT_VERSION) return;

  migrations
    .filter((step) => step.from >= storedVersion && step.to <= CURRENT_VERSION)
    .sort((a, b) => a.from - b.from)
    .forEach((step) => {
      try {
        step.migrate();
      } catch (error) {
        console.warn(`[storage.js] マイグレーションに失敗しました (v${step.from} → v${step.to})`, error);
      }
    });

  writeRawVersion(CURRENT_VERSION);
}

export function getVersion() {
  return CURRENT_VERSION;
}

/**
 * このアプリ（cal0209_プレフィックス）がlocalStorageに実際に使用している
 * 概算バイト数を返す。キー名＋値のJSON文字列長を積算した概算値であり、
 * ブラウザの内部エンコーディングと厳密には一致しないが、目安表示としては十分。
 * @returns {number}
 */
export function getUsageBytes() {
  if (!isStorageAvailable()) return 0;

  let total = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const fullKey = window.localStorage.key(i);
      if (!fullKey || !fullKey.startsWith(PREFIX)) continue;
      const value = window.localStorage.getItem(fullKey);
      total += fullKey.length + (value ? value.length : 0);
    }
  } catch (error) {
    console.warn('[storage.js] getUsageBytesの計算中にエラーが発生しました', error);
  }
  return total;
}

runMigrations();

function handleStorageEvent(event) {
  if (!event.key || !event.key.startsWith(PREFIX)) return;
  if (event.key === VERSION_KEY) return;

  const key = event.key.slice(PREFIX.length);
  if (!VALID_KEYS.has(key)) return;

  let oldValue = null;
  let newValue = null;

  try {
    oldValue = event.oldValue === null ? null : JSON.parse(event.oldValue);
  } catch (error) {
    oldValue = null;
  }

  try {
    newValue = event.newValue === null ? null : JSON.parse(event.newValue);
  } catch (error) {
    newValue = null;
  }

  notify(key, oldValue, safeClone(newValue));
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', handleStorageEvent);
}

const Storage = {
  STORAGE_KEYS,
  get,
  set,
  remove,
  clearAll,
  subscribe,
  unsubscribe,
  runMigrations,
  getVersion,
  getUsageBytes,
};

export default Storage;