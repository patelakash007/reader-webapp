'use strict';

const CACHE_NAME = 'reader-webapp-shell-v7';
const APP_SHELL = [
  './', './index.html', './style.css', './script.js',
  './src/app.mjs', './src/constants.mjs', './src/context.mjs', './src/dom.mjs', './src/parser.mjs',
  './src/reader.mjs', './src/settings.mjs', './src/storage.mjs', './src/tts.mjs', './src/ui.mjs', './src/utils.mjs',
  './manifest.webmanifest', './vendor/pdf.min.js', './vendor/pdf.worker.min.js', './vendor/mammoth.browser.min.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png'
];

const ROOT_URL = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const ROOT_PATH = new URL(ROOT_URL).pathname;
const INDEX_PATH = new URL(INDEX_URL).pathname;
const APP_SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));

function getRequestUrl(request) {
  const url = new URL(request.url);
  url.hash = '';
  if (url.href === ROOT_URL.replace(/\/$/, '')) return ROOT_URL;
  return url.href;
}

function isSameOriginGet(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

function isCanonicalAppShellRequest(request) {
  return isSameOriginGet(request) && APP_SHELL_URLS.has(getRequestUrl(request));
}

function isCanonicalNavigation(request) {
  if (request.method !== 'GET' || request.mode !== 'navigate') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return url.pathname === ROOT_PATH || url.pathname === INDEX_PATH;
}

function safeCachePut(cache, request, response) {
  try {
    return cache.put(request, response).catch(err => console.warn('Service worker cache write failed.', err));
  } catch (err) {
    console.warn('Service worker cache write failed.', err);
    return Promise.resolve();
  }
}

async function cacheCanonicalNavigation(cache, request, response) {
  if (!response || !response.ok || !isCanonicalNavigation(request)) return;
  const requestUrl = getRequestUrl(request);
  const writes = [safeCachePut(cache, requestUrl, response.clone())];
  if (new URL(requestUrl).pathname === ROOT_PATH) writes.push(safeCachePut(cache, INDEX_URL, response.clone()));
  else if (new URL(requestUrl).pathname === INDEX_PATH) writes.push(safeCachePut(cache, ROOT_URL, response.clone()));
  await Promise.all(writes);
}

async function navigationResponse(request, event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fetchPromise = fetch(request);
    event.waitUntil(fetchPromise.then(response => cacheCanonicalNavigation(cache, request, response)).catch(() => undefined));
    return await fetchPromise;
  } catch (err) {
    return (await cache.match(INDEX_URL)) || (await cache.match(ROOT_URL)) || Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request, { cache: 'no-cache' });
  event.waitUntil(fetchPromise.then(response => {
    if (response && response.ok && isCanonicalAppShellRequest(request)) return safeCachePut(cache, request, response.clone());
    return undefined;
  }).catch(() => undefined));
  if (cached) return cached;
  return fetchPromise;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const requests = APP_SHELL.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' }));
    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (isCanonicalNavigation(request)) {
    event.respondWith(navigationResponse(request, event));
    return;
  }
  if (isCanonicalAppShellRequest(request)) event.respondWith(staleWhileRevalidate(request, event));
});
