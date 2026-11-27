// ============================================
// MoPai 墨排 — 零依赖微信公众号草稿箱直发引擎
// 接口链路：stable_token -> media/uploadimg -> material/add_material -> draft/add
// 支持环境变量 WECHAT_APP_ID / WECHAT_APP_SECRET 与 dryRun 本地预检
// ============================================
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { renderMarkdown, stripFrontmatter } from './renderer.mjs';

const WECHAT_API_BASE = 'https://api.weixin.qq.com';

const WECHAT_ERROR_HINTS = {
  40001: 'AppSecret 错误或 access_token 无效，请核对 WECHAT_APP_ID 与 WECHAT_APP_SECRET',
  40007: '无效的媒体文件 ID (thumb_media_id)，封面必须通过永久素材接口上传',
  40013: '无效的 AppID，请检查 WECHAT_APP_ID 是否拼写正确',
  40125: 'AppSecret 无效，请在公众号后台重新核对开发者密码',
  40164: '当前出口 IP 未加入公众号 IP 白名单，请在「微信公众平台 -> 设置与开发 -> 安全中心 -> IP白名单」添加本机公网 IP',
  45002: '文章内容超过微信字数/大小限制（正文需小于 1MB 且少于 2 万字符）',
  45009: '接口调用超过当日频次限制，请明日再试',
  48001: '当前公众号账号暂无该 API 权限，请检查公众号类型与接口权限设置',
  88000: '草稿箱缺少封面图或参数不符合规范',
};

export function formatWechatError(errcode, errmsg = '') {
  const hint = WECHAT_ERROR_HINTS[errcode];
  const base = `微信 API 错误 [${errcode}]${errmsg ? `: ${errmsg}` : ''}`;
  return hint ? `${base}\n排查建议：${hint}` : base;
}

