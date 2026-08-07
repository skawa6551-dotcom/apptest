// ============================================================
// customization.js
// Workspaceの「共有カスタマイズ」（Workspaceタイトル・カードの表示名/
// アイコン/並び順・画面ごとの背景プリセット）を管理するモジュール。
//
// 【役割分担（重要）】
// このアプリの設定は2種類に分かれる：
//   ・端末ごとの設定（FaceID・自動ロック・通知・音・バイブレーション等）
//     → 従来通り settings.js が localStorage（Storage経由）で管理する。
//       このファイルでは一切扱わない。
//   ・Workspace共有のカスタマイズ（タイトル・カード・背景）
//     → このファイルが Firestore の rooms/{roomId}.customization を
//       正として管理する。ペアリングした相手と同じ内容が同期される。
//
// 【オフライン・起動速度への配慮】
// Firestoreを正としつつ、直近の値をStorage（localStorage）へ
// キャッシュする。起動直後・オフライン時はこのキャッシュを即座に返し、
// Firestoreからの実際の値が届き次第、購読者へ変更を通知して
// 画面を更新する（storage.jsのsubscribe()と同じ「まず即値、後で正確な
// 値に更新される」という考え方）。
//
// Firestoreへの書き込みはfirebase.jsのupdateRoomCustomization()を
// 経由し、このファイル自身はFirestore SDKを直接扱わない
// （firebase.jsが唯一の窓口、という既存の設計方針を維持する）。
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
 * @property {string|null} workspaceTitle - nullの場合はデフォルト「Workspace」を使う
 * @property {Object.<string, CardOverride>} cards - カードkey → 上書き内容
 * @property {Object.<string, string>} backgrounds - 画面key → 背景プリセットid
 */

/** カスタマイズが何も無い状態（初期値・リセット後の値） */
export const DEFAULT_CUSTOMIZATION = Object.freeze({
  workspaceTitle: null,
  cards: Object.freeze({}),
  backgrounds: Object.freeze({}),
});

/**
 * 背景プリセットの定義。電卓画面はこの対象から除外している
 * （電卓はアプリの入口であり、常に木目デザインに固定するため、
 * customization.js・設定画面のどちらからも変更できない）。
 * 各画面のCSS側では、'default'以外のidに対応する
 * `{prefix}-bg--{id}` というクラスを用意する想定。
 * 'default'はどのクラスも付与しない（＝各画面が元々持つ既定の見た目）。
 */
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

/** 背景カスタマイズの対象画面（電卓は含めない）。 */
export const CUSTOMIZABLE_SCREENS = Object.freeze([
  { key: 'workspace', label: 'Workspace' },
  { key: 'messages', label: 'メッセージ' },
  { key: 'archive', label: 'Archive' },
  { key: 'calendar', label: 'カレンダー' },
  { key: 'photo', label: '写真' },
  { key: 'places', label: '行きたい場所' },
]);

/**
 * Workspaceカードの既定の定義（表示ラベル・data-secret属性の値・アイコン・
 * 既定の並び順）。workspace.js（カード実表示）とapp.js（設定画面の
 * カード編集UI）の両方がこの1つの定義を参照する（二重定義を避けるため）。
 * 'settings'（設定）カードはカスタマイズ対象外の固定カードのため、
 * ここには含めない。
 */
export const DEFAULT_CARD_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'messages', label: 'メッセージ', icon: '💬' }),
  Object.freeze({ key: 'archive', label: 'Archive', icon: '📚' }),
  Object.freeze({ key: 'calendar', label: 'カレンダー', icon: '📅' }),
  Object.freeze({ key: 'photo', label: '写真', icon: '📷' }),
  Object.freeze({ key: 'places', label: '行きたい場所', icon: '📍' }),
]);

const VALID_PRESET_IDS = new Set(BACKGROUND_PRESETS.map((preset) => preset.id));

/**
 * DEFAULT_CARD_DEFINITIONSに現在のcustomization上書き（表示名・アイコン・
 * 並び順）をマージし、並び順に整列した状態で返す。workspace.js（実際に
 * カードを表示する側）とapp.js（設定画面のカード編集UIを描画する側）の
 * 両方がこの関数を通して同じ結果を得る。
 * @returns {{key: string, label: string, icon: string, order: number}[]}
 */
export function getEffectiveCards() {
  const overrides = current.cards ?? {};

  const merged = DEFAULT_CARD_DEFINITIONS.map((definition, index) => {
    const override = overrides[definition.key] ?? {};
    return {
      key: definition.key,
      label: override.label ?? definition.label,
      icon: override.icon ?? definition.icon,
      order: typeof override.order === 'number' ? override.order : index,
    };
  });

  merged.sort((a, b) => a.order - b.order);
  return merged;
}

