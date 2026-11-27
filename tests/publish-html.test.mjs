import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

const projectRoot = path.resolve(import.meta.dirname, '..');

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  }[ext] || 'application/octet-stream';
}

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  server.close();
  await once(server, 'close');
  return address.port;
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(projectRoot, safePath));

    if (!filePath.startsWith(projectRoot)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('Not a file');
      res.writeHead(200, { 'content-type': contentType(filePath) });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, port: server.address().port };
}

async function waitForJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = new Map();

  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    const listeners = events.get(message.method) || [];
    listeners.forEach(listener => listener(message.params));
  });

  return {
    async open() {
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
      });
    },
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    onceEvent(method) {
      return new Promise(resolve => {
        const listener = params => {
          const listeners = events.get(method) || [];
          events.set(method, listeners.filter(item => item !== listener));
          resolve(params);
        };
        events.set(method, [...(events.get(method) || []), listener]);
      });
    },
    close() {
      ws.close();
    },
  };
}

async function main() {
  const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const { server, port: appPort } = await startStaticServer();
  const cdpPort = await getFreePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'mopai-publish-test-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${cdpPort}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'Expected a Chrome page target');

    const cdp = createCdpClient(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const loaded = cdp.onceEvent('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });
    await loaded;

    await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve, reject) => {
          const started = Date.now();
          const timer = setInterval(() => {
            if (document.querySelector('#preview-content h1') && document.querySelector('.export-dropdown-wrapper button')) {
              clearInterval(timer);
              resolve(true);
            } else if (Date.now() - started > 10000) {
              clearInterval(timer);
              reject(new Error('MoPai preview did not render'));
            }
          }, 100);
        })
      `,
      awaitPromise: true,
    });

    const result = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          window.__syncPostPayload = null;
          window.__copiedHtml = null;
          window.syncPost = post => { window.__syncPostPayload = post; };
          window.$syncer = {
            getAccounts: cb => cb([{ type: 'weixin', title: '测试公众号', checked: true }]),
            addTask: () => {},
          };
          Object.defineProperty(navigator, 'clipboard', {
            value: {
              write: async items => {
                const htmlBlob = await items[0].getType('text/html');
                window.__copiedHtml = await htmlBlob.text();
              },
              writeText: async text => { window.__copiedText = text; },
            },
            configurable: true,
          });
          document.querySelector('.export-dropdown-wrapper > button').click();
          await new Promise(resolve => setTimeout(resolve, 50));
          Array.from(document.querySelectorAll('.export-dropdown button'))
            .find(button => button.textContent.includes('分发到多平台'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 300));
          return window.__syncPostPayload;
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const payload = result.result.value;
    assert(payload, 'Expected syncToMultiPlatform to call window.syncPost');
    assert.equal(payload.title, 'MoPai 墨排 V3');
    assert.match(payload.content, /<h1\b[^>]*style=/, 'Heading styles should stay inline');
    assert.match(payload.content, /<pre\b[^>]*style=/, 'Code blocks should stay styled inline');
    assert.doesNotMatch(payload.content, /mac-code-header|mac-dot|mac-code-block/, 'WechatSync HTML should not include Mac code chrome');
    assert.doesNotMatch(payload.content, /box-shadow|display:\s*flex/i, 'WechatSync HTML should avoid fragile decorative layout CSS');

    const publishCardResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          window.__syncPostPayload = null;
          window.__openedUrl = null;
          window.__copiedHtml = null;
          window.__syncTask = null;
          window.__syncStatusSeen = null;
          window.syncPost = post => { window.__syncPostPayload = post; };
          window.open = url => { window.__openedUrl = url; };
          window.$syncer = {
            getAccounts: cb => cb([
              { type: 'weixin', title: '测试公众号', checked: true },
              { type: 'toutiao', title: '测试头条', checked: true },
            ]),
            addTask: (task, statusHandler, cb) => {
              window.__syncTask = task;
              statusHandler({
                accounts: [{
                  type: 'weixin',
                  title: '测试公众号',
                  status: 'done',
                  editResp: { draftLink: 'https://mp.weixin.qq.com/draft/test' },
                }],
              });
              window.__syncStatusSeen = true;
              cb?.({ ok: true });
            },
          };
          Object.defineProperty(navigator, 'clipboard', {
            value: {
              write: async items => {
                const htmlBlob = await items[0].getType('text/html');
                window.__copiedHtml = await htmlBlob.text();
              },
              writeText: async text => { window.__copiedText = text; },
            },
            configurable: true,
          });
          Array.from(document.querySelectorAll('.header-btn'))
            .find(button => button.textContent.includes('发布'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 50));
          Array.from(document.querySelectorAll('.publish-card'))
            .find(card => card.textContent.includes('今日头条'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 700));
          const copiedHtml = window.__copiedHtml;
          Array.from(document.querySelectorAll('.publish-card'))
            .find(card => card.textContent.includes('微信公众号'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 700));
          const statusNode = document.querySelector('.publish-status');
          const gridNode = document.querySelector('.publish-grid');
          return {
            syncPostPayload: window.__syncPostPayload,
            syncTask: window.__syncTask,
            syncStatusSeen: window.__syncStatusSeen,
            openedUrl: window.__openedUrl,
            copiedHtml,
            statusBeforeGrid: Boolean(statusNode && gridNode && (statusNode.compareDocumentPosition(gridNode) & Node.DOCUMENT_POSITION_FOLLOWING)),
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    assert.doesNotMatch(publishCardResult.result.value.copiedHtml, /mac-code-header|mac-dot|mac-code-block/, 'HTML platform cards should copy simplified rich HTML');
    assert.doesNotMatch(publishCardResult.result.value.copiedHtml, /box-shadow|display:\s*flex/i, 'HTML platform cards should avoid fragile decorative layout CSS');
    assert.equal(publishCardResult.result.value.syncPostPayload, null, 'WeChat publish card should not use the legacy SDK modal when $syncer is available');
    assert(publishCardResult.result.value.syncTask, 'WeChat publish card should submit through the injected $syncer bridge');
    assert.equal(publishCardResult.result.value.syncTask.accounts.length, 1);
    assert.equal(publishCardResult.result.value.syncTask.accounts[0].type, 'weixin');
    assert.match(publishCardResult.result.value.syncTask.post.content, /<h1\b[^>]*style=/, 'WeChat direct sync should keep simplified rich HTML');
    assert.doesNotMatch(publishCardResult.result.value.syncTask.post.content, /mac-code-header|mac-dot|mac-code-block/, 'WeChat direct sync should not include Mac code chrome');
    assert.equal(publishCardResult.result.value.syncStatusSeen, true);
    assert.equal(publishCardResult.result.value.openedUrl, 'https://mp.weixin.qq.com/draft/test');
    assert.notEqual(publishCardResult.result.value.openedUrl, 'https://mp.weixin.qq.com/');
    assert.equal(publishCardResult.result.value.statusBeforeGrid, true, 'Publish status should be visible above the platform grid after clicking WeChat');

    const missingBridgeResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          window.__syncPostPayload = null;
          window.__copiedHtml = null;
          delete window.$syncer;
          window.syncPost = post => { window.__syncPostPayload = post; };
          Object.defineProperty(navigator, 'clipboard', {
            value: {
              write: async items => {
                const htmlBlob = await items[0].getType('text/html');
                window.__copiedHtml = await htmlBlob.text();
              },
              writeText: async text => { window.__copiedText = text; },
            },
            configurable: true,
          });
          Array.from(document.querySelectorAll('.publish-card'))
            .find(card => card.textContent.includes('微信公众号'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 1800));
          const status = document.querySelector('.publish-status')?.textContent || '';
          return {
            syncPostPayload: window.__syncPostPayload,
            copiedHtml: window.__copiedHtml,
            status,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    assert.equal(missingBridgeResult.result.value.syncPostPayload, null, 'Missing $syncer should not open the legacy install-extension modal');
    assert.match(missingBridgeResult.result.value.copiedHtml, /<h1\b[^>]*style=/, 'Missing $syncer fallback should copy rich HTML');
    assert.match(missingBridgeResult.result.value.status, /扩展|注入|Chrome/, 'Missing $syncer fallback should explain the browser extension injection problem');

    // Verify new bug fixes in live browser:
    // 1. Multi-paragraph info card + code-block comment skipped in TOC
    // 2. Custom primary color works on non-default themes (e.g. tech)
    // 3. Export PDF no longer injects [object Object] CSS
    // 4. Custom OpenAI Base URL provider is selectable and readies AI without key
    // 5. Cmd+Z inside find input does not hijack editor markdownText
    const fixesResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          const ta = document.querySelector('.editor-textarea');
          const sample = [
            '# 新文章标题',
            '',
            '\`\`\`python',
            '# 代码注释不是标题',
            '\`\`\`',
            '',
            ':::tip 多段卡片',
            '第一段内容',
            '',
            '第二段内容',
            ':::',
            '',
            '## 真正二级标题',
          ].join('\\n');
          ta.value = sample;
          ta.dispatchEvent(new Event('input'));
          await new Promise(r => setTimeout(r, 450));

          // Open TOC
          Array.from(document.querySelectorAll('.header-btn'))
            .find(b => b.textContent.includes('目录')).click();
          await new Promise(r => setTimeout(r, 50));
          const tocTexts = Array.from(document.querySelectorAll('.toc-item')).map(el => el.textContent.trim());

          const previewHtmlBeforeColor = document.querySelector('#preview-content').innerHTML;

          // Switch theme to tech + apply custom color #07c160
          Array.from(document.querySelectorAll('.theme-btn'))
            .find(b => b.textContent.includes('技术风格')).click();
          await new Promise(r => setTimeout(r, 50));
          Array.from(document.querySelectorAll('.header-btn'))
            .find(b => b.textContent.includes('设置')).click();
          await new Promise(r => setTimeout(r, 50));
          const colorInput = document.querySelector('input[type="color"]');
          colorInput.value = '#07c160';
          colorInput.dispatchEvent(new Event('input'));
          await new Promise(r => setTimeout(r, 50));
          const previewHtmlTechColor = document.querySelector('#preview-content').innerHTML;

          // Check custom AI provider Base URL input
          const select = document.querySelector('.settings-panel select');
          select.value = 'custom';
          select.dispatchEvent(new Event('change'));
          await new Promise(r => setTimeout(r, 50));
          const baseInput = document.querySelector('.settings-panel input[placeholder*="Base URL"]');
          const hasCustomBaseInput = Boolean(baseInput);

          // Intercept window.open for exportPdf
          let pdfDocHtml = '';
          window.open = () => ({
            document: {
              write: s => { pdfDocHtml += s; },
              close: () => {},
            },
            focus: () => {},
            print: () => {},
          });
          document.querySelector('.export-dropdown-wrapper > button').click();
          await new Promise(r => setTimeout(r, 50));
          Array.from(document.querySelectorAll('.export-dropdown button'))
            .find(b => b.textContent.includes('导出 PDF')).click();
          await new Promise(r => setTimeout(r, 150));

          // Verify Cmd+Z inside find input does not revert editor content
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true }));
          await new Promise(r => setTimeout(r, 50));
          const findInput = document.querySelector('.find-input');
          findInput.focus();
          findInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
          await new Promise(r => setTimeout(r, 50));
          const editorAfterFindUndo = document.querySelector('.editor-textarea').value;

          return {
            tocTexts,
            hasMultiParaCard: previewHtmlBeforeColor.includes('第一段内容') && previewHtmlBeforeColor.includes('第二段内容') && !previewHtmlBeforeColor.includes(':::tip'),
            techHasCustomColor: previewHtmlTechColor.includes('#07c160') || previewHtmlTechColor.includes('rgb(7, 193, 96)'),
            hasCustomBaseInput,
            pdfDocHtml,
            editorPreserved: editorAfterFindUndo === sample,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const f = fixesResult.result.value;
    assert.deepEqual(f.tocTexts, ['新文章标题', '真正二级标题'], 'TOC should skip # comments inside fenced code blocks');
    assert.equal(f.hasMultiParaCard, true, 'Multi-paragraph :::tip info card should render cleanly');
    assert.equal(f.techHasCustomColor, true, 'Custom primary color should apply to non-default themes like tech');
    assert.equal(f.hasCustomBaseInput, true, 'Custom OpenAI-compatible Base URL input should appear in settings');
    assert.doesNotMatch(f.pdfDocHtml, /\[object Object\]/, 'exportPdf must not emit [object Object] into <style>');
    assert.match(f.pdfDocHtml, /<title>新文章标题<\/title>/, 'exportPdf should use article title');
    assert.equal(f.editorPreserved, true, 'Cmd+Z inside find input must not hijack editor undo');

    // Verify P0 regression fixes in live browser:
    // 1. Dark UI mode keeps light article themes readable (white bg + light scheme)
    // 2. Frontmatter stripped in preview & used for title + GFM task lists + link inner formatting preserved
    // 3. Light code block theme (nyt) preserves light background in simple publish HTML
    // 4. data:image/jpeg is not re-encoded to PNG during publish
    // 5. Right-side panels (AI & Settings) are mutually exclusive, Escape closes panel
    // 6. Theme hover preview renders as fixed overlay outside .theme-bar
    // 7. Find & replace handles $& safely without regex special-replacement corruption
    // 8. Reloading saved draft does not push sampleMarkdown into undo stack
    const p0Result = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          const ta = document.querySelector('.editor-textarea');
          const doc = [
            '---',
            'title: 元数据标题',
            'summary: 测试摘要',
            '---',
            '',
            '正文含 [**加粗链接**](https://example.com/?a=1&b=2) 和 foo。',
            '',
            '- [x] 已完成事项',
            '- [ ] 未完成事项',
            '',
            '\`\`\`js',
            'const x = 1;',
            '\`\`\`',
            '',
            '![jpg图](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==)',
          ].join('\\n');
          ta.value = doc;
          ta.dispatchEvent(new Event('input'));
          await new Promise(r => setTimeout(r, 400));

          // Switch to default light theme + turn ON dark UI mode
          Array.from(document.querySelectorAll('.theme-btn'))
            .find(b => b.textContent.includes('默认公众号')).click();
          await new Promise(r => setTimeout(r, 50));
          const darkBtn = Array.from(document.querySelectorAll('.header-btn'))
            .find(b => b.textContent.includes('主题'));
          if (document.documentElement.getAttribute('data-theme') !== 'dark') darkBtn.click();
          await new Promise(r => setTimeout(r, 60));

          const previewEl = document.getElementById('preview-content');
          const previewSchemeInDarkUi = previewEl.getAttribute('data-preview-scheme');
          const previewBgInDarkUi = getComputedStyle(previewEl).backgroundColor;
          const previewHtml = previewEl.innerHTML;

          // Switch to nyt (light code block) and test simplified publish HTML
          Array.from(document.querySelectorAll('.theme-btn'))
            .find(b => b.textContent.includes('纽约时报')).click();
          await new Promise(r => setTimeout(r, 80));
          const nytCodeTheme = previewEl.getAttribute('data-code-theme');
          const nytSimpleHtml = await window.MoPaiPublishUtils.prepareHtml(previewEl, { simple: true, imageToBase64: async () => 'SHOULD_NOT_RUN' });

          // Hover another theme button to verify fixed tooltip renders outside .theme-bar
          const techWrapper = Array.from(document.querySelectorAll('.theme-btn-wrapper'))
            .find(w => w.textContent.includes('技术风格'));
          techWrapper.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
          await new Promise(r => setTimeout(r, 380));
          const tooltip = document.querySelector('.theme-preview-tooltip');
          const tooltipFixed = Boolean(tooltip && getComputedStyle(tooltip).position === 'fixed' && !tooltip.closest('.theme-bar'));
          techWrapper.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));

          // Ensure earlier find bar is closed before testing panel mutual exclusion & Escape
          const findClose = document.querySelector('.find-replace-bar .close-btn');
          if (findClose) findClose.click();
          await new Promise(r => setTimeout(r, 30));

          // Panel mutual exclusion (open AI then Settings -> AI closes) + Escape closes modal first, then Settings
          const aiBtn = Array.from(document.querySelectorAll('.header-btn')).find(b => b.textContent.includes('AI'));
          const settingsBtn = Array.from(document.querySelectorAll('.header-btn')).find(b => b.textContent.includes('设置'));
          if (!document.querySelector('.ai-panel')) aiBtn.click();
          await new Promise(r => setTimeout(r, 40));
          if (!document.querySelector('.settings-panel')) settingsBtn.click();
          await new Promise(r => setTimeout(r, 40));
          const panelMutualExclusive = Boolean(document.querySelector('.settings-panel') && !document.querySelector('.ai-panel'));
          // Earlier test left publish modal open; first Escape dismisses top modal, second Escape dismisses Settings panel
          if (document.querySelector('.modal-overlay')) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await new Promise(r => setTimeout(r, 40));
          }
          const escapeClosedModal = !document.querySelector('.modal-overlay');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await new Promise(r => setTimeout(r, 40));
          const escapeClosedSettings = !document.querySelector('.settings-panel');

          // Test find & replace with $& literal
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true }));
          await new Promise(r => setTimeout(r, 40));
          const findInput = document.querySelector('.find-input');
          const replaceInput = document.querySelector('.find-replace-bar input[placeholder*="替换"]');
          findInput.value = 'foo';
          findInput.dispatchEvent(new Event('input'));
          replaceInput.value = '$&bar';
          replaceInput.dispatchEvent(new Event('input'));
          await new Promise(r => setTimeout(r, 40));
          Array.from(document.querySelectorAll('.find-replace-bar button')).find(b => b.textContent.trim() === '全部').click();
          await new Promise(r => setTimeout(r, 40));
          const literalDollarReplaced = document.querySelector('.editor-textarea').value.includes('$&bar');

          // Persist draft for reload undo-stack test
          localStorage.setItem('md-converter-draft', '# 持久化草稿标题\\n\\n保留内容');

          return {
            previewSchemeInDarkUi,
            previewBgInDarkUi,
            frontmatterHidden: !previewHtml.includes('title: 元数据标题') && !previewHtml.includes('summary: 测试摘要'),
            hasTaskDone: previewHtml.includes('data-task="done"'),
            hasTaskTodo: previewHtml.includes('data-task="todo"'),
            footnoteKeptBold: /<span[^>]*><strong[^>]*>加粗链接<\\/strong><sup/.test(previewHtml),
            nytCodeTheme,
            nytKeptLightCodeBg: /background:\\s*#f7f7f7/i.test(nytSimpleHtml),
            jpegPreserved: nytSimpleHtml.includes('data:image/jpeg;base64,'),
            tooltipFixed,
            panelMutualExclusive,
            escapeClosedModal,
            escapeClosedSettings,
            literalDollarReplaced,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    assert(!p0Result.exceptionDetails, `p0Result evaluate failed: ${JSON.stringify(p0Result.exceptionDetails)}`);
    const p0 = p0Result.result.value;
    assert.equal(p0.previewSchemeInDarkUi, 'light', 'Light article theme must stay light scheme even in dark UI mode');
    assert.equal(p0.previewBgInDarkUi, 'rgb(255, 255, 255)', 'Light article theme preview bg must stay white in dark UI mode');
    assert.equal(p0.frontmatterHidden, true, 'YAML frontmatter should be stripped from preview');
    assert.equal(p0.hasTaskDone, true, 'GFM checked task item should render');
    assert.equal(p0.hasTaskTodo, true, 'GFM unchecked task item should render');
    assert.equal(p0.footnoteKeptBold, true, 'WeChat footnote conversion should preserve inline formatting inside links');
    assert.equal(p0.nytCodeTheme, 'light', 'NYT theme should activate light code syntax highlighting');
    assert.equal(p0.nytKeptLightCodeBg, true, 'Simplified publish HTML should keep light code block background for NYT');
    assert.equal(p0.jpegPreserved, true, 'data:image/jpeg should not be re-encoded to PNG');
    assert.equal(p0.tooltipFixed, true, 'Theme hover preview tooltip should render fixed outside .theme-bar');
    assert.equal(p0.panelMutualExclusive, true, 'Opening Settings should close AI panel');
    assert.equal(p0.escapeClosedModal, true, 'First Escape should close open top modal overlay');
    assert.equal(p0.escapeClosedSettings, true, 'Second Escape should close open Settings panel');
    assert.equal(p0.literalDollarReplaced, true, 'Replace all should treat $& literally');

    // Reload page and verify Cmd+Z on a loaded local draft does NOT revert to sampleMarkdown
    const reloaded = cdp.onceEvent('Page.loadEventFired');
    await cdp.send('Page.reload');
    await reloaded;
    await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve, reject) => {
          const started = Date.now();
          const timer = setInterval(() => {
            const ta = document.querySelector('.editor-textarea');
            if (ta && ta.value.includes('持久化草稿标题')) {
              clearInterval(timer);
              resolve(true);
            } else if (Date.now() - started > 10000) {
              clearInterval(timer);
              reject(new Error('Reloaded draft did not render'));
            }
          }, 80);
        })
      `,
      awaitPromise: true,
    });
    const reloadUndoResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          const ta = document.querySelector('.editor-textarea');
          ta.focus();
          ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
          await new Promise(r => setTimeout(r, 80));
          return ta.value;
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.equal(reloadUndoResult.result.value, '# 持久化草稿标题\n\n保留内容', 'Cmd+Z immediately after loading saved draft must not revert to sampleMarkdown');

    // Verify new major features in live Chrome:
    // 1. IndexedDB local image library + multi-host media manager tabs (local / remote / config)
    // 2. 3:4 Xiaohongshu auto-paginated knowledge cards studio (<dialog>, style switch, ratio switch, ZIP build)
    const featureResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          // Seed a real PNG into IndexedDB via MoPaiMedia
          const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          await window.MoPaiMedia.putLocalImage({
            id: 'img_idb_test_1',
            name: 'idb-demo.png',
            mime: 'image/png',
            dataUrl: tinyPng,
            size: 68,
            createdAt: Date.now(),
          });

          // Open media manager and inspect tabs
          Array.from(document.querySelectorAll('.header-btn')).find(b => b.textContent.includes('图床')).click();
          await new Promise(r => setTimeout(r, 120));
          const hasIdbImageCard = Boolean(document.querySelector('.media-local-card') && document.body.textContent.includes('idb-demo.png'));
          document.getElementById('media-tab-config').click();
          await new Promise(r => setTimeout(r, 50));
          const providerSelect = document.querySelector('.media-select');
          providerSelect.value = 'github';
          providerSelect.dispatchEvent(new Event('change'));
          await new Promise(r => setTimeout(r, 50));
          const hasGithubForm = Boolean(document.querySelector('input[placeholder*="ghp_xxx"]'));
          // Close media modal
          document.querySelector('.modal-overlay .close-btn').click();
          await new Promise(r => setTimeout(r, 40));

          // Write a multi-section article and launch Xiaohongshu 3:4 Knowledge Card Studio
          const ta = document.querySelector('.editor-textarea');
          ta.value = [
            '# 小红书干货卡片测试',
            '',
            '这是一段精炼导语，测试自动封面提取能力。',
            '',
            '## 第一章 核心思路',
            '',
            '第一页内容段落，介绍 MoPai 语义分页算法。',
            '',
            '---',
            '',
            '## 第二章 落地方法',
            '',
            '- 要点一：智能分页不截断文字',
            '- 要点二：纯前端零依赖打包 ZIP',
          ].join('\\n');
          ta.dispatchEvent(new Event('input'));
          await new Promise(r => setTimeout(r, 400));

          document.querySelector('.export-dropdown-wrapper > button').click();
          await new Promise(r => setTimeout(r, 40));
          Array.from(document.querySelectorAll('.export-dropdown button'))
            .find(b => b.textContent.includes('小红书知识卡片')).click();
          await new Promise(r => setTimeout(r, 120));

          const dlg = document.querySelector('dialog.native-modal');
          const dlgOpen = Boolean(dlg && dlg.open);
          const cardCount34 = document.querySelectorAll('.xhs-card-stage').length;
          const firstFrame = document.querySelector('.xhs-card-frame');
          const firstFrameHeight34 = firstFrame?.style.height;
          const firstFrameDisplay = firstFrame ? getComputedStyle(firstFrame).display : '';
          const innerCardHeight34 = firstFrame?.firstElementChild ? Math.round(firstFrame.firstElementChild.getBoundingClientRect().height) : 0;

          // Switch to 1:1 ratio and aurora_glass style
          Array.from(document.querySelectorAll('.xhs-style-pill'))
            .find(b => b.textContent.includes('渐变玻璃')).click();
          Array.from(document.querySelectorAll('.xhs-style-pill'))
            .find(b => b.textContent.includes('1:1')).click();
          await new Promise(r => setTimeout(r, 80));
          const firstFrameHeight11 = document.querySelector('.xhs-card-frame')?.style.height;

          // Verify zero-dep ZIP builder works in browser context
          const zipBlob = window.MoPaiXhsCards.buildZipBlob([
            { name: '01-cover.png', bytes: window.MoPaiXhsCards.dataUrlToUint8Array(tinyPng) },
          ]);
          const zipSize = zipBlob.size;

          // Close native <dialog>
          dlg.querySelector('.close-btn').click();
          await new Promise(r => setTimeout(r, 40));
          const dlgClosed = !dlg.open;

          return {
            hasIdbImageCard,
            hasGithubForm,
            dlgOpen,
            cardCount34,
            firstFrameHeight34,
            firstFrameDisplay,
            innerCardHeight34,
            firstFrameHeight11,
            zipSize,
            dlgClosed,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    assert(!featureResult.exceptionDetails, `featureResult failed: ${JSON.stringify(featureResult.exceptionDetails)}`);
    const feat = featureResult.result.value;
    assert.equal(feat.hasIdbImageCard, true, 'IndexedDB image should render in local library tab');
    assert.equal(feat.hasGithubForm, true, 'Switching provider to GitHub should display repo/PAT configuration form');
    assert.equal(feat.dlgOpen, true, 'Xiaohongshu studio should open as native modal <dialog>');
    assert(feat.cardCount34 >= 3, `Expected >= 3 auto-paginated cards (cover + HR split), got ${feat.cardCount34}`);
    assert.equal(feat.firstFrameHeight34, '480px', '3:4 card preview frame should be 360x480');
    assert.equal(feat.firstFrameDisplay, 'flex', 'Card frame display:flex must not be truncated by quotes in font-family');
    assert(feat.innerCardHeight34 >= 430, `Inner white card should stretch full height (~452px), got ${feat.innerCardHeight34}`);
    assert.equal(feat.firstFrameHeight11, '360px', '1:1 card preview frame should be 360x360');
    assert(feat.zipSize > 100, 'Browser ZIP builder should emit valid non-empty archive');
    assert.equal(feat.dlgClosed, true, 'Closing native <dialog> should reset open state');

    // Verify targeted mobile (375x812) optimizations:
    // - No horizontal page overflow, mobile bottom bar visible with >=44px touch height
    // - Editor textarea >=16px to prevent iOS Safari focus zoom
    // - Desktop-only 375px simulator / focus buttons hidden on mobile header
    // - Settings mobile header close button visible; TOC / Settings / AI mutually exclusive
    // - Clicking TOC heading on mobile auto-closes TOC
    // - Publish modal renders as 1-column bottom sheet; export dropdown stays inside 375px viewport
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    const mobileResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          await new Promise(r => setTimeout(r, 80));
          const docOverflow = document.documentElement.scrollWidth - window.innerWidth;
          const tabBarDisplay = getComputedStyle(document.querySelector('.mobile-tab-bar')).display;
          const bottomBar = document.querySelector('.mobile-bottom-bar');
          const bottomBarDisplay = getComputedStyle(bottomBar).display;
          const primaryBtnHeight = bottomBar.querySelector('.mobile-bottom-primary').getBoundingClientRect().height;
          const hiddenDesktopBtns = document.querySelectorAll('.header .mobile-hide-btn').length;
          const hiddenDesktopBtnsHidden = Array.from(document.querySelectorAll('.header .mobile-hide-btn'))
            .every(el => getComputedStyle(el).display === 'none');
          const editorFontSize = parseFloat(getComputedStyle(document.querySelector('.editor-textarea')).fontSize);

          // Open Settings -> should show mobile header with close button and close when TOC opens
          Array.from(document.querySelectorAll('.header-btn')).find(b => b.textContent.includes('设置')).click();
          await new Promise(r => setTimeout(r, 60));
          const settingsMobileHeaderDisplay = getComputedStyle(document.querySelector('.settings-mobile-header')).display;
          Array.from(document.querySelectorAll('.header-btn')).find(b => b.textContent.includes('目录')).click();
          await new Promise(r => setTimeout(r, 60));
          const settingsClosedByToc = !document.querySelector('.settings-panel');
          const tocItem = document.querySelector('.toc-item');
          if (tocItem) tocItem.click();
          await new Promise(r => setTimeout(r, 60));
          const tocClosedAfterJump = !document.querySelector('.toc-panel');

          // Switch to preview tab and check export dropdown stays within 375px viewport
          Array.from(document.querySelectorAll('.mobile-tab')).find(b => b.textContent.includes('预览')).click();
          await new Promise(r => setTimeout(r, 60));
          document.querySelector('.export-dropdown-wrapper > button').click();
          await new Promise(r => setTimeout(r, 60));
          const dropRect = document.querySelector('.export-dropdown').getBoundingClientRect();
          document.querySelector('.export-dropdown-wrapper > button').click();

          // Open Publish modal -> should be single-column bottom sheet anchored to bottom (wait for 0.3s slideUp)
          Array.from(document.querySelectorAll('.header-btn')).find(b => b.textContent.includes('发布')).click();
          await new Promise(r => setTimeout(r, 380));
          const publishGridCols = getComputedStyle(document.querySelector('.publish-grid')).gridTemplateColumns.split(' ').length;
          const overlayAlign = getComputedStyle(document.querySelector('.modal-overlay')).alignItems;
          const modalRect = document.querySelector('.modal').getBoundingClientRect();
          document.querySelector('.modal .close-btn').click();
          await new Promise(r => setTimeout(r, 50));

          return {
            docOverflow,
            tabBarDisplay,
            bottomBarDisplay,
            primaryBtnHeight,
            hiddenDesktopBtns,
            hiddenDesktopBtnsHidden,
            editorFontSize,
            settingsMobileHeaderDisplay,
            settingsClosedByToc,
            tocClosedAfterJump,
            dropInBounds: dropRect.left >= 0 && dropRect.right <= 375.5,
            publishGridCols,
            overlayAlign,
            modalBottom: Math.round(modalRect.bottom),
            viewportH: window.innerHeight,
            modalBottomAnchored: ['flex-end', 'end', 'flow-end'].includes(overlayAlign) && Math.abs(modalRect.bottom - window.innerHeight) <= 2,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    assert(!mobileResult.exceptionDetails, `mobileResult failed: ${JSON.stringify(mobileResult.exceptionDetails)}`);
    const mob = mobileResult.result.value;
    assert(mob.docOverflow <= 1, `Mobile 375px viewport should not overflow horizontally, got +${mob.docOverflow}px`);
    assert.equal(mob.tabBarDisplay, 'flex', 'Mobile tab bar should be visible at 375px');
    assert.equal(mob.bottomBarDisplay, 'flex', 'Mobile bottom quick-action bar should be visible at 375px');
    assert(mob.primaryBtnHeight >= 44, `Primary mobile CTA height should be >=44px, got ${mob.primaryBtnHeight}`);
    assert.equal(mob.hiddenDesktopBtns, 2, 'Two desktop-only buttons (手机模拟器/专注) should be marked mobile-hide-btn');
    assert.equal(mob.hiddenDesktopBtnsHidden, true, 'Desktop-only header buttons should be hidden on mobile');
    assert(mob.editorFontSize >= 16, `Mobile editor textarea font-size must be >=16px to prevent iOS zoom, got ${mob.editorFontSize}`);
    assert.equal(mob.settingsMobileHeaderDisplay, 'flex', 'Mobile settings panel should render sticky header with close button');
    assert.equal(mob.settingsClosedByToc, true, 'Opening TOC on mobile should close full-screen Settings drawer');
    assert.equal(mob.tocClosedAfterJump, true, 'Clicking a TOC heading on mobile should auto-close TOC drawer');
    assert.equal(mob.dropInBounds, true, 'Export dropdown should remain strictly within 375px viewport');
    assert.equal(mob.publishGridCols, 1, 'Publish platform grid should collapse to 1 column on mobile');
    assert.equal(mob.modalBottomAnchored, true, `Mobile modals should anchor to bottom as bottom sheets: ${JSON.stringify(mob)}`);

    // Verify AI-flavor local audit, local quick-clean, and mocked streaming rewrite + Diff + Apply + Undo
    const humanizeResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          const ta = document.querySelector('.editor-textarea');
          const aiDoc = [
            '好的，没问题！以下为您梳理：',
            '',
            '## 效率提升',
            '效率提升在当今时代至关重要，值得注意的是，这不仅是工具革新，更是全面赋能业务闭环的核心引擎。',
            '',
            '希望以上内容对您有所帮助！',
          ].join('\\n');
          ta.value = aiDoc;
          ta.dispatchEvent(new Event('input'));
          await new Promise(r => setTimeout(r, 260));

          // Click "去AI味" button in editor header
          Array.from(document.querySelectorAll('.editor-action-btn')).find(b => b.textContent.includes('去AI味')).click();
          await new Promise(r => setTimeout(r, 80));

          const scoreBefore = Number(document.querySelector('progress.progress-ring')?.getAttribute('value') || '0');
          const issueCountBefore = document.querySelectorAll('.humanize-issue-item').length;
          const cleanBtn = document.querySelector('.humanize-clean-btn');
          const hasCleanBtn = Boolean(cleanBtn);
          if (cleanBtn) cleanBtn.click();
          await new Promise(r => setTimeout(r, 80));
          const afterCleanDoc = document.querySelector('.editor-textarea').value;
          const cleanedOk = !afterCleanDoc.includes('希望以上内容对您有所帮助');

          // Configure custom AI base URL and mock aiClient.chatStream to test streaming rewrite -> Diff -> Apply -> Undo
          window.aiClient.chatStream = async ({ onDelta }) => {
            const rewritten = '## 效率提升\\n\\n改用批处理后，单次渲染耗时从 180ms 降到 35ms，团队每天少等半小时。';
            onDelta(rewritten);
            return { text: rewritten, toolCalls: [] };
          };
          // Ensure custom baseUrl makes aiReady true
          Array.from(document.querySelectorAll('.header-btn')).find(b => b.textContent.includes('设置')).click();
          await new Promise(r => setTimeout(r, 50));
          const sel = document.querySelector('.settings-panel select');
          sel.value = 'custom';
          sel.dispatchEvent(new Event('change'));
          await new Promise(r => setTimeout(r, 50));
          const baseInput = document.querySelector('.settings-panel input[placeholder*="Base URL"]');
          baseInput.value = 'http://localhost:11434/v1';
          baseInput.dispatchEvent(new Event('input'));
          await new Promise(r => setTimeout(r, 50));

          // Re-open 去AI味 panel and run rewrite
          Array.from(document.querySelectorAll('.editor-action-btn')).find(b => b.textContent.includes('去AI味')).click();
          await new Promise(r => setTimeout(r, 80));
          document.querySelector('.humanize-run-row button').click();
          await new Promise(r => setTimeout(r, 120));

          const hasProposal = Boolean(document.querySelector('.humanize-proposal-card'));
          const diffDelRows = document.querySelectorAll('.diff-row.del').length;
          const diffAddRows = document.querySelectorAll('.diff-row.add').length;
          const deltaText = document.querySelector('.humanize-score-delta')?.textContent?.trim() || '';

          // Apply rewrite
          Array.from(document.querySelectorAll('.humanize-proposal-actions button')).find(b => b.textContent.includes('应用改写')).click();
          await new Promise(r => setTimeout(r, 80));
          const appliedDoc = document.querySelector('.editor-textarea').value;
          const scoreAfterApply = Number(document.querySelector('progress.progress-ring')?.getAttribute('value') || '0');

          // Undo rewrite
          Array.from(document.querySelectorAll('.humanize-proposal-actions button')).find(b => b.textContent.includes('撤销改写')).click();
          await new Promise(r => setTimeout(r, 80));
          const undoneDoc = document.querySelector('.editor-textarea').value;

          return {
            scoreBefore,
            issueCountBefore,
            hasCleanBtn,
            cleanedOk,
            hasProposal,
            diffDelRows,
            diffAddRows,
            deltaText,
            appliedOk: appliedDoc.includes('180ms 降到 35ms'),
            scoreAfterApply,
            undoneOk: undoneDoc === afterCleanDoc,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    assert(!humanizeResult.exceptionDetails, `humanizeResult failed: ${JSON.stringify(humanizeResult.exceptionDetails)}`);
    const hum = humanizeResult.result.value;
    assert(hum.scoreBefore >= 40, `Expected high initial AI score >=40, got ${hum.scoreBefore}`);
    assert(hum.issueCountBefore >= 3, `Expected >=3 local findings, got ${hum.issueCountBefore}`);
    assert.equal(hum.hasCleanBtn, true, 'Cleanable chatbot residue should display quick-clean button');
    assert.equal(hum.cleanedOk, true, 'Local quick-clean should strip chatbot closing line');
    assert.equal(hum.hasProposal, true, 'Streaming rewrite should produce Diff proposal card');
    assert(hum.diffDelRows >= 1 && hum.diffAddRows >= 1, 'Diff card should render both removed and added lines');
    assert.equal(hum.appliedOk, true, 'Applying proposal should update editor markdown');
    assert(hum.scoreAfterApply < hum.scoreBefore, `Score should drop after humanizing (${hum.scoreBefore} -> ${hum.scoreAfterApply})`);
    assert.equal(hum.undoneOk, true, 'Undoing proposal should restore exact pre-apply document');

    // Verify Zhuque zero-Key quick test, selection floating bar, and IndexedDB multi-doc drafts
    const wrapUpResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          // 1. Test Zhuque zero-Key copy + open
          let zhuqueUrl = '';
          let zhuqueCopied = '';
          window.open = (url) => { zhuqueUrl = url; return {}; };
          Object.defineProperty(navigator, 'clipboard', {
            value: {
              writeText: async (text) => { zhuqueCopied = text; },
            },
            configurable: true,
          });
          document.querySelector('.humanize-zhuque-btn').click();
          await new Promise(r => setTimeout(r, 80));

          // Close AI panel so we can test editor selection floating bar + multi-doc modal cleanly
          document.querySelector('.ai-panel .close-btn')?.click();
          await new Promise(r => setTimeout(r, 50));

          // 2. Test floating selection toolbar on editor text selection
          const ta = document.querySelector('.editor-textarea');
          ta.focus();
          ta.setSelectionRange(0, 12);
          ta.dispatchEvent(new Event('select', { bubbles: true }));
          await new Promise(r => setTimeout(r, 60));
          const floatBarVisible = Boolean(document.querySelector('.selection-float-bar'));

          // 3. Test IndexedDB multi-doc switcher: open -> create new doc -> switch back
          const docBeforeNew = ta.value;
          document.querySelector('.doc-switcher-btn').click();
          await new Promise(r => setTimeout(r, 120));
          const docsModalOpen = Boolean(document.querySelector('.docs-list'));
          Array.from(document.querySelectorAll('.docs-toolbar button')).find(b => b.textContent.includes('新建文稿')).click();
          await new Promise(r => setTimeout(r, 150));
          const newDocContent = document.querySelector('.editor-textarea').value;

          // Open docs modal again and verify >=2 docs exist, then switch back to previous doc
          document.querySelector('.doc-switcher-btn').click();
          await new Promise(r => setTimeout(r, 120));
          const docItems = Array.from(document.querySelectorAll('.doc-item'));
          const docCount = docItems.length;
          const prevItem = docItems.find(el => !el.classList.contains('active'));
          if (prevItem) prevItem.click();
          await new Promise(r => setTimeout(r, 120));
          const restoredDocContent = document.querySelector('.editor-textarea').value;

          return {
            zhuqueUrl,
            zhuqueCopiedClean: Boolean(zhuqueCopied && !zhuqueCopied.includes('##')),
            floatBarVisible,
            docsModalOpen,
            newDocStartsHeading: newDocContent.startsWith('# 新文章'),
            docCount,
            switchedBackOk: restoredDocContent === docBeforeNew,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    assert(!wrapUpResult.exceptionDetails, `wrapUpResult failed: ${JSON.stringify(wrapUpResult.exceptionDetails)}`);
    const wu = wrapUpResult.result.value;
    assert.equal(wu.zhuqueUrl, 'https://matrix.tencent.com/ai-detect/', 'Zhuque button should open official Zhuque AI detect URL');
    assert.equal(wu.zhuqueCopiedClean, true, 'Zhuque button should copy Markdown-stripped plain prose');
    assert.equal(wu.floatBarVisible, true, 'Selecting text in editor should reveal floating quick-action bar');
    assert.equal(wu.docsModalOpen, true, 'Clicking doc switcher should open multi-doc drafts modal');
    assert.equal(wu.newDocStartsHeading, true, 'Creating a new doc should initialize a blank template');
    assert(wu.docCount >= 2, `Expected >=2 docs in IndexedDB drafts after creating new doc, got ${wu.docCount}`);
    assert.equal(wu.switchedBackOk, true, 'Switching back to previous doc should restore its exact Markdown content');

    cdp.close();
  } finally {
    chrome.kill('SIGTERM');
    await Promise.race([
      once(chrome, 'exit'),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
    server.close();
    await new Promise(resolve => server.once('close', resolve));
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
