// ============================================================
// passcode.js
// Workspaceへの入場・鑑賞モード解除に使うパスコードを一元管理するモジュール。
// 現時点では固定値（'0209'）だが、将来Settings画面から変更できるように
// getPasscode() / setPasscode() / validate() という3つの公開APIに
// あらかじめ分離しておく。DOM操作は一切行わない。
// ============================================================

/** デフォルトのパスコード。Settingsからの変更が行われるまではこの値を使う。 */
const DEFAULT_PASSCODE = '0209';

/** 現在有効なパスコード。 */
const PASSCODE_STORAGE_KEY = 'calculator0209_custom_passcode';

function readStoredPasscode() {
  try {
    const value = window.localStorage.getItem(PASSCODE_STORAGE_KEY);
    return typeof value === 'string' && /^\d{4,8}$/.test(value)
      ? value
      : DEFAULT_PASSCODE;
  } catch (error) {
    console.warn('[passcode.js] 保存済みパスコードを読めませんでした', error);
    return DEFAULT_PASSCODE;
  }
}

/** 現在のパスコード（この端末だけに保存）。 */
let currentPasscode = readStoredPasscode();

/**
 * 現在のパスコードを返す。
 * app.js側の桁数判定（passcodeBuffer.length === Passcode.getPasscode().length）
 * にそのまま使えるよう、常に文字列を返す。
 * @returns {string}
 */
export function getPasscode() {
  return currentPasscode;
}

/**
 * パスコードを変更する。将来Settings画面から呼び出される想定の入口。
 * 数字のみで構成された文字列以外（空文字・非数字混入等）は無視し、
 * 不正な値によって二度と入場できなくなる事故を防ぐ。
 * @param {string} value
 * @returns {boolean} 変更が反映された場合はtrue
 */
export function setPasscode(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4,8}$/.test(value)) return false;

  try {
    window.localStorage.setItem(PASSCODE_STORAGE_KEY, value);
    currentPasscode = value;
    return true;
  } catch (error) {
    console.warn('[passcode.js] パスコードを保存できませんでした', error);
    return false;
  }
}

/**
 * 入力された文字列が現在のパスコードと完全一致するかどうかを判定する。
 * secret-home.jsで採用していた「完全一致のみ・部分一致や桁超過は不一致」
 * という仕様をそのまま踏襲する。
 * @param {string} value
 * @returns {boolean}
 */
export function validate(value) {
  return value === currentPasscode;
}

const Passcode = {
  getPasscode,
  setPasscode,
  validate,
};

export default Passcode;