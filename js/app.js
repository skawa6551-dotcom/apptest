// ============================================================
// app.js
// アプリ全体の司令塔。DOMの取得・イベント処理・画面描画は
// このファイルだけが行う。calculator.js / storage.js / settings.js /
// sound.js / auth.js はDOMに一切触れない前提で呼び出す。
// ============================================================

import Calculator, { ACTIONS as CALC_ACTIONS } from './calculator.js';
import Storage, { STORAGE_KEYS } from './storage.js';
import Settings from './settings.js';
import Sound from './sound.js';
import Auth from './auth.js';
import { THEMES } from './themes.js';

const KEYPAD_LAYOUT = [
  [
    { label: 'AC', action: CALC_ACTIONS.CLEAR, variant: 'func' },
    { label: '±', action: CALC_ACTIONS.NEGATE, variant: 'func' },
    { label: '%', action: CALC_ACTIONS.PERCENT, variant: 'func' },
    { label: '÷', action: CALC_ACTIONS.DIVIDE, variant: 'operator' },
  ],
  [
    { label: '7', num: '7', variant: 'num' },
    { label: '8', num: '8', variant: 'num' },
    { label: '9', num: '9', variant: 'num' },
    { label: '×', action: CALC_ACTIONS.MULTIPLY, variant: 'operator' },
  ],
  [
    { label: '4', num: '4', variant: 'num' },
    { label: '5', num: '5', variant: 'num' },
    { label: '6', num: '6', variant: 'num' },
    { label: '−', action: CALC_ACTIONS.SUBTRACT, variant: 'operator' },
  ],
  [
    { label: '1', num: '1', variant: 'num' },
    { label: '2', num: '2', variant: 'num' },
    { label: '3', num: '3', variant: 'num' },
    { label: '＋', action: CALC_ACTIONS.ADD, variant: 'operator' },
  ],
  [
    { label: '0', num: '0', variant: 'num', wide: true },
    { label: '.', action: CALC_ACTIONS.DECIMAL, variant: 'num' },
    { label: '=', action: CALC_ACTIONS.EQUALS, variant: 'equal' },
  ],
];

const KEY_ARIA_LABELS = Object.freeze({
  [CALC_ACTIONS.CLEAR]: 'オールクリア',
  [CALC_ACTIONS.NEGATE]: 'プラスマイナス切り替え',
  [CALC_ACTIONS.PERCENT]: 'パーセント',
  [CALC_ACTIONS.DIVIDE]: '割る',
  [CALC_ACTIONS.MULTIPLY]: '掛ける',
  [CALC_ACTIONS.SUBTRACT]: '引く',
  [CALC_ACTIONS.ADD]: '足す',
  [CALC_ACTIONS.DECIMAL]: '小数点',
  [CALC_ACTIONS.EQUALS]: '計算実行',
});

const CALCULATOR_ACTIONS = new Set([
  CALC_ACTIONS.CLEAR,
  CALC_ACTIONS.NEGATE,
  CALC_ACTIONS.PERCENT,
  CALC_ACTIONS.ADD,
  CALC_ACTIONS.SUBTRACT,
  CALC_ACTIONS.MULTIPLY,
  CALC_ACTIONS.DIVIDE,
  CALC_ACTIONS.DECIMAL,
  CALC_ACTIONS.EQUALS,
]);

const ERROR_DISPLAY_TEXT = Object.freeze({
  'division-by-zero': 'エラー',
  overflow: 'エラー',
  'unknown-operator': 'エラー',
  unknown: 'エラー',
});
const DEFAULT_ERROR_TEXT = 'エラー';

const LONG_NUMBER_THRESHOLD = 10;

const PRESSED_CLASS_TIMEOUT = 150;

const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

let isBiometricSupported = false;

let lastFocusedElement = null;

function formatWithGrouping(rawValue) {
  if (typeof rawValue !== 'string') return String(rawValue);

  const isNegative = rawValue.startsWith('-');
  const unsigned = isNegative ? rawValue.slice(1) : rawValue;
  const [integerPart, decimalPart] = unsigned.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const grouped = decimalPart !== undefined ? `${groupedInteger}.${decimalPart}` : groupedInteger;

  return isNegative ? `-${grouped}` : grouped;
}

