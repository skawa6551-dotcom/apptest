// ============================================================
// messages.js
// Calculator 0209 - AI Space
// ・相手名を出さず、AIとの仮想空間として表示
// ・右上：強制ロック / 閲覧モード / 履歴
// ・送信完了後、その時点の会話を通常画面から消して履歴へ移動
// ・Firestore上のメッセージ自体は削除せず、履歴から閲覧可能
// ============================================================

import Firebase from './firebase.js';
import Settings from './settings.js';
import Customization from './customization.js';
import Storage, { STORAGE_KEYS } from './storage.js';
import Passcode from './passcode.js';

const CONTAINER_ID = 'messages';
const LONG_PRESS_MS = 500;

let isBuilt = false;
let unsubscribeMessages = null;
let unsubscribeCustomization = null;
let selectedMessageId = null;
let selectedMessageData = null;
let longPressTimer = null;
let typingTimer = null;

let isHistoryMode = false;
let isViewMode = false;
let latestMessages = [];
let openedAtMs = 0;

// 送信直後、Firestoreの次スナップショットで会話一式を履歴へ送るための印
let archiveAfterSendAt = 0;
let pendingHistoryAuth = false;
let pendingViewModeAuth = false;

function getContainer() {
  let container = document.getElementById(CONTAINER_ID);

  // index.html側にコンテナが無い／読み込み順でまだ無い場合でも
  // Messages自身で復旧できるようにする。
  if (!container && document.body) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'messages messages-ai-space';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
  }

  return container;
}

