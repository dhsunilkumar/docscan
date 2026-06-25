const CACHE_NAME = 'docuscan-ocr-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './icons.svg',
  './opencv.js'
];

// Install Event - Pre-cache shell assets & OpenCV.js
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching Core Shell & OpenCV.js...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Serve from cache, fallback to network & dynamically cache new assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // Only cache successful requests
        if (!response || response.status !== 200) {
          return response;
        }

        // Cache local files (basic) and CDN files (cors)
        const isBasic = response.type === 'basic';
        const isCors = response.type === 'cors';
        
        if (isBasic || isCors) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      }).catch((err) => {
        console.warn('[Service Worker] Fetch failed for:', event.request.url, err);
      });
    })
  );
});
