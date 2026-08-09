// ============================================================

// service-worker.js

// Calculator 0209 のオフライン対応＋Push通知を担う Service Worker。

//

// 今回の重要変更：

// ・CACHE_VERSION を 10 に更新

// ・HTML / JS / CSS / JSON はネットワーク優先

// ・GitHub Pages更新後の古いキャッシュ残留を防止

// ・同一オリジンのアプリコードは最新版取得を優先

// ・オフライン時のみ保存済みキャッシュへフォールバック

//

// 通知タップだけでWorkspaceやMessagesへ直接アンロックしない。

// Calculator画面を入口として既存のロック仕様を維持する。

// ============================================================

'use strict';

// ------------------------------------------------------------

// バージョン管理

// ------------------------------------------------------------

const CACHE_VERSION = 11;

const CACHE_PREFIX =

  'calculator-0209-cache-v';

const CACHE_NAME =

  `${CACHE_PREFIX}${CACHE_VERSION}`;

// ------------------------------------------------------------

// 事前キャッシュ

// ------------------------------------------------------------

const PRECACHE_URLS =

  Object.freeze([

    './',

    './index.html',

    './manifest.json',

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

    './js/customization.js',

    './js/notifications.js',

    './assets/icons/icon-192.png',

    './assets/icons/icon-512.png',

    './assets/icons/icon-512-maskable.png',

  ]);

const OFFLINE_FALLBACK_URL =

  './index.html';

// ------------------------------------------------------------

// install

// ------------------------------------------------------------

self.addEventListener(

  'install',

  (event) => {

    event.waitUntil(

      precacheAppShell(),

    );

    self.skipWaiting();

  },

);

// ------------------------------------------------------------

// 主要ファイルをキャッシュ

// ------------------------------------------------------------

async function precacheAppShell() {

  const cache =

    await caches.open(

      CACHE_NAME,

    );

  try {

    await Promise.all(

      PRECACHE_URLS.map(

        async (url) => {

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

            } else {

              console.warn(

                `[service-worker] 事前キャッシュ取得失敗: ${url}`,

              );

            }

          } catch (

            error

          ) {

            console.warn(

              `[service-worker] 事前キャッシュ中にエラー: ${url}`,

              error,

            );

          }

        },

      ),

    );

  } catch (error) {

    console.warn(

      '[service-worker] 事前キャッシュ全体でエラーが発生しました',

      error,

    );

  }

}

// ------------------------------------------------------------

// activate

// ------------------------------------------------------------

self.addEventListener(

  'activate',

  (event) => {

    event.waitUntil(

      activateWorker(),

    );

  },

);

async function activateWorker() {

  await deleteOutdatedCaches();

  await self.clients.claim();

}

// ------------------------------------------------------------

// 古いキャッシュ削除

// ------------------------------------------------------------

