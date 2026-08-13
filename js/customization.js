// ============================================================

// customization.js

// Workspaceの「共有カスタマイズ」（Workspaceタイトル・カードの表示名/

// アイコン/並び順・画面ごとの背景プリセット）を管理するモジュール。

//

// 【基本方針】

// ・変更した瞬間にローカルへ反映する。

// ・画面はFirebase通信を待たず即座に更新する。

// ・ペアリング済みなら、その後Firestoreへ同期する。

// ・未ペアリングでも端末内ではカスタマイズを利用できる。

// ・Firestoreから共有設定が届いたら相手と同期する。

// ============================================================

import Storage, { STORAGE_KEYS } from './storage.js';

import Firebase from './firebase.js';

/**

 * @typedef {Object} CardOverride

 * @property {string} [label]

 * @property {string} [icon]

 * @property {number} [order]

 *

 * @typedef {Object} Customization

 * @property {string|null} workspaceTitle

 * @property {Object.<string, CardOverride>} cards

 * @property {Object.<string, string>} backgrounds

 */

// ------------------------------------------------------------

// デフォルト

// ------------------------------------------------------------

export const DEFAULT_CUSTOMIZATION = Object.freeze({

  workspaceTitle: null,

  cards: Object.freeze({}),

  backgrounds: Object.freeze({}),

});

// ------------------------------------------------------------

// 背景プリセット

// ------------------------------------------------------------

export const BACKGROUND_PRESETS = Object.freeze([

  { id: 'default', label: 'デフォルト' },

  { id: 'wood', label: '木目' },

  { id: 'black', label: 'ブラック' },

  { id: 'black-glass', label: 'ブラックガラス' },

  { id: 'dark-gray', label: 'ダークグレー' },

  { id: 'navy', label: 'ネイビー' },

  { id: 'gold', label: 'ゴールド' },

  { id: 'abstract', label: '抽象グラデーション' },

]);

export const CUSTOMIZABLE_SCREENS = Object.freeze([

  { key: 'workspace', label: 'Workspace' },

  { key: 'messages', label: 'メッセージ' },

  { key: 'archive', label: 'Archive' },

  { key: 'calendar', label: 'カレンダー' },

  { key: 'photo', label: '写真' },


]);

// ------------------------------------------------------------

// Workspaceカード

// ------------------------------------------------------------

export const DEFAULT_CARD_DEFINITIONS = Object.freeze([

  Object.freeze({

    key: 'messages',

    label: 'メッセージ',

    icon: '💬',

  }),

  Object.freeze({

    key: 'archive',

    label: 'Archive',

    icon: '📚',

  }),

  Object.freeze({

    key: 'calendar',

    label: 'カレンダー',

    icon: '📅',

  }),

  Object.freeze({

    key: 'photo',

    label: '写真',

    icon: '📷',

  }),

]);

const VALID_PRESET_IDS = new Set(

  BACKGROUND_PRESETS.map(

    (preset) => preset.id,

  ),

);

// ------------------------------------------------------------

// 正規化

// ------------------------------------------------------------

function normalize(raw) {

  const workspaceTitle =

    typeof raw?.workspaceTitle === 'string' &&

    raw.workspaceTitle.trim() !== ''

      ? raw.workspaceTitle.trim()

      : null;

  const cards = {};

  if (

    raw?.cards &&

    typeof raw.cards === 'object'

  ) {

    Object.entries(

      raw.cards,

    ).forEach(([key, value]) => {

      if (

        !value ||

        typeof value !== 'object'

      ) {

        return;

      }

      const override = {};

      if (

        typeof value.label === 'string' &&

        value.label.trim() !== ''

      ) {

        override.label =

          value.label.trim();

      }

      if (

        typeof value.icon === 'string' &&

        value.icon.trim() !== ''

      ) {

        override.icon =

          value.icon.trim();

      }

      if (

        typeof value.order === 'number' &&

        Number.isFinite(

          value.order,

        )

      ) {

        override.order =

          value.order;

      }

      cards[key] = override;

    });

  }

  const backgrounds = {};

  if (

    raw?.backgrounds &&

    typeof raw.backgrounds === 'object'

  ) {

    Object.entries(

      raw.backgrounds,

    ).forEach(([key, value]) => {

      if (

        typeof value === 'string' &&

        VALID_PRESET_IDS.has(

          value,

        )

      ) {

        backgrounds[key] =

          value;

      }

    });

  }

  return {

    workspaceTitle,

    cards,

    backgrounds,

  };

}

// ------------------------------------------------------------

// キャッシュ

// ------------------------------------------------------------

function loadCache() {

  const cached = Storage.get(

    STORAGE_KEYS.WORKSPACE_CUSTOMIZATION_CACHE,

    DEFAULT_CUSTOMIZATION,

  );

  return normalize(cached);

}