function ensureFallbackStyles() {
  if (document.getElementById('aiSpaceFallbackStyles')) return;

  const style = document.createElement('style');
  style.id = 'aiSpaceFallbackStyles';
  style.textContent = `
    #messages.messages {
      position: fixed !important;
      inset: 0 !important;
      z-index: 10050 !important;
      display: none;
      visibility: hidden;
      flex-direction: column;
      box-sizing: border-box;
      width: 100% !important;
      height: 100dvh !important;
      padding: max(22px, env(safe-area-inset-top)) 18px
               max(16px, env(safe-area-inset-bottom)) 18px;
      overflow: hidden;
      color: #f7f8fb;
      background:
        radial-gradient(circle at 82% 8%, rgba(85,93,220,.16), transparent 27%),
        radial-gradient(circle at 12% 46%, rgba(32,204,190,.07), transparent 30%),
        linear-gradient(160deg,#08111c 0%,#050b13 48%,#02060b 100%) !important;
      opacity: 0;
      pointer-events: none;
    }
    #messages.messages.is-open {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    #messages .ai-space-header {
      display:flex; align-items:flex-start; justify-content:space-between;
      gap:12px; width:100%; min-height:105px; flex:0 0 auto;
    }
    #messages .ai-space-title {
      margin:8px 0 0; font-size:34px; line-height:1; font-weight:650;
      color:#8fe6e0;
    }
    #messages .ai-space-online {
      display:flex; align-items:center; gap:7px; margin-top:13px;
      color:rgba(255,255,255,.72); font-size:13px;
    }
    #messages .ai-space-online-dot {
      width:9px;height:9px;border-radius:50%;background:#36d98a;
    }
    #messages .ai-space-actions { display:flex; gap:5px; }
    #messages .ai-space-action {
      display:flex; flex-direction:column; align-items:center; gap:6px; min-width:56px;
    }
    #messages .ai-space-action-btn {
      width:48px;height:48px;border-radius:50%;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.055); color:#eef3ff; font-size:21px;
    }
    #messages .ai-space-action-label {
      color:rgba(255,255,255,.72); font-size:10px; white-space:nowrap;
    }
    #messages .ai-space-hero {
      position:relative; display:flex; align-items:center; min-height:110px;
      margin:0 0 15px; padding:17px; border-radius:24px;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.045); overflow:hidden;
    }
    #messages .ai-space-hero-copy {
      display:flex; flex-direction:column; gap:8px; padding-left:15px; z-index:2;
    }
    #messages .ai-space-hero-copy strong { font-size:22px; }
    #messages .ai-space-hero-copy span { color:rgba(255,255,255,.72); font-size:14px; }
    #messages .ai-space-orb {
      display:grid; place-items:center; flex:0 0 auto; width:43px; height:43px;
      border-radius:50%;
      background:conic-gradient(#6de7df,#6f83ff,#b574ff,#68e6dd);
      box-shadow:inset 0 0 0 6px #0a101a;
    }
    #messages .ai-space-orb--hero { width:52px;height:52px; }
    #messages .messages-scroll {
      display:flex; flex:1 1 auto; min-height:0; overflow-y:auto;
    }
    #messages .messages-list {
      display:flex; flex-direction:column; justify-content:flex-end;
      gap:15px; width:100%; min-height:100%; padding:5px 2px 18px;
      box-sizing:border-box;
    }
    #messages .message-row { display:flex; width:100%; align-items:flex-end; gap:9px; }
    #messages .message-row.is-own { justify-content:flex-end; }
    #messages .message-content { display:flex; flex-direction:column; max-width:78%; }
    #messages .message-bubble {
      padding:13px 16px; border-radius:20px; line-height:1.55;
      color:#f6f8fc; background:rgba(255,255,255,.075);
    }
    #messages .message-row.is-own .message-bubble {
      background:linear-gradient(135deg,rgba(22,73,81,.78),rgba(16,44,55,.9));
    }
    #messages .message-meta {
      margin-top:4px; padding:0 5px; color:rgba(255,255,255,.45); font-size:11px;
    }
    #messages .messages-composer {
      display:flex; align-items:flex-end; gap:10px; width:100%; flex:0 0 auto;
      padding-top:10px;
    }
    #messages .messages-input-wrap {
      display:flex; flex:1; min-height:54px; align-items:center; padding:5px 16px;
      border:1px solid rgba(255,255,255,.13); border-radius:29px;
      background:rgba(255,255,255,.025);
    }
    #messages .messages-input {
      width:100%; min-height:34px; max-height:120px; border:0; outline:0;
      resize:none; background:transparent; color:#f7f9fc; font-size:16px;
    }
    #messages .messages-send-btn {
      width:50px;height:50px;border:0;border-radius:50%;
      background:rgba(48,143,148,.55);color:#e1ffff;font-size:20px;
    }
    #messages .ai-space-empty {
      display:flex; min-height:150px; flex-direction:column;
      align-items:center; justify-content:center; gap:12px;
      color:rgba(255,255,255,.45); font-size:13px;
    }
    #messages.is-view-mode .messages-composer { display:none !important; }
    #messages.is-history-mode .ai-space-hero { display:none !important; }

    /* AI Spaceは通常画面より高いz-indexなので、
       共通の再認証オーバーレイをさらに手前へ出す。 */
    #featureAuthOverlay.is-open {
      position: fixed !important;
      inset: 0 !important;
      z-index: 13000 !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function renderBackground() {
  const container = getContainer();
  if (!container) return;

  const presetId = Customization.getCached().backgrounds?.messages;
  Customization.applyBackgroundClass(container, 'messages', presetId);

  // AI Spaceは常に暗い仮想空間の膜を重ねる
  container.classList.add('messages-ai-space');
}

function createCircleAction({ action, label, icon, className = '' }) {
  const wrap = document.createElement('div');
  wrap.className = `ai-space-action ${className}`.trim();

  // アイコンだけでなく「履歴」「閲覧モード」などの文字部分を
  // タップしても反応するよう、アクションをラッパー全体にも持たせる。
  wrap.dataset.action = action;
  wrap.setAttribute('role', 'group');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ai-space-action-btn';
  button.dataset.action = action;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span aria-hidden="true">${icon}</span>`;

  const caption = document.createElement('span');
  caption.className = 'ai-space-action-label';
  caption.textContent = label;
  caption.style.pointerEvents = 'none';

  wrap.append(button, caption);
  return wrap;
}

