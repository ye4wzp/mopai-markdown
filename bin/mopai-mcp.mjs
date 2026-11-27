#!/usr/bin/env node
// ============================================
// MoPai 墨排 — Zero-dependency MCP Server (stdio JSON-RPC 2.0)
// Tools: list_themes, render_markdown, format_file, extract_outline, publish_wechat_draft
// ============================================
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractOutline, listThemes, renderMarkdown, stripFrontmatter } from '../lib/renderer.mjs';
import { publishWechatDraft } from '../lib/wechat-api.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TOOLS = [
  {
    name: 'list_themes',
    description: '列出 MoPai 墨排全部 13 种排版主题及其默认主色、背景色与适用场景。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'render_markdown',
    description: '将 Markdown 文本渲染为带内联样式的公众号/多平台富文本 HTML。',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: '待排版的 Markdown 文本' },
        theme: { type: 'string', description: '主题 key（如 default/tech/claude/sspai/dark_night）' },
        color: { type: 'string', description: '可选自定义主色（#RRGGBB）' },
        fontFamily: { type: 'string', enum: ['sans', 'serif', 'mono'] },
        fontSize: { type: 'number', enum: [14, 15, 16, 17, 18] },
        wechatFootnote: { type: 'boolean', description: '是否将外链转为微信文末脚注（默认 true）' },
        macCodeBlock: { type: 'boolean', description: '是否启用 Mac 风格代码块标题栏（默认 true）' },
        simple: { type: 'boolean', description: '是否输出多平台精简兼容 HTML（去除装饰性 CSS，默认 false）' },
        fullDocument: { type: 'boolean', description: '是否包裹为完整独立 HTML 文档（默认 false）' },
        stripFrontmatter: { type: 'boolean', description: '是否移除 YAML frontmatter（默认 true）' },
      },
      required: ['markdown'],
    },
  },
  {
    name: 'format_file',
    description: '读取本地 Markdown 文件，渲染并写出 HTML；可选同步副本到 article-assets/<slug>/article.md 供 MoPai 浏览器编辑器 ?load= 注入审稿。',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: '源 Markdown 文件路径' },
        outputPath: { type: 'string', description: '可选输出 HTML 文件路径' },
        theme: { type: 'string', description: '主题 key（默认 default）' },
        color: { type: 'string', description: '可选自定义主色（#RRGGBB）' },
        fontFamily: { type: 'string', enum: ['sans', 'serif', 'mono'] },
        fontSize: { type: 'number', enum: [14, 15, 16, 17, 18] },
        wechatFootnote: { type: 'boolean', description: '是否将外链转为微信文末脚注（默认 true）' },
        macCodeBlock: { type: 'boolean', description: '是否启用 Mac 风格代码块标题栏（默认 true）' },
        simple: { type: 'boolean' },
        fullDocument: { type: 'boolean' },
        stageSlug: { type: 'string', description: '可选：若提供 slug，将去 frontmatter 正文写入 article-assets/<slug>/article.md 并返回 ?load= 路径' },
      },
      required: ['inputPath'],
    },
  },
  {
    name: 'extract_outline',
    description: '提取 Markdown 文章标题、字数、阅读时长、大纲目录（跳过代码块注释）及图片/外链清单。',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Markdown 文本（与 inputPath 二选一）' },
        inputPath: { type: 'string', description: 'Markdown 文件路径（与 markdown 二选一）' },
      },
    },
  },
  {
    name: 'publish_wechat_draft',
    description: '将 Markdown 排版、自动转存本地/外链图片并直发至微信公众号草稿箱（读取服务端环境变量 WECHAT_APP_ID / WECHAT_APP_SECRET；支持 dryRun 预检，不直接群发）。',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Markdown 文本（与 inputPath 二选一）' },
        inputPath: { type: 'string', description: '本地 Markdown 文件路径（与 markdown 二选一，相对图片路径按此目录解析）' },
        theme: { type: 'string', description: '主题 key（默认读取 frontmatter.theme 或 default）' },
        color: { type: 'string', description: '可选自定义主色（#RRGGBB）' },
        title: { type: 'string', description: '可选覆盖草稿标题（<=64字）' },
        author: { type: 'string', description: '可选作者名（<=16字）' },
        digest: { type: 'string', description: '可选摘要（<=120字）' },
        cover: { type: 'string', description: '可选封面图片路径或 URL（默认取 frontmatter.cover 或正文首图）' },
        contentSourceUrl: { type: 'string', description: '可选阅读原文链接' },
        autoCover: { type: 'boolean', description: '无图时是否自动生成主题色 900x383 兜底封面 PNG（默认 false）' },
        simple: { type: 'boolean', description: '是否输出精简兼容 HTML（默认 false）' },
        macCodeBlock: { type: 'boolean', description: '是否启用 Mac 代码块（默认 true）' },
        wechatFootnote: { type: 'boolean', description: '是否将外链转为微信脚注（默认 true）' },
        needOpenComment: { type: 'boolean', description: '是否开启留言（默认 false）' },
        onlyFansCanComment: { type: 'boolean', description: '是否仅粉丝可留言（默认 false）' },
        dryRun: { type: 'boolean', description: '仅做本地排版校验与图片清单预检，不真实调用微信 API（默认 false）' },
      },
    },
  },
];

