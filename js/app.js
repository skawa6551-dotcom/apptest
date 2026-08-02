// ============================================================
// app.js
// アプリ全体の司令塔。DOMの取得・イベント処理・画面描画は
// このファイルだけが行う。
// calculator.js / storage.js / settings.js / sound.js / auth.js /
// themes.js は中身を変更せず、公開APIだけを利用して接続する。
// ============================================================

import Calculator, { ACTIONS as CALC_ACTIONS } from './calculator.js';
import Storage, { STORAGE_KEYS } from './storage.js';
import Settings from './settings.js';
import Sound from './sound.js';
import Auth from './auth.js';
import { THEMES, getThemeById } from './themes.js';
import { registerDigit, resetSequence, close as closeSecretHomeState } from './secret-home.js';

// ------------------------------------------------------------
// 定数
// モジュールスコープのconstであり、windowに生えるグローバル変数ではない。
// ------------------------------------------------------------

/**
 * キーパッドの配置データ（見た目の並び順）。
 * HTMLには書かず、この定義から動的にボタンDOMを生成する。
 */
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

/** キーパッドの数字/演算子ボタン向けaria-label辞書 */
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

/** Calculator.input()にそのまま渡してよいdata-actionの集合（digitを除く） */
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

/**
 * 秘密コード（4桁入力バッファ）をリセットする対象のアクション。
 * AC・＝・＋・−・×・÷・％・小数点(.) の8つのみが対象で、
 * ±（NEGATE）は仕様上あえて対象外としている。
 */
const SECRET_CODE_RESET_ACTIONS = new Set([
  CALC_ACTIONS.CLEAR,
  CALC_ACTIONS.EQUALS,
  CALC_ACTIONS.ADD,
  CALC_ACTIONS.SUBTRACT,
  CALC_ACTIONS.MULTIPLY,
  CALC_ACTIONS.DIVIDE,
  CALC_ACTIONS.PERCENT,
  CALC_ACTIONS.DECIMAL,
]);

/** エラーコードごとの表示文言。calculator.jsのerrorCodeを参照するだけで、判定ロジックは持たない */
const ERROR_DISPLAY_TEXT = Object.freeze({
  'division-by-zero': 'エラー',
  overflow: 'エラー',
  'unknown-operator': 'エラー',
  unknown: 'エラー',
});
const DEFAULT_ERROR_TEXT = 'エラー';

/** この文字数を超えたら結果表示のフォントサイズを縮小するクラスを付与する */
const LONG_NUMBER_THRESHOLD = 10;

/** タップ時のpressedクラスを解除するまでの上限時間（ms） */
const PRESSED_CLASS_TIMEOUT = 150;

/** 設定シート内でTabトラップの対象とする要素のセレクタ */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ------------------------------------------------------------
// モジュール内の状態
// window等のグローバルオブジェクトには一切書き込まない。
// ------------------------------------------------------------

/** 生体認証に対応した端末かどうか（起動時に1度だけ判定してキャッシュする） */
let isBiometricSupported = false;

/** 設定画面を開く直前にフォーカスされていた要素（閉じたときに戻すため） */
let lastFocusedElement = null;

/**
 * キーパッドの各キー要素に紐づく「pressedクラス解除タイマー」のID。
 * DOM要素に直接プロパティを生やさず、WeakMapで外から管理する。
 * 要素がDOMから削除されればエントリも自動的にGC対象になる。
 * @type {WeakMap<Element, number>}
 */
const pressedTimeouts = new WeakMap();

// ------------------------------------------------------------
// ユーティリティ（表示整形・フィードバック）
// ------------------------------------------------------------

/**
 * 数値の生文字列（桁区切りなし）に3桁カンマ区切りを付与する。
 * 符号・小数点はそのまま保持する（入力途中の"12."のような状態も壊さない）。
 * @param {string} rawValue
 * @returns {string}
 */
function formatWithGrouping(rawValue) {
  if (typeof rawValue !== 'string') return String(rawValue);

  const isNegative = rawValue.startsWith('-');
  const unsigned = isNegative ? rawValue.slice(1) : rawValue;
  const [integerPart, decimalPart] = unsigned.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const grouped = decimalPart !== undefined ? `${groupedInteger}.${decimalPart}` : groupedInteger;

  return isNegative ? `-${grouped}` : grouped;
}

/**
 * テキスト中に含まれる数値トークン（履歴の式文字列など）すべてに桁区切りを適用する。
 * @param {string} text
 * @returns {string}
 */
