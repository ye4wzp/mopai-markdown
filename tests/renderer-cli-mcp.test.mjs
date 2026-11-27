import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractOutline, listThemes, renderMarkdown, stripFrontmatter } from '../lib/renderer.mjs';
import { clearTokenCache, formatWechatError, generateFallbackCoverPng, publishWechatDraft } from '../lib/wechat-api.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('listThemes returns all 13 themes with accent and bg metadata', () => {
  const list = listThemes();
  assert.equal(list.length, 13);
  for (const t of list) {
    assert.match(t.accent, /^#[0-9a-fA-F]{6}$/, `${t.id} should declare hex accent`);
    assert.match(t.bg, /^#[0-9a-fA-F]{6}$/, `${t.id} should declare hex bg`);
  }
  assert.equal(list.find(t => t.id === 'dark_night')?.isDark, true);
});

test('custom color overrides work across all 13 themes', () => {
  const sample = '# 测试标题\n\n## 二级标题\n\n**加粗** 与 [链接](https://example.com)\n\n> 引用文字';
  for (const t of listThemes()) {
    const res = renderMarkdown(sample, { theme: t.id, color: '#07c160' });
    assert.equal(res.color, '#07c160');
    assert.match(res.html, /#07c160/i, `theme ${t.id} should apply custom primary color`);
  }
});

test('extractOutline skips # comments inside fenced code blocks and parses frontmatter', () => {
  const md = `---
title: Frontmatter 标题
author: 长岛不长啊
---

\`\`\`python
# 这不是标题
## 这也不是标题
\`\`\`

# 正文主标题

## 小节一

![架构图](https://example.com/arch.png)
`;
  const outline = extractOutline(md);
  assert.equal(outline.title, 'Frontmatter 标题');
  assert.equal(outline.headings.length, 2);
  assert.equal(outline.headings[0].text, '正文主标题');
  assert.equal(outline.headings[1].text, '小节一');
  assert.equal(outline.images.length, 1);
  assert.equal(outline.images[0].url, 'https://example.com/arch.png');
  assert.equal(stripFrontmatter(md).frontmatter.author, '长岛不长啊');
});

test('renderMarkdown supports multi-paragraph info cards, footnotes, and simple mode', () => {
  const md = `# 卡片测试

:::tip 💡 多段提示
第一段说明。

第二段含 **加粗** 和 \`code\`。
:::

访问 [MoPai](https://mopai-markdown.vercel.app)

\`\`\`js
console.log(1);
\`\`\`
`;
  const rich = renderMarkdown(md, { theme: 'dark_night', wechatFootnote: true });
  assert.match(rich.html, /第一段说明。/);
  assert.match(rich.html, /第二段含/);
  assert.match(rich.html, /参考资料/);
  assert.match(rich.html, /https:\/\/mopai-markdown\.vercel\.app/);
  assert.match(rich.html, /rgba\(255,255,255,0\.14\)/, 'dark theme footnote divider should adapt');

  const simple = renderMarkdown(md, { theme: 'tech', simple: true });
  assert.doesNotMatch(simple.html, /mac-code-header|box-shadow|display:\s*flex/i);
  assert.match(simple.html, /<pre style=/);
});

test('CLI themes, outline, and render commands work end-to-end', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mopai-cli-'));
  try {
    const inFile = path.join(dir, 'post.md');
    const outFile = path.join(dir, 'post.html');
    await writeFile(inFile, '# CLI 测试\n\n正文 **高亮**。\n', 'utf8');

    const themesOut = execFileSync('node', [path.join(projectRoot, 'bin/mopai.mjs'), 'themes', '--json'], { encoding: 'utf8' });
    assert.equal(JSON.parse(themesOut).length, 13);

    const outlineOut = execFileSync('node', [path.join(projectRoot, 'bin/mopai.mjs'), 'outline', inFile, '--json'], { encoding: 'utf8' });
    assert.equal(JSON.parse(outlineOut).title, 'CLI 测试');

    execFileSync('node', [
      path.join(projectRoot, 'bin/mopai.mjs'),
      'render', inFile,
      '--theme', 'claude',
      '--color', '#07c160',
      '--full',
      '-o', outFile,
    ], { stdio: 'pipe' });

    const html = await readFile(outFile, 'utf8');
    assert.match(html, /<title>CLI 测试<\/title>/);
    assert.match(html, /#07c160/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('MCP stdio server handles initialize, tools/list, and tools/call', async () => {
  const child = spawn('node', [path.join(projectRoot, 'bin/mopai-mcp.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const responses = [];
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.trim()) responses.push(JSON.parse(line));
    }
  });

  const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'render_markdown',
      arguments: { markdown: '# MCP 排版\n\n[链接](https://example.com)', theme: 'sspai', color: '#10b981' },
    },
  });
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_themes', arguments: {} } });
  child.stdin.end();

  await new Promise((resolve) => child.once('exit', resolve));

  assert.equal(responses.length, 4);
  assert.equal(responses[0].result.serverInfo.name, 'mopai-markdown');
  assert.deepEqual(
    responses[1].result.tools.map(t => t.name).sort(),
    ['extract_outline', 'format_file', 'list_themes', 'publish_wechat_draft', 'render_markdown']
  );
  const rendered = JSON.parse(responses[2].result.content[0].text);
  assert.equal(rendered.title, 'MCP 排版');
  assert.equal(rendered.color, '#10b981');
  assert.match(rendered.html, /参考资料/);
  const themeItems = JSON.parse(responses[3].result.content[0].text);
  assert.equal(themeItems.length, 13);
});

