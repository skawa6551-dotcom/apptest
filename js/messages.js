// ============================================================

// messages.js

// メッセージ画面のDOM生成・表示/非表示・送受信・既読・リアクション・

// 長押しメニュー・入力欄制御・背景カスタマイズ反映を担当する。

// ============================================================

import Firebase from './firebase.js';

import Settings from './settings.js';

import Customization from './customization.js';

// ------------------------------------------------------------

// 定数

// ------------------------------------------------------------

const CONTAINER_ID = 'messages';

const LONG_PRESS_MS = 500;

// ------------------------------------------------------------

// 状態

// ------------------------------------------------------------

let isBuilt = false;

let unsubscribeMessages = null;

let unsubscribeCustomization = null;

let selectedMessageId = null;

let selectedMessageData = null;

let longPressTimer = null;

let typingTimer = null;

// ------------------------------------------------------------

// DOM取得

// ------------------------------------------------------------

function getContainer() {

  return document.getElementById(

    CONTAINER_ID,

  );

}

// ------------------------------------------------------------

// 背景反映

// ------------------------------------------------------------

function renderBackground() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  const presetId =

    Customization

      .getCached()

      .backgrounds

      ?.messages;

  Customization.applyBackgroundClass(

    container,

    'messages',

    presetId,

  );

  /*

   * iPhone PWAで背景クラス変更直後の再描画が遅れる場合の補助。

   */

  container.style.display =

    container.classList.contains(

      'is-open',

    )

      ? 'flex'

      : '';

  window.requestAnimationFrame(

    () => {

      container.style.display =

        '';

    },

  );

}

// ------------------------------------------------------------

// ヘッダー生成

// ------------------------------------------------------------

function createHeader() {

  const header =

    document.createElement(

      'header',

    );

  header.className =

    'messages-header';

  const backButton =

    document.createElement(

      'button',

    );

  backButton.type =

    'button';

  backButton.className =

    'icon-btn';

  backButton.dataset.action =

    'close-messages';

  backButton.setAttribute(

    'aria-label',

    '戻る',

  );

  backButton.textContent =

    '‹';

  const title =

    document.createElement(

      'h2',

    );

  title.className =

    'messages-title';

  title.textContent =

    'メッセージ';

  const lockButton =

    document.createElement(

      'button',

    );

  lockButton.type =

    'button';

  lockButton.className =

    'icon-btn';

  lockButton.dataset.action =

    'lock-now';

  lockButton.setAttribute(

    'aria-label',

    '今すぐロック',

  );

  lockButton.textContent =

    '🔒';

  header.appendChild(

    backButton,

  );

  header.appendChild(

    title,

  );

  header.appendChild(

    lockButton,

  );

  return header;

}

// ------------------------------------------------------------

// メッセージ一覧生成

// ------------------------------------------------------------

function createMessageList() {

  const list =

    document.createElement(

      'div',

    );

  list.id =

    'messagesList';

  list.className =

    'messages-list';

  return list;

}

// ------------------------------------------------------------

// 入力エリア生成

// ------------------------------------------------------------

function createComposer() {

  const composer =

    document.createElement(

      'div',

    );

  composer.className =

    'messages-composer';

  const textarea =

    document.createElement(

      'textarea',

    );

  textarea.id =

    'messagesInput';

  textarea.className =

    'messages-input';

  textarea.rows =

    1;

  textarea.maxLength =

    2000;

  textarea.placeholder =

    'メッセージを入力';

  textarea.setAttribute(

    'aria-label',

    'メッセージ入力',

  );

  const sendButton =

    document.createElement(

      'button',

    );

  sendButton.type =

    'button';

  sendButton.className =

    'messages-send-btn';

  sendButton.dataset.action =

    'send-message';

  sendButton.setAttribute(

    'aria-label',

    '送信',

  );

  sendButton.textContent =

    '送信';

  composer.appendChild(

    textarea,

  );

  composer.appendChild(

    sendButton,

  );

  return composer;

}

// ------------------------------------------------------------

