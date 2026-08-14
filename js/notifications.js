// ============================================================

// notifications.js

// Calculator 0209 の通知機能を管理するモジュール。

//

// 役割：

//   ・iPhone PWA / 通知対応状況の判定

//   ・通知許可の取得

//   ・Firebase Messagingへの端末登録

//   ・Firestoreへの端末登録情報保存

//   ・通知ON/OFF

//   ・通知内容表示ON/OFFの同期

//   ・起動時の登録再同期

//   ・フォアグラウンド通知受信

//

// Firebase Messaging SDK / Firestoreへの直接アクセスは行わず、

// 必ずfirebase.jsを経由する。

// DOM生成は行わない。

// ============================================================

import Firebase from './firebase.js';

import Settings from './settings.js';

// ------------------------------------------------------------

// モジュール内状態

// ------------------------------------------------------------

/**

 * フォアグラウンド通知リスナーの解除関数。

 * 二重登録を防ぐため保持する。

 */

let unsubscribeForegroundMessage = null;

/**

 * Service Workerからのmessageイベントを二重登録しないためのフラグ。

 */

let isServiceWorkerMessageListenerRegistered = false;

/**

 * 通知登録処理の多重実行防止。

 * @type {Promise<boolean>|null}

 */

let registrationPromise = null;

let registrationState = {
  status: 'idle',
  message: '',
  method: null,
};

function setRegistrationState(
  status,
  message = '',
  method = null,
) {
  registrationState = {
    status,
    message,
    method,
  };

  try {
    window.dispatchEvent(
      new CustomEvent(
        'calculator-notification-registration-state',
        {
          detail: {
            ...registrationState,
          },
        },
      ),
    );
  } catch {}
}

export function getRegistrationState() {
  return {
    ...registrationState,
  };
}


// ------------------------------------------------------------

// PWA / 通知対応判定

// ------------------------------------------------------------

/**

 * ホーム画面へ追加されたPWAとして起動しているか判定する。

 *

 * iOSではホーム画面Webアプリから起動しなければ

 * Web Push通知を利用できないため、この判定を最初に行う。

 *

 * @returns {boolean}

 */

export function isStandalonePwa() {

  const iosStandalone =

    window.navigator.standalone === true;

  const displayModeStandalone =

    typeof window.matchMedia === 'function' &&

    window

      .matchMedia(

        '(display-mode: standalone)',

      )

      .matches;

  return (

    iosStandalone ||

    displayModeStandalone

  );

}

/**

 * この環境がWeb Push通知に必要なAPIへ対応しているか判定する。

 *

 * @returns {boolean}

 */

export function isNotificationSupported() {

  return (

    typeof Notification !==

      'undefined' &&

    'serviceWorker' in navigator &&

    'PushManager' in window

  );

}

/**

 * 現在の通知許可状態を返す。

 *

 * @returns {'granted'|'denied'|'default'|'unsupported'}

 */

export function getPermissionState() {

  if (

    typeof Notification ===

    'undefined'

  ) {

    return 'unsupported';

  }

  return Notification.permission;

}

// ------------------------------------------------------------

// Service Worker

// ------------------------------------------------------------

/**

 * Calculator0209で利用するService Workerの登録完了を待つ。

 *

 * app.js側でもservice-worker.jsを登録するが、

 * 通知設定をONにしたタイミングでまだregistrationが完了していない

 * 可能性があるため、navigator.serviceWorker.readyを利用する。

 *

 * @returns {Promise<ServiceWorkerRegistration>}

 */

async function getServiceWorkerRegistration() {

  if (

    !('serviceWorker' in navigator)

  ) {

    throw new Error(

      'Service Workerに対応していません。',

    );

  }

  return navigator.serviceWorker.ready;

}

/**

 * Service Workerから届くメッセージを処理する。

 *

 * Push購読情報がOS側で変更された場合は、

 * 起動中のアプリからFirebase登録を再同期する。

 */