function createHeader() {
  const header = document.createElement('header');
  header.className = 'messages-header ai-space-header';

  const brand = document.createElement('div');
  brand.className = 'ai-space-brand';

  const title = document.createElement('h2');
  title.className = 'messages-title ai-space-title';
  title.textContent = 'AI Space';

  const status = document.createElement('div');
  status.className = 'ai-space-online';
  status.innerHTML = '<span class="ai-space-online-dot"></span><span>オンライン</span>';

  brand.append(title, status);

  const actions = document.createElement('div');
  actions.className = 'messages-header-actions ai-space-actions';

  const lock = createCircleAction({
    action: 'lock-now',
    label: '強制ロック',
    icon: '⌑',
    className: 'ai-space-action--lock',
  });

  const view = createCircleAction({
    action: 'toggle-ai-view-mode',
    label: '閲覧モード',
    icon: '◉',
    className: 'ai-space-action--view',
  });
  view.querySelector('button').setAttribute('aria-pressed', 'false');

  const history = createCircleAction({
    action: 'toggle-message-history',
    label: '履歴',
    icon: '◷',
    className: 'messages-history-btn',
  });
  history.querySelector('button').setAttribute('aria-pressed', 'false');

  actions.append(lock, view, history);
  header.append(brand, actions);

  return header;
}

function createHero() {
  const hero = document.createElement('section');
  hero.className = 'ai-space-hero';
  hero.innerHTML = `
    <div class="ai-space-orb ai-space-orb--hero" aria-hidden="true">
      <span>✦</span>
    </div>
    <div class="ai-space-hero-copy">
      <strong>こんにちは 👋</strong>
      <span>今日はどんなお話をしますか？</span>
    </div>
    <div class="ai-space-wave" aria-hidden="true"></div>
  `;
  return hero;
}

function createMessageList() {
  const scroll = document.createElement('div');
  scroll.className = 'messages-scroll';

  const list = document.createElement('div');
  list.id = 'messagesList';
  list.className = 'messages-list';

  scroll.appendChild(list);
  return scroll;
}

function createComposer() {
  const composer = document.createElement('div');
  composer.className = 'messages-composer';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'messages-input-wrap';

  const textarea = document.createElement('textarea');
  textarea.id = 'messagesInput';
  textarea.className = 'messages-input';
  textarea.rows = 1;
  textarea.maxLength = 2000;
  textarea.placeholder = 'メッセージを入力…';
  textarea.setAttribute('aria-label', 'メッセージ入力');

  inputWrap.appendChild(textarea);

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'messages-send-btn';
  sendButton.dataset.action = 'send-message';
  sendButton.setAttribute('aria-label', '送信');
  sendButton.innerHTML = '<span aria-hidden="true">➤</span>';

  composer.append(inputWrap, sendButton);
  return composer;
}

function createActionSheet() {
  const overlay = document.createElement('div');
  overlay.id = 'messageActionSheet';
  overlay.className = 'message-action-sheet';
  overlay.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('div');
  panel.className = 'message-action-sheet-panel';

  const reactions = document.createElement('div');
  reactions.className = 'message-reaction-picker';

  ['❤️', '👍', '😂', '😮', '😢'].forEach((emoji) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-reaction-btn';
    button.dataset.action = 'react';
    button.dataset.emoji = emoji;
    button.textContent = emoji;
    reactions.appendChild(button);
  });

  const menu = document.createElement('div');
  menu.className = 'message-action-menu';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'message-action-btn';
  copy.dataset.action = 'copy-message';
  copy.textContent = 'コピー';

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'message-action-btn message-action-btn--danger';
  del.dataset.action = 'delete-message';
  del.textContent = '削除';

  menu.append(copy, del);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'message-action-cancel';
  cancel.dataset.action = 'cancel-action-sheet';
  cancel.textContent = 'キャンセル';

  panel.append(reactions, menu, cancel);
  overlay.appendChild(panel);
  return overlay;
}

