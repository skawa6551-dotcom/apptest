// ============================================================

// service-worker.js

// Calculator 0209

//

// ・オフライン対応

// ・Push通知

// ・GitHub Pages対応

// ・最新版コード優先

// ・古いCalculatorキャッシュのみ削除

// ・Supabase写真共有対応

// ・通知タップでもロック解除しない

//

// CACHE_VERSION 14

// ============================================================

'use strict';

// ============================================================

// バージョン管理

// ============================================================

const CACHE_VERSION =

  14;

const CACHE_PREFIX =

  'calculator-0209-cache-v';

const CACHE_NAME =

  `${CACHE_PREFIX}${CACHE_VERSION}`;

// ============================================================

// 事前キャッシュ

// ============================================================

const PRECACHE_URLS =

  Object.freeze([

    './',

    './index.html',

    './manifest.json',

    // --------------------------------------------------------

    // CSS

    // --------------------------------------------------------

    './css/app.css',

    './css/calculator.css',

    './css/settings.css',

    './css/workspace.css',

    './css/records.css',

    './css/calendar.css',

    './css/archive.css',

    './css/pairing.css',

    './css/messages.css',

    './css/photo.css',

    // --------------------------------------------------------

    // JavaScript

    // --------------------------------------------------------

    './js/app.js',

    './js/calculator.js',

    './js/settings.js',

    './js/storage.js',

    './js/themes.js',

    './js/sound.js',

    './js/auth.js',

    './js/router.js',

    './js/passcode.js',

    './js/autolock.js',

    './js/workspace.js',

    './js/records.js',

    './js/calendar.js',

    './js/archive.js',

    './js/firebase-config.js',

    './js/firebase.js',

    './js/pairing.js',

    './js/messages.js',

    './js/photo.js',

    './js/supabase.js',

    './js/customization.js',

    './js/notifications.js',

    // --------------------------------------------------------

    // Icons

    // --------------------------------------------------------

    './assets/icons/icon-192.png',

    './assets/icons/icon-512.png',

    './assets/icons/icon-512-maskable.png',

  ]);

const OFFLINE_FALLBACK_URL =

  './index.html';

// ============================================================

// install

// ============================================================

self.addEventListener(

  'install',

  (

    event,

  ) => {

    event.waitUntil(

      precacheAppShell(),

    );

    /*

     * 新しいService Workerを

     * waiting状態に残さず、

     * 更新後すぐ利用できるようにする。

     */

    self.skipWaiting();

  },

);

// ============================================================

// 主要ファイルをキャッシュ

// ============================================================

async function precacheAppShell() {

  const cache =

    await caches.open(

      CACHE_NAME,

    );

  /*

   * 1ファイル失敗しただけで

   * Service Worker全体を

   * install失敗にしない。

   */

  await Promise.all(

    PRECACHE_URLS.map(

      async (

        url,

      ) => {

        try {

          const response =

            await fetch(

              url,

              {

                cache:

                  'no-store',

              },

            );

          if (

            response &&

            response.ok

          ) {

            await cache.put(

              url,

              response.clone(),

            );

            return;

          }

          console.warn(

            `[service-worker] 事前キャッシュ取得失敗: ${url}`,

            response?.status ??

              'unknown',

          );

        } catch (error) {

          console.warn(

            `[service-worker] 事前キャッシュ中にエラー: ${url}`,

            error,

          );

        }

      },

    ),

  );

}

// ============================================================

// activate

// ============================================================

self.addEventListener(

  'activate',

  (

    event,

  ) => {

    event.waitUntil(

      activateWorker(),

    );

  },

);

async function activateWorker() {

  /*

   * Calculator 0209が作成した

   * 古いキャッシュだけ削除する。

   */

  await deleteOutdatedCaches();

  /*

   * 開いているページを

   * 新しいService Workerの管理下へ移す。

   */

  await self.clients.claim();

}

// ============================================================

// 古いCalculatorキャッシュ削除

// ============================================================

async function deleteOutdatedCaches() {

  try {

    const cacheNames =

      await caches.keys();

    const outdated =

      cacheNames.filter(

        (

          name,

        ) =>

          name.startsWith(

            CACHE_PREFIX,

          ) &&

          name !==

            CACHE_NAME,

      );

    await Promise.all(

      outdated.map(

        (

          name,

        ) =>

          caches.delete(

            name,

          ),

      ),

    );

  } catch (error) {

    console.warn(

      '[service-worker] 古いキャッシュ削除に失敗しました',

      error,

    );

  }

}

