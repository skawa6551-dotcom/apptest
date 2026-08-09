// ============================================================

// app.js

// Calculator 0209

// ============================================================

import Calculator, {

  ACTIONS as CALC_ACTIONS,

} from './calculator.js';

import Storage, {

  STORAGE_KEYS,

} from './storage.js';

import Settings, {

  AUTO_LOCK_DURATION_PRESETS,

  CONVERSATION_ORGANIZE_DURATION_PRESETS,

} from './settings.js';

import Sound from './sound.js';

import Auth from './auth.js';

import {

  THEMES,

  getThemeById,

} from './themes.js';

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

import Photo from './photo.js';

// ============================================================

// 定数

// ============================================================

const KEYPAD_LAYOUT = [

  [

    {

      label: 'AC',

      action: CALC_ACTIONS.CLEAR,

      variant: 'func',

    },

    {

      label: '±',

      action: CALC_ACTIONS.NEGATE,

      variant: 'func',

    },

    {

      label: '%',

      action: CALC_ACTIONS.PERCENT,

      variant: 'func',

    },

    {

      label: '÷',

      action: CALC_ACTIONS.DIVIDE,

      variant: 'operator',

    },

  ],

  [

    {

      label: '7',

      num: '7',

      variant: 'num',

    },

    {

      label: '8',

      num: '8',

      variant: 'num',

    },

    {

      label: '9',

      num: '9',

      variant: 'num',

    },

    {

      label: '×',

      action: CALC_ACTIONS.MULTIPLY,

      variant: 'operator',

    },

  ],

  [

    {

      label: '4',

      num: '4',

      variant: 'num',

    },

    {

      label: '5',

      num: '5',

      variant: 'num',

    },

    {

      label: '6',

      num: '6',

      variant: 'num',

    },

    {

      label: '−',

      action: CALC_ACTIONS.SUBTRACT,

      variant: 'operator',

    },

  ],

  [

    {

      label: '1',

      num: '1',

      variant: 'num',

    },

    {

      label: '2',

      num: '2',

      variant: 'num',

    },

    {

      label: '3',

      num: '3',

      variant: 'num',

    },

    {

      label: '＋',

      action: CALC_ACTIONS.ADD,

      variant: 'operator',

    },

  ],

  [

    {

      label: '0',

      num: '0',

      variant: 'num',

      wide: true,

    },

    {

      label: '.',

      action: CALC_ACTIONS.DECIMAL,

      variant: 'num',

    },

    {

      label: '=',

      action: CALC_ACTIONS.EQUALS,

      variant: 'equal',

    },

  ],

];

const KEY_ARIA_LABELS =

  Object.freeze({

    [CALC_ACTIONS.CLEAR]:

      'オールクリア',

    [CALC_ACTIONS.NEGATE]:

      'プラスマイナス切り替え',

    [CALC_ACTIONS.PERCENT]:

      'パーセント',

    [CALC_ACTIONS.DIVIDE]:

      '割る',

    [CALC_ACTIONS.MULTIPLY]:

      '掛ける',

    [CALC_ACTIONS.SUBTRACT]:

      '引く',

    [CALC_ACTIONS.ADD]:

      '足す',

    [CALC_ACTIONS.DECIMAL]:

      '小数点',

    [CALC_ACTIONS.EQUALS]:

      '計算実行',

  });