export function create() {
  if (isBuilt) return;

  ensureFallbackStyles();

  const container = getContainer();
  if (!container) {
    console.warn(`[messages.js] #${CONTAINER_ID} が見つかりません`);
    return;
  }

  container.replaceChildren();

  const fragment = document.createDocumentFragment();
  fragment.append(
    createHeader(),
    createHero(),
    createMessageList(),
    createComposer(),
    createActionSheet(),
  );
  container.appendChild(fragment);

  if (unsubscribeCustomization) unsubscribeCustomization();
  unsubscribeCustomization = Customization.subscribe(renderBackground);

  renderBackground();
  registerMessagePointerEvents();
  registerLocalUiEvents();

  isBuilt = true;
}


function showHistoryAuth() {
  pendingHistoryAuth = true;

  const overlay = document.getElementById('featureAuthOverlay');
  const input = document.getElementById('featureAuthInput');
  const error = document.getElementById('featureAuthError');
  const message = document.getElementById('featureAuthMessage');

  if (message) {
    message.textContent =
      'メッセージ履歴を見るには、もう一度パスコードを入力してください';
  }

  if (error) error.hidden = true;
  if (input) input.value = '';

  if (overlay) {
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '13000';
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  window.requestAnimationFrame(() => input?.focus());
}

function hideHistoryAuth() {
  pendingHistoryAuth = false;

  const overlay = document.getElementById('featureAuthOverlay');
  const input = document.getElementById('featureAuthInput');
  const error = document.getElementById('featureAuthError');

  if (overlay) {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (input) input.value = '';
  if (error) error.hidden = true;
}


function showViewModeAuth() {
  pendingViewModeAuth = true;

  const overlay = document.getElementById('featureAuthOverlay');
  const input = document.getElementById('featureAuthInput');
  const error = document.getElementById('featureAuthError');
  const message = document.getElementById('featureAuthMessage');

  if (message) {
    message.textContent =
      '閲覧モードを開くには、もう一度パスコードを入力してください';
  }

  if (error) error.hidden = true;
  if (input) input.value = '';

  if (overlay) {
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '13000';
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  window.requestAnimationFrame(() => input?.focus());
}

function hideViewModeAuth() {
  pendingViewModeAuth = false;

  const overlay = document.getElementById('featureAuthOverlay');
  const input = document.getElementById('featureAuthInput');
  const error = document.getElementById('featureAuthError');

  if (overlay) {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (input) input.value = '';
  if (error) error.hidden = true;
}

function confirmViewModeAuth() {
  const input = document.getElementById('featureAuthInput');
  const error = document.getElementById('featureAuthError');

  if (!input || !Passcode.validate(input.value)) {
    if (error) error.hidden = false;
    input?.select();
    return;
  }

  hideViewModeAuth();

  isViewMode = true;
  isHistoryMode = false;

  const container = getContainer();
  container?.classList.add('is-view-mode');
  container?.classList.remove('is-history-mode');

  renderMessages(latestMessages);
  updateModeButtons();
}

function confirmHistoryAuth() {
  const input = document.getElementById('featureAuthInput');
  const error = document.getElementById('featureAuthError');

  if (!input || !Passcode.validate(input.value)) {
    if (error) error.hidden = false;
    input?.select();
    return;
  }

  hideHistoryAuth();
  isHistoryMode = true;
  isViewMode = false;
  renderMessages(latestMessages);
}

function dedupeMessages(messages) {
  const result = [];
  const seenIds = new Set();

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message) continue;

    if (message.id) {
      if (seenIds.has(message.id)) continue;
      seenIds.add(message.id);
    }

    // 旧retry処理で同一内容がほぼ同時刻に二重送信された既存データを
    // 画面上では1件にまとめる。
    const previous = result[result.length - 1];
    if (
      previous &&
      previous.senderId === message.senderId &&
      String(previous.text ?? '') === String(message.text ?? '')
    ) {
      const a = messageTimeMs(previous);
      const b = messageTimeMs(message);
      if (a && b && Math.abs(b - a) <= 3000) {
        continue;
      }
    }

    result.push(message);
  }

  return result;
}

function registerLocalUiEvents() {
  const container = getContainer();
  if (!container) return;

  // captureで先に処理し、app.js / feature-lock-patch.jsとの競合を防ぐ。
  container.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const historyButton =
      event.target.closest('[data-action="toggle-message-history"]');

    if (historyButton) {
      event.preventDefault();
      event.stopImmediatePropagation();

      // 履歴を閉じる時は再認証不要。
      if (isHistoryMode) {
        isHistoryMode = false;
        renderMessages(latestMessages);
      } else {
        showHistoryAuth();
      }
      return;
    }

    const viewButton =
      event.target.closest('[data-action="toggle-ai-view-mode"]');

    if (viewButton) {
      event.preventDefault();
      event.stopImmediatePropagation();

      // 閲覧モードを閉じる時は再認証不要。
      if (isViewMode) {
        isViewMode = false;
        const container = getContainer();
        container?.classList.remove('is-view-mode');
        renderMessages(latestMessages);
        updateModeButtons();
      } else {
        showViewModeAuth();
      }
    }
  }, true);

  // 共通認証オーバーレイの「開く」「キャンセル」も、
  // 履歴認証中だけmessages.jsがcaptureで処理する。
  document.addEventListener('click', (event) => {
    if (!pendingHistoryAuth && !pendingViewModeAuth) return;
    if (!(event.target instanceof Element)) return;

    const confirm =
      event.target.closest('[data-action="confirm-feature-auth"]');

    if (confirm) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (pendingHistoryAuth) {
        confirmHistoryAuth();
      } else if (pendingViewModeAuth) {
        confirmViewModeAuth();
      }
      return;
    }

    const cancel =
      event.target.closest('[data-action="cancel-feature-auth"]');

    if (cancel) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (pendingHistoryAuth) hideHistoryAuth();
  if (pendingViewModeAuth) hideViewModeAuth();
      if (pendingViewModeAuth) hideViewModeAuth();
    }
  }, true);
}

