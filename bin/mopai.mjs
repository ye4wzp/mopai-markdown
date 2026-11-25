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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { extractOutline, listThemes, renderMarkdown } from '../lib/renderer.mjs';

const args = process.argv.slice(2);
const cmd = args[0];

function usage() {
  console.log(`MoPai 墨排 CLI

Usage:
  node bin/mopai.mjs themes [--json]
  node bin/mopai.mjs render [input.md] [options]
  node bin/mopai.mjs outline <input.md> [--json]
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
  -o, --out <file>    Write HTML to file instead of stdout`);
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
  const result = renderMarkdown(md, {
    theme: getOpt(rest, ['--theme'], 'default'),
    color: getOpt(rest, ['--color']),
    fontFamily: getOpt(rest, ['--font'], 'sans'),
    fontSize: Number(getOpt(rest, ['--size'], '16')),
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
} else {
  console.error(`Unknown command: ${cmd}`);
  usage();
  process.exit(2);
}
