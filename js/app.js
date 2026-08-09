// ============================================================
// app.js
// アプリ全体の司令塔。DOMの取得・イベント処理・画面描画は
// このファイルだけが行う。
// calculator.js / storage.js / settings.js / sound.js / auth.js /
// themes.js は中身を変更せず、公開APIだけを利用して接続する。
// ============================================================

import Calculator, { ACTIONS as CALC_ACTIONS } from './calculator.js';
import Storage, { STORAGE_KEYS } from './storage.js';
import Settings, {
  AUTO_LOCK_DURATION_PRESETS,
  CONVERSATION_ORGANIZE_DURATION_PRESETS,
} from './settings.js';
import Sound from './sound.js';
import Auth from './auth.js';
import { THEMES, getThemeById } from './themes.js';
import Router from './router.js';
import Passcode from './passcode.js';
import Workspace from './workspace.js';
import Records from './records.js';
import Calendar from './calendar.js';
import Archive from './archive.js';
import Pairing from './pairing.js';
import Messages from './messages.js';
import Firebase from './firebase.js';
import Customization from './customization.js';
import Notifications from './notifications.js';

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
 * パスコード（入力バッファ）をリセットする対象のアクション。
 * AC・＝・＋・−・×・÷・％・小数点(.) の8つのみが対象で、
 * ±（NEGATE）は仕様上あえて対象外としている。
 */
