// ============================================================
// passcode.js
// Calculator 0209 v58
// 端末ごとのパスコードを安全に管理する。
// ============================================================

const DEFAULT_PASSCODE = '0209';
const STORAGE_KEY = 'calculator0209_custom_passcode';

export function getPasscode() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (
      typeof stored === 'string' &&
      /^\d{4,8}$/.test(stored)
    ) {
      return stored;
    }
  } catch (error) {
    console.warn('[passcode.js] パスコード読み込み失敗', error);
  }

  return DEFAULT_PASSCODE;
}

export function setPasscode(value) {
  const normalized = String(value ?? '').trim();

  if (!/^\d{4,8}$/.test(normalized)) {
    return false;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      normalized,
    );
    return true;
  } catch (error) {
    console.warn('[passcode.js] パスコード保存失敗', error);
    return false;
  }
}

export function resetPasscode() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn('[passcode.js] パスコード初期化失敗', error);
    return false;
  }
}

export function validate(value) {
  return String(value ?? '') === getPasscode();
}

const Passcode = {
  getPasscode,
  setPasscode,
  resetPasscode,
  validate,
};

export default Passcode;
