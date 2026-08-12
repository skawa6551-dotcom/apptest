// ============================================================

// router.js

// Calculator / Workspace / Records / Calendar / Archive / Pairing /

// Messages / Photo の8画面の遷移だけを管理するモジュール。

//

// 各画面の中身（DOM生成・開閉・カード等）は各モジュールの責務。

// ここでは「今どの画面にいるか」と「どう切り替わるか」だけを扱う。

// AutoLockの開始/停止/リセットも画面遷移に付随して管理する。

// ============================================================

import Workspace from './workspace.js';

import Records from './records.js';

import Calendar from './calendar.js';

import Archive from './archive.js';

import Pairing from './pairing.js';

import Messages from './messages.js';

import Photo from './photo.js';

import AutoLock from './autolock.js';

import Calculator from './calculator.js';

// ------------------------------------------------------------

// 画面一覧

// ------------------------------------------------------------

const SCREENS = Object.freeze({

  CALCULATOR: 'calculator',

  WORKSPACE: 'workspace',

  RECORDS: 'records',

  CALENDAR: 'calendar',

  ARCHIVE: 'archive',

  PAIRING: 'pairing',

  MESSAGES: 'messages',

  PHOTO: 'photo',

});

// ------------------------------------------------------------

// 現在画面

// ------------------------------------------------------------

let currentScreen =

  SCREENS.CALCULATOR;

// ------------------------------------------------------------

// 初期化状態

// ------------------------------------------------------------

let isInitialized =

  false;

// ------------------------------------------------------------

// Calculator要素

// ------------------------------------------------------------

function getCalculatorElement() {

  return document.getElementById(

    'app',

  );

}

// ------------------------------------------------------------

// Calculator非表示

// ------------------------------------------------------------

function hideCalculator() {

  const app =

    getCalculatorElement();

  if (app) {

    app.hidden = true;

  }

}

// ------------------------------------------------------------

// Calculator表示

// ------------------------------------------------------------

function showCalculator() {

  const app =

    getCalculatorElement();

  if (app) {

    app.hidden = false;

  }

}

// ------------------------------------------------------------

// 初期化

// ------------------------------------------------------------

export function init() {

  Workspace.create();

  Records.create();

  Calendar.create();

  Archive.create();

  Pairing.create();

  Messages.create();

  Photo.create();

  initAutoLock();

  registerActivityListeners();

}

// ------------------------------------------------------------

// AutoLock初期化

// ------------------------------------------------------------

function initAutoLock() {

  AutoLock.setHandler(() => {

    lockNow();

  });

}

// ------------------------------------------------------------

// 操作検知

// ------------------------------------------------------------

function registerActivityListeners() {

  if (isInitialized) {

    return;

  }

  [

    'pointerdown',

    'keydown',

    'input',

    'touchstart',

  ].forEach((eventName) => {

    document.addEventListener(

      eventName,

      notifyActivity,

      {

        passive: true,

      },

    );

  });

  isInitialized = true;

}

// ------------------------------------------------------------

// Workspaceを開く

// ------------------------------------------------------------

export function openWorkspace() {

  hideCalculator();

  Workspace.open();

  currentScreen =

    SCREENS.WORKSPACE;

  AutoLock.start();

}

// ------------------------------------------------------------

// Workspaceを閉じる

// ------------------------------------------------------------

export function closeWorkspace() {

  Workspace.close();

  showCalculator();

  currentScreen =

    SCREENS.CALCULATOR;

  AutoLock.stop();

}

// ------------------------------------------------------------

// Recordsを開く

// ------------------------------------------------------------

