#!/usr/bin/env node
// ============================================
// MoPai 墨排 CLI
// Usage:
//   mopai themes [--json]
//   mopai render [input.md] [--theme default] [--color #07c160] [--font sans|serif|mono]
//                [--size 16] [--no-footnote] [--no-mac] [--simple] [--full] [-o out.html]
//   mopai outline <input.md> [--json]
//   mopai mcp
// ============================================
import { readFileSync, writeFileSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractOutline, listThemes, renderMarkdown } from '../lib/renderer.mjs';
import { publishWechatDraft } from '../lib/wechat-api.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmd = args[0];

function usage() {
  console.log(`MoPai 墨排 CLI

Usage:
  node bin/mopai.mjs themes [--json]
  node bin/mopai.mjs render [input.md] [options]
  node bin/mopai.mjs outline <input.md> [--json]
  node bin/mopai.mjs publish-wechat <input.md> [options]
  node bin/mopai.mjs serve [--port 8080]
  node bin/mopai.mjs mcp

Render options:
  --theme <id>        Theme key (default: default)
  --color <#RRGGBB>   Override primary accent color
  --font <family>     sans | serif | mono (default: sans)
  --size <px>         14 | 15 | 16 | 17 | 18 (default: 16)
  --no-footnote       Keep hyperlinks instead of WeChat footnotes
  --no-mac            Disable Mac code block header
  --simple            Platform-safe simplified inline HTML
  --full              Wrap in complete standalone HTML document
  --keep-frontmatter  Do not strip YAML frontmatter
  -o, --out <file>    Write HTML to file instead of stdout

WeChat Draft options (reads WECHAT_APP_ID & WECHAT_APP_SECRET from env):
  --theme <id>        Theme key (default: frontmatter or default)
  --color <#RRGGBB>   Override primary accent color
  --title <text>      Override draft title
  --author <text>     Article author (<=16 chars)
  --digest <text>     Article digest/summary (<=120 chars)
  --cover <path|url>  Cover image path or URL (defaults to frontmatter cover or 1st image)
  --source-url <url>  Original article URL (阅读原文)
  --auto-cover        Auto-generate a themed PNG cover if no image exists
  --simple            Use simplified inline HTML for compatibility
  --no-mac            Disable Mac code block header
  --comment           Enable comments (need_open_comment=1)
  --fans-only         Only followers can comment
  --dry-run           Validate & preview payload without calling WeChat API
  --json              Output structured JSON`);
}