function groupNumbersInText(text) {
  return text.replace(/-?\d+(\.\d+)?/g, (match) => formatWithGrouping(match));
}

/**
 * 設定を見てタップ音・成功音・エラー音のいずれかを鳴らす。
 * 「鳴らすかどうか」の判断はここに集約し、sound.js自体は判断を持たない設計を維持する。
 * @param {'tap'|'success'|'error'} kind
 */
function playFeedbackSound(kind) {
  if (!Settings.isSoundEnabled()) return;

  if (kind === 'success') {
    Sound.playSuccess();
  } else if (kind === 'error') {
    Sound.playError();
  } else {
    Sound.playTap();
  }
}

/**
 * 設定を見てバイブレーションを鳴らす。
 */
function playFeedbackVibration() {
  if (Settings.isVibrationEnabled()) Sound.vibrate();
}

/**
 * calculator.jsの公開APIである input(type, payload) を呼び出す薄いラッパー。
 * 呼び出し箇所をこの1つに集約することで、引数の渡し方（シグネチャ）が
 * 呼び出し元ごとにばらつくのを防ぐ。
 * @param {string} type - calculator.jsのACTIONSのいずれかの値
 * @param {string} [payload] - ACTIONS.DIGITのときのみ数字1文字
 * @returns {import('./calculator.js').DisplayState}
 */
function dispatchToCalculator(type, payload) {
  return Calculator.input(type, payload);
}

// ------------------------------------------------------------
// キーパッド／テーマ選択肢の生成（初期化時に1回だけ実行）
// ------------------------------------------------------------

/**
 * KEYPAD_LAYOUT定義からキーパッドのボタンDOMを構築し、#keypadへ挿入する。
 */
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

/**
 * 1つのキー定義からbutton要素を作る。
 * @param {{label:string, num?:string, action?:string, variant:string, wide?:boolean}} keyDef
 * @returns {HTMLButtonElement}
 */
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

/**
 * themes.jsのTHEMES定義からテーマ選択ボタンを構築し、#themeSwitchへ挿入する。
 * ラベル・並び順の変更はthemes.js側の修正だけで反映される。
 */
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

/**
 * 秘密ホーム画面のDOMを構築し、bodyへ追加する。
 * キーパッド・テーマ選択肢と同様、静的HTMLには書かずJSで生成する
 * （index.htmlへの追加を最小限にとどめるため）。
 * 初期状態はhidden属性で非表示にしておく。
 */
function buildSecretHome() {
  const overlay = document.createElement('div');
  overlay.id = 'secretHomeOverlay';
  overlay.className = 'secret-home-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Secret Home');

  const card = document.createElement('div');
  card.className = 'secret-home-card';

  const title = document.createElement('h2');
  title.className = 'secret-home-title';
  title.textContent = 'Secret Home';

  const message = document.createElement('p');
  message.className = 'secret-home-message';
  message.textContent = 'Welcome';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'secret-home-back-btn';
  backButton.dataset.action = 'close-secret-home';
  backButton.textContent = '戻る';

  card.append(title, message, backButton);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// ------------------------------------------------------------
// 描画関数
// render()以外からこれらの個別関数を直接呼ばない（画面の一貫性を保つため）。
// ------------------------------------------------------------

/**
 * 計算結果表示エリアを更新する。
 * calculator.jsのisError/errorCodeをそのまま参照するだけで、
 * ここでエラーかどうかを判定するロジックは書かない。
 */
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

/**
 * 履歴リストを再構築する。履歴データはCalculator.getHistory()からのみ取得し、
 * app.js側で独自に履歴を保持することはしない（単一の情報源を守る）。
 */
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

/**
 * <meta name="theme-color">をテーマの背景色に合わせて更新する。
 * CSS変数の切り替え（見た目）とは別物で、Safariのステータスバー等
 * ブラウザUI自体の色を変えるためのJS側の役割。
 * @param {string} themeId
 */
function updateMetaThemeColor(themeId) {
  const theme = getThemeById(themeId);
  if (!theme) return;

  const metaEl = document.querySelector('meta[name="theme-color"]');
  if (metaEl) {
    metaEl.setAttribute('content', theme.colorTokens.background);
  }
}

/**
 * 現在のテーマをdocument.documentElementのdata-theme属性へ反映し、
 * テーマ選択ボタンの選択状態・ブラウザのtheme-colorを更新する。
 * CSS変数の実体（色の定義）を書き換えるのはCSS側の責務なので行わない。
 */
