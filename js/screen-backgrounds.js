// ============================================================
// screen-backgrounds.js
// Calculator 0209
//
// 各iPhoneごとに好きな写真を背景に設定。
// 画像はIndexedDBへ端末ローカル保存。
// 相手側の背景設定には影響しない。
// ============================================================

const DB_NAME =
  'calculator0209-screen-backgrounds';

const DB_VERSION = 1;
const STORE_NAME = 'backgrounds';

const SCREENS = [
  {
    key: 'messages',
    label: 'AI Space',
    selectors: ['#messages'],
  },
  {
    key: 'history',
    label: 'メッセージ履歴',
    selectors: ['#messageHistoryV2'],
  },
  {
    key: 'historyDetail',
    label: '履歴詳細',
    selectors: ['#messageHistoryDetailV2'],
  },
  {
    key: 'workspace',
    label: 'Workspace',
    selectors: ['#workspace'],
  },
  {
    key: 'calendar',
    label: 'Calendar',
    selectors: ['#calendar', '.calendar', '[data-screen="calendar"]'],
  },
  {
    key: 'archive',
    label: 'Archive',
    selectors: ['#archive', '.archive', '[data-screen="archive"]'],
  },
  {
    key: 'photo',
    label: 'Photo',
    selectors: ['#photo'],
  },
  {
    key: 'records',
    label: 'Records',
    selectors: ['#records'],
  },
];

const objectUrls =
  new Map();

function openDb() {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const request =
        indexedDB.open(
          DB_NAME,
          DB_VERSION,
        );

      request.onupgradeneeded =
        () => {
          const db =
            request.result;

          if (
            !db.objectStoreNames
              .contains(
                STORE_NAME,
              )
          ) {
            db.createObjectStore(
              STORE_NAME,
            );
          }
        };

      request.onsuccess =
        () =>
          resolve(
            request.result,
          );

      request.onerror =
        () =>
          reject(
            request.error,
          );
    },
  );
}

async function getBlob(
  key,
) {
  const db =
    await openDb();

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          STORE_NAME,
          'readonly',
        );

      const store =
        tx.objectStore(
          STORE_NAME,
        );

      const request =
        store.get(key);

      request.onsuccess =
        () =>
          resolve(
            request.result ??
            null,
          );

      request.onerror =
        () =>
          reject(
            request.error,
          );

      tx.oncomplete =
        () =>
          db.close();
    },
  );
}

async function setBlob(
  key,
  blob,
) {
  const db =
    await openDb();

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          STORE_NAME,
          'readwrite',
        );

      const store =
        tx.objectStore(
          STORE_NAME,
        );

      store.put(
        blob,
        key,
      );

      tx.oncomplete =
        () => {
          db.close();
          resolve();
        };

      tx.onerror =
        () => {
          db.close();
          reject(
            tx.error,
          );
        };
    },
  );
}

async function removeBlob(
  key,
) {
  const db =
    await openDb();

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          STORE_NAME,
          'readwrite',
        );

      tx.objectStore(
        STORE_NAME,
      ).delete(key);

      tx.oncomplete =
        () => {
          db.close();
          resolve();
        };

      tx.onerror =
        () => {
          db.close();
          reject(
            tx.error,
          );
        };
    },
  );
}

function revokeUrl(
  key,
) {
  const old =
    objectUrls.get(key);

  if (old) {
    URL.revokeObjectURL(
      old,
    );

    objectUrls.delete(
      key,
    );
  }
}

function getTargets(
  screen,
) {
  const result = [];

  screen.selectors
    .forEach(
      (selector) => {
        document
          .querySelectorAll(
            selector,
          )
          .forEach(
            (element) => {
              if (
                !result.includes(
                  element,
                )
              ) {
                result.push(
                  element,
                );
              }
            },
          );
      },
    );

  return result;
}

function setElementBackground(
  element,
  key,
  url,
) {
  if (
    key === 'history' ||
    key === 'historyDetail'
  ) {
    const historyBackground =
      url
        ? `url("${url}")`
        : 'url("assets/history-default.jpeg")';

    element.style
      .setProperty(
        '--history-user-bg',
        historyBackground,
      );

    return;
  }

  if (url) {
    element.classList.add(
      'has-user-screen-bg',
    );

    element.style
      .setProperty(
        '--user-screen-bg',
        `url("${url}")`,
      );
  } else {
    element.classList.remove(
      'has-user-screen-bg',
    );

    element.style
      .removeProperty(
        '--user-screen-bg',
      );
  }
}

