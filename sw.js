'use strict';

const CACHE_NAME = 'reader-webapp-shell-v8';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './src/app.mjs',
  './src/constants.mjs',
  './src/context.mjs',
  './src/dom.mjs',
  './src/parser.mjs',
  './src/reader.mjs',
  './src/settings.mjs',
  './src/storage.mjs',
  './src/tts.mjs',
  './src/ui.mjs',
  './src/utils.mjs',
  './manifest.webmanifest',
  './vendor/marked.esm.mjs',
  './vendor/pdf.min.mjs',
  './vendor/pdf.worker.min.mjs',
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
  const withoutSearch = new URL(url.href);
  withoutSearch.search = '';
  if (withoutSearch.href === ROOT_URL_WITHOUT_TRAILING_SLASH || withoutSearch.href === ROOT_URL) {
    return ROOT_URL;
  }
  if (withoutSearch.href === INDEX_URL) {
    return INDEX_URL;
  }
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
  const cacheWrites = [safeCachePut(cache, requestUrl, response.clone())];

  if (requestUrl === ROOT_URL) {
    cacheWrites.push(safeCachePut(cache, INDEX_URL, response.clone()));
  } else if (requestUrl === INDEX_URL) {
    cacheWrites.push(safeCachePut(cache, ROOT_URL, response.clone()));
  }

  await Promise.all(cacheWrites);
}

async function navigationResponse(request, event) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) {
    return fetch(request);
  }

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

async function cacheFirst(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      event.waitUntil(safeCachePut(cache, request, response.clone()));
    }
    return response;
  } catch (err) {
    return cached || Response.error();
  }
}

function isVendorRequest(request) {
  if (!isSameOriginGet(request)) return false;
  const url = new URL(request.url);
  return url.pathname.includes('/vendor/');
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
    const url = new URL(request.url);
    if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
      event.respondWith(navigationResponse(request, event));
    }
    return;
  }

  if (isVendorRequest(request)) {
    event.respondWith(cacheFirst(request, event));
    return;
  }

  if (isCanonicalAppShellRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