export function open() {
  // Router初期化時にDOM構築できなかった場合でも、
  // 実際に開く瞬間に必ず再構築する。
  if (!isBuilt) {
    create();
  }

  ensureFallbackStyles();

  openedAtMs = Date.now();
  isHistoryMode = false;
  isViewMode = false;
  archiveAfterSendAt = 0;

  let container = getContainer();
  if (!container) return;

  if (!container.querySelector('.ai-space-header')) {
    isBuilt = false;
    create();
    container = getContainer();
    if (!container) return;
  }

  renderBackground();
  container.classList.add('is-open');
  container.classList.remove('is-history-mode', 'is-view-mode');
  container.setAttribute('aria-hidden', 'false');
  updateModeButtons();

  // 匿名認証の復元を先行開始する。失敗しても画面表示は止めない。
  Firebase.ensureSignedIn().catch((error) => {
    console.warn('[messages.js] Firebase認証の復元に失敗しました', error);
  });

  startMessageSubscription();

  window.requestAnimationFrame(() => {
    renderBackground();
    document.getElementById('messagesList')?.scrollTo?.({ top: 999999 });
  });
}

export function close() {
  isHistoryMode = false;
  isViewMode = false;
  latestMessages = [];
  archiveAfterSendAt = 0;
  if (pendingHistoryAuth) hideHistoryAuth();

  const container = getContainer();
  if (!container) return;

  container.classList.remove('is-open', 'is-history-mode', 'is-view-mode');
  container.setAttribute('aria-hidden', 'true');

  stopMessageSubscription();
  closeActionSheet();
  clearTypingTimer();
}

function startMessageSubscription() {
  stopMessageSubscription();

  const roomId = Firebase.getLocalRoomId();
  if (!roomId) return;

  unsubscribeMessages = Firebase.subscribeToMessages(
    roomId,
    (messages) => {
      latestMessages = dedupeMessages(messages);

      if (archiveAfterSendAt > 0) {
        const currentUid = Firebase.getCurrentUid();
        const ownJustSent = latestMessages.some((message) => {
          if (message?.senderId !== currentUid) return false;
          const t = messageTimeMs(message);
          return t >= archiveAfterSendAt - 3000;
        });

        if (ownJustSent) {
          archiveCurrentConversation(latestMessages, currentUid);
          archiveAfterSendAt = 0;
        }
      }

      renderMessages(latestMessages);
    },
    (error) => {
      console.warn('[messages.js] メッセージ購読に失敗しました', error);
    },
  );
}

