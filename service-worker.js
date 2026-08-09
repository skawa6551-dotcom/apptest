// ============================================================

// service-worker.js

// Calculator 0209 のオフライン対応＋Push通知を担う Service Worker。

// ES Modulesは使用しない、通常のクラシックスクリプトとして実装する。

//

// 戦略：

//   install               … 主要ファイルを事前キャッシュ

//   activate              … 古いキャッシュを削除

//   fetch                 … アプリコードはネットワーク優先

//                           静的ファイルはキャッシュ優先

//   push                  … バックグラウンドPush通知を表示

//   notificationclick     … 通知タップ時にアプリを開く／既存画面をフォーカス

//   pushsubscriptionchange… Push購読変更時の再同期補助

//

// 【重要】

// 通知タップだけでWorkspaceやMessagesへ直接アンロックしない。

// Calculator画面を入口として既存のロック仕様を維持する。

// ============================================================

'use strict';

// ------------------------------------------------------------

// バージョン管理

// ------------------------------------------------------------

const CACHE_VERSION = 9;

const CACHE_NAME = `calculator-0209-cache-v${CACHE_VERSION}`;

// ------------------------------------------------------------

// 事前キャッシュ

// ------------------------------------------------------------

const PRECACHE_URLS = Object.freeze([

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

  './js/customization.js',

  './js/notifications.js',

  './assets/icons/icon-192.png',

  './assets/icons/icon-512.png',

  './assets/icons/icon-512-maskable.png',

]);

const OFFLINE_FALLBACK_URL = './index.html';

// ------------------------------------------------------------

// install

// ------------------------------------------------------------

self.addEventListener('install', (event) => {

  event.waitUntil(precacheAppShell());

  self.skipWaiting();

});

async function precacheAppShell() {

  const cache = await caches.open(CACHE_NAME);

  try {

    await cache.addAll(PRECACHE_URLS);

  } catch (error) {

    console.warn(

      '[service-worker] 一括キャッシュに失敗したため、1件ずつ再試行します。',

      error,

    );

    await Promise.all(

      PRECACHE_URLS.map(async (url) => {

        try {

          const response = await fetch(

            url,

            {

              cache: 'no-store',

            },

          );

          if (response.ok) {

            await cache.put(

              url,

              response,

            );

          } else {

            console.warn(

              `[service-worker] キャッシュ対象の取得に失敗しました: ${url} (status: ${response.status})`,

            );

          }

        } catch (fetchError) {

          console.warn(

            `[service-worker] キャッシュ対象の取得中にエラーが発生しました: ${url}`,

            fetchError,

          );

        }

      }),

    );

  }

}

// ------------------------------------------------------------

// activate

// ------------------------------------------------------------

self.addEventListener('activate', (event) => {

  event.waitUntil(

    Promise.all([

      deleteOutdatedCaches(),

      self.clients.claim(),

    ]),

  );

});

async function deleteOutdatedCaches() {

  try {

    const cacheNames = await caches.keys();

    const outdatedCacheNames =

      cacheNames.filter(

        (name) =>

          name !== CACHE_NAME,

      );

    await Promise.all(

      outdatedCacheNames.map(

        (name) =>

          caches.delete(name),

      ),

    );

  } catch (error) {

    console.warn(

      '[service-worker] 古いキャッシュの削除中にエラーが発生しました。',

      error,

    );

  }

}

// ------------------------------------------------------------

// fetch

// ------------------------------------------------------------

self.addEventListener('fetch', (event) => {

  const { request } = event;

  if (request.method !== 'GET') {

    return;

  }

  // Firebase / Cloudflare等、外部オリジンはキャッシュしない。

  if (

    !request.url.startsWith(

      self.location.origin,

    )

  ) {

    return;

  }

  event.respondWith(

    handleFetch(request),

  );

});

/**

 * 同一オリジンのGETリクエストを処理する。

 *

 * HTML / JavaScript / CSS / JSON：

 *   ネットワーク優先

 *   GitHubへ反映した最新版を取得し、

 *   成功した場合はキャッシュも更新する。

 *

 * 画像等の静的ファイル：

 *   キャッシュ優先

 *

 * ネットワークが利用できない場合：

 *   保存済みキャッシュを利用する。

 */

async function handleFetch(request) {

  const requestUrl =

    new URL(request.url);

  const pathname =

    requestUrl.pathname.toLowerCase();

  const isAppCode =

    request.mode === 'navigate' ||

    pathname.endsWith('.html') ||

    pathname.endsWith('.js') ||

    pathname.endsWith('.css') ||

    pathname.endsWith('.json');

  // ----------------------------------------------------------

  // HTML / JS / CSS / JSON

  // ネットワーク優先

  // ----------------------------------------------------------

  if (isAppCode) {

    try {

      const networkResponse =

        await fetch(

          request,

          {

            cache: 'no-store',

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

  // ----------------------------------------------------------

  // 画像等の静的ファイル

  // キャッシュ優先

  // ----------------------------------------------------------

  const cachedResponse =

    await caches.match(

      request,

    );

  if (cachedResponse) {

    return cachedResponse;

  }

  try {

    const networkResponse =

      await fetch(request);

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

        .catch((error) => {

          console.warn(

            '[service-worker] 動的キャッシュへの保存に失敗しました。',

            error,

          );

        });

    }

    return networkResponse;

  } catch (error) {

    return respondWithOfflineFallback(

      request,

      error,

    );

  }

}

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

      headers: new Headers({

        'Content-Type':

          'text/plain; charset=UTF-8',

      }),

    },

  );

}

// ------------------------------------------------------------

// Push通知

// ------------------------------------------------------------

self.addEventListener('push', (event) => {

  event.waitUntil(

    handlePushEvent(event),

  );

});

async function handlePushEvent(event) {

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

    payload.title.trim() !== ''

      ? payload.title

      : 'Calculator';

  const body =

    typeof payload.body ===

      'string' &&

    payload.body.trim() !== ''

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

    payload.tag.trim() !== ''

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

    renotify: false,

    requireInteraction: false,

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

      '[service-worker] Push通知の表示に失敗しました。',

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

      '[service-worker] 通知タップ後のアプリ起動に失敗しました。',

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

      handlePushSubscriptionChange(),

    );

  },

);

async function handlePushSubscriptionChange() {

  try {

    const clientList =

      await self.clients.matchAll({

        type:

          'window',

        includeUncontrolled:

          true,

      });

    await Promise.all(

      clientList.map(

        (client) =>

          client.postMessage({

            type:

              'PUSH_SUBSCRIPTION_CHANGED',

          }),

      ),

    );

  } catch (error) {

    console.warn(

      '[service-worker] Push購読変更の通知に失敗しました。',

      error,

    );

  }

}