const PASSCODE_RESET_ACTIONS = new Set([
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

/** パスコード判定用の入力バッファ。桁数がパスコードと一致したときだけ判定する。 */
let passcodeBuffer = '';

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
 * {label, valueMs}の配列から<select>の選択肢を組み立てる、汎用のヘルパー。
 * 自動ロック時間・会話整理時間の両方のプリセット生成で使う。
 * @param {HTMLSelectElement} selectEl
 * @param {{label: string, valueMs: number}[]} presets
 */
function populateDurationSelect(selectEl, presets) {
  const fragment = document.createDocumentFragment();

  presets.forEach((preset) => {
    const option = document.createElement('option');
    option.value = String(preset.valueMs);
    option.textContent = preset.label;
    fragment.appendChild(option);
  });

  selectEl.appendChild(fragment);
}

/**
 * settings.jsのプリセット定義から、自動ロック時間・会話整理時間の
 * セレクトボックスの選択肢を構築する。実際に選択されている値の反映は
 * renderSettings()側で行う。
 */
function buildDurationSelectOptions() {
  populateDurationSelect(
    document.getElementById('autoLockDurationSelect'),
    AUTO_LOCK_DURATION_PRESETS,
  );
  populateDurationSelect(
    document.getElementById('organizeDurationSelect'),
    CONVERSATION_ORGANIZE_DURATION_PRESETS,
  );
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

  // ---- セキュリティ ----
  document.getElementById('autoLockDurationSelect').value = String(Settings.getAutoLockDurationMs());
  document.getElementById('archiveLockToggle').checked = Settings.isArchiveLockEnabled();

  // ---- 通知（Phase1.8より実配信対応） ----
  document.getElementById('notificationsToggle').checked = Settings.isNotificationsEnabled();
  document.getElementById('notificationContentToggle').checked = Settings.isNotificationContentEnabled();
  document.getElementById('notificationSoundToggle').checked = Settings.isNotificationSoundEnabled();
  document.getElementById('notificationVibrationToggle').checked = Settings.isNotificationVibrationEnabled();
  renderNotificationStatus();

  // ---- チャット設定 ----
  document.getElementById('readReceiptsToggle').checked = Settings.isReadReceiptsEnabled();
  document.getElementById('onlineVisibilityToggle').checked = Settings.isOnlineVisibilityEnabled();
  document.getElementById('organizeModeSelect').value = Settings.getConversationOrganizeMode();
  document.getElementById('organizeDurationSelect').value = String(Settings.getConversationOrganizeDurationMs());

  // ---- データ管理 ----
  renderStorageUsage();

  // ---- Workspaceカスタマイズ（Firestore共有） ----
  renderWorkspaceTitleInput();
  renderCardCustomizationList();
  renderBackgroundCustomizationList();

  document.getElementById('versionLabel').textContent = `Version ${Settings.getVersion()}`;
}

/** Workspaceタイトル入力欄に、現在保存されているカスタムタイトルを反映する（未設定なら空欄のまま）。 */
function renderWorkspaceTitleInput() {
  const input = document.getElementById('workspaceTitleInput');
  if (!input) return;
  input.value = Customization.getCached().workspaceTitle ?? '';
}

/**
 * カード編集リストを、現在の並び順・表示名・アイコンで作り直す。
 * settings.js側の値ではなくCustomization.getEffectiveCards()
 * （customization.jsとworkspace.jsが共有する唯一の定義元）を使うため、
 * ここでカードの定義を重複して持たない。
 */
function renderCardCustomizationList() {
  const list = document.getElementById('cardCustomizationList');
  if (!list) return;

  const cards = Customization.getEffectiveCards();
  const fragment = document.createDocumentFragment();

  cards.forEach((card, index) => {
    const row = document.createElement('div');
    row.className = 'card-edit-row';

    const iconInput = document.createElement('input');
    iconInput.type = 'text';
    iconInput.className = 'card-icon-input';
    iconInput.dataset.cardKey = card.key;
    iconInput.maxLength = 4;
    iconInput.value = card.icon;
    iconInput.setAttribute('aria-label', `${card.label}のアイコン`);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'card-label-input';
    labelInput.dataset.cardKey = card.key;
    labelInput.maxLength = 12;
    labelInput.value = card.label;
    labelInput.setAttribute('aria-label', `${card.label}の表示名`);

    const moveUpButton = document.createElement('button');
    moveUpButton.type = 'button';
    moveUpButton.className = 'card-move-btn';
    moveUpButton.dataset.action = 'move-card-up';
    moveUpButton.dataset.cardKey = card.key;
    moveUpButton.disabled = index === 0;
    moveUpButton.setAttribute('aria-label', `${card.label}を上へ`);
    moveUpButton.textContent = '▲';

    const moveDownButton = document.createElement('button');
    moveDownButton.type = 'button';
    moveDownButton.className = 'card-move-btn';
    moveDownButton.dataset.action = 'move-card-down';
    moveDownButton.dataset.cardKey = card.key;
    moveDownButton.disabled = index === cards.length - 1;
    moveDownButton.setAttribute('aria-label', `${card.label}を下へ`);
    moveDownButton.textContent = '▼';

    row.appendChild(iconInput);
    row.appendChild(labelInput);
    row.appendChild(moveUpButton);
    row.appendChild(moveDownButton);
    fragment.appendChild(row);
  });

  list.replaceChildren(fragment);
}

/**
 * 背景プリセットの選択欄（6画面ぶん）を作り直す。
 * 対象画面はCustomization.CUSTOMIZABLE_SCREENS（電卓は含まれない）。
 */
function renderBackgroundCustomizationList() {
  const list = document.getElementById('backgroundCustomizationList');
  if (!list) return;

  const backgrounds = Customization.getCached().backgrounds ?? {};
  const fragment = document.createDocumentFragment();

  Customization.CUSTOMIZABLE_SCREENS.forEach((screen) => {
    const row = document.createElement('div');
    row.className = 'settings-row settings-row-select';

    const textWrap = document.createElement('div');
    textWrap.className = 'settings-row-text';
    const title = document.createElement('span');
    title.className = 'settings-row-title';
    title.textContent = `${screen.label}の背景`;
    textWrap.appendChild(title);

    const select = document.createElement('select');
    select.className = 'settings-select bg-select';
    select.dataset.screen = screen.key;
    select.setAttribute('aria-label', `${screen.label}の背景`);

    Customization.BACKGROUND_PRESETS.forEach((preset) => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.label;
      select.appendChild(option);
    });
    select.value = backgrounds[screen.key] ?? 'default';

    row.appendChild(textWrap);
    row.appendChild(select);
    fragment.appendChild(row);
  });

  list.replaceChildren(fragment);
}

/**
 * 保存データ使用量の表示テキストを更新する。
 * バイト数をKB単位（小数点以下1桁）に整形して表示する。
 */
function renderStorageUsage() {
  const label = document.getElementById('storageUsageLabel');
  if (!label) return;

  const bytes = Storage.getUsageBytes();
  const kb = bytes / 1024;
  label.textContent = `約${kb.toFixed(1)} KB`;
}

/**
 * 通知セクションの状態表示（説明文）と、ホーム画面未追加時の案内バナーを
 * 現在の状態（standalone表示か・通知許可の状態）に合わせて更新する。
 */
function renderNotificationStatus() {
  const hint = document.getElementById('notificationHomeScreenHint');
  const statusLabel = document.getElementById('notificationStatusLabel');
  if (!hint || !statusLabel) return;

  const isStandalone = Notifications.isStandalonePwa();
  hint.hidden = isStandalone;

  if (!isStandalone) {
    statusLabel.textContent = '新着メッセージの通知（ホーム画面に追加すると使えます）';
    return;
  }

  const permission = Notifications.getPermissionState();
  if (permission === 'denied') {
    statusLabel.textContent = '通知がブロックされています。iPhoneの設定アプリから許可してください。';
  } else if (permission === 'granted' && Settings.isNotificationsEnabled()) {
    statusLabel.textContent = '新着メッセージの通知（有効）';
  } else {
    statusLabel.textContent = '新着メッセージの通知';
  }
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
// Workspace / Records 画面の表示制御
// ------------------------------------------------------------

/**
 * Workspaceの「戻る」ボタンの処理。Router経由でCalculatorへ戻る。
 * パスコードの入力バッファもリセットする。
 */
function handleCloseWorkspace() {
  Router.closeWorkspace();
  passcodeBuffer = '';
  render();
}

/**
 * Recordsの「戻る」ボタンの処理。Router経由でWorkspaceへ戻る。
 */
function handleCloseRecords() {
  Router.closeRecords();
}

/**
 * 🔒（今すぐロック）の処理。Workspace/Recordsどちらからでも、
 * Router経由で即座にCalculatorへ戻し、パスコードの入力バッファもリセットする。
 */
function handleLockNow() {
  Router.lockNow();
  passcodeBuffer = '';
  render();
}

/**
 * 👁（鑑賞モード）ボタンの処理。
 * 既に鑑賞モード中ならワンタップで解除し、そうでなければパスコード確認
 * パネルを表示する（有効化にはパスコードの再入力を要求する）。
 */
function handleToggleViewMode() {
  if (Workspace.isViewModeActive()) {
    Workspace.setViewModeActive(false);
    Router.disableViewMode();
    return;
  }

  Workspace.showViewModeAuth();
}

/**
 * 鑑賞モード確認パネルの「確認」ボタンの処理。
 * 入力値がパスコードと一致した場合のみ鑑賞モードを有効化する。
 */
function handleConfirmViewMode() {
  const value = Workspace.getViewModeAuthValue();

  if (Passcode.validate(value)) {
    playFeedbackSound('success');
    playFeedbackVibration();
    Workspace.hideViewModeAuth();
    Workspace.clearViewModeAuthInput();
    Workspace.setViewModeActive(true);
    Router.enableViewMode();
    return;
  }

  playFeedbackSound('error');
  playFeedbackVibration();
  Workspace.clearViewModeAuthInput();
}

/**
 * 鑑賞モード確認パネルの「キャンセル」ボタンの処理。
 */
function handleCancelViewMode() {
  Workspace.hideViewModeAuth();
  Workspace.clearViewModeAuthInput();
}

/**
 * Recordsの「送信」ボタンの処理。
 * 現時点ではFirebase等のバックエンドが無いため、入力内容をメモリ上の
 * アーカイブへ保存するだけで、画面上には一切表示・保持しない
 * （送信すると入力欄がそのまま空になり、メッセージ一覧のような
 * 表示は一切残らない）。
 */
function handleSendRecord() {
  const text = Records.getInputValue().trim();
  if (!text) return;

  Records.saveToArchive(text);
  Records.clearInput();
  playFeedbackSound('success');
  playFeedbackVibration();
}

/**
 * Workspace画面のdata-action → ハンドラ関数の対応表。
 * ACTION_HANDLERS（Calculator側）と同じ考え方をWorkspaceにも適用する。
 */
const WORKSPACE_ACTION_HANDLERS = Object.freeze({
  'close-workspace': handleCloseWorkspace,
  'lock-now': handleLockNow,
  'toggle-view-mode': handleToggleViewMode,
  'confirm-view-mode': handleConfirmViewMode,
  'cancel-view-mode': handleCancelViewMode,
});

/**
 * Workspace画面が開いている間のクリックを処理する。
 * AutoLockのリセットはrouter.jsのグローバルリスナー（pointerdown等）が
 * 自動で行うため、ここでは呼ばない。
 * @param {HTMLElement} target
 */
function handleWorkspaceScreenClick(target) {
  const { action, secret } = target.dataset;

  playFeedbackSound('tap');
  playFeedbackVibration();

  const handler = WORKSPACE_ACTION_HANDLERS[action];
  if (handler) {
    handler();
    return;
  }

  if (secret === 'records') {
    Router.openRecords();
    return;
  }

  if (secret === 'calendar') {
    Router.openCalendar();
    return;
  }

  if (secret === 'archive') {
    Router.openArchive();
    return;
  }

  if (secret === 'messages') {
    handleOpenMessagesCard();
    return;
  }
if (secret === 'settings') {

  openSettings();

  return;

}

// 写真／行きたい場所は現時点では未実装。
}

/**
 * Workspaceの「メッセージ」カードの処理。
 * 既にルームへ接続済み（ローカルにroomIdがある）ならMessagesを直接開き、
 * まだ未接続ならPairing（招待コードの発行/入力）を開く。
 */
function handleOpenMessagesCard() {
  const roomId = Firebase.getLocalRoomId();
  if (roomId) {
    Router.openMessages();
  } else {
    Router.openPairing();
  }
}

/**
 * Records画面のdata-action → ハンドラ関数の対応表。
 */
const RECORDS_ACTION_HANDLERS = Object.freeze({
  'close-records': handleCloseRecords,
  'lock-now': handleLockNow,
  'send-record': handleSendRecord,
});

/**
 * Records画面が開いている間のクリックを処理する。
 * @param {HTMLElement} target
 */
function handleRecordsScreenClick(target) {
  const { action } = target.dataset;

  playFeedbackSound('tap');
  playFeedbackVibration();

  const handler = RECORDS_ACTION_HANDLERS[action];
  if (handler) {
    handler();
  }
}

/**
 * Calendarの「戻る」ボタンの処理。Router経由でWorkspaceへ戻る。
 */
function handleCloseCalendar() {
  Router.closeCalendar();
}

/**
 * Calendarの「前の月」ボタンの処理。
 */
function handlePrevMonth() {
  Calendar.goToPreviousMonth();
}

/**
 * Calendarの「次の月」ボタンの処理。
 */
function handleNextMonth() {
  Calendar.goToNextMonth();
}

/**
 * Calendarの日付セルをタップしたときの処理。
 * タップされたセルのdata-date（'YYYY-MM-DD'）をそのままCalendarへ渡し、
 * その日のメモ編集パネルを開かせる。
 * @param {HTMLElement} target
 */
function handleSelectDate(target) {
  const { date } = target.dataset;
  if (!date) return;

  Calendar.selectDate(date);
}

/**
 * Calendarのメモ編集パネル「保存」ボタンの処理。
 * 入力内容はCalendar.saveNote()経由でStorageへ保存される
 * （calendar.js自身がStorageを介して永続化する。app.jsはlocalStorageに
 * 直接触れない）。
 */
function handleSaveNote() {
  const text = Calendar.getNoteInputValue();
  Calendar.saveNote(text);
  playFeedbackSound('success');
  playFeedbackVibration();
}

/**
 * Calendarのメモ編集パネル「キャンセル」ボタンの処理。
 */
function handleCancelNote() {
  Calendar.closeNoteEditor();
}

/**
 * Calendar画面のdata-action → ハンドラ関数の対応表。
 * 「select-date」だけはdata-dateの値が必要なため、
 * handleCalendarScreenClick()側で個別に扱う。
 */
const CALENDAR_ACTION_HANDLERS = Object.freeze({
  'close-calendar': handleCloseCalendar,
  'lock-now': handleLockNow,
  'prev-month': handlePrevMonth,
  'next-month': handleNextMonth,
  'save-note': handleSaveNote,
  'cancel-note': handleCancelNote,
});

/**
 * Calendar画面が開いている間のクリックを処理する。
 * @param {HTMLElement} target
 */
function handleCalendarScreenClick(target) {
  const { action } = target.dataset;

  playFeedbackSound('tap');
  playFeedbackVibration();

  if (action === 'select-date') {
    handleSelectDate(target);
    return;
  }

  const handler = CALENDAR_ACTION_HANDLERS[action];
  if (handler) {
    handler();
  }
}

/**
 * Archiveの「戻る」ボタンの処理。Router経由でWorkspaceへ戻る。
 */
function handleCloseArchive() {
  Router.closeArchive();
}

/**
 * Archiveの背景プリセット選択の処理。
 * @param {HTMLElement} target
 */
function handleSelectBackground(target) {
  const { backgroundId } = target.dataset;
  if (!backgroundId) return;

  Archive.selectBackground(backgroundId);
}

/**
 * Archiveロック認証パネルの「確認」ボタンの処理。
 * パスコードが正しければarchive.js内部でコンテンツが表示される。
 * 誤っていた場合はarchive.js側でエラー表示・入力クリアまで行うため、
 * ここでは成功/失敗に応じたフィードバック音だけを鳴らす。
 */
function handleConfirmArchiveAuth() {
  const success = Archive.confirmAuth();
  playFeedbackSound(success ? 'success' : 'error');
  playFeedbackVibration();
}

/**
 * Archiveロック認証パネルの「キャンセル」ボタンの処理。
 * 認証せずにWorkspaceへ戻る。
 */
function handleCancelArchiveAuth() {
  Router.closeArchive();
}

/**
 * Archive画面のdata-action → ハンドラ関数の対応表。
 * 「select-background」だけはdata-backgroundIdの値が必要なため、
 * handleArchiveScreenClick()側で個別に扱う。
 */
const ARCHIVE_ACTION_HANDLERS = Object.freeze({
  'close-archive': handleCloseArchive,
  'lock-now': handleLockNow,
  'confirm-archive-auth': handleConfirmArchiveAuth,
  'cancel-archive-auth': handleCancelArchiveAuth,
});

/**
 * Archive画面が開いている間のクリックを処理する。
 * @param {HTMLElement} target
 */
function handleArchiveScreenClick(target) {
  const { action } = target.dataset;

  playFeedbackSound('tap');
  playFeedbackVibration();

  if (action === 'select-background') {
    handleSelectBackground(target);
    return;
  }

  const handler = ARCHIVE_ACTION_HANDLERS[action];
  if (handler) {
    handler();
  }
}

/**
 * Pairingの「戻る」ボタンの処理。Router経由でWorkspaceへ戻る。
 */
function handleClosePairing() {
  Router.closePairing();
}

/**
 * Pairing「次へ」（表示名保存）ボタンの処理。
 * 入力が空の場合は何もしない（ボタンを押しても先へ進めない）。
 */
function handleSaveDisplayName() {
  const name = Pairing.getDisplayNameInputValue();
  if (!name) return;

  Pairing.saveDisplayName(name);
  Pairing.showChoicePanel();
}

/**
 * Pairing「招待コードを発行する」ボタンの処理。
 * 発行パネルを先に表示してから、非同期の発行処理を開始する
 * （通信中もユーザーには「発行中…」の状態が見えるようにするため）。
 */
function handleChooseGenerate() {
  Pairing.showGeneratePanel();
  Pairing.generateInvite().catch((error) => {
    console.error('[app.js] 招待コードの発行に失敗しました', error);
  });
}

/**
 * Pairing「招待コードを入力する」ボタンの処理。
 */
function handleChooseJoin() {
  Pairing.showJoinPanel();
}

/**
 * Pairing「戻る」（選択パネルへ戻る）ボタンの処理。
 * 発行待機中であればPairing.backToChoice()内で購読も止まる。
 */
function handleBackToChoice() {
  Pairing.backToChoice();
}

/**
 * Pairing「参加する」ボタンの処理。
 * 成功時の画面遷移（Router.completePairing()）は、pairing.js内の
 * onPairedCallback経由で一元的に行われるため、ここでは呼ばない
 * （招待コード発行側の「相手の参加を検知して自動遷移」と経路を揃えるため）。
 * 失敗したら画面内にエラーメッセージを表示するだけで、画面遷移はしない。
 */
async function handleSubmitJoinCode() {
  try {
    await Pairing.submitJoinCode();
    playFeedbackSound('success');
    playFeedbackVibration();
  } catch (error) {
    playFeedbackSound('error');
    playFeedbackVibration();
    Pairing.showJoinError(error.message || '参加に失敗しました。');
  }
}

/**
 * Pairing画面のdata-action → ハンドラ関数の対応表。
 */
const PAIRING_ACTION_HANDLERS = Object.freeze({
  'close-pairing': handleClosePairing,
  'lock-now': handleLockNow,
  'save-display-name': handleSaveDisplayName,
  'choose-generate': handleChooseGenerate,
  'choose-join': handleChooseJoin,
  'back-to-choice': handleBackToChoice,
  'submit-join-code': handleSubmitJoinCode,
});

/**
 * Pairing画面が開いている間のクリックを処理する。
 * @param {HTMLElement} target
 */
function handlePairingScreenClick(target) {
  const { action } = target.dataset;

  playFeedbackSound('tap');
  playFeedbackVibration();

  const handler = PAIRING_ACTION_HANDLERS[action];
  if (handler) {
    handler();
  }
}

/**
 * Messagesの「戻る」ボタンの処理。Router経由でWorkspaceへ戻る。
 */
function handleCloseMessages() {
  Router.closeMessages();
}

/**
 * Messagesの「送信」ボタンの処理。
 * 実際の送受信・永続化はFirebase（messages.js経由）が担い、ここでは
 * フィードバック音とエラーハンドリングだけを受け持つ。
 */
function handleSendMessage() {
  Messages.sendMessage().catch((error) => {
    console.error('[app.js] メッセージの送信に失敗しました', error);
  });
}

/**
 * 長押しアクションシート「コピー」ボタンの処理。
 */
function handleCopyMessage() {
  Messages.copySelectedMessage().catch((error) => {
    console.error('[app.js] メッセージのコピーに失敗しました', error);
  });
}

/**
 * 長押しアクションシート「削除」ボタンの処理。
 * 削除できるのは自分が送ったメッセージのみ（messages.js側とFirestoreの
 * セキュリティルール側の両方で強制している）。
 */
function handleDeleteMessage() {
  Messages.deleteSelectedMessage().catch((error) => {
    console.error('[app.js] メッセージの削除に失敗しました', error);
  });
}

/**
 * 長押しアクションシート「キャンセル」ボタンの処理。
 */
function handleCancelActionSheet() {
  Messages.closeActionSheet();
}

/**
 * 長押しアクションシートのリアクション絵文字ボタンの処理。
 * data-emojiの値が必要なため、handleMessagesScreenClick()側で個別に扱う。
 * @param {HTMLElement} target
 */
function handleReactToMessage(target) {
  const { emoji } = target.dataset;
  if (!emoji) return;

  Messages.reactToSelectedMessage(emoji);
}

/**
 * Messages画面のdata-action → ハンドラ関数の対応表。
 * 「react」だけはdata-emojiの値が必要なため、
 * handleMessagesScreenClick()側で個別に扱う。
 */
const MESSAGES_ACTION_HANDLERS = Object.freeze({
  'close-messages': handleCloseMessages,
  'lock-now': handleLockNow,
  'send-message': handleSendMessage,
  'copy-message': handleCopyMessage,
  'delete-message': handleDeleteMessage,
  'cancel-action-sheet': handleCancelActionSheet,
});

/**
 * Messages画面が開いている間のクリックを処理する。
 * @param {HTMLElement} target
 */
function handleMessagesScreenClick(target) {
  const { action } = target.dataset;

  playFeedbackSound('tap');
  playFeedbackVibration();

  if (action === 'react') {
    handleReactToMessage(target);
    return;
  }

  const handler = MESSAGES_ACTION_HANDLERS[action];
  if (handler) {
    handler();
  }
}

/**
 * Archive画面の検索欄（#archiveSearchInput）の入力を処理する。
 * document全体を監視するhandleGlobalInput()から、対象idのときだけ呼ばれる。
 * @param {string} query
 */
function handleArchiveSearchInput(query) {
  Archive.search(query);
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
 * 「キャッシュを削除」ボタンの処理。
 * Service Workerが保持しているキャッシュ（CACHE_NAME）をすべて削除する。
 * 削除しただけでは画面上の見た目は変わらないため、次回起動時（または
 * 次にService Workerが再インストールされたタイミング）から反映される
 * ことを利用者に伝える。
 */
async function handleClearCache() {
  try {
    if (!('caches' in window)) return;

    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));

    playFeedbackSound('success');
    playFeedbackVibration();
  } catch (error) {
    console.error('[app.js] キャッシュの削除に失敗しました', error);
    playFeedbackSound('error');
    playFeedbackVibration();
  }
}

/**
 * 「自分の送信メッセージを一括削除」ボタンの処理。
 * 現在接続中のルームの中で、自分が送信したメッセージだけを削除する
 * （Firestoreのルール上、他人のメッセージは削除できない）。
 * ルーム未接続の場合は何もしない。
 */
async function handleDeleteAllMyMessages() {
  const roomId = Firebase.getLocalRoomId();
  const uid = Firebase.getCurrentUid();
  if (!roomId || !uid) return;

  try {
    await Firebase.deleteAllOwnMessages(roomId, uid);
    playFeedbackSound('success');
    playFeedbackVibration();
  } catch (error) {
    console.error('[app.js] メッセージの一括削除に失敗しました', error);
    playFeedbackSound('error');
    playFeedbackVibration();
  }
}

/**
 * 「Archiveの記録をすべて削除」ボタンの処理。
 * records.jsが管理するローカルのアーカイブデータ（Storage経由）を空にする。
 */
function handleClearArchiveData() {
  try {
    Records.clearArchive();
    renderStorageUsage();
    playFeedbackSound('success');
    playFeedbackVibration();
  } catch (error) {
    console.error('[app.js] Archiveデータの削除に失敗しました', error);
    playFeedbackSound('error');
    playFeedbackVibration();
  }
}

/**
 * カード編集リストの「▲」ボタンの処理。
 * 現在の並び順で1つ前のカードと、orderの値を入れ替える
 * （先頭のカードには▲ボタン自体が表示されない）。
 * @param {HTMLElement} target
 */
async function handleMoveCardUp(target) {
  const { cardKey } = target.dataset;
  if (!cardKey) return;
  await swapCardOrder(cardKey, -1);
}

/**
 * カード編集リストの「▼」ボタンの処理。1つ後ろのカードとorderを入れ替える。
 * @param {HTMLElement} target
 */
async function handleMoveCardDown(target) {
  const { cardKey } = target.dataset;
  if (!cardKey) return;
  await swapCardOrder(cardKey, 1);
}

/**
 * 現在表示中の並び順で、指定したカードとその前後（direction: -1で1つ前、
 * +1で1つ後ろ）のorder値を入れ替えて保存する。設定カード（並び替え対象外）
 * が隣接していた場合や、既に端にいる場合は何もしない。
 * @param {string} cardKey
 * @param {-1|1} direction
 */
async function swapCardOrder(cardKey, direction) {
  const cards = Customization.getEffectiveCards();
  const currentIndex = cards.findIndex((card) => card.key === cardKey);
  const targetIndex = currentIndex + direction;
  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= cards.length) return;

  try {
    await Customization.updateCardOrder({
      [cards[currentIndex].key]: targetIndex,
      [cards[targetIndex].key]: currentIndex,
    });
    playFeedbackSound('tap');
    playFeedbackVibration();
  } catch (error) {
    console.error('[app.js] カードの並び替えに失敗しました', error);
    playFeedbackSound('error');
    playFeedbackVibration();
  }
}

