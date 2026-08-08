// ============================================================
// notifications.js
// 通知の許可取得・端末登録（FID/token）・フォアグラウンド受信を
// 担当するモジュール。他のモジュール（app.js/messages.js/settings.js）
// はここを経由して通知機能を扱い、Firebase Messaging SDKへは
// 直接アクセスしない（firebase.jsが唯一の窓口、という既存の設計方針を
// 維持し、実際のSDK呼び出しはfirebase.js側に閉じ込める）。
//
// 【役割分担】
//   ・「許可を取る」「登録する」「解除する」というユーザー操作の流れ
//     … このファイル
//   ・実際のFirebase Messaging SDK呼び出し・Firestoreへの読み書き
//     … firebase.js
//   ・「通知」トグルのON/OFFイベントとの配線
//     … app.js
//
// customization.jsと同様、DOM生成は行わない（画面を持たないモジュール）。
// ============================================================

import Firebase from './firebase.js';
import Settings from './settings.js';

/**
 * このアプリがiPhoneのホーム画面から起動された状態（standalone表示）かどうかを返す。
 * iOSでは、ホーム画面に追加してこの状態で起動しない限り、通知許可の
 * リクエスト自体をブラウザが受け付けない。
 * @returns {boolean}
 */
export function isStandalonePwa() {
  const isIosStandalone = window.navigator.standalone === true;
  const isDisplayModeStandalone =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return isIosStandalone || isDisplayModeStandalone;
}

/**
 * この端末・ブラウザが通知機能に必要なAPI（Notification／Service Worker／
 * Push API）に対応しているかどうかを返す。
 * @returns {boolean}
 */
export function isNotificationSupported() {
  return (
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/**
 * 現在の通知許可状態（'granted'|'denied'|'default'）を返す。
 * Notification API自体に対応していない環境では'unsupported'を返す。
 * @returns {'granted'|'denied'|'default'|'unsupported'}
 */
export function getPermissionState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/**
 * 通知の許可取得〜端末登録までの一連の流れを行う。
 * 設定画面の「通知」トグルをONにした瞬間に呼ばれる想定。
 *
 * 流れ：
 *   1. ホーム画面から起動しているか確認（していなければ中断）
 *   2. Notification.requestPermission()で許可を取る
 *   3. 登録済みのService Worker（既存のservice-worker.js）を取得
 *   4. firebase.js経由でFCMへ登録（FID方式 or 従来方式、firebase.js側で自動判定）
 *   5. 取得した登録情報を、この端末のclientIdに紐づけてFirestoreへ保存
 *
 * 途中で失敗した場合はエラーを投げる（呼び出し元のapp.js側でトグルを
 * OFFへ戻す等の後処理を行うため、ここでは黙って諦めない）。
 * @returns {Promise<void>}
 */
export async function requestPermissionAndRegister() {
  if (!isStandalonePwa()) {
    throw new Error('ホーム画面に追加した状態で開いていないため、通知を有効にできません。');
  }

  if (!isNotificationSupported()) {
    throw new Error('この端末・ブラウザは通知に対応していません。');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('通知の許可が得られませんでした。');
  }

  const swRegistration = await navigator.serviceWorker.ready;
  const { id, method } = await Firebase.registerForPush(swRegistration);

  const roomId = Firebase.getLocalRoomId();
  if (!roomId) {
    // ペアリング前でも許可取得自体は完了させる（登録の保存はペアリング後でよい）。
    return;
  }

  const uid = await Firebase.ensureSignedIn();
  const clientId = Firebase.getOrCreateClientId();

  await Firebase.savePushRegistration(roomId, uid, clientId, id, method);
}

/**
 * この端末の通知登録を無効化する。設定画面の「通知」トグルをOFFにした
 * 瞬間に呼ばれる想定。登録情報そのものは削除せず、enabledをfalseに
 * するだけにする（Worker側が送信対象から除外する）。
 * ペアリング前（roomId未確定）の場合は何もしない。
 * @returns {Promise<void>}
 */
export async function disableRegistration() {
  const roomId = Firebase.getLocalRoomId();
  if (!roomId) return;

  const uid = Firebase.getCurrentUid();
  if (!uid) return;

  const clientId = Firebase.getOrCreateClientId();
  await Firebase.disablePushRegistration(roomId, uid, clientId);
}

/**
 * 通知内容表示（送信者名・本文を出すか、簡易表示にするか）の設定を、
 * Firestore側（相手の送信処理から参照できる場所）へも反映する。
 * ローカルのSettings（localStorage）とは別に、Firestoreにも複製する
 * 理由はfirebase.js側のコメントを参照。
 * ペアリング前の場合は何もしない（次回ペアリング後の同期に任せる）。
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function syncNotificationContentPreference(enabled) {
  const roomId = Firebase.getLocalRoomId();
  if (!roomId) return;

  const uid = Firebase.getCurrentUid();
  if (!uid) return;

  await Firebase.saveNotificationContentPreference(roomId, uid, enabled);
}

/**
 * アプリ起動時に、既に「通知」設定がONの状態であれば登録をやり直す。
 * Firebase公式のベストプラクティス（起動のたびにregister()相当を呼び、
 * 同期状態を保証する）に沿った処理。許可が既に得られていない場合や、
 * ホーム画面から起動していない場合は何もしない（エラーにはしない。
 * 起動時の自動処理のため、電卓の表示を妨げないことを優先する）。
 * @returns {Promise<void>}
 */
export async function syncRegistrationOnStartup() {
  if (!Settings.isNotificationsEnabled()) return;
  if (!isStandalonePwa()) return;
  if (getPermissionState() !== 'granted') return;

  try {
    await requestPermissionAndRegister();
  } catch (error) {
    console.warn('[notifications.js] 起動時の通知登録の同期に失敗しました', error);
  }
}

/**
 * アプリを開いている間（フォアグラウンド）に届いたメッセージを受け取る
 * リスナーを登録する。フォアグラウンド中はOSの通知センターには出さず
 * （FCMの標準動作）、必要なら画面側の演出に使う。
 * 現時点では受信ログのみで、メッセージ画面自体はFirestoreのリアルタイム
 * 購読（messages.js）で既に更新されるため、二重の表示処理は行わない。
 */
export function initForegroundListener() {
  Firebase.onForegroundMessage((payload) => {
    console.info('[notifications.js] フォアグラウンドで通知を受信しました', payload);
  });
}

const Notifications = {
  isStandalonePwa,
  isNotificationSupported,
  getPermissionState,
  requestPermissionAndRegister,
  disableRegistration,
  syncNotificationContentPreference,
  syncRegistrationOnStartup,
  initForegroundListener,
};

export default Notifications;