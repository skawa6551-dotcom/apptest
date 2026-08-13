// ============================================================
// current-uid-check.js
// Calculator 0209 - temporary UID checker v53
//
// Firebaseで現在このiPhoneが実際に使っている匿名UIDを表示する。
// 確認後はこのファイルとindex.htmlの読み込み1行を削除してよい。
// ============================================================

import Firebase from './firebase.js';

let panel = null;

function createPanel() {
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'currentUidCheckPanel';

  panel.style.position = 'fixed';
  panel.style.left = '14px';
  panel.style.right = '14px';
  panel.style.bottom = 'calc(max(14px, env(safe-area-inset-bottom)) + 14px)';
  panel.style.zIndex = '30000';
  panel.style.padding = '12px';
  panel.style.border = '1px solid rgba(255,255,255,.16)';
  panel.style.borderRadius = '16px';
  panel.style.background = 'rgba(12,14,20,.94)';
  panel.style.color = '#fff';
  panel.style.boxShadow = '0 14px 36px rgba(0,0,0,.42)';
  panel.style.backdropFilter = 'blur(18px)';
  panel.style.webkitBackdropFilter = 'blur(18px)';
  panel.style.fontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';

  panel.innerHTML = `
    <div style="font-size:12px;color:rgba(255,255,255,.58);margin-bottom:6px;">
      Firebase 現在UID
    </div>
    <div id="currentUidCheckValue"
      style="font-size:13px;line-height:1.45;word-break:break-all;font-weight:700;">
      読み込み中…
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button id="currentUidCopyBtn" type="button"
        style="flex:1;min-height:38px;border:0;border-radius:12px;background:#2d756f;color:#fff;font-weight:700;">
        UIDをコピー
      </button>
      <button id="currentUidCloseBtn" type="button"
        style="min-width:72px;min-height:38px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.06);color:#fff;">
        閉じる
      </button>
    </div>
  `;

  document.body.appendChild(panel);

  panel.querySelector('#currentUidCloseBtn')?.addEventListener('click', () => {
    panel?.remove();
    panel = null;
  });

  return panel;
}

async function copyText(text) {
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

async function showCurrentUid() {
  const ui = createPanel();
  const valueEl = ui.querySelector('#currentUidCheckValue');
  const copyBtn = ui.querySelector('#currentUidCopyBtn');

  try {
    const uid =
      Firebase.getCurrentUid() ||
      await Firebase.ensureSignedIn();

    if (!uid) {
      throw new Error('UIDを取得できませんでした');
    }

    valueEl.textContent = uid;

    copyBtn.onclick = async () => {
      try {
        await copyText(uid);
        copyBtn.textContent = 'コピーしました';
        window.setTimeout(() => {
          if (copyBtn) copyBtn.textContent = 'UIDをコピー';
        }, 1500);
      } catch (error) {
        console.warn('[current-uid-check] コピー失敗', error);
      }
    };
  } catch (error) {
    console.error('[current-uid-check] UID取得失敗', error);
    valueEl.textContent =
      error?.message || 'UIDの取得に失敗しました';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      window.setTimeout(showCurrentUid, 800);
    },
    { once: true },
  );
} else {
  window.setTimeout(showCurrentUid, 800);
}
