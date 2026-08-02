// ============================================================
// router.js
// Calculator / Workspace / Records の3画面の遷移だけを管理するモジュール。
//
// 各画面の中身（DOM生成・開閉・カード等）は各モジュール（workspace.js /
// records.js）の責務のままとし、ここでは「今どの画面にいるか」と
// 「どう切り替わるか」だけを扱う。AutoLockの開始/停止/リセットも、
// 画面遷移に付随する処理としてここでまとめて面倒を見る。
// ============================================================

import Workspace from './workspace.js';
import Records from './records.js';
import AutoLock from './autolock.js';

/** 現在表示中の画面。 */
const SCREENS = Object.freeze({
  CALCULATOR: 'calculator',
  WORKSPACE: 'workspace',
  RECORDS: 'records',
});

/** @type {'calculator'|'workspace'|'records'} */
let currentScreen = SCREENS.CALCULATOR;

function hideCalculator() {
  const app = document.getElementById('app');
  if (app) app.hidden = true;
}

function showCalculator() {
  const app = document.getElementById('app');
  if (app) app.hidden = false;
}

/**
 * ルーティングまわりの初期化を一括で行う。app.jsのinit()から一度だけ呼ぶ想定。
 * ・Workspace/Records画面のDOM構築
 * ・AutoLockタイムアウト時のハンドラ登録
 * ・タップ／キー入力／テキスト入力など操作全般でAutoLockタイマーを
 *   リセットするためのグローバルリスナー登録
 * ・初期画面はCalculator（コンストラクタでの初期値のまま）
 * を、この関数1つにまとめる。
 */
export function init() {
  Workspace.create();
  Records.create();
  initAutoLock();
  registerActivityListeners();
}

/**
 * AutoLockのタイムアウト時の挙動（＝lockNow()）を登録する。
 */
function initAutoLock() {
  AutoLock.setHandler(() => {
    lockNow();
  });
}

/**
 * タップ・キー入力・テキスト入力など、ユーザー操作全般を検知して
 * notifyActivity()を呼ぶグローバルリスナーを登録する。
 * notifyActivity()自体がCalculator画面では何もしないため、
 * Calculator画面にいる間もリスナーを付けっぱなしで問題ない。
 */
function registerActivityListeners() {
  ['pointerdown', 'keydown', 'input', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, notifyActivity, { passive: true });
  });
}

/**
 * "パスコード"入力成立時に呼ぶ。CalculatorからWorkspaceへ遷移する。
 */
export function openWorkspace() {
  hideCalculator();
  Workspace.open();
  currentScreen = SCREENS.WORKSPACE;
  AutoLock.start();
}

/**
 * Workspaceの「戻る」で呼ぶ。WorkspaceからCalculatorへ戻る。
 */
export function closeWorkspace() {
  Workspace.close();
  showCalculator();
  currentScreen = SCREENS.CALCULATOR;
  AutoLock.stop();
}

/**
 * Workspaceの「記録」カードで呼ぶ。
 */
export function openRecords() {
  Workspace.close();
  Records.open();
  currentScreen = SCREENS.RECORDS;
  AutoLock.reset();
}

/**
 * Recordsの「戻る」で呼ぶ。RecordsからWorkspaceへ戻る。
 */
export function closeRecords() {
  Records.close();
  Workspace.open();
  currentScreen = SCREENS.WORKSPACE;
  AutoLock.reset();
}

/**
 * 🔒（今すぐロック）。Workspace/Recordsのどちらからでも、
 * 即座にCalculatorへ強制的に戻す。
 */
export function lockNow() {
  Records.close();
  Workspace.close();
  showCalculator();
  currentScreen = SCREENS.CALCULATOR;
  AutoLock.stop();
}

/**
 * 鑑賞モードを有効にする（AutoLockを止める）。
 * パスコード認証はapp.js/workspace.js側の責務で、ここでは呼ばれた前提で処理する。
 */
export function enableViewMode() {
  AutoLock.stop();
}

/**
 * 鑑賞モードを解除する（Calculator以外にいればAutoLockを再開する）。
 */
export function disableViewMode() {
  if (currentScreen !== SCREENS.CALCULATOR) {
    AutoLock.start();
  }
}

/**
 * 現在表示中の画面を返す。
 * @returns {'calculator'|'workspace'|'records'}
 */
export function getCurrentScreen() {
  return currentScreen;
}

/**
 * Workspace/Records内で何らかの操作があるたびに呼ぶ。AutoLockのタイマーをリセットする。
 * Calculator画面にいる間（AutoLockが動いていない間）は何もしない。
 */
export function notifyActivity() {
  if (currentScreen !== SCREENS.CALCULATOR) {
    AutoLock.reset();
  }
}

const Router = {
  init,
  openWorkspace,
  closeWorkspace,
  openRecords,
  closeRecords,
  lockNow,
  enableViewMode,
  disableViewMode,
  getCurrentScreen,
  notifyActivity,
  Screen: SCREENS,
};

export default Router;