/**
 * 「Workspaceカスタマイズをデフォルトに戻す」ボタンの処理。
 * 誤操作防止のため、確認ダイアログ（window.confirm）を挟む。
 */
async function handleResetCustomization() {
  const confirmed = window.confirm(
    'カード名・アイコン・並び順・Workspaceタイトル・背景を、すべて初期状態に戻します。よろしいですか？',
  );
  if (!confirmed) return;

  try {
    await Customization.resetAll();
    playFeedbackSound('success');
    playFeedbackVibration();
  } catch (error) {
    console.error('[app.js] カスタマイズのリセットに失敗しました', error);
    playFeedbackSound('error');
    playFeedbackVibration();
  }
}

/**
 * 履歴パネルの開閉を切り替える。設定/ロック画面と同様、
 * これは一時的な表示状態のためrender()を経由せず直接DOMを操作する。
 * CSSのmax-height/opacityによるアニメーションだけに頼らず、
 * 閉じている間はhidden属性も付与することで、スクリーンリーダー等の
 * 支援技術から見ても確実に「存在しない」扱いにする
 * （display:none相当をCSSだけに依存させない）。
 */
function toggleHistoryPanel() {
  const panel = document.getElementById('historyPanel');
  const button = document.getElementById('historyToggleBtn');
  const isExpanded = panel.classList.toggle('is-expanded');
  panel.hidden = !isExpanded;
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
  'clear-cache': handleClearCache,
  'delete-all-my-messages': handleDeleteAllMyMessages,
  'clear-archive-data': handleClearArchiveData,
  'move-card-up': handleMoveCardUp,
  'move-card-down': handleMoveCardDown,
  'reset-customization': handleResetCustomization,
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
  let shouldRender = true;

  try {
    dispatchToCalculator(CALC_ACTIONS.DIGIT, digit);
    const displayState = Calculator.getDisplayState();
    playFeedbackSound(displayState.isError ? 'error' : 'tap');
    playFeedbackVibration();

    // パスコードの判定は電卓の計算処理とは独立して行う。
    // 5文字以上になっても切り詰めない。桁数がパスコードとちょうど同じときだけ
    // 判定することで、"120209"のような余分な桁を含む入力では絶対に開かないようにする。
    // 毎回getPasscode()を呼んで最新値を取得する（結果をローカル変数に
    // キャッシュしない）。将来Settings画面からパスコードを変更できるように
    // なった際、変更直後の入力から新しいパスコードで判定させるため。
    passcodeBuffer += digit;

    const passcode = Passcode.getPasscode();
    if (passcodeBuffer.length === passcode.length) {
      if (Passcode.validate(passcodeBuffer)) {
        Router.openWorkspace();
        passcodeBuffer = '';
        // Workspaceへ切り替わった直後は電卓側のrender()は不要なのでスキップする。
        shouldRender = false;
        return;
      }
    }
  } catch (error) {
    console.error('[app.js] 数字入力の処理に失敗しました', error);
  } finally {
    if (shouldRender) {
      render();
    }
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
  // パスコードの入力バッファは、AC/＝/＋/−/×/÷/％/. の8つのアクションでのみ
  // リセットする（±は仕様上あえて対象外）。実際の計算処理より先に行う。
  if (PASSCODE_RESET_ACTIONS.has(action)) {
    passcodeBuffer = '';
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

  if (!(event.target instanceof Element)) return;

  const target = event.target.closest(

    '[data-action], [data-num], [data-secret]'

  );

  if (!target) return;

  const currentScreen = Router.getCurrentScreen();

  const { action, num } = target.dataset;

  // ==========================================================

  // 設定画面が開いている場合は、最優先で設定画面の操作を処理する

  // ==========================================================

  const settingsOverlay = document.getElementById('settingsOverlay');

  if (

    settingsOverlay &&

    settingsOverlay.classList.contains('is-open')

  ) {

    const settingsHandler = ACTION_HANDLERS[action];

    if (settingsHandler) {

      playFeedbackSound('tap');

      playFeedbackVibration();

      settingsHandler(target, event);

    }

    return;

  }

  // ==========================================================

  // Records

  // ==========================================================

  if (currentScreen === Router.Screen.RECORDS) {

    handleRecordsScreenClick(target);

    return;

  }

  // ==========================================================

  // Calendar

  // ==========================================================

  if (currentScreen === Router.Screen.CALENDAR) {

    handleCalendarScreenClick(target);

    return;

  }

  // ==========================================================

  // Archive

  // ==========================================================

  if (currentScreen === Router.Screen.ARCHIVE) {

    handleArchiveScreenClick(target);

    return;

  }

  // ==========================================================

  // Pairing

  // ==========================================================

  if (currentScreen === Router.Screen.PAIRING) {

    handlePairingScreenClick(target);

    return;

  }

  // ==========================================================

  // Messages

  // ==========================================================

  if (currentScreen === Router.Screen.MESSAGES) {

    handleMessagesScreenClick(target);

    return;

  }

  // ==========================================================

  // Workspace

  // ==========================================================

  if (currentScreen === Router.Screen.WORKSPACE) {

    handleWorkspaceScreenClick(target);

    return;

  }

  // ==========================================================

  // Calculator

  // ==========================================================

  if (num !== undefined) {

    handleDigitInput(num);

    return;

  }

  if (CALCULATOR_ACTIONS.has(action)) {

    handleCalculatorAction(action);

    return;

  }

  // ==========================================================

  // 共通アクション

  // ==========================================================

  const handler = ACTION_HANDLERS[action];

  if (handler) {

    playFeedbackSound('tap');

    playFeedbackVibration();

    handler(target, event);

  }

}
/**
 * document全体のinputイベントを1つのリスナーで受け止める。
 * Archiveの検索欄（#archiveSearchInput、input要素）と、Messagesの
 * 入力欄（#messagesInput、textarea要素）の両方を対象とするため、
 * HTMLInputElement/HTMLTextAreaElementのどちらも受け付ける。
 * router.jsのグローバルinputリスナー（AutoLockの活動検知用）とは
 * 目的が異なる、別の関心事として独立させている。
 * @param {Event} event
 */
function handleDocumentInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;

  if (target.id === 'archiveSearchInput') {
    handleArchiveSearchInput(target.value);
    return;
  }

  if (target.id === 'messagesInput') {
    Messages.notifyTyping();
    Messages.autoResizeInput();
  }
}

/**
 * 設定画面内のトグル（チェックボックス）変更を1つのリスナーで受け止める。
 * @param {Event} event
 */
function handleSettingsChange(event) {
  const target = event.target;

  if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    handleSettingsCheckboxChange(target);
    return;
  }

  if (target instanceof HTMLInputElement && target.type === 'text') {
    handleSettingsTextInputChange(target);
    return;
  }

  if (target instanceof HTMLSelectElement) {
    handleSettingsSelectChange(target);
  }
}

