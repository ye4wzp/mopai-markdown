// ============================================
// MoPai 墨排 — Service Worker (PWA 离线支持)
// ============================================

const CACHE_NAME = 'mopai-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/themes.js',
  './js/ai-detector.js',
  './js/templates.js',
  './js/app.js',
];

// CDN 资源单独缓存
const CDN_ASSETS = [
  'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  'https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js',
  'https://cdn.jsdelivr.net/npm/highlight.js@11/highlight.min.js',
  'https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github.min.css',
  'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
];

// 安装：缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活：清除旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CDN 资源：stale-while-revalidate
  if (CDN_ASSETS.some(cdn => event.request.url.startsWith(cdn.split('/').slice(0, 3).join('/')))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetched = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => null);
        return cached || fetched;
      })
    );
    return;
  }

  // 本地资源：缓存优先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
