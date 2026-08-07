// ============================================================
// calendar.js
// Workspace内「カレンダー」画面のDOM生成・開閉・月表示・メモ機能を
// 管理するモジュール。records.js/workspace.jsと同じ設計方針を踏襲する：
//
//   ・DOM生成・開閉・画面の中身の更新 … このファイル（calendar.js）
//   ・画面遷移の調整（Workspace⇔Calendar） … router.js
//   ・クリックの解釈・ディスパッチ … app.js
//   ・永続化（メモの保存/読込） … storage.js経由（calendar.js自身は
//     localStorageへ直接アクセスしない）
//
// 「0209」の判定やAutoLockのタイマー管理など、他画面の責務には
// 一切踏み込まない。
// ============================================================

import Storage, { STORAGE_KEYS } from './storage.js';
import Customization from './customization.js';

/** カレンダー画面のDOMを差し込む先のコンテナのid */
const CONTAINER_ID = 'calendar';

/** 曜日ヘッダーの表示ラベル（日曜始まり、iPhone純正カレンダーと同じ並び） */
const WEEKDAY_LABELS = Object.freeze(['日', '月', '火', '水', '木', '金', '土']);

/** create() が既に実行済みかどうか（二重生成防止） */
let isBuilt = false;

/** customization.jsの購読解除関数。 */
let unsubscribeCustomization = null;

/** 「今日」の日付（起動時に1度だけ確定させ、日をまたいでも当日中は固定で扱う） */
const today = new Date();

/** 現在グリッドに表示している年・月（月は0〜11）。初期値は今日の月。 */
let viewedYear = today.getFullYear();
let viewedMonth = today.getMonth();

/** メモ編集パネルで選択中の日付キー（'YYYY-MM-DD'）。未選択時はnull。 */
let selectedDateKey = null;

/**
 * @typedef {Object.