// ------------------------------------------------------------
// キャッシュ（Storage経由）
// ------------------------------------------------------------

function loadCache() {
  const cached = Storage.get(STORAGE_KEYS.WORKSPACE_CUSTOMIZATION_CACHE, DEFAULT_CUSTOMIZATION);
  return normalize(cached);
}

function saveCache(customization) {
  Storage.set(STORAGE_KEYS.WORKSPACE_CUSTOMIZATION_CACHE, customization);
}

/**
 * Firestoreから読み込んだデータ・Storageのキャッシュのどちらも、
 * 想定と異なる形（undefined・不正な型）で来る可能性があるため、
 * 常にこの形へ正規化してから使う。
 * @param {*} raw
 * @returns {Customization}
 */
function normalize(raw) {
  const workspaceTitle = typeof raw?.workspaceTitle === 'string' && raw.workspaceTitle.trim() !== ''
    ? raw.workspaceTitle.trim()
    : null;

  const cards = {};
  if (raw?.cards && typeof raw.cards === 'object') {
    Object.entries(raw.cards).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      const override = {};
      if (typeof value.label === 'string' && value.label.trim() !== '') override.label = value.label.trim();
      if (typeof value.icon === 'string' && value.icon.trim() !== '') override.icon = value.icon.trim();
      if (typeof value.order === 'number' && Number.isFinite(value.order)) override.order = value.order;
      cards[key] = override;
    });
  }

  const backgrounds = {};
  if (raw?.backgrounds && typeof raw.backgrounds === 'object') {
    Object.entries(raw.backgrounds).forEach(([key, value]) => {
      if (typeof value === 'string' && VALID_PRESET_IDS.has(value)) {
        backgrounds[key] = value;
      }
    });
  }

  return { workspaceTitle, cards, backgrounds };
}

/** 現在メモリ上に保持している最新のカスタマイズ値（起動直後はキャッシュ由来）。 */
let current = loadCache();

/** customization変更の購読者一覧。 */
const listeners = new Set();

function notifyAll() {
  listeners.forEach((callback) => {
    try {
      callback(current);
    } catch (error) {
      console.warn('[customization.js] 購読コールバックでエラーが発生しました', error);
    }
  });
}

/**
 * オブジェクトのコピーに対して、'cards.messages.label'のような
 * ドット区切りパスで1箇所だけ値を設定する。Firestoreへ書き込んだ内容を
 * 楽観的にローカルのcurrentへも反映するために使う（実際に正しい値は
 * 次にonSnapshotが届いた時点で上書きされるため、ここでの計算が
 * 多少甘くても実害は無い）。
 * @param {object} target
 * @param {string} path
 * @param {*} value
 */
function setDeep(target, path, value) {
  const segments = path.split('.');
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) {
      cursor[segment] = {};
    } else {
      cursor[segment] = { ...cursor[segment] };
    }
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
}

// ------------------------------------------------------------
// Firestore購読
// ------------------------------------------------------------

/** subscribeToRoom()の購読解除関数。未購読ならnull。 */
let unsubscribeRoom = null;

/**
 * 現在のルーム（Firebase.getLocalRoomId()）に対する購読を開始する。
 * 既にペアリング済みならapp.js初期化時に、まだの場合はペアリング成立時に
 * 呼ぶ想定。何度呼んでも、直前の購読を解除してから新しく張り直すだけなので
 * 安全に呼び直せる。ルーム未接続の場合は何もしない（キャッシュ値のまま）。
 */
export function start() {
  const roomId = Firebase.getLocalRoomId();
  if (!roomId) return;

  stop();

  unsubscribeRoom = Firebase.subscribeToRoom(roomId, (roomData) => {
    current = normalize(roomData.customization);
    saveCache(current);
    notifyAll();
  });
}

/** Firestore購読を止める（通常はアプリ終了まで張りっぱなしでよいが、念のため公開する）。 */
export function stop() {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
}

// ------------------------------------------------------------
// 参照・購読
// ------------------------------------------------------------

/**
 * 現在のカスタマイズ値を返す（起動直後・オフライン時はキャッシュ値）。
 * @returns {Customization}
 */
export function getCached() {
  return current;
}

/**
 * カスタマイズの変更を購読する。登録した時点の値でも一度呼ばれる
 * （storage.jsのsubscribeとは異なり、即座に現在値を受け取れたほうが
 * 各画面の初期描画が書きやすいため）。
 * @param {(customization: Customization) => void} callback
 * @returns {() => void} 購読解除関数
 */