function handleServiceWorkerMessage(

  event,

) {

  const message = event.data;

  if (

    !message ||

    typeof message.type !==

      'string'

  ) {

    return;

  }

  if (

    message.type ===

      'PUSH_SUBSCRIPTION_CHANGED' ||

    message.type ===

      'calculator-0209-push-subscription-changed'

  ) {

    syncRegistrationOnStartup().catch(

      (error) => {

        console.warn(

          '[notifications.js] Push購読変更後の再登録に失敗しました',

          error,

        );

      },

    );

  }

}

/**

 * Service Workerとの連携リスナーを登録する。

 * 二重登録しない。

 */

function registerServiceWorkerMessageListener() {

  if (

    isServiceWorkerMessageListenerRegistered ||

    !(

      'serviceWorker' in navigator

    )

  ) {

    return;

  }

  navigator.serviceWorker.addEventListener(

    'message',

    handleServiceWorkerMessage,

  );

  isServiceWorkerMessageListenerRegistered =

    true;

}

// ------------------------------------------------------------

// 通知許可＋端末登録

// ------------------------------------------------------------

/**

 * 通知許可を取得する。

 *

 * 既にgrantedの場合はダイアログを再表示しない。

 *

 * @returns {Promise<'granted'>}

 */

async function ensureNotificationPermission() {

  if (!isNotificationSupported()) {

    throw new Error(

      'この端末・ブラウザは通知に対応していません。',

    );

  }

  const currentPermission =

    Notification.permission;

  if (

    currentPermission ===

    'granted'

  ) {

    return 'granted';

  }

  if (

    currentPermission ===

    'denied'

  ) {

    throw new Error(

      '通知がブロックされています。iPhoneの設定から通知を許可してください。',

    );

  }

  const permission =

    await Notification.requestPermission();

  if (permission !== 'granted') {

    throw new Error(

      '通知の許可が得られませんでした。',

    );

  }

  return 'granted';

}

/**

 * Firebase Messagingへ端末を登録し、

 * Firestoreへこの端末の登録情報を保存する。

 *

 * @returns {Promise<boolean>}

 */

async function registerCurrentDevice() {

  setRegistrationState(
    'registering',
    '通知端末を登録しています…',
  );


  const roomId =

    Firebase.getLocalRoomId();

  /**

   * ペアリング前の場合でもNotification.permissionは取得できるが、

   * 登録情報を保存するroomが存在しない。

   *

   * この場合は通知許可だけ完了扱いとし、

   * ペアリング後または次回起動時に再同期する。

   */

  if (!roomId) {

    setRegistrationState(
      'waiting-room',
      'ペアリング完了後に通知端末を登録します。',
    );

    return true;

  }

  const uid =

    await Firebase.ensureSignedIn();

  const clientId =

    Firebase.getOrCreateClientId();

  const swRegistration =

    await getServiceWorkerRegistration();

  const registrationInfo =

    await Firebase.registerForPush(

      swRegistration,

    );

  if (

    !registrationInfo ||

    !registrationInfo.id

  ) {

    throw new Error(

      '通知用の端末登録情報を取得できませんでした。',

    );

  }

  const savedRegistration =

    await Firebase.savePushRegistration(

      roomId,

      uid,

      clientId,

      registrationInfo.id,

      registrationInfo.method,

    );

  const verifiedStatus =

    await Firebase.getPushRegistrationStatus(

      roomId,

      uid,

      clientId,

    );

  if (

    !savedRegistration ||

    !verifiedStatus.saved

  ) {

    throw new Error(

      '通知端末IDを取得しましたが、Firestoreへの保存確認に失敗しました。',

    );

  }

  /**

   * 通知本文表示設定も同時に同期する。

   * Worker側は受信者のこの設定を見て、

   * 本文を表示するか簡易通知にするか決める。

   */

  await Firebase.saveNotificationContentPreference(

    roomId,

    uid,

    Settings.isNotificationContentEnabled(),

  );

  setRegistrationState(
    'registered',
    verifiedStatus.method === 'fid'
      ? 'FID登録・Firestore保存確認済み'
      : 'FCM登録・Firestore保存確認済み',
    verifiedStatus.method,
  );

  return true;

}