async function deleteOutdatedCaches() {

  try {

    const cacheNames =

      await caches.keys();

    const outdated =

      cacheNames.filter(

        (name) =>

          name !==

          CACHE_NAME,

      );

    await Promise.all(

      outdated.map(

        (name) =>

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

// ------------------------------------------------------------

// fetch

// ------------------------------------------------------------

self.addEventListener(

  'fetch',

  (event) => {

    const { request } =

      event;

    if (

      request.method !==

      'GET'

    ) {

      return;

    }

    /*

     * Firebase等の外部オリジンは

     * Service Worker側でキャッシュしない。

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

// ------------------------------------------------------------

// GETリクエスト処理

// ------------------------------------------------------------

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

   * HTML / JS / CSS / JSON は

   * 必ずネットワーク優先。

   */

  if (isAppCode) {

    return networkFirst(

      request,

    );

  }

  /*

   * 画像等はキャッシュ優先。

   */

  return cacheFirst(

    request,

  );

}

// ------------------------------------------------------------

// ネットワーク優先

// ------------------------------------------------------------

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

      const cache =

        await caches.open(

          CACHE_NAME,

        );

      await cache.put(

        request,

        networkResponse.clone(),

      );

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

// ------------------------------------------------------------

// キャッシュ優先

// ------------------------------------------------------------

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

          (error) => {

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

// ------------------------------------------------------------

// オフラインフォールバック

// ------------------------------------------------------------

async function respondWithOfflineFallback(

  request,

  networkError,

) {

  console.warn(

    `[service-worker] ネットワーク取得に失敗しました: ${request.url}`,

    networkError,

  );

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

  return new Response(

    'オフラインのため、このリソースを取得できませんでした。',

    {

      status: 503,

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

// ------------------------------------------------------------

// Push通知

// ------------------------------------------------------------

self.addEventListener(

  'push',

  (event) => {

    event.waitUntil(

      handlePushEvent(

        event,

      ),

    );

  },

);

async function handlePushEvent(

  event,

) {

  let payload = {};

  try {

    if (event.data) {

      payload =

        event.data.json();

    }

  } catch (error) {

    try {

      payload = {

        body:

          event.data?.text?.() ??

          '',

      };

    } catch {

      payload = {};

    }

  }

  const title =

    typeof payload.title ===

      'string' &&

    payload.title.trim() !==

      ''

      ? payload.title

      : 'Calculator';

  const body =

    typeof payload.body ===

      'string' &&

    payload.body.trim() !==

      ''

      ? payload.body

      : '新しいメッセージがあります';

  const roomId =

    typeof payload.roomId ===

      'string'

      ? payload.roomId

      : null;

  const messageId =

    typeof payload.messageId ===

      'string'

      ? payload.messageId

      : null;

  const senderId =

    typeof payload.senderId ===

      'string'

      ? payload.senderId

      : null;

  const tag =

    typeof payload.tag ===

      'string' &&

    payload.tag.trim() !==

      ''

      ? payload.tag

      : messageId

        ? `message-${messageId}`

        : 'calculator-0209-message';

  const notificationOptions = {

    body,

    icon:

      './assets/icons/icon-192.png',

    badge:

      './assets/icons/icon-192.png',

    tag,

    renotify:

      false,

    requireInteraction:

      false,

    data: {

      roomId,

      messageId,

      senderId,

      url:

        './index.html',

    },

  };

  try {

    await self.registration.showNotification(

      title,

      notificationOptions,

    );

  } catch (error) {

    console.error(

      '[service-worker] Push通知の表示に失敗しました',

      error,

    );

  }

}

// ------------------------------------------------------------

// 通知タップ

// ------------------------------------------------------------

self.addEventListener(

  'notificationclick',

  (event) => {

    event.notification.close();

    event.waitUntil(

      handleNotificationClick(

        event.notification,

      ),

    );

  },

);

async function handleNotificationClick(

  notification,

) {

  const targetUrl =

    new URL(

      './index.html',

      self.registration.scope,

    ).href;

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

    for (

      const client of

      clientList

    ) {

      const clientUrl =

        new URL(

          client.url,

        );

      const target =

        new URL(

          targetUrl,

        );

      if (

        clientUrl.origin ===

        target.origin

      ) {

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

        } catch (

          messageError

        ) {

          console.warn(

            '[service-worker] 通知タップ情報の送信に失敗しました',

            messageError,

          );

        }

        if (

          typeof client.focus ===

          'function'

        ) {

          return client.focus();

        }

      }

    }

    if (

      self.clients.openWindow

    ) {

      return self.clients.openWindow(

        targetUrl,

      );

    }

  } catch (error) {

    console.error(

      '[service-worker] 通知タップ後のアプリ起動に失敗しました',

      error,

    );

  }

  return undefined;

}

// ------------------------------------------------------------

// Push購読変更

// ------------------------------------------------------------

self.addEventListener(

  'pushsubscriptionchange',

  (event) => {

    event.waitUntil(

      handlePushSubscriptionChange(

        event,

      ),

    );

  },

);

async function handlePushSubscriptionChange(

  event,

) {

  try {

    const applicationServerKey =

      event.oldSubscription?.options

        ?.applicationServerKey;

    let newSubscription =

      event.newSubscription ??

      null;

    /*

     * ブラウザ側で新しい購読が自動生成されなかった場合、

     * 旧購読からapplicationServerKeyを取得できれば

     * 再購読を試みる。

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

      } catch (

        subscribeError

      ) {

        console.warn(

          '[service-worker] Push通知の再購読に失敗しました',

          subscribeError,

        );

      }

    }

    /*

     * Service Worker自身からFirestoreへ直接書き込まず、

     * 開いているアプリへ購読変更を通知する。

     *

     * app.js側では

     * calculator-0209-push-subscription-changed

     * または

     * PUSH_SUBSCRIPTION_CHANGED

     * を受信すると

     * Notifications.syncRegistrationOnStartup()

     * を実行する。

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

    clientList.forEach(

      (client) => {

        try {

          client.postMessage(

            message,

          );

        } catch (

          messageError

        ) {

          console.warn(

            '[service-worker] Push購読変更の通知に失敗しました',

            messageError,

          );

        }

      },

    );

  } catch (error) {

    console.error(

      '[service-worker] pushsubscriptionchange処理に失敗しました',

      error,

    );

  }

}

// ------------------------------------------------------------

// Service Workerへのメッセージ

// ------------------------------------------------------------

self.addEventListener(

  'message',

  (event) => {

    const message =

      event.data;

    if (

      !message ||

      typeof message.type !==

        'string'

    ) {

      return;

    }

    if (

      message.type ===

      'SKIP_WAITING'

    ) {

      self.skipWaiting();

      return;

    }

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

/**

 * このアプリが作成したキャッシュを削除する。

 */

async function clearAppCaches() {

  try {

    const cacheNames =

      await caches.keys();

    const targets =

      cacheNames.filter(

        (cacheName) =>

          cacheName.startsWith(

            CACHE_PREFIX,

          ),

      );

    await Promise.all(

      targets.map(

        (cacheName) =>

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

// ------------------------------------------------------------

// Service Worker起動確認

// ------------------------------------------------------------

console.info(

  `[service-worker] ${CACHE_NAME} loaded`,

);