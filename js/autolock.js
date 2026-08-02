// ============================================================
// autolock.js
// Workspace以降の画面が一定時間操作されなかったときにタイムアウトを
// 通知するためのタイマー管理モジュール。
//
// 「時間切れになったら登録済みのハンドラを呼ぶ」という責務だけを持ち、
// 実際に何をロックとするか・画面をどう切り替えるかはrouter.js側が決める。
// DOM操作は一切行わない。
// ============================================================

/** 無操作でタイムアウトするまでの時間（5分） */
const AUTO_LOCK_TIME_MS = 5 * 60 * 1000;

/** window.setTimeout()のID。動いていない間はnull。 */
let timerId = null;

/** タイムアウト時に呼ぶハンドラ。 */
let onTimeout = null;

/** タイマーが有効化されているかどうか（stop()で明示的に止めた場合はfalse）。 */
let isActive = false;

function clearTimer() {
  if (timerId !== null) {
    window.clearTimeout(timerId);
    timerId = null;
  }
}

/**
 * タイマーを開始する（既に動いていれば一度止めてから開始し直す）。
 * router.jsがWorkspace/Records入場時に呼ぶ想定。
 */
export function start() {
  isActive = true;
  clearTimer();
  timerId = window.setTimeout(() => {
    timerId = null;
    if (typeof onTimeout === 'function') {
      onTimeout();
    }
  }, AUTO_LOCK_TIME_MS);
}

/**
 * 操作があったときに呼ぶ。タイマーを最初からやり直す。
 * stop()で明示的に止めている間（鑑賞モード中）は何もしない。
 */
export function reset() {
  if (!isActive) return;
  start();
}

/**
 * タイマーを完全に停止する（鑑賞モード中・Calculatorへ戻ったときに使う）。
 */
export function stop() {
  isActive = false;
  clearTimer();
}

/**
 * タイムアウト時に呼ぶ関数を登録する。
 * @param {() => void} fn
 */
export function setHandler(fn) {
  onTimeout = fn;
}

const AutoLock = {
  start,
  reset,
  stop,
  setHandler,
};

export default AutoLock;