/**

 * 設定画面の「通知」ON時に呼ぶ。

 *

 * 1. PWA起動確認

 * 2. API対応確認

 * 3. 通知許可取得

 * 4. Firebase Messaging登録

 * 5. Firestoreへ端末登録

 *

 * @returns {Promise<boolean>}

 */

export async function requestPermissionAndRegister() {

  if (!isStandalonePwa()) {

    throw new Error(

      '通知を利用するには、このアプリをiPhoneのホーム画面に追加し、ホーム画面のアイコンから起動してください。',

    );

  }

  if (!isNotificationSupported()) {

    throw new Error(

      'この端末・ブラウザは通知に対応していません。',

    );

  }

  /**

   * トグル連打などによる重複登録防止。

   */

  if (registrationPromise) {

    return registrationPromise;

  }

  registrationPromise =

    (async () => {

      await ensureNotificationPermission();

      registerServiceWorkerMessageListener();

      await registerCurrentDevice();

      return true;

    })();

  try {

    return await registrationPromise;

  } catch (

    error

  ) {

    const message =

      error instanceof Error

        ? error.message

        : String(error);

    setRegistrationState(
      'error',
      message,
    );

    throw error;

  } finally {

    registrationPromise = null;

  }

}

// ------------------------------------------------------------

// 通知OFF

// ------------------------------------------------------------

/**

 * この端末のPush登録を無効化する。

 *

 * Firebase側の登録情報そのものは削除せず、

 * enabled:falseへ変更する。

 *

 * これにより再度ONにした際に同じclientIdで更新できる。

 *

 * @returns {Promise<void>}

 */

export async function disableRegistration() {

  const roomId =

    Firebase.getLocalRoomId();

  if (!roomId) return;

  let uid =

    Firebase.getCurrentUid();

  if (!uid) {

    try {

      uid =

        await Firebase.ensureSignedIn();

    } catch {

      return;

    }

  }

  const clientId =

    Firebase.getOrCreateClientId();

  await Firebase.disablePushRegistration(

    roomId,

    uid,

    clientId,

  );

}

// ------------------------------------------------------------

// 通知内容表示設定

// ------------------------------------------------------------

/**

 * 通知に本文を表示するかどうかをFirestoreへ同期する。

 *

 * true:

 *   送信者名＋メッセージ内容

 *

 * false:

 *   「新しいメッセージがあります」

 *

 * @param {boolean} enabled

 * @returns {Promise<void>}

 */

export async function syncNotificationContentPreference(

  enabled,

) {

  const roomId =

    Firebase.getLocalRoomId();

  if (!roomId) return;

  let uid =

    Firebase.getCurrentUid();

  if (!uid) {

    try {

      uid =

        await Firebase.ensureSignedIn();

    } catch {

      return;

    }

  }

  await Firebase.saveNotificationContentPreference(

    roomId,

    uid,

    Boolean(enabled),

  );

}

// ------------------------------------------------------------

// 起動時同期

// ------------------------------------------------------------

/**

 * アプリ起動時に通知登録状態を再同期する。

 *

 * 以下の場合は何もしない：

 *

 * ・設定で通知OFF

 * ・ホーム画面PWAではない

 * ・ブラウザが通知非対応

 * ・通知許可がgrantedではない

 *

 * @returns {Promise<boolean>}

 */

export async function syncRegistrationOnStartup() {

  registerServiceWorkerMessageListener();

  if (

    !Settings.isNotificationsEnabled()

  ) {

    return false;

  }

  if (!isStandalonePwa()) {

    return false;

  }

  if (!isNotificationSupported()) {

    return false;

  }

  if (

    getPermissionState() !==

    'granted'

  ) {

    return false;

  }

  if (registrationPromise) {

    return registrationPromise;

  }

  registrationPromise =

    registerCurrentDevice();

  try {

    return await registrationPromise;

  } catch (error) {

    console.warn(

      '[notifications.js] 起動時の通知登録同期に失敗しました',

      error,

    );

    return false;

  } finally {

    registrationPromise = null;

  }

}

