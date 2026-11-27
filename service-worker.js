// ============================================
// MoPai 墨排 — Service Worker (PWA 离线支持)
// ============================================

const CACHE_NAME = 'mopai-v24';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/themes.js',
  './js/ai-client.js',
  './js/humanizer.js',
  './js/docs-store.js',
  './js/templates.js',
  './js/media-store.js',
  './js/xhs-cards.js',
  './js/publish-utils.js',
  './js/app.js',
];

// 第三方 CDN 统一域名，运行时 stale-while-revalidate 缓存
const CDN_HOSTS = ['https://cdn.jsdelivr.net'];

const offlineResponse = () => new Response('Offline', { status: 503, statusText: 'Service Unavailable' });

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
  const req = event.request;
  if (req.method !== 'GET') return;

  // 动态内容直连网络：外部注入的草稿（?load=，no-store）与其素材目录，
  // 走缓存会让流水线刚生成的内容更新不可见
  if (req.cache === 'no-store' || req.cache === 'reload' || req.url.includes('/article-assets/')) {
    event.respondWith(fetch(req));
    return;
  }

  // HTML 文档：network-first，部署后尽快生效，离线回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then(c => c || caches.match('./index.html') || offlineResponse())
      )
    );
    return;
  }

  // CDN 资源：stale-while-revalidate，离线未命中时返回合法 503 响应而非 null
  if (CDN_HOSTS.some(host => req.url.startsWith(host))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const fetched = fetch(req).then((response) => {
          if (response.ok) cache.put(req, response.clone());
          return response;
        }).catch(() => null);
        return cached || (await fetched) || offlineResponse();
      })
    );
    return;
  }

  // 本地静态资源：stale-while-revalidate + ignoreSearch 兜底，
  // 既让带 ?v= 版本号的脚本首次离线时可命中预缓存，又能在线自动后台刷新
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const exactCached = await cache.match(req);
      const fallbackCached = exactCached || await cache.match(req, { ignoreSearch: true });
      const fetched = fetch(req).then((response) => {
        if (response.ok) cache.put(req, response.clone());
        return response;
      }).catch(() => null);
      return exactCached || (await fetched) || fallbackCached || offlineResponse();
    })
  );
});