function groupNumbersInText(text) {
  return text.replace(/-?\d+(\.\d+)?/g, (match) => formatWithGrouping(match));
}

function buildKeypad() {
  const keypadEl = document.getElementById('keypad');
  const fragment = document.createDocumentFragment();

  KEYPAD_LAYOUT.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'keypad-row';
    row.forEach((keyDef) => rowEl.appendChild(createKeyButton(keyDef)));
    fragment.appendChild(rowEl);
  });

  keypadEl.appendChild(fragment);
}

function createKeyButton(keyDef) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `key key-${keyDef.variant}${keyDef.wide ? ' key-zero' : ''}`;
  button.textContent = keyDef.label;

  if (keyDef.num !== undefined) {
    button.dataset.num = keyDef.num;
    button.setAttribute('aria-label', `数字 ${keyDef.num}`);
  } else {
    button.dataset.action = keyDef.action;
    button.setAttribute('aria-label', KEY_ARIA_LABELS[keyDef.action] ?? keyDef.label);
  }

  return button;
}

function buildThemeOptions() {
  const themeSwitchEl = document.getElementById('themeSwitch');
  const fragment = document.createDocumentFragment();

  THEMES.forEach((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-option';
    button.textContent = theme.label;
    button.dataset.action = 'select-theme';
    button.dataset.themeId = theme.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    fragment.appendChild(button);
  });

  themeSwitchEl.appendChild(fragment);
}

function renderDisplay() {
  const displayState = Calculator.getDisplayState();
  const expressionEl = document.getElementById('expressionDisplay');
  const resultEl = document.getElementById('resultDisplay');

  expressionEl.textContent = displayState.expression;

  if (displayState.isError) {
    resultEl.textContent = ERROR_DISPLAY_TEXT[displayState.errorCode] ?? DEFAULT_ERROR_TEXT;
    resultEl.classList.add('is-error');
    resultEl.classList.remove('result-display--long');
    return;
  }

  const formatted = formatWithGrouping(displayState.result);
  resultEl.textContent = formatted;
  resultEl.classList.remove('is-error');
  resultEl.classList.toggle('result-display--long', formatted.length > LONG_NUMBER_THRESHOLD);
}

function renderHistory() {
  const historyListEl = document.getElementById('historyList');
  const entries = Calculator.getHistory();
  const fragment = document.createDocumentFragment();

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.textContent = groupNumbersInText(`${entry.expression} = ${entry.result}`);
    fragment.appendChild(li);
  });

  historyListEl.replaceChildren(fragment);
}

function renderTheme() {
  const theme = Settings.getTheme();
  document.documentElement.dataset.theme = theme;

  const themeSwitchEl = document.getElementById('themeSwitch');
  Array.from(themeSwitchEl.children).forEach((button) => {
    const isActive = button.dataset.themeId === theme;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-checked', String(isActive));
  });
}

function renderSettings() {
  document.getElementById('soundToggle').checked = Settings.isSoundEnabled();
  document.getElementById('vibrationToggle').checked = Settings.isVibrationEnabled();

  const biometricRow = document.getElementById('biometricRow');
  biometricRow.hidden = !isBiometricSupported;
  if (isBiometricSupported) {
    document.getElementById('biometricToggle').checked = Settings.isBiometricEnabled();
  }

  document.getElementById('versionLabel').textContent = `Version ${Settings.getVersion()}`;
}

function render() {
  renderDisplay();
  renderHistory();
  renderTheme();
  renderSettings();
}

function playFeedback() {
  if (Settings.isSoundEnabled()) Sound.playTap();
  if (Settings.isVibrationEnabled()) Sound.vibrate();
}

function openSettings() {
  lastFocusedElement = document.activeElement;

  const overlay = document.getElementById('settingsOverlay');
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');

  document.getElementById('settingsCloseBtn').focus();
}

