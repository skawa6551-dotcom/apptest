// ============================================================
// messages-workspace-back.js
// Calculator 0209 v56
// AI SpaceにWorkspaceへ戻るボタンを追加
// ============================================================

import Router from './router.js';

function ensureBackButton() {
  const header =
    document.querySelector('#messages .messages-header');

  if (!header) return;
  if (document.getElementById('messagesWorkspaceBackBtn')) return;

  const button = document.createElement('button');
  button.id = 'messagesWorkspaceBackBtn';
  button.type = 'button';
  button.className = 'icon-btn messages-workspace-back-btn';
  button.setAttribute('aria-label', 'Workspaceへ戻る');
  button.textContent = '‹';

  button.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      Router.closeMessages();
    },
    true,
  );

  header.insertBefore(button, header.firstChild);
}

function install() {
  ensureBackButton();

  const observer = new MutationObserver(() => {
    ensureBackButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}
