import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractOutline, listThemes, renderMarkdown, stripFrontmatter } from '../lib/renderer.mjs';

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
    ['extract_outline', 'format_file', 'list_themes', 'render_markdown']
  );
  const rendered = JSON.parse(responses[2].result.content[0].text);
  assert.equal(rendered.title, 'MCP 排版');
  assert.equal(rendered.color, '#10b981');
  assert.match(rendered.html, /参考资料/);
  const themeItems = JSON.parse(responses[3].result.content[0].text);
  assert.equal(themeItems.length, 13);
});