/**
 * 設定画面内のチェックボックス（トグル）の変更を処理する。
 * @param {HTMLInputElement} target
 */
function handleSettingsCheckboxChange(target) {
  const checked = target.checked;

  switch (target.id) {
    case 'soundToggle':
      Settings.setSoundEnabled(checked);
      break;
    case 'vibrationToggle':
      Settings.setVibrationEnabled(checked);
      break;
    case 'biometricToggle':
      handleBiometricToggle(checked);
      break;
    case 'archiveLockToggle':
      Settings.setArchiveLockEnabled(checked);
      break;
    case 'notificationsToggle':
      handleNotificationsToggle(checked);
      break;
    case 'notificationContentToggle':
      Settings.setNotificationContentEnabled(checked);
      Notifications.syncNotificationContentPreference(checked).catch((error) => {
        console.warn('[app.js] 通知内容表示設定の同期に失敗しました', error);
      });
      break;
    case 'notificationSoundToggle':
      Settings.setNotificationSoundEnabled(checked);
      break;
    case 'notificationVibrationToggle':
      Settings.setNotificationVibrationEnabled(checked);
      break;
    case 'readReceiptsToggle':
      Settings.setReadReceiptsEnabled(checked);
      break;
    case 'onlineVisibilityToggle':
      Settings.setOnlineVisibilityEnabled(checked);
      break;
    default:
      break;
  }
}