function renderTheme() {
  const theme = Settings.getTheme();
  document.documentElement.dataset.theme = theme;
  updateMetaThemeColor(theme);

  const themeSwitchEl = document.getElementById('themeSwitch');
  Array.from(themeSwitchEl.children).forEach((button) => {
    const isActive = button.dataset.themeId === theme;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-checked', String(isActive));
  });
}

/**
 * 設定画面のトグル・バージョン表示・生体認証項目の表示可否を更新する。
 */
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

/**
 * 画面全体を最新の状態に合わせて再描画する。
 * 個別のrenderXxx関数を呼べるのはこの関数だけ、というルールを守る。
 */
function render() {
  renderDisplay();
  renderHistory();
  renderTheme();
  renderSettings();
}

// ------------------------------------------------------------
// 設定画面の開閉
// ------------------------------------------------------------

/**
 * 設定画面を開く。開く直前のフォーカス位置を記憶し、閉じるボタンへフォーカスを移す。
 */
function openSettings() {
  lastFocusedElement = document.activeElement;

  const overlay = document.getElementById('settingsOverlay');
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');

  document.getElementById('settingsCloseBtn').focus();
}

/**
 * 設定画面を閉じ、開く前にフォーカスされていた要素へフォーカスを戻す。
 */
function closeSettings() {
  const overlay = document.getElementById('settingsOverlay');
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

// ------------------------------------------------------------
// 生体認証ロック画面の表示制御
// ------------------------------------------------------------

/**
 * 生体認証ロック画面を表示する。
 */
function showLockOverlay() {
  const lockOverlay = document.getElementById('lockOverlay');
  lockOverlay.classList.add('is-open');
  lockOverlay.setAttribute('aria-hidden', 'false');
}

/**
 * 生体認証ロック画面を非表示にする。
 */
function hideLockOverlay() {
  const lockOverlay = document.getElementById('lockOverlay');
  lockOverlay.classList.remove('is-open');
  lockOverlay.setAttribute('aria-hidden', 'true');
}

// ------------------------------------------------------------
// 秘密ホーム画面の表示制御
// ------------------------------------------------------------

/**
 * 秘密ホーム画面を表示する。
 * 電卓画面自体は裏側にそのまま残っているため、閉じればそのままの状態
 * （入力中の数値・履歴等）に戻れる。
 */
function showSecretHome() {
  const overlay = document.getElementById('secretHomeOverlay');
  overlay.hidden = false;
}

/**
 * 秘密ホーム画面を閉じ、通常の電卓表示へ戻す。
 * secret-home.js側の内部状態（開閉フラグ・入力バッファ）もあわせてリセットする。
 */
function hideSecretHome() {
  const overlay = document.getElementById('secretHomeOverlay');
  overlay.hidden = true;
  closeSecretHomeState();
}

// ------------------------------------------------------------
// 履歴削除（ヘッダーショートカット／設定画面の両方から呼ばれる）
// ------------------------------------------------------------

/**
 * 履歴をすべて削除する。
 * Calculator.clearHistory()の内部でStorage.remove(HISTORY)が呼ばれ、
 * それがStorage.subscribe(HISTORY)経由でrender()を自動的に呼び戻すため、
 * ここで明示的にrender()を呼ぶ必要はない。
 */
function handleClearHistory() {
  try {
    Calculator.clearHistory();
  } catch (error) {
    console.error('[app.js] 履歴の削除に失敗しました', error);
  }
}

/**
 * 履歴パネルの開閉を切り替える。設定/ロック画面と同様、
 * これは一時的な表示状態のためrender()を経由せず直接DOMを操作する。
 */
function toggleHistoryPanel() {
  const panel = document.getElementById('historyPanel');
  const button = document.getElementById('historyToggleBtn');
  const isExpanded = panel.classList.toggle('is-expanded');
  button.setAttribute('aria-expanded', String(isExpanded));
  button.setAttribute('aria-label', isExpanded ? '履歴を隠す' : '履歴を表示');
}

// ------------------------------------------------------------
// テーマ変更
// ------------------------------------------------------------

/**
 * テーマ選択ボタンの処理。
 * Settings.setTheme()がStorageへ保存し、subscribe経由でrender()が呼ばれる。
 * @param {HTMLElement} target
 */
function handleSelectTheme(target) {
  const { themeId } = target.dataset;
  if (!themeId) return;

  try {
    Settings.setTheme(themeId);
  } catch (error) {
    console.error('[app.js] テーマの変更に失敗しました', error);
  }
}

// ------------------------------------------------------------
// 生体認証の再試行
// ------------------------------------------------------------

/**
 * ロック画面の「再試行」ボタンの処理。登録済みのPasskeyで認証し直す。
 */
async function handleRetryAuth() {
  try {
    const success = await Auth.authenticate();
    if (success) hideLockOverlay();
  } catch (error) {
    console.error('[app.js] 再認証中にエラーが発生しました', error);
  }
}

// ------------------------------------------------------------
// data-actionディスパッチテーブル（電卓系アクションはCALCULATOR_ACTIONSで別処理）
// ------------------------------------------------------------

const ACTION_HANDLERS = Object.freeze({
  'open-settings': openSettings,
  'close-settings': closeSettings,
  'clear-history': handleClearHistory,
  'select-theme': handleSelectTheme,
  'retry-auth': handleRetryAuth,
  'toggle-history': toggleHistoryPanel,
  'close-secret-home': hideSecretHome,
});

// ------------------------------------------------------------
// キーパッド／電卓アクションの処理（Calculator.input()との接続点）
// ------------------------------------------------------------

/**
 * 数字キー入力を処理する。数字入力はStorageを一切更新しないため、
 * Storage.subscribe経由の再描画は発生しない＝必ずここでrender()する。
 * @param {string} digit
 */
function handleDigitInput(digit) {
  try {
    dispatchToCalculator(CALC_ACTIONS.DIGIT, digit);
    const displayState = Calculator.getDisplayState();
    playFeedbackSound(displayState.isError ? 'error' : 'tap');
    playFeedbackVibration();

    // 電卓としての処理とは独立して、秘密コード（"0209"の連続入力）を監視する。
    // 一致した場合のみ秘密ホームを表示する（電卓自体の動作には影響しない）。
    if (registerDigit(digit)) {
      showSecretHome();
    }
  } catch (error) {
    console.error('[app.js] 数字入力の処理に失敗しました', error);
  } finally {
    render();
  }
}

/**
 * 数字以外の電卓アクション（AC/±/%/演算子/./=）を処理する。
 * "="が成功して履歴が更新された場合だけは、calculator.js内部で
 * Storage.set(HISTORY)が呼ばれ、それがStorage.subscribe経由でrender()を
 * 呼び戻すため、ここでの手動render()は行わない（二重描画の防止）。
 * それ以外のケース（エラー・履歴を伴わない操作）は自分でrender()する。
 * @param {string} action
 */
function handleCalculatorAction(action) {
  // 秘密コードの4桁バッファは、AC/＝/＋/−/×/÷/％/. の8つのアクションでのみ
  // リセットする（±は仕様上あえて対象外）。実際の計算処理より先に行う。
  if (SECRET_CODE_RESET_ACTIONS.has(action)) {
    resetSequence();
  }

  try {
    dispatchToCalculator(action);
    const displayState = Calculator.getDisplayState();

    let feedbackKind = 'tap';
    if (displayState.isError) {
      feedbackKind = 'error';
    } else if (action === CALC_ACTIONS.EQUALS) {
      feedbackKind = 'success';
    }
    playFeedbackSound(feedbackKind);
    playFeedbackVibration();

    const willRerenderViaHistorySubscription = action === CALC_ACTIONS.EQUALS && !displayState.isError;
    if (!willRerenderViaHistorySubscription) {
      render();
    }
  } catch (error) {
    console.error('[app.js] 電卓操作の処理に失敗しました', error);
    render();
  }
}

// ------------------------------------------------------------
// イベントは1か所（document）への委譲リスナーに集約する
// ------------------------------------------------------------

/**
 * document全体のclickを1つのリスナーで受け止め、data-action/data-numを持つ
 * 最も近い要素を特定して適切な処理へ振り分ける（イベント委譲）。
 * @param {MouseEvent} event
 */
function handleDocumentClick(event) {
  // event.targetはテキストノード等Element以外になり得ないはずだが、
  // closest()はElementにしか存在しないため、型を確認してから呼ぶ。
  if (!(event.target instanceof Element)) return;

  const target = event.target.closest('[data-action], [data-num]');
  if (!target) return;

  const { action, num } = target.dataset;

  if (num !== undefined) {
    handleDigitInput(num);
    return;
  }

  if (CALCULATOR_ACTIONS.has(action)) {
    handleCalculatorAction(action);
    return;
  }

  const handler = ACTION_HANDLERS[action];
  if (handler) {
    playFeedbackSound('tap');
    playFeedbackVibration();
    handler(target, event);
  }
}

/**
 * 設定画面内のトグル（チェックボックス）変更を1つのリスナーで受け止める。
 * @param {Event} event
 */
function handleSettingsChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;

  if (target.id === 'soundToggle') {
    Settings.setSoundEnabled(target.checked);
  } else if (target.id === 'vibrationToggle') {
    Settings.setVibrationEnabled(target.checked);
  } else if (target.id === 'biometricToggle') {
    handleBiometricToggle(target.checked);
  }
}