// 長押しアクションシート

// ------------------------------------------------------------

function createActionSheet() {

  const overlay =

    document.createElement(

      'div',

    );

  overlay.id =

    'messageActionSheet';

  overlay.className =

    'message-action-sheet';

  const panel =

    document.createElement(

      'div',

    );

  panel.className =

    'message-action-panel';

  const reactions =

    document.createElement(

      'div',

    );

  reactions.className =

    'message-reactions';

  ['❤️', '👍', '😂', '😮', '😢']

    .forEach(

      (emoji) => {

        const button =

          document.createElement(

            'button',

          );

        button.type =

          'button';

        button.className =

          'message-reaction-btn';

        button.dataset.action =

          'react';

        button.dataset.emoji =

          emoji;

        button.textContent =

          emoji;

        reactions.appendChild(

          button,

        );

      },

    );

  const copyButton =

    document.createElement(

      'button',

    );

  copyButton.type =

    'button';

  copyButton.className =

    'message-action-btn';

  copyButton.dataset.action =

    'copy-message';

  copyButton.textContent =

    'コピー';

  const deleteButton =

    document.createElement(

      'button',

    );

  deleteButton.type =

    'button';

  deleteButton.className =

    'message-action-btn message-action-btn--danger';

  deleteButton.dataset.action =

    'delete-message';

  deleteButton.textContent =

    '削除';

  const cancelButton =

    document.createElement(

      'button',

    );

  cancelButton.type =

    'button';

  cancelButton.className =

    'message-action-btn';

  cancelButton.dataset.action =

    'cancel-action-sheet';

  cancelButton.textContent =

    'キャンセル';

  panel.appendChild(

    reactions,

  );

  panel.appendChild(

    copyButton,

  );

  panel.appendChild(

    deleteButton,

  );

  panel.appendChild(

    cancelButton,

  );

  overlay.appendChild(

    panel,

  );

  return overlay;

}

// ------------------------------------------------------------

// DOM構築

// ------------------------------------------------------------

export function create() {

  if (isBuilt) {

    return;

  }

  const container =

    getContainer();

  if (!container) {

    console.warn(

      `[messages.js] #${CONTAINER_ID} が見つかりません`,

    );

    return;

  }

  const fragment =

    document.createDocumentFragment();

  fragment.appendChild(

    createHeader(),

  );

  fragment.appendChild(

    createMessageList(),

  );

  fragment.appendChild(

    createComposer(),

  );

  fragment.appendChild(

    createActionSheet(),

  );

  container.appendChild(

    fragment,

  );

  /*

   * 背景変更を購読して即時反映する。

   */

  if (

    unsubscribeCustomization

  ) {

    unsubscribeCustomization();

  }

  unsubscribeCustomization =

    Customization.subscribe(

      () => {

        renderBackground();

      },

    );

  renderBackground();

  registerMessagePointerEvents();

  isBuilt = true;

}

// ------------------------------------------------------------

// 表示

// ------------------------------------------------------------

export function open() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  renderBackground();

  container.classList.add(

    'is-open',

  );

  container.setAttribute(

    'aria-hidden',

    'false',

  );

  container.scrollTop =

    0;

  startMessageSubscription();

  window.requestAnimationFrame(

    () => {

      renderBackground();

    },

  );

}

// ------------------------------------------------------------

// 非表示

// ------------------------------------------------------------

export function close() {

  const container =

    getContainer();

  if (!container) {

    return;

  }

  container.classList.remove(

    'is-open',

  );

  container.setAttribute(

    'aria-hidden',

    'true',

  );

  stopMessageSubscription();

  closeActionSheet();

  clearTypingTimer();

}

// ------------------------------------------------------------

// Firestore購読開始

// ------------------------------------------------------------

function startMessageSubscription() {

  stopMessageSubscription();

  const roomId =

    Firebase.getLocalRoomId();

  if (!roomId) {

    return;

  }

  unsubscribeMessages =

    Firebase.subscribeToMessages(

      roomId,

      (messages) => {

        renderMessages(

          messages,

        );

      },

      (error) => {

        console.warn(

          '[messages.js] メッセージ購読に失敗しました',

          error,

        );

      },

    );

}