// ------------------------------------------------------------

// フォアグラウンド通知

// ------------------------------------------------------------

/**

 * アプリを開いている間にFCMメッセージを受信するための

 * リスナーを登録する。

 *

 * メッセージ本体はFirestoreリアルタイム購読で表示されるため、

 * ここではチャット一覧へ同じメッセージを追加しない。

 *

 * 必要に応じて音・バイブレーション等の

 * フォアグラウンド通知フィードバックだけ行う。

 */

export async function initForegroundListener() {

  if (unsubscribeForegroundMessage) {

    return;

  }

  if (!isNotificationSupported()) {

    return;

  }

  try {

    unsubscribeForegroundMessage =

      await Firebase.onForegroundMessage(

        (payload) => {

          handleForegroundMessage(

            payload,

          );

        },

      );

  } catch (error) {

    console.warn(

      '[notifications.js] フォアグラウンド通知リスナーの開始に失敗しました',

      error,

    );

  }

}

/**

 * フォアグラウンドで通知を受信した際の処理。

 *

 * Firestore購読でチャット内容自体はリアルタイム更新されるため、

 * OS通知を二重表示しない。

 *

 * @param {object} payload

 */

function handleForegroundMessage(

  payload,

) {

  console.info(

    '[notifications.js] フォアグラウンド通知を受信しました',

    payload,

  );

  /**

   * 通知設定がOFFなら何もしない。

   */

  if (

    !Settings.isNotificationsEnabled()

  ) {

    return;

  }

  /**

   * フォアグラウンド時の振動。

   * iOS Safari/PWAではnavigator.vibrateが利用できない場合があるため

   * 対応している環境だけ実行する。

   */

  if (

    Settings.isNotificationVibrationEnabled() &&

    typeof navigator.vibrate ===

      'function'

  ) {

    try {

      navigator.vibrate(80);

    } catch {

      // 振動非対応の場合は無視する。

    }

  }

  /**

   * 通知音はsound.js側との連携を今後追加可能。

   * 現時点ではOS Push通知との二重音を避けるため、

   * ここでは独自音声を再生しない。

   */

}

// ------------------------------------------------------------

// ペアリング完了後の同期

// ------------------------------------------------------------

/**

 * ペアリングが成立した直後など、

 * roomIdが新しく確定したタイミングで通知設定を同期するためのAPI。

 *

 * Notifications設定がONかつ通知許可済みなら

 * 現在端末を登録する。

 *

 * @returns {Promise<boolean>}

 */

export async function syncAfterPairing() {

  if (

    !Settings.isNotificationsEnabled()

  ) {

    return false;

  }

  if (

    getPermissionState() !==

      'granted'

  ) {

    return false;

  }

  return syncRegistrationOnStartup();

}

// ------------------------------------------------------------

// 状態取得

// ------------------------------------------------------------

/**

 * 設定画面等で表示するための状態情報を返す。

 *

 * @returns {{

 *   supported:boolean,

 *   standalone:boolean,

 *   permission:string,

 *   enabled:boolean

 * }}

 */

export function getStatus() {

  return {

    supported:

      isNotificationSupported(),

    standalone:

      isStandalonePwa(),

    permission:

      getPermissionState(),

    enabled:

      Settings.isNotificationsEnabled(),

  };

}

// ------------------------------------------------------------

// 初期化

// ------------------------------------------------------------

/**

 * 通知機能の軽量初期化。

 *

 * アプリ起動を妨げないよう、

 * Firebase通信はここでは行わない。

 */

export function init() {

  registerServiceWorkerMessageListener();

}

// ------------------------------------------------------------

// default export

// ------------------------------------------------------------

const Notifications = {

  init,

  isStandalonePwa,

  isNotificationSupported,

  getPermissionState,

  getStatus,
  getRegistrationState,

  requestPermissionAndRegister,

  disableRegistration,

  syncNotificationContentPreference,

  syncRegistrationOnStartup,

  syncAfterPairing,

  initForegroundListener,

};

export default Notifications;