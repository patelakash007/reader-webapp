'use strict';

const CACHE_NAME = 'reader-webapp-shell-v3';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.webmanifest',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './vendor/mammoth.browser.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
];

const ROOT_URL = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const ROOT_URL_WITHOUT_TRAILING_SLASH = ROOT_URL.endsWith('/') ? ROOT_URL.slice(0, -1) : ROOT_URL;
const APP_SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));
const CANONICAL_NAVIGATION_URLS = new Set([ROOT_URL, INDEX_URL]);

function getRequestUrl(request) {
  const url = new URL(request.url);
  url.hash = '';
  if (url.href === ROOT_URL_WITHOUT_TRAILING_SLASH) return ROOT_URL;
  return url.href;
}

function isSameOriginGet(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

function isCanonicalAppShellRequest(request) {
  return isSameOriginGet(request) && APP_SHELL_URLS.has(getRequestUrl(request));
}

function isCanonicalNavigation(request) {
  return request.mode === 'navigate' && CANONICAL_NAVIGATION_URLS.has(getRequestUrl(request));
}

function safeCachePut(cache, request, response) {
  try {
    return cache.put(request, response).catch(err => {
      console.warn('Service worker cache write failed.', err);
    });
  } catch (err) {
    console.warn('Service worker cache write failed.', err);
    return Promise.resolve();
  }
}

async function cacheCanonicalNavigation(cache, request, response) {
  if (!response || !response.ok || !isCanonicalNavigation(request)) return;

  const requestUrl = getRequestUrl(request);
  await safeCachePut(cache, requestUrl, response.clone());

  if (requestUrl === ROOT_URL) {
    await safeCachePut(cache, INDEX_URL, response.clone());
  } else if (requestUrl === INDEX_URL) {
    await safeCachePut(cache, ROOT_URL, response.clone());
  }
}

async function navigationResponse(request, event) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const fetchPromise = fetch(request);
    event.waitUntil(fetchPromise
      .then(response => cacheCanonicalNavigation(cache, request, response))
      .catch(() => undefined));
    return await fetchPromise;
  } catch (err) {
    const cachedShell = await cache.match(INDEX_URL) || await cache.match(ROOT_URL);
    return cachedShell || Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request, { cache: 'no-cache' });

  event.waitUntil(fetchPromise
    .then(response => {
      if (response && response.ok && isCanonicalAppShellRequest(request)) {
        return safeCachePut(cache, request, response.clone());
      }
      return undefined;
    })
    .catch(() => undefined));

  if (cached) {
    event.waitUntil(fetchPromise.catch(() => undefined));
    return cached;
  }

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
    await Promise.all(keys
      .filter(key => key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request, event));
    return;
  }

  if (isCanonicalAppShellRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