export function subscribe(callback) {
  listeners.add(callback);
  callback(current);
  return () => listeners.delete(callback);
}

// ------------------------------------------------------------
// 更新
// ------------------------------------------------------------

/**
 * customizationの一部をFirestoreへ書き込む。
 * partialのキーは 'workspaceTitle' のようなトップレベルのキーでも、
 * 'cards.messages.label' のような深いパスでもよい。
 * ルーム未接続（ペアリング未完了）の場合はエラーを投げるので、
 * 呼び出し元でcatchして「ペアリング前は保存できません」等を判断すること。
 * @param {Object.<string, unknown>} partial
 * @returns {Promise<void>}
 */
export async function update(partial) {
  const roomId = Firebase.getLocalRoomId();
  if (!roomId) {
    throw new Error('ペアリングが完了するまで、この設定は保存できません。');
  }

  await Firebase.updateRoomCustomization(roomId, partial);

  const next = { ...current, cards: { ...current.cards }, backgrounds: { ...current.backgrounds } };
  Object.entries(partial).forEach(([path, value]) => {
    setDeep(next, path, value);
  });
  current = normalize(next);
  saveCache(current);
  notifyAll();
}

/**
 * カードの表示名・アイコンを変更する。
 * @param {string} cardKey
 * @param {{label?: string, icon?: string}} changes
 */
export async function updateCard(cardKey, changes) {
  const partial = {};
  if (typeof changes.label === 'string') partial[`cards.${cardKey}.label`] = changes.label.trim();
  if (typeof changes.icon === 'string') partial[`cards.${cardKey}.icon`] = changes.icon.trim();
  if (Object.keys(partial).length === 0) return;
  await update(partial);
}

/**
 * カードの並び順（order値）をまとめて更新する。
 * @param {Object.<string, number>} orderByKey - カードkey → order値
 */
export async function updateCardOrder(orderByKey) {
  const partial = {};
  Object.entries(orderByKey).forEach(([cardKey, order]) => {
    partial[`cards.${cardKey}.order`] = order;
  });
  await update(partial);
}

/**
 * Workspaceタイトルを変更する。空文字・空白のみを渡すとデフォルトに戻る
 * （Firestore上はnullを書き込む）。
 * @param {string} title
 */
export async function updateWorkspaceTitle(title) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  await update({ workspaceTitle: trimmed === '' ? null : trimmed });
}

/**
 * 画面ごとの背景プリセットを変更する。電卓（'calculator'）は
 * CUSTOMIZABLE_SCREENSに含まれておらず、意図的にサポートしない。
 * @param {string} screenKey
 * @param {string} presetId
 */
export async function updateBackground(screenKey, presetId) {
  if (!VALID_PRESET_IDS.has(presetId)) return;
  const isCustomizableScreen = CUSTOMIZABLE_SCREENS.some((screen) => screen.key === screenKey);
  if (!isCustomizableScreen) return;

  await update({ [`backgrounds.${screenKey}`]: presetId });
}

/**
 * カード名・アイコン・並び順・Workspaceタイトル・背景のすべてを
 * まとめて初期状態へ戻す（確認ダイアログの表示はapp.js側の責務）。
 */
export async function resetAll() {
  const roomId = Firebase.getLocalRoomId();
  if (!roomId) {
    throw new Error('ペアリングが完了するまで、この設定は保存できません。');
  }

  await Firebase.updateRoomCustomization(roomId, {
    workspaceTitle: null,
    cards: {},
    backgrounds: {},
  });

  current = normalize(DEFAULT_CUSTOMIZATION);
  saveCache(current);
  notifyAll();
}

/**
 * 指定した要素に、指定プレフィックスの背景プリセットクラスを適用する。
 * 例: applyBackgroundClass(el, 'workspace', 'navy') は
 *     'workspace-bg--navy' だけを付与し、他のworkspace-bg--*は外す。
 * 各画面のCSSファイル側で、'default'以外のプリセットに対応する
 * `{prefix}-bg--{id}` クラスを用意しておく必要がある
 * （'default'は既定の見た目のため、対応するクラスは不要）。
 * @param {HTMLElement} element
 * @param {string} classPrefix
 * @param {string|undefined} presetId
 */
export function applyBackgroundClass(element, classPrefix, presetId) {
  if (!element) return;
  const activeId = presetId && VALID_PRESET_IDS.has(presetId) ? presetId : 'default';

  BACKGROUND_PRESETS.forEach((preset) => {
    element.classList.toggle(`${classPrefix}-bg--${preset.id}`, preset.id === activeId);
  });
}

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