const CALCULATOR_ACTIONS =

  new Set([

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

const PASSCODE_RESET_ACTIONS =

  new Set([

    CALC_ACTIONS.CLEAR,

    CALC_ACTIONS.EQUALS,

    CALC_ACTIONS.ADD,

    CALC_ACTIONS.SUBTRACT,

    CALC_ACTIONS.MULTIPLY,

    CALC_ACTIONS.DIVIDE,

    CALC_ACTIONS.PERCENT,

    CALC_ACTIONS.DECIMAL,

  ]);

const ERROR_DISPLAY_TEXT =

  Object.freeze({

    'division-by-zero':

      'エラー',

    overflow:

      'エラー',

    'unknown-operator':

      'エラー',

    unknown:

      'エラー',

  });

const DEFAULT_ERROR_TEXT =

  'エラー';

const LONG_NUMBER_THRESHOLD =

  10;

const PRESSED_CLASS_TIMEOUT =

  150;

const FOCUSABLE_SELECTOR =

  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ============================================================

// 状態

// ============================================================

let isBiometricSupported =

  false;

let lastFocusedElement =

  null;

let passcodeBuffer =

  '';

const pressedTimeouts =

  new WeakMap();

// ============================================================

// ユーティリティ

// ============================================================

function formatWithGrouping(

  rawValue,

) {

  if (

    typeof rawValue !==

      'string'

  ) {

    return String(

      rawValue,

    );

  }

  const isNegative =

    rawValue.startsWith(

      '-',

    );

  const unsigned =

    isNegative

      ? rawValue.slice(

          1,

        )

      : rawValue;

  const [

    integerPart,

    decimalPart,

  ] =

    unsigned.split(

      '.',

    );

  const groupedInteger =

    integerPart.replace(

      /\B(?=(\d{3})+(?!\d))/g,

      ',',

    );

  const grouped =

    decimalPart !==

    undefined

      ? `${groupedInteger}.${decimalPart}`

      : groupedInteger;

  return isNegative

    ? `-${grouped}`

    : grouped;

}

function groupNumbersInText(

  text,

) {

  return text.replace(

    /-?\d+(\.\d+)?/g,

    (

      match,

    ) =>

      formatWithGrouping(

        match,

      ),

  );

}

function playFeedbackSound(

  kind,

) {

  if (

    !Settings.isSoundEnabled()

  ) {

    return;

  }

  if (

    kind ===

    'success'

  ) {

    Sound.playSuccess();

    return;

  }

  if (

    kind ===

    'error'

  ) {

    Sound.playError();

    return;

  }

  Sound.playTap();

}

function playFeedbackVibration() {

  if (

    Settings.isVibrationEnabled()

  ) {

    Sound.vibrate();

  }

}

function dispatchToCalculator(

  type,

  payload,

) {

  return Calculator.input(

    type,

    payload,

  );

}

// ============================================================

// キーパッド生成

// ============================================================

function buildKeypad() {

  const keypadEl =

    document.getElementById(

      'keypad',

    );

  if (!keypadEl) {

    return;

  }

  const fragment =

    document.createDocumentFragment();

  KEYPAD_LAYOUT.forEach(

    (

      row,

    ) => {

      const rowEl =

        document.createElement(

          'div',

        );

      rowEl.className =

        'keypad-row';

      row.forEach(

        (

          keyDef,

        ) => {

          rowEl.appendChild(

            createKeyButton(

              keyDef,

            ),

          );

        },

      );

      fragment.appendChild(

        rowEl,

      );

    },

  );

  keypadEl.replaceChildren(

    fragment,

  );

}

function createKeyButton(

  keyDef,

) {

  const button =

    document.createElement(

      'button',

    );

  button.type =

    'button';

  button.className =

    `key key-${keyDef.variant}${

      keyDef.wide

        ? ' key-zero'

        : ''

    }`;

  button.textContent =

    keyDef.label;

  if (

    keyDef.num !==

    undefined

  ) {

    button.dataset.num =

      keyDef.num;

    button.setAttribute(

      'aria-label',

      `数字 ${keyDef.num}`,

    );

  } else {

    button.dataset.action =

      keyDef.action;

    button.setAttribute(

      'aria-label',

      KEY_ARIA_LABELS[

        keyDef.action

      ] ??

      keyDef.label,

    );

  }

  return button;

}

// ============================================================

// テーマ設定UI生成

// ============================================================

function buildThemeOptions() {

  const themeSwitchEl =

    document.getElementById(

      'themeSwitch',

    );

  if (!themeSwitchEl) {

    return;

  }

  const fragment =

    document.createDocumentFragment();

  THEMES.forEach(

    (

      theme,

    ) => {

      const button =

        document.createElement(

          'button',

        );

      button.type =

        'button';

      button.className =

        'theme-option';

      button.textContent =

        theme.label;

      button.dataset.action =

        'select-theme';

      button.dataset.themeId =

        theme.id;

      button.setAttribute(

        'role',

        'radio',

      );

      button.setAttribute(

        'aria-checked',

        'false',

      );

      fragment.appendChild(

        button,

      );

    },

  );

  themeSwitchEl.replaceChildren(

    fragment,

  );

}

// ============================================================

// 時間設定UI生成

// ============================================================

function populateDurationSelect(

  selectEl,

  presets,

) {

  if (!selectEl) {

    return;

  }

  const fragment =

    document.createDocumentFragment();

  presets.forEach(

    (

      preset,

    ) => {

      const option =

        document.createElement(

          'option',

        );

      option.value =

        String(

          preset.valueMs,

        );

      option.textContent =

        preset.label;

      fragment.appendChild(

        option,

      );

    },

  );

  selectEl.replaceChildren(

    fragment,

  );

}

function buildDurationSelectOptions() {

  populateDurationSelect(

    document.getElementById(

      'autoLockDurationSelect',

    ),

    AUTO_LOCK_DURATION_PRESETS,

  );

  populateDurationSelect(

    document.getElementById(

      'organizeDurationSelect',

    ),

    CONVERSATION_ORGANIZE_DURATION_PRESETS,

  );

}

// ============================================================

// 電卓表示

// ============================================================

function renderDisplay() {

  const displayState =

    Calculator.getDisplayState();

  const expressionEl =

    document.getElementById(

      'expressionDisplay',

    );

  const resultEl =

    document.getElementById(

      'resultDisplay',

    );

  if (

    !expressionEl ||

    !resultEl

  ) {

    return;

  }

  expressionEl.textContent =

    displayState.expression;

  if (

    displayState.isError

  ) {

    resultEl.textContent =

      ERROR_DISPLAY_TEXT[

        displayState.errorCode

      ] ??

      DEFAULT_ERROR_TEXT;

    resultEl.classList.add(

      'is-error',

    );

    resultEl.classList.remove(

      'result-display--long',

    );

    return;

  }

  const formatted =

    formatWithGrouping(

      displayState.result,

    );

  resultEl.textContent =

    formatted;

  resultEl.classList.remove(

    'is-error',

  );

  resultEl.classList.toggle(

    'result-display--long',

    formatted.length >

      LONG_NUMBER_THRESHOLD,

  );

}

// ============================================================

// 履歴表示

// ============================================================

function renderHistory() {

  const historyListEl =

    document.getElementById(

      'historyList',

    );

  if (!historyListEl) {

    return;

  }

  const entries =

    Calculator.getHistory();

  const fragment =

    document.createDocumentFragment();

  entries.forEach(

    (

      entry,

    ) => {

      const li =

        document.createElement(

          'li',

        );

      li.className =

        'history-item';

      li.textContent =

        groupNumbersInText(

          `${entry.expression} = ${entry.result}`,

        );

      fragment.appendChild(

        li,

      );

    },

  );

  historyListEl.replaceChildren(

    fragment,

  );

}

// ============================================================

// テーマ描画

// ============================================================

function updateMetaThemeColor(

  themeId,

) {

  const theme =

    getThemeById(

      themeId,

    );

  if (!theme) {

    return;

  }

  const metaEl =

    document.querySelector(

      'meta[name="theme-color"]',

    );

  if (metaEl) {

    metaEl.setAttribute(

      'content',

      theme.colorTokens.background,

    );

  }

}

function renderTheme() {

  const theme =

    Settings.getTheme();

  document.documentElement.dataset.theme =

    theme;

  updateMetaThemeColor(

    theme,

  );

  const themeSwitchEl =

    document.getElementById(

      'themeSwitch',

    );

  if (!themeSwitchEl) {

    return;

  }

  Array.from(

    themeSwitchEl.children,

  ).forEach(

    (

      button,

    ) => {

      const isActive =

        button.dataset.themeId ===

        theme;

      button.classList.toggle(

        'active',

        isActive,

      );

      button.setAttribute(

        'aria-checked',

        String(

          isActive,

        ),

      );

    },

  );

}

// ============================================================

// 設定画面描画

// ============================================================

function renderSettings() {

  const soundToggle =

    document.getElementById(

      'soundToggle',

    );

  if (soundToggle) {

    soundToggle.checked =

      Settings.isSoundEnabled();

  }

  const vibrationToggle =

    document.getElementById(

      'vibrationToggle',

    );

  if (vibrationToggle) {

    vibrationToggle.checked =

      Settings.isVibrationEnabled();

  }

  const biometricRow =

    document.getElementById(

      'biometricRow',

    );

  if (biometricRow) {

    biometricRow.hidden =

      !isBiometricSupported;

  }

  const biometricToggle =

    document.getElementById(

      'biometricToggle',

    );

  if (

    biometricToggle &&

    isBiometricSupported

  ) {

    biometricToggle.checked =

      Settings.isBiometricEnabled();

  }

  const autoLockSelect =

    document.getElementById(

      'autoLockDurationSelect',

    );

  if (autoLockSelect) {

    autoLockSelect.value =

      String(

        Settings.getAutoLockDurationMs(),

      );

  }

  const archiveLockToggle =

    document.getElementById(

      'archiveLockToggle',

    );

  if (archiveLockToggle) {

    archiveLockToggle.checked =

      Settings.isArchiveLockEnabled();

  }

  const notificationsToggle =

    document.getElementById(

      'notificationsToggle',

    );

  if (notificationsToggle) {

    notificationsToggle.checked =

      Settings.isNotificationsEnabled();

  }

  const notificationContentToggle =

    document.getElementById(

      'notificationContentToggle',

    );

  if (notificationContentToggle) {

    notificationContentToggle.checked =

      Settings.isNotificationContentEnabled();

  }

  const notificationSoundToggle =

    document.getElementById(

      'notificationSoundToggle',

    );

  if (notificationSoundToggle) {

    notificationSoundToggle.checked =

      Settings.isNotificationSoundEnabled();

  }

  const notificationVibrationToggle =

    document.getElementById(

      'notificationVibrationToggle',

    );

  if (notificationVibrationToggle) {

    notificationVibrationToggle.checked =

      Settings.isNotificationVibrationEnabled();

  }

  renderNotificationStatus();

  const readReceiptsToggle =

    document.getElementById(

      'readReceiptsToggle',

    );

  if (readReceiptsToggle) {

    readReceiptsToggle.checked =

      Settings.isReadReceiptsEnabled();

  }

  const onlineVisibilityToggle =

    document.getElementById(

      'onlineVisibilityToggle',

    );

  if (onlineVisibilityToggle) {

    onlineVisibilityToggle.checked =

      Settings.isOnlineVisibilityEnabled();

  }

  const organizeModeSelect =

    document.getElementById(

      'organizeModeSelect',

    );

  if (organizeModeSelect) {

    organizeModeSelect.value =

      Settings.getConversationOrganizeMode();

  }

  const organizeDurationSelect =

    document.getElementById(

      'organizeDurationSelect',

    );

  if (organizeDurationSelect) {

    organizeDurationSelect.value =

      String(

        Settings.getConversationOrganizeDurationMs(),

      );

  }

  renderStorageUsage();

  renderWorkspaceTitleInput();

  renderCardCustomizationList();

  renderBackgroundCustomizationList();

  const versionLabel =

    document.getElementById(

      'versionLabel',

    );

  if (versionLabel) {

    versionLabel.textContent =

      `Version ${Settings.getVersion()}`;

  }

}

// ============================================================

// Workspaceタイトル

// ============================================================

function renderWorkspaceTitleInput() {

  const input =

    document.getElementById(

      'workspaceTitleInput',

    );

  if (!input) {

    return;

  }

  input.value =

    Customization

      .getCached()

      .workspaceTitle ??

    '';

}

// ============================================================

// Workspaceカード設定

// ============================================================

function renderCardCustomizationList() {

  const list =

    document.getElementById(

      'cardCustomizationList',

    );

  if (!list) {

    return;

  }

  const cards =

    Customization.getEffectiveCards();

  const fragment =

    document.createDocumentFragment();

  cards.forEach(

    (

      card,

      index,

    ) => {

      const row =

        document.createElement(

          'div',

        );

      row.className =

        'card-edit-row';

      const iconInput =

        document.createElement(

          'input',

        );

      iconInput.type =

        'text';

      iconInput.className =

        'card-icon-input';

      iconInput.dataset.cardKey =

        card.key;

      iconInput.maxLength =

        4;

      iconInput.value =

        card.icon;

      iconInput.setAttribute(

        'aria-label',

        `${card.label}のアイコン`,

      );

      const labelInput =

        document.createElement(

          'input',

        );

      labelInput.type =

        'text';

      labelInput.className =

        'card-label-input';

      labelInput.dataset.cardKey =

        card.key;

      labelInput.maxLength =

        12;

      labelInput.value =

        card.label;

      labelInput.setAttribute(

        'aria-label',

        `${card.label}の表示名`,

      );

      const moveUpButton =

        document.createElement(

          'button',

        );

      moveUpButton.type =

        'button';

      moveUpButton.className =

        'card-move-btn';

      moveUpButton.dataset.action =

        'move-card-up';

      moveUpButton.dataset.cardKey =

        card.key;

      moveUpButton.disabled =

        index ===

        0;

      moveUpButton.setAttribute(

        'aria-label',

        `${card.label}を上へ`,

      );

      moveUpButton.textContent =

        '▲';

      const moveDownButton =

        document.createElement(

          'button',

        );

      moveDownButton.type =

        'button';

      moveDownButton.className =

        'card-move-btn';

      moveDownButton.dataset.action =

        'move-card-down';

      moveDownButton.dataset.cardKey =

        card.key;

      moveDownButton.disabled =

        index ===

        cards.length - 1;

      moveDownButton.setAttribute(

        'aria-label',

        `${card.label}を下へ`,

      );

      moveDownButton.textContent =

        '▼';

      row.appendChild(

        iconInput,

      );

      row.appendChild(

        labelInput,

      );

      row.appendChild(

        moveUpButton,

      );

      row.appendChild(

        moveDownButton,

      );

      fragment.appendChild(

        row,

      );

    },

  );

  list.replaceChildren(

    fragment,

  );

}

// ============================================================

// 背景カスタマイズ設定

// ============================================================

function renderBackgroundCustomizationList() {

  const list =

    document.getElementById(

      'backgroundCustomizationList',

    );

  if (!list) {

    return;

  }

  const backgrounds =

    Customization

      .getCached()

      .backgrounds ??

    {};

  const fragment =

    document.createDocumentFragment();

  Customization

    .CUSTOMIZABLE_SCREENS

    .forEach(

      (

        screen,

      ) => {

        const row =

          document.createElement(

            'div',

          );

        row.className =

          'settings-row settings-row-select';

        const textWrap =

          document.createElement(

            'div',

          );

        textWrap.className =

          'settings-row-text';

        const title =

          document.createElement(

            'span',

          );

        title.className =

          'settings-row-title';

        title.textContent =

          `${screen.label}の背景`;

        textWrap.appendChild(

          title,

        );

        const select =

          document.createElement(

            'select',

          );

        select.className =

          'settings-select bg-select';

        select.dataset.screen =

          screen.key;

        select.setAttribute(

          'aria-label',

          `${screen.label}の背景`,

        );

        Customization

          .BACKGROUND_PRESETS

          .forEach(

            (

              preset,

            ) => {

              const option =

                document.createElement(

                  'option',

                );

              option.value =

                preset.id;

              option.textContent =

                preset.label;

              select.appendChild(

                option,

              );

            },

          );

        select.value =

          backgrounds[

            screen.key

          ] ??

          'default';

        row.appendChild(

          textWrap,

        );

        row.appendChild(

          select,

        );

        fragment.appendChild(

          row,

        );

      },

    );

  list.replaceChildren(

    fragment,

  );

}

// ============================================================

// ストレージ使用量

// ============================================================

function renderStorageUsage() {

  const label =

    document.getElementById(

      'storageUsageLabel',

    );

  if (!label) {

    return;

  }

  const bytes =

    Storage.getUsageBytes();

  const kb =

    bytes /

    1024;

  label.textContent =

    `約${kb.toFixed(1)} KB`;

}

// ============================================================

// 通知状態

// ============================================================

function renderNotificationStatus() {

  const hint =

    document.getElementById(

      'notificationHomeScreenHint',

    );

  const statusLabel =

    document.getElementById(

      'notificationStatusLabel',

    );

  if (

    !hint ||

    !statusLabel

  ) {

    return;

  }

  const isStandalone =

    Notifications.isStandalonePwa();

  hint.hidden =

    isStandalone;

  if (!isStandalone) {

    statusLabel.textContent =

      '新着メッセージの通知（ホーム画面に追加すると使えます）';

    return;

  }

  const permission =

    Notifications.getPermissionState();

  if (

    permission ===

    'denied'

  ) {

    statusLabel.textContent =

      '通知がブロックされています。iPhoneの設定アプリから許可してください。';

    return;

  }

  if (

    permission ===

      'granted' &&

    Settings.isNotificationsEnabled()

  ) {

    statusLabel.textContent =

      '新着メッセージの通知（有効）';

    return;

  }

  statusLabel.textContent =

    '新着メッセージの通知';

}

// ============================================================

// 全体描画

// ============================================================

function render() {

  renderDisplay();

  renderHistory();

  renderTheme();

  renderSettings();

}

// ============================================================

// 設定画面 開閉

// ============================================================

function openSettings() {

  lastFocusedElement =

    document.activeElement;

  const overlay =

    document.getElementById(

      'settingsOverlay',

    );

  if (!overlay) {

    return;

  }

  renderSettings();

  overlay.classList.add(

    'is-open',

  );

  overlay.setAttribute(

    'aria-hidden',

    'false',

  );

  const closeButton =

    document.getElementById(

      'settingsCloseBtn',

    );

  if (closeButton) {

    closeButton.focus();

  }

}

function closeSettings() {

  const overlay =

    document.getElementById(

      'settingsOverlay',

    );

  if (!overlay) {

    return;

  }

  overlay.classList.remove(

    'is-open',

  );

  overlay.setAttribute(

    'aria-hidden',

    'true',

  );

  if (

    lastFocusedElement

      instanceof HTMLElement

  ) {

    lastFocusedElement.focus();

  }

}

// ============================================================

// 生体認証ロック

// ============================================================

function showLockOverlay() {

  const lockOverlay =

    document.getElementById(

      'lockOverlay',

    );

  if (!lockOverlay) {

    return;

  }

  lockOverlay.classList.add(

    'is-open',

  );

  lockOverlay.setAttribute(

    'aria-hidden',

    'false',

  );

}

function hideLockOverlay() {

  const lockOverlay =

    document.getElementById(

      'lockOverlay',

    );

  if (!lockOverlay) {

    return;

  }

  lockOverlay.classList.remove(

    'is-open',

  );

  lockOverlay.setAttribute(

    'aria-hidden',

    'true',

  );

}

// ============================================================

// Workspace

// ============================================================

function handleCloseWorkspace() {

  Router.closeWorkspace();

  passcodeBuffer =

    '';

  render();

}

function handleCloseRecords() {

  Router.closeRecords();

}

function handleLockNow() {

  Router.lockNow();

  passcodeBuffer =

    '';

  render();

}

function handleToggleViewMode() {

  if (

    Workspace.isViewModeActive()

  ) {

    Workspace.setViewModeActive(

      false,

    );

    Router.disableViewMode();

    return;

  }

  Workspace.showViewModeAuth();

}

function handleConfirmViewMode() {

  const value =

    Workspace.getViewModeAuthValue();

  if (

    Passcode.validate(

      value,

    )

  ) {

    playFeedbackSound(

      'success',

    );

    playFeedbackVibration();

    Workspace.hideViewModeAuth();

    Workspace.clearViewModeAuthInput();

    Workspace.setViewModeActive(

      true,

    );

    Router.enableViewMode();

    return;

  }

  playFeedbackSound(

    'error',

  );

  playFeedbackVibration();

  Workspace.clearViewModeAuthInput();

}

function handleCancelViewMode() {

  Workspace.hideViewModeAuth();

  Workspace.clearViewModeAuthInput();

}

function handleSendRecord() {

  const text =

    Records

      .getInputValue()

      .trim();

  if (!text) {

    return;

  }

  Records.saveToArchive(

    text,

  );

  Records.clearInput();

  playFeedbackSound(

    'success',

  );

  playFeedbackVibration();

}

const WORKSPACE_ACTION_HANDLERS =

  Object.freeze({

    'close-workspace':

      handleCloseWorkspace,

    'lock-now':

      handleLockNow,

    'toggle-view-mode':

      handleToggleViewMode,

    'confirm-view-mode':

      handleConfirmViewMode,

    'cancel-view-mode':

      handleCancelViewMode,

  });

function handleWorkspaceScreenClick(

  target,

) {

  const {

    action,

    secret,

  } =

    target.dataset;

  playFeedbackSound(

    'tap',

  );

  playFeedbackVibration();

  const handler =

    WORKSPACE_ACTION_HANDLERS[

      action

    ];

  if (handler) {

    handler();

    return;

  }

  if (

    secret ===

    'records'

  ) {

    Router.openRecords();

    return;

  }

  if (

    secret ===

    'calendar'

  ) {

    Router.openCalendar();

    return;

  }

  if (

    secret ===

    'archive'

  ) {

    Router.openArchive();

    return;

  }

  if (

    secret ===

    'messages'

  ) {

    handleOpenMessagesCard();

    return;

  }

  if (

    secret ===

    'photo'

  ) {

    Router.openPhoto();

    return;

  }

  if (

    secret ===

    'settings'

  ) {

    openSettings();

    return;

  }

}

function handleOpenMessagesCard() {

  const roomId =

    Firebase.getLocalRoomId();

  if (roomId) {

    Router.openMessages();

  } else {

    Router.openPairing();

  }

}

// ============================================================

// Records

// ============================================================

const RECORDS_ACTION_HANDLERS =

  Object.freeze({

    'close-records':

      handleCloseRecords,

    'lock-now':

      handleLockNow,

    'send-record':

      handleSendRecord,

  });

function handleRecordsScreenClick(

  target,

) {

  const {

    action,

  } =

    target.dataset;

  playFeedbackSound(

    'tap',

  );

  playFeedbackVibration();

  const handler =

    RECORDS_ACTION_HANDLERS[

      action

    ];

  if (handler) {

    handler();

  }

}

// ============================================================

// Calendar

// ============================================================

function handleCloseCalendar() {

  Router.closeCalendar();

}

function handlePrevMonth() {

  Calendar.goToPreviousMonth();

}

function handleNextMonth() {

  Calendar.goToNextMonth();

}

function handleSelectDate(

  target,

) {

  const {

    date,

  } =

    target.dataset;

  if (!date) {

    return;

  }

  Calendar.selectDate(

    date,

  );

}

function handleSaveNote() {

  const text =

    Calendar.getNoteInputValue();

  Calendar.saveNote(

    text,

  );

  playFeedbackSound(

    'success',

  );

  playFeedbackVibration();

}

function handleCancelNote() {

  Calendar.closeNoteEditor();

}

const CALENDAR_ACTION_HANDLERS =

  Object.freeze({

    'close-calendar':

      handleCloseCalendar,

    'lock-now':

      handleLockNow,

    'prev-month':

      handlePrevMonth,

    'next-month':

      handleNextMonth,

    'save-note':

      handleSaveNote,

    'cancel-note':

      handleCancelNote,

  });

function handleCalendarScreenClick(

  target,

) {

  const {

    action,

  } =

    target.dataset;

  playFeedbackSound(

    'tap',

  );

  playFeedbackVibration();

  if (

    action ===

    'select-date'

  ) {

    handleSelectDate(

      target,

    );

    return;

  }

  const handler =

    CALENDAR_ACTION_HANDLERS[

      action

    ];

  if (handler) {

    handler();

  }

}

// ============================================================

// Archive

// ============================================================

function handleCloseArchive() {

  Router.closeArchive();

}

function handleSelectBackground(

  target,

) {

  const {

    backgroundId,

  } =

    target.dataset;

  if (!backgroundId) {

    return;

  }

  Archive.selectBackground(

    backgroundId,

  );

}

function handleConfirmArchiveAuth() {

  const success =

    Archive.confirmAuth();

  playFeedbackSound(

    success

      ? 'success'

      : 'error',

  );

  playFeedbackVibration();

}

function handleCancelArchiveAuth() {

  Router.closeArchive();

}

const ARCHIVE_ACTION_HANDLERS =

  Object.freeze({

    'close-archive':

      handleCloseArchive,

    'lock-now':

      handleLockNow,

    'confirm-archive-auth':

      handleConfirmArchiveAuth,

    'cancel-archive-auth':

      handleCancelArchiveAuth,

  });

function handleArchiveScreenClick(

  target,

) {

  const {

    action,

  } =

    target.dataset;

  playFeedbackSound(

    'tap',

  );

  playFeedbackVibration();

  if (

    action ===

    'select-background'

  ) {

    handleSelectBackground(

      target,

    );

    return;

  }

  const handler =

    ARCHIVE_ACTION_HANDLERS[

      action

    ];

  if (handler) {

    handler();

  }

}

// ============================================================

// Pairing

// ============================================================

function handleClosePairing() {

  Router.closePairing();

}

function handleSaveDisplayName() {

  const name =

    Pairing.getDisplayNameInputValue();

  if (!name) {

    return;

  }

  Pairing.saveDisplayName(

    name,

  );

  Pairing.showChoicePanel();

}

function handleChooseGenerate() {

  Pairing.showGeneratePanel();

  Pairing

    .generateInvite()

    .catch(

      (

        error,

      ) => {

        console.error(

          '[app.js] 招待コードの発行に失敗しました',

          error,

        );

      },

    );

}

function handleChooseJoin() {

  Pairing.showJoinPanel();

}

function handleBackToChoice() {

  Pairing.backToChoice();

}

async function handleSubmitJoinCode() {

  try {

    await Pairing.submitJoinCode();

    playFeedbackSound(

      'success',

    );

    playFeedbackVibration();

  } catch (error) {

    playFeedbackSound(

      'error',

    );

    playFeedbackVibration();

    Pairing.showJoinError(

      error.message ||

      '参加に失敗しました。',

    );

  }

}

const PAIRING_ACTION_HANDLERS =

  Object.freeze({

    'close-pairing':

      handleClosePairing,

    'lock-now':

      handleLockNow,

    'save-display-name':

      handleSaveDisplayName,

    'choose-generate':

      handleChooseGenerate,

    'choose-join':

      handleChooseJoin,

    'back-to-choice':

      handleBackToChoice,

    'submit-join-code':

      handleSubmitJoinCode,

  });

function handlePairingScreenClick(

  target,

) {

  const {

    action,

  } =

    target.dataset;

  playFeedbackSound(

    'tap',

  );

  playFeedbackVibration();

  const handler =

    PAIRING_ACTION_HANDLERS[

      action

    ];

  if (handler) {

    handler();

  }

}

// ============================================================

// Messages

// ============================================================

function handleCloseMessages() {

  Router.closeMessages();

}

function handleSendMessage() {

  Messages

    .sendMessage()

    .catch(

      (

        error,

      ) => {

        console.error(

          '[app.js] メッセージの送信に失敗しました',

          error,

        );

      },

    );

}

function handleCopyMessage() {

  Messages

    .copySelectedMessage()

    .catch(

      (

        error,

      ) => {

        console.error(

          '[app.js] メッセージのコピーに失敗しました',

          error,

        );

      },

    );

}

function handleDeleteMessage() {

  Messages

    .deleteSelectedMessage()

    .catch(

      (

        error,

      ) => {

        console.error(

          '[app.js] メッセージの削除に失敗しました',

          error,

        );

      },

    );

}

function handleCancelActionSheet() {

  Messages.closeActionSheet();

}

function handleReactToMessage(

  target,

) {

  const {

    emoji,

  } =

    target.dataset;

  if (!emoji) {

    return;

  }

  Messages.reactToSelectedMessage(

    emoji,

  );

}

const MESSAGES_ACTION_HANDLERS =

  Object.freeze({

    'close-messages':

      handleCloseMessages,

    'lock-now':

      handleLockNow,

    'send-message':

      handleSendMessage,

    'copy-message':

      handleCopyMessage,

    'delete-message':

      handleDeleteMessage,

    'cancel-action-sheet':

      handleCancelActionSheet,

  });

function handleMessagesScreenClick(

  target,

) {

  const {

    action,

  } =

    target.dataset;

  playFeedbackSound(

    'tap',

  );

  playFeedbackVibration();

  if (

    action ===

    'react'

  ) {

    handleReactToMessage(

      target,

    );

    return;

  }

  const handler =

    MESSAGES_ACTION_HANDLERS[

      action

    ];

  if (handler) {

    handler();

  }

}

// ============================================================

// Photo

// ============================================================

function handleClosePhoto() {

  Router.closePhoto();

}

function handleSelectPhoto() {

  Photo.selectPhotos();

}

function handleOpenPhotoPreview(

  target,

) {

  Photo.openPreviewFromTarget(

    target,

  );

}

function handleClosePhotoPreview() {

  Photo.closePreview();

}

async function handleDeleteLocalPhoto(

  target,

) {

  await Photo.deletePhotoFromTarget(

    target,

  );

}

async function handleDeleteSharedPhoto(

  target,

) {

  await Photo.deleteSharedPhotoFromTarget(

    target,

  );

}

const PHOTO_ACTION_HANDLERS =

  Object.freeze({

    'close-photo':

      handleClosePhoto,

    'lock-now':

      handleLockNow,

    'select-photo':

      handleSelectPhoto,

    'close-photo-preview':

      handleClosePhotoPreview,

    'delete-photo':

      handleDeleteLocalPhoto,

    'delete-shared-photo':

      handleDeleteSharedPhoto,

  });

function handlePhotoScreenClick(

  target,

) {

  const {

    action,

  } =

    target.dataset;

  playFeedbackSound(

    'tap',

  );

  playFeedbackVibration();

  if (

    action ===

    'open-photo-preview'

  ) {

    handleOpenPhotoPreview(

      target,

    );

    return;

  }

  const handler =

    PHOTO_ACTION_HANDLERS[

      action

    ];

  if (!handler) {

    return;

  }

  Promise.resolve(

    handler(

      target,

    ),

  ).catch(

    (

      error,

    ) => {

      console.error(

        '[app.js] Photo操作に失敗しました',

        error,

      );

    },

  );

}

// ============================================================

// Archive検索

// ============================================================

function handleArchiveSearchInput(

  query,

) {

  Archive.search(

    query,

  );

}

// ============================================================

// 履歴・データ管理

// ============================================================

function handleClearHistory() {

  try {

    Calculator.clearHistory();

  } catch (error) {

    console.error(

      '[app.js] 履歴の削除に失敗しました',

      error,

    );

  }

}

async function handleClearCache() {

  try {

    if (

      !(

        'caches' in

        window

      )

    ) {

      return;

    }

    const cacheNames =

      await caches.keys();

    await Promise.all(

      cacheNames.map(

        (

          name,

        ) =>

          caches.delete(

            name,

          ),

      ),

    );

    playFeedbackSound(

      'success',

    );

    playFeedbackVibration();

  } catch (error) {

    console.error(

      '[app.js] キャッシュの削除に失敗しました',

      error,

    );

    playFeedbackSound(

      'error',

    );

    playFeedbackVibration();

  }

}

async function handleDeleteAllMyMessages() {

  const roomId =

    Firebase.getLocalRoomId();

  const uid =

    Firebase.getCurrentUid();

  if (

    !roomId ||

    !uid

  ) {

    return;

  }

  try {

    await Firebase.deleteAllOwnMessages(

      roomId,

      uid,

    );

    playFeedbackSound(

      'success',

    );

    playFeedbackVibration();

  } catch (error) {

    console.error(

      '[app.js] メッセージの一括削除に失敗しました',

      error,

    );

    playFeedbackSound(

      'error',

    );

    playFeedbackVibration();

  }

}

function handleClearArchiveData() {

  try {

    Records.clearArchive();

    renderStorageUsage();

    playFeedbackSound(

      'success',

    );

    playFeedbackVibration();

  } catch (error) {

    console.error(

      '[app.js] Archiveデータの削除に失敗しました',

      error,

    );

    playFeedbackSound(

      'error',

    );

    playFeedbackVibration();

  }

}

// ============================================================

// Workspaceカスタマイズ

// ============================================================

async function handleMoveCardUp(

  target,

) {

  const {

    cardKey,

  } =

    target.dataset;

  if (!cardKey) {

    return;

  }

  await swapCardOrder(

    cardKey,

    -1,

  );

}

async function handleMoveCardDown(

  target,

) {

  const {

    cardKey,

  } =

    target.dataset;

  if (!cardKey) {

    return;

  }

  await swapCardOrder(

    cardKey,

    1,

  );

}

async function swapCardOrder(

  cardKey,

  direction,

) {

  const cards =

    Customization.getEffectiveCards();

  const currentIndex =

    cards.findIndex(

      (

        card,

      ) =>

        card.key ===

        cardKey,

    );

  const targetIndex =

    currentIndex +

    direction;

  if (

    currentIndex ===

      -1 ||

    targetIndex <

      0 ||

    targetIndex >=

      cards.length

  ) {

    return;

  }

  try {

    await Customization.updateCardOrder({

      [cards[

        currentIndex

      ].key]:

        targetIndex,

      [cards[

        targetIndex

      ].key]:

        currentIndex,

    });

    playFeedbackSound(

      'tap',

    );

    playFeedbackVibration();

  } catch (error) {

    console.error(

      '[app.js] カードの並び替えに失敗しました',

      error,

    );

    playFeedbackSound(

      'error',

    );

    playFeedbackVibration();

  }

}

async function handleResetCustomization() {

  const confirmed =

    window.confirm(

      'カード名・アイコン・並び順・Workspaceタイトル・背景を、すべて初期状態に戻します。よろしいですか？',

    );

  if (!confirmed) {

    return;

  }

  try {

    await Customization.resetAll();

    playFeedbackSound(

      'success',

    );

    playFeedbackVibration();

  } catch (error) {

    console.error(

      '[app.js] カスタマイズのリセットに失敗しました',

      error,

    );

    playFeedbackSound(

      'error',

    );

    playFeedbackVibration();

  }

}

// ============================================================

// 履歴パネル

// ============================================================

function toggleHistoryPanel() {

  const panel =

    document.getElementById(

      'historyPanel',

    );

  const button =

    document.getElementById(

      'historyToggleBtn',

    );

  if (

    !panel ||

    !button

  ) {

    return;

  }

  const isExpanded =

    panel.classList.toggle(

      'is-expanded',

    );

  panel.hidden =

    !isExpanded;

  button.setAttribute(

    'aria-expanded',

    String(

      isExpanded,

    ),

  );

  button.setAttribute(

    'aria-label',

    isExpanded

      ? '履歴を隠す'

      : '履歴を表示',

  );

}

// ============================================================

// テーマ変更

// ============================================================

function handleSelectTheme(

  target,

) {

  const {

    themeId,

  } =

    target.dataset;

  if (!themeId) {

    return;

  }

  try {

    Settings.setTheme(

      themeId,

    );

  } catch (error) {

    console.error(

      '[app.js] テーマの変更に失敗しました',

      error,

    );

  }

}

// ============================================================

// 生体認証

// ============================================================

async function handleRetryAuth() {

  try {

    const success =

      await Auth.authenticate();

    if (success) {

      hideLockOverlay();

    }

  } catch (error) {

    console.error(

      '[app.js] 再認証中にエラーが発生しました',

      error,

    );

  }

}

// ============================================================

// 共通 data-action

// ============================================================

const ACTION_HANDLERS =

  Object.freeze({

    'open-settings':

      openSettings,

    'close-settings':

      closeSettings,

    'clear-history':

      handleClearHistory,

    'select-theme':

      handleSelectTheme,

    'retry-auth':

      handleRetryAuth,

    'toggle-history':

      toggleHistoryPanel,

    'clear-cache':

      handleClearCache,

    'delete-all-my-messages':

      handleDeleteAllMyMessages,

    'clear-archive-data':

      handleClearArchiveData,

    'move-card-up':

      handleMoveCardUp,

    'move-card-down':

      handleMoveCardDown,

    'reset-customization':

      handleResetCustomization,

  });

// ============================================================

// Calculator 数字入力

// ============================================================

function handleDigitInput(

  digit,

) {

  let shouldRender =

    true;

  try {

    dispatchToCalculator(

      CALC_ACTIONS.DIGIT,

      digit,

    );

    const displayState =

      Calculator.getDisplayState();

    playFeedbackSound(

      displayState.isError

        ? 'error'

        : 'tap',

    );

    playFeedbackVibration();

    passcodeBuffer +=

      digit;

    const passcode =

      Passcode.getPasscode();

    if (

      passcodeBuffer.length ===

      passcode.length

    ) {

      if (

        Passcode.validate(

          passcodeBuffer,

        )

      ) {

        Router.openWorkspace();

        passcodeBuffer =

          '';

        shouldRender =

          false;

        return;

      }

    }

  } catch (error) {

    console.error(

      '[app.js] 数字入力の処理に失敗しました',

      error,

    );

  } finally {

    if (shouldRender) {

      render();

    }

  }

}

// ============================================================

// Calculator 操作入力

// ============================================================

function handleCalculatorAction(

  action,

) {

  if (

    PASSCODE_RESET_ACTIONS.has(

      action,

    )

  ) {

    passcodeBuffer =

      '';

  }

  try {

    dispatchToCalculator(

      action,

    );

    const displayState =

      Calculator.getDisplayState();

    let feedbackKind =

      'tap';

    if (

      displayState.isError

    ) {

      feedbackKind =

        'error';

    } else if (

      action ===

      CALC_ACTIONS.EQUALS

    ) {

      feedbackKind =

        'success';

    }

    playFeedbackSound(

      feedbackKind,

    );

    playFeedbackVibration();

    const willRerenderViaHistorySubscription =

      action ===

        CALC_ACTIONS.EQUALS &&

      !displayState.isError;

    if (

      !willRerenderViaHistorySubscription

    ) {

      render();

    }

  } catch (error) {

    console.error(

      '[app.js] 電卓操作の処理に失敗しました',

      error,

    );

    render();

  }

}

// ============================================================

// documentクリック

// ============================================================

function handleDocumentClick(

  event,

) {

  if (

    !(

      event.target instanceof

      Element

    )

  ) {

    return;

  }

  const target =

    event.target.closest(

      '[data-action], [data-num], [data-secret]',

    );

  if (!target) {

    return;

  }

  const settingsOverlay =

    document.getElementById(

      'settingsOverlay',

    );

  if (

    settingsOverlay &&

    settingsOverlay.classList.contains(

      'is-open',

    ) &&

    target.closest(

      '#settingsOverlay',

    )

  ) {

    const {

      action,

    } =

      target.dataset;

    const settingsHandler =

      ACTION_HANDLERS[

        action

      ];

    if (settingsHandler) {

      playFeedbackSound(

        'tap',

      );

      playFeedbackVibration();

      settingsHandler(

        target,

        event,

      );

    }

    return;

  }

  const currentScreen =

    Router.getCurrentScreen();

  if (

    currentScreen ===

    Router.Screen.RECORDS

  ) {

    handleRecordsScreenClick(

      target,

    );

    return;

  }

  if (

    currentScreen ===

    Router.Screen.CALENDAR

  ) {

    handleCalendarScreenClick(

      target,

    );

    return;

  }

  if (

    currentScreen ===

    Router.Screen.ARCHIVE

  ) {

    handleArchiveScreenClick(

      target,

    );

    return;

  }

  if (

    currentScreen ===

    Router.Screen.PAIRING

  ) {

    handlePairingScreenClick(

      target,

    );

    return;

  }

  if (

    currentScreen ===

    Router.Screen.MESSAGES

  ) {

    handleMessagesScreenClick(

      target,

    );

    return;

  }

  if (

    currentScreen ===

    Router.Screen.PHOTO

  ) {

    handlePhotoScreenClick(

      target,

    );

    return;

  }

  if (

    currentScreen ===

    Router.Screen.WORKSPACE

  ) {

    handleWorkspaceScreenClick(

      target,

    );

    return;

  }

  const {

    action,

    num,

  } =

    target.dataset;

  if (

    num !==

    undefined

  ) {

    handleDigitInput(

      num,

    );

    return;

  }

  if (

    CALCULATOR_ACTIONS.has(

      action,

    )

  ) {

    handleCalculatorAction(

      action,

    );

    return;

  }

  const handler =

    ACTION_HANDLERS[

      action

    ];

  if (handler) {

    playFeedbackSound(

      'tap',

    );

    playFeedbackVibration();

    handler(

      target,

      event,

    );

  }

}

// ============================================================

// inputイベント

// ============================================================

function handleDocumentInput(

  event,

) {

  const target =

    event.target;

  if (

    !(

      target instanceof

      HTMLInputElement

    ) &&

    !(

      target instanceof

      HTMLTextAreaElement

    )

  ) {

    return;

  }

  if (

    target.id ===

    'archiveSearchInput'

  ) {

    handleArchiveSearchInput(

      target.value,

    );

    return;

  }

  if (

    target.id ===

    'messagesInput'

  ) {

    Messages.notifyTyping();

    Messages.autoResizeInput();

  }

}

// ============================================================

// 設定変更

// ============================================================

function handleSettingsChange(

  event,

) {

  const target =

    event.target;

  if (

    target instanceof

      HTMLInputElement &&

    target.type ===

      'checkbox'

  ) {

    handleSettingsCheckboxChange(

      target,

    );

    return;

  }

  if (

    target instanceof

      HTMLInputElement &&

    target.type ===

      'text'

  ) {

    handleSettingsTextInputChange(

      target,

    );

    return;

  }

  if (

    target instanceof

    HTMLSelectElement

  ) {

    handleSettingsSelectChange(

      target,

    );

  }

}

function handleSettingsCheckboxChange(

  target,

) {

  const checked =

    target.checked;

  switch (

    target.id

  ) {

    case 'soundToggle':

      Settings.setSoundEnabled(

        checked,

      );

      break;

    case 'vibrationToggle':

      Settings.setVibrationEnabled(

        checked,

      );

      break;

    case 'biometricToggle':

      handleBiometricToggle(

        checked,

      );

      break;

    case 'archiveLockToggle':

      Settings.setArchiveLockEnabled(

        checked,

      );

      break;

    case 'notificationsToggle':

      handleNotificationsToggle(

        checked,

      );

      break;

    case 'notificationContentToggle':

      Settings.setNotificationContentEnabled(

        checked,

      );

      Notifications

        .syncNotificationContentPreference(

          checked,

        )

        .catch(

          (

            error,

          ) => {

            console.warn(

              '[app.js] 通知内容表示設定の同期に失敗しました',

              error,

            );

          },

        );

      break;

    case 'notificationSoundToggle':

      Settings.setNotificationSoundEnabled(

        checked,

      );

      break;

    case 'notificationVibrationToggle':

      Settings.setNotificationVibrationEnabled(

        checked,

      );

      break;

    case 'readReceiptsToggle':

      Settings.setReadReceiptsEnabled(

        checked,

      );

      break;

    case 'onlineVisibilityToggle':

      Settings.setOnlineVisibilityEnabled(

        checked,

      );

      break;

    default:

      break;

  }

}

function handleSettingsSelectChange(

  target,

) {

  if (

    target.classList.contains(

      'bg-select',

    )

  ) {

    const {

      screen,

    } =

      target.dataset;

    if (!screen) {

      return;

    }

    Customization

      .updateBackground(

        screen,

        target.value,

      )

      .catch(

        (

          error,

        ) => {

          console.error(

            '[app.js] 背景の保存に失敗しました',

            error,

          );

        },

      );

    return;

  }

  switch (

    target.id

  ) {

    case 'autoLockDurationSelect':

      Settings.setAutoLockDurationMs(

        Number(

          target.value,

        ),

      );

      break;

    case 'organizeModeSelect':

      Settings.setConversationOrganizeMode(

        target.value,

      );

      break;

    case 'organizeDurationSelect':

      Settings.setConversationOrganizeDurationMs(

        Number(

          target.value,

        ),

      );

      break;

    default:

      break;

  }

}

function handleSettingsTextInputChange(

  target,

) {

  if (

    target.id ===

    'workspaceTitleInput'

  ) {

    Customization

      .updateWorkspaceTitle(

        target.value,

      )

      .catch(

        (

          error,

        ) => {

          console.error(

            '[app.js] Workspaceタイトルの保存に失敗しました',

            error,

          );

        },

      );

    return;

  }

  if (

    target.classList.contains(

      'card-icon-input',

    ) ||

    target.classList.contains(

      'card-label-input',

    )

  ) {

    const {

      cardKey,

    } =

      target.dataset;

    if (!cardKey) {

      return;

    }

    const changes =

      target.classList.contains(

        'card-icon-input',

      )

        ? {

            icon:

              target.value,

          }

        : {

            label:

              target.value,

          };

    Customization

      .updateCard(

        cardKey,

        changes,

      )

      .catch(

        (

          error,

        ) => {

          console.error(

            '[app.js] カードの保存に失敗しました',

            error,

          );

        },

      );

  }

}

// ============================================================

// 生体認証設定

// ============================================================

async function handleBiometricToggle(

  enabled,

) {

  if (!enabled) {

    Settings.setBiometricEnabled(

      false,

    );

    Auth.lock();

    return;

  }

  try {

    const success =

      await Auth.register();

    if (success) {

      Settings.setBiometricEnabled(

        true,

      );

      return;

    }

  } catch (error) {

    console.error(

      '[app.js] 生体認証の登録に失敗しました',

      error,

    );

  }

  render();

}

// ============================================================

// 通知設定

// ============================================================

async function handleNotificationsToggle(

  enabled,

) {

  if (!enabled) {

    Settings.setNotificationsEnabled(

      false,

    );

    Notifications

      .disableRegistration()

      .catch(

        (

          error,

        ) => {

          console.warn(

            '[app.js] 通知登録の無効化に失敗しました',

            error,

          );

        },

      );

    renderNotificationStatus();

    return;

  }

  try {

    await Notifications.requestPermissionAndRegister();

    Settings.setNotificationsEnabled(

      true,

    );

    renderNotificationStatus();

    return;

  } catch (error) {

    console.warn(

      '[app.js] 通知の許可取得に失敗しました',

      error,

    );

  }

  render();

}

// ============================================================

// キーボード

// ============================================================

function handleKeyDown(

  event,

) {

  const lockOverlay =

    document.getElementById(

      'lockOverlay',

    );

  const isLockOpen =

    lockOverlay &&

    lockOverlay.classList.contains(

      'is-open',

    );

  if (isLockOpen) {

    if (

      event.key ===

      'Tab'

    ) {

      trapFocus(

        event,

        lockOverlay,

      );

    }

    return;

  }

  const overlay =

    document.getElementById(

      'settingsOverlay',

    );

  if (

    !overlay ||

    !overlay.classList.contains(

      'is-open',

    )

  ) {

    return;

  }

  if (

    event.key ===

    'Escape'

  ) {

    closeSettings();

    return;

  }

  if (

    event.key ===

    'Tab'

  ) {

    trapFocus(

      event,

      overlay,

    );

  }

}

function trapFocus(

  event,

  container,

) {

  const focusable =

    container.querySelectorAll(

      FOCUSABLE_SELECTOR,

    );

  if (

    focusable.length ===

    0

  ) {

    return;

  }

  const first =

    focusable[

      0

    ];

  const last =

    focusable[

      focusable.length -

      1

    ];

  if (

    event.shiftKey &&

    document.activeElement ===

      first

  ) {

    event.preventDefault();

    last.focus();

  } else if (

    !event.shiftKey &&

    document.activeElement ===

      last

  ) {

    event.preventDefault();

    first.focus();

  }

}

// ============================================================

// キーパッド押下

// ============================================================

function clearPressedTimeout(

  target,

) {

  const timeoutId =

    pressedTimeouts.get(

      target,

    );

  if (

    timeoutId !==

    undefined

  ) {

    window.clearTimeout(

      timeoutId,

    );

    pressedTimeouts.delete(

      target,

    );

  }

}

function handleKeypadPointerDown(

  event,

) {

  if (

    !(

      event.target instanceof

      Element

    )

  ) {

    return;

  }

  const target =

    event.target.closest(

      '.key',

    );

  if (!target) {

    return;

  }

  clearPressedTimeout(

    target,

  );

  target.classList.add(

    'pressed',

  );

  const timeoutId =

    window.setTimeout(

      () => {

        target.classList.remove(

          'pressed',

        );

        pressedTimeouts.delete(

          target,

        );

      },

      PRESSED_CLASS_TIMEOUT,

    );

  pressedTimeouts.set(

    target,

    timeoutId,

  );

}

function handleKeypadPointerUp(

  event,

) {

  if (

    !(

      event.target instanceof

      Element

    )

  ) {

    return;

  }

  const target =

    event.target.closest(

      '.key',

    );

  if (!target) {

    return;

  }

  clearPressedTimeout(

    target,

  );

  target.classList.remove(

    'pressed',

  );

}

// ============================================================

// 設定 × ボタン

// ============================================================

function registerSettingsCloseButton() {

  const settingsCloseBtn =

    document.getElementById(

      'settingsCloseBtn',

    );

  if (!settingsCloseBtn) {

    console.warn(

      '[app.js] settingsCloseBtnが見つかりませんでした',

    );

    return;

  }

  settingsCloseBtn.addEventListener(

    'click',

    (

      event,

    ) => {

      event.preventDefault();

      event.stopPropagation();

      playFeedbackSound(

        'tap',

      );

      playFeedbackVibration();

      closeSettings();

    },

  );

}

// ============================================================

// イベント登録

// ============================================================

function registerEventListeners() {

  document.addEventListener(

    'click',

    handleDocumentClick,

  );

  document.addEventListener(

    'keydown',

    handleKeyDown,

  );

  document.addEventListener(

    'input',

    handleDocumentInput,

  );

  const settingsBody =

    document.querySelector(

      '.settings-body',

    );

  if (settingsBody) {

    settingsBody.addEventListener(

      'change',

      handleSettingsChange,

    );

  }

  const keypadEl =

    document.getElementById(

      'keypad',

    );

  if (keypadEl) {

    keypadEl.addEventListener(

      'pointerdown',

      handleKeypadPointerDown,

    );

    keypadEl.addEventListener(

      'pointerup',

      handleKeypadPointerUp,

    );

    keypadEl.addEventListener(

      'pointercancel',

      handleKeypadPointerUp,

    );

  }

  registerSettingsCloseButton();

}

// ============================================================

// Storage購読

// ============================================================

function subscribeToStorageChanges() {

  Storage.subscribe(

    STORAGE_KEYS.THEME,

    render,

  );

  Storage.subscribe(

    STORAGE_KEYS.HISTORY,

    render,

  );

  Storage.subscribe(

    STORAGE_KEYS.SOUND_ENABLED,

    render,

  );

  Storage.subscribe(

    STORAGE_KEYS.VIBRATION_ENABLED,

    render,

  );

  Storage.subscribe(

    STORAGE_KEYS.BIOMETRIC_ENABLED,

    render,

  );

}

// ============================================================

// Service Worker

// ============================================================

function registerServiceWorker() {

  if (

    !(

      'serviceWorker' in

      navigator

    )

  ) {

    return;

  }

  const swUrl =

    new URL(

      'service-worker.js',

      document.baseURI,

    );

  window.addEventListener(

    'load',

    () => {

      navigator

        .serviceWorker

        .register(

          swUrl,

        )

        .catch(

          (

            error,

          ) => {

            console.warn(

              '[app.js] Service Workerの登録に失敗しました',

              error,

            );

          },

        );

    },

  );

  navigator

    .serviceWorker

    .addEventListener(

      'message',

      handleServiceWorkerMessage,

    );

}

function handleServiceWorkerMessage(

  event,

) {

  const message =

    event.data;

  if (

    !message ||

    typeof message.type !==

      'string'

  ) {

    return;

  }

  if (

    message.type ===

    'calculator-0209-notification-click'

  ) {

    console.info(

      '[app.js] 通知がタップされました',

      message.roomId,

    );

    return;

  }

  if (

    message.type ===

      'calculator-0209-push-subscription-changed' ||

    message.type ===

      'PUSH_SUBSCRIPTION_CHANGED'

  ) {

    Notifications

      .syncRegistrationOnStartup()

      .catch(

        (

          error,

        ) => {

          console.warn(

            '[app.js] プッシュ購読変更後の再登録に失敗しました',

            error,

          );

        },

      );

  }

}

// ============================================================

// 終了処理

// ============================================================

function handleVisibilityChange() {

  if (

    document.visibilityState ===

    'hidden'

  ) {

    Sound.stopAll();

  }

}

function handlePageHide() {

  Sound.stopAll();

  Sound.destroy()

    .catch(

      (

        error,

      ) => {

        console.warn(

          '[app.js] Sound.destroy()に失敗しました',

          error,

        );

      },

    );

}

function handleBeforeUnload() {

  Sound.stopAll();

}

function registerTeardownHandlers() {

  document.addEventListener(

    'visibilitychange',

    handleVisibilityChange,

  );

  window.addEventListener(

    'pagehide',

    handlePageHide,

  );

  window.addEventListener(

    'beforeunload',

    handleBeforeUnload,

  );

}

// ============================================================

// 生体認証起動フロー

// ============================================================

async function runBiometricLockFlow() {

  if (

    !isBiometricSupported ||

    !Settings.isBiometricEnabled()

  ) {

    return;

  }

  showLockOverlay();

  try {

    const success =

      await Auth.authenticate();

    if (success) {

      hideLockOverlay();

    }

  } catch (error) {

    console.error(

      '[app.js] 起動時の生体認証に失敗しました',

      error,

    );

  }

}

function withTimeout(

  promise,

  timeoutMs,

) {

  return Promise.race([

    promise,

    new Promise(

      (

        resolve,

      ) => {

        window.setTimeout(

          () =>

            resolve(

              false,

            ),

          timeoutMs,

        );

      },

    ),

  ]);

}

// ============================================================

// 初期化

// ============================================================

async function init() {

  try {

    // --------------------------------------------------------

    // 1. UI構築

    // --------------------------------------------------------

    buildKeypad();

    buildThemeOptions();

    buildDurationSelectOptions();

    // --------------------------------------------------------

    // 2. 各画面構築

    // --------------------------------------------------------

    Router.init();

    // --------------------------------------------------------

    // 3. ペアリング完了時

    // --------------------------------------------------------

    Pairing.setOnPaired(

      () => {

        Router.completePairing();

        Customization.start();

        Notifications

          .syncAfterPairing()

          .catch(

            (

              error,

            ) => {

              console.warn(

                '[app.js] ペアリング後の通知同期に失敗しました',

                error,

              );

            },

          );

      },

    );

    // --------------------------------------------------------

    // 4. カスタマイズ初期化

    // --------------------------------------------------------

    Customization.start();

    Customization.subscribe(

      () => {

        renderWorkspaceTitleInput();

        renderCardCustomizationList();

        renderBackgroundCustomizationList();

      },

    );

    // --------------------------------------------------------

    // 5. イベント登録

    // --------------------------------------------------------

    registerEventListeners();

    registerTeardownHandlers();

    // --------------------------------------------------------

    // 6. Storage購読

    // --------------------------------------------------------

    subscribeToStorageChanges();

    // --------------------------------------------------------

    // 7. 初回描画

    // --------------------------------------------------------

    render();

    // --------------------------------------------------------

    // 8. 生体認証

    // --------------------------------------------------------

    isBiometricSupported =

      await withTimeout(

        Auth.isSupported(),

        3000,

      );

    render();

    await runBiometricLockFlow();

    // --------------------------------------------------------

    // 9. Service Worker

    // --------------------------------------------------------

    registerServiceWorker();

    // --------------------------------------------------------

    // 10. 通知

    // --------------------------------------------------------

    Notifications.init();

    Notifications

      .syncRegistrationOnStartup()

      .catch(

        (

          error,

        ) => {

          console.warn(

            '[app.js] 起動時の通知同期に失敗しました',

            error,

          );

        },

      );

    Notifications

      .initForegroundListener()

      .catch(

        (

          error,

        ) => {

          console.warn(

            '[app.js] フォアグラウンド通知初期化に失敗しました',

            error,

          );

        },

      );

  } catch (error) {

    console.error(

      '[app.js] 初期化中にエラーが発生しました',

      error,

    );

    try {

      render();

    } catch (

      renderError

    ) {

      console.error(

        '[app.js] エラー後の再描画にも失敗しました',

        renderError,

      );

    }

  }

}

// ============================================================

// 起動

// ============================================================

document.addEventListener(

  'DOMContentLoaded',

  init,

);