/**
 * 設定画面内の<select>（自動ロック時間・会話整理方法・整理時間）の
 * 変更を処理する。時間系の値はミリ秒の文字列として持たせているため、
 * 保存時にNumber()へ変換する。
 * @param {HTMLSelectElement} target
 */
function handleSettingsSelectChange(target) {
  // 背景セレクトは6つとも動的生成のためidを持たず、
  // クラス名＋data-screenで判定する（他は個別idで判定する）。
  if (target.classList.contains('bg-select')) {
    const { screen } = target.dataset;
    if (!screen) return;

    Customization.updateBackground(screen, target.value).catch((error) => {
      console.error('[app.js] 背景の保存に失敗しました', error);
    });
    return;
  }

  switch (target.id) {
    case 'autoLockDurationSelect':
      Settings.setAutoLockDurationMs(Number(target.value));
      break;
    case 'organizeModeSelect':
      Settings.setConversationOrganizeMode(target.value);
      break;
    case 'organizeDurationSelect':
      Settings.setConversationOrganizeDurationMs(Number(target.value));
      break;
    default:
      break;
  }
}

/**
 * 設定画面内のテキスト入力（Workspaceタイトル・カードのアイコン/表示名）の
 * 変更を処理する。カードのアイコン/表示名はクラス名＋data-cardKeyで判定する
 * （動的生成のため、カードごとの個別idを持たない）。
 * @param {HTMLInputElement} target
 */
