// ============================================
// MoPai 墨排 — 无依赖 Node 渲染核心（复用 js/themes.js）
// 供 CLI (bin/mopai.mjs) 与 MCP Server (bin/mopai-mcp.mjs) 共享
// ============================================
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadThemesFromSource() {
  const src = readFileSync(resolve(rootDir, 'js/themes.js'), 'utf8');
  const sandbox = { globalThis: {} };
  vm.runInNewContext(src, sandbox, { filename: 'js/themes.js' });
  const exported = sandbox.globalThis.MoPaiThemes;
  if (!exported || !exported.themes) {
    throw new Error('Failed to load themes from js/themes.js');
  }
  return exported;
}

const { themes, colorPresets } = loadThemesFromSource();

const FONT_MAP = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", sans-serif',
  serif: '"Georgia", "Noto Serif SC", "Source Han Serif SC", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, "PingFang SC", monospace',
};

const INFO_CARD_COLORS = {
  info: { bg: '#eef6ff', border: '#3b82f6', icon: 'ℹ️', color: '#1e40af' },
  warning: { bg: '#fff8e6', border: '#f59e0b', icon: '⚠️', color: '#92400e' },
  tip: { bg: '#ecfdf5', border: '#10b981', icon: '💡', color: '#065f46' },
  danger: { bg: '#fef2f2', border: '#ef4444', icon: '🚫', color: '#991b1b' },
};

const SIMPLE_STYLE_ALLOWLIST = new Set([
  'background', 'background-color', 'border', 'border-left', 'border-right',
  'border-top', 'border-bottom', 'border-collapse', 'color', 'font-family',
  'font-size', 'font-style', 'font-weight', 'height', 'letter-spacing',
  'line-height', 'margin', 'margin-bottom', 'margin-left', 'margin-right',
  'margin-top', 'max-width', 'padding', 'padding-bottom', 'padding-left',
  'padding-right', 'padding-top', 'text-align', 'text-decoration',
  'vertical-align', 'width',
]);

export function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[ch]));
}