// ============================================================

// fetch

// ============================================================

self.addEventListener(

  'fetch',

  (

    event,

  ) => {

    const {

      request,

    } =

      event;

    if (

      request.method !==

      'GET'

    ) {

      return;

    }

    /*

     * Firebase / Supabase / CDNなど、

     * 外部オリジンの通信は

     * Service Workerではキャッシュしない。

     *

     * Supabase写真本体や

     * Signed URLもここには入らない。

     */

    if (

      !request.url.startsWith(

        self.location.origin,

      )

    ) {

      return;

    }

    event.respondWith(

      handleFetch(

        request,

      ),

    );

  },

);

// ============================================================

// GETリクエスト処理

// ============================================================

async function handleFetch(

  request,

) {

  const requestUrl =

    new URL(

      request.url,

    );

  const pathname =

    requestUrl.pathname.toLowerCase();

  const isAppCode =

    request.mode ===

      'navigate' ||

    pathname.endsWith(

      '.html',

    ) ||

    pathname.endsWith(

      '.js',

    ) ||

    pathname.endsWith(

      '.css',

    ) ||

    pathname.endsWith(

      '.json',

    );

  /*

   * HTML / JavaScript / CSS / JSONは

   * GitHub Pages更新後に

   * 古いコードを使い続けないよう

   * ネットワーク優先。

   */

  if (isAppCode) {

    return networkFirst(

      request,

    );

  }

  /*

   * アイコン等の静的ファイルは

   * キャッシュ優先。

   */

  return cacheFirst(

    request,

  );

}

// ============================================================

// ネットワーク優先

// ============================================================

async function networkFirst(

  request,

) {

  try {

    const networkResponse =

      await fetch(

        request,

        {

          cache:

            'no-store',

        },

      );

    if (

      networkResponse &&

      networkResponse.ok

    ) {

      try {

        const cache =

          await caches.open(

            CACHE_NAME,

          );

        await cache.put(

          request,

          networkResponse.clone(),

        );

      } catch (cacheError) {

        console.warn(

          '[service-worker] ネットワーク取得後のキャッシュ保存に失敗しました',

          cacheError,

        );

      }

    }

    return networkResponse;

  } catch (error) {

    const cachedResponse =

      await caches.match(

        request,

      );

    if (cachedResponse) {

      return cachedResponse;

    }

    return respondWithOfflineFallback(

      request,

      error,

    );

  }

}

// ============================================================

// キャッシュ優先

// ============================================================

async function cacheFirst(

  request,

) {

  const cachedResponse =

    await caches.match(

      request,

    );

  if (cachedResponse) {

    return cachedResponse;

  }

  try {

    const networkResponse =

      await fetch(

        request,

      );

    if (

      networkResponse &&

      networkResponse.ok

    ) {

      const cache =

        await caches.open(

          CACHE_NAME,

        );

      cache

        .put(

          request,

          networkResponse.clone(),

        )

        .catch(

          (

            error,

          ) => {

            console.warn(

              '[service-worker] 動的キャッシュ保存に失敗しました',

              error,

            );

          },

        );

    }

    return networkResponse;

  } catch (error) {

    return respondWithOfflineFallback(

      request,

      error,

    );

  }

}

// ============================================================

// オフラインフォールバック

// ============================================================

async function respondWithOfflineFallback(

  request,

  networkError,

) {

  console.warn(

    `[service-worker] ネットワーク取得に失敗しました: ${request.url}`,

    networkError,

  );

  /*

   * ページ遷移の場合のみ

   * index.htmlへフォールバック。

   */

  if (

    request.mode ===

    'navigate'

  ) {

    const offlinePage =

      await caches.match(

        OFFLINE_FALLBACK_URL,

      );

    if (offlinePage) {

      return offlinePage;

    }

  }

  /*

   * JavaScriptや画像を

   * HTMLで代用しない。

   */

  return new Response(

    'オフラインのため、このリソースを取得できませんでした。',

    {

      status:

        503,

      statusText:

        'Service Unavailable',

      headers:

        new Headers({

          'Content-Type':

            'text/plain; charset=UTF-8',

        }),

    },

  );

}

// ============================================================

// Push通知

// ============================================================

self.addEventListener(

  'push',

  (

    event,

  ) => {

    event.waitUntil(

      handlePushEvent(

        event,

      ),

    );

  },

);

// ============================================================

// Push payload取得

// ============================================================

