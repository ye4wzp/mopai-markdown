#!/usr/bin/env node
// ============================================
// MoPai 墨排 — Zero-dependency MCP Server (stdio JSON-RPC 2.0)
// Tools: list_themes, render_markdown, format_file, extract_outline
// ============================================
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractOutline, listThemes, renderMarkdown, stripFrontmatter } from '../lib/renderer.mjs';

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
];

function handleToolCall(name, args = {}) {
  if (name === 'list_themes') {
    return { content: [{ type: 'text', text: JSON.stringify(listThemes(), null, 2) }] };
  }

  if (name === 'render_markdown') {
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
    const absIn = resolve(args.inputPath);
    const md = readFileSync(absIn, 'utf8');
    const res = renderMarkdown(md, {
      theme: args.theme || 'default',
      color: args.color,
      fontFamily: args.fontFamily || 'sans',
      fontSize: args.fontSize || 16,
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
    if (args.stageSlug) {
      const cleanSlug = String(args.stageSlug).replace(/[^a-zA-Z0-9_-]/g, '-');
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

function handleMessage(msg) {
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
          serverInfo: { name: 'mopai-markdown', version: '3.1.0' },
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
      const result = handleToolCall(params?.name, params?.arguments || {});
      sendMessage({ jsonrpc: '2.0', id, result });
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
      result: { isError: true, content: [{ type: 'text', text: String(err?.message || err) }] },
    });
  }
}

let buffer = Buffer.alloc(0);

function drainBuffer() {
  while (buffer.length > 0) {
    const str = buffer.toString('utf8');
    if (str.startsWith('Content-Length:')) {
      framingMode = 'lsp';
      const sep = buffer.indexOf('\r\n\r\n');
      if (sep === -1) return;
      const header = buffer.slice(0, sep).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { buffer = buffer.slice(sep + 4); continue; }
      const len = Number(match[1]);
      if (buffer.length < sep + 4 + len) return;
      const body = buffer.slice(sep + 4, sep + 4 + len).toString('utf8');
      buffer = buffer.slice(sep + 4 + len);
      try { handleMessage(JSON.parse(body)); } catch {}
    } else {
      const nl = buffer.indexOf('\n');
      if (nl === -1) return;
      const line = buffer.slice(0, nl).toString('utf8').trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try { handleMessage(JSON.parse(line)); } catch {}
    }
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drainBuffer();
});