function saveCache(customization) {

  Storage.set(

    STORAGE_KEYS.WORKSPACE_CUSTOMIZATION_CACHE,

    customization,

  );

}

// ------------------------------------------------------------

// 現在値

// ------------------------------------------------------------

let current = loadCache();

const listeners = new Set();

function notifyAll() {

  listeners.forEach(

    (callback) => {

      try {

        callback(current);

      } catch (error) {

        console.warn(

          '[customization.js] 購読コールバックでエラーが発生しました',

          error,

        );

      }

    },

  );

}

// ------------------------------------------------------------

// 深いパスへの書き込み

// ------------------------------------------------------------

function setDeep(

  target,

  path,

  value,

) {

  const segments =

    path.split('.');

  let cursor = target;

  for (

    let i = 0;

    i < segments.length - 1;

    i += 1

  ) {

    const segment =

      segments[i];

    if (

      typeof cursor[segment] !==

        'object' ||

      cursor[segment] === null

    ) {

      cursor[segment] = {};

    } else {

      cursor[segment] = {

        ...cursor[segment],

      };

    }

    cursor =

      cursor[segment];

  }

  cursor[

    segments[

      segments.length - 1

    ]

  ] = value;

}

// ------------------------------------------------------------

// ローカル即時反映

// ------------------------------------------------------------

function applyLocalUpdate(partial) {

  const next = {

    ...current,

    cards: {

      ...(current.cards ?? {}),

    },

    backgrounds: {

      ...(current.backgrounds ?? {}),

    },

  };

  Object.entries(

    partial,

  ).forEach(

    ([path, value]) => {

      setDeep(

        next,

        path,

        value,

      );

    },

  );

  current =

    normalize(next);

  saveCache(current);

  notifyAll();

}

// ------------------------------------------------------------

// カスタマイズが空かどうか

// ------------------------------------------------------------

function hasCustomization(

  customization,

) {

  if (!customization) {

    return false;

  }

  if (

    customization.workspaceTitle

  ) {

    return true;

  }

  if (

    Object.keys(

      customization.cards ?? {},

    ).length > 0

  ) {

    return true;

  }

  if (

    Object.keys(

      customization.backgrounds ??

        {},

    ).length > 0

  ) {

    return true;

  }

  return false;

}

// ------------------------------------------------------------

// Firestore購読

// ------------------------------------------------------------

let unsubscribeRoom = null;

let hasReceivedRoomSnapshot = false;

export function start() {

  const roomId =

    Firebase.getLocalRoomId();

  if (!roomId) {

    return;

  }

  stop();

  hasReceivedRoomSnapshot =

    false;

  unsubscribeRoom =

    Firebase.subscribeToRoom(

      roomId,

      (roomData) => {

        const remote =

          normalize(

            roomData.customization,

          );

        /*

         * 初回だけ、

         * Firestore側が空で

         * この端末に既存カスタマイズがある場合は

         * ローカル値をFirestoreへ送る。

         *

         * これにより、ペアリング前に変更した設定が

         * ペアリング直後に消えるのを防ぐ。

         */

        if (

          !hasReceivedRoomSnapshot &&

          !hasCustomization(

            remote,

          ) &&

          hasCustomization(

            current,

          )

        ) {

          hasReceivedRoomSnapshot =

            true;

          Firebase.updateRoomCustomization(

            roomId,

            {

              workspaceTitle:

                current.workspaceTitle,

              cards:

                current.cards,

              backgrounds:

                current.backgrounds,

            },

          ).catch(

            (error) => {

              console.warn(

                '[customization.js] ローカル設定の初回同期に失敗しました',

                error,

              );

            },

          );

          return;

        }

        hasReceivedRoomSnapshot =

          true;

        current = remote;

        saveCache(current);

        notifyAll();

      },

      (error) => {

        console.warn(

          '[customization.js] 共有カスタマイズの購読に失敗しました',

          error,

        );

      },

    );

}

export function stop() {

  if (unsubscribeRoom) {

    unsubscribeRoom();

    unsubscribeRoom = null;

  }

  hasReceivedRoomSnapshot =

    false;

}

// ------------------------------------------------------------

// 参照

// ------------------------------------------------------------

export function getCached() {

  return current;

}

export function subscribe(

  callback,

) {

  if (

    typeof callback !==

    'function'

  ) {

    return () => {};

  }

  listeners.add(callback);

  callback(current);

  return () =>

    listeners.delete(

      callback,

    );

}

// ------------------------------------------------------------

// カード取得

// ------------------------------------------------------------

export function getEffectiveCards() {

  const overrides =

    current.cards ?? {};

  const merged =

    DEFAULT_CARD_DEFINITIONS.map(

      (

        definition,

        index,

      ) => {

        const override =

          overrides[

            definition.key

          ] ?? {};

        return {

          key:

            definition.key,

          label:

            override.label ??

            definition.label,

          icon:

            override.icon ??

            definition.icon,

          order:

            typeof override.order ===

            'number'

              ? override.order

              : index,

        };

      },

    );

  merged.sort(

    (a, b) =>

      a.order - b.order,

  );

  return merged;

}