function readPushPayload(

  event,

) {

  if (

    !event.data

  ) {

    return {};

  }

  try {

    return event.data.json() ??

      {};

  } catch (jsonError) {

    try {

      const text =

        event.data.text();

      if (!text) {

        return {};

      }

      return {

        body:

          text,

      };

    } catch (textError) {

      console.warn(

        '[service-worker] Pushデータを解析できませんでした',

        jsonError,

        textError,

      );

      return {};

    }

  }

}

// ============================================================

// Push payload正規化

// ============================================================

function normalizePushPayload(

  rawPayload,

) {

  const payload =

    rawPayload &&

    typeof rawPayload ===

      'object'

      ? rawPayload

      : {};

  const notification =

    payload.notification &&

    typeof payload.notification ===

      'object'

      ? payload.notification

      : {};

  const data =

    payload.data &&

    typeof payload.data ===

      'object'

      ? payload.data

      : {};

  const title =

    firstNonEmptyString(

      payload.title,

      notification.title,

      data.title,

      'Calculator',

    );

  const body =

    firstNonEmptyString(

      payload.body,

      notification.body,

      data.body,

      '新しいメッセージがあります',

    );

  const roomId =

    firstNullableString(

      payload.roomId,

      data.roomId,

    );

  const messageId =

    firstNullableString(

      payload.messageId,

      data.messageId,

    );

  const senderId =

    firstNullableString(

      payload.senderId,

      data.senderId,

    );

  const explicitTag =

    firstNullableString(

      payload.tag,

      notification.tag,

      data.tag,

    );

  const tag =

    explicitTag ||

    (

      messageId

        ? `message-${messageId}`

        : 'calculator-0209-message'

    );

  return {

    title,

    body,

    roomId,

    messageId,

    senderId,

    tag,

  };

}

// ============================================================

// 文字列取得補助

// ============================================================

function firstNonEmptyString(

  ...values

) {

  for (

    const value of

    values

  ) {

    if (

      typeof value ===

        'string' &&

      value.trim() !==

        ''

    ) {

      return value.trim();

    }

  }

  return '';

}

function firstNullableString(

  ...values

) {

  for (

    const value of

    values

  ) {

    if (

      typeof value ===

        'string' &&

      value.trim() !==

        ''

    ) {

      return value.trim();

    }

  }

  return null;

}

// ============================================================

// Pushイベント処理

// ============================================================

async function handlePushEvent(

  event,

) {

  const rawPayload =

    readPushPayload(

      event,

    );

  const payload =

    normalizePushPayload(

      rawPayload,

    );

  const notificationOptions = {

    body:

      payload.body,

    icon:

      './assets/icons/icon-192.png',

    badge:

      './assets/icons/icon-192.png',

    tag:

      payload.tag,

    renotify:

      false,

    requireInteraction:

      false,

    data: {

      roomId:

        payload.roomId,

      messageId:

        payload.messageId,

      senderId:

        payload.senderId,

      /*

       * 通知タップ後も

       * Workspace / Messagesへ直接移動せず、

       * Calculator画面を入口にする。

       */

      url:

        './index.html',

    },

  };

  try {

    await self.registration.showNotification(

      payload.title,

      notificationOptions,

    );

  } catch (error) {

    console.error(

      '[service-worker] Push通知の表示に失敗しました',

      error,

    );

  }

}

// ============================================================

// 通知タップ

// ============================================================

self.addEventListener(

  'notificationclick',

  (

    event,

  ) => {

    event.notification.close();

    event.waitUntil(

      handleNotificationClick(

        event.notification,

      ),

    );

  },

);

// ============================================================

// 通知タップ処理

// ============================================================

