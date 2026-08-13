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
    key: 'workspace',
    label: 'Workspace',
    selectors: ['#workspace'],
  },
  {
    key: 'messages',
    label: 'メッセージ',
    selectors: ['#messages'],
  },
  {
    key: 'history',
    label: '履歴',
    selectors: [
      '#messageHistoryV2',
      '#messageHistoryDetailV2',
    ],
  },
  {
    key: 'archive',
    label: 'Archive',
    selectors: [
      '#archive',
      '.archive',
      '[data-screen="archive"]',
    ],
  },
  {
    key: 'calendar',
    label: 'カレンダー',
    selectors: [
      '#calendar',
      '.calendar',
      '[data-screen="calendar"]',
    ],
  },
  {
    key: 'photo',
    label: '思い出',
    selectors: ['#photo'],
  },
];

function getLinkedLabel(
  screen,
) {
  try {
    const raw =
      window.localStorage.getItem(
        'calculator0209_workspace_customization_cache',
      );

    const parsed =
      raw
        ? JSON.parse(raw)
        : null;

    const cards =
      parsed?.cards ??
      {};

    const workspaceTitle =
      parsed?.workspaceTitle;

    if (
      screen.key ===
      'workspace'
    ) {
      return (
        typeof workspaceTitle === 'string' &&
        workspaceTitle.trim()
          ? workspaceTitle.trim()
          : 'Workspace'
      );
    }

    if (
      screen.key ===
      'history'
    ) {
      return '履歴';
    }

    const override =
      cards?.[
        screen.key
      ]?.label;

    if (
      typeof override === 'string' &&
      override.trim()
    ) {
      return override.trim();
    }
  } catch (
    error
  ) {
    console.warn(
      '[screen-backgrounds] 表示名の取得に失敗しました',
      error,
    );
  }

  return screen.label;
}


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
  try {
    const db =
      await openDb();

    return await new Promise(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            STORE_NAME,
            'readonly',
          );

        const request =
          tx.objectStore(
            STORE_NAME,
          ).get(key);

        request.onsuccess =
          () => {
            const result =
              request.result ??
              null;
            db.close();

            if (result) {
              resolve(result);
              return;
            }

            getFallbackBlob(
              key,
            )
              .then(resolve)
              .catch(
                () =>
                  resolve(null),
              );
          };

        request.onerror =
          () => {
            db.close();
            reject(
              request.error,
            );
          };
      },
    );
  } catch (error) {
    console.warn(
      '[screen-backgrounds] IndexedDB読込失敗',
      error,
    );

    return getFallbackBlob(
      key,
    );
  }
}

async function setBlob(
  key,
  blob,
) {
  try {
    const db =
      await openDb();

    await new Promise(
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
        ).put(
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

    try {
      localStorage.removeItem(
        fallbackKey(key),
      );
    } catch (_) {}

    return;
  } catch (error) {
    console.warn(
      '[screen-backgrounds] IndexedDB保存失敗。端末内保存へ切替',
      error,
    );
  }

  const dataUrl =
    await blobToDataUrl(
      blob,
    );

  localStorage.setItem(
    fallbackKey(key),
    dataUrl,
  );
}

async function removeBlob(
  key,
) {
  try {
    const db =
      await openDb();

    await new Promise(
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
  } catch (error) {
    console.warn(
      '[screen-backgrounds] IndexedDB削除失敗',
      error,
    );
  }

  try {
    localStorage.removeItem(
      fallbackKey(key),
    );
  } catch (_) {}
}

function fallbackKey(
  key,
) {
  return `calculator0209_bg_${key}`;
}

function blobToDataUrl(
  blob,
) {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const reader =
        new FileReader();

      reader.onload =
        () =>
          resolve(
            String(
              reader.result ?? '',
            ),
          );

      reader.onerror =
        () =>
          reject(
            reader.error,
          );

      reader.readAsDataURL(
        blob,
      );
    },
  );
}

