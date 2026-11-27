// ============================================
// MoPai 墨排 — 多文档草稿箱（IndexedDB 持久化 + 纯函数工具）
// 零依赖 UMD 模块（浏览器 & Node 共用）
// ============================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.MoPaiDocs = api;
  if (typeof globalThis !== 'undefined') globalThis.MoPaiDocs = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DB_NAME = 'mopai-docs-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'documents';

  function deriveTitle(markdown) {
    const text = String(markdown || '');
    // 1. YAML frontmatter title
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    let body = text;
    if (fm) {
      body = text.slice(fm[0].length);
      const t = fm[1].match(/^title\s*:\s*(.+)$/m);
      if (t) {
        const cleaned = t[1].trim().replace(/^["']|["']$/g, '').trim();
        if (cleaned) return cleaned.slice(0, 48);
      }
    }
    // 2. First Markdown heading
    const h = body.match(/^\s*#{1,6}\s+(.+)$/m);
    if (h) {
      const cleaned = h[1].replace(/[*_`~[\]()#]/g, '').trim();
      if (cleaned) return cleaned.slice(0, 48);
    }
    // 3. First non-empty line
    for (const line of body.split(/\r?\n/)) {
      const cleaned = line.replace(/^[>\-*+\s\d.]+/, '').replace(/[*_`~[\]()]/g, '').trim();
      if (cleaned && !cleaned.startsWith('```') && !cleaned.startsWith(':::')) {
        return cleaned.slice(0, 48);
      }
    }
    return '未命名文稿';
  }

  function deriveExcerpt(markdown) {
    const body = String(markdown || '')
      .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+.*$/gm, '')
      .replace(/[*_~`>#|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return body.slice(0, 72) || '空白草稿';
  }

  function countWords(markdown) {
    const text = String(markdown || '').trim();
    if (!text) return 0;
    const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const en = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[a-zA-Z0-9]+/g) || []).length;
    return cn + en;
  }

  function createDocRecord({ id, content = '', theme = 'default', title, now = Date.now() } = {}) {
    const docId = id || ('doc-' + now + '-' + Math.random().toString(36).slice(2, 7));
    return {
      id: docId,
      title: (title && String(title).trim()) || deriveTitle(content),
      excerpt: deriveExcerpt(content),
      content: String(content || ''),
      theme: theme || 'default',
      wordCount: countWords(content),
      createdAt: now,
      updatedAt: now,
    };
  }

  function filterAndSortDocs(docs, query = '') {
    const q = String(query || '').trim().toLowerCase();
    const list = Array.isArray(docs) ? docs.slice() : [];
    const filtered = q
      ? list.filter((d) =>
          (d.title || '').toLowerCase().includes(q) ||
          (d.excerpt || '').toLowerCase().includes(q) ||
          (d.content || '').toLowerCase().includes(q)
        )
      : list;
    filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return filtered;
  }

  function formatRelativeTime(ts, now = Date.now()) {
    const diffSec = Math.max(0, Math.floor((now - (ts || now)) / 1000));
    if (diffSec < 60) return '刚刚';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ─── IndexedDB 持久化（支持不可用时静默回退到内存列表） ───
  let dbPromise = null;
  let memoryFallback = null;

  function openDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function listDocs() {
    const db = await openDb();
    if (!db) return filterAndSortDocs(memoryFallback || []);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(filterAndSortDocs(req.result || []));
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async function saveDoc(record) {
    const clean = {
      id: record.id,
      title: deriveTitle(record.content),
      excerpt: deriveExcerpt(record.content),
      content: String(record.content || ''),
      theme: record.theme || 'default',
      wordCount: countWords(record.content),
      createdAt: record.createdAt || Date.now(),
      updatedAt: record.updatedAt || Date.now(),
    };
    const db = await openDb();
    if (!db) {
      memoryFallback = (memoryFallback || []).filter((d) => d.id !== clean.id);
      memoryFallback.push(clean);
      return clean;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(clean);
        tx.oncomplete = () => resolve(clean);
        tx.onerror = () => resolve(clean);
      } catch {
        resolve(clean);
      }
    });
  }

  async function deleteDoc(id) {
    const db = await openDb();
    if (!db) {
      memoryFallback = (memoryFallback || []).filter((d) => d.id !== id);
      return true;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  return {
    deriveTitle,
    deriveExcerpt,
    countWords,
    createDocRecord,
    filterAndSortDocs,
    formatRelativeTime,
    listDocs,
    saveDoc,
    deleteDoc,
  };
});