export function openRecords() {

  Workspace.close();

  Records.open();

  currentScreen =

    SCREENS.RECORDS;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Recordsを閉じる

// ------------------------------------------------------------

export function closeRecords() {

  Records.close();

  Workspace.open();

  currentScreen =

    SCREENS.WORKSPACE;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Calendarを開く

// ------------------------------------------------------------

export function openCalendar() {

  Workspace.close();

  Calendar.open();

  currentScreen =

    SCREENS.CALENDAR;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Calendarを閉じる

// ------------------------------------------------------------

export function closeCalendar() {

  Calendar.close();

  Workspace.open();

  currentScreen =

    SCREENS.WORKSPACE;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Archiveを開く

// ------------------------------------------------------------

export function openArchive() {

  Workspace.close();

  Archive.open();

  currentScreen =

    SCREENS.ARCHIVE;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Archiveを閉じる

// ------------------------------------------------------------

export function closeArchive() {

  Archive.close();

  Workspace.open();

  currentScreen =

    SCREENS.WORKSPACE;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Pairingを開く

// ------------------------------------------------------------

export function openPairing() {

  Workspace.close();

  Pairing.open();

  currentScreen =

    SCREENS.PAIRING;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Pairingを閉じる

// ------------------------------------------------------------

export function closePairing() {

  Pairing.close();

  Workspace.open();

  currentScreen =

    SCREENS.WORKSPACE;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Pairing完了 → Messages

// ------------------------------------------------------------

export function completePairing() {

  Pairing.close();

  Messages.open();

  currentScreen =

    SCREENS.MESSAGES;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Messagesを開く

// ------------------------------------------------------------

export function openMessages() {

  Workspace.close();

  Messages.open();

  currentScreen =

    SCREENS.MESSAGES;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Messagesを閉じる

// ------------------------------------------------------------

export function closeMessages() {

  Messages.close();

  Workspace.open();

  currentScreen =

    SCREENS.WORKSPACE;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Photoを開く

// ------------------------------------------------------------

export function openPhoto() {

  Workspace.close();

  Photo.open();

  currentScreen =

    SCREENS.PHOTO;

  AutoLock.reset();

}

// ------------------------------------------------------------

// Photoを閉じる

// ------------------------------------------------------------

export function closePhoto() {

  Photo.close();

  Workspace.open();

  currentScreen =

    SCREENS.WORKSPACE;

  AutoLock.reset();

}

// ------------------------------------------------------------

// 今すぐロック

// ------------------------------------------------------------

export function lockNow() {

  // ロック解除に使った数字や計算途中の値を残さない。
  Calculator.reset();

  const expressionDisplay =
    document.getElementById('expressionDisplay');

  const resultDisplay =
    document.getElementById('resultDisplay');

  if (expressionDisplay) {
    expressionDisplay.textContent = '';
  }

  if (resultDisplay) {
    resultDisplay.textContent = '0';
    resultDisplay.classList.remove('is-error', 'result-display--long');
  }

  Records.close();

  Calendar.close();

  Archive.close();

  Pairing.close();

  Messages.close();

  Photo.close();

  Workspace.close();

  showCalculator();

  currentScreen =

    SCREENS.CALCULATOR;

  AutoLock.stop();

}

// ------------------------------------------------------------

// 鑑賞モード ON

// ------------------------------------------------------------

export function enableViewMode() {

  AutoLock.stop();

}

// ------------------------------------------------------------

// 鑑賞モード OFF

// ------------------------------------------------------------

export function disableViewMode() {

  if (

    currentScreen !==

    SCREENS.CALCULATOR

  ) {

    AutoLock.start();

  }

}

// ------------------------------------------------------------

// 現在画面を取得

// ------------------------------------------------------------

export function getCurrentScreen() {

  return currentScreen;

}

// ------------------------------------------------------------

// ユーザー操作通知

// ------------------------------------------------------------

export function notifyActivity() {

  if (

    currentScreen !==

    SCREENS.CALCULATOR

  ) {

    AutoLock.reset();

  }

}

// ------------------------------------------------------------

// Router公開API

// ------------------------------------------------------------

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

  openPhoto,

  closePhoto,

  lockNow,

  enableViewMode,

  disableViewMode,

  getCurrentScreen,

  notifyActivity,

  Screen: SCREENS,

};

export default Router;