/**
 * 生体認証トグルの変更を処理する。
 * ONにする瞬間はauth.jsのregister()（Passkeyの新規登録）を呼び、
 * 実際に生体認証を突破できた場合のみSettingsへ保存する。
 * @param {boolean} enabled
 */
async function handleBiometricToggle(enabled) {
  if (!enabled) {
    Settings.setBiometricEnabled(false);
    Auth.lock();
    return;
  }

  try {
    const success = await Auth.register();
    if (success) {
      Settings.setBiometricEnabled(true);
      return;
    }
  } catch (error) {
    console.error('[app.js] 生体認証の登録に失敗しました', error);
  }

  // 登録に失敗・キャンセルされた場合は設定を保存せず、
  // 次のrender()でトグルの見た目を実際の設定値（false）に戻す。
  render();
}

/**
 * キーボード操作を処理する。
 * ロック画面が開いている間はEscapeでの解除を許可しない（認証回避防止）。
 * その場合はTabによるフォーカスもロック画面内に閉じ込める。
 * ロック画面が閉じているときだけ、設定画面のEsc/Tab処理を行う。
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
  const lockOverlay = document.getElementById('lockOverlay');
  const isLockOpen = lockOverlay.classList.contains('is-open');

  if (isLockOpen) {
    if (event.key === 'Tab') {
      trapFocus(event, lockOverlay);
    }
    // Escapeを含め、それ以外のキー操作ではロック画面を閉じない。
    return;
  }

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

/**
 * container内の最初/最後のフォーカス可能要素の外へTabで抜けないようにする。
 * @param {KeyboardEvent} event
 * @param {HTMLElement} container
 */
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