// ------------------------------------------------------------

// Firestore購読停止

// ------------------------------------------------------------

function stopMessageSubscription() {

  if (

    unsubscribeMessages

  ) {

    unsubscribeMessages();

    unsubscribeMessages =

      null;

  }

}

// ------------------------------------------------------------

// メッセージ描画

// ------------------------------------------------------------

function renderMessages(

  messages,

) {

  const list =

    document.getElementById(

      'messagesList',

    );

  if (!list) {

    return;

  }

  const currentUid =

    Firebase.getCurrentUid();

  const fragment =

    document.createDocumentFragment();

  messages.forEach(

    (message) => {

      fragment.appendChild(

        createMessageElement(

          message,

          currentUid,

        ),

      );

    },

  );

  list.replaceChildren(

    fragment,

  );

  list.scrollTop =

    list.scrollHeight;

  markVisibleMessagesAsRead(

    messages,

  );

}

// ------------------------------------------------------------

// 1件分のメッセージDOM

// ------------------------------------------------------------

function createMessageElement(

  message,

  currentUid,

) {

  const wrapper =

    document.createElement(

      'div',

    );

  wrapper.className =

    'message-row';

  const isOwn =

    message.senderId ===

    currentUid;

  wrapper.classList.toggle(

    'message-row--own',

    isOwn,

  );

  wrapper.dataset.messageId =

    message.id;

  const bubble =

    document.createElement(

      'div',

    );

  bubble.className =

    'message-bubble';

  bubble.dataset.messageId =

    message.id;

  bubble.dataset.senderId =

    message.senderId ?? '';

  const text =

    document.createElement(

      'div',

    );

  text.className =

    'message-text';

  text.textContent =

    message.text ?? '';

  bubble.appendChild(

    text,

  );

  const meta =

    document.createElement(

      'div',

    );

  meta.className =

    'message-meta';

  if (

    isOwn &&

    Array.isArray(

      message.readBy,

    ) &&

    message.readBy.some(

      (uid) =>

        uid !==

        currentUid,

    )

  ) {

    const read =

      document.createElement(

        'span',

      );

    read.className =

      'message-read';

    read.textContent =

      '既読';

    meta.appendChild(

      read,

    );

  }

  if (

    message.reactions &&

    typeof message.reactions ===

      'object'

  ) {

    const reactionList =

      document.createElement(

        'div',

      );

    reactionList.className =

      'message-reaction-list';

    Object.values(

      message.reactions,

    ).forEach(

      (emoji) => {

        if (

          typeof emoji !==

          'string'

        ) {

          return;

        }

        const reaction =

          document.createElement(

            'span',

          );

        reaction.className =

          'message-reaction';

        reaction.textContent =

          emoji;

        reactionList.appendChild(

          reaction,

        );

      },

    );

    if (

      reactionList.children

        .length > 0

    ) {

      bubble.appendChild(

        reactionList,

      );

    }

  }

  if (

    meta.children.length >

    0

  ) {

    bubble.appendChild(

      meta,

    );

  }

  wrapper.appendChild(

    bubble,

  );

  return wrapper;

}

// ------------------------------------------------------------

// 既読処理

// ------------------------------------------------------------

function markVisibleMessagesAsRead(

  messages,

) {

  if (

    !Settings.isReadReceiptsEnabled()

  ) {

    return;

  }

  const roomId =

    Firebase.getLocalRoomId();

  const currentUid =

    Firebase.getCurrentUid();

  if (

    !roomId ||

    !currentUid

  ) {

    return;

  }

  messages.forEach(

    (message) => {

      if (

        !message ||

        !message.id

      ) {

        return;

      }

      if (

        message.senderId ===

        currentUid

      ) {

        return;

      }

      const readBy =

        Array.isArray(

          message.readBy,

        )

          ? message.readBy

          : [];

      if (

        readBy.includes(

          currentUid,

        )

      ) {

        return;

      }

      Firebase.markMessageAsRead(

        roomId,

        message.id,

        currentUid,

      ).catch(

        (error) => {

          console.warn(

            '[messages.js] 既読更新に失敗しました',

            error,

          );

        },

      );

    },

  );

}