test('renderMarkdown avoids double-escaping query params and supports task lists, table aligns, nested lists, and underscore boundaries', () => {
  const md = [
    '![封面 & 图](https://example.com/pic.png?w=800&h=600)',
    '',
    '参考 [A & B](https://example.com/doc?a=1&b=2) 与标识符 foo__bar__baz 以及 \\*原义星号\\*。',
    '',
    '- [x] 已完成任务',
    '- [ ] 待办任务',
    '  - 嵌套子项',
    '',
    '| 左 | 中 | 右 |',
    '|:---|:---:|---:|',
    '| L | C | R |',
  ].join('\n');

  const withFn = renderMarkdown(md, { theme: 'default', wechatFootnote: true });
  assert.doesNotMatch(withFn.html, /&amp;amp;/, 'URLs and footnotes must never be double-escaped');
  assert.match(withFn.html, /src="https:\/\/example\.com\/pic\.png\?w=800&amp;h=600"/);
  assert.match(withFn.html, /\[1\] A &amp; B: https:\/\/example\.com\/doc\?a=1&amp;b=2/);
  assert.match(withFn.html, /foo__bar__baz/, 'intra-word underscores must not become <strong>');
  assert.doesNotMatch(withFn.html, /<strong[^>]*>bar<\/strong>/);
  assert.match(withFn.html, /\*原义星号\*/);
  assert.match(withFn.html, /data-task="done"/);
  assert.match(withFn.html, /data-task="todo"/);
  assert.match(withFn.html, /<ul[^>]*>[\s\S]*<ul[^>]*>[\s\S]*嵌套子项/);
  assert.match(withFn.html, /text-align: center;/);
  assert.match(withFn.html, /text-align: right;/);

  const noFn = renderMarkdown(md, { theme: 'default', wechatFootnote: false });
  assert.doesNotMatch(noFn.html, /&amp;amp;/);
  assert.match(noFn.html, /href="https:\/\/example\.com\/doc\?a=1&amp;b=2"/);
});