async function applyScreen(
  screen,
) {
  let blob = null;

  try {
    blob =
      await getBlob(
        screen.key,
      );
  } catch (
    error
  ) {
    console.warn(
      '[screen-backgrounds] 背景取得失敗',
      screen.key,
      error,
    );
  }

  revokeUrl(
    screen.key,
  );

  const url =
    blob instanceof Blob
      ? URL.createObjectURL(
          blob,
        )
      : null;

  if (url) {
    objectUrls.set(
      screen.key,
      url,
    );
  }

  getTargets(
    screen,
  ).forEach(
    (element) => {
      setElementBackground(
        element,
        screen.key,
        url,
      );
    },
  );

  updateStatus(
    screen.key,
    Boolean(url),
  );
}

async function applyAll() {
  for (
    const screen
    of SCREENS
  ) {
    await applyScreen(
      screen,
    );
  }
}

function updateStatus(
  key,
  isCustom,
) {
  const label =
    document.querySelector(
      `[data-bg-status="${key}"]`,
    );

  if (label) {
    label.textContent =
      isCustom
        ? '写真設定済み'
        : 'デフォルト';
  }
}

function createRow(
  screen,
) {
  const row =
    document.createElement('div');

  row.className =
    'screen-bg-row';

  const text =
    document.createElement('div');

  text.className =
    'screen-bg-row-text';

  const title =
    document.createElement('strong');

  title.textContent =
    `${screen.label} 背景`;

  const status =
    document.createElement('span');

  status.dataset
    .bgStatus =
      screen.key;

  status.textContent =
    'デフォルト';

  text.append(
    title,
    status,
  );

  const buttons =
    document.createElement('div');

  buttons.className =
    'screen-bg-row-actions';

  const choose =
    document.createElement('label');

  choose.className =
    'screen-bg-choose';

  choose.textContent =
    '写真を選ぶ';

  const input =
    document.createElement('input');

  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;

  input.addEventListener(
    'change',
    async () => {
      const file =
        input.files?.[0];

      if (!file) {
        return;
      }

      try {
        await setBlob(
          screen.key,
          file,
        );

        await applyScreen(
          screen,
        );
      } catch (
        error
      ) {
        console.error(
          '[screen-backgrounds] 背景保存失敗',
          error,
        );

        window.alert(
          '背景画像を保存できませんでした。',
        );
      } finally {
        input.value = '';
      }
    },
  );

  choose.appendChild(
    input,
  );

  const reset =
    document.createElement('button');

  reset.type =
    'button';

  reset.className =
    'screen-bg-reset';

  reset.textContent =
    '戻す';

  reset.addEventListener(
    'click',
    async () => {
      try {
        await removeBlob(
          screen.key,
        );

        await applyScreen(
          screen,
        );
      } catch (
        error
      ) {
        console.error(
          '[screen-backgrounds] 背景リセット失敗',
          error,
        );
      }
    },
  );

  buttons.append(
    choose,
    reset,
  );

  row.append(
    text,
    buttons,
  );

  return row;
}

function injectSettings() {
  if (
    document.getElementById(
      'screenBackgroundSettings',
    )
  ) {
    return;
  }

  const body =
    document.querySelector(
      '.settings-body',
    );

  if (!body) {
    return;
  }

  const section =
    document.createElement(
      'section',
    );

  section.id =
    'screenBackgroundSettings';

  section.className =
    'screen-bg-settings';

  const heading =
    document.createElement(
      'div',
    );

  heading.className =
    'screen-bg-heading';

  heading.innerHTML = `
    <h3>背景写真</h3>
    <p>このiPhoneだけに保存されます。相手の背景は変わりません。</p>
  `;

  section.appendChild(
    heading,
  );

  SCREENS.forEach(
    (screen) => {
      section.appendChild(
        createRow(
          screen,
        ),
      );
    },
  );

  body.appendChild(
    section,
  );
}

function install() {
  injectSettings();
  applyAll();

  // 履歴画面は動的生成なので、生成されたら再適用。
  window.addEventListener(
    'calculator0209-history-v2-ready',
    () => {
      applyAll();
    },
  );

  // 設定画面の再描画に備えて監視。
  const observer =
    new MutationObserver(
      () => {
        injectSettings();
      },
    );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true,
    },
  );
}

if (
  document.readyState ===
  'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    install,
    {
      once: true,
    },
  );
} else {
  install();
}
