// ============================================
// MoPai 墨排 — 多图床聚合 + IndexedDB 本地图库
// 零依赖原生实现：IndexedDB 大容量持久化 + Canvas 智能压缩 + 多图床统一路由
// ============================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MoPaiMedia = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DB_NAME = 'mopai-media-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'images';
  const CONFIG_KEY = 'md-converter-media-config';
  const LEGACY_STORE_KEY = 'md-converter-image-store';

  const PROVIDERS = {
    local: {
      id: 'local',
      name: '本地图库 (IndexedDB)',
      desc: '百 MB 级本地大容量存储，离线可用、零外传，适合快速写作与本地存档',
    },
    github: {
      id: 'github',
      name: 'GitHub + CDN',
      desc: '直传个人 GitHub 仓库，自动生成 jsDelivr / 自定义加速域名永久外链',
    },
    smms: {
      id: 'smms',
      name: 'SM.MS 图床',
      desc: '老牌公共图床，使用个人 API Token 认证上传',
    },
    custom: {
      id: 'custom',
      name: '自定义上传接口',
      desc: '兼容 PicGo / Lsky Pro / EasyImage / 自建 Cloudflare Worker 等 HTTP 上传 API',
    },
  };

  function getDefaultConfig() {
    return {
      provider: 'local',
      compress: true,
      maxWidth: 1600,
      quality: 0.85,
      github: {
        owner: '',
        repo: '',
        branch: 'main',
        path: 'images',
        token: '',
        cdnType: 'jsdelivr', // 'jsdelivr' | 'raw' | 'custom'
        customDomain: '',
      },
      smms: {
        token: '',
      },
      custom: {
        endpoint: '',
        fieldName: 'file',
        headersText: '',
        responsePath: 'data.url',
        urlPrefix: '',
      },
    };
  }

  function mergeConfig(raw) {
    const def = getDefaultConfig();
    if (!raw || typeof raw !== 'object') return def;
    return {
      provider: PROVIDERS[raw.provider] ? raw.provider : def.provider,
      compress: raw.compress !== false,
      maxWidth: Number(raw.maxWidth) >= 400 ? Number(raw.maxWidth) : def.maxWidth,
      quality: Number(raw.quality) > 0.2 && Number(raw.quality) <= 1 ? Number(raw.quality) : def.quality,
      github: { ...def.github, ...(raw.github && typeof raw.github === 'object' ? raw.github : {}) },
      smms: { ...def.smms, ...(raw.smms && typeof raw.smms === 'object' ? raw.smms : {}) },
      custom: { ...def.custom, ...(raw.custom && typeof raw.custom === 'object' ? raw.custom : {}) },
    };
  }

  function stripConfigSecrets(cfg) {
    const clean = mergeConfig(cfg);
    return {
      ...clean,
      github: { ...clean.github, token: '' },
      smms: { ...clean.smms, token: '' },
      custom: { ...clean.custom, headersText: '' },
    };
  }

  // 按点路径从 JSON 中读取值（如 "data.url" 或 "data.links.0.url"）
  function extractByPath(obj, pathStr) {
    if (!obj || !pathStr) return '';
    const parts = String(pathStr).trim().split('.').filter(Boolean);
    let cur = obj;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return '';
      cur = cur[part];
    }
    return typeof cur === 'string' ? cur.trim() : '';
  }

  // 解析多行 "Key: Value" 自定义请求头
  function parseHeadersText(text) {
    const headers = {};
    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k && v) headers[k] = v;
    }
    return headers;
  }

  function sanitizeFilename(name, mime) {
    const extFromMime = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    }[mime] || 'png';
    const base = String(name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'image';
    const extMatch = String(name || '').match(/\.([a-zA-Z0-9]{2,5})$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : extFromMime;
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 6);
    return `${stamp}-${base}-${rand}.${ext}`;
  }

  function buildGithubUrl(gh, filePath) {
    const cleanPath = String(filePath || '').replace(/^\/+/, '');
    const branch = (gh.branch || 'main').trim() || 'main';
    if (gh.cdnType === 'custom' && gh.customDomain) {
      return `${gh.customDomain.trim().replace(/\/+$/, '')}/${cleanPath}`;
    }
    if (gh.cdnType === 'raw') {
      return `https://raw.githubusercontent.com/${gh.owner.trim()}/${gh.repo.trim()}/${branch}/${cleanPath}`;
    }
    return `https://cdn.jsdelivr.net/gh/${gh.owner.trim()}/${gh.repo.trim()}@${branch}/${cleanPath}`;
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function estimateDataUrlBytes(dataUrl) {
    const idx = String(dataUrl || '').indexOf(',');
    if (idx === -1) return 0;
    const b64 = dataUrl.slice(idx + 1);
    return Math.floor((b64.length * 3) / 4);
  }

  // ─── IndexedDB 封装（带无 IDB 环境内存兜底） ───
  let dbPromise = null;
  const memoryFallback = new Map();

  function hasIndexedDB() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  function openDb() {
    if (!hasIndexedDB()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { dbPromise = null; resolve(null); };
      } catch {
        dbPromise = null;
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function putLocalImage(record) {
    const item = {
      id: record.id,
      name: record.name || '图片',
      mime: record.mime || 'image/png',
      dataUrl: record.dataUrl,
      size: record.size || estimateDataUrlBytes(record.dataUrl),
      createdAt: record.createdAt || Date.now(),
    };
    memoryFallback.set(item.id, item);
    const db = await openDb();
    if (!db) return item;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB 写入失败'));
    });
  }

  async function listLocalImages() {
    const db = await openDb();
    if (!db) {
      return [...memoryFallback.values()].sort((a, b) => b.createdAt - a.createdAt);
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const rows = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        rows.forEach((r) => memoryFallback.set(r.id, r));
        resolve(rows);
      };
      req.onerror = () => resolve([...memoryFallback.values()]);
    });
  }

  async function deleteLocalImage(id) {
    memoryFallback.delete(id);
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async function pruneUnusedLocalImages(usedIds) {
    const rows = await listLocalImages();
    let removed = 0;
    let freedBytes = 0;
    for (const row of rows) {
      if (!usedIds.has(row.id)) {
        await deleteLocalImage(row.id);
        removed++;
        freedBytes += row.size || 0;
      }
    }
    return { removed, freedBytes };
  }

  // 自动将旧版 localStorage 中的 Base64 图片迁移进 IndexedDB 并释放 localStorage 配额
  async function migrateFromLegacyLocalStorage() {
    if (typeof localStorage === 'undefined') return [];
    let legacyEntries = [];
    try {
      const raw = localStorage.getItem(LEGACY_STORE_KEY);
      if (!raw) return await listLocalImages();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) legacyEntries = parsed;
    } catch {
      return await listLocalImages();
    }

    const db = await openDb();
    for (const entry of legacyEntries) {
      if (!Array.isArray(entry) || !entry[0] || !entry[1]) continue;
      const [id, dataUrl] = entry;
      const mimeMatch = String(dataUrl).match(/^data:([^;]+);/);
      await putLocalImage({
        id,
        name: `${id}.png`,
        mime: mimeMatch ? mimeMatch[1] : 'image/png',
        dataUrl,
        size: estimateDataUrlBytes(dataUrl),
        createdAt: Date.now(),
      });
    }
    // 仅当 IndexedDB 可用并迁移成功时才清空旧 localStorage 键，保证无 IDB 环境不丢图
    if (db && legacyEntries.length > 0) {
      try { localStorage.removeItem(LEGACY_STORE_KEY); } catch {}
    }
    return await listLocalImages();
  }

  // ─── 智能图片压缩（保留 GIF 动图与 SVG 矢量图原样） ───
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [head, body] = String(dataUrl).split(',');
    const mime = head.match(/:([^;]+);/)?.[1] || 'image/png';
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function compressImageFile(file, opts = {}) {
    const origDataUrl = await readFileAsDataUrl(file);
    const mime = file.type || 'image/png';
    const origSize = file.size || estimateDataUrlBytes(origDataUrl);
    const enable = opts.compress !== false;
    const maxWidth = Number(opts.maxWidth) || 1600;
    const quality = Number(opts.quality) || 0.85;

    // 跳过 GIF 动图、SVG 以及本就很小的图片（< 150KB）
    if (!enable || mime === 'image/gif' || mime === 'image/svg+xml' || origSize < 150 * 1024 || typeof document === 'undefined') {
      return { blob: file, dataUrl: origDataUrl, mime, size: origSize, compressed: false };
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve({ blob: file, dataUrl: origDataUrl, mime, size: origSize, compressed: false });
            return;
          }
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          // JPEG 目标格式需铺白底，防止透明通道变黑
          const targetMime = (mime === 'image/jpeg' || origSize > 1.2 * 1024 * 1024) ? 'image/jpeg' : mime;
          if (targetMime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);
          const outDataUrl = canvas.toDataURL(targetMime, quality);
          const outSize = estimateDataUrlBytes(outDataUrl);
          if (outSize > 0 && outSize < origSize * 0.95) {
            resolve({
              blob: dataUrlToBlob(outDataUrl),
              dataUrl: outDataUrl,
              mime: targetMime,
              size: outSize,
              compressed: true,
            });
          } else {
            resolve({ blob: file, dataUrl: origDataUrl, mime, size: origSize, compressed: false });
          }
        } catch {
          resolve({ blob: file, dataUrl: origDataUrl, mime, size: origSize, compressed: false });
        }
      };
      img.onerror = () => resolve({ blob: file, dataUrl: origDataUrl, mime, size: origSize, compressed: false });
      img.src = origDataUrl;
    });
  }

  // ─── 云图床上传适配器 ───
  async function uploadToGithub(prepared, fileName, gh, fetchImpl = fetch) {
    const owner = (gh.owner || '').trim();
    const repo = (gh.repo || '').trim();
    const token = (gh.token || '').trim();
    const branch = (gh.branch || 'main').trim() || 'main';
    const dir = (gh.path || 'images').trim().replace(/^\/+|\/+$/g, '');
    if (!owner || !repo || !token) {
      throw new Error('请先完善 GitHub 用户名、仓库名和 Personal Access Token');
    }

    const safeName = sanitizeFilename(fileName, prepared.mime);
    const filePath = dir ? `${dir}/${safeName}` : safeName;
    const base64Body = prepared.dataUrl.slice(prepared.dataUrl.indexOf(',') + 1);
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`;

    const resp = await fetchImpl(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `chore(mopai): upload ${safeName}`,
        content: base64Body,
        branch,
      }),
    });

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json()).message || ''; } catch {}
      throw new Error(`GitHub 上传失败 (${resp.status})${detail ? '：' + detail : ''}`);
    }

    return buildGithubUrl(gh, filePath);
  }

  async function uploadToSmms(prepared, fileName, smms, fetchImpl = fetch) {
    const token = (smms.token || '').trim();
    if (!token) throw new Error('SM.MS v2 图床需要先配置 API Token');
    const formData = new FormData();
    formData.append('smfile', prepared.blob, sanitizeFilename(fileName, prepared.mime));
    const resp = await fetchImpl('https://sm.ms/api/v2/upload', {
      method: 'POST',
      headers: { Authorization: token },
      body: formData,
    });
    const data = await resp.json();
    if (data.success && data.data?.url) return data.data.url;
    if (data.code === 'image_repeated' && data.images) return data.images;
    throw new Error(data.message || 'SM.MS 上传失败');
  }

  async function uploadToCustom(prepared, fileName, custom, fetchImpl = fetch) {
    const endpoint = (custom.endpoint || '').trim();
    if (!endpoint) throw new Error('请先填写自定义图床上传地址 (Endpoint)');
    const fieldName = (custom.fieldName || 'file').trim() || 'file';
    const headers = parseHeadersText(custom.headersText);
    const formData = new FormData();
    formData.append(fieldName, prepared.blob, sanitizeFilename(fileName, prepared.mime));

    const resp = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!resp.ok) {
      throw new Error(`自定义图床返回 HTTP ${resp.status}`);
    }
    const contentType = resp.headers?.get?.('content-type') || '';
    let url = '';
    if (contentType.includes('application/json')) {
      const json = await resp.json();
      url = extractByPath(json, custom.responsePath || 'data.url')
        || extractByPath(json, 'url')
        || extractByPath(json, 'data.links.url');
    } else {
      const text = (await resp.text()).trim();
      try {
        const json = JSON.parse(text);
        url = extractByPath(json, custom.responsePath || 'data.url') || extractByPath(json, 'url');
      } catch {
        if (/^https?:\/\//i.test(text)) url = text;
      }
    }
    if (!url) {
      throw new Error(`无法按路径 "${custom.responsePath || 'data.url'}" 从响应中提取图片 URL`);
    }
    if (custom.urlPrefix && !/^https?:\/\//i.test(url)) {
      url = `${custom.urlPrefix.trim().replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
    }
    return url;
  }

  async function uploadImage(file, config, opts = {}) {
    const cfg = mergeConfig(config);
    const prepared = await compressImageFile(file, cfg);
    const fileName = file.name || 'image.png';
    const fetchImpl = opts.fetchImpl || fetch;

    if (cfg.provider === 'local') {
      return { mode: 'local', prepared };
    }
    if (cfg.provider === 'github') {
      const url = await uploadToGithub(prepared, fileName, cfg.github, fetchImpl);
      return { mode: 'remote', provider: 'github', url, prepared };
    }
    if (cfg.provider === 'smms') {
      const url = await uploadToSmms(prepared, fileName, cfg.smms, fetchImpl);
      return { mode: 'remote', provider: 'smms', url, prepared };
    }
    if (cfg.provider === 'custom') {
      const url = await uploadToCustom(prepared, fileName, cfg.custom, fetchImpl);
      return { mode: 'remote', provider: 'custom', url, prepared };
    }
    return { mode: 'local', prepared };
  }

  return {
    CONFIG_KEY,
    PROVIDERS,
    getDefaultConfig,
    mergeConfig,
    stripConfigSecrets,
    extractByPath,
    parseHeadersText,
    buildGithubUrl,
    formatBytes,
    estimateDataUrlBytes,
    putLocalImage,
    listLocalImages,
    deleteLocalImage,
    pruneUnusedLocalImages,
    migrateFromLegacyLocalStorage,
    compressImageFile,
    uploadImage,
  };
});
