'use strict';

const CACHE_NAME = 'reader-webapp-shell-v1';
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

const SHELL_URLS = new Set(APP_SHELL.map(path => {
  const url = new URL(path, self.registration.scope);
  url.hash = '';
  url.search = '';
  return url.href;
}));

function normalizeRequestUrl(request) {
  const url = new URL(request.url);
  url.hash = '';
  url.search = '';
  return url.href;
}

function isShellRequest(request) {
  if (request.method !== 'GET') return false;
  if (new URL(request.url).origin !== self.location.origin) return false;
  return SHELL_URLS.has(normalizeRequestUrl(request));
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(normalizeRequestUrl(request));
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok && isShellRequest(request)) {
    await cache.put(normalizeRequestUrl(request), response.clone());
  }
  return response;
}

async function navigationResponse(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match('./index.html') || cache.match('./');
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
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

  if (isShellRequest(request)) {
    event.respondWith(cacheFirst(request));
  }
});