// ------------------------------------------------------------

// 更新

// ------------------------------------------------------------

export async function update(

  partial,

) {

  if (

    !partial ||

    typeof partial !==

      'object'

  ) {

    return;

  }

  /*

   * 最重要：

   * Firebase通信より先に

   * iPhone上へ即時反映する。

   */

  applyLocalUpdate(partial);

  const roomId =

    Firebase.getLocalRoomId();

  /*

   * 未ペアリングでも

   * ローカル設定として正常に利用可能。

   */

  if (!roomId) {

    return;

  }

  /*

   * ペアリング済みなら

   * Firestoreへ共有。

   *

   * 通信失敗でもローカル反映は維持する。

   */

  try {

    await Firebase.updateRoomCustomization(

      roomId,

      partial,

    );

  } catch (error) {

    console.warn(

      '[customization.js] Firestoreへのカスタマイズ同期に失敗しました。ローカル設定は維持します。',

      error,

    );

  }

}

// ------------------------------------------------------------

// カード編集

// ------------------------------------------------------------

export async function updateCard(

  cardKey,

  changes,

) {

  const partial = {};

  if (

    typeof changes.label ===

    'string'

  ) {

    partial[

      `cards.${cardKey}.label`

    ] =

      changes.label.trim();

  }

  if (

    typeof changes.icon ===

    'string'

  ) {

    partial[

      `cards.${cardKey}.icon`

    ] =

      changes.icon.trim();

  }

  if (

    Object.keys(

      partial,

    ).length === 0

  ) {

    return;

  }

  await update(partial);

}

// ------------------------------------------------------------

// カード並び替え

// ------------------------------------------------------------

export async function updateCardOrder(

  orderByKey,

) {

  const partial = {};

  Object.entries(

    orderByKey,

  ).forEach(

    ([cardKey, order]) => {

      partial[

        `cards.${cardKey}.order`

      ] = order;

    },

  );

  await update(partial);

}

// ------------------------------------------------------------

// Workspaceタイトル

// ------------------------------------------------------------

export async function updateWorkspaceTitle(

  title,

) {

  const trimmed =

    typeof title === 'string'

      ? title.trim()

      : '';

  await update({

    workspaceTitle:

      trimmed === ''

        ? null

        : trimmed,

  });

}

// ------------------------------------------------------------

// 背景

// ------------------------------------------------------------

export async function updateBackground(

  screenKey,

  presetId,

) {

  if (

    !VALID_PRESET_IDS.has(

      presetId,

    )

  ) {

    return;

  }

  const isCustomizableScreen =

    CUSTOMIZABLE_SCREENS.some(

      (screen) =>

        screen.key ===

        screenKey,

    );

  if (

    !isCustomizableScreen

  ) {

    return;

  }

  await update({

    [`backgrounds.${screenKey}`]:

      presetId,

  });

}

// ------------------------------------------------------------

// リセット

// ------------------------------------------------------------

export async function resetAll() {

  /*

   * まずローカルを即時リセット。

   */

  current =

    normalize(

      DEFAULT_CUSTOMIZATION,

    );

  saveCache(current);

  notifyAll();

  const roomId =

    Firebase.getLocalRoomId();

  if (!roomId) {

    return;

  }

  try {

    await Firebase.updateRoomCustomization(

      roomId,

      {

        workspaceTitle: null,

        cards: {},

        backgrounds: {},

      },

    );

  } catch (error) {

    console.warn(

      '[customization.js] Firestore側のカスタマイズリセットに失敗しました',

      error,

    );

  }

}

// ------------------------------------------------------------

// 背景クラス

// ------------------------------------------------------------

export function applyBackgroundClass(

  element,

  classPrefix,

  presetId,

) {

  if (!element) {

    return;

  }

  const activeId =

    presetId &&

    VALID_PRESET_IDS.has(

      presetId,

    )

      ? presetId

      : 'default';

  BACKGROUND_PRESETS.forEach(

    (preset) => {

      element.classList.toggle(

        `${classPrefix}-bg--${preset.id}`,

        preset.id ===

          activeId,

      );

    },

  );

}

// ------------------------------------------------------------

// default export

// ------------------------------------------------------------

const Customization = {

  DEFAULT_CUSTOMIZATION,

  BACKGROUND_PRESETS,

  CUSTOMIZABLE_SCREENS,

  DEFAULT_CARD_DEFINITIONS,

  getEffectiveCards,

  start,

  stop,

  getCached,

  subscribe,

  update,

  updateCard,

  updateCardOrder,

  updateWorkspaceTitle,

  updateBackground,

  resetAll,

  applyBackgroundClass,

};

export default Customization;