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
const APP_SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));
const CANONICAL_NAVIGATION_URLS = new Set([ROOT_URL, INDEX_URL]);

function getRequestUrl(request) {
  const url = new URL(request.url);
  url.hash = '';
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

async function cacheCanonicalNavigation(cache, request, response) {
  if (!response || !response.ok || !isCanonicalNavigation(request)) return;

  const requestUrl = getRequestUrl(request);
  await cache.put(requestUrl, response.clone());

  if (requestUrl === ROOT_URL) {
    await cache.put(INDEX_URL, response.clone());
  } else if (requestUrl === INDEX_URL) {
    await cache.put(ROOT_URL, response.clone());
  }
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: 'no-cache' });
    await cacheCanonicalNavigation(cache, request, response);
    return response;
  } catch (err) {
    const cachedShell = await cache.match(INDEX_URL) || await cache.match(ROOT_URL);
    return cachedShell || Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request, { cache: 'no-cache' }).then(async response => {
    if (response && response.ok && isCanonicalAppShellRequest(request)) {
      await cache.put(request, response.clone());
    }
    return response;
  });

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
    event.respondWith(navigationResponse(request));
    return;
  }

  if (isCanonicalAppShellRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