async function handleNotificationClick(

  notification,

) {

  const targetUrl =

    new URL(

      './index.html',

      self.registration.scope,

    ).href;

  const scopeUrl =

    new URL(

      self.registration.scope,

    );

  const notificationData =

    notification?.data ??

    {};

  try {

    const clientList =

      await self.clients.matchAll({

        type:

          'window',

        includeUncontrolled:

          true,

      });

    /*

     * GitHub Pagesでは

     * github.ioのoriginを

     * 複数リポジトリで共有するため、

     * Service Worker scope内かも確認する。

     */

    for (

      const client of

      clientList

    ) {

      let clientUrl;

      try {

        clientUrl =

          new URL(

            client.url,

          );

      } catch {

        continue;

      }

      const sameOrigin =

        clientUrl.origin ===

        scopeUrl.origin;

      const insideScope =

        client.url.startsWith(

          self.registration.scope,

        );

      if (

        !sameOrigin ||

        !insideScope

      ) {

        continue;

      }

      /*

       * 通知情報だけアプリへ渡す。

       * app.js側では直接ロック解除しない。

       */

      try {

        client.postMessage({

          type:

            'calculator-0209-notification-click',

          roomId:

            notificationData.roomId ??

            null,

          messageId:

            notificationData.messageId ??

            null,

          senderId:

            notificationData.senderId ??

            null,

        });

      } catch (messageError) {

        console.warn(

          '[service-worker] 通知タップ情報の送信に失敗しました',

          messageError,

        );

      }

      if (

        typeof client.focus ===

        'function'

      ) {

        await client.focus();

        return;

      }

    }

    /*

     * 開いているアプリがない場合だけ

     * Calculatorを新しく開く。

     */

    if (

      typeof self.clients.openWindow ===

        'function'

    ) {

      await self.clients.openWindow(

        targetUrl,

      );

    }

  } catch (error) {

    console.error(

      '[service-worker] 通知タップ後のアプリ起動に失敗しました',

      error,

    );

  }

}

// ============================================================

// Push購読変更

// ============================================================

self.addEventListener(

  'pushsubscriptionchange',

  (

    event,

  ) => {

    event.waitUntil(

      handlePushSubscriptionChange(

        event,

      ),

    );

  },

);

// ============================================================

// Push購読変更処理

// ============================================================

async function handlePushSubscriptionChange(

  event,

) {

  try {

    const applicationServerKey =

      event.oldSubscription

        ?.options

        ?.applicationServerKey;

    let newSubscription =

      event.newSubscription ??

      null;

    /*

     * 自動的に新しい購読が

     * 作られなかった場合は、

     * 旧applicationServerKeyで再購読を試す。

     */

    if (

      !newSubscription &&

      applicationServerKey

    ) {

      try {

        newSubscription =

          await self.registration

            .pushManager

            .subscribe({

              userVisibleOnly:

                true,

              applicationServerKey,

            });

      } catch (subscribeError) {

        console.warn(

          '[service-worker] Push通知の再購読に失敗しました',

          subscribeError,

        );

      }

    }

    /*

     * Firestoreへ直接書き込まず、

     * アプリ側へ再同期要求を送る。

     */

    const clientList =

      await self.clients.matchAll({

        type:

          'window',

        includeUncontrolled:

          true,

      });

    const message = {

      type:

        'calculator-0209-push-subscription-changed',

      subscription:

        newSubscription

          ? newSubscription.toJSON()

          : null,

    };

    for (

      const client of

      clientList

    ) {

      try {

        client.postMessage(

          message,

        );

      } catch (messageError) {

        console.warn(

          '[service-worker] Push購読変更の通知に失敗しました',

          messageError,

        );

      }

    }

  } catch (error) {

    console.error(

      '[service-worker] pushsubscriptionchange処理に失敗しました',

      error,

    );

  }

}

// ============================================================

// Service Workerへのメッセージ

// ============================================================

self.addEventListener(

  'message',

  (

    event,

  ) => {

    const message =

      event.data;

    if (

      !message ||

      typeof message.type !==

        'string'

    ) {

      return;

    }

    // --------------------------------------------------------

    // 即時更新

    // --------------------------------------------------------

    if (

      message.type ===

      'SKIP_WAITING'

    ) {

      self.skipWaiting();

      return;

    }

    // --------------------------------------------------------

    // Calculatorキャッシュ削除

    // --------------------------------------------------------

    if (

      message.type ===

      'CLEAR_APP_CACHE'

    ) {

      event.waitUntil(

        clearAppCaches(),

      );

    }

  },

);

// ============================================================

// Calculatorキャッシュ削除

// ============================================================

async function clearAppCaches() {

  try {

    const cacheNames =

      await caches.keys();

    const targets =

      cacheNames.filter(

        (

          cacheName,

        ) =>

          cacheName.startsWith(

            CACHE_PREFIX,

          ),

      );

    await Promise.all(

      targets.map(

        (

          cacheName,

        ) =>

          caches.delete(

            cacheName,

          ),

      ),

    );

  } catch (error) {

    console.error(

      '[service-worker] キャッシュ削除に失敗しました',

      error,

    );

  }

}

// ============================================================

// 起動確認

// ============================================================

console.info(

  `[service-worker] ${CACHE_NAME} loaded`,

);