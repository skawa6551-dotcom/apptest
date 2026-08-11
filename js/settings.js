// ============================================================
// settings.js
// 設定値の取得・変更・Storageとの連携のみを担当するモジュール。
// DOM操作（document/window/querySelector等）は一切行わない。
// ============================================================

import Storage, { STORAGE_KEYS } from './storage.js';
import { DEFAULT_THEME_ID, isValidThemeId } from './themes.js';

export const APP_VERSION = '1.0.0';

function isBoolean(value) {
  return typeof value === 'boolean';
}

/**
 * 0以上の数値（ミリ秒）かどうかを検証する。0は「なし／整理しない」を意味する。
 * @param {*} value
 * @returns {boolean}
 */
function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** 会話整理方法として許可する値 */
const ORGANIZE_MODES = Object.freeze(['manual', 'auto', 'both']);

function isValidOrganizeMode(value) {
  return ORGANIZE_MODES.includes(value);
}

/**
 * 自動ロックまでの時間のプリセット（ミリ秒）。0 は「なし」（自動ロックしない）。
 * 設定画面のプルダウンはこの配列から選択肢を生成する。
 */
export const AUTO_LOCK_DURATION_PRESETS = Object.freeze([
  { label: '30秒', valueMs: 30 * 1000 },
  { label: '1分', valueMs: 60 * 1000 },
  { label: '3分', valueMs: 3 * 60 * 1000 },
  { label: '5分', valueMs: 5 * 60 * 1000 },
  { label: '10分', valueMs: 10 * 60 * 1000 },
  { label: '15分', valueMs: 15 * 60 * 1000 },
  { label: '30分', valueMs: 30 * 60 * 1000 },
  { label: 'なし', valueMs: 0 },
]);

/**
 * 会話整理までの時間のプリセット（ミリ秒）。0 は「整理しない」。
 * 現時点ではこの設定値自体は未使用（実際にメッセージをArchiveへ
 * 移動する処理は実装していない）。将来Phase2以降でこの値を参照する
 * 実装を追加する前提で、設定項目と保存の仕組みだけを先に用意している。
 */
export const CONVERSATION_ORGANIZE_DURATION_PRESETS = Object.freeze([
  { label: '5分', valueMs: 5 * 60 * 1000 },
  { label: '10分', valueMs: 10 * 60 * 1000 },
  { label: '15分', valueMs: 15 * 60 * 1000 },
  { label: '30分', valueMs: 30 * 60 * 1000 },
  { label: '45分', valueMs: 45 * 60 * 1000 },
  { label: '1時間', valueMs: 60 * 60 * 1000 },
  { label: '2時間', valueMs: 2 * 60 * 60 * 1000 },
  { label: '3時間', valueMs: 3 * 60 * 60 * 1000 },
  { label: '6時間', valueMs: 6 * 60 * 60 * 1000 },
  { label: '12時間', valueMs: 12 * 60 * 60 * 1000 },
  { label: '24時間', valueMs: 24 * 60 * 60 * 1000 },
  { label: '48時間', valueMs: 48 * 60 * 60 * 1000 },
  { label: '3日', valueMs: 3 * 24 * 60 * 60 * 1000 },
  { label: '7日', valueMs: 7 * 24 * 60 * 60 * 1000 },
  { label: '整理しない', valueMs: 0 },
]);

