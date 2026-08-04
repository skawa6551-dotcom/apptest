// ============================================================
// router.js
// Calculator / Workspace / Records / Calendar / Archive / Pairing /
// Messages の7画面の遷移だけを管理するモジュール。
//
// 各画面の中身（DOM生成・開閉・カード等）は各モジュール（workspace.js /
// records.js / calendar.js / archive.js / pairing.js / messages.js）の
// 責務のままとし、ここでは「今どの画面にいるか」と「どう切り替わるか」
// だけを扱う。AutoLockの開始/停止/リセットも、画面遷移に付随する処理
// としてここでまとめて面倒を見る。
// ============================================================

import Workspace from './workspace.js';
import Records from './records.js';
import Calendar from './calendar.js';
import Archive from './archive.js';
import Pairing from './pairing.js';
import Messages from './messages.js';
import AutoLock from './autolock.js';

/** 現在表示中の画面。 */
const SCREENS = Object.freeze({
  CALCULATOR: 'calculator',
  WORKSPACE: 'workspace',
  RECORDS: 'records',
  CALENDAR: 'calendar',
  ARCHIVE: 'archive',
  PAIRING: 'pairing',
  MESSAGES: 'messages',
});

/** @type {'calculator'|'workspace'|'records'|'calendar'|'archive'|'pairing'|'messages'} */
let currentScreen = SCREENS.CALCULATOR;

/**
 * init()が既に実行済みかどうか。registerActivityListeners()の
 * 二重登録防止に使う（init()が将来複数回呼ばれても安全にするため）。
 */
let isInitialized = false;

/**
 * 現在の#app（Calculator）要素を取得する。
 * hideCalculator()/showCalculator()の両方がここを通ることで、
 * DOM取得箇所を1つにまとめる。
 * @returns {HTMLElement|null}
 */
function getCalculatorElement() {
  return document.getElementById('app');
}

function hideCalculator() {
  const app = getCalculatorElement();
  if (app) app.hidden = true;
}

function showCalculator() {
  const app = getCalculatorElement();
  if (app) app.hidden = false;
}

/**
 * ルーティングまわりの初期化を一括で行う。app.jsのinit()から一度だけ呼ぶ想定。
 * ・Workspace/Records/Calendar/Archive/Pairing/Messages画面のDOM構築
 * ・AutoLockタイムアウト時のハンドラ登録
 * ・タップ／キー入力／テキスト入力など操作全般でAutoLockタイマーを
 *   リセットするためのグローバルリスナー登録
 * ・初期画面はCalculator（コンストラクタでの初期値のまま）
 * を、この関数1つにまとめる。
 */
export function init() {
  Workspace.create();
  Records.create();
  Calendar.create();
  Archive.create();
  Pairing.create();
  Messages.create();
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
 * isInitializedで多重登録を防ぐため、init()が将来複数回呼ばれても
 * リスナーが増殖することはない。
 */
function registerActivityListeners() {
  if (isInitialized) return;

  ['pointerdown', 'keydown', 'input', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, notifyActivity, { passive: true });
  });

  isInitialized = true;
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
 * Workspaceの「カレンダー」カードで呼ぶ。
 */
export function openCalendar() {
  Workspace.close();
  Calendar.open();
  currentScreen = SCREENS.CALENDAR;
  AutoLock.reset();
}

/**
 * Calendarの「戻る」で呼ぶ。CalendarからWorkspaceへ戻る。
 */
export function closeCalendar() {
  Calendar.close();
  Workspace.open();
  currentScreen = SCREENS.WORKSPACE;
  AutoLock.reset();
}

/**
 * Workspaceの「Archive」カードで呼ぶ。
 */
export function openArchive() {
  Workspace.close();
  Archive.open();
  currentScreen = SCREENS.ARCHIVE;
  AutoLock.reset();
}

/**
 * Archiveの「戻る」で呼ぶ。ArchiveからWorkspaceへ戻る。
 */
export function closeArchive() {
  Archive.close();
  Workspace.open();
  currentScreen = SCREENS.WORKSPACE;
  AutoLock.reset();
}

/**
 * Workspaceの「メッセージ」カードで呼ぶ。
 * まだルームに接続していない（＝ローカルにroomIdが無い）場合はPairingを開く。
 * 既に接続済みの場合は直接Messagesを開く。
 * どちらの判定を行うかはapp.js側の責務とし、Router自体はどちらか一方の
 * 呼び出しを受けるだけの単純な形にする。
 */
export function openPairing() {
  Workspace.close();
  Pairing.open();
  currentScreen = SCREENS.PAIRING;
  AutoLock.reset();
}

/**
 * Pairingの「戻る」で呼ぶ。PairingからWorkspaceへ戻る。
 */
export function closePairing() {
  Pairing.close();
  Workspace.open();
  currentScreen = SCREENS.WORKSPACE;
  AutoLock.reset();
}

/**
 * ペアリングが成立した瞬間（招待コード発行側で相手の参加を検知した時、
 * または招待コード入力側で参加に成功した時）に呼ぶ。
 * Workspaceを経由せず、PairingからMessagesへ直接切り替える。
 */
export function completePairing() {
  Pairing.close();
  Messages.open();
  currentScreen = SCREENS.MESSAGES;
  AutoLock.reset();
}

/**
 * Workspaceの「メッセージ」カードで、既にルームに接続済みの場合に呼ぶ。
 */
export function openMessages() {
  Workspace.close();
  Messages.open();
  currentScreen = SCREENS.MESSAGES;
  AutoLock.reset();
}

/**
 * Messagesの「戻る」で呼ぶ。MessagesからWorkspaceへ戻る。
 */
export function closeMessages() {
  Messages.close();
  Workspace.open();
  currentScreen = SCREENS.WORKSPACE;
  AutoLock.reset();
}

/**
 * 🔒（今すぐロック）。Workspace/Records/Calendar/Archive/Pairing/Messages
 * のどれからでも、即座にCalculatorへ強制的に戻す。
 *
 * TODO: 現在は各画面を無条件でclose()しているが、画面数がさらに増えた
 *   場合は switch (currentScreen) { ... } のように「今いる画面だけ」を
 *   閉じる構造に変更すると、画面が増えるたびにここへclose()を1行足す
 *   必要がなくなる。現時点では画面数が少なく実害が無いため、
 *   現状維持のまま次回以降の検討事項とする。
 */
export function lockNow() {
  Records.close();
  Calendar.close();
  Archive.close();
  Pairing.close();
  Messages.close();
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
 * @returns {'calculator'|'workspace'|'records'|'calendar'|'archive'|'pairing'|'messages'}
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

// TODO: Router.destroy() — registerActivityListeners()で登録した
// pointerdown/keydown/input/touchstartのリスナーを解除する関数。
// 現在のPWA（ページ全体が1つのSPA的な生存期間を持つ）では不要だが、
// 将来ユニットテストや、Routerインスタンスを使い捨てるような構成
// （例: テストごとにモジュールを再初期化する等）が必要になった場合に
// 実装する。現時点では未実装。

const Router = {
  init,
  openWorkspace,
  closeWorkspace,
  openRecords,
  closeRecords,
  openCalendar,
  closeCalendar,
  openArchive,
  closeArchive,
  openPairing,
  closePairing,
  completePairing,
  openMessages,
  closeMessages,
  lockNow,
  enableViewMode,
  disableViewMode,
  getCurrentScreen,
  notifyActivity,
  Screen: SCREENS,
};

export default Router;