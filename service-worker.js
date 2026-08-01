// ============================================================
// service-worker.js
// Calculator 0209 のオフライン対応を担う Service Worker。
// 戦略：
//   install  … 主要ファイルを事前キャッシュする
//   activate … 古いバージョンのキャッシュを削除する
//   fetch    … キャッシュ優先 → ネットワーク → オフラインフォールバック(index.html)
// ============================================================

'use strict';

const CACHE_VERSION = 1;
const CACHE_NAME = `calculator-0209-cache-v${CACHE_VERSION}`;

const PRECACHE_URLS = Object.freeze([
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './css/calculator.css',
  './css/settings.css',
  './js/app.js',
  './js/calculator.js',
  './js/settings.js',
  './js/storage.js',
  './js/themes.js',
  './js/sound.js',
  './js/auth.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
]);

const OFFLINE_FALLBACK_URL = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
  self.skipWaiting();
});

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  try {
    await cache.addAll(PRECACHE_URLS);
  } catch (error) {
    console.warn('[service-worker] 一括キャッシュに失敗したため、1件ずつ再試行します。', error);
    await Promise.all(
      PRECACHE_URLS.map(async (url) => {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          } else {
            console.warn(`[service-worker] キャッシュ対象の取得に失敗しました: ${url} (status: ${response.status})`);
          }
        } catch (fetchError) {
          console.warn(`[service-worker] キャッシュ対象の取得中にエラーが発生しました: ${url}`, fetchError);
        }
      }),
    );
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOutdatedCaches());
  self.clients.claim();
});

async function deleteOutdatedCaches() {
  try {
    const cacheNames = await caches.keys();
    const outdatedCacheNames = cacheNames.filter((name) => name !== CACHE_NAME);

    await Promise.all(outdatedCacheNames.map((name) => caches.delete(name)));
  } catch (error) {
    console.warn('[service-worker] 古いキャッシュの削除中にエラーが発生しました。', error);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone()).catch((error) => {
        console.warn('[service-worker] 動的キャッシュへの保存に失敗しました。', error);
      });
    }

    return networkResponse;
  } catch (error) {
    return respondWithOfflineFallback(request, error);
  }
}

async function respondWithOfflineFallback(request, networkError) {
  console.warn(`[service-worker] ネットワーク取得に失敗しました: ${request.url}`, networkError);

  if (request.mode === 'navigate') {
    const offlinePage = await caches.match(OFFLINE_FALLBACK_URL);
    if (offlinePage) return offlinePage;
  }

  return new Response('オフラインのため、このリソースを取得できませんでした。', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({ 'Content-Type': 'text/plain; charset=UTF-8' }),
  });
}