// ─── 纯 Node 零依赖 PNG 生成器（2.35:1 900x383 公众号封面兜底） ───
const PNG_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function pngCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(pngCrc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function generateFallbackCoverPng(hexColor = '#4f6ef7', width = 900, height = 383) {
  const clean = String(hexColor || '#4f6ef7').replace(/^#/, '');
  const full = /^[0-9a-fA-F]{6}$/.test(clean) ? clean : '4f6ef7';
  const r0 = parseInt(full.slice(0, 2), 16);
  const g0 = parseInt(full.slice(2, 4), 16);
  const b0 = parseInt(full.slice(4, 6), 16);

  // 生成柔和渐变横幅 PNG，比纯色块更美观且体积仅 ~4KB
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * stride;
    raw[rowOff] = 0; // filter: None
    const ty = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const tx = x / Math.max(1, width - 1);
      const mix = 0.72 + 0.28 * (tx * 0.65 + ty * 0.35);
      const px = rowOff + 1 + x * 3;
      raw[px] = Math.min(255, Math.round(r0 * mix + 20 * (1 - mix)));
      raw[px + 1] = Math.min(255, Math.round(g0 * mix + 28 * (1 - mix)));
      raw[px + 2] = Math.min(255, Math.round(b0 * mix + 46 * (1 - mix)));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', deflateSync(raw, { level: 6 })),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Token 缓存（按 AppID 进程内复用稳定版 Token） ───
const tokenCache = new Map();

export function clearTokenCache() {
  tokenCache.clear();
}

export async function getStableAccessToken({ appId, appSecret, forceRefresh = false, fetchImpl = fetch }) {
  if (!appId || !appSecret) {
    throw new Error('缺少微信公众号凭证：请设置环境变量 WECHAT_APP_ID 和 WECHAT_APP_SECRET（或通过参数传入）');
  }

  const cached = tokenCache.get(appId);
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const resp = await fetchImpl(`${WECHAT_API_BASE}/cgi-bin/stable_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: appId,
      secret: appSecret,
      force_refresh: Boolean(forceRefresh),
    }),
  });
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(formatWechatError(data.errcode || resp.status, data.errmsg || '获取 stable_token 失败'));
  }

  const ttlMs = Math.max(60, (Number(data.expires_in) || 7200) - 300) * 1000;
  tokenCache.set(appId, { token: data.access_token, expiresAt: Date.now() + ttlMs });
  return data.access_token;
}

function guessMimeFromExt(filePath) {
  const ext = extname(String(filePath || '').split('?')[0]).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
  }[ext] || 'image/png';
}

function extFromMime(mime) {
  return {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'image/webp': '.webp',
  }[mime] || '.png';
}

export async function loadImageSource(src, { baseDir = process.cwd(), fetchImpl = fetch } = {}) {
  const raw = String(src || '').trim();
  if (!raw) throw new Error('图片地址为空');

  // 1. Base64 Data URL
  if (raw.startsWith('data:image/')) {
    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error('不支持的 Data URL 图片格式');
    const mimeType = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    return { buffer, mimeType, filename: `embedded${extFromMime(mimeType)}`, sourceType: 'data-url' };
  }

  // 2. 远程 HTTP(S) 图片
  if (/^https?:\/\//i.test(raw)) {
    const resp = await fetchImpl(raw);
    if (!resp.ok) throw new Error(`下载图片失败 (${resp.status}): ${raw}`);
    const arrayBuf = await resp.arrayBuffer();
    const headerMime = (resp.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    const mimeType = headerMime.startsWith('image/') ? headerMime : guessMimeFromExt(raw);
    const urlName = basename(new URL(raw).pathname) || `remote${extFromMime(mimeType)}`;
    const filename = extname(urlName) ? urlName : `${urlName}${extFromMime(mimeType)}`;
    return { buffer: Buffer.from(arrayBuf), mimeType, filename, sourceType: 'remote' };
  }

  // 3. 本地文件路径（支持相对于 Markdown 文档目录）
  const absPath = resolve(baseDir, raw);
  const buffer = readFileSync(absPath);
  const mimeType = guessMimeFromExt(absPath);
  return { buffer, mimeType, filename: basename(absPath), sourceType: 'local', absPath };
}

export async function uploadInlineImage({ accessToken, buffer, filename, mimeType, fetchImpl = fetch }) {
  const form = new FormData();
  form.append('media', new Blob([buffer], { type: mimeType }), filename);
  const resp = await fetchImpl(
    `${WECHAT_API_BASE}/cgi-bin/media/uploadimg?access_token=${encodeURIComponent(accessToken)}`,
    { method: 'POST', body: form }
  );
  const data = await resp.json();
  if (!data.url) {
    throw new Error(formatWechatError(data.errcode || resp.status, data.errmsg || `正文图片上传失败 (${filename})`));
  }
  return data.url;
}

export async function uploadCoverMaterial({ accessToken, buffer, filename, mimeType, fetchImpl = fetch }) {
  const form = new FormData();
  form.append('media', new Blob([buffer], { type: mimeType }), filename);
  const resp = await fetchImpl(
    `${WECHAT_API_BASE}/cgi-bin/material/add_material?access_token=${encodeURIComponent(accessToken)}&type=image`,
    { method: 'POST', body: form }
  );
  const data = await resp.json();
  if (!data.media_id) {
    throw new Error(formatWechatError(data.errcode || resp.status, data.errmsg || `封面素材上传失败 (${filename})`));
  }
  return { mediaId: data.media_id, url: data.url || '' };
}

function unescapeAttr(val) {
  return String(val || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function escapeAttr(val) {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractDigestFromBody(body, maxLen = 110) {
  const plain = String(body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~>|#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) : plain;
}

// ─── 端到端微信公众号草稿箱发布流水线 ───
export async function publishWechatDraft(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseDir = options.baseDir || (options.inputPath ? dirname(resolve(options.inputPath)) : process.cwd());
  const rawMarkdown = options.markdown !== undefined
    ? String(options.markdown)
    : (options.inputPath ? readFileSync(resolve(options.inputPath), 'utf8') : '');

  if (!rawMarkdown.trim()) {
    throw new Error('缺少 Markdown 内容：请提供 markdown 文本或有效的 inputPath 文件路径');
  }

  const { body, frontmatter } = stripFrontmatter(rawMarkdown);
  const warnings = [];

  // 若正文首行 H1 与标题一致且未关闭去重，避免公众号顶部标题 + 正文 H1 双标题重复
  const rendered = renderMarkdown(rawMarkdown, {
    theme: options.theme || frontmatter.theme || 'default',
    color: options.color || frontmatter.color,
    fontFamily: options.fontFamily || 'sans',
    fontSize: Number(options.fontSize || 16),
    wechatFootnote: options.wechatFootnote !== false,
    macCodeBlock: options.macCodeBlock !== false,
    simple: Boolean(options.simple),
    fullDocument: false,
    stripFrontmatter: true,
  });

  let htmlContent = rendered.html;
  const rawTitle = (options.title || frontmatter.title || rendered.title || 'MoPai 文章').trim();
  let title = rawTitle;
  if (title.length > 64) {
    warnings.push(`标题长度 (${title.length} 字) 超过微信上限，已截断至 64 字`);
    title = title.slice(0, 64);
  }

  let author = String(options.author || frontmatter.author || '').trim();
  if (author.length > 16) {
    warnings.push(`作者名 (${author.length} 字) 超过 16 字限制，已截断`);
    author = author.slice(0, 16);
  }

  let digest = String(options.digest || frontmatter.digest || frontmatter.summary || frontmatter.desc || extractDigestFromBody(body)).trim();
  if (digest.length > 120) {
    warnings.push(`摘要长度 (${digest.length} 字) 超过 120 字限制，已截断`);
    digest = digest.slice(0, 120);
  }

  const contentSourceUrl = String(options.contentSourceUrl || frontmatter.source_url || frontmatter.url || '').trim();

  // 扫描渲染后 HTML 中的全部 <img>
  const imgRegex = /<img\b([^>]*?)\bsrc="([^"]+)"([^>]*?)>/gi;
  const foundImages = [];
  const uniqueSrcs = new Set();
  for (const m of htmlContent.matchAll(imgRegex)) {
    const src = unescapeAttr(m[2]);
    if (!uniqueSrcs.has(src)) {
      uniqueSrcs.add(src);
      foundImages.push(src);
    }
  }

  // 决定封面来源：显式 cover > frontmatter.cover/thumb > 正文首图 > autoCover 兜底
  const coverRef = String(options.cover || frontmatter.cover || frontmatter.thumb || foundImages[0] || '').trim();
  const useAutoCover = !coverRef && Boolean(options.autoCover);

  if (!coverRef && !useAutoCover && !options.dryRun) {
    throw new Error('微信草稿箱必须设置封面图：请传入 --cover <本地路径或URL>、在 Frontmatter 声明 cover:、正文插入图片，或添加 --auto-cover 自动生成主题色封面');
  }
  if (!coverRef && !useAutoCover && options.dryRun) {
    warnings.push('未检测到封面图：真实发布时需提供 --cover、Frontmatter cover、正文首图，或启用 --auto-cover');
  }

  const htmlBytes = Buffer.byteLength(htmlContent, 'utf8');
  if (htmlBytes > 1024 * 1024) {
    warnings.push(`渲染 HTML 大小 (${(htmlBytes / 1024).toFixed(1)} KB) 超过微信 1MB 限制`);
  }
  if (htmlContent.length > 20000) {
    warnings.push(`渲染 HTML 字符数 (${htmlContent.length}) 超过 20,000 字符，微信接口可能拒绝，建议使用 --simple 精简样式`);
  }

  // Dry-run 本地预检模式（不消耗额度、无需 AppID）
  if (options.dryRun) {
    return {
      dryRun: true,
      theme: rendered.theme,
      color: rendered.color,
      article: {
        title,
        author,
        digest,
        content_source_url: contentSourceUrl,
        need_open_comment: options.needOpenComment ? 1 : 0,
        only_fans_can_comment: options.onlyFansCanComment ? 1 : 0,
      },
      coverSource: coverRef || (useAutoCover ? '(auto-generated fallback PNG)' : null),
      imagesToUpload: foundImages.filter((u) => !/mmbiz\.qpic\.cn/i.test(u)),
      alreadyWechatImages: foundImages.filter((u) => /mmbiz\.qpic\.cn/i.test(u)),
      htmlBytes,
      htmlChars: htmlContent.length,
      warnings,
    };
  }

  const appId = (options.appId || process.env.WECHAT_APP_ID || '').trim();
  const appSecret = (options.appSecret || process.env.WECHAT_APP_SECRET || '').trim();
  const accessToken = await getStableAccessToken({ appId, appSecret, fetchImpl });

  // 1. 逐张去重上传正文非微信域图片，并回写替换 HTML src
  const uploadedMap = new Map();
  for (const src of foundImages) {
    if (/mmbiz\.qpic\.cn/i.test(src)) continue;
    const imgData = await loadImageSource(src, { baseDir, fetchImpl });
    if (imgData.buffer.length > 1024 * 1024) {
      warnings.push(`正文图片 "${imgData.filename}" 体积 (${(imgData.buffer.length / 1024).toFixed(0)} KB) 超过微信 uploadimg 1MB 限制，可能上传失败`);
    }
    const wxUrl = await uploadInlineImage({
      accessToken,
      buffer: imgData.buffer,
      filename: imgData.filename,
      mimeType: imgData.mimeType,
      fetchImpl,
    });
    uploadedMap.set(src, wxUrl);
  }

  if (uploadedMap.size > 0) {
    htmlContent = htmlContent.replace(imgRegex, (full, before, encodedSrc, after) => {
      const orig = unescapeAttr(encodedSrc);
      const replaced = uploadedMap.get(orig);
      if (!replaced) return full;
      return `<img${before}src="${escapeAttr(replaced)}"${after}>`;
    });
  }

  // 2. 上传封面永久素材获取 thumb_media_id
  let coverPayload;
  if (coverRef) {
    coverPayload = await loadImageSource(coverRef, { baseDir, fetchImpl });
  } else {
    coverPayload = {
      buffer: generateFallbackCoverPng(rendered.color),
      mimeType: 'image/png',
      filename: 'mopai-cover.png',
    };
  }
  const coverResult = await uploadCoverMaterial({
    accessToken,
    buffer: coverPayload.buffer,
    filename: coverPayload.filename,
    mimeType: coverPayload.mimeType,
    fetchImpl,
  });

  // 3. 调用 draft/add 创建微信公众号草稿箱文章
  const articlePayload = {
    title,
    author,
    digest,
    content: htmlContent,
    content_source_url: contentSourceUrl,
    thumb_media_id: coverResult.mediaId,
    need_open_comment: options.needOpenComment ? 1 : 0,
    only_fans_can_comment: options.onlyFansCanComment ? 1 : 0,
  };

  const draftResp = await fetchImpl(
    `${WECHAT_API_BASE}/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: [articlePayload] }),
    }
  );
  const draftData = await draftResp.json();
  if (!draftData.media_id) {
    throw new Error(formatWechatError(draftData.errcode || draftResp.status, draftData.errmsg || '创建微信公众号草稿失败'));
  }

  return {
    dryRun: false,
    mediaId: draftData.media_id,
    title,
    author,
    digest,
    theme: rendered.theme,
    color: rendered.color,
    coverMediaId: coverResult.mediaId,
    uploadedImagesCount: uploadedMap.size,
    uploadedImages: Object.fromEntries(uploadedMap),
    warnings,
  };
}