// ------------------------------------------------------------

// 送信

// ------------------------------------------------------------

export async function sendMessage() {

  const input =

    document.getElementById(

      'messagesInput',

    );

  if (!input) {

    return;

  }

  const text =

    input.value.trim();

  if (!text) {

    return;

  }

  const roomId =

    Firebase.getLocalRoomId();

  const currentUid =

    Firebase.getCurrentUid();

  if (

    !roomId ||

    !currentUid

  ) {

    throw new Error(

      'ルームに接続されていません。',

    );

  }

  await Firebase.sendMessage(

    roomId,

    {

      text,

      senderId:

        currentUid,

    },

  );

  input.value =

    '';

  autoResizeInput();

  input.focus();

}

// ------------------------------------------------------------

// 入力欄自動リサイズ

// ------------------------------------------------------------

export function autoResizeInput() {

  const input =

    document.getElementById(

      'messagesInput',

    );

  if (!input) {

    return;

  }

  input.style.height =

    'auto';

  const maxHeight =

    120;

  input.style.height =

    `${Math.min(

      input.scrollHeight,

      maxHeight,

    )}px`;

  input.style.overflowY =

    input.scrollHeight >

    maxHeight

      ? 'auto'

      : 'hidden';

}

// ------------------------------------------------------------

// 入力中通知

// ------------------------------------------------------------

export function notifyTyping() {

  clearTypingTimer();

  const roomId =

    Firebase.getLocalRoomId();

  const currentUid =

    Firebase.getCurrentUid();

  if (

    !roomId ||

    !currentUid

  ) {

    return;

  }

  if (

    typeof Firebase.setTypingState ===

    'function'

  ) {

    Firebase.setTypingState(

      roomId,

      currentUid,

      true,

    ).catch(

      (error) => {

        console.warn(

          '[messages.js] 入力中状態の更新に失敗しました',

          error,

        );

      },

    );

    typingTimer =

      window.setTimeout(

        () => {

          Firebase.setTypingState(

            roomId,

            currentUid,

            false,

          ).catch(

            () => {},

          );

          typingTimer =

            null;

        },

        1500,

      );

  }

}

function clearTypingTimer() {

  if (

    typingTimer !==

    null

  ) {

    window.clearTimeout(

      typingTimer,

    );

    typingTimer =

      null;

  }

}

// ------------------------------------------------------------

// 長押し

// ------------------------------------------------------------

function registerMessagePointerEvents() {

  const list =

    document.getElementById(

      'messagesList',

    );

  if (!list) {

    return;

  }

  list.addEventListener(

    'pointerdown',

    handleMessagePointerDown,

  );

  list.addEventListener(

    'pointerup',

    cancelLongPress,

  );

  list.addEventListener(

    'pointercancel',

    cancelLongPress,

  );

  list.addEventListener(

    'pointerleave',

    cancelLongPress,

  );

}

function handleMessagePointerDown(

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

  const bubble =

    event.target.closest(

      '.message-bubble',

    );

  if (!bubble) {

    return;

  }

  cancelLongPress();

  const messageId =

    bubble.dataset.messageId;

  const senderId =

    bubble.dataset.senderId;

  if (!messageId) {

    return;

  }

  longPressTimer =

    window.setTimeout(

      () => {

        selectedMessageId =

          messageId;

        selectedMessageData =

          {

            senderId:

              senderId ??

              '',

            text:

              bubble.querySelector(

                '.message-text',

              )?.textContent ??

              '',

          };

        openActionSheet();

      },

      LONG_PRESS_MS,

    );

}

function cancelLongPress() {

  if (

    longPressTimer !==

    null

  ) {

    window.clearTimeout(

      longPressTimer,

    );

    longPressTimer =

      null;

  }

}