/**
 * target要素に紐づく解除タイマーがあれば止めて、WeakMapから取り除く。
 * @param {Element} target
 */
function clearPressedTimeout(target) {
  const timeoutId = pressedTimeouts.get(target);
  if (timeoutId !== undefined) {
    window.clearTimeout(timeoutId);
    pressedTimeouts.delete(target);
  }
}

/**
 * キーパッド上のポインター押下でpressedクラスを付与する（視覚フィードバックのみ）。
 * 150ms以内に必ず解除されるよう、要素ごとのタイマーIDをWeakMapで管理する
 * （DOM要素へ直接プロパティを生やさない）。
 * @param {PointerEvent} event
 */
function handleKeypadPointerDown(event) {
  if (!(event.target instanceof Element)) return;

  const target = event.target.closest('.key');
  if (!target) return;

  clearPressedTimeout(target);
  target.classList.add('pressed');

  const timeoutId = window.setTimeout(() => {
    target.classList.remove('pressed');
    pressedTimeouts.delete(target);
  }, PRESSED_CLASS_TIMEOUT);
  pressedTimeouts.set(target, timeoutId);
}

/**
 * キーパッド上のポインター解放でpressedクラスを即座に解除する。
 * @param {PointerEvent} event
 */
function handleKeypadPointerUp(event) {
  if (!(event.target instanceof Element)) return;

  const target = event.target.closest('.key');
  if (!target) return;

  clearPressedTimeout(target);
  target.classList.remove('pressed');
}

/**
 * 必要最小限のイベントリスナーをここに集約して登録する。
 * ボタン単位でのaddEventListenerは行わない（すべて委譲で処理する）。
 */
function registerEventListeners() {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeyDown);

  document.querySelector('.settings-body').addEventListener('change', handleSettingsChange);

  const keypadEl = document.getElementById('keypad');
  keypadEl.addEventListener('pointerdown', handleKeypadPointerDown);
  keypadEl.addEventListener('pointerup', handleKeypadPointerUp);
  keypadEl.addEventListener('pointercancel', handleKeypadPointerUp);
}