function stopMessageSubscription() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
}

function getHiddenStoreKey() {
  const roomId = Firebase.getLocalRoomId() || 'no-room';
  const uid = Firebase.getCurrentUid() || 'no-user';
  return `${roomId}:${uid}`;
}

function getHiddenIds() {
  const all = Storage.get(STORAGE_KEYS.MESSAGE_HIDDEN_IDS, {});
  const list = all && typeof all === 'object'
    ? all[getHiddenStoreKey()]
    : null;
  return new Set(Array.isArray(list) ? list : []);
}

function saveHiddenIds(ids) {
  const all = Storage.get(STORAGE_KEYS.MESSAGE_HIDDEN_IDS, {});
  const next = all && typeof all === 'object' ? { ...all } : {};
  next[getHiddenStoreKey()] = Array.from(ids).slice(-2000);
  Storage.set(STORAGE_KEYS.MESSAGE_HIDDEN_IDS, next);
}

function messageTimeMs(message) {
  const ts = message?.timestamp;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return 0;
}

function getLiveMessages(messages) {
  const hidden = getHiddenIds();
  return messages.filter((message) => message?.id && !hidden.has(message.id));
}

function archiveCurrentConversation(messages, currentUid) {
  const hidden = getHiddenIds();
  const live = messages.filter((message) => message?.id && !hidden.has(message.id));

  // 送信時点で画面上にある一連の会話を全部「履歴」へ
  live.forEach((message) => hidden.add(message.id));
  saveHiddenIds(hidden);
}

function renderMessages(messages) {
  const list = document.getElementById('messagesList');
  if (!list) return;

  const currentUid = Firebase.getCurrentUid();
  const visibleMessages = isHistoryMode
    ? messages
    : getLiveMessages(messages);

  const fragment = document.createDocumentFragment();

  if (visibleMessages.length === 0 && !isHistoryMode) {
    const empty = document.createElement('div');
    empty.className = 'ai-space-empty';
    empty.innerHTML = `
      <div class="ai-space-orb" aria-hidden="true"><span>✦</span></div>
      <p>メッセージを待っています</p>
    `;
    fragment.appendChild(empty);
  } else {
    visibleMessages.forEach((message) => {
      fragment.appendChild(createMessageElement(message, currentUid));
    });
  }

  list.replaceChildren(fragment);
  list.scrollTop = list.scrollHeight;

  if (!isHistoryMode) {
    markVisibleMessagesAsRead(visibleMessages);
  }

  const container = getContainer();
  container?.classList.toggle('is-history-mode', isHistoryMode);

  updateModeButtons();
}