// ------------------------------------------------------------

// アクションシート開閉

// ------------------------------------------------------------

function openActionSheet() {

  const sheet =

    document.getElementById(

      'messageActionSheet',

    );

  if (!sheet) {

    return;

  }

  const deleteButton =

    sheet.querySelector(

      '[data-action="delete-message"]',

    );

  if (

    deleteButton

  ) {

    const currentUid =

      Firebase.getCurrentUid();

    deleteButton.hidden =

      !selectedMessageData ||

      selectedMessageData.senderId !==

        currentUid;

  }

  sheet.classList.add(

    'is-open',

  );

  sheet.setAttribute(

    'aria-hidden',

    'false',

  );

}

export function closeActionSheet() {

  const sheet =

    document.getElementById(

      'messageActionSheet',

    );

  if (sheet) {

    sheet.classList.remove(

      'is-open',

    );

    sheet.setAttribute(

      'aria-hidden',

      'true',

    );

  }

  selectedMessageId =

    null;

  selectedMessageData =

    null;

  cancelLongPress();

}

// ------------------------------------------------------------

// コピー

// ------------------------------------------------------------

export async function copySelectedMessage() {

  if (

    !selectedMessageData

  ) {

    return;

  }

  const text =

    selectedMessageData.text ??

    '';

  if (

    navigator.clipboard &&

    typeof navigator.clipboard.writeText ===

      'function'

  ) {

    await navigator.clipboard.writeText(

      text,

    );

  } else {

    const textarea =

      document.createElement(

        'textarea',

      );

    textarea.value =

      text;

    textarea.style.position =

      'fixed';

    textarea.style.opacity =

      '0';

    document.body.appendChild(

      textarea,

    );

    textarea.select();

    document.execCommand(

      'copy',

    );

    textarea.remove();

  }

  closeActionSheet();

}

// ------------------------------------------------------------

// 削除

// ------------------------------------------------------------

export async function deleteSelectedMessage() {

  if (

    !selectedMessageId ||

    !selectedMessageData

  ) {

    return;

  }

  const roomId =

    Firebase.getLocalRoomId();

  const currentUid =

    Firebase.getCurrentUid();

  if (

    !roomId ||

    !currentUid

  ) {

    return;

  }

  if (

    selectedMessageData.senderId !==

    currentUid

  ) {

    closeActionSheet();

    return;

  }

  const messageId =

    selectedMessageId;

  closeActionSheet();

  await Firebase.deleteMessage(

    roomId,

    messageId,

  );

}

// ------------------------------------------------------------

// リアクション

// ------------------------------------------------------------

export function reactToSelectedMessage(

  emoji,

) {

  if (

    !selectedMessageId ||

    typeof emoji !==

      'string'

  ) {

    return;

  }

  const roomId =

    Firebase.getLocalRoomId();

  const currentUid =

    Firebase.getCurrentUid();

  if (

    !roomId ||

    !currentUid

  ) {

    return;

  }

  const messageId =

    selectedMessageId;

  Firebase.setMessageReaction(

    roomId,

    messageId,

    currentUid,

    emoji,

  ).catch(

    (error) => {

      console.warn(

        '[messages.js] リアクション更新に失敗しました',

        error,

      );

    },

  );

  closeActionSheet();

}

// ------------------------------------------------------------

// 外部から背景再反映

// ------------------------------------------------------------

export function refreshCustomization() {

  renderBackground();

}

// ------------------------------------------------------------

// 開いているか

// ------------------------------------------------------------

export function isOpen() {

  const container =

    getContainer();

  return container

    ? container.classList.contains(

        'is-open',

      )

    : false;

}

// ------------------------------------------------------------

// default export

// ------------------------------------------------------------

const Messages = {

  create,

  open,

  close,

  isOpen,

  sendMessage,

  autoResizeInput,

  notifyTyping,

  closeActionSheet,

  copySelectedMessage,

  deleteSelectedMessage,

  reactToSelectedMessage,

  refreshCustomization,

};

export default Messages;