function closeSettings() {
  const overlay = document.getElementById('settingsOverlay');
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

function showLockOverlay() {
  const lockOverlay = document.getElementById('lockOverlay');
  lockOverlay.classList.add('is-open');
  lockOverlay.setAttribute('aria-hidden', 'false');
}

function hideLockOverlay() {
  const lockOverlay = document.getElementById('lockOverlay');
  lockOverlay.classList.remove('is-open');
  lockOverlay.setAttribute('aria-hidden', 'true');
}

function handleClearHistory() {
  Calculator.clearHistory();
}

function handleSelectTheme(target) {
  const { themeId } = target.dataset;
  if (themeId) Settings.setTheme(themeId);
}

async function handleRetryAuth() {
  const success = await Auth.authenticate();
  if (success) hideLockOverlay();
}

const ACTION_HANDLERS = Object.freeze({
  'open-settings': openSettings,
  'close-settings': closeSettings,
  'clear-history': handleClearHistory,
  'select-theme': handleSelectTheme,
  'retry-auth': handleRetryAuth,
});

function handleDocumentClick(event) {
  const target = event.target.closest('[data-action], [data-num]');
  if (!target) return;

  const { action, num } = target.dataset;

  if (num !== undefined) {
    playFeedback();
    Calculator.input(CALC_ACTIONS.DIGIT, num);
    render();
    return;
  }

  if (CALCULATOR_ACTIONS.has(action)) {
    playFeedback();
    Calculator.input(action);
    render();
    return;
  }

  const handler = ACTION_HANDLERS[action];
  if (handler) {
    playFeedback();
    handler(target, event);
  }
}

function handleSettingsChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;

  if (target.id === 'soundToggle') Settings.setSoundEnabled(target.checked);
  else if (target.id === 'vibrationToggle') Settings.setVibrationEnabled(target.checked);
  else if (target.id === 'biometricToggle') handleBiometricToggle(target.checked);
}

async function handleBiometricToggle(enabled) {
  if (!enabled) {
    Settings.setBiometricEnabled(false);
    Auth.lock();
    return;
  }

  const success = await Auth.register();
  if (success) {
    Settings.setBiometricEnabled(true);
    return;
  }

  render();
}

function handleKeyDown(event) {
  const overlay = document.getElementById('settingsOverlay');
  if (!overlay.classList.contains('is-open')) return;

  if (event.key === 'Escape') {
    closeSettings();
    return;
  }

  if (event.key === 'Tab') {
    trapFocus(event, overlay);
  }
}

function trapFocus(event, container) {
  const focusable = container.querySelectorAll(FOCUSABLE_SELECTOR);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleKeypadPointerDown(event) {
  const target = event.target.closest('.key');
  if (!target) return;

  window.clearTimeout(target._pressedTimeoutId);
  target.classList.add('pressed');
  target._pressedTimeoutId = window.setTimeout(() => {
    target.classList.remove('pressed');
  }, PRESSED_CLASS_TIMEOUT);
}

function handleKeypadPointerUp(event) {
  const target = event.target.closest('.key');
  if (!target) return;

  window.clearTimeout(target._pressedTimeoutId);
  target.classList.remove('pressed');
}

function registerEventListeners() {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeyDown);

  document.querySelector('.settings-body').addEventListener('change', handleSettingsChange);

  const keypadEl = document.getElementById('keypad');
  keypadEl.addEventListener('pointerdown', handleKeypadPointerDown);
  keypadEl.addEventListener('pointerup', handleKeypadPointerUp);
}

function subscribeToStorageChanges() {
  Storage.subscribe(STORAGE_KEYS.THEME, render);
  Storage.subscribe(STORAGE_KEYS.HISTORY, render);
  Storage.subscribe(STORAGE_KEYS.SOUND_ENABLED, render);
  Storage.subscribe(STORAGE_KEYS.VIBRATION_ENABLED, render);
  Storage.subscribe(STORAGE_KEYS.BIOMETRIC_ENABLED, render);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.warn('[app.js] Service Workerの登録に失敗しました', error);
  });
}

async function init() {
  isBiometricSupported = await Auth.isSupported();

  buildKeypad();
  buildThemeOptions();
  registerEventListeners();
  subscribeToStorageChanges();

  if (isBiometricSupported && Settings.isBiometricEnabled()) {
    showLockOverlay();
    const success = await Auth.authenticate();
    if (success) hideLockOverlay();
  }

  registerServiceWorker();
  render();
}

document.addEventListener('DOMContentLoaded', init);