// ------------------------------------------------------------
// storage.jsの変更通知に対する購読
// ------------------------------------------------------------

/**
 * テーマ・履歴・各設定値の変化をStorage.subscribe()経由で監視し、
 * 変化のたびにrender()を呼ぶ（他タブでの変更もこの経路で自動反映される）。
 */
function subscribeToStorageChanges() {
  Storage.subscribe(STORAGE_KEYS.THEME, render);
  Storage.subscribe(STORAGE_KEYS.HISTORY, render);
  Storage.subscribe(STORAGE_KEYS.SOUND_ENABLED, render);
  Storage.subscribe(STORAGE_KEYS.VIBRATION_ENABLED, render);
  Storage.subscribe(STORAGE_KEYS.BIOMETRIC_ENABLED, render);
}

// ------------------------------------------------------------
// Service Worker登録
// ------------------------------------------------------------

/**
 * Service Workerを登録する（対応環境のみ）。
 * GitHub Pagesはプロジェクトによってサブパス配下
 * （例: https://user.github.io/repo-name/）で配信されるため、
 * 文字列の相対パスではなく document.baseURI を基準にした絶対URLを
 * 組み立てることで、どのサブパスで公開されても確実に解決できるようにする。
 * scopeも明示し、ページの主要リソース読み込みを妨げないよう
 * loadイベント後に登録する。
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const swUrl = new URL('service-worker.js', document.baseURI);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn('[app.js] Service Workerの登録に失敗しました', error);
    });
  });
}

// ------------------------------------------------------------
// 終了処理（タブが隠れる／閉じられるタイミングで音声リソースを解放する）
// ------------------------------------------------------------

/**
 * タブがバックグラウンドに回ったとき、再生中の音を止める。
 */
function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    Sound.stopAll();
  }
}

/**
 * ページが実際に破棄される（他ページへ遷移・タブを閉じる等）タイミングで、
 * 再生中の音を止めたうえでAudioContextそのものも解放する。
 */
function handlePageHide() {
  Sound.stopAll();
  Sound.destroy().catch((error) => {
    console.warn('[app.js] Sound.destroy()に失敗しました', error);
  });
}

/**
 * ページ離脱直前の最終防衛ライン。beforeunloadは非同期処理が保証されないため、
 * ここでは同期的に止められるstopAll()のみ呼ぶ（destroy()はpagehideに任せる）。
 */
function handleBeforeUnload() {
  Sound.stopAll();
}

/**
 * 終了処理系のイベントリスナーをまとめて登録する。
 */
function registerTeardownHandlers() {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('beforeunload', handleBeforeUnload);
}

// ------------------------------------------------------------
// 初期化
// ------------------------------------------------------------

/**
 * 生体認証が有効な場合のロック解除フローを行う。
 * 対応端末でない場合、または設定でOFFの場合は何もしない。
 * @returns {Promise<void>}
 */
async function runBiometricLockFlow() {
  if (!isBiometricSupported || !Settings.isBiometricEnabled()) return;

  showLockOverlay();

  try {
    const success = await Auth.authenticate();
    if (success) hideLockOverlay();
    // 失敗時はロック画面を表示したままにし、「再試行」ボタンで
    // handleRetryAuth()を呼び直せるようにする。
  } catch (error) {
    console.error('[app.js] 起動時の生体認証に失敗しました', error);
  }
}

/**
 * アプリの初期化処理。DOMContentLoaded後に一度だけ呼ばれる。
 * build → event → subscribe → render → biometric の順に実行する。
 */
async function init() {
  try {
    // 生体認証の対応判定は後続のrender()（biometricRowの表示切替）で
    // 必要になるため、build前に確定させておく。
    isBiometricSupported = await Auth.isSupported();

    // 1. build: DOM生成（キーパッド・テーマ選択肢・秘密ホーム）
    buildKeypad();
    buildThemeOptions();
    buildSecretHome();

    // 2. event: イベント登録（ユーザー操作を受け付けられる状態にする）
    registerEventListeners();
    registerTeardownHandlers();

    // 3. subscribe: Storageの変更通知を購読
    subscribeToStorageChanges();

    // 4. render: 現在の状態を初回描画
    render();

    // 5. biometric: 必要であれば起動時のロック解除フローを実行
    await runBiometricLockFlow();

    registerServiceWorker();
  } catch (error) {
    console.error('[app.js] 初期化中にエラーが発生しました', error);
    render();
  }
}

document.addEventListener('DOMContentLoaded', init);