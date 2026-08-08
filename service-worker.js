// ============================================================
// service-worker.js
// Calculator 0209 のオフライン対応を担う Service Worker。
// ES Modulesは使用しない、通常のクラシックスクリプトとして実装する
// （<script src="js/app.js" type="module"> とは独立した実行コンテキスト）。
//
// 戦略：
//   install  … 主要ファイルを事前キャッシュする
//   activate … 古いバージョンのキャッシュを削除する
//   fetch    … キャッシュ優先 → ネットワーク → オフラインフォールバック(index.html)
// ============================================================

'use strict';

// ------------------------------------------------------------
// バージョン管理
// キャッシュの中身（対象ファイルや内容）を変更したら、この数値を
// 上げるだけで古いキャッシュが自動的に破棄され、新しい内容に更新される。
// ------------------------------------------------------------
const CACHE_VERSION = 6;
const CACHE_NAME = `calculator-0209-cache-v${CACHE_VERSION}`;

// ------------------------------------------------------------
// 初回アクセス時に事前キャッシュしておくファイル一覧。
// index.html / manifest.json / css・js・アイコン一式を含む。
// Workspace/Records/Router/Passcode/AutoLock導入に伴い、
// 対象ファイルを追加している（CACHE_VERSIONもあわせて引き上げ、
// それ以前のセッションで端末に残っている古いキャッシュを破棄する）。
// Calendar画面追加に伴い、calendar.js/calendar.cssも追加し、
// CACHE_VERSIONを再度引き上げている。
// Archive画面追加に伴い、archive.js/archive.cssも追加し、
// CACHE_VERSIONをさらに引き上げている。
// Phase1（メッセージ機能）追加に伴い、pairing.js/messages.js/
// firebase.js/firebase-config.js/pairing.css/messages.cssを追加し、
// CACHE_VERSIONをさらに引き上げている。
// Phase1.6（Workspace共有カスタマイズ）追加に伴い、customization.jsを
// 追加し、CACHE_VERSIONをv6へ引き上げている（このファイルの追加漏れが
// Phase1.7で見つかったため、あわせて修正した）。
// なお、Firebase SDK自体（https://www.gstatic.com/firebasejs/...）は
// 他オリジンのため、このService Workerのfetchハンドラの対象外
// （下記の同一オリジン判定で自動的に除外される）。ブラウザの通常の
// HTTPキャッシュに任せる。
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
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
]);

// オフライン時、ページ遷移（navigate）の代わりに返すフォールバック先。
const OFFLINE_FALLBACK_URL = './index.html';

// ------------------------------------------------------------
// install：主要ファイルを事前キャッシュする
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
  // 新しいService Workerを即座にactive状態へ進める。
  // 古いタブが古いキャッシュのまま動き続けるのを防ぎ、更新を反映しやすくする。
  self.skipWaiting();
});

/**
 * PRECACHE_URLSのファイルをまとめてキャッシュする。
 * addAll()は1件でも取得に失敗すると全体が失敗する仕様のため、
 * まず一括取得を試み、失敗した場合は1件ずつ取得し直して
 * 「取得できたものだけキャッシュする」形にフォールバックする。
 * これにより、将来ファイルが1つ増減しても install 全体が
 * 失敗しにくい、壊れづらい構成にしている。
 * @returns {Promise<void>}
 */
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

// ------------------------------------------------------------
// activate：古いバージョンのキャッシュを削除する
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOutdatedCaches());
  // 既に開いているタブに対しても、このService Workerをすぐに有効化する。
  self.clients.claim();
});

/**
 * このCACHE_NAME以外の（＝古いバージョンの）キャッシュをすべて削除する。
 * @returns {Promise<void>}
 */
async function deleteOutdatedCaches() {
  try {
    const cacheNames = await caches.keys();
    const outdatedCacheNames = cacheNames.filter((name) => name !== CACHE_NAME);

    await Promise.all(outdatedCacheNames.map((name) => caches.delete(name)));
  } catch (error) {
    console.warn('[service-worker] 古いキャッシュの削除中にエラーが発生しました。', error);
  }
}

// ------------------------------------------------------------
// fetch：キャッシュ優先 → ネットワーク → オフラインフォールバック
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET以外（POST等）はキャッシュ戦略の対象外とし、通常通りネットワークへ流す。
  if (request.method !== 'GET') return;

  // 他オリジンへのリクエストは対象外とする
  // （このアプリは外部CDN等に依存しない構成のため、基本的に発生しない想定だが、
  // 万一発生してもService Workerが不透明なレスポンスを誤ってキャッシュしないようにする）。
  if (!request.url.startsWith(self.location.origin)) return;

  event.respondWith(handleFetch(request));
});

/**
 * 1件のリクエストを「キャッシュ優先 → ネットワーク → オフラインフォールバック」の
 * 順で処理する。
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleFetch(request) {
  // 1. キャッシュ優先
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  // 2. ネットワーク
  try {
    const networkResponse = await fetch(request);

    // 取得に成功したレスポンスは、以後のオフライン時にも使えるよう動的にキャッシュへ追加する。
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      // レスポンスボディは一度しか読めないため、キャッシュ保存用に複製してから使う。
      cache.put(request, networkResponse.clone()).catch((error) => {
        console.warn('[service-worker] 動的キャッシュへの保存に失敗しました。', error);
      });
    }

    return networkResponse;
  } catch (error) {
    // 3. オフラインフォールバック
    return respondWithOfflineFallback(request, error);
  }
}

/**
 * ネットワークにも失敗した場合のフォールバック処理。
 * ページ遷移（HTMLナビゲーション）はindex.htmlを返し、アプリの見た目を維持する。
 * それ以外（画像・スクリプト等の個別リソース）は、意味のあるエラーレスポンスを返す。
 * @param {Request} request
 * @param {Error} networkError
 * @returns {Promise<Response>}
 */
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