const SETTING_SCHEMA = Object.freeze({
  theme: {
    key: STORAGE_KEYS.THEME,
    default: DEFAULT_THEME_ID,
    validate: isValidThemeId,
  },
  soundEnabled: {
    key: STORAGE_KEYS.SOUND_ENABLED,
    default: true,
    validate: isBoolean,
  },
  vibrationEnabled: {
    key: STORAGE_KEYS.VIBRATION_ENABLED,
    default: true,
    validate: isBoolean,
  },
  biometricEnabled: {
    key: STORAGE_KEYS.BIOMETRIC_ENABLED,
    default: false,
    validate: isBoolean,
  },
  // ---- セキュリティ ----
  autoLockDurationMs: {
    key: STORAGE_KEYS.AUTO_LOCK_DURATION_MS,
    default: 5 * 60 * 1000,
    validate: isNonNegativeNumber,
  },
  archiveLockEnabled: {
    key: STORAGE_KEYS.ARCHIVE_LOCK_ENABLED,
    default: false,
    validate: isBoolean,
  },
  messagesLockEnabled: { key: STORAGE_KEYS.MESSAGES_LOCK_ENABLED, default: false, validate: isBoolean },
  calendarLockEnabled: { key: STORAGE_KEYS.CALENDAR_LOCK_ENABLED, default: false, validate: isBoolean },
  photoLockEnabled: { key: STORAGE_KEYS.PHOTO_LOCK_ENABLED, default: false, validate: isBoolean },
  recordsLockEnabled: { key: STORAGE_KEYS.RECORDS_LOCK_ENABLED, default: false, validate: isBoolean },
  // ---- 通知（設定値の保存のみ。実際に通知を送る仕組みは未実装） ----
  notificationsEnabled: {
    key: STORAGE_KEYS.NOTIFICATIONS_ENABLED,
    default: true,
    validate: isBoolean,
  },
  notificationContentEnabled: {
    key: STORAGE_KEYS.NOTIFICATION_CONTENT_ENABLED,
    default: true,
    validate: isBoolean,
  },
  notificationSoundEnabled: {
    key: STORAGE_KEYS.NOTIFICATION_SOUND_ENABLED,
    default: true,
    validate: isBoolean,
  },
  notificationVibrationEnabled: {
    key: STORAGE_KEYS.NOTIFICATION_VIBRATION_ENABLED,
    default: true,
    validate: isBoolean,
  },
  // ---- チャット設定 ----
  // 会話整理方法／整理時間は、現時点ではUIと保存の仕組みのみで、
  // 実際にメッセージをArchiveへ移動する処理は行わない（未使用の設定値）。
  conversationOrganizeMode: {
    key: STORAGE_KEYS.CONVERSATION_ORGANIZE_MODE,
    default: 'manual',
    validate: isValidOrganizeMode,
  },
  conversationOrganizeDurationMs: {
    key: STORAGE_KEYS.CONVERSATION_ORGANIZE_DURATION_MS,
    default: 24 * 60 * 60 * 1000,
    validate: isNonNegativeNumber,
  },
  readReceiptsEnabled: {
    key: STORAGE_KEYS.READ_RECEIPTS_ENABLED,
    default: true,
    validate: isBoolean,
  },
  onlineVisibilityEnabled: {
    key: STORAGE_KEYS.ONLINE_VISIBILITY_ENABLED,
    default: true,
    validate: isBoolean,
  },
});

function getSchemaValue(name) {
  const schema = SETTING_SCHEMA[name];
  const value = Storage.get(schema.key, schema.default);
  return schema.validate(value) ? value : schema.default;
}

function setSchemaValue(name, value) {
  const schema = SETTING_SCHEMA[name];
  if (!schema.validate(value)) {
    console.warn(`[settings.js] 不正な値が指定されたため無視しました (setting: "${name}")`, value);
    return false;
  }
  Storage.set(schema.key, value);
  return true;
}

export function getTheme() {
  return getSchemaValue('theme');
}

export function setTheme(themeId) {
  return setSchemaValue('theme', themeId);
}

export function isSoundEnabled() {
  return getSchemaValue('soundEnabled');
}

export function setSoundEnabled(value) {
  return setSchemaValue('soundEnabled', value);
}

export function isVibrationEnabled() {
  return getSchemaValue('vibrationEnabled');
}

export function setVibrationEnabled(value) {
  return setSchemaValue('vibrationEnabled', value);
}

export function isBiometricEnabled() {
  return getSchemaValue('biometricEnabled');
}

export function setBiometricEnabled(value) {
  return setSchemaValue('biometricEnabled', value);
}

// ------------------------------------------------------------
// セキュリティ
// ------------------------------------------------------------

/**
 * 自動ロックまでの時間（ミリ秒）を返す。0は「自動ロックしない」。
 * @returns {number}
 */
export function getAutoLockDurationMs() {
  return getSchemaValue('autoLockDurationMs');
}

export function setAutoLockDurationMs(valueMs) {
  return setSchemaValue('autoLockDurationMs', valueMs);
}

export function isArchiveLockEnabled() {
  return getSchemaValue('archiveLockEnabled');
}

export function setArchiveLockEnabled(value) {
  return setSchemaValue('archiveLockEnabled', value);
}

