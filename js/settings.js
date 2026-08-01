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
  getAll,
  resetDefaults,
  getVersion,
});

export default Settings;