test('MCP stdio server handles fragmented LSP Content-Length frames with UTF-8 Chinese payloads', async () => {
  const child = spawn('node', [path.join(projectRoot, 'bin/mopai-mcp.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const chunks = [];
  child.stdout.on('data', (c) => chunks.push(c));

  const frame = (obj) => {
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
  };

  const f1 = frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  const f2 = frame({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'render_markdown', arguments: { markdown: '# 中文分片测试\n\n内容含中文多字节字符！', theme: 'claude' } },
  });
  const f3 = frame({ jsonrpc: '2.0', id: 3, method: 'unknown/method', params: {} });
  const combined = Buffer.concat([f1, f2, f3]);

  // 故意按 5 字节一小片切碎写入，验证 header 与多字节 UTF-8 跨包重组不损坏
  for (let i = 0; i < combined.length; i += 5) {
    child.stdin.write(combined.subarray(i, i + 5));
    await new Promise((r) => setTimeout(r, 2));
  }
  child.stdin.end();
  await new Promise((resolve) => child.once('exit', resolve));

  let raw = Buffer.concat(chunks);
  const responses = [];
  while (raw.length > 0) {
    const sep = raw.indexOf('\r\n\r\n');
    assert(sep !== -1, 'Expected LSP Content-Length header in response');
    const hdr = raw.subarray(0, sep).toString('ascii');
    const len = Number(hdr.match(/Content-Length:\s*(\d+)/i)[1]);
    const body = raw.subarray(sep + 4, sep + 4 + len).toString('utf8');
    responses.push(JSON.parse(body));
    raw = raw.subarray(sep + 4 + len);
  }

  assert.equal(responses.length, 3);
  assert.equal(responses[0].result.serverInfo.name, 'mopai-markdown');
  const rendered = JSON.parse(responses[1].result.content[0].text);
  assert.equal(rendered.title, '中文分片测试');
  assert.equal(responses[2].error?.code, -32601);
});

test('static assets consistency: CSS variables defined and SW precache covers local scripts/styles', async () => {
  const [css, html, sw] = await Promise.all([
    readFile(path.join(projectRoot, 'css/styles.css'), 'utf8'),
    readFile(path.join(projectRoot, 'index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'service-worker.js'), 'utf8'),
  ]);

  assert.match(css, /:root\s*\{[\s\S]*--hover-bg:/, ':root must define --hover-bg');
  assert.match(css, /\[data-theme="dark"\]\s*\{[\s\S]*--hover-bg:/, 'dark theme must define --hover-bg');

  const localRefs = [...html.matchAll(/(?:src|href)="(css\/[^"?]+|js\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
  assert(localRefs.length >= 8, 'Expected local css/js references in index.html');
  for (const ref of localRefs) {
    assert(sw.includes(`'./${ref}'`), `service-worker.js STATIC_ASSETS should include ./${ref}`);
  }
});

test('media-store pure helpers: GitHub CDN URL, JSON path extraction, headers, secret stripping, and custom upload', async () => {
  await import('../js/media-store.js');
  const media = globalThis.MoPaiMedia;
  assert.equal(
    media.buildGithubUrl({ owner: 'alice', repo: 'pics', branch: 'main', cdnType: 'jsdelivr' }, 'images/a.png'),
    'https://cdn.jsdelivr.net/gh/alice/pics@main/images/a.png'
  );
  assert.equal(
    media.buildGithubUrl({ owner: 'alice', repo: 'pics', branch: 'main', cdnType: 'custom', customDomain: 'https://img.demo.cn/' }, '/a/b.png'),
    'https://img.demo.cn/a/b.png'
  );
  assert.equal(media.extractByPath({ data: { links: [{ url: 'https://cdn.test/1.png' }] } }, 'data.links.0.url'), 'https://cdn.test/1.png');
  assert.deepEqual(
    media.parseHeadersText('# comment\nAuthorization: Bearer abc:123\nX-Custom: ok'),
    { Authorization: 'Bearer abc:123', 'X-Custom': 'ok' }
  );

  const stripped = media.stripConfigSecrets({
    provider: 'github',
    github: { owner: 'alice', repo: 'pics', token: 'ghp_secret' },
    smms: { token: 'smms_secret' },
    custom: { endpoint: 'https://x.test/up', headersText: 'Authorization: Bearer secret' },
  });
  assert.equal(stripped.github.token, '');
  assert.equal(stripped.smms.token, '');
  assert.equal(stripped.custom.headersText, '');
  assert.equal(stripped.github.owner, 'alice');
});

test('xhs-cards semantic paginator and zero-dep standard ZIP builder produce valid output', async () => {
  await import('../js/xhs-cards.js');
  const xhs = globalThis.MoPaiXhsCards;

  const blocks = [
    { html: '<p>p1</p>', h: 120, isHr: false, isHeading: false },
    { html: '<p>p2</p>', h: 100, isHr: false, isHeading: false }, // sum = 220 (> 55% of 300)
    { html: '<h2>Section 2</h2>', h: 40, isHr: false, isHeading: true }, // should break early to new page
    { html: '<hr>', h: 10, isHr: true, isHeading: false }, // manual page break
    {
      html: '<ul><li>1</li><li>2</li><li>3</li></ul>',
      isHr: false,
      isHeading: false,
      listItems: ['<li>item1</li>', '<li>item2</li>', '<li>item3</li>'],
      wrapList: (items) => `<ul>${items.join('')}</ul>`,
    },
  ];
  const pages = xhs.paginateBlocksWithMeasurer(blocks, {
    maxBodyHeight: 300,
    splitByHr: true,
    measureHeight: (items) => items.reduce((sum, b) => {
      if (b.h) return sum + b.h;
      const liCount = (b.html.match(/<li>/g) || []).length;
      return sum + (liCount ? liCount * 140 : 60);
    }, 0),
  });
  // Page 1: p1+p2, Page 2: h2, Page 3: li1+li2 (280<=300), Page 4: li3 (split cleanly)
  assert.equal(pages.length, 4);
  assert.match(pages[1][0].html, /Section 2/);
  assert.match(pages[2][0].html, /item1/);
  assert.match(pages[3][0].html, /item3/);

  // Verify consecutive headings (H2 + H3 + body) never leave an orphaned heading at page bottom
  const consecPages = xhs.paginateBlocksWithMeasurer([
    { html: '<p>intro</p>', h: 150, isHr: false, isHeading: false }, // 50% (< 55%)
    { html: '<h2>Chapter 2</h2>', h: 45, isHr: false, isHeading: true },
    { html: '<h3>Sub 2.1</h3>', h: 40, isHr: false, isHeading: true },
    { html: '<p>Body paragraph</p>', h: 90, isHr: false, isHeading: false }, // 150+45+40+90=325 > 300
  ], {
    maxBodyHeight: 300,
    splitByHr: true,
    measureHeight: (items) => items.reduce((s, b) => s + b.h, 0),
  });
  assert.equal(consecPages.length, 2);
  assert.equal(consecPages[0].length, 1, 'Chapter 2 heading must not be orphaned at bottom of page 1');
  assert.equal(consecPages[1].length, 3, 'H2 + H3 + first body paragraph should move together to page 2');

  // Verify zero-dependency PKZIP archive structure and extractability via system unzip -t
  const zipBytes = xhs.buildZipBytes([
    { name: '01-cover.png', bytes: generateFallbackCoverPng('#4f6ef7', 32, 32) },
    { name: '02-page.txt', bytes: new TextEncoder().encode('你好 MoPai 知识卡片') },
  ]);
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50, 'ZIP should start with local file header signature');

  const dir = await mkdtemp(path.join(tmpdir(), 'mopai-zip-'));
  try {
    const zipPath = path.join(dir, 'cards.zip');
    await writeFile(zipPath, zipBytes);
    const out = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
    assert.match(out, /No errors detected/, 'Generated ZIP must pass standard unzip integrity test');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('wechat-api publishWechatDraft handles token caching, image dedup upload, auto-cover PNG, draft creation, and dryRun', async () => {
  clearTokenCache();
  assert.match(formatWechatError(40164, 'invalid ip'), /IP 白名单/);

  const fallbackPng = generateFallbackCoverPng('#07c160', 900, 383);
  assert.equal(fallbackPng[0], 137);
  assert.equal(fallbackPng[1], 80); // 'P'
  assert.equal(fallbackPng[2], 78); // 'N'
  assert.equal(fallbackPng[3], 71); // 'G'

  const dir = await mkdtemp(path.join(tmpdir(), 'mopai-wx-'));
  try {
    const imgPath = path.join(dir, 'arch.png');
    await writeFile(imgPath, generateFallbackCoverPng('#667eea', 16, 16));
    const mdPath = path.join(dir, 'post.md');
    const md = `---
title: 微信直发测试文章
author: MoPai测试
summary: 自动摘要测试
theme: tech
---

# 微信直发测试文章

本地图：![架构图](arch.png)
重复本地图：![架构图2](arch.png)
已有微信图：![已有](https://mmbiz.qpic.cn/mmbiz_png/already/0)
`;
    await writeFile(mdPath, md, 'utf8');

    // 1. CLI dry-run
    const dryOut = execFileSync('node', [
      path.join(projectRoot, 'bin/mopai.mjs'),
      'publish-wechat', mdPath, '--dry-run', '--json',
    ], { encoding: 'utf8' });
    const dry = JSON.parse(dryOut);
    assert.equal(dry.dryRun, true);
    assert.equal(dry.article.title, '微信直发测试文章');
    assert.equal(dry.theme, 'tech');
    assert.deepEqual(dry.imagesToUpload, ['arch.png']);
    assert.equal(dry.alreadyWechatImages.length, 1);

    // 2. Full publish with mocked WeChat HTTP API
    const calls = [];
    let draftBody = null;
    const mockFetch = async (url, init = {}) => {
      calls.push(String(url));
      if (url.includes('/cgi-bin/stable_token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'mock_tok_123', expires_in: 7200 }) };
      }
      if (url.includes('/cgi-bin/media/uploadimg')) {
        return { ok: true, status: 200, json: async () => ({ url: 'https://mmbiz.qpic.cn/mmbiz_png/uploaded_arch/0' }) };
      }
      if (url.includes('/cgi-bin/material/add_material')) {
        return { ok: true, status: 200, json: async () => ({ media_id: 'cover_media_999', url: 'https://mmbiz.qpic.cn/cover' }) };
      }
      if (url.includes('/cgi-bin/draft/add')) {
        draftBody = JSON.parse(init.body);
        return { ok: true, status: 200, json: async () => ({ media_id: 'draft_media_777' }) };
      }
      throw new Error('Unexpected fetch url: ' + url);
    };

    const res = await publishWechatDraft({
      inputPath: mdPath,
      appId: 'wx_test_app',
      appSecret: 'wx_test_secret',
      fetchImpl: mockFetch,
    });
    assert.equal(res.dryRun, false);
    assert.equal(res.mediaId, 'draft_media_777');
    assert.equal(res.coverMediaId, 'cover_media_999');
    assert.equal(res.uploadedImagesCount, 1, 'Duplicate local image should be uploaded only once');
    assert.equal(draftBody.articles[0].thumb_media_id, 'cover_media_999');
    assert.match(draftBody.articles[0].content, /mmbiz\.qpic\.cn\/mmbiz_png\/uploaded_arch\/0/);
    assert.doesNotMatch(draftBody.articles[0].content, /src="arch\.png"/);

    // 3. Second call reuses cached stable_token + autoCover fallback when article has no images
    const res2 = await publishWechatDraft({
      markdown: '# 无图纯文字文章\n\n测试自动生成封面 PNG。',
      autoCover: true,
      appId: 'wx_test_app',
      appSecret: 'wx_test_secret',
      fetchImpl: mockFetch,
    });
    assert.equal(res2.mediaId, 'draft_media_777');
    assert.equal(calls.filter((u) => u.includes('stable_token')).length, 1, 'stable_token should be cached across calls');

    // 4. MCP publish_wechat_draft dryRun over stdio
    const mcpChild = spawn('node', [path.join(projectRoot, 'bin/mopai-mcp.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
    const mcpLines = [];
    let buf = '';
    mcpChild.stdout.on('data', (c) => {
      buf += c.toString('utf8');
      const parts = buf.split('\n');
      buf = parts.pop();
      for (const l of parts) if (l.trim()) mcpLines.push(JSON.parse(l));
    });
    mcpChild.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'publish_wechat_draft', arguments: { inputPath: mdPath, dryRun: true } },
    }) + '\n');
    mcpChild.stdin.end();
    await new Promise((resolve) => mcpChild.once('exit', resolve));
    const mcpPayload = JSON.parse(mcpLines[0].result.content[0].text);
    assert.equal(mcpPayload.dryRun, true);
    assert.equal(mcpPayload.article.title, '微信直发测试文章');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test('humanizer local audit, code masking, quickClean, prompt builder, and line diff work end-to-end', async () => {
  await import('../js/humanizer.js');
  const h = globalThis.MoPaiHumanizer;

  const heavyAiDoc = [
    '---',
    'title: 综上所述不要扫描frontmatter',
    '---',
    '好的，没问题！以下为您整理的深度解析：',
    '',
    '## 性能优化策略',
    '性能优化策略在当今时代具有深远影响，值得注意的是，这不仅是技术升级，更是全方位赋能业务闭环的核心引擎。',
    '',
    '首先，我们要构建坚实基础。其次，实现提质增效。最后，迈向新台阶，未来可期。',
    '',
    '- **架构升级**：显著提升系统稳定性。',
    '- **体验优化**：极大提升用户满意度。',
    '- **数据驱动**：有效提升转化闭环。',
    '',
    '```js',
    '// 综上所述 赋能 闭环 不可否认 (code block must be ignored)',
    'const msg = "值得注意的是";',
    '```',
    '',
    '希望以上内容对您有所帮助！',
  ].join('\n');

  const heavyReport = h.analyzeAiFlavor(heavyAiDoc);
  assert(heavyReport.score >= 55, `Expected high AI-flavor score >=55, got ${heavyReport.score}`);
  assert(heavyReport.dimensions.cliche_vocab.count >= 4, 'Should detect Chinese AI clichés');
  assert(heavyReport.dimensions.formulaic_syntax.count >= 2, 'Should detect negative parallelism and first/second/last sequence');
  assert(heavyReport.dimensions.chatbot_meta.count >= 2, 'Should detect chatbot opening and closing artifacts');
  assert(heavyReport.dimensions.heading_echo.count >= 1, 'Should detect heading-first-sentence echo');
  assert(heavyReport.dimensions.bold_list_slop.count >= 1, 'Should detect 3+ bold-colon template list items');
  assert(heavyReport.cleanableCount >= 2, 'Should mark chatbot opening/closing as locally cleanable');
  // Ensure fenced code block & frontmatter lines were masked (no issue reported on line 1 or line 15/16)
  assert(!heavyReport.issues.some((it) => it.line === 1 || it.line === 15 || it.line === 16), 'Frontmatter and fenced code must be skipped');

  const cleaned = h.quickCleanLocal(heavyAiDoc);
  assert(cleaned.removed >= 2, 'quickCleanLocal should remove chatbot opening and closing');
  assert(!cleaned.text.includes('希望以上内容对您有所帮助'));

  const naturalDoc = [
    '# 上线三个月，我们关掉了半数报警',
    '',
    '去年十月接手支付对账服务时，值班手机每晚响十几回。大家麻木了，真正出故障反而没人点开看。',
    '',
    '我们花了两周把 43 条阈值报警删到 19 条，只保留跟资金差错和超时率直接挂钩的几项。结果很直接：半夜误报从每周 28 次降到 3 次，平均排查时间缩短了一半。',
  ].join('\n');
  const naturalReport = h.analyzeAiFlavor(naturalDoc);
  assert(naturalReport.score <= 15, `Natural human writing should score <=15, got ${naturalReport.score}`);
  assert.equal(naturalReport.level, 'clean');

  const msgs = h.buildRewriteMessages(heavyAiDoc, 'plainspoken', heavyReport, false);
  assert.equal(msgs.length, 2);
  assert.match(msgs[0].content, /白描干货/);
  assert.match(msgs[0].content, /严守事实/);
  assert.match(msgs[0].content, /标题-首句回声重复/);

  const sanitized = h.sanitizeRewriteOutput('```markdown\n# 改写正文\n\n直接说结果。\n```', heavyAiDoc);
  assert(sanitized.startsWith('---\ntitle: 综上所述不要扫描frontmatter\n---'), 'Frontmatter should be preserved even if model omits it');
  assert(!sanitized.includes('```markdown'));

  const diff = h.computeLineDiff('第一行\n旧句子\n保留行', '第一行\n新句子\n保留行');
  assert.equal(diff.removed, 1);
  assert.equal(diff.added, 1);
  assert.equal(diff.changed, true);

  // Verify late-2026 active-repo rules: bureaucratic verbs, staged run-up, strawman/authority, repeated openings, frozen facts & fidelity check
  const bureaucratDoc = [
    '大家好，下面我来给大家详细汇报一下本周进展。',
    '',
    '在数字化转型的大背景下，我们完成了对重试策略的调整工作，并进行了全面优化。',
    '有人可能会问，这到底有没有用？专家指出，它在系统稳定性中扮演着重要角色。',
    '重复请求从每天 24 次降到了 7 次，如果周五前没有新报错就会合入 https://github.com/demo/repo 。',
    '通过日志分析我们可以定位根因。',
    '通过压测验证我们可以确认容量。',
    '通过灰度发布我们可以降低风险。',
    '以上就是本周的全部进展，感谢大家的关注！',
  ].join('\n');
  const bRep = h.analyzeAiFlavor(bureaucratDoc);
  assert(bRep.dimensions.bureaucratic_verb.count >= 2, 'Should flag bureaucratic 进行+动词 / 完成了对…的工作 / 扮演角色');
  assert(bRep.dimensions.staged_runup.count >= 1, 'Should flag 在…背景下 staged run-up');
  assert(bRep.dimensions.formulaic_syntax.count >= 2, 'Should flag strawman (有人可能会问) and unattributed authority (专家指出)');
  assert(bRep.dimensions.repeated_pattern.count >= 1, 'Should flag 3 consecutive lines starting with 通过');
  assert(bRep.frozenCount >= 3, 'Should freeze numbers (24次/7次), deadline (周五前), and URL');

  const fidelityOk = h.verifyFidelity(bureaucratDoc, '本周我们调了重试策略，重复请求从 24 次降到 7 次，周五前没报错就合入 https://github.com/demo/repo 。');
  assert.equal(fidelityOk.ok, true, 'All frozen facts preserved should pass fidelity check');

  const fidelityMiss = h.verifyFidelity(bureaucratDoc, '本周我们调了重试策略，重复请求大幅下降。');
  assert.equal(fidelityMiss.ok, false, 'Dropping concrete numbers/deadline/URL must trigger fidelity warning');
  assert(fidelityMiss.missing.includes('24次') && fidelityMiss.missing.includes('周五前'));

  const lightMsgs = h.buildRewriteMessages(bureaucratDoc, 'plainspoken', bRep, false, 'light');
  assert.match(lightMsgs[0].content, /冻结事实锚点/);
  assert.match(lightMsgs[0].content, /轻修（in-place）/);
  assert.match(lightMsgs[0].content, /反矫枉过正/);
});


test('docs-store pure helpers and humanizer plain-text extractor for Zhuque work cleanly', async () => {
  await import('../js/docs-store.js');
  await import('../js/humanizer.js');
  const docs = globalThis.MoPaiDocs;
  const h = globalThis.MoPaiHumanizer;

  const sample = [
    '---',
    'title: 支付对账优化复盘',
    '---',
    '# 标题备选',
    '',
    '上周把 **43 条** 报警删到 19 条，见 [工单](https://example.com/1)。',
    '',
    '```js',
    'const ignored = "should not appear in detector plain text";',
    '```',
    '',
    '![截图](https://example.com/a.png)',
    '',
    '- [x] 完成压测验证',
  ].join('\n');

  assert.equal(docs.deriveTitle(sample), '支付对账优化复盘');
  assert.equal(docs.deriveTitle('# 二级测试标题\n\n正文'), '二级测试标题');
  assert.equal(docs.deriveTitle(''), '未命名文稿');

  const d1 = docs.createDocRecord({ id: 'a', content: '# 第一篇\n\n公众号排版', now: 1000 });
  const d2 = docs.createDocRecord({ id: 'b', content: '# 第二篇\n\n小红书知识卡片', now: 2000 });
  const sorted = docs.filterAndSortDocs([d1, d2], '');
  assert.equal(sorted[0].id, 'b');
  const searched = docs.filterAndSortDocs([d1, d2], '小红书');
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, 'b');

  const plain = h.extractPlainTextForDetector(sample);
  assert(!plain.includes('ignored'), 'Fenced code should be stripped before Zhuque detection');
  assert(!plain.includes('https://example.com'), 'Markdown link/image URLs should be stripped');
  assert(!plain.includes('**'), 'Markdown emphasis markers should be stripped');
  assert(plain.includes('43 条') && plain.includes('工单') && plain.includes('完成压测验证'));
});
