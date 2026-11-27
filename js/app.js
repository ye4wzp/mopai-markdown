// ============================================
// Markdown 排版器 V3 — Vue 3 应用主逻辑
// ============================================
const { createApp, ref, computed, watch, onMounted, onUnmounted, nextTick } = Vue;

// localStorage JSON 读取兜底：数据损坏时返回默认值，避免整页崩溃
function lsReadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

// ─── YAML Frontmatter 解析（与 lib/renderer.mjs 保持一致） ───
function stripFrontmatter(markdown) {
  const text = String(markdown || '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return { body: text, frontmatter: {} };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { body: text.slice(m[0].length), frontmatter: fm };
}

// 判断十六进制背景色是否为浅色（用于自动匹配浅色代码块高亮配色）
function isLightHexColor(hex) {
  if (!hex || typeof hex !== 'string') return false;
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

// 按需懒加载重型第三方脚本（保留版本锁定 + SRI 校验，避免首屏阻塞）
const LAZY_LIBS = {
  mermaid: {
    global: 'mermaid',
    src: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.6/dist/mermaid.min.js',
    integrity: 'sha384-qX9VvWkP79m/O121ZE6sOYp0nf/pldQgtvWDbkpzi+3mUo4Wn4Ix4cFzNPay3VaB',
  },
  html2canvas: {
    global: 'html2canvas',
    src: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H',
  },
  htmlDocx: {
    global: 'htmlDocx',
    src: 'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js',
    integrity: 'sha384-TtrQp5nveof/QP1+f/OLiEHL3GuOIRyl3IfsGxu5X45VO2vHeT4HRNmQuTR3Ea3w',
  },
};
const lazyLibPromises = {};
function loadLazyLib(name) {
  const spec = LAZY_LIBS[name];
  if (!spec) return Promise.reject(new Error('Unknown lib: ' + name));
  if (window[spec.global]) return Promise.resolve(window[spec.global]);
  if (lazyLibPromises[name]) return lazyLibPromises[name];
  lazyLibPromises[name] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = spec.src;
    script.integrity = spec.integrity;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window[spec.global]) resolve(window[spec.global]);
      else { delete lazyLibPromises[name]; reject(new Error(name + ' 加载后未注册全局对象')); }
    };
    script.onerror = () => {
      delete lazyLibPromises[name];
      reject(new Error(name + ' CDN 加载失败，请检查网络连接'));
    };
    document.head.appendChild(script);
  });
  return lazyLibPromises[name];
}