export function stripFrontmatter(markdown) {
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

export function extractOutline(markdown) {
  const { body, frontmatter } = stripFrontmatter(markdown);
  const lines = body.split(/\r?\n/);
  const headings = [];
  const images = [];
  const links = [];
  let fence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { ch: marker[0], len: marker.length };
      else if (marker[0] === fence.ch && marker.length >= fence.len && trimmed === marker) fence = null;
      continue;
    }
    if (fence) continue;

    const h = line.match(/^(#{1,6})\s+(.+)/);
    if (h) {
      headings.push({
        level: h[1].length,
        text: h[2].replace(/[*`~]/g, '').trim(),
        line: i + 1,
      });
    }
    for (const im of line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
      images.push({ alt: im[1], url: im[2], line: i + 1 });
    }
    for (const lk of line.matchAll(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      links.push({ text: lk[1], url: lk[2], line: i + 1 });
    }
  }

  const trimmedBody = body.trim();
  const chinese = (trimmedBody.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (trimmedBody.replace(/[\u4e00-\u9fa5]/g, ' ').match(/\b[a-zA-Z]+\b/g) || []).length;
  const wordCount = chinese + english;
  const h1 = headings.find((h) => h.level === 1);
  const title = frontmatter.title || h1?.text || 'MoPai 文章';

  return {
    title,
    frontmatter,
    charCount: body.length,
    wordCount,
    readingTimeMinutes: wordCount ? Math.ceil(wordCount / 300) : 0,
    headings,
    images,
    links,
  };
}

function filterSimpleStyle(styleText) {
  return String(styleText || '')
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((r) => SIMPLE_STYLE_ALLOWLIST.has(r.split(':')[0]?.trim().toLowerCase()))
    .join('; ');
}

function resolveStyle(raw, primary, primaryBg, simple) {
  const s = String(raw || '')
    .replace(/\{\{PRIMARY\}\}/g, primary)
    .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg)
    .replace(/"/g, "'");
  return simple ? filterSimpleStyle(s) : s;
}

function safeHref(url) {
  const u = String(url || '').trim();
  if (/^(javascript|vbscript|data):/i.test(u)) return '#';
  return u;
}

export function listThemes() {
  return Object.entries(themes).map(([id, t]) => ({
    id,
    name: t.name,
    emoji: t.emoji,
    desc: t.desc,
    category: t.category,
    accent: t.accent || '#4f6ef7',
    bg: t.bg || '#ffffff',
    isDark: Boolean(t.isDark),
  }));
}

export function renderMarkdown(markdown, options = {}) {
  const themeId = options.theme || 'default';
  const themeObj = themes[themeId];
  if (!themeObj) {
    throw new Error(`Unknown theme "${themeId}". Available: ${Object.keys(themes).join(', ')}`);
  }

  const fontFamily = options.fontFamily || 'sans';
  const fontSize = Number(options.fontSize || 16);
  const wechatFootnote = options.wechatFootnote !== false;
  const macCodeBlock = options.macCodeBlock !== false && !options.simple;
  const simple = Boolean(options.simple);
  const doStripFm = options.stripFrontmatter !== false;

  const primary = options.color && /^#[0-9a-fA-F]{6}$/.test(options.color)
    ? options.color
    : (themeObj.accent || '#4f6ef7');
  const primaryBg = primary + '14';
  const styles = themeObj.styles;

  const st = (key) => resolveStyle(styles[key], primary, primaryBg, simple);
  const { body: sourceText, frontmatter } = doStripFm
    ? stripFrontmatter(markdown)
    : { body: String(markdown || ''), frontmatter: {} };

  const footnotes = [];
  const renderInline = (raw) => {
    // Protect inline code spans first
    const codeSlots = [];
    let s = String(raw || '').replace(/`([^`]+)`/g, (_, code) => {
      const idx = codeSlots.length;
      codeSlots.push(`<code style="${st('code_inline')}">${escapeHtml(code)}</code>`);
      return `\u0000CODE${idx}\u0000`;
    });

    s = escapeHtml(s);

    // Images ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
      const imgStyle = simple
        ? `${st('img')}${st('img') ? '; ' : ''}max-width: 100%; height: auto;`
        : st('img');
      return `<img src="${escapeHtml(safeHref(url))}" alt="${alt}" style="${imgStyle}">`;
    });

    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const href = safeHref(url);
      if (wechatFootnote && href && !href.startsWith('#')) {
        const num = footnotes.length + 1;
        footnotes.push({ index: num, text: label.replace(/<[^>]+>/g, ''), href });
        return `<span style="${st('a')}">${label}<sup style="color: inherit; font-size: 80%; vertical-align: super;">[${num}]</sup></span>`;
      }
      return `<a href="${escapeHtml(href)}" style="${st('a')}">${label}</a>`;
    });

    // Bold, Italic, Strikethrough
    s = s.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong style="${st('strong')}">${t}</strong>`);
    s = s.replace(/__([^_]+)__/g, (_, t) => `<strong style="${st('strong')}">${t}</strong>`);
    s = s.replace(/~~([^~]+)~~/g, (_, t) => `<del>${t}</del>`);
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, t) => `<em style="${st('em')}">${t}</em>`);

    // Restore code spans
    s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => codeSlots[Number(i)]);
    return s;
  };

  const renderCodeBlock = (codeText, lang) => {
    const codeBlockStyle = styles.code_block || 'background: #282c34; color: #abb2bf;';
    const bgMatch = codeBlockStyle.match(/background:\s*([^;]+)/);
    const bgColor = bgMatch ? bgMatch[1].trim() : '#282c34';
    const colorMatch = codeBlockStyle.match(/(?:^|;\s*)color:\s*([^;]+)/);
    const textColor = colorMatch ? colorMatch[1].trim() : '#abb2bf';
    const escaped = escapeHtml(codeText);

    if (macCodeBlock) {
      const langLabel = escapeHtml(lang || 'code');
      return `<div class="mac-code-block" style="border-radius: 10px; overflow: hidden; margin: 14px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">`
        + `<div class="mac-code-header" style="background: ${bgColor}; padding: 10px 16px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);">`
        + `<span style="width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; display: inline-block;"></span>`
        + `<span style="width: 12px; height: 12px; border-radius: 50%; background: #febc2e; display: inline-block;"></span>`
        + `<span style="width: 12px; height: 12px; border-radius: 50%; background: #28c840; display: inline-block;"></span>`
        + `<span style="margin-left: auto; font-size: 12px; color: ${textColor}; opacity: 0.5; font-family: -apple-system, sans-serif;">${langLabel}</span>`
        + `</div>`
        + `<pre style="background: ${bgColor}; color: ${textColor}; padding: 16px; margin: 0; font-size: 13px; line-height: 1.7; overflow-x: auto; font-family: 'SFMono-Regular', Consolas, monospace;"><code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">${escaped}</code></pre>`
        + `</div>`;
    }

    const preStyle = simple
      ? `margin: 14px 0; padding: 14px 16px; background: ${bgColor}; color: ${textColor}; line-height: 1.7; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px;`
      : st('code_block');
    return `<pre style="${preStyle}"><code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">${escaped}</code></pre>`;
  };

  const renderBlocks = (text, inCard = false) => {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    let i = 0;

    const isBlockStart = (line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^(`{3,}|~{3,})/.test(t)) return true;
      if (/^:::(info|warning|tip|danger)\b/.test(t)) return true;
      if (/^#{1,6}\s+/.test(line)) return true;
      if (/^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)\s*$/.test(t)) return true;
      if (/^>\s?/.test(t)) return true;
      if (/^\s*[-*+]\s+/.test(line)) return true;
      if (/^\s*\d+\.\s+/.test(line)) return true;
      return false;
    };

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) { i++; continue; }

      // Fenced code block
      const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
      if (fenceMatch) {
        const marker = fenceMatch[1];
        const lang = fenceMatch[2].trim();
        const codeLines = [];
        i++;
        while (i < lines.length) {
          const t = lines[i].trim();
          if (t.startsWith(marker[0].repeat(marker.length)) && t === marker[0].repeat(t.length)) {
            i++;
            break;
          }
          codeLines.push(lines[i]);
          i++;
        }
        out.push(renderCodeBlock(codeLines.join('\n'), lang));
        continue;
      }

      // Info card :::info|warning|tip|danger
      const cardOpen = trimmed.match(/^:::(info|warning|tip|danger)(?:\s+(.*))?$/);
      if (cardOpen) {
        let j = i + 1;
        let closed = false;
        while (j < lines.length) {
          if (lines[j].trim() === ':::') { closed = true; break; }
          j++;
        }
        if (closed) {
          const type = cardOpen[1];
          const rawTitle = (cardOpen[2] || '').trim();
          const c = INFO_CARD_COLORS[type] || INFO_CARD_COLORS.info;
          const bodyHtml = renderBlocks(lines.slice(i + 1, j).join('\n').trim(), true);
          const titleHtml = rawTitle ? renderInline(rawTitle) : `${c.icon} ${type.toUpperCase()}`;
          const cardStyle = simple
            ? `border-left: 4px solid ${c.border}; background: ${c.bg}; padding: 14px 18px; margin: 14px 0;`
            : `border-left: 4px solid ${c.border}; background: ${c.bg}; padding: 14px 18px; margin: 14px 0; border-radius: 0 8px 8px 0;`;
          out.push(
            `<div style="${cardStyle}">`
            + `<div style="font-weight: 600; color: ${c.color}; margin-bottom: 6px; font-size: 15px;">${titleHtml}</div>`
            + `<div style="color: ${c.color}; font-size: 14px; line-height: 1.7;">${bodyHtml}</div>`
            + `</div>`
          );
          i = j + 1;
          continue;
        }
      }

      // Heading
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const tag = `h${level}`;
        const styleKey = level <= 3 ? tag : 'h3';
        out.push(`<${tag} style="${st(styleKey)}">${renderInline(headingMatch[2].trim())}</${tag}>`);
        i++;
        continue;
      }

      // Horizontal rule
      if (/^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)\s*$/.test(trimmed)) {
        out.push(`<hr style="${st('hr')}">`);
        i++;
        continue;
      }

      // GFM Table
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
        const splitRow = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        const headers = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        const thead = `<thead><tr>${headers.map((h) => `<th style="${st('th')}">${renderInline(h)}</th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td style="${st('td')}">${renderInline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
        out.push(`<table style="${st('table')}">${thead}${tbody}</table>`);
        continue;
      }

      // Blockquote
      if (/^>\s?/.test(trimmed)) {
        const qLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          qLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        out.push(`<blockquote style="${st('blockquote')}">${renderBlocks(qLines.join('\n'), inCard)}</blockquote>`);
        continue;
      }

      // Unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
          i++;
        }
        out.push(`<ul style="${st('ul')}">${items.map((it) => `<li style="${st('li')}">${renderInline(it)}</li>`).join('')}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        out.push(`<ol style="${st('ol')}">${items.map((it) => `<li style="${st('li')}">${renderInline(it)}</li>`).join('')}</ol>`);
        continue;
      }

      // Paragraph
      const pLines = [line];
      i++;
      while (i < lines.length && !isBlockStart(lines[i])) {
        if (lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) break;
        pLines.push(lines[i]);
        i++;
      }
      const pStyle = inCard ? 'margin: 6px 0; line-height: 1.7;' : st('p');
      out.push(`<p style="${pStyle}">${pLines.map((l) => renderInline(l)).join('<br>')}</p>`);
    }

    return out.join('\n');
  };

  let innerHtml = renderBlocks(sourceText);

  if (wechatFootnote && footnotes.length) {
    const isDark = Boolean(themeObj.isDark);
    const borderColor = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
    const titleColor = isDark ? '#e0e0e0' : '#666';
    const textColor = isDark ? '#a9b1d6' : '#999';
    const items = footnotes.map(({ index, text, href }) => {
      const line = text && text !== href ? `[${index}] ${text}: ${href}` : `[${index}] ${href}`;
      return `<p style="margin: 0 0 4px;">${escapeHtml(line)}</p>`;
    }).join('\n');
    innerHtml += `\n<section style="margin-top: 28px; padding-top: 14px; border-top: 1px solid ${borderColor}; font-size: 13px; line-height: 1.8; color: ${textColor};">`
      + `<p style="margin: 0 0 8px; font-weight: 600; color: ${titleColor};">参考资料</p>${items}</section>`;
  }

  let wrapperStyle = styles.wrapper || '';
  if (FONT_MAP[fontFamily]) {
    wrapperStyle = wrapperStyle.replace(/font-family:[^;]+;/, `font-family: ${FONT_MAP[fontFamily]};`);
  }
  if (fontSize) {
    wrapperStyle = wrapperStyle.replace(/font-size:\s*\d+px;/, `font-size: ${fontSize}px;`);
  }
  wrapperStyle = resolveStyle(wrapperStyle, primary, primaryBg, simple);

  const fragment = `<div style="${wrapperStyle}">\n${innerHtml}\n</div>`;
  const outline = extractOutline(markdown);

  if (!options.fullDocument) {
    return { html: fragment, title: frontmatter.title || outline.title, theme: themeId, color: primary, outline };
  }

  const bg = themeObj.bg || '#ffffff';
  const docTitle = escapeHtml(frontmatter.title || outline.title);
  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  <style>body { margin: 0; background: ${bg}; } .preview-body { max-width: 680px; margin: 0 auto; padding: 20px; }</style>
</head>
<body>
<article class="preview-body">
${fragment}
</article>
</body>
</html>`;

  return { html: fullHtml, title: frontmatter.title || outline.title, theme: themeId, color: primary, outline };
}

export { themes, colorPresets };