function handleSettingsTextInputChange(target) {
  if (target.id === 'workspaceTitleInput') {
    Customization.updateWorkspaceTitle(target.value).catch((error) => {
      console.error('[app.js] Workspaceタイトルの保存に失敗しました', error);
    });
    return;
  }

  if (target.classList.contains('card-icon-input') || target.classList.contains('card-label-input')) {
    const { cardKey } = target.dataset;
    if (!cardKey) return;

    const changes = target.classList.contains('card-icon-input')
      ? { icon: target.value }
      : { label: target.value };

    Customization.updateCard(cardKey, changes).catch((error) => {
      console.error('[app.js] カードの保存に失敗しました', error);
    });
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
 * 「通知」トグルの変更を処理する。
 * ONにする瞬間：ホーム画面への追加状態を確認→許可を取得→端末登録、
 * という一連の流れをnotifications.js経由で行う。途中で失敗した場合は
 * 設定を保存せず、次のrender()でトグルの見た目を実際の設定値（false）に
 * 戻す（handleBiometricToggleと同じ考え方）。
 * OFFにする瞬間：この端末の登録を無効化するだけで、設定はそのまま保存する。
 * @param {boolean} enabled
 */
async function handleNotificationsToggle(enabled) {
  if (!enabled) {
    Settings.setNotificationsEnabled(false);
    Notifications.disableRegistration().catch((error) => {
      console.warn('[app.js] 通知登録の無効化に失敗しました', error);
    });
    renderNotificationStatus();
    return;
  }

  try {
    await Notifications.requestPermissionAndRegister();
    Settings.setNotificationsEnabled(true);
    renderNotificationStatus();
    return;
  } catch (error) {
    console.warn('[app.js] 通知の許可取得に失敗しました', error);
  }

  // 失敗時は設定を保存せず、トグルの見た目を実際の設定値（false）に戻す。
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
  document.addEventListener('input', handleDocumentInput);

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

  navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
}

/**
 * service-worker.jsから届くpostMessageを処理する。
 * ・通知タップ時：パスコード認証を経ずに直接開くことはできない
 *   （既存のロック方式を維持するため）が、アプリ自体はフォアグラウンドへ
 *   戻ってくるので、そのままWorkspace/Messagesへの遷移案内は行わず、
 *   ユーザーが通常通りパスコードを入力して開く流れに委ねる。
 *   ここでは将来の拡張（パスコード入力後に自動でメッセージ画面へ
 *   遷移させる等）のための受け口として、受信のログのみ残す。
 * ・購読変更時：notifications.js経由で再登録を試みる。
 * @param {MessageEvent} event
 */
function handleServiceWorkerMessage(event) {
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'calculator-0209-notification-click') {
    console.info('[app.js] 通知がタップされました', message.roomId);
    return;
  }

  if (message.type === 'calculator-0209-push-subscription-changed') {
    Notifications.syncRegistrationOnStartup().catch((error) => {
      console.warn('[app.js] プッシュ購読変更後の再登録に失敗しました', error);
    });
  }
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
 * Auth.isSupported()を待ちすぎないようにするための安全装置。
 * 端末・ブラウザによってはWebAuthnの対応判定が極端に遅れる、
 * または返ってこないことがあるため、一定時間で強制的に
 * 「非対応（false）」とみなし、電卓本体の表示・操作を止めないようにする。
 * @param {Promise<boolean>} promise
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
}

/**
 * アプリの初期化処理。DOMContentLoaded後に一度だけ呼ばれる。
 * 生体認証の対応判定を待たず、まず電卓本体のUIを必ず構築・表示できるようにし、
 * build → event → subscribe → render → biometric の順に実行する。
 */
async function init() {
  try {
    // 1. build: DOM生成（キーパッド・テーマ選択肢）
    // Auth.isSupported()の判定を待たずに、まず電卓のUIを必ず作る。
    buildKeypad();
    buildThemeOptions();
    buildDurationSelectOptions();

    // Workspace/Records画面の構築、AutoLock、操作全般の活動検知リスナーは
    // Router.init()にまとめて任せる（app.jsは画面制御のみ担当する）。
    Router.init();

    // ペアリング成立時（招待コード発行→相手参加の検知、または招待コード
    // 入力→参加成功）にPairingからMessagesへ直接遷移させる。
    // Router.completePairing()は「PairingからMessagesへ切り替える」という
    // 画面遷移の責務そのものなので、ここではRouter側の関数を渡すだけにする。
    // 併せて、ペアリングが成立した瞬間にWorkspace共有カスタマイズの
    // Firestore購読も開始する（それまではローカルキャッシュ値のみで動く）。
    Pairing.setOnPaired(() => {
      Router.completePairing();
      Customization.start();
    });

    // 既にペアリング済み（roomIdが既にローカルに保存されている）の場合は、
    // 起動直後からWorkspace共有カスタマイズの購読を開始する。
    // 未ペアリングの場合は何もしない（Customization.start()内部で判定する）。
    Customization.start();

    // Workspace共有カスタマイズが変わるたびに、設定画面側の表示も
    // 最新に保つ（設定画面を開いたまま相手が変更した場合や、
    // ペアリング成立直後にFirestoreの実際の値が届いた場合に反映するため）。
    Customization.subscribe(() => {
      renderWorkspaceTitleInput();
      renderCardCustomizationList();
      renderBackgroundCustomizationList();
    });

    // 2. event: イベント登録（ユーザー操作を受け付けられる状態にする）
    registerEventListeners();
    registerTeardownHandlers();

    // 3. subscribe: Storageの変更通知を購読
    subscribeToStorageChanges();

    // 4. render: 現在の状態を初回描画（この時点で電卓は完全に操作可能になる）
    render();

    // 5. biometric: UI構築後に判定する。最大3秒で強制的に結果を確定させる。
    isBiometricSupported = await withTimeout(Auth.isSupported(), 3000);
    render(); // biometricRowの表示切替を反映
    await runBiometricLockFlow();

    registerServiceWorker();

    // 6. notifications: 既に許可済み・ONの場合は登録を同期し、
    // アプリを開いている間に届く通知の受け口も用意する。
    // 起動シーケンスの最後（電卓が完全に操作可能になった後）に行い、
    // 万一失敗しても電卓本体の起動は妨げない。
    Notifications.syncRegistrationOnStartup();
    Notifications.initForegroundListener();
  } catch (error) {
    console.error('[app.js] 初期化中にエラーが発生しました', error);
    render();
  }
}

document.addEventListener('DOMContentLoaded', init);