async function handleToolCall(name, args = {}) {
  if (name === 'list_themes') {
    return { content: [{ type: 'text', text: JSON.stringify(listThemes(), null, 2) }] };
  }

  if (name === 'render_markdown') {
    if (typeof args.markdown !== 'string') throw new Error('markdown must be a string');
    const res = renderMarkdown(args.markdown, args);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: res.title,
          theme: res.theme,
          color: res.color,
          wordCount: res.outline.wordCount,
          html: res.html,
        }, null, 2),
      }],
    };
  }

  if (name === 'format_file') {
    if (!args.inputPath || typeof args.inputPath !== 'string') throw new Error('inputPath is required');
    const absIn = resolve(args.inputPath);
    const md = readFileSync(absIn, 'utf8');
    const res = renderMarkdown(md, {
      theme: args.theme || 'default',
      color: args.color,
      fontFamily: args.fontFamily || 'sans',
      fontSize: args.fontSize || 16,
      wechatFootnote: args.wechatFootnote !== false,
      macCodeBlock: args.macCodeBlock !== false,
      simple: Boolean(args.simple),
      fullDocument: args.fullDocument !== false,
      stripFrontmatter: true,
    });
    const out = { title: res.title, theme: res.theme, color: res.color, wordCount: res.outline.wordCount };
    if (args.outputPath) {
      const absOut = resolve(args.outputPath);
      mkdirSync(dirname(absOut), { recursive: true });
      writeFileSync(absOut, res.html, 'utf8');
      out.outputPath = absOut;
    } else {
      out.html = res.html;
    }
    if (args.stageSlug !== undefined) {
      const cleanSlug = String(args.stageSlug).trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
      if (!cleanSlug || !/[a-zA-Z0-9]/.test(cleanSlug)) {
        throw new Error('stageSlug must contain at least one alphanumeric character');
      }
      const { body } = stripFrontmatter(md);
      const stagePath = resolve(projectRoot, 'article-assets', cleanSlug, 'article.md');
      mkdirSync(dirname(stagePath), { recursive: true });
      writeFileSync(stagePath, body, 'utf8');
      out.stagedPath = stagePath;
      out.loadQuery = `index.html?load=article-assets/${cleanSlug}/article.md`;
    }
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }

  if (name === 'extract_outline') {
    const md = args.markdown ?? (args.inputPath ? readFileSync(resolve(args.inputPath), 'utf8') : '');
    if (!md) throw new Error('Provide either markdown or inputPath');
    return { content: [{ type: 'text', text: JSON.stringify(extractOutline(md), null, 2) }] };
  }

  if (name === 'publish_wechat_draft') {
    const result = await publishWechatDraft({
      markdown: args.markdown,
      inputPath: args.inputPath,
      theme: args.theme,
      color: args.color,
      title: args.title,
      author: args.author,
      digest: args.digest,
      cover: args.cover,
      contentSourceUrl: args.contentSourceUrl,
      autoCover: Boolean(args.autoCover),
      simple: Boolean(args.simple),
      macCodeBlock: args.macCodeBlock !== false,
      wechatFootnote: args.wechatFootnote !== false,
      needOpenComment: Boolean(args.needOpenComment),
      onlyFansCanComment: Boolean(args.onlyFansCanComment),
      dryRun: Boolean(args.dryRun),
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
}

let framingMode = 'ndjson';

function sendMessage(msg) {
  const json = JSON.stringify(msg);
  if (framingMode === 'lsp') {
    const byteLen = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;
  if (method === 'notifications/initialized' || id === undefined) return;

  try {
    if (method === 'initialize') {
      sendMessage({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mopai-markdown', version: '3.2.0' },
        },
      });
      return;
    }
    if (method === 'ping') {
      sendMessage({ jsonrpc: '2.0', id, result: {} });
      return;
    }
    if (method === 'tools/list') {
      sendMessage({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    }
    if (method === 'tools/call') {
      try {
        const result = await handleToolCall(params?.name, params?.arguments || {});
        sendMessage({ jsonrpc: '2.0', id, result });
      } catch (toolErr) {
        sendMessage({
          jsonrpc: '2.0',
          id,
          result: { isError: true, content: [{ type: 'text', text: String(toolErr?.message || toolErr) }] },
        });
      }
      return;
    }
    sendMessage({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  } catch (err) {
    sendMessage({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: String(err?.message || err) },
    });
  }
}

let buffer = Buffer.alloc(0);
const LSP_PREFIX = 'content-length:';
const HEADER_SEP = Buffer.from('\r\n\r\n');

function looksLikeLspHeader(buf) {
  const probeLen = Math.min(buf.length, LSP_PREFIX.length);
  const head = buf.subarray(0, probeLen).toString('ascii').toLowerCase();
  return head === LSP_PREFIX.slice(0, probeLen);
}

function drainBuffer() {
  while (buffer.length > 0) {
    // 跳过报文间多余的空白换行
    let leading = 0;
    while (leading < buffer.length && (buffer[leading] === 0x0d || buffer[leading] === 0x0a)) leading++;
    if (leading > 0) buffer = buffer.subarray(leading);
    if (buffer.length === 0) return;

    if (looksLikeLspHeader(buffer)) {
      framingMode = 'lsp';
      const sep = buffer.indexOf(HEADER_SEP);
      if (sep === -1) return; // header 尚未收齐，等待下一个 chunk
      const header = buffer.subarray(0, sep).toString('ascii');
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.subarray(sep + HEADER_SEP.length);
        continue;
      }
      const len = Number(match[1]);
      const frameEnd = sep + HEADER_SEP.length + len;
      if (buffer.length < frameEnd) return; // body 尚未收齐，按精确字节长度等待
      const body = buffer.subarray(sep + HEADER_SEP.length, frameEnd).toString('utf8');
      buffer = buffer.subarray(frameEnd);
      try {
        handleMessage(JSON.parse(body));
      } catch {
        sendMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      }
    } else {
      const nl = buffer.indexOf(0x0a);
      if (nl === -1) return;
      const line = buffer.subarray(0, nl).toString('utf8').trim();
      buffer = buffer.subarray(nl + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch {
        sendMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      }
    }
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drainBuffer();
});