function formatMessageTime(message) {
  const ms = messageTimeMs(message);
  if (!ms) return '';

  try {
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

function createMessageElement(message, currentUid) {
  const wrapper = document.createElement('div');
  const isOwn = message.senderId === currentUid;

  wrapper.className = `message-row ${isOwn ? 'is-own' : 'is-other'}`;
  wrapper.dataset.messageId = message.id;

  if (!isOwn) {
    const avatar = document.createElement('div');
    avatar.className = 'ai-space-orb ai-space-orb--message';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = '<span></span>';
    wrapper.appendChild(avatar);
  }

  const content = document.createElement('div');
  content.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.dataset.messageId = message.id;
  bubble.dataset.senderId = message.senderId ?? '';

  const text = document.createElement('div');
  text.className = 'message-text';
  text.textContent = message.text ?? '';
  bubble.appendChild(text);

  if (message.reactions && typeof message.reactions === 'object') {
    const reactionList = document.createElement('div');
    reactionList.className = 'message-reactions';

    Object.values(message.reactions).forEach((emoji) => {
      if (typeof emoji !== 'string') return;
      const reaction = document.createElement('span');
      reaction.className = 'message-reaction';
      reaction.textContent = emoji;
      reactionList.appendChild(reaction);
    });

    if (reactionList.children.length > 0) {
      bubble.appendChild(reactionList);
    }
  }

  const meta = document.createElement('div');
  meta.className = 'message-meta';

  const time = document.createElement('span');
  time.className = 'message-time';
  time.textContent = formatMessageTime(message);
  if (time.textContent) meta.appendChild(time);

  if (
    isOwn &&
    Array.isArray(message.readBy) &&
    message.readBy.some((uid) => uid !== currentUid)
  ) {
    const read = document.createElement('span');
    read.className = 'message-read';
    read.textContent = '✓✓';
    meta.appendChild(read);
  }

  content.append(bubble, meta);
  wrapper.appendChild(content);

  return wrapper;
}

function markVisibleMessagesAsRead(messages) {
  if (!Settings.isReadReceiptsEnabled()) return;

  const roomId = Firebase.getLocalRoomId();
  const currentUid = Firebase.getCurrentUid();
  if (!roomId || !currentUid) return;

  messages.forEach((message) => {
    if (!message?.id || message.senderId === currentUid) return;

    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    if (readBy.includes(currentUid)) return;

    Firebase.markMessageAsRead(roomId, message.id, currentUid).catch((error) => {
      console.warn('[messages.js] 既読更新に失敗しました', error);
    });
  });
}

export async function sendMessage() {
  const input = document.getElementById('messagesInput');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  const roomId = Firebase.getLocalRoomId();

  if (!roomId) {
    throw new Error('ルームに接続されていません。');
  }

  // iPhone/Safariでは画面表示時点で匿名認証の復元が
  // まだ終わっていないことがあるため、送信直前に必ず認証を確定する。
  const currentUid =
    Firebase.getCurrentUid() ||
    await Firebase.ensureSignedIn();

  if (!currentUid) {
    throw new Error('送信者情報を取得できませんでした。');
  }

  const sendButton = getContainer()?.querySelector('[data-action="send-message"]');
  if (sendButton instanceof HTMLButtonElement) sendButton.disabled = true;

  try {
    archiveAfterSendAt = Date.now();

    await Firebase.sendMessage(roomId, {
      text,
      senderId: currentUid,
    });

    input.value = '';
    autoResizeInput();

    // Firestoreスナップショットが遅い場合の保険。
    // 少し待っても反映されなければ、現時点の会話だけ先に履歴へ送る。
    window.setTimeout(() => {
      if (!archiveAfterSendAt) return;
      archiveCurrentConversation(latestMessages, currentUid);
      archiveAfterSendAt = 0;
      renderMessages(latestMessages);
    }, 1800);
  } finally {
    if (sendButton instanceof HTMLButtonElement) sendButton.disabled = false;
  }
}

export function toggleHistoryMode() {
  isHistoryMode = !isHistoryMode;
  if (isHistoryMode) isViewMode = false;
  renderMessages(latestMessages);
}

export function isHistoryOpen() {
  return isHistoryMode;
}

export function toggleViewMode() {
  // 外部から呼ばれた場合でも、開く時は必ず再認証。
  if (!isViewMode) {
    showViewModeAuth();
    return;
  }

  isViewMode = false;

  const container = getContainer();
  container?.classList.remove('is-view-mode');

  renderMessages(latestMessages);
  updateModeButtons();
}

function updateModeButtons() {
  const container = getContainer();
  if (!container) return;

  const historyButton = container.querySelector('[data-action="toggle-message-history"]');
  if (historyButton) {
    historyButton.setAttribute('aria-pressed', String(isHistoryMode));
    historyButton.closest('.ai-space-action')?.classList.toggle('is-active', isHistoryMode);
  }

  const viewButton = container.querySelector('[data-action="toggle-ai-view-mode"]');
  if (viewButton) {
    viewButton.setAttribute('aria-pressed', String(isViewMode));
    viewButton.closest('.ai-space-action')?.classList.toggle('is-active', isViewMode);
  }
}

export function autoResizeInput() {
  const input = document.getElementById('messagesInput');
  if (!input) return;

  input.style.height = 'auto';
  const maxHeight = 120;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

export function notifyTyping() {
  clearTypingTimer();

  const roomId = Firebase.getLocalRoomId();
  const currentUid = Firebase.getCurrentUid();
  if (!roomId || !currentUid) return;

  if (typeof Firebase.setTypingState === 'function') {
    Firebase.setTypingState(roomId, currentUid, true).catch(() => {});

    typingTimer = window.setTimeout(() => {
      Firebase.setTypingState(roomId, currentUid, false).catch(() => {});
      typingTimer = null;
    }, 1500);
  }
}

function clearTypingTimer() {
  if (typingTimer !== null) {
    window.clearTimeout(typingTimer);
    typingTimer = null;
  }
}

function registerMessagePointerEvents() {
  const list = document.getElementById('messagesList');
  if (!list) return;

  list.addEventListener('pointerdown', handleMessagePointerDown);
  list.addEventListener('pointerup', cancelLongPress);
  list.addEventListener('pointercancel', cancelLongPress);
  list.addEventListener('pointerleave', cancelLongPress);
}

function handleMessagePointerDown(event) {
  if (!(event.target instanceof Element)) return;

  const bubble = event.target.closest('.message-bubble');
  if (!bubble) return;

  cancelLongPress();

  const messageId = bubble.dataset.messageId;
  const senderId = bubble.dataset.senderId;
  if (!messageId) return;

  longPressTimer = window.setTimeout(() => {
    selectedMessageId = messageId;
    selectedMessageData = {
      senderId: senderId ?? '',
      text: bubble.querySelector('.message-text')?.textContent ?? '',
    };
    openActionSheet();
  }, LONG_PRESS_MS);
}

function cancelLongPress() {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function openActionSheet() {
  const sheet = document.getElementById('messageActionSheet');
  if (!sheet) return;

  const deleteButton = sheet.querySelector('[data-action="delete-message"]');
  if (deleteButton) {
    const currentUid = Firebase.getCurrentUid();
    deleteButton.hidden =
      !selectedMessageData ||
      selectedMessageData.senderId !== currentUid;
  }

  sheet.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
}

export function closeActionSheet() {
  const sheet = document.getElementById('messageActionSheet');
  if (sheet) {
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
  }

  selectedMessageId = null;
  selectedMessageData = null;
  cancelLongPress();
}

export async function copySelectedMessage() {
  if (!selectedMessageData) return;

  const text = selectedMessageData.text ?? '';

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  closeActionSheet();
}

export async function deleteSelectedMessage() {
  if (!selectedMessageId || !selectedMessageData) return;

  const roomId = Firebase.getLocalRoomId();
  const currentUid = Firebase.getCurrentUid();
  if (!roomId || !currentUid) return;

  if (selectedMessageData.senderId !== currentUid) {
    closeActionSheet();
    return;
  }

  const messageId = selectedMessageId;
  closeActionSheet();
  await Firebase.deleteMessage(roomId, messageId);
}

export function reactToSelectedMessage(emoji) {
  if (!selectedMessageId || typeof emoji !== 'string') return;

  const roomId = Firebase.getLocalRoomId();
  const currentUid = Firebase.getCurrentUid();
  if (!roomId || !currentUid) return;

  const messageId = selectedMessageId;

  Firebase.setMessageReaction(
    roomId,
    messageId,
    currentUid,
    emoji,
  ).catch((error) => {
    console.warn('[messages.js] リアクション更新に失敗しました', error);
  });

  closeActionSheet();
}

export function refreshCustomization() {
  renderBackground();
}

export function isOpen() {
  const container = getContainer();
  return container ? container.classList.contains('is-open') : false;
}

const Messages = {
  create,
  open,
  close,
  isOpen,
  sendMessage,
  toggleHistoryMode,
  isHistoryOpen,
  toggleViewMode,
  autoResizeInput,
  notifyTyping,
  closeActionSheet,
  copySelectedMessage,
  deleteSelectedMessage,
  reactToSelectedMessage,
  refreshCustomization,
};

export default Messages;
