// ============================================================
// passcode-settings.js
// Calculator 0209 v56
// 各iPhoneで個別パスコードを設定
// ============================================================

import Passcode from './passcode.js';

function ensurePasscodeSettings() {
  if (document.getElementById('customPasscodeSettings')) return;

  const body = document.querySelector('.settings-body');
  if (!body) return;

  const section = document.createElement('section');
  section.id = 'customPasscodeSettings';
  section.className = 'custom-passcode-settings';

  section.innerHTML = `
    <div class="custom-passcode-heading">
      <h3>パスコード</h3>
      <p>このiPhoneだけのパスコードを4〜8桁の数字で設定できます。</p>
    </div>

    <div class="custom-passcode-row">
      <input
        id="customPasscodeInput"
        type="password"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="8"
        placeholder="新しいパスコード"
        aria-label="新しいパスコード"
      >
      <button
        id="customPasscodeSaveBtn"
        type="button"
      >保存</button>
    </div>

    <div id="customPasscodeStatus" class="custom-passcode-status"></div>
  `;

  body.appendChild(section);

  const input = section.querySelector('#customPasscodeInput');
  const save = section.querySelector('#customPasscodeSaveBtn');
  const status = section.querySelector('#customPasscodeStatus');

  const renderStatus = (prefix = '現在') => {
    const current = Passcode.getPasscode();
    status.textContent =
      `${prefix}: ${'•'.repeat(current.length)}（${current.length}桁）`;
  };

  renderStatus();

  input.addEventListener('input', () => {
    input.value =
      input.value
        .replace(/\D/g, '')
        .slice(0, 8);
  });

  save.addEventListener('click', () => {
    try {
      Passcode.setPasscode(input.value);
      input.value = '';
      renderStatus('保存しました');
    } catch (error) {
      status.textContent =
        error?.message || '保存できませんでした。';
    }
  });
}

function install() {
  ensurePasscodeSettings();

  const observer = new MutationObserver(() => {
    ensurePasscodeSettings();
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