async function getFallbackBlob(
  key,
) {
  try {
    const dataUrl =
      localStorage.getItem(
        fallbackKey(key),
      );

    if (!dataUrl) {
      return null;
    }

    const response =
      await fetch(
        dataUrl,
      );

    return await response.blob();
  } catch (error) {
    console.warn(
      '[screen-backgrounds] 端末内背景の読込失敗',
      error,
    );

    return null;
  }
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
    key === 'history'
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


const BACKGROUND_UI_VERSION =
  '5f';

async function loadImageSource(
  file,
) {
  if (
    typeof createImageBitmap ===
    'function'
  ) {
    try {
      return await createImageBitmap(
        file,
        {
          imageOrientation:
            'from-image',
        },
      );
    } catch (
      error
    ) {
      console.warn(
        '[screen-backgrounds] createImageBitmapで読めなかったためimg要素へ切替',
        error,
      );
    }
  }

  const objectUrl =
    URL.createObjectURL(
      file,
    );

  try {
    return await new Promise(
      (
        resolve,
        reject,
      ) => {
        const image =
          new Image();

        image.onload =
          () =>
            resolve(
              image,
            );

        image.onerror =
          () =>
            reject(
              new Error(
                'この写真形式をSafariで読み込めませんでした。',
              ),
            );

        image.src =
          objectUrl;
      },
    );
  } finally {
    // img.onload後でも描画完了まではsrcが参照されるため、
    // revokeは呼び出し側の描画後に行う。
  }
}

function sourceDimensions(
  source,
) {
  return {
    width:
      source.width ??
      source.naturalWidth ??
      0,
    height:
      source.height ??
      source.naturalHeight ??
      0,
  };
}

function canvasToJpegBlob(
  canvas,
  quality,
) {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      canvas.toBlob(
        (
          blob,
        ) => {
          if (
            blob instanceof Blob
          ) {
            resolve(
              blob,
            );
            return;
          }

          reject(
            new Error(
              '写真をJPEGへ変換できませんでした。',
            ),
          );
        },
        'image/jpeg',
        quality,
      );
    },
  );
}

async function prepareBackgroundBlob(
  file,
) {
  const source =
    await loadImageSource(
      file,
    );

  try {
    const {
      width,
      height,
    } =
      sourceDimensions(
        source,
      );

    if (
      !width ||
      !height
    ) {
      throw new Error(
        '写真のサイズを取得できませんでした。',
      );
    }

    // iPhone背景には十分な解像度を保ちつつ、
    // Safariの保存容量に収まりやすくする。
    const MAX_EDGE =
      1280;

    const scale =
      Math.min(
        1,
        MAX_EDGE /
          Math.max(
            width,
            height,
          ),
      );

    const outputWidth =
      Math.max(
        1,
        Math.round(
          width *
          scale,
        ),
      );

    const outputHeight =
      Math.max(
        1,
        Math.round(
          height *
          scale,
        ),
      );

    const canvas =
      document.createElement(
        'canvas',
      );

    canvas.width =
      outputWidth;

    canvas.height =
      outputHeight;

    const context =
      canvas.getContext(
        '2d',
        {
          alpha:
            false,
        },
      );

    if (
      !context
    ) {
      throw new Error(
        '写真変換用Canvasを作成できませんでした。',
      );
    }

    context.fillStyle =
      '#000';

    context.fillRect(
      0,
      0,
      outputWidth,
      outputHeight,
    );

    context.drawImage(
      source,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    // 保存上限に引っかかりにくいよう、
    // 必要なら段階的に圧縮する。
    const qualities =
      [
        0.78,
        0.68,
        0.58,
        0.48,
      ];

    let result =
      null;

    for (
      const quality
      of qualities
    ) {
      result =
        await canvasToJpegBlob(
          canvas,
          quality,
        );

      if (
        result.size <=
        850 * 1024
      ) {
        break;
      }
    }

    if (
      !(result instanceof Blob)
    ) {
      throw new Error(
        '背景用写真を作成できませんでした。',
      );
    }

    return result;
  } finally {
    if (
      typeof source.close ===
      'function'
    ) {
      source.close();
    }

    if (
      source instanceof
      HTMLImageElement
    ) {
      try {
        URL.revokeObjectURL(
          source.src,
        );
      } catch (_) {}
    }
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

  const linkedLabel =
    getLinkedLabel(
      screen,
    );

  title.textContent =
    `${linkedLabel} 背景`;

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
        const preparedBlob =
          await prepareBackgroundBlob(
            file,
          );

        await setBlob(
          screen.key,
          preparedBlob,
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
          error?.message ||
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
  const existing =
    document.getElementById(
      'screenBackgroundSettings',
    );

  if (
    existing?.dataset
      .backgroundUiVersion ===
    BACKGROUND_UI_VERSION
  ) {
    return;
  }

  if (
    existing
  ) {
    existing.remove();
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

  section.dataset
    .backgroundUiVersion =
      BACKGROUND_UI_VERSION;

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