const app = createApp({
  setup() {
    // ─── 外部注入草稿（?load=<同源 md 路径>）──
    // 供内容流水线自动灌稿。注入的标签页改用 sessionStorage 存草稿，与其他标签页的
    // localStorage 草稿完全隔离，避免旧标签页的自动保存覆盖新注入的稿子
    const injectParam = new URLSearchParams(location.search).get('load');
    const draftStore = injectParam ? sessionStorage : localStorage;

    // 同步读取初始本地配置，彻底消除首屏闪烁与 sampleMarkdown 污染撤回栈
    const initialDraft = (() => {
      try { return draftStore.getItem('md-converter-draft'); } catch { return null; }
    })();
    const savedThemeInit = localStorage.getItem('md-converter-theme');
    const savedDarkInit = localStorage.getItem('md-converter-dark') === 'true';
    const savedColorInit = localStorage.getItem('md-converter-color') || '';
    const savedFontInit = localStorage.getItem('md-converter-font') || 'sans';
    const savedSizeInit = parseInt(localStorage.getItem('md-converter-fontsize') || '16', 10) || 16;
    const savedFootnoteInit = localStorage.getItem('md-converter-footnote') !== 'false';
    const savedSmmsTokenInit = localStorage.getItem('md-converter-smms-token') || '';

    if (savedDarkInit) document.documentElement.setAttribute('data-theme', 'dark');
    if (savedColorInit) document.documentElement.style.setProperty('--primary', savedColorInit);

    // ─── 状态 ──────────────────────────
    const markdownText = ref(initialDraft !== null ? initialDraft : (injectParam ? '' : sampleMarkdown));
    const currentTheme = ref(savedThemeInit && themes[savedThemeInit] ? savedThemeInit : 'default');
    const showHistory = ref(false);
    const showSettings = ref(false);
    const showToc = ref(false);
    const historyList = ref([]);
    const copySuccess = ref(false);
    const copyTarget = ref('');
    const toastKind = computed(() => {
      const t = copyTarget.value;
      if (t === 'exporting-xhs' || t === 'exporting-image' || t === 'loading-lib' || t === 'uploading') return 'loading';
      if (t === 'image-local-fallback' || t === 'storage-full') return 'warn';
      return 'ok';
    });
    const darkMode = ref(savedDarkInit);
    const customColor = ref(savedColorInit);
    const activeColor = computed(() => customColor.value || themes[currentTheme.value]?.accent || '#4f6ef7');
    const fontFamily = ref(savedFontInit);
    const fontSize = ref(savedSizeInit);
    const macCodeBlock = ref(localStorage.getItem('md-converter-maccode') !== 'false');
    const mobilePreview = ref(false);
    const showImageGuide = ref(false);
    const wechatFootnote = ref(savedFootnoteInit);
    const hoveredTheme = ref(null);
    const themePreviewTimer = ref(null);
    const themeTooltipPos = ref({ top: 96, left: 20 });
    const smmsToken = ref(savedSmmsTokenInit);
    const uploadingImage = ref(false);
    const isDragging = ref(false);
    const backupIncludeSecrets = ref(false);

    // ─── 多图床聚合 + IndexedDB 本地图库状态 ───
    const mediaHelper = window.MoPaiMedia;
    const mediaConfig = ref((() => {
      const saved = lsReadJSON('md-converter-media-config', null);
      if (saved) return mediaHelper ? mediaHelper.mergeConfig(saved) : saved;
      const base = mediaHelper ? mediaHelper.getDefaultConfig() : { provider: 'local', compress: true, github: {}, smms: { token: '' }, custom: {} };
      // 平滑迁移老版本 SM.MS Token 配置
      if (savedSmmsTokenInit) {
        base.smms.token = savedSmmsTokenInit;
        if (localStorage.getItem('md-converter-imagehost') !== 'false') {
          base.provider = 'smms';
        }
      }
      return base;
    })());
    const mediaTab = ref('local');
    const localImages = ref([]);
    const mediaProviderList = mediaHelper ? Object.values(mediaHelper.PROVIDERS) : [];
    const mediaProviderInfo = computed(() => (mediaHelper?.PROVIDERS?.[mediaConfig.value.provider]) || { name: '本地图库 (IndexedDB)', desc: '' });
    const mediaProviderLabel = computed(() => mediaProviderInfo.value.name);
    const localImagesTotalSize = computed(() => {
      const total = localImages.value.reduce((sum, it) => sum + (it.size || 0), 0);
      return mediaHelper ? mediaHelper.formatBytes(total) : `${total} B`;
    });

    // ─── 3:4 小红书知识卡片工坊状态 ───
    const xhsHelper = window.MoPaiXhsCards;
    const xhsDialogRef = ref(null);
    const xhsStyleList = xhsHelper ? Object.values(xhsHelper.CARD_THEMES) : [];
    const xhsConfig = ref((() => {
      const saved = lsReadJSON('md-converter-xhs-config', null) || {};
      return {
        styleKey: xhsHelper?.CARD_THEMES?.[saved.styleKey] ? saved.styleKey : 'ink_paper',
        ratio: saved.ratio === '1:1' ? '1:1' : '3:4',
        includeCover: saved.includeCover !== false,
        splitByHr: saved.splitByHr !== false,
        showPageNumber: saved.showPageNumber !== false,
        author: typeof saved.author === 'string' ? saved.author : '',
        tag: typeof saved.tag === 'string' ? saved.tag : '干货笔记',
      };
    })());
    const xhsCards = ref([]);
    const xhsExporting = ref(false);
    const xhsStatus = ref('');

    // localStorage 写入兜底：捕获 QuotaExceededError 避免中断主流程
    function lsSet(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (err) {
        console.warn('localStorage 写入失败:', key, err);
        showToast('storage-full');
        return false;
      }
    }

    // AI 服务配置（BYOK，多服务商；Key 按服务商分别保存）
    const aiConfig = ref((() => {
      const c = lsReadJSON('md-converter-ai-config', null) || {};
      const cfg = {
        provider: aiClient.PROVIDERS[c.provider] ? c.provider : 'deepseek',
        keys: (c.keys && typeof c.keys === 'object') ? c.keys : {},
        models: (c.models && typeof c.models === 'object') ? c.models : {},
        baseUrl: typeof c.baseUrl === 'string' ? c.baseUrl : '',
      };
      // 迁移旧版单一 DeepSeek Key（也覆盖导入旧备份的情况）
      const legacy = localStorage.getItem('md-converter-deepseek-key');
      if (legacy && !cfg.keys.deepseek) cfg.keys.deepseek = legacy;
      return cfg;
    })());
    const aiProviderList = Object.entries(aiClient.PROVIDERS).map(([id, p]) => ({ id, name: p.name, proxy: !!p.proxy }));
    const aiProviderInfo = computed(() => aiClient.PROVIDERS[aiConfig.value.provider]);
    const aiKey = computed(() => aiConfig.value.keys[aiConfig.value.provider] || '');
    const aiModel = computed(() => aiConfig.value.models[aiConfig.value.provider] || '');
    const aiBaseUrl = computed(() => aiConfig.value.baseUrl || '');
    const aiReady = computed(() => aiProviderInfo.value?.customBase ? Boolean(aiBaseUrl.value.trim()) : Boolean(aiKey.value));
    const aiTesting = ref(false);
    const aiTestStatus = ref(null);

    // AI 助手面板（对话排版 + 去 AI 味体检与改写）
    const showAiPanel = ref(false);
    const aiPanelTab = ref('chat');
    const aiMessages = ref([]);
    const aiInput = ref('');
    const aiBusy = ref(false);
    const aiChips = [
      '换成适合技术文的主题',
      '主题色改成微信绿 #07c160',
      '起 5 个标题备选',
      '写一段 100 字摘要',
      '给这篇文章提排版建议',
    ];

    // 去 AI 味（本地 10 维体检 + 冻结事实锚点 + 三档力度改写 + 保真核验 + Diff 确认）
    const humanizerHelper = window.MoPaiHumanizer;
    const humanizeStyle = ref(localStorage.getItem('md-converter-humanize-style') || 'plainspoken');
    const humanizeStyleList = humanizerHelper ? Object.values(humanizerHelper.REWRITE_STYLES) : [];
    const humanizeIntensity = ref(localStorage.getItem('md-converter-humanize-intensity') || 'balanced');
    const humanizeIntensityList = humanizerHelper ? Object.values(humanizerHelper.REWRITE_INTENSITIES) : [];
    const humanizeScope = ref('doc');
    const editorSelection = ref({ start: 0, end: 0, text: '' });
    const humanizeDebouncedDoc = ref(markdownText.value);
    const humanizeActiveCat = ref('all');
    const humanizeBusy = ref(false);
    const humanizeStreamText = ref('');
    const humanizeError = ref('');
    const humanizeProposal = ref(null);
    let humanizeDebounceTimer = null;
    let humanizeAborter = null;

    watch(markdownText, (val) => {
      clearTimeout(humanizeDebounceTimer);
      humanizeDebounceTimer = setTimeout(() => {
        humanizeDebouncedDoc.value = val;
      }, 220);
    });

    const humanizeTargetText = computed(() => {
      if (humanizeScope.value === 'selection' && editorSelection.value.text.trim().length >= 10) {
        return editorSelection.value.text;
      }
      return humanizeDebouncedDoc.value;
    });

    const docHumanizeReport = computed(() => {
      if (!humanizerHelper) return { score: 0, level: 'clean', levelLabel: '未就绪', issues: [], dimensions: {}, cleanableCount: 0 };
      return humanizerHelper.analyzeAiFlavor(humanizeDebouncedDoc.value);
    });

    const humanizeReport = computed(() => {
      if (!humanizerHelper) return { score: 0, level: 'clean', levelLabel: '未就绪', issues: [], dimensions: {}, cleanableCount: 0 };
      if (humanizeScope.value === 'selection' && editorSelection.value.text.trim().length >= 10) {
        return humanizerHelper.analyzeAiFlavor(editorSelection.value.text);
      }
      return docHumanizeReport.value;
    });

    const humanizeStyleInfo = computed(() => {
      return humanizerHelper?.REWRITE_STYLES?.[humanizeStyle.value] || humanizeStyleList[0] || { name: '白描干货', desc: '' };
    });

    const humanizeScoreColor = computed(() => {
      const lvl = humanizeReport.value?.level;
      if (lvl === 'heavy') return '#ef4444';
      if (lvl === 'moderate') return '#f97316';
      if (lvl === 'mild') return '#f59e0b';
      return '#10b981';
    });

    const humanizeDimensionPills = computed(() => {
      const dims = humanizeReport.value?.dimensions || {};
      return Object.entries(dims)
        .filter(([, d]) => d.count > 0)
        .map(([id, d]) => ({ id, name: d.shortName || d.name, count: d.count }));
    });

    const humanizeFilteredIssues = computed(() => {
      const list = humanizeReport.value?.issues || [];
      if (humanizeActiveCat.value === 'all') return list;
      return list.filter((it) => it.category === humanizeActiveCat.value);
    });

    const zhuquePlainLength = computed(() => {
      if (!humanizerHelper) return 0;
      return humanizerHelper.extractPlainTextForDetector(humanizeTargetText.value).replace(/\s+/g, '').length;
    });

    // 划词悬浮快捷条状态
    const selectionBar = ref({ visible: false, top: 8, left: 120 });

    // 多文档草稿箱（IndexedDB 持久化）
    const docsHelper = window.MoPaiDocs;
    const showDocsModal = ref(false);
    const docsList = ref([]);
    const docsSearch = ref('');
    const currentDocId = ref(injectParam ? '' : (localStorage.getItem('md-converter-active-doc-id') || ''));
    let docsSaveTimer = null;
    const currentDocTitle = computed(() => docsHelper ? docsHelper.deriveTitle(markdownText.value) : 'Markdown 编辑');
    const filteredDocsList = computed(() => docsHelper ? docsHelper.filterAndSortDocs(docsList.value, docsSearch.value) : docsList.value);

    // 图床管理状态
    const showImageManager = ref(false);
    const imageHistory = ref(lsReadJSON('md-converter-image-history', []));

    // Phase 2 状态
    const focusMode = ref(false);
    const showFindReplace = ref(false);
    const findText = ref('');
    const replaceText = ref('');
    const findCount = ref(0);
    const findIndex = ref(0);
    const wordGoal = ref(parseInt(localStorage.getItem('md-converter-word-goal') || '0'));
    const showLineNumbers = ref(localStorage.getItem('md-converter-linenumbers') !== 'false');

    // Phase 3 状态
    const showTemplates = ref(false);
    const templates = templateLibrary || [];
    const customCss = ref(localStorage.getItem('md-converter-custom-css') || '');
    const showExportMenu = ref(false);
    const mobileTab = ref('editor');

    // 只允许同源路径，防止被构造 URL 注入外部内容
    function resolveInjectUrl(raw) {
      try {
        const url = new URL(raw, location.href);
        return url.origin === location.origin ? url : null;
      } catch { return null; }
    }

    // ─── 撤回/重做 ────────────────────
    const UNDO_MAX = 50;
    const undoStack = [];
    const redoStack = [];
    let isUndoRedo = false; // 防止 watch 触发时又压栈
    function pushUndo(text) {
      if (undoStack.length >= UNDO_MAX) undoStack.shift();
      undoStack.push(text);
      redoStack.length = 0; // 新编辑清空 redo
    }
    function undo() {
      if (undoStack.length === 0) return;
      isUndoRedo = true;
      redoStack.push(markdownText.value);
      markdownText.value = undoStack.pop();
      nextTick(() => { isUndoRedo = false; });
    }
    function redo() {
      if (redoStack.length === 0) return;
      isUndoRedo = true;
      undoStack.push(markdownText.value);
      markdownText.value = redoStack.pop();
      nextTick(() => { isUndoRedo = false; });
    }

    // ─── 渲染防抖 ────────────────────
    let renderTimer = null;
    const RENDER_DEBOUNCE = 300; // ms

    // ─── 图片热缓存（内存 Map 用于同步渲染展开，持久化由 IndexedDB 承载）──────────
    const IMAGE_STORE_KEY = 'md-converter-image-store';
    const imageStore = (() => {
      try {
        const saved = localStorage.getItem(IMAGE_STORE_KEY);
        return saved ? new Map(JSON.parse(saved)) : new Map();
      } catch { return new Map(); }
    })();
    function collectUsedImageIds() {
      const used = new Set();
      const collect = (text) => {
        if (!text) return;
        for (const m of String(text).matchAll(/img:([a-z0-9_]+)/g)) used.add(m[1]);
      };
      collect(markdownText.value);
      try { collect(localStorage.getItem('md-converter-draft')); } catch {}
      lsReadJSON('md-converter-history', []).forEach(item => collect(item.content));
      return used;
    }
    function pruneImageStore() {
      if (imageStore.size === 0) return;
      const used = collectUsedImageIds();
      for (const id of Array.from(imageStore.keys())) {
        if (!used.has(id)) imageStore.delete(id);
      }
      if (mediaHelper) {
        mediaHelper.pruneUnusedLocalImages(used).then(() => refreshLocalImages()).catch(() => {});
      }
    }
    async function refreshLocalImages() {
      if (!mediaHelper) return;
      const rows = await mediaHelper.listLocalImages();
      localImages.value = rows;
      rows.forEach((r) => {
        if (r?.id && r?.dataUrl) imageStore.set(r.id, r.dataUrl);
      });
    }
    function genImageId() {
      return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
    function expandImagePlaceholders(text) {
      return String(text || '').replace(/img:([a-z0-9_]+)/g, (match, id) => {
        return imageStore.has(id) ? imageStore.get(id) : match;
      });
    }

    // ─── Markdown-it 初始化 ──────────────
    const md = window.markdownit({
      html: true,
      breaks: true,
      linkify: true,
      typographer: true,
      highlight: function (str, lang) {
        const langLabel = md.utils.escapeHtml(lang || 'code');
        let highlighted = '';
        if (lang && hljs.getLanguage(lang)) {
          try {
            highlighted = hljs.highlight(str, { language: lang }).value;
          } catch (_) {
            highlighted = md.utils.escapeHtml(str);
          }
        } else {
          highlighted = md.utils.escapeHtml(str);
        }
        if (macCodeBlock.value) {
          return `<div class="mac-code-block">
            <div class="mac-code-header">
              <span class="mac-dot red"></span>
              <span class="mac-dot yellow"></span>
              <span class="mac-dot green"></span>
              <span class="mac-code-lang">${langLabel}</span>
            </div>
            <pre style="margin:0;"><code>${highlighted}</code></pre>
          </div>`;
        }
        return `<pre><code>${highlighted}</code></pre>`;
      }
    });

    // ─── 信息卡片插件（支持单段与多段落 :::info|warning|tip|danger ... :::）───
    function infoCardPlugin(md) {
      const colorMap = {
        info: { bg: '#eef6ff', border: '#3b82f6', icon: 'ℹ️', color: '#1e40af' },
        warning: { bg: '#fff8e6', border: '#f59e0b', icon: '⚠️', color: '#92400e' },
        tip: { bg: '#ecfdf5', border: '#10b981', icon: '💡', color: '#065f46' },
        danger: { bg: '#fef2f2', border: '#ef4444', icon: '🚫', color: '#991b1b' },
      };

      md.block.ruler.before('fence', 'info_card', function (state, startLine, endLine, silent) {
        const startPos = state.bMarks[startLine] + state.tShift[startLine];
        const startMax = state.eMarks[startLine];
        const firstLine = state.src.slice(startPos, startMax).trim();
        const openMatch = firstLine.match(/^:::(info|warning|tip|danger)(?:\s+(.*))?$/);
        if (!openMatch) return false;

        let nextLine = startLine + 1;
        let closed = false;
        while (nextLine < endLine) {
          const pos = state.bMarks[nextLine] + state.tShift[nextLine];
          const max = state.eMarks[nextLine];
          if (state.src.slice(pos, max).trim() === ':::') {
            closed = true;
            break;
          }
          nextLine++;
        }
        if (!closed) return false;
        if (silent) return true;

        const type = openMatch[1];
        const rawTitle = (openMatch[2] || '').trim();
        const c = colorMap[type] || colorMap.info;
        const bodyLines = [];
        for (let line = startLine + 1; line < nextLine; line++) {
          const pos = state.bMarks[line];
          const max = state.eMarks[line];
          bodyLines.push(state.src.slice(pos, max));
        }
        const bodyHtml = md.render(bodyLines.join('\n').trim());
        const titleHtml = rawTitle ? md.renderInline(rawTitle) : `${c.icon} ${type.toUpperCase()}`;

        const cardToken = state.push('html_block', '', 0);
        cardToken.map = [startLine, nextLine + 1];
        cardToken.content = `<div data-info-card="true" style="border-left: 4px solid ${c.border}; background: ${c.bg}; padding: 14px 18px; margin: 14px 0; border-radius: 0 8px 8px 0;">
          <div style="font-weight: 600; color: ${c.color}; margin-bottom: 6px; font-size: 15px;">${titleHtml}</div>
          <div style="color: ${c.color}; opacity: 0.9; font-size: 14px; line-height: 1.7;">${bodyHtml}</div>
        </div>\n`;
        state.line = nextLine + 1;
        return true;
      });
    }
    md.use(infoCardPlugin);

    // ─── GFM 任务列表插件（- [x] / - [ ]，使用内联文本符号兼容公众号，避免 <input> 被微信过滤）───
    function taskListPlugin(md) {
      md.core.ruler.after('inline', 'mopai_task_lists', (state) => {
        const tokens = state.tokens;
        for (let i = 2; i < tokens.length; i++) {
          if (
            tokens[i].type === 'inline' &&
            tokens[i - 1].type === 'paragraph_open' &&
            tokens[i - 2].type === 'list_item_open'
          ) {
            const first = tokens[i].children?.[0];
            if (!first || first.type !== 'text') continue;
            const m = first.content.match(/^\[([ xX])\]\s+/);
            if (!m) continue;
            const checked = m[1].toLowerCase() === 'x';
            first.content = first.content.slice(m[0].length);
            const badge = new state.Token('html_inline', '', 0);
            badge.content = checked
              ? '<span data-task="done" style="display:inline-block;margin-right:6px;color:#10b981;font-weight:700;">☑</span>'
              : '<span data-task="todo" style="display:inline-block;margin-right:6px;color:#9ca3af;font-weight:700;">☐</span>';
            tokens[i].children.unshift(badge);
            tokens[i - 2].attrSet('data-task-item', checked ? 'done' : 'todo');
          }
        }
      });
    }
    md.use(taskListPlugin);

    // ─── Mermaid 代码块 → 占位符（避开高亮/代码块样式，渲染见 renderMermaidDiagrams）──
    const defaultFence = md.renderer.rules.fence.bind(md.renderer.rules);
    md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
      if (tokens[idx].info.trim().toLowerCase() === 'mermaid') {
        return `<div class="mermaid-placeholder">${md.utils.escapeHtml(tokens[idx].content)}</div>`;
      }
      return defaultFence(tokens, idx, options, env, slf);
    };

    // ─── 微信链接转脚注（直接操作传入的 DOM 节点，保留链接内部行内样式） ──────────────────
    function convertLinksToFootnotesEl(root, themeObj) {
      if (!wechatFootnote.value) return;

      const links = root.querySelectorAll('a[href]');
      const footnotes = [];
      let index = 1;

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

        const text = link.textContent.trim();
        // Create superscript reference
        const sup = document.createElement('sup');
        sup.textContent = `[${index}]`;
        sup.setAttribute('style', 'color: inherit; font-size: 80%; vertical-align: super; cursor: default;');

        // Replace link with span keeping inner formatting (bold/code/em) + superscript
        const span = document.createElement('span');
        span.innerHTML = link.innerHTML;
        span.setAttribute('style', link.getAttribute('style') || '');
        link.parentNode.replaceChild(span, link);
        span.appendChild(sup);

        footnotes.push({ index, text, href });
        index++;
      });

      // 正文末尾追加脚注列表（微信不支持正文外链，转为纯文本引用）
      if (footnotes.length) {
        const isDarkTheme = Boolean(themeObj && themeObj.isDark);
        const borderColor = isDarkTheme ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
        const titleColor = isDarkTheme ? '#e0e0e0' : '#666';
        const textColor = isDarkTheme ? '#a9b1d6' : '#999';
        const section = document.createElement('section');
        section.setAttribute('style', `margin-top: 28px; padding-top: 14px; border-top: 1px solid ${borderColor}; font-size: 13px; line-height: 1.8; color: ${textColor};`);
        const title = document.createElement('p');
        title.setAttribute('style', `margin: 0 0 8px; font-weight: 600; color: ${titleColor};`);
        title.textContent = '参考资料';
        section.appendChild(title);
        footnotes.forEach(({ index, text, href }) => {
          const p = document.createElement('p');
          p.setAttribute('style', 'margin: 0 0 4px; word-break: break-all;');
          p.textContent = text && text !== href ? `[${index}] ${text}: ${href}` : `[${index}] ${href}`;
          section.appendChild(p);
        });
        root.appendChild(section);
      }
    }

    // ─── 渲染 HTML ──────────────────────
    const renderedHtml = ref('');
    let mermaidInitialized = false;
    function doRender() {
      const theme = themes[currentTheme.value];
      if (!theme) { renderedHtml.value = ''; return; }
      const { body } = stripFrontmatter(markdownText.value);
      const raw = md.render(expandImagePlaceholders(body));
      // applyThemeStyles 内部已完成微信脚注转换，仅一趟 DOM 解析
      const styled = applyThemeStyles(raw, theme.styles, currentTheme.value);
      // DOMPurify 消毒：拦截 onerror/onload/<script>/javascript: 等注入向量（CDN 加载失败时降级为原样）
      renderedHtml.value = window.DOMPurify
        ? window.DOMPurify.sanitize(styled, { ADD_ATTR: ['style', 'target', 'data-task', 'data-task-item', 'data-info-card'] })
        : styled;
      // 预览 DOM 更新后再按需加载并渲染 Mermaid
      nextTick(renderMermaidDiagrams);
    }

    // ─── Mermaid 渲染（按需懒加载 + 作用于已挂载的预览 DOM）──────────
    async function renderMermaidDiagrams() {
      const preview = document.getElementById('preview-content');
      if (!preview) return;
      const placeholders = preview.querySelectorAll('.mermaid-placeholder');
      if (!placeholders.length) return;
      try {
        const mermaidLib = await loadLazyLib('mermaid');
        if (!mermaidInitialized) {
          mermaidLib.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
          mermaidInitialized = true;
        }
        for (const el of placeholders) {
          const code = el.textContent.trim();
          if (!code) continue;
          try {
            const id = 'mermaid-' + Math.random().toString(36).slice(2, 9);
            const { svg } = await mermaidLib.render(id, code);
            el.innerHTML = svg;
            el.classList.remove('mermaid-placeholder');
            el.classList.add('mermaid-diagram');
          } catch (_) {}
        }
      } catch (err) {
        console.warn('Mermaid 加载失败:', err);
      }
    }

    // 初始渲染
    doRender();

    // ─── 标题解析（跳过围栏代码块与头部 YAML Frontmatter，保留原文档真实行号）───
    function extractMarkdownHeadings(text) {
      const headings = [];
      const lines = (text || '').split('\n');
      let startIdx = 0;
      if (lines[0]?.trim() === '---') {
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === '---') { startIdx = i + 1; break; }
        }
      }
      let fence = null;
      for (let idx = startIdx; idx < lines.length; idx++) {
        const line = lines[idx];
        const trimmed = line.trim();
        const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
        if (fenceMatch) {
          const marker = fenceMatch[1];
          if (!fence) fence = { ch: marker[0], len: marker.length };
          else if (marker[0] === fence.ch && marker.length >= fence.len && trimmed === marker) fence = null;
          continue;
        }
        if (fence) continue;
        const match = line.match(/^(#{1,3})\s+(.+)/);
        if (match) {
          headings.push({
            level: match[1].length,
            text: match[2].replace(/[*`~]/g, '').trim(),
            line: idx,
          });
        }
      }
      return headings;
    }

    // ─── TOC 大纲 ──────────────────────
    const tocList = computed(() => extractMarkdownHeadings(markdownText.value));

    function scrollToHeading(lineNum, headingIdx = -1) {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) showToc.value = false;

      if (isMobile && mobileTab.value === 'preview') {
        nextTick(() => {
          const previewEl = document.getElementById('preview-content');
          const headings = previewEl ? previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6') : [];
          const target = headingIdx >= 0 ? headings[headingIdx] : null;
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }

      nextTick(() => {
        const textarea = document.querySelector('.editor-textarea');
        if (!textarea) return;
        const lines = markdownText.value.split('\n');
        let charPos = 0;
        for (let i = 0; i < lineNum && i < lines.length; i++) {
          charPos += lines[i].length + 1;
        }
        textarea.focus();
        textarea.setSelectionRange(charPos, charPos);
        // 读取实际计算行高，避免与 CSS 偏差
        const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 24.5;
        textarea.scrollTop = Math.max(0, lineNum * lineHeight - textarea.clientHeight / 3);
      });
    }

    // ─── 应用主题样式 ────────────────────
    function applyThemeStyles(html, styles, themeKey = currentTheme.value) {
      const themeObj = themes[themeKey] || {};
      const primary = customColor.value || themeObj.accent || '#4f6ef7';
      const primaryBg = primary + '14';
      const fontMap = {
        sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", sans-serif',
        serif: '"Georgia", "Noto Serif SC", "Source Han Serif SC", serif',
        mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, "PingFang SC", monospace',
      };

      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;

      const styleMap = {
        'h1': styles.h1, 'h2': styles.h2, 'h3': styles.h3,
        'h4': styles.h3, 'h5': styles.h3, 'h6': styles.h3,
        'p': styles.p, 'blockquote': styles.blockquote,
        'ul': styles.ul, 'ol': styles.ol, 'li': styles.li,
        'img': styles.img, 'a': styles.a,
        'table': styles.table, 'th': styles.th, 'td': styles.td,
        'hr': styles.hr, 'strong': styles.strong, 'em': styles.em,
      };

      for (const [tag, style] of Object.entries(styleMap)) {
        if (!style) continue;
        const resolved = style
          .replace(/\{\{PRIMARY\}\}/g, primary)
          .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg);
        wrapper.querySelectorAll(tag).forEach(el => {
          // 信息卡片内的段落保留卡片自有语义色，避免被主题正文样式覆盖
          if (tag === 'p' && el.closest('[data-info-card]')) {
            el.setAttribute('style', 'margin: 6px 0; line-height: 1.7;');
            return;
          }
          let extra = '';
          if (tag === 'li' && el.hasAttribute('data-task-item')) {
            extra = 'list-style-type: none; margin-left: -18px;';
          }
          el.setAttribute('style', (el.getAttribute('style') || '') + resolved + extra);
        });
      }

      wrapper.querySelectorAll('code').forEach(el => {
        if (el.parentElement && (el.parentElement.tagName === 'PRE' || el.closest('.mac-code-block'))) {
          el.setAttribute('style', 'font-family: inherit; font-size: inherit; color: inherit; background: transparent;');
        } else {
          const resolved = (styles.code_inline || '')
            .replace(/\{\{PRIMARY\}\}/g, primary)
            .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg);
          el.setAttribute('style', resolved);
        }
      });

      wrapper.querySelectorAll('pre').forEach(el => {
        if (!el.closest('.mac-code-block')) {
          const resolved = (styles.code_block || '')
            .replace(/\{\{PRIMARY\}\}/g, primary)
            .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg);
          el.setAttribute('style', resolved);
        }
      });

      wrapper.querySelectorAll('.mac-code-block').forEach(el => {
        const codeBlockStyle = styles.code_block || 'background: #282c34; color: #abb2bf;';
        const bgMatch = codeBlockStyle.match(/background:\s*([^;]+)/);
        const bgColor = bgMatch ? bgMatch[1].trim() : '#282c34';
        const colorMatch = codeBlockStyle.match(/(?:^|;\s*)color:\s*([^;]+)/);
        const textColor = colorMatch ? colorMatch[1].trim() : '#abb2bf';
        el.setAttribute('style', `border-radius: 10px; overflow: hidden; margin: 14px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`);
        const header = el.querySelector('.mac-code-header');
        if (header) header.setAttribute('style', `background: ${bgColor}; padding: 10px 16px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);`);
        el.querySelectorAll('.mac-dot').forEach((dot, idx) => {
          const colors = ['#ff5f57', '#febc2e', '#28c840'];
          dot.setAttribute('style', `width: 12px; height: 12px; border-radius: 50%; background: ${colors[idx]}; display: inline-block;`);
        });
        const langLabel = el.querySelector('.mac-code-lang');
        if (langLabel) langLabel.setAttribute('style', `margin-left: auto; font-size: 12px; color: ${textColor}; opacity: 0.5; font-family: -apple-system, sans-serif;`);
        const pre = el.querySelector('pre');
        if (pre) pre.setAttribute('style', `background: ${bgColor}; color: ${textColor}; padding: 16px; margin: 0; font-size: 13px; line-height: 1.7; overflow-x: auto; font-family: "SFMono-Regular", Consolas, monospace;`);
      });

      // 脚注转换（作用于同一个 wrapper，避免再次解析序列化）
      convertLinksToFootnotesEl(wrapper, themeObj);

      let wrapperStyle = styles.wrapper || '';
      if (fontFamily.value && fontMap[fontFamily.value]) {
        wrapperStyle = wrapperStyle.replace(/font-family:[^;]+;/, `font-family: ${fontMap[fontFamily.value]};`);
      }
      if (fontSize.value) {
        wrapperStyle = wrapperStyle.replace(/font-size:\s*\d+px;/, `font-size: ${fontSize.value}px;`);
      }

      // 确保 wrapperStyle 中的双引号不会破坏 HTML 属性
      wrapperStyle = wrapperStyle.replace(/"/g, "'");

      return `<div style="${wrapperStyle}">${wrapper.innerHTML}</div>`;
    }

    // ─── 计算属性 ──────────────────────
    const currentThemeObj = computed(() => themes[currentTheme.value] || themes.default);
    const currentThemeIsDark = computed(() => Boolean(currentThemeObj.value?.isDark));
    const currentThemeBg = computed(() => currentThemeObj.value?.bg || '#ffffff');
    const currentCodeTheme = computed(() => {
      const codeStyle = currentThemeObj.value?.styles?.code_block || '';
      const bgMatch = codeStyle.match(/background:\s*(#[0-9a-fA-F]{3,6})/i);
      return bgMatch && isLightHexColor(bgMatch[1]) ? 'light' : 'dark';
    });

    const charCount = computed(() => markdownText.value.length);
    const wordCount = computed(() => {
      const text = stripFrontmatter(markdownText.value).body.trim();
      if (!text) return 0;
      const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const english = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/\b[a-zA-Z]+\b/g) || []).length;
      return chinese + english;
    });
    const readingTime = computed(() => {
      const w = wordCount.value;
      if (w === 0) return '0 分';
      return Math.ceil(w / 300) + ' 分钟';
    });
    const themeList = computed(() => {
      return Object.entries(themes).map(([key, val]) => ({
        key, name: val.name, emoji: val.emoji, icon: val.icon, accent: val.accent || '#4f6ef7', desc: val.desc, category: val.category,
      }));
    });

    // ─── 主题切换 ──────────────────────
    function selectTheme(key) {
      currentTheme.value = key;
      lsSet('md-converter-theme', key);
    }

    // ─── 主题悬浮预览（fixed 定位 + 缓存 + 消毒） ──────────────────
    const themePreviewCache = new Map();
    function onThemeHover(key, event) {
      clearTimeout(themePreviewTimer.value);
      const rect = event?.currentTarget?.getBoundingClientRect?.();
      themePreviewTimer.value = setTimeout(() => {
        if (rect) {
          const tooltipWidth = 260;
          const margin = 12;
          const centeredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
          const clampedLeft = Math.max(margin, Math.min(window.innerWidth - tooltipWidth - margin, centeredLeft));
          themeTooltipPos.value = { top: Math.round(rect.bottom + 8), left: Math.round(clampedLeft) };
        }
        hoveredTheme.value = key;
      }, 300);
    }
    function onThemeLeave() {
      clearTimeout(themePreviewTimer.value);
      hoveredTheme.value = null;
    }
    const themeTooltipStyle = computed(() => {
      const t = hoveredTheme.value ? themes[hoveredTheme.value] : null;
      return {
        top: themeTooltipPos.value.top + 'px',
        left: themeTooltipPos.value.left + 'px',
        '--preview-tooltip-bg': t?.bg || '#ffffff',
        colorScheme: t?.isDark ? 'dark' : 'light',
      };
    });
    const themePreviewHtml = computed(() => {
      const key = hoveredTheme.value;
      if (!key || key === currentTheme.value) return '';
      const theme = themes[key];
      if (!theme) return '';
      const cacheKey = `${key}|${customColor.value}|${fontFamily.value}|${fontSize.value}`;
      if (themePreviewCache.has(cacheKey)) return themePreviewCache.get(cacheKey);
      const sampleMd = `## 标题示例\n\n这是一段正文，**加粗**和*斜体*。\n\n> 引用块内容\n\n- 列表项 1\n- 列表项 2`;
      const raw = md.render(sampleMd);
      const styled = applyThemeStyles(raw, theme.styles, key);
      const safe = window.DOMPurify
        ? window.DOMPurify.sanitize(styled, { ADD_ATTR: ['style'] })
        : styled;
      themePreviewCache.set(cacheKey, safe);
      return safe;
    });

    // ─── 暗色模式 ──────────────────────
    function toggleDarkMode() {
      darkMode.value = !darkMode.value;
      document.documentElement.setAttribute('data-theme', darkMode.value ? 'dark' : 'light');
      lsSet('md-converter-dark', darkMode.value ? 'true' : 'false');
    }

    function toggleSettings() {
      showSettings.value = !showSettings.value;
      if (showSettings.value) {
        showAiPanel.value = false; // 同为右侧面板，互斥不重叠
        if (window.innerWidth <= 768) showToc.value = false;
      }
    }
    function toggleToc() {
      showToc.value = !showToc.value;
      if (showToc.value && window.innerWidth <= 768) {
        showSettings.value = false;
        showAiPanel.value = false;
      }
    }

    function setCustomColor(color) {
      customColor.value = color;
      document.documentElement.style.setProperty('--primary', color);
      lsSet('md-converter-color', color);
      doRender();
    }
    function resetCustomColor() {
      customColor.value = '';
      localStorage.removeItem('md-converter-color');
      document.documentElement.style.setProperty('--primary', '#4f6ef7');
      doRender();
    }
    function setFontFamily(ff) { fontFamily.value = ff; lsSet('md-converter-font', ff); doRender(); }
    function setFontSize(size) { fontSize.value = size; lsSet('md-converter-fontsize', String(size)); doRender(); }

    // ─── 手机预览模式 ──────────────────
    function toggleMobilePreview() {
      mobilePreview.value = !mobilePreview.value;
    }

    // ─── 微信脚注开关 ──────────────────
    function toggleFootnote() {
      wechatFootnote.value = !wechatFootnote.value;
      lsSet('md-converter-footnote', wechatFootnote.value ? 'true' : 'false');
    }

    // ─── 复制功能 ──────────────────────
    async function preparePublishHtml(simple = false) {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return '';

      if (window.MoPaiPublishUtils?.prepareHtml) {
        return window.MoPaiPublishUtils.prepareHtml(previewEl, {
          imageToBase64,
          simple,
          mermaidBg: currentThemeBg.value,
        });
      }

      return previewEl.innerHTML;
    }

    async function copyPublishHtmlToClipboard(simple = true) {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return '';

      const html = await preparePublishHtml(simple);
      const blob = new Blob([html], { type: 'text/html' });
      const plainBlob = new Blob([previewEl.innerText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })
      ]);
      return html;
    }

    async function copyToClipboard(target) {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;

      try {
        await copyPublishHtmlToClipboard(false);
        showToast(target);
      } catch (err) {
        // 回退方案：直接选中并复制
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(previewEl);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy');
        selection.removeAllRanges();
        showToast(target);
      }
    }

    // 将图片URL转为 base64 data URL（用于微信兼容）
    function imageToBase64(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          try {
            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl);
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = reject;
        img.src = src;
      });
    }

    let toastTimer = null;
    function showToast(target) {
      clearTimeout(toastTimer);
      copyTarget.value = target;
      copySuccess.value = true;
      toastTimer = setTimeout(() => { copySuccess.value = false; copyTarget.value = ''; }, 2000);
    }

    // ─── 文件操作 ──────────────────────
    function handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
        alert('请选择 .md 或 .markdown 文件');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => { markdownText.value = e.target.result; };
      reader.readAsText(file);
      event.target.value = '';
    }

    function clearEditor() {
      if (markdownText.value.trim() === '') return;
      if (confirm('确定要清空编辑器内容吗？')) { markdownText.value = ''; }
    }

    // ─── 图片粘贴/拖拽 ──────────────────
    function handlePaste(event) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const file = item.getAsFile();
          insertImageFromFile(file);
          return;
        }
      }
    }

    function handleDrop(event) {
      event.preventDefault();
      isDragging.value = false;
      const files = event.dataTransfer?.files;
      if (!files) return;
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          insertImageFromFile(file);
          return;
        }
        if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
          const reader = new FileReader();
          reader.onload = (e) => { markdownText.value = e.target.result; };
          reader.readAsText(file);
          return;
        }
      }
    }

    async function insertImageFromFile(file, insertIntoEditor = true) {
      const textarea = document.querySelector('.editor-textarea');
      const pos = textarea ? textarea.selectionStart : markdownText.value.length;
      const name = file.name || '图片';
      let fallbackFromHost = false;
      let prepared = null;

      // 通过多图床聚合路由器上传（GitHub / SM.MS / 自定义接口 / IndexedDB 本地）
      if (mediaHelper) {
        const provider = mediaConfig.value.provider;
        if (provider !== 'local') {
          uploadingImage.value = true;
          copyTarget.value = 'uploading';
          copySuccess.value = true;
          try {
            const res = await mediaHelper.uploadImage(file, mediaConfig.value);
            uploadingImage.value = false;
            if (res.mode === 'remote' && res.url) {
              addImageHistory(name, res.url, mediaHelper.PROVIDERS[res.provider]?.name || res.provider);
              if (insertIntoEditor) {
                const imgMarkdown = `\n![${name}](${res.url})\n`;
                markdownText.value = markdownText.value.slice(0, pos) + imgMarkdown + markdownText.value.slice(pos);
              }
              showToast('image');
              return;
            }
            prepared = res.prepared;
          } catch (err) {
            console.warn('云图床上传失败，自动降级存入 IndexedDB 本地图库:', err);
            uploadingImage.value = false;
            fallbackFromHost = true;
            prepared = await mediaHelper.compressImageFile(file, mediaConfig.value);
          }
        } else {
          prepared = await mediaHelper.compressImageFile(file, mediaConfig.value);
        }

        // 写入 IndexedDB 大图库（无 5MB localStorage 限制）
        const imgId = genImageId();
        await mediaHelper.putLocalImage({
          id: imgId,
          name,
          mime: prepared.mime,
          dataUrl: prepared.dataUrl,
          size: prepared.size,
          createdAt: Date.now(),
        });
        imageStore.set(imgId, prepared.dataUrl);
        await refreshLocalImages();
        if (insertIntoEditor) {
          const imgMarkdown = `\n![${name}](img:${imgId})\n`;
          markdownText.value = markdownText.value.slice(0, pos) + imgMarkdown + markdownText.value.slice(pos);
        }
        showToast(fallbackFromHost ? 'image-local-fallback' : 'image');
        return;
      }

      // 极端降级（未加载 media-store.js）
      const reader = new FileReader();
      reader.onload = (e) => {
        const imgId = genImageId();
        imageStore.set(imgId, e.target.result);
        if (insertIntoEditor) {
          const imgMarkdown = `\n![${name}](img:${imgId})\n`;
          markdownText.value = markdownText.value.slice(0, pos) + imgMarkdown + markdownText.value.slice(pos);
        }
        showToast('image');
      };
      reader.readAsDataURL(file);
    }

    function saveMediaConfig() {
      lsSet('md-converter-media-config', JSON.stringify(mediaConfig.value));
    }
    function updateMediaConfig(patch) {
      mediaConfig.value = mediaHelper
        ? mediaHelper.mergeConfig({ ...mediaConfig.value, ...patch })
        : { ...mediaConfig.value, ...patch };
      saveMediaConfig();
    }
    function updateMediaNested(group, key, value) {
      const nextGroup = { ...(mediaConfig.value[group] || {}), [key]: value };
      mediaConfig.value = { ...mediaConfig.value, [group]: nextGroup };
      if (group === 'smms' && key === 'token') smmsToken.value = String(value || '').trim();
      saveMediaConfig();
    }
    function openMediaManager(tab = 'local') {
      mediaTab.value = tab;
      showImageManager.value = true;
      refreshLocalImages();
    }
    async function handleMediaFileSelect(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      await insertImageFromFile(file, false);
    }
    function insertLocalImage(item) {
      const textarea = document.querySelector('.editor-textarea');
      const pos = textarea ? textarea.selectionStart : markdownText.value.length;
      const mdSnippet = `\n![${item.name}](img:${item.id})\n`;
      markdownText.value = markdownText.value.slice(0, pos) + mdSnippet + markdownText.value.slice(pos);
      showImageManager.value = false;
      showToast('image');
    }
    async function copyLocalImageMd(item) {
      await navigator.clipboard.writeText(`![${item.name}](img:${item.id})`);
      showToast('copy');
    }
    async function deleteLocalImageItem(id) {
      imageStore.delete(id);
      if (mediaHelper) await mediaHelper.deleteLocalImage(id);
      await refreshLocalImages();
      doRender();
    }
    async function cleanupUnusedLocalImages() {
      if (!mediaHelper) return;
      const used = collectUsedImageIds();
      const { removed } = await mediaHelper.pruneUnusedLocalImages(used);
      for (const id of Array.from(imageStore.keys())) {
        if (!used.has(id)) imageStore.delete(id);
      }
      await refreshLocalImages();
      showToast(removed > 0 ? 'media-pruned' : 'save');
    }
    function formatMediaSize(bytes) {
      return mediaHelper ? mediaHelper.formatBytes(bytes) : `${bytes || 0} B`;
    }

    function handleDragOver(event) {
      event.preventDefault();
      isDragging.value = true;
    }

    function handleDragLeave(event) {
      if (event.currentTarget === event.target) {
        isDragging.value = false;
      }
    }

    // ─── 导出文件名自动命名（优先读取 frontmatter.title） ────────────
    function getExportFilename(ext) {
      const rawTitle = getPublishTitle();
      const title = rawTitle.replace(/[*`~#\/\\:?"<>|]/g, '').trim();
      return (title && title !== 'MoPai 文章' ? title : 'mopai-export') + '.' + ext;
    }

    function escapeHtmlText(str) {
      return String(str || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    // 防 </style> 闭合逃逸
    function safeInlineCss(css) {
      return String(css || '').replace(/<\/style/gi, '<\\/style');
    }

    // ─── 导出 Markdown (.md) ──────────────────
    function exportMarkdown() {
      const content = expandImagePlaceholders(markdownText.value);
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getExportFilename('md');
      a.click();
      URL.revokeObjectURL(url);
      showToast('export-md');
    }

    // ─── 导出 HTML ──────────────────────
    async function exportHtml() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;
      const bodyHtml = await preparePublishHtml(false);
      const themeBg = themes[currentTheme.value]?.bg || '#ffffff';
      const title = escapeHtmlText(getPublishTitle());
      const extraCss = customCss.value ? `\n  <style>${safeInlineCss(customCss.value)}</style>` : '';
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>body { margin: 0; background: ${themeBg}; } .preview-body { max-width: 680px; margin: 0 auto; padding: 20px; }</style>${extraCss}
</head>
<body>
<article class="preview-body">
${bodyHtml}
</article>
</body>
</html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getExportFilename('html');
      a.click();
      URL.revokeObjectURL(url);
      showToast('export-html');
    }

    // ─── 导出 PDF ────────────────────
    async function exportPdf() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;
      const printWin = window.open('', '_blank');
      if (!printWin) {
        alert('浏览器拦截了打印窗口，请允许本页弹出窗口后重试');
        return;
      }
      const bodyHtml = await preparePublishHtml(false);
      const themeBg = themes[currentTheme.value]?.bg || '#ffffff';
      const title = escapeHtmlText(getPublishTitle());
      const extraCss = customCss.value ? `<style>${safeInlineCss(customCss.value)}</style>` : '';
      printWin.document.write(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>${title}</title>
<style>
  body { margin: 0; background: ${themeBg}; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .preview-body { max-width: 680px; margin: 0 auto; padding: 40px 30px; }
  img { max-width: 100%; height: auto; }
  @media print { body { margin: 0; } .preview-body { padding: 16px; } }
</style>${extraCss}
</head><body><article class="preview-body">${bodyHtml}</article></body></html>`);
      printWin.document.close();
      showToast('export-pdf');
      setTimeout(() => { printWin.focus(); printWin.print(); }, 400);
    }

    // ─── 导出长图（按需加载 html2canvas） ────────────────────
    async function exportImage() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;
      showToast('exporting-image');
      let h2c;
      try {
        h2c = await loadLazyLib('html2canvas');
      } catch (e) {
        alert('导出失败: ' + e.message);
        return;
      }
      // 保存原始样式，临时展开全部内容
      const parent = previewEl.parentElement;
      const origOverflow = parent ? parent.style.overflow : '';
      const origHeight = parent ? parent.style.height : '';
      if (parent) {
        parent.style.overflow = 'visible';
        parent.style.height = 'auto';
      }
      try {
        const bgColor = themes[currentTheme.value]?.bg || '#ffffff';
        const canvas = await h2c(previewEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: bgColor,
          logging: false,
          scrollY: 0,
          height: previewEl.scrollHeight,
          windowHeight: previewEl.scrollHeight,
        });
        const link = document.createElement('a');
        link.download = getExportFilename('png');
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('export-image');
      } catch (e) {
        alert('导出失败: ' + e.message);
      } finally {
        // 恢复原始样式
        if (parent) {
          parent.style.overflow = origOverflow;
          parent.style.height = origHeight;
        }
      }
    }

    // ─── 导出 Word（按需加载 html-docx-js） ────────────────────
    async function exportDocx() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;
      showToast('loading-lib');
      let docxLib;
      try {
        docxLib = await loadLazyLib('htmlDocx');
      } catch (e) {
        alert('Word 导出引擎加载失败: ' + e.message);
        return;
      }
      const bodyHtml = await preparePublishHtml(true);
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, sans-serif; line-height: 1.8; color: #333;">
${bodyHtml}
</body></html>`;
      const blob = docxLib.asBlob(html);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = getExportFilename('docx');
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('export-docx');
    }

    // ─── 3:4 小红书自动分页知识卡片工坊 ────────────────────
    function saveXhsConfig() {
      lsSet('md-converter-xhs-config', JSON.stringify(xhsConfig.value));
    }

    function regenerateXhsCards() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl || !xhsHelper) return;
      const { frontmatter } = stripFrontmatter(markdownText.value);
      const rawCards = xhsHelper.generateDeckFromPreview({
        sourceEl: previewEl,
        title: getPublishTitle(),
        subtitle: frontmatter.summary || frontmatter.desc || '',
        author: xhsConfig.value.author || frontmatter.author || '',
        readingTime: readingTime.value,
        tag: xhsConfig.value.tag || frontmatter.tag || '干货笔记',
        styleKey: xhsConfig.value.styleKey,
        accent: activeColor.value,
        ratio: xhsConfig.value.ratio,
        includeCover: xhsConfig.value.includeCover,
        splitByHr: xhsConfig.value.splitByHr,
        showPageNumber: xhsConfig.value.showPageNumber,
      });
      xhsCards.value = rawCards.map((c) => ({
        ...c,
        html: window.DOMPurify
          ? window.DOMPurify.sanitize(c.html, { ADD_ATTR: ['style', 'data-task', 'data-task-item'] })
          : c.html,
      }));
    }

    function setXhsOption(key, value) {
      xhsConfig.value = { ...xhsConfig.value, [key]: value };
      saveXhsConfig();
      regenerateXhsCards();
    }

    function openXhsStudio() {
      xhsStatus.value = '';
      regenerateXhsCards();
      const dlg = xhsDialogRef.value;
      if (dlg && !dlg.open) {
        dlg.showModal();
      }
    }

    function closeXhsStudio() {
      const dlg = xhsDialogRef.value;
      if (dlg && dlg.open) dlg.close();
    }

    function onXhsDialogClose() {
      xhsStatus.value = '';
    }

    async function renderXhsCardToDataUrl(card, h2c) {
      const stage = document.createElement('div');
      stage.style.cssText = `position:fixed;left:-9999px;top:0;width:${card.width}px;height:${card.height}px;overflow:hidden;`;
      stage.innerHTML = card.html;
      document.body.appendChild(stage);
      try {
        const target = stage.firstElementChild || stage;
        const canvas = await h2c(target, {
          scale: card.exportScale || 3,
          useCORS: true,
          backgroundColor: null,
          logging: false,
          width: card.width,
          height: card.height,
        });
        return canvas.toDataURL('image/png');
      } finally {
        stage.remove();
      }
    }

    async function exportSingleXhsCard(card) {
      if (xhsExporting.value) return;
      xhsExporting.value = true;
      xhsStatus.value = `正在渲染第 ${card.index} 张高清卡片...`;
      try {
        const h2c = await loadLazyLib('html2canvas');
        const dataUrl = await renderXhsCardToDataUrl(card, h2c);
        const baseName = getExportFilename('png').replace(/\.png$/, '');
        const link = document.createElement('a');
        link.download = `${baseName}-card-${String(card.index).padStart(2, '0')}.png`;
        link.href = dataUrl;
        link.click();
        xhsStatus.value = `已导出第 ${card.index} 张超清卡片 PNG`;
        showToast('export-xhs-one');
      } catch (e) {
        xhsStatus.value = '';
        alert('卡片导出失败: ' + e.message);
      } finally {
        xhsExporting.value = false;
      }
    }

    async function exportAllXhsCardsZip() {
      if (xhsExporting.value || !xhsCards.value.length || !xhsHelper) return;
      xhsExporting.value = true;
      xhsStatus.value = '正在加载渲染引擎...';
      try {
        const h2c = await loadLazyLib('html2canvas');
        const baseName = getExportFilename('zip').replace(/\.zip$/, '');
        const entries = [];
        const total = xhsCards.value.length;
        for (const card of xhsCards.value) {
          xhsStatus.value = `正在渲染第 ${card.index} / ${total} 张超清卡片...`;
          const dataUrl = await renderXhsCardToDataUrl(card, h2c);
          const suffix = card.kind === 'cover' ? 'cover' : 'page';
          entries.push({
            name: `${String(card.index).padStart(2, '0')}-${suffix}.png`,
            bytes: xhsHelper.dataUrlToUint8Array(dataUrl),
          });
        }
        const zipBlob = xhsHelper.buildZipBlob(entries);
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${baseName}-小红书卡片.zip`;
        link.click();
        URL.revokeObjectURL(url);
        xhsStatus.value = `已打包导出全部 ${total} 张超清知识卡片 ZIP`;
        showToast('export-xhs-zip');
      } catch (e) {
        xhsStatus.value = '';
        alert('打包导出失败: ' + e.message);
      } finally {
        xhsExporting.value = false;
      }
    }

    // ─── 数据备份（导出/导入全部本地数据，默认剔除 API Key/Token 防泄露）──────
    function exportBackup() {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('md-converter-')) continue;
        if (!backupIncludeSecrets.value) {
          if (k === 'md-converter-deepseek-key' || k === 'md-converter-smms-token') continue;
          if (k === 'md-converter-ai-config') {
            const cfg = lsReadJSON(k, null);
            if (cfg && typeof cfg === 'object') {
              data[k] = JSON.stringify({ ...cfg, keys: {} });
              continue;
            }
          }
          if (k === 'md-converter-media-config' && mediaHelper) {
            const mCfg = lsReadJSON(k, null);
            if (mCfg && typeof mCfg === 'object') {
              data[k] = JSON.stringify(mediaHelper.stripConfigSecrets(mCfg));
              continue;
            }
          }
        }
        data[k] = localStorage.getItem(k);
      }
      const payload = {
        __mopai_backup: true,
        version: 3,
        includesSecrets: Boolean(backupIncludeSecrets.value),
        exportedAt: new Date().toISOString(),
        data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      link.download = `mopai-backup-${stamp}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('export-backup');
    }

    function importBackup(event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        let payload;
        try { payload = JSON.parse(e.target.result); }
        catch { alert('文件解析失败，请选择有效的 MoPai 备份文件'); return; }
        if (!payload || payload.__mopai_backup !== true || typeof payload.data !== 'object' || !payload.data) {
          alert('这不是有效的 MoPai 备份文件'); return;
        }
        if (!confirm('导入将覆盖当前的草稿、历史、设置等全部数据，确认继续？')) return;
        try {
          Object.entries(payload.data).forEach(([k, v]) => {
            if (typeof k === 'string' && k.startsWith('md-converter-') && typeof v === 'string') {
              localStorage.setItem(k, v);
            }
          });
        } catch (err) { alert('写入失败：' + ((err && err.message) || err)); return; }
        location.reload();
      };
      reader.readAsText(file);
    }

    // ─── 分发到多平台（WechatSync）─────
    function getPublishTitle() {
      const { body, frontmatter } = stripFrontmatter(markdownText.value);
      if (frontmatter.title) return frontmatter.title.replace(/[*`~#]/g, '').trim();
      const h1 = extractMarkdownHeadings(body).find(h => h.level === 1);
      return h1 ? h1.text.replace(/[*`~#]/g, '').trim() : 'MoPai 文章';
    }

    async function buildPublishPost() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return null;

      const { frontmatter } = stripFrontmatter(markdownText.value);
      const firstImg = previewEl.querySelector('img');
      const thumb = frontmatter.cover || frontmatter.thumb || (firstImg ? firstImg.src : '');
      const title = getPublishTitle();
      return {
        title: title,
        content: await preparePublishHtml(true),
        desc: frontmatter.summary || frontmatter.desc || title,
        thumb: thumb,
      };
    }

    function hasWechatSyncBridge() {
      return Boolean(
        window.$syncer &&
        typeof window.$syncer.getAccounts === 'function' &&
        typeof window.$syncer.addTask === 'function'
      );
    }

    function waitForWechatSyncBridge(timeoutMs = 1200) {
      if (hasWechatSyncBridge()) return Promise.resolve(true);

      return new Promise(resolve => {
        const started = Date.now();
        const timer = setInterval(() => {
          if (hasWechatSyncBridge()) {
            clearInterval(timer);
            resolve(true);
            return;
          }

          if (Date.now() - started >= timeoutMs) {
            clearInterval(timer);
            resolve(false);
          }
        }, 100);
      });
    }

    async function handleWechatSyncUnavailable() {
      try {
        await copyPublishHtmlToClipboard(true);
        showToast('wechat');
      } catch (err) {
        console.warn('同步助手不可用时复制失败:', err);
      }

      const message = '未检测到文章同步助手扩展注入。已先复制富文本；请确认用安装了扩展的 Google Chrome 打开本页，并在扩展详情里允许访问 localhost，然后刷新页面。';
      if (showPublish.value) {
        publishStatus.value = message;
      } else {
        alert(message);
      }
      return false;
    }

    async function syncToMultiPlatform() {
      const bridgeReady = await waitForWechatSyncBridge();
      if (!bridgeReady || typeof window.syncPost !== 'function') {
        return handleWechatSyncUnavailable();
      }

      const post = await buildPublishPost();
      if (!post) return false;
      window.syncPost(post);
      return true;
    }

    function getWechatSyncAccounts() {
      return new Promise(resolve => {
        if (!hasWechatSyncBridge()) {
          resolve([]);
          return;
        }

        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve([]);
          }
        }, 8000);

        window.$syncer.getAccounts((resp, maybeAccounts) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const accounts = Array.isArray(maybeAccounts) ? maybeAccounts : resp;
          resolve(Array.isArray(accounts) ? accounts : []);
        });
      });
    }

    function updateWechatDirectSyncStatus(status, targetAccounts) {
      const accounts = Array.isArray(status?.accounts) ? status.accounts : [];
      const targetTypes = new Set(targetAccounts.map(account => account.type));
      const targetStatuses = accounts.filter(account => targetTypes.has(account.type));
      if (!targetStatuses.length) return;

      const failed = targetStatuses.find(account => account.status === 'failed');
      if (failed) {
        publishStatus.value = `微信公众号同步失败：${failed.error || failed.msg || '请稍后重试'}`;
        return;
      }

      const done = targetStatuses.find(account => account.status === 'done');
      if (done) {
        const draftLink = done.editResp?.draftLink;
        publishStatus.value = draftLink ? '微信公众号草稿已创建，正在打开草稿...' : '微信公众号草稿已创建，请在同步助手里查看草稿';
        if (draftLink) window.open(draftLink, '_blank');
        return;
      }

      const uploading = targetStatuses.find(account => account.status === 'uploading') || targetStatuses[0];
      publishStatus.value = `正在同步微信公众号：${uploading.msg || '准备创建草稿...'}`;
    }

    async function publishToWechat() {
      publishStatus.value = '正在检测文章同步助手扩展...';
      const bridgeReady = await waitForWechatSyncBridge();
      if (!bridgeReady) {
        return handleWechatSyncUnavailable();
      }

      const accounts = await getWechatSyncAccounts();
      const wechatAccounts = accounts.filter(account => account.type === 'weixin');
      if (!wechatAccounts.length) {
        publishStatus.value = '已检测到扩展，但没有可用的微信公众号账号。请先在 Chrome 登录 mp.weixin.qq.com，或在同步助手里确认公众号授权后刷新本页。';
        return false;
      }

      const post = await buildPublishPost();
      if (!post) return false;

      publishStatus.value = `正在提交到 ${wechatAccounts.length} 个微信公众号账号...`;
      try {
        window.$syncer.addTask(
          { post, accounts: wechatAccounts },
          status => updateWechatDirectSyncStatus(status, wechatAccounts),
          () => {}
        );
        return true;
      } catch (err) {
        publishStatus.value = `微信公众号同步失败：${err.message || '扩展调用异常'}`;
        return false;
      }
    }

    // ─── 格式化工具栏 ──────────────────
    function insertFormat(type) {
      const textarea = document.querySelector('.editor-textarea');
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = markdownText.value;
      const selected = text.slice(start, end);

      const formatMap = {
        bold: { before: '**', after: '**', placeholder: '加粗文字' },
        italic: { before: '*', after: '*', placeholder: '斜体文字' },
        strike: { before: '~~', after: '~~', placeholder: '删除线文字' },
        code: { before: '`', after: '`', placeholder: '代码' },
        h1: { before: '# ', after: '', placeholder: '一级标题', newline: true },
        h2: { before: '## ', after: '', placeholder: '二级标题', newline: true },
        h3: { before: '### ', after: '', placeholder: '三级标题', newline: true },
        quote: { before: '> ', after: '', placeholder: '引用文字', newline: true },
        link: { before: '[', after: '](https://)', placeholder: '链接文字' },
        image: { before: '![', after: '](https://)', placeholder: '图片描述' },
        ul: { before: '- ', after: '', placeholder: '列表项', newline: true },
        ol: { before: '1. ', after: '', placeholder: '列表项', newline: true },
        table: { before: '', after: '', placeholder: '', newline: true, template: '\n| 列1 | 列2 | 列3 |\n|------|------|------|\n| 内容 | 内容 | 内容 |\n' },
        codeblock: { before: '', after: '', placeholder: '', newline: true, template: '\n```javascript\n// 代码\n```\n' },
        hr: { before: '', after: '', placeholder: '', newline: true, template: '\n---\n' },
        info: { before: '', after: '', placeholder: '', newline: true, template: '\n:::info ℹ️ 信息\n这里是信息卡片内容\n:::\n' },
        mermaid: { before: '', after: '', placeholder: '', newline: true, template: '\n```mermaid\ngraph TD\n    A[开始] --> B{判断}\n    B -->|是| C[结果1]\n    B -->|否| D[结果2]\n```\n' },
      };

      const fmt = formatMap[type];
      if (!fmt) return;

      let newText, cursorPos;
      if (fmt.template) {
        newText = text.slice(0, start) + fmt.template + text.slice(end);
        cursorPos = start + fmt.template.length;
      } else {
        const content = selected || fmt.placeholder;
        const prefix = fmt.newline && start > 0 && text[start - 1] !== '\n' ? '\n' : '';
        newText = text.slice(0, start) + prefix + fmt.before + content + fmt.after + text.slice(end);
        cursorPos = start + prefix.length + fmt.before.length + content.length;
      }

      markdownText.value = newText;
      nextTick(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    }

    // ─── Tab 缩进支持 ──────────────────
    function handleTab(event) {
      if (event.key === 'Tab') {
        event.preventDefault();
        const textarea = event.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = markdownText.value;

        if (event.shiftKey) {
          // Shift+Tab: 减少缩进
          const beforeCursor = text.slice(0, start);
          const lastNewline = beforeCursor.lastIndexOf('\n');
          const lineStart = lastNewline + 1;
          const lineContent = text.slice(lineStart, end);
          if (lineContent.startsWith('  ')) {
            markdownText.value = text.slice(0, lineStart) + lineContent.slice(2) + text.slice(end);
            nextTick(() => {
              textarea.selectionStart = Math.max(start - 2, lineStart);
              textarea.selectionEnd = Math.max(end - 2, lineStart);
            });
          }
        } else {
          // Tab: 增加缩进
          markdownText.value = text.slice(0, start) + '  ' + text.slice(end);
          nextTick(() => {
            textarea.selectionStart = textarea.selectionEnd = start + 2;
          });
        }
      }
    }

    // ─── 快捷键 ──────────────────────
    function handleKeyboard(event) {
      const isMeta = event.metaKey || event.ctrlKey;

      // ESC 按优先级关闭浮层、弹窗、查找栏与专注模式
      if (event.key === 'Escape') {
        if (selectionBar.value.visible) { selectionBar.value.visible = false; return; }
        if (hoveredTheme.value) { onThemeLeave(); return; }
        if (showExportMenu.value) { showExportMenu.value = false; return; }
        if (showImageGuide.value) { showImageGuide.value = false; return; }
        if (showDocsModal.value) { showDocsModal.value = false; return; }
        if (showPublish.value) { showPublish.value = false; return; }
        if (showHistory.value) { showHistory.value = false; return; }
        if (showImageManager.value) { showImageManager.value = false; return; }
        if (showTemplates.value) { showTemplates.value = false; return; }
        if (showFindReplace.value) { showFindReplace.value = false; return; }
        if (showSettings.value) { showSettings.value = false; return; }
        if (showAiPanel.value) { showAiPanel.value = false; return; }
        if (showToc.value) { showToc.value = false; return; }
        if (focusMode.value) { focusMode.value = false; return; }
        return;
      }

      if (!isMeta) return;

      const key = event.key.toLowerCase();
      const active = document.activeElement;
      const isEditor = Boolean(active && active.classList?.contains('editor-textarea'));
      const isOtherEditable = Boolean(
        active && !isEditor &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      );

      const keyMap = {
        'b': () => insertFormat('bold'),
        'i': () => insertFormat('italic'),
        'k': () => insertFormat('link'),
      };

      if (event.shiftKey) {
        if (key === 'c' && !isOtherEditable) {
          event.preventDefault();
          copyToClipboard('wechat');
          return;
        }
        // ⌘⇧Z 重做（仅在非其他输入框时接管，避免破坏 AI 聊天/查找框原生重做）
        if (key === 'z' && !isOtherEditable) {
          event.preventDefault();
          redo();
          return;
        }
      }

      // ⌘Z 撤回
      if (key === 'z' && !event.shiftKey && !isOtherEditable) {
        event.preventDefault();
        undo();
        return;
      }

      // ⌘\ 专注模式
      if (event.key === '\\') {
        event.preventDefault();
        focusMode.value = !focusMode.value;
        return;
      }

      // ⌘F 查找
      if (key === 'f') {
        event.preventDefault();
        showFindReplace.value = true;
        nextTick(() => {
          const input = document.querySelector('.find-input');
          if (input) input.focus();
        });
        return;
      }

      if (key === 's') {
        event.preventDefault();
        saveToHistory();
        return;
      }

      if (keyMap[key] && !isOtherEditable) {
        event.preventDefault();
        keyMap[key]();
      }
    }

    // ─── 历史记录 ──────────────────────
    function saveToHistory() {
      if (!markdownText.value.trim()) return;
      const item = {
        id: Date.now(),
        content: markdownText.value,
        theme: currentTheme.value,
        time: new Date().toLocaleString('zh-CN'),
        preview: markdownText.value.slice(0, 100) + (markdownText.value.length > 100 ? '...' : ''),
      };
      let history = lsReadJSON('md-converter-history', []);
      history.unshift(item);
      if (history.length > 20) history = history.slice(0, 20);
      lsSet('md-converter-history', JSON.stringify(history));
      historyList.value = history;
      showToast('save');
    }

    function loadHistory(item) {
      markdownText.value = item.content;
      if (item.theme && themes[item.theme]) currentTheme.value = item.theme;
      showHistory.value = false;
    }
    function deleteHistory(id) {
      let history = lsReadJSON('md-converter-history', []);
      history = history.filter(item => item.id !== id);
      lsSet('md-converter-history', JSON.stringify(history));
      historyList.value = history;
      pruneImageStore();
    }
    function toggleHistory() {
      showHistory.value = !showHistory.value;
      if (showHistory.value) {
        historyList.value = lsReadJSON('md-converter-history', []);
      }
    }

    // ─── 同步滚动（平滑版：标题锚点 + 缓动动画） ───
    let scrollTimer = null;
    let scrollAnimId = null;

    function syncScroll(event) {
      const editor = event.target;
      if (selectionBar.value.visible) selectionBar.value.visible = false;
      const preview = document.getElementById('preview-content');
      if (!preview) return;

      // 同步行号滚动
      const lineNums = document.querySelector('.line-numbers');
      if (lineNums) lineNums.scrollTop = editor.scrollTop;

      // 使用 rAF 节流替代 setTimeout，帧级同步更流畅
      if (scrollTimer) return;
      scrollTimer = requestAnimationFrame(() => {
        scrollTimer = null;
        const targetTop = calcTargetScroll(editor, preview);
        smoothScrollTo(preview, targetTop);
      });
    }

    // 计算目标滚动位置
    function calcTargetScroll(editor, preview) {
      const editorScrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
      const editorLines = markdownText.value.split('\n');
      const totalEditorLines = editorLines.length;
      const computedStyle = window.getComputedStyle(editor);
      const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
      const paddingTop = parseFloat(computedStyle.paddingTop) || 16;
      const currentLine = Math.floor((editor.scrollTop - paddingTop + lineHeight / 2) / lineHeight);

      // 收集编辑器标题（跳过代码块）
      const editorHeadings = extractMarkdownHeadings(markdownText.value);

      // 收集预览标题
      const previewHeadings = preview.querySelectorAll('h1, h2, h3');
      const previewAnchors = [];
      previewHeadings.forEach(h => {
        previewAnchors.push({ top: h.offsetTop, text: h.textContent.trim() });
      });

      // 标题锚点分段映射
      if (editorHeadings.length >= 2 && previewAnchors.length >= 2) {
        let prevHeading = null;
        let nextHeading = null;
        for (let i = 0; i < editorHeadings.length; i++) {
          if (editorHeadings[i].line <= currentLine) {
            prevHeading = { ...editorHeadings[i], previewIdx: i };
          }
          if (editorHeadings[i].line > currentLine && !nextHeading) {
            nextHeading = { ...editorHeadings[i], previewIdx: i };
          }
        }

        if (prevHeading && prevHeading.previewIdx < previewAnchors.length) {
          const prevPreviewTop = previewAnchors[prevHeading.previewIdx]?.top || 0;
          if (nextHeading && nextHeading.previewIdx < previewAnchors.length) {
            const nextPreviewTop = previewAnchors[nextHeading.previewIdx].top;
            const progress = (currentLine - prevHeading.line) / (nextHeading.line - prevHeading.line || 1);
            return Math.max(0, prevPreviewTop + (nextPreviewTop - prevPreviewTop) * progress - 20);
          } else {
            const ratio = (currentLine - prevHeading.line) / (totalEditorLines - prevHeading.line || 1);
            return Math.max(0, prevPreviewTop + (preview.scrollHeight - prevPreviewTop) * ratio - 20);
          }
        }
      }

      // 回退：比例同步
      return editorScrollRatio * (preview.scrollHeight - preview.clientHeight);
    }

    // 平滑缓动滚动（easeOutCubic）
    function smoothScrollTo(el, targetTop) {
      cancelAnimationFrame(scrollAnimId);
      const startTop = el.scrollTop;
      const distance = targetTop - startTop;

      // 如果距离很小就直接跳
      if (Math.abs(distance) < 2) {
        el.scrollTop = targetTop;
        return;
      }

      const duration = Math.min(180, Math.abs(distance) * 0.5 + 40); // 更短响应更快
      const startTime = performance.now();

      function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutQuart: 更平滑的减速曲线
        const eased = 1 - Math.pow(1 - progress, 4);
        el.scrollTop = startTop + distance * eased;

        if (progress < 1) {
          scrollAnimId = requestAnimationFrame(tick);
        }
      }
      scrollAnimId = requestAnimationFrame(tick);
    }

    function toggleImageGuide() {
      showImageGuide.value = !showImageGuide.value;
    }

    // ─── 智能发布助手 ──────────────────
    const showPublish = ref(false);
    const publishStatus = ref('');

    const platforms = [
      { key: 'wechat', name: '微信公众号', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M9.5 4C6.46 4 4 6.01 4 8.5c0 1.37.73 2.6 1.88 3.43l-.5 1.5 1.73-.96A7.08 7.08 0 009.5 13C12.54 13 15 11 15 8.5S12.54 4 9.5 4zm-2.13 2.63a.88.88 0 110 1.75.88.88 0 010-1.75zm4.26 0a.88.88 0 110 1.75.88.88 0 010-1.75zM15.5 9c-.01 0 .01 0 0 0 .17.58.25 1.17.25 1.75 0 2.93-2.78 5.25-6.25 5.25l-.43-.01C10.35 17.8 12.5 19 15 19c.65 0 1.28-.1 1.87-.28l1.44.8-.42-1.25C19.08 17.37 20 15.97 20 14.5 20 11.46 18.04 9 15.5 9z"/></svg>', color: '#07c160', url: '', format: 'html', desc: '用同步助手创建草稿' },
      { key: 'zhihu', name: '知乎', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 4.5 4.5 9"/><path d="M5.5 7.5h6"/><path d="M3.8 12h7.8"/><path d="M8 7.5c0 4.5-.8 7.8-4 11.2"/><path d="M8.2 13.8 11.2 17.2"/><rect x="13.5" y="7" width="6.5" height="10.5" rx="1"/></svg>', color: '#0066ff', url: 'https://zhuanlan.zhihu.com/write', format: 'markdown', desc: '复制 Markdown → 粘贴到专栏' },
      { key: 'weibo', name: '微博', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M10.3 18.3c-3.63.4-6.77-1.28-7.01-3.75-.24-2.47 2.52-4.82 6.15-5.22 3.63-.4 6.77 1.28 7.01 3.75.24 2.47-2.52 4.82-6.15 5.22zM20.76 8.94c-.26-.82-1.14-1.23-1.96-.97-.82.26-1.27 1.12-1.01 1.95.57 1.82-.06 3.16-1.38 3.94l-.16.09c2.57-1.47 3.7-3.7 3.1-5.54l-.02-.05c-.03-.1-.19-.56-.57-1.42a3.87 3.87 0 012.37-1.75c.84-.22 1.34-1.08 1.12-1.92a1.55 1.55 0 00-1.89-1.13 6.9 6.9 0 00-4.06 3.07A6.6 6.6 0 0014 3.8c-.47-.73-1.44-.94-2.17-.47-.73.47-.94 1.44-.47 2.17.47.73 1 1.88.79 3.18C8.64 7.25 3.47 9.22 3.47 13.28c0 4.13 5.25 6.4 10.04 6.4 6.3 0 10.49-3.67 10.49-6.58 0-1.78-1.07-2.8-1.79-3.35z"/><ellipse cx="10.07" cy="14.72" rx="2" ry="1.4"/></svg>', color: '#e6162d', url: 'https://weibo.com/', format: 'excerpt', desc: '复制摘要 → 粘贴发布' },
      { key: 'csdn', name: 'CSDN', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M18.2 7.8A7.5 7.5 0 1 0 18.2 16.2"/></svg>', color: '#fc5531', url: 'https://editor.csdn.net/md', format: 'markdown', desc: '复制 Markdown → 粘贴到编辑器' },
      { key: 'jianshu', name: '简书', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5c-1.8-1.5-4.5-2-7.5-1.5v13c3-.5 5.7 0 7.5 1.5m0-13c1.8-1.5 4.5-2 7.5-1.5v13c-3-.5-5.7 0-7.5 1.5m0-13v13"/></svg>', color: '#ea6f5a', url: 'https://www.jianshu.com/writer', format: 'markdown', desc: '复制 Markdown → 粘贴到编辑器' },
      { key: 'juejin', name: '掘金', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2l-3.5 3 3.5 3 3.5-3L12 2zm0 5.5L8.14 11 12 14.5 15.86 11 12 7.5zM4 12l8 8 8-8-2.5-2.14L12 15.5 6.5 9.86 4 12z"/></svg>', color: '#1e80ff', url: 'https://juejin.cn/editor/drafts/new', format: 'markdown', desc: '复制 Markdown → 粘贴到编辑器' },
      { key: 'toutiao', name: '今日头条', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 8h10"/><rect x="7" y="11.5" width="4.5" height="4.5" rx="0.8" fill="currentColor" stroke="none"/><path d="M13.5 12.5H17"/><path d="M13.5 15.5H17"/></svg>', color: '#ed1c24', url: 'https://mp.toutiao.com/profile_v4/graphic/publish', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'bilibili', name: 'B站专栏', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M7.5 3L5.3 5.2h-1C2.45 5.2 1 6.65 1 8.5v9c0 1.85 1.45 3.3 3.3 3.3h15.4c1.85 0 3.3-1.45 3.3-3.3v-9c0-1.85-1.45-3.3-3.3-3.3h-1L16.5 3H14l2.2 2.2H7.8L10 3H7.5zM8 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm8 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>', color: '#fb7299', url: 'https://member.bilibili.com/platform/upload/text/edit', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'baijiahao', name: '百家号', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><ellipse cx="6.2" cy="9.5" rx="1.9" ry="2.6" transform="rotate(-18 6.2 9.5)"/><ellipse cx="10" cy="6.6" rx="1.9" ry="2.7" transform="rotate(-6 10 6.6)"/><ellipse cx="14.2" cy="6.6" rx="1.9" ry="2.7" transform="rotate(6 14.2 6.6)"/><ellipse cx="17.8" cy="9.6" rx="1.9" ry="2.6" transform="rotate(18 17.8 9.6)"/><path d="M12 11.2c-3.1 0-5.8 2.2-5.8 5 0 1.8 1.4 3 3.2 3 1 0 1.8-.4 2.6-.4s1.6.4 2.6.4c1.8 0 3.2-1.2 3.2-3 0-2.8-2.7-5-5.8-5z"/></svg>', color: '#2932e1', url: 'https://baijiahao.baidu.com/builder/rc/edit', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'segmentfault', name: 'SF思否', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5z"/><path d="M4.5 7.3 12 11.5l7.5-4.2"/><path d="M12 11.5V21"/></svg>', color: '#009a61', url: 'https://segmentfault.com/write', format: 'markdown', desc: '复制 Markdown → 粘贴到编辑器' },
      { key: 'dayuhao', name: '大鱼号', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 12C9.5 8 13.5 6.5 20.5 12c-7 5.5-11 4-13 0z"/><path d="M7.5 12 3.5 8.5v7L7.5 12z"/><circle cx="16" cy="11.5" r="1.1" fill="currentColor" stroke="none"/></svg>', color: '#ff6a00', url: 'https://mp.uc.cn/', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'penguin', name: '企鹅号', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c-3.3 0-5.5 2.6-5.5 6.5 0 2.5-.8 5-1.5 7 1.8.8 3.2 1 4.5 1h5c1.3 0 2.7-.2 4.5-1-.7-2-1.5-4.5-1.5-7C17.5 5.6 15.3 3 12 3z"/><path d="M9.5 17.5v2.5M14.5 17.5v2.5"/><path d="M10.5 10.5l1.5 1.5 1.5-1.5"/><circle cx="9.8" cy="8.2" r="0.9" fill="currentColor" stroke="none"/><circle cx="14.2" cy="8.2" r="0.9" fill="currentColor" stroke="none"/></svg>', color: '#0078d7', url: 'https://om.qq.com/article/articlePublish', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'xiaohongshu', name: '小红书', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M8.5 3.5v17"/><path d="M14 9.5c.8-.9 2.2-.8 2.8.1.5.8.3 1.9-.4 2.6L14 14.5l-2.4-2.3c-.7-.7-.9-1.8-.4-2.6.6-.9 2-1 2.8-.1z" fill="currentColor" stroke="none"/></svg>', color: '#fe2c55', url: 'https://creator.xiaohongshu.com/publish/publish', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'douban', name: '豆瓣', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5.5h14"/><rect x="6.5" y="9" width="11" height="5.5" rx="1.2"/><path d="M8.5 14.5 7.5 18.5"/><path d="M15.5 14.5 16.5 18.5"/><path d="M4.5 19h15"/></svg>', color: '#00b51d', url: 'https://www.douban.com/note/create', format: 'html', desc: '复制富文本 → 粘贴到日记' },
    ];


    function togglePublish() {
      showPublish.value = !showPublish.value;
      publishStatus.value = '';
    }

    async function publishTo(platform) {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;

      if (platform.key === 'wechat') {
        await publishToWechat();
        return;
      }

      publishStatus.value = `正在复制 ${platform.name} 格式...`;

      try {
        if (platform.format === 'html') {
          // 富文本格式：复制 HTML
          await copyPublishHtmlToClipboard(true);
        } else if (platform.format === 'markdown') {
          // Markdown 格式：展开内部 img: 占位符后再复制
          const { body } = stripFrontmatter(markdownText.value);
          await navigator.clipboard.writeText(expandImagePlaceholders(body));
        } else if (platform.format === 'excerpt') {
          // 摘要格式：剥离 frontmatter 后取前 280 字 + 标题
          const { body: cleanBody } = stripFrontmatter(markdownText.value);
          const title = getPublishTitle();
          const body = cleanBody
            .replace(/^#.*$/gm, '')
            .replace(/[*_~`>#\-\[\]()!|]/g, '')
            .replace(/\n{2,}/g, '\n')
            .trim();
          const excerpt = body.slice(0, 280);
          const copyContent = title && title !== 'MoPai 文章' ? `【${title}】\n${excerpt}...` : `${excerpt}...`;
          await navigator.clipboard.writeText(copyContent);
        }

        publishStatus.value = `已复制到剪贴板，正在打开 ${platform.name}...`;

        // 打开平台编辑器
        setTimeout(() => {
          window.open(platform.url, '_blank');
          publishStatus.value = `${platform.name} 已打开，直接粘贴即可！`;
          setTimeout(() => { publishStatus.value = ''; }, 3000);
        }, 500);

      } catch (err) {
        // 回退
        if (platform.format === 'markdown') {
          const textarea = document.createElement('textarea');
          textarea.value = expandImagePlaceholders(stripFrontmatter(markdownText.value).body);
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        publishStatus.value = `请手动复制内容，正在打开 ${platform.name}...`;
        setTimeout(() => { window.open(platform.url, '_blank'); }, 500);
      }
    }

    // ─── AI 助手 ───────────────────────
    // 安全边界：模型只能输出结构化 JSON，经校验后调用下面白名单里已有的函数，永不 eval。
    // publishTo / syncToMultiPlatform / clearEditor / exportBackup 等不可逆或破坏性操作一律不进白名单。
    const AI_TOOLS = {
      set_theme: {
        desc: '切换排版主题',
        props: { theme: { type: 'string', enum: Object.keys(themes), description: '主题 key' } },
        required: ['theme'],
        run: ({ theme }) => { selectTheme(theme); return '主题 → ' + themes[theme].name; },
      },
      set_style: {
        desc: '调整主题色 / 字体 / 字号，至少给一个参数',
        props: {
          color: { type: 'string', description: '十六进制色值，如 #07c160' },
          font_family: { type: 'string', enum: ['sans', 'serif', 'mono'] },
          font_size: { type: 'number', enum: [14, 15, 16, 17, 18] },
        },
        run: (a) => {
          const done = [];
          if (a.color) {
            if (!/^#[0-9a-fA-F]{6}$/.test(a.color)) throw new Error('颜色须为 #RRGGBB 格式');
            setCustomColor(a.color); done.push('主题色 ' + a.color);
          }
          if (a.font_family) { setFontFamily(a.font_family); done.push('字体 ' + a.font_family); }
          if (a.font_size) { setFontSize(a.font_size); done.push('字号 ' + a.font_size); }
          if (!done.length) throw new Error('至少要给一个参数');
          return done.join('，');
        },
      },
      edit_text: {
        desc: '把正文里唯一出现的一段文字替换成新文字（局部改写用这个）',
        props: { old_text: { type: 'string', description: '正文里唯一出现的原文片段' }, new_text: { type: 'string' } },
        required: ['old_text', 'new_text'],
        run: ({ old_text, new_text }) => {
          const doc = markdownText.value;
          const at = doc.indexOf(old_text);
          if (at === -1) throw new Error('正文里找不到这段文字');
          if (doc.indexOf(old_text, at + 1) !== -1) throw new Error('这段文字出现多次，请给更长的唯一片段');
          applyAiText(doc.slice(0, at) + new_text + doc.slice(at + old_text.length));
          return '改写「' + old_text.slice(0, 12) + (old_text.length > 12 ? '…' : '') + '」';
        },
      },
      replace_text: {
        desc: '把正文里所有出现的某个字符串全部替换',
        props: { find: { type: 'string' }, replace: { type: 'string' } },
        required: ['find', 'replace'],
        run: ({ find, replace }) => {
          if (!find) throw new Error('find 不能为空');
          const doc = markdownText.value;
          const n = doc.split(find).length - 1;
          if (!n) throw new Error('找不到「' + find + '」');
          applyAiText(doc.split(find).join(replace));
          return '替换 ' + n + ' 处「' + find + '」→「' + replace + '」';
        },
      },
      replace_document: {
        desc: '用改写后的全文替换正文。整篇改动必须走这个，会先让用户确认',
        props: { content: { type: 'string', description: '改写后的完整 Markdown 正文' } },
        required: ['content'],
        run: ({ content }) => {
          if (!content || content.length < 10) throw new Error('content 太短');
          return { pending: { kind: 'pending', label: '整篇改写提案（' + markdownText.value.length + ' → ' + content.length + ' 字）', text: content } };
        },
      },
    };

    // AI 写入正文统一入口：先切断 undo 合并窗口，否则会和用户刚敲的字合并成同一步 ⌘Z
    function applyAiText(text) {
      clearTimeout(undoCoalesceTimer);
      undoCoalesceTimer = null;
      markdownText.value = text;
    }

    // 细粒度快照：样式工具撤销时只恢复样式，绝不覆盖用户之后手写的正文；文本工具撤销只恢复正文
    function aiSnapshot(scope = 'all') {
      if (scope === 'style') {
        return { scope: 'style', theme: currentTheme.value, color: customColor.value, font: fontFamily.value, size: fontSize.value };
      }
      if (scope === 'text') {
        return { scope: 'text', text: markdownText.value };
      }
      return { scope: 'all', theme: currentTheme.value, color: customColor.value, font: fontFamily.value, size: fontSize.value, text: markdownText.value };
    }
    function aiRestore(s) {
      if (!s) return;
      if (s.scope !== 'text') {
        if (s.theme !== undefined && s.theme !== currentTheme.value) selectTheme(s.theme);
        if (s.color !== undefined && s.color !== customColor.value) {
          if (s.color) setCustomColor(s.color);
          else resetCustomColor();
        }
        if (s.font !== undefined && s.font !== fontFamily.value) setFontFamily(s.font);
        if (s.size !== undefined && s.size !== fontSize.value) setFontSize(s.size);
      }
      if (s.scope !== 'style' && s.text !== undefined && s.text !== markdownText.value) {
        applyAiText(s.text);
      }
    }

    function dispatchAiTool(tc) {
      const tool = AI_TOOLS[tc.name];
      if (!tool) return { error: '未知工具：' + tc.name };
      let args;
      try { args = JSON.parse(tc.args || '{}'); } catch { return { error: 'arguments 不是合法 JSON' }; }
      if (!args || typeof args !== 'object' || Array.isArray(args)) return { error: 'arguments 必须为 JSON 对象' };
      for (const k of tool.required || []) if (args[k] === undefined) return { error: '缺少参数 ' + k };
      for (const [k, v] of Object.entries(args)) {
        const spec = tool.props[k];
        if (!spec) return { error: '未知参数 ' + k };
        if (spec.type === 'string' && typeof v !== 'string') return { error: k + ' 须为字符串' };
        if (spec.type === 'number' && (typeof v !== 'number' || Number.isNaN(v))) return { error: k + ' 须为数字' };
        if (spec.type === 'boolean' && typeof v !== 'boolean') return { error: k + ' 须为布尔值' };
        if (spec.enum && !spec.enum.includes(v)) return { error: k + ' 取值非法：' + v };
      }
      try {
        const out = tool.run(args);
        return (out && out.pending) ? out : { result: out };
      } catch (e) { return { error: e.message }; }
    }

    function aiSystemPrompt() {
      const doc = markdownText.value;
      const clipped = doc.length > 12000 ? doc.slice(0, 12000) + '\n…（正文过长，此处截断）' : doc;
      return [
        '你是 MoPai 墨排的排版助手。MoPai 把 Markdown 排版成公众号/知乎等平台的富文本。',
        '你可以调用工具直接操作编辑器：换主题、调配色字体字号、改写正文。',
        '用户要「起标题」「写摘要」「写小红书版」这类不改动正文的东西时，直接在回复里给文本，不要调工具。',
        '局部改写用 edit_text，整篇改写用 replace_document。不要臆造工具，不要重复调用同一个工具。',
        '',
        `当前状态：主题=${themes[currentTheme.value].name}(${currentTheme.value})，主题色=${activeColor.value}，字体=${fontFamily.value}，字号=${fontSize.value}，字数=${wordCount.value}`,
        '可选主题：' + Object.entries(themes).map(([k, v]) => `${k}(${v.name})`).join('、'),
        '',
        '当前正文：',
        clipped,
      ].join('\n');
    }

    function aiScroll() {
      nextTick(() => { const el = document.querySelector('.ai-msgs'); if (el) el.scrollTop = el.scrollHeight; });
    }

    function toggleAiPanel() {
      showAiPanel.value = !showAiPanel.value;
      if (showAiPanel.value) {
        showSettings.value = false; // 同为右侧面板，不叠
        if (window.innerWidth <= 768) showToc.value = false;
      }
    }

    // 中文/CJK 输入法（IME）安全 Enter 拦截：兼容 Safari keyCode 229 乱序事件
    function onFindEnter(e) {
      e.preventDefault();
      if (e.isComposing || e.keyCode === 229) return;
      findNext();
    }

    function onAiEnter(e) {
      if (e.shiftKey) return;
      e.preventDefault();
      if (e.isComposing || e.keyCode === 229) return;
      aiSend();
    }

    let aiAborter = null;
    function aiStop() { aiAborter?.abort(); }

    async function aiSend(preset) {
      const text = (preset || aiInput.value).trim();
      if (!text || aiBusy.value || !aiReady.value) return;
      aiInput.value = '';
      aiMessages.value.push({ role: 'user', text });

      // 对话只带最近几轮；正文不累积在历史里，每轮由 system prompt 重新注入最新版
      const history = aiMessages.value
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.text)
        .slice(-9).map(m => ({ role: m.role, content: m.text }));
      const messages = [{ role: 'system', content: aiSystemPrompt() }, ...history];

      // 必须拿数组里的响应式代理，直接改 push 进去的原始对象不会触发更新
      aiMessages.value.push({ role: 'assistant', text: '', ops: [] });
      const reply = aiMessages.value[aiMessages.value.length - 1];
      aiBusy.value = true;
      aiScroll();
      const ctrl = aiAborter = new AbortController();

      try {
        for (let round = 0; ; round++) {
          const { text: out, toolCalls } = await aiClient.chatStream({
            provider: aiConfig.value.provider,
            key: aiKey.value,
            model: aiModel.value,
            baseUrl: aiBaseUrl.value,
            messages,
            tools: Object.entries(AI_TOOLS).map(([name, t]) => ({
              type: 'function',
              function: { name, description: t.desc, parameters: { type: 'object', properties: t.props, required: t.required || [] } },
            })),
            onDelta: (full) => { reply.text = full; aiScroll(); },
            signal: ctrl.signal,
          });
          if (!toolCalls.length) { reply.text = out || reply.text; break; }

          messages.push({
            role: 'assistant',
            content: out || null,
            tool_calls: toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } })),
          });
          for (const tc of toolCalls) {
            const scope = (tc.name === 'set_theme' || tc.name === 'set_style') ? 'style' : 'text';
            const before = aiSnapshot(scope);
            const r = dispatchAiTool(tc);
            if (r.error) reply.ops.push({ kind: 'warn', label: tc.name + '：' + r.error });
            else if (r.pending) reply.ops.push({ kind: 'pending', label: r.pending.label, pending: r.pending });
            else reply.ops.push({ kind: 'tool', label: r.result, before });
            messages.push({ role: 'tool', tool_call_id: tc.id, content: r.error ? '失败：' + r.error : (r.result || r.pending.label) });
          }
          aiScroll();
          // 硬上限，防止模型来回调工具烧 token
          if (round >= 3) { reply.ops.push({ kind: 'warn', label: '已达工具调用上限，停止' }); break; }
        }
      } catch (e) {
        if (e.name !== 'AbortError') reply.text = (reply.text ? reply.text + '\n\n' : '') + '请求失败：' + e.message;
      }
      aiBusy.value = false;
      if (aiAborter === ctrl) aiAborter = null;
      aiScroll();
    }

    function applyAiOp(op) {
      const before = aiSnapshot('text');
      applyAiText(op.pending.text);
      op.before = before;
      op.kind = 'ok';
      op.label = '已应用整篇改写';
      op.pending = null;
    }
    function undoAiOp(op) {
      if (!op.before) return;
      aiRestore(op.before);
      op.kind = 'undo';
      op.label = '已撤销';
      op.before = null;
    }
    function clearAiMessages() {
      aiStop();
      aiMessages.value = [];
    }
    async function copyAiText(text) {
      try {
        await navigator.clipboard.writeText(text);
        showToast('copy');
      } catch {}
    }
    async function testAiConnection() {
      if (aiTesting.value || !aiReady.value) return;
      aiTesting.value = true;
      aiTestStatus.value = null;
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 15000);
      try {
        await aiClient.chatStream({
          provider: aiConfig.value.provider,
          key: aiKey.value,
          model: aiModel.value,
          baseUrl: aiBaseUrl.value,
          messages: [{ role: 'user', content: 'hi' }],
          onDelta: () => {},
          signal: ctrl.signal,
        });
        aiTestStatus.value = { ok: true, msg: '连接正常，模型响应成功' };
      } catch (err) {
        aiTestStatus.value = { ok: false, msg: err.name === 'AbortError' ? '连接超时（15s）' : err.message };
      } finally {
        clearTimeout(timeout);
        aiTesting.value = false;
      }
    }

    function saveAiConfig() { lsSet('md-converter-ai-config', JSON.stringify(aiConfig.value)); }
    function setAiProvider(id) { if (aiClient.PROVIDERS[id]) { aiConfig.value.provider = id; aiTestStatus.value = null; saveAiConfig(); } }
    function setAiKey(key) { aiConfig.value.keys[aiConfig.value.provider] = key.trim(); aiTestStatus.value = null; saveAiConfig(); }
    function setAiModel(model) { aiConfig.value.models[aiConfig.value.provider] = model.trim(); aiTestStatus.value = null; saveAiConfig(); }
    function setAiBaseUrl(url) { aiConfig.value.baseUrl = url.trim(); aiTestStatus.value = null; saveAiConfig(); }

    // ─── 去 AI 味体检与改写交互 + 划词悬浮快捷条 + 腾讯朱雀免 Key 快捷通道 ───
    function captureEditorSelection(evt) {
      const ta = document.querySelector('.editor-textarea');
      if (!ta) return;
      const start = ta.selectionStart || 0;
      const end = ta.selectionEnd || 0;
      const text = end > start ? markdownText.value.slice(start, end) : '';
      editorSelection.value = { start, end, text };
      if (humanizeScope.value === 'selection' && text.trim().length < 10) {
        humanizeScope.value = 'doc';
      }

      if (text.trim().length > 0 && evt) {
        const wrapper = ta.closest('.editor-textarea-wrapper');
        const rect = wrapper ? wrapper.getBoundingClientRect() : ta.getBoundingClientRect();
        const barW = 248;
        let top = 10;
        let left = Math.max(10, Math.round((rect.width - barW) / 2));
        if (window.innerWidth > 768 && evt && typeof evt.clientX === 'number' && evt.clientX > 0) {
          left = Math.max(10, Math.min(rect.width - barW - 10, Math.round(evt.clientX - rect.left - barW / 2)));
          top = Math.max(8, Math.min(rect.height - 46, Math.round(evt.clientY - rect.top - 48)));
        }
        selectionBar.value = { visible: true, top, left };
      } else {
        selectionBar.value.visible = false;
      }
    }

    function hideSelectionBar() {
      selectionBar.value.visible = false;
    }

    function applyFloatFormat(type) {
      insertFormat(type);
      selectionBar.value.visible = false;
    }

    function humanizeFromSelectionBar() {
      selectionBar.value.visible = false;
      openHumanizer();
    }

    function openHumanizer() {
      captureEditorSelection();
      selectionBar.value.visible = false;
      humanizeDebouncedDoc.value = markdownText.value;
      humanizeActiveCat.value = 'all';
      humanizeScope.value = editorSelection.value.text.trim().length >= 10 ? 'selection' : 'doc';
      aiPanelTab.value = 'humanize';
      showAiPanel.value = true;
      showSettings.value = false;
      if (window.innerWidth <= 768) showToc.value = false;
    }

    async function openZhuqueDetect() {
      if (!humanizerHelper) return;
      const isSelection = humanizeScope.value === 'selection' && editorSelection.value.text.trim().length >= 10;
      const src = isSelection ? editorSelection.value.text : markdownText.value;
      const plain = humanizerHelper.extractPlainTextForDetector(src);
      if (!plain) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(plain);
        } else {
          throw new Error('no-clipboard');
        }
      } catch {
        const ta = document.createElement('textarea');
        ta.value = plain;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
      showToast('zhuque-copied');
      window.open('https://matrix.tencent.com/ai-detect/', '_blank', 'noopener');
    }

    // ─── 多文档草稿箱（IndexedDB） ──────────────
    async function refreshDocsList() {
      if (!docsHelper) return;
      docsList.value = await docsHelper.listDocs();
    }

    async function persistActiveDocNow() {
      if (!docsHelper || injectParam) return;
      if (!currentDocId.value) {
        const rec = docsHelper.createDocRecord({ content: markdownText.value, theme: currentTheme.value });
        currentDocId.value = rec.id;
        lsSet('md-converter-active-doc-id', rec.id);
        await docsHelper.saveDoc(rec);
      } else {
        const existing = docsList.value.find((d) => d.id === currentDocId.value);
        await docsHelper.saveDoc({
          id: currentDocId.value,
          content: markdownText.value,
          theme: currentTheme.value,
          createdAt: existing?.createdAt || Date.now(),
          updatedAt: Date.now(),
        });
      }
      await refreshDocsList();
    }

    async function initDocsStore() {
      if (!docsHelper || injectParam) return;
      const existing = await docsHelper.listDocs();
      if (!existing.length) {
        const first = docsHelper.createDocRecord({ content: markdownText.value, theme: currentTheme.value });
        await docsHelper.saveDoc(first);
        currentDocId.value = first.id;
        lsSet('md-converter-active-doc-id', first.id);
        docsList.value = [first];
        return;
      }
      const match = existing.find((d) => d.id === currentDocId.value);
      if (match) {
        // 保持当前编辑器正文为主，同步最新草稿到 IndexedDB
        if (match.content !== markdownText.value) {
          await docsHelper.saveDoc({ ...match, content: markdownText.value, theme: currentTheme.value, updatedAt: Date.now() });
          docsList.value = await docsHelper.listDocs();
        } else {
          docsList.value = existing;
        }
      } else {
        // 将当前草稿作为活跃文稿写入，保留其余文稿
        const rec = docsHelper.createDocRecord({ content: markdownText.value, theme: currentTheme.value });
        await docsHelper.saveDoc(rec);
        currentDocId.value = rec.id;
        lsSet('md-converter-active-doc-id', rec.id);
        docsList.value = await docsHelper.listDocs();
      }
    }

    async function openDocsModal() {
      await persistActiveDocNow();
      showDocsModal.value = true;
    }

    async function createNewDoc() {
      if (!docsHelper) return;
      await persistActiveDocNow();
      const blank = docsHelper.createDocRecord({ content: '# 新文章\n\n', theme: currentTheme.value });
      await docsHelper.saveDoc(blank);
      currentDocId.value = blank.id;
      lsSet('md-converter-active-doc-id', blank.id);
      isUndoRedo = true;
      undoStack.length = 0;
      redoStack.length = 0;
      markdownText.value = blank.content;
      doRender();
      nextTick(() => { isUndoRedo = false; });
      await refreshDocsList();
      showDocsModal.value = false;
      showToast('doc-created');
    }

    async function switchDoc(doc) {
      if (!doc || doc.id === currentDocId.value) {
        showDocsModal.value = false;
        return;
      }
      await persistActiveDocNow();
      currentDocId.value = doc.id;
      lsSet('md-converter-active-doc-id', doc.id);
      isUndoRedo = true;
      undoStack.length = 0;
      redoStack.length = 0;
      markdownText.value = doc.content || '';
      if (doc.theme && themes[doc.theme]) currentTheme.value = doc.theme;
      doRender();
      nextTick(() => { isUndoRedo = false; });
      showDocsModal.value = false;
    }

    async function duplicateDoc(doc) {
      if (!docsHelper || !doc) return;
      const copy = docsHelper.createDocRecord({
        content: doc.content,
        theme: doc.theme || currentTheme.value,
      });
      await docsHelper.saveDoc(copy);
      await refreshDocsList();
    }

    async function deleteDocItem(doc) {
      if (!docsHelper || !doc) return;
      if ((doc.content || '').trim() && !confirm(`确定删除文稿「${doc.title}」？此操作不可撤销。`)) return;
      await docsHelper.deleteDoc(doc.id);
      const remaining = await docsHelper.listDocs();
      if (!remaining.length) {
        const blank = docsHelper.createDocRecord({ content: '', theme: currentTheme.value });
        await docsHelper.saveDoc(blank);
        currentDocId.value = blank.id;
        lsSet('md-converter-active-doc-id', blank.id);
        markdownText.value = '';
        docsList.value = [blank];
      } else {
        docsList.value = remaining;
        if (doc.id === currentDocId.value) {
          const next = remaining[0];
          currentDocId.value = next.id;
          lsSet('md-converter-active-doc-id', next.id);
          markdownText.value = next.content || '';
          if (next.theme && themes[next.theme]) currentTheme.value = next.theme;
          doRender();
        }
      }
    }

    function formatDocTime(ts) {
      return docsHelper ? docsHelper.formatRelativeTime(ts) : '';
    }

    function setHumanizeStyle(id) {
      if (!humanizerHelper?.REWRITE_STYLES?.[id]) return;
      humanizeStyle.value = id;
      lsSet('md-converter-humanize-style', id);
    }

    function setHumanizeIntensity(id) {
      if (!humanizerHelper?.REWRITE_INTENSITIES?.[id]) return;
      humanizeIntensity.value = id;
      lsSet('md-converter-humanize-intensity', id);
    }

    function openAiSettingsFromPanel() {
      showAiPanel.value = false;
      showSettings.value = true;
      if (window.innerWidth <= 768) showToc.value = false;
    }

    function jumpToHumanizeIssue(issue) {
      if (!issue) return;
      if (window.innerWidth <= 768) {
        mobileTab.value = 'editor';
        showAiPanel.value = false;
      }
      nextTick(() => {
        const ta = document.querySelector('.editor-textarea');
        if (!ta) return;
        const baseOffset = (humanizeScope.value === 'selection' && editorSelection.value.text.trim().length >= 10)
          ? editorSelection.value.start
          : 0;
        const start = Math.max(0, Math.min(markdownText.value.length, baseOffset + (issue.start || 0)));
        const end = Math.max(start, Math.min(markdownText.value.length, baseOffset + (issue.end || issue.start || 0)));
        ta.focus();
        ta.setSelectionRange(start, end);
        const lineHeight = parseFloat(window.getComputedStyle(ta).lineHeight) || 24.5;
        const absLine = markdownText.value.slice(0, start).split('\n').length - 1;
        ta.scrollTop = Math.max(0, absLine * lineHeight - ta.clientHeight / 3);
      });
    }

    function runQuickCleanLocal() {
      if (!humanizerHelper) return;
      const res = humanizerHelper.quickCleanLocal(markdownText.value);
      if (!res.removed) return;
      applyAiText(res.text);
      humanizeDebouncedDoc.value = res.text;
      showToast('humanize-clean');
    }

    function stopHumanizeRewrite() {
      humanizeAborter?.abort();
    }

    async function runHumanizeRewrite() {
      if (!humanizerHelper || humanizeBusy.value || !aiReady.value) return;
      const isSelection = humanizeScope.value === 'selection' && editorSelection.value.text.trim().length >= 10;
      const before = isSelection ? editorSelection.value.text : markdownText.value;
      if (!before.trim()) return;

      const selStart = isSelection ? editorSelection.value.start : 0;
      const selEnd = isSelection ? editorSelection.value.end : before.length;
      const beforeReport = humanizerHelper.analyzeAiFlavor(before);
      const messages = humanizerHelper.buildRewriteMessages(before, humanizeStyle.value, beforeReport, isSelection, humanizeIntensity.value);

      humanizeBusy.value = true;
      humanizeError.value = '';
      humanizeStreamText.value = '';
      humanizeProposal.value = null;
      const ctrl = humanizeAborter = new AbortController();

      try {
        const { text } = await aiClient.chatStream({
          provider: aiConfig.value.provider,
          key: aiKey.value,
          model: aiModel.value,
          baseUrl: aiBaseUrl.value,
          messages,
          onDelta: (full) => { humanizeStreamText.value = full; },
          signal: ctrl.signal,
        });
        const after = humanizerHelper.sanitizeRewriteOutput(text || humanizeStreamText.value, before);
        if (!after) throw new Error('模型未返回有效改写内容');
        const afterReport = humanizerHelper.analyzeAiFlavor(after);
        const diff = humanizerHelper.computeLineDiff(before, after);
        const fidelity = humanizerHelper.verifyFidelity(before, after);
        const intensityName = humanizerHelper.REWRITE_INTENSITIES?.[humanizeIntensity.value]?.name || '标准去味';
        humanizeProposal.value = {
          before,
          after,
          isSelection,
          selStart,
          selEnd,
          styleName: `${humanizeStyleInfo.value.name} · ${intensityName}`,
          beforeScore: beforeReport.score,
          afterScore: afterReport.score,
          afterLevelLabel: afterReport.levelLabel,
          diff,
          fidelity,
          applied: false,
          undoBefore: null,
        };
      } catch (err) {
        if (err.name !== 'AbortError') {
          humanizeError.value = err.message || '去 AI 味改写失败';
        }
      } finally {
        humanizeBusy.value = false;
        if (humanizeAborter === ctrl) humanizeAborter = null;
      }
    }

    function applyHumanizeProposal() {
      const p = humanizeProposal.value;
      if (!p || p.applied) return;
      p.undoBefore = markdownText.value;
      if (p.isSelection) {
        const cur = markdownText.value;
        // 优先按记录选区替换；若期间文本微调过则回退到精确子串查找
        if (cur.slice(p.selStart, p.selEnd) === p.before) {
          applyAiText(cur.slice(0, p.selStart) + p.after + cur.slice(p.selEnd));
        } else {
          const idx = cur.indexOf(p.before);
          if (idx !== -1) applyAiText(cur.slice(0, idx) + p.after + cur.slice(idx + p.before.length));
          else applyAiText(p.after);
        }
        editorSelection.value = { start: 0, end: 0, text: '' };
        humanizeScope.value = 'doc';
      } else {
        applyAiText(p.after);
      }
      humanizeDebouncedDoc.value = markdownText.value;
      p.applied = true;
      showToast('humanize-applied');
    }

    function undoHumanizeProposal() {
      const p = humanizeProposal.value;
      if (!p || !p.applied || p.undoBefore === null) return;
      applyAiText(p.undoBefore);
      humanizeDebouncedDoc.value = markdownText.value;
      p.applied = false;
      p.undoBefore = null;
    }

    function discardHumanizeProposal() {
      stopHumanizeRewrite();
      humanizeProposal.value = null;
      humanizeStreamText.value = '';
      humanizeError.value = '';
    }

    // ─── 图床管理 ──────────────────────
    function addImageHistory(name, url, provider = '') {
      const now = new Date();
      const time = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      imageHistory.value.unshift({ name, url, provider, time });
      // 最多保留 50 条
      if (imageHistory.value.length > 50) imageHistory.value = imageHistory.value.slice(0, 50);
      lsSet('md-converter-image-history', JSON.stringify(imageHistory.value));
    }

    function toggleImageManager() {
      showImageManager.value = !showImageManager.value;
      if (showImageManager.value) refreshLocalImages();
    }

    async function copyImageUrl(img) {
      await navigator.clipboard.writeText(img.url);
      showToast('copy');
    }

    async function copyImageMd(img) {
      await navigator.clipboard.writeText(`![${img.name}](${img.url})`);
      showToast('copy');
    }

    // ─── Phase 2 功能 ──────────────────

    // 查找替换（统一大小写不敏感，支持定位跳转，使用函数替换防止 $&/$1 误解析）
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function collectFindMatches() {
      if (!findText.value) return [];
      const re = new RegExp(escapeRegExp(findText.value), 'gi');
      const list = [];
      let m;
      while ((m = re.exec(markdownText.value)) !== null) {
        list.push({ start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) re.lastIndex++;
      }
      return list;
    }

    function selectMatchAt(idx) {
      const matches = collectFindMatches();
      findCount.value = matches.length;
      if (!matches.length) { findIndex.value = 0; return; }
      const safeIdx = ((idx % matches.length) + matches.length) % matches.length;
      findIndex.value = safeIdx;
      const target = matches[safeIdx];
      const textarea = document.querySelector('.editor-textarea');
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(target.start, target.end);
      const beforeLines = markdownText.value.slice(0, target.start).split('\n').length - 1;
      const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 24.5;
      textarea.scrollTop = Math.max(0, beforeLines * lineHeight - textarea.clientHeight / 3);
    }

    function findInEditor() {
      const matches = collectFindMatches();
      findCount.value = matches.length;
      if (findIndex.value >= matches.length) findIndex.value = 0;
    }

    function findNext() {
      if (!findText.value) return;
      const matches = collectFindMatches();
      if (!matches.length) { findCount.value = 0; return; }
      selectMatchAt((findIndex.value + 1) % matches.length);
    }

    function findPrev() {
      if (!findText.value) return;
      const matches = collectFindMatches();
      if (!matches.length) { findCount.value = 0; return; }
      selectMatchAt(findIndex.value - 1);
    }

    function replaceOne() {
      if (!findText.value) return;
      const matches = collectFindMatches();
      if (!matches.length) { findCount.value = 0; return; }
      const target = matches[Math.min(findIndex.value, matches.length - 1)];
      markdownText.value =
        markdownText.value.slice(0, target.start) +
        replaceText.value +
        markdownText.value.slice(target.end);
      findInEditor();
    }

    function replaceAll() {
      if (!findText.value) return;
      markdownText.value = markdownText.value.replace(
        new RegExp(escapeRegExp(findText.value), 'gi'),
        () => replaceText.value
      );
      findCount.value = 0;
      findIndex.value = 0;
    }

    // 字数目标
    function setWordGoal(val) {
      wordGoal.value = parseInt(val) || 0;
      lsSet('md-converter-word-goal', String(wordGoal.value));
    }

    const wordGoalProgress = computed(() => {
      if (!wordGoal.value || wordGoal.value <= 0) return 0;
      return Math.min(100, Math.round((wordCount.value / wordGoal.value) * 100));
    });

    // 行号
    function toggleLineNumbers() {
      showLineNumbers.value = !showLineNumbers.value;
      lsSet('md-converter-linenumbers', showLineNumbers.value ? 'true' : 'false');
    }

    const lineNumbers = computed(() => {
      const lines = markdownText.value.split('\n').length;
      return Array.from({ length: lines }, (_, i) => i + 1);
    });

    // ─── Phase 3 功能 ──────────────────

    // 模板
    function applyTemplate(tpl) {
      if (markdownText.value.trim() && markdownText.value !== sampleMarkdown) {
        if (!confirm('当前编辑器有内容，使用模板将覆盖。确认继续？')) return;
      }
      markdownText.value = tpl.content;
      showTemplates.value = false;
    }

    // 自定义 CSS
    function setCustomCss(val) {
      customCss.value = val;
      lsSet('md-converter-custom-css', val);
      applyCustomCss(val);
    }

    function applyCustomCss(css) {
      let styleEl = document.getElementById('custom-user-css');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-user-css';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = css;
    }

    function handleOutsideClick(e) {
      if (showExportMenu.value && !e.target.closest('.export-dropdown-wrapper')) {
        showExportMenu.value = false;
      }
      if (showImageGuide.value && !e.target.closest('.format-btn-wrapper')) {
        showImageGuide.value = false;
      }
    }

    // ─── 初始化 ──────────────────────
    onMounted(() => {
      // 注入模式下若 sessionStorage 尚无草稿，从同源路径强制拉取最新正文（不写入 undo 栈）
      if (initialDraft === null && injectParam) {
        const url = resolveInjectUrl(injectParam);
        if (!url) {
          alert('草稿载入失败：只允许载入同源路径');
        } else {
          url.searchParams.set('_', Date.now()); // 绕开 HTTP 缓存
          fetch(url, { cache: 'no-store' })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(text => {
              isUndoRedo = true;
              undoStack.length = 0;
              redoStack.length = 0;
              markdownText.value = text;
              doRender();
              nextTick(() => { isUndoRedo = false; });
              showToast('injected');
            })
            .catch(e => alert('草稿载入失败：' + e.message));
        }
      }

      // 全局快捷键与点击外部关闭浮层
      document.addEventListener('keydown', handleKeyboard);
      document.addEventListener('click', handleOutsideClick);

      // 恢复自定义 CSS
      if (customCss.value) applyCustomCss(customCss.value);

      // 初始化多文档草稿箱（IndexedDB）
      initDocsStore().catch(() => {});

      // 迁移旧 localStorage 图片至 IndexedDB 并水合本地大图库
      if (mediaHelper) {
        mediaHelper.migrateFromLegacyLocalStorage().then((rows) => {
          localImages.value = rows;
          let hydrated = false;
          rows.forEach((r) => {
            if (r?.id && r?.dataUrl) {
              imageStore.set(r.id, r.dataUrl);
              hydrated = true;
            }
          });
          if (hydrated && /img:[a-z0-9_]+/.test(markdownText.value)) doRender();
        }).catch(() => {});
      }

      // Safari 等尚未支持 <dialog closedby="any"> 的浏览器补充点击背景轻关闭兜底
      const dlg = xhsDialogRef.value;
      if (dlg && !('closedBy' in HTMLDialogElement.prototype)) {
        const isOutside = (ev) => {
          const r = dlg.getBoundingClientRect();
          return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
        };
        let pressedOutside = false;
        dlg.addEventListener('pointerdown', (ev) => { pressedOutside = isOutside(ev); });
        dlg.addEventListener('pointerup', (ev) => { if (pressedOutside && isOutside(ev)) dlg.close(); });
      }
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeyboard);
      document.removeEventListener('click', handleOutsideClick);
    });

    let undoCoalesceTimer = null;
    watch(markdownText, (val, oldVal) => {
      try { draftStore.setItem('md-converter-draft', val); } catch { showToast('storage-full'); }
      // 撤回栈：连续输入合并为一个快照（停顿 500ms 后才开新快照）
      if (!isUndoRedo && oldVal !== undefined) {
        if (!undoCoalesceTimer) pushUndo(oldVal);
        clearTimeout(undoCoalesceTimer);
        undoCoalesceTimer = setTimeout(() => { undoCoalesceTimer = null; }, 500);
      }
      // 防抖渲染
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(doRender, RENDER_DEBOUNCE);
    });

    watch(markdownText, () => {
      if (injectParam || !docsHelper) return;
      clearTimeout(docsSaveTimer);
      docsSaveTimer = setTimeout(() => { persistActiveDocNow().catch(() => {}); }, 450);
    });

    // 设置变化时立即重新渲染
    watch(currentTheme, doRender);
    watch(wechatFootnote, doRender);
    watch(macCodeBlock, (val) => {
      lsSet('md-converter-maccode', val ? 'true' : 'false');
      doRender();
    });

    // Vue 3 不处理 mount 元素上的 :class 绑定，需手动同步
    watch(focusMode, (val) => {
      document.getElementById('app').classList.toggle('focus-mode', val);
    });

    return {
      markdownText, currentTheme, currentThemeIsDark, currentThemeBg, currentCodeTheme,
      renderedHtml, charCount, wordCount, readingTime,
      themeList, showHistory, showSettings, showToc, historyList, copySuccess, copyTarget, toastKind,
      darkMode, customColor, activeColor, fontFamily, fontSize, macCodeBlock,
      mobilePreview, wechatFootnote, hoveredTheme, themePreviewHtml, themeTooltipStyle, tocList,
      showImageGuide, toggleImageGuide, smmsToken, uploadingImage,
      mediaConfig, mediaTab, localImages, localImagesTotalSize,
      mediaProviderList, mediaProviderInfo, mediaProviderLabel,
      updateMediaConfig, updateMediaNested, openMediaManager, handleMediaFileSelect,
      insertLocalImage, copyLocalImageMd, deleteLocalImageItem, cleanupUnusedLocalImages, formatMediaSize,
      xhsDialogRef, xhsStyleList, xhsConfig, xhsCards, xhsExporting, xhsStatus,
      openXhsStudio, closeXhsStudio, onXhsDialogClose, setXhsOption, regenerateXhsCards,
      exportSingleXhsCard, exportAllXhsCardsZip,
      isDragging, handleDragLeave, backupIncludeSecrets,
      showPublish, publishStatus, platforms, togglePublish, publishTo,
      selectTheme, toggleDarkMode, toggleSettings, toggleToc, toggleMobilePreview, toggleFootnote,
      onThemeHover, onThemeLeave,
      setCustomColor, resetCustomColor, setFontFamily, setFontSize,
      copyToClipboard, handleFileUpload, clearEditor, exportMarkdown, exportHtml,
      exportPdf, exportImage, exportDocx, exportBackup, importBackup, syncToMultiPlatform, showExportMenu,
      mobileTab,
      insertFormat, saveToHistory, loadHistory, deleteHistory, toggleHistory,
      syncScroll, scrollToHeading, handleTab, handlePaste, handleDrop, handleDragOver,
      colorPresets,
      // 图床管理
      showImageManager, imageHistory,
      toggleImageManager, copyImageUrl, copyImageMd,
      // Phase 2
      focusMode, showFindReplace, findText, replaceText, findCount, findIndex,
      wordGoal, wordGoalProgress, setWordGoal,
      showLineNumbers, toggleLineNumbers, lineNumbers,
      findInEditor, findNext, findPrev, replaceOne, replaceAll, onFindEnter,
      // AI 助手
      aiConfig, aiProviderList, aiProviderInfo, aiKey, aiModel, aiBaseUrl, aiReady,
      aiTesting, aiTestStatus, testAiConnection, clearAiMessages, copyAiText,
      setAiProvider, setAiKey, setAiModel, setAiBaseUrl,
      showAiPanel, aiPanelTab, aiMessages, aiInput, aiBusy, aiChips,
      toggleAiPanel, aiSend, aiStop, applyAiOp, undoAiOp, onAiEnter,
      // 去 AI 味体检与改写
      humanizeStyle, humanizeStyleList, humanizeStyleInfo, humanizeIntensity, humanizeIntensityList,
      humanizeScope, editorSelection,
      docHumanizeReport, humanizeReport, humanizeScoreColor, humanizeDimensionPills,
      humanizeActiveCat, humanizeFilteredIssues, humanizeBusy, humanizeStreamText,
      humanizeError, humanizeProposal, zhuquePlainLength,
      captureEditorSelection, hideSelectionBar, selectionBar, applyFloatFormat, humanizeFromSelectionBar,
      openHumanizer, openZhuqueDetect, setHumanizeStyle, setHumanizeIntensity, openAiSettingsFromPanel,
      jumpToHumanizeIssue, runQuickCleanLocal, runHumanizeRewrite, stopHumanizeRewrite,
      applyHumanizeProposal, undoHumanizeProposal, discardHumanizeProposal,
      // 多文档草稿箱
      showDocsModal, docsList, docsSearch, filteredDocsList, currentDocId, currentDocTitle,
      openDocsModal, createNewDoc, switchDoc, duplicateDoc, deleteDocItem, formatDocTime,
      // Phase 3
      showTemplates, templates, applyTemplate,
      customCss, setCustomCss,
    };
  }
});

app.mount('#app');