export function isMessagesLockEnabled() { return getSchemaValue('messagesLockEnabled'); }
export function setMessagesLockEnabled(value) { return setSchemaValue('messagesLockEnabled', value); }
export function isCalendarLockEnabled() { return getSchemaValue('calendarLockEnabled'); }
export function setCalendarLockEnabled(value) { return setSchemaValue('calendarLockEnabled', value); }
export function isPhotoLockEnabled() { return getSchemaValue('photoLockEnabled'); }
export function setPhotoLockEnabled(value) { return setSchemaValue('photoLockEnabled', value); }
export function isRecordsLockEnabled() { return getSchemaValue('recordsLockEnabled'); }
export function setRecordsLockEnabled(value) { return setSchemaValue('recordsLockEnabled', value); }

// ------------------------------------------------------------
// 通知（保存のみ。実際の配信は未実装）
// ------------------------------------------------------------

export function isNotificationsEnabled() {
  return getSchemaValue('notificationsEnabled');
}

export function setNotificationsEnabled(value) {
  return setSchemaValue('notificationsEnabled', value);
}

export function isNotificationContentEnabled() {
  return getSchemaValue('notificationContentEnabled');
}

export function setNotificationContentEnabled(value) {
  return setSchemaValue('notificationContentEnabled', value);
}

export function isNotificationSoundEnabled() {
  return getSchemaValue('notificationSoundEnabled');
}

export function setNotificationSoundEnabled(value) {
  return setSchemaValue('notificationSoundEnabled', value);
}

export function isNotificationVibrationEnabled() {
  return getSchemaValue('notificationVibrationEnabled');
}

export function setNotificationVibrationEnabled(value) {
  return setSchemaValue('notificationVibrationEnabled', value);
}

// ------------------------------------------------------------
// チャット設定
// ------------------------------------------------------------

/**
 * 会話整理方法（'manual'|'auto'|'both'）を返す。
 * 【未使用】この値を参照して実際にメッセージを整理する処理は未実装。
 * @returns {'manual'|'auto'|'both'}
 */
export function getConversationOrganizeMode() {
  return getSchemaValue('conversationOrganizeMode');
}

export function setConversationOrganizeMode(mode) {
  return setSchemaValue('conversationOrganizeMode', mode);
}

/**
 * 会話整理までの時間（ミリ秒）を返す。0は「整理しない」。
 * 【未使用】上記と同様、実際の整理処理は未実装。
 * @returns {number}
 */
export function getConversationOrganizeDurationMs() {
  return getSchemaValue('conversationOrganizeDurationMs');
}

export function setConversationOrganizeDurationMs(valueMs) {
  return setSchemaValue('conversationOrganizeDurationMs', valueMs);
}

export function isReadReceiptsEnabled() {
  return getSchemaValue('readReceiptsEnabled');
}

export function setReadReceiptsEnabled(value) {
  return setSchemaValue('readReceiptsEnabled', value);
}

export function isOnlineVisibilityEnabled() {
  return getSchemaValue('onlineVisibilityEnabled');
}

export function setOnlineVisibilityEnabled(value) {
  return setSchemaValue('onlineVisibilityEnabled', value);
}

// ------------------------------------------------------------

export function getAll() {
  return Object.fromEntries(
    Object.keys(SETTING_SCHEMA).map((name) => [name, getSchemaValue(name)]),
  );
}

export function resetDefaults() {
  Object.values(SETTING_SCHEMA).forEach((schema) => {
    Storage.set(schema.key, schema.default);
  });
}

export function getVersion() {
  return APP_VERSION;
}

const Settings = Object.freeze({
  getTheme,
  setTheme,
  isSoundEnabled,
  setSoundEnabled,
  isVibrationEnabled,
  setVibrationEnabled,
  isBiometricEnabled,
  setBiometricEnabled,
  getAutoLockDurationMs,
  setAutoLockDurationMs,
  isArchiveLockEnabled,
  setArchiveLockEnabled,
  isMessagesLockEnabled,
  setMessagesLockEnabled,
  isCalendarLockEnabled,
  setCalendarLockEnabled,
  isPhotoLockEnabled,
  setPhotoLockEnabled,
  isRecordsLockEnabled,
  setRecordsLockEnabled,
  isNotificationsEnabled,
  setNotificationsEnabled,
  isNotificationContentEnabled,
  setNotificationContentEnabled,
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  isNotificationVibrationEnabled,
  setNotificationVibrationEnabled,
  getConversationOrganizeMode,
  setConversationOrganizeMode,
  getConversationOrganizeDurationMs,
  setConversationOrganizeDurationMs,
  isReadReceiptsEnabled,
  setReadReceiptsEnabled,
  isOnlineVisibilityEnabled,
  setOnlineVisibilityEnabled,
  getAll,
  resetDefaults,
  getVersion,
});

export default Settings;