function getOpt(list, names, fallback = null) {
  for (let i = 0; i < list.length; i++) {
    if (names.includes(list[i]) && i + 1 < list.length) return list[i + 1];
  }
  return fallback;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

if (!cmd || cmd === '-h' || cmd === '--help') {
  usage();
  process.exit(0);
}

try {
  if (cmd === 'mcp') {
    await import('./mopai-mcp.mjs');
  } else if (cmd === 'themes') {
    const items = listThemes();
    if (args.includes('--json')) {
      console.log(JSON.stringify(items, null, 2));
    } else {
      for (const t of items) {
        console.log(`${t.id.padEnd(12)} ${t.emoji} ${t.name.padEnd(8)} (${t.accent})  ${t.desc}`);
      }
    }
  } else if (cmd === 'outline') {
    const rest = args.slice(1);
    const file = rest.find((a) => !a.startsWith('-'));
    if (!file) {
      console.error('Error: missing input Markdown file');
      process.exit(2);
    }
    const md = readFileSync(resolve(file), 'utf8');
    const outline = extractOutline(md);
    if (rest.includes('--json')) {
      console.log(JSON.stringify(outline, null, 2));
    } else {
      console.log(`标题: ${outline.title}`);
      console.log(`字数: ${outline.wordCount} 词 / ${outline.charCount} 字符（约 ${outline.readingTimeMinutes} 分钟）`);
      console.log(`图片: ${outline.images.length} 张 · 链接: ${outline.links.length} 个`);
      for (const h of outline.headings) {
        console.log(`${'  '.repeat(h.level - 1)}H${h.level} ${h.text} (L${h.line})`);
      }
    }
  } else if (cmd === 'render') {
    const rest = args.slice(1);
    const valueFlags = new Set(['--theme', '--color', '--font', '--size', '-o', '--out']);
    let inputFile = null;
    for (let i = 0; i < rest.length; i++) {
      if (valueFlags.has(rest[i])) { i++; continue; }
      if (!rest[i].startsWith('-')) { inputFile = rest[i]; break; }
    }
    const md = inputFile ? readFileSync(resolve(inputFile), 'utf8') : await readStdin();
    const rawSize = Number(getOpt(rest, ['--size'], '16'));
    if (!Number.isFinite(rawSize) || rawSize < 10 || rawSize > 32) {
      throw new Error(`Invalid --size value: ${getOpt(rest, ['--size'])}`);
    }
    const result = renderMarkdown(md, {
      theme: getOpt(rest, ['--theme'], 'default'),
      color: getOpt(rest, ['--color']),
      fontFamily: getOpt(rest, ['--font'], 'sans'),
      fontSize: rawSize,
      wechatFootnote: !rest.includes('--no-footnote'),
      macCodeBlock: !rest.includes('--no-mac'),
      simple: rest.includes('--simple'),
      fullDocument: rest.includes('--full'),
      stripFrontmatter: !rest.includes('--keep-frontmatter'),
    });
    const outPath = getOpt(rest, ['-o', '--out']);
    if (outPath) {
      const abs = resolve(outPath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, result.html, 'utf8');
      console.error(`Rendered "${result.title}" (${result.theme}, ${result.color}) -> ${abs}`);
    } else {
      process.stdout.write(result.html);
    }
  } else if (cmd === 'publish-wechat') {
    const rest = args.slice(1);
    const valueFlags = new Set([
      '--theme', '--color', '--font', '--size', '--title', '--author',
      '--digest', '--cover', '--source-url', '--app-id', '--app-secret',
    ]);
    let inputFile = null;
    for (let i = 0; i < rest.length; i++) {
      if (valueFlags.has(rest[i])) { i++; continue; }
      if (!rest[i].startsWith('-')) { inputFile = rest[i]; break; }
    }
    if (!inputFile) {
      console.error('Error: missing input Markdown file');
      process.exit(2);
    }
    const res = await publishWechatDraft({
      inputPath: resolve(inputFile),
      theme: getOpt(rest, ['--theme']),
      color: getOpt(rest, ['--color']),
      fontFamily: getOpt(rest, ['--font'], 'sans'),
      fontSize: Number(getOpt(rest, ['--size'], '16')),
      title: getOpt(rest, ['--title']),
      author: getOpt(rest, ['--author']),
      digest: getOpt(rest, ['--digest']),
      cover: getOpt(rest, ['--cover']),
      contentSourceUrl: getOpt(rest, ['--source-url']),
      appId: getOpt(rest, ['--app-id']),
      appSecret: getOpt(rest, ['--app-secret']),
      wechatFootnote: !rest.includes('--no-footnote'),
      macCodeBlock: !rest.includes('--no-mac'),
      simple: rest.includes('--simple'),
      autoCover: rest.includes('--auto-cover'),
      needOpenComment: rest.includes('--comment'),
      onlyFansCanComment: rest.includes('--fans-only'),
      dryRun: rest.includes('--dry-run'),
    });
    if (rest.includes('--json')) {
      console.log(JSON.stringify(res, null, 2));
    } else if (res.dryRun) {
      console.log(`[DRY RUN] 标题: ${res.article.title}`);
      console.log(`主题: ${res.theme} (${res.color}) · HTML: ${(res.htmlBytes / 1024).toFixed(1)} KB (${res.htmlChars} 字符)`);
      console.log(`封面来源: ${res.coverSource || '(未设置)'}`);
      console.log(`待上传正文图片: ${res.imagesToUpload.length} 张 · 已在微信域名: ${res.alreadyWechatImages.length} 张`);
      for (const w of res.warnings) console.warn(`⚠️  ${w}`);
    } else {
      console.log(`✅ 微信公众号草稿已创建！media_id: ${res.mediaId}`);
      console.log(`标题: ${res.title} · 已转存正文图片: ${res.uploadedImagesCount} 张 · 封面 media_id: ${res.coverMediaId}`);
      for (const w of res.warnings) console.warn(`⚠️  ${w}`);
    }
  } else if (cmd === 'serve') {
    const rest = args.slice(1);
    const port = Number(getOpt(rest, ['--port', '-p'], '8080'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${getOpt(rest, ['--port', '-p'])}`);
    }
    const MIME = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.md': 'text/markdown; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    };
    const server = createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const safePath = pathname === '/' ? '/index.html' : pathname;
      const absPath = normalize(resolve(projectRoot, '.' + safePath));
      if (!absPath.startsWith(projectRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      try {
        if (!statSync(absPath).isFile()) throw new Error('Not a file');
        res.writeHead(200, { 'Content-Type': MIME[extname(absPath).toLowerCase()] || 'application/octet-stream' });
        createReadStream(absPath).pipe(res);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`MoPai 墨排已启动: http://127.0.0.1:${port}`);
    });
  } else {
    console.error(`Unknown command: ${cmd}`);
    usage();
    process.exit(2);
  }
} catch (err) {
  console.error(`Error: ${err?.message || err}`);
  process.exit(1);
}
