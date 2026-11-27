// ============================================
// MoPai 墨排 — 3:4 小红书自动分页知识卡片引擎 + 零依赖 ZIP 打包器
// 原创语义块级装盒分页 + 4 套 MoPai 视觉风格 + 1080×1440 超清导出
// ============================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MoPaiXhsCards = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // ─── 4 套 MoPai 原创小红书卡片风格 ───
  const CARD_THEMES = {
    ink_paper: {
      id: 'ink_paper',
      name: '墨韵宣纸',
      desc: '微暖纸感 + 印章页码，适合深度思考与干货笔记',
      outerBg: '#efe9dd',
      cardBg: '#fcf9f2',
      textColor: '#262320',
      mutedColor: '#7b7265',
      borderColor: '#e4dac8',
      codeBg: '#272421',
      codeColor: '#f3eadc',
      quoteBg: 'rgba(139, 107, 62, 0.08)',
      isDark: false,
      fontFamily: "Georgia, 'Noto Serif SC', 'Songti SC', 'PingFang SC', serif",
    },
    clean_note: {
      id: 'clean_note',
      name: '极简备忘录',
      desc: '高赞苹果备忘录风，清爽通透，阅读转化率高',
      outerBg: '#f3f4f6',
      cardBg: '#ffffff',
      textColor: '#1f2937',
      mutedColor: '#6b7280',
      borderColor: '#e5e7eb',
      codeBg: '#1f2937',
      codeColor: '#f3f4f6',
      quoteBg: '#f8fafc',
      isDark: false,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    },
    aurora_glass: {
      id: 'aurora_glass',
      name: '渐变玻璃',
      desc: '主色柔和渐变外框 + 磨砂白卡，适合科技与效率分享',
      outerBg: 'linear-gradient(135deg, {{ACCENT}} 0%, #6366f1 55%, #ec4899 100%)',
      cardBg: 'rgba(255, 255, 255, 0.94)',
      textColor: '#1e1b2e',
      mutedColor: '#64748b',
      borderColor: 'rgba(255, 255, 255, 0.65)',
      codeBg: '#1a1b26',
      codeColor: '#e2e8f0',
      quoteBg: '{{ACCENT_BG}}',
      isDark: false,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    },
    cyber_ink: {
      id: 'cyber_ink',
      name: '暗夜极客',
      desc: '高对比暗黑质感 + 霓虹主色条，适合 AI 与编程教程',
      outerBg: 'linear-gradient(160deg, #0b0e17 0%, #171c2e 100%)',
      cardBg: '#121625',
      textColor: '#e5e7f0',
      mutedColor: '#94a3b8',
      borderColor: '#252c44',
      codeBg: '#090b12',
      codeColor: '#a9b1d6',
      quoteBg: 'rgba(255, 255, 255, 0.05)',
      isDark: true,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    },
  };

  const CARD_RATIOS = {
    '3:4': { id: '3:4', name: '3:4 竖版 (小红书)', width: 360, height: 480, exportScale: 3 },
    '1:1': { id: '1:1', name: '1:1 方形卡片', width: 360, height: 360, exportScale: 3 },
  };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"]/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[ch]));
  }

  function resolveTheme(styleKey, accent) {
    const base = CARD_THEMES[styleKey] || CARD_THEMES.ink_paper;
    const primary = /^#[0-9a-fA-F]{6}$/.test(accent || '') ? accent : '#4f6ef7';
    const primaryBg = primary + '16';
    return {
      ...base,
      accent: primary,
      accentBg: primaryBg,
      outerBg: base.outerBg.replace(/\{\{ACCENT\}\}/g, primary).replace(/\{\{ACCENT_BG\}\}/g, primaryBg),
      quoteBg: base.quoteBg.replace(/\{\{ACCENT\}\}/g, primary).replace(/\{\{ACCENT_BG\}\}/g, primaryBg),
    };
  }

  // 把正文 DOM 节点标准化为适合卡片尺度的紧凑排版样式
  function styleNodeForCard(node, t) {
    const clone = node.cloneNode(true);
    if (clone.nodeType !== 1) return clone;
    const tag = clone.tagName.toLowerCase();

    const applyTree = (el) => {
      const k = el.tagName.toLowerCase();
      if (k === 'h1') {
        el.setAttribute('style', `margin: 0 0 10px; font-size: 19px; font-weight: 800; line-height: 1.35; color: ${t.textColor};`);
      } else if (k === 'h2') {
        el.setAttribute('style', `margin: 12px 0 8px; font-size: 16px; font-weight: 700; line-height: 1.4; color: ${t.textColor}; border-left: 3px solid ${t.accent}; padding-left: 8px;`);
      } else if (k === 'h3' || k === 'h4') {
        el.setAttribute('style', `margin: 10px 0 6px; font-size: 14px; font-weight: 700; line-height: 1.4; color: ${t.accent};`);
      } else if (k === 'p') {
        el.setAttribute('style', `margin: 0 0 8px; font-size: 13px; line-height: 1.72; color: ${t.textColor}; word-break: break-word;`);
      } else if (k === 'blockquote') {
        el.setAttribute('style', `margin: 8px 0; padding: 8px 10px; border-left: 3px solid ${t.accent}; background: ${t.quoteBg}; border-radius: 0 6px 6px 0; font-size: 12.5px; line-height: 1.65; color: ${t.mutedColor};`);
      } else if (k === 'ul' || k === 'ol') {
        el.setAttribute('style', `margin: 4px 0 8px; padding-left: 18px; font-size: 13px; line-height: 1.68; color: ${t.textColor};`);
      } else if (k === 'li') {
        const isTask = el.hasAttribute('data-task-item') || Boolean(el.querySelector('[data-task]'));
        el.setAttribute('style', `margin: 3px 0; line-height: 1.68; color: ${t.textColor};${isTask ? ' list-style-type: none; margin-left: -16px;' : ''}`);
      } else if (k === 'pre') {
        el.setAttribute('style', `margin: 8px 0; padding: 10px 12px; border-radius: 8px; background: ${t.codeBg}; color: ${t.codeColor}; font-size: 11px; line-height: 1.55; white-space: pre-wrap; word-break: break-all; font-family: 'SFMono-Regular', Consolas, monospace;`);
      } else if (k === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre') {
        el.setAttribute('style', `padding: 1px 5px; border-radius: 4px; background: ${t.accentBg}; color: ${t.accent}; font-size: 11.5px; font-family: 'SFMono-Regular', Consolas, monospace;`);
      } else if (k === 'strong' || k === 'b') {
        el.setAttribute('style', `color: ${t.accent}; font-weight: 700;`);
      } else if (k === 'img') {
        el.setAttribute('style', 'display: block; max-width: 100%; max-height: 175px; object-fit: contain; margin: 8px auto; border-radius: 8px;');
      } else if (k === 'table') {
        el.setAttribute('style', `width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11.5px; color: ${t.textColor};`);
      } else if (k === 'th') {
        el.setAttribute('style', `padding: 5px 6px; border: 1px solid ${t.borderColor}; background: ${t.accentBg}; font-weight: 600; text-align: left;`);
      } else if (k === 'td') {
        el.setAttribute('style', `padding: 5px 6px; border: 1px solid ${t.borderColor};`);
      } else if (k === 'hr') {
        el.setAttribute('style', `border: none; height: 1px; background: ${t.borderColor}; margin: 10px 0;`);
      }
      // 简化 Mac 代码块外框为紧凑代码卡片，防止小红书卡片过拥挤
      if (el.classList?.contains('mac-code-block')) {
        const pre = el.querySelector('pre');
        if (pre) {
          pre.setAttribute('style', `margin: 8px 0; padding: 10px 12px; border-radius: 8px; background: ${t.codeBg}; color: ${t.codeColor}; font-size: 11px; line-height: 1.55; white-space: pre-wrap; word-break: break-all; font-family: 'SFMono-Regular', Consolas, monospace;`);
          el.replaceWith(pre);
          return;
        }
      }
      Array.from(el.children).forEach(applyTree);
    };

    if (tag === 'div' && clone.classList?.contains('mac-code-block')) {
      const pre = clone.querySelector('pre');
      if (pre) {
        applyTree(pre);
        return pre;
      }
    }
    applyTree(clone);
    return clone;
  }

  // 把超长段落按句号/换行切分为适合装入卡片的子段
  function splitLongParagraphHtml(pEl, maxChars = 150) {
    const text = (pEl.textContent || '').trim();
    if (text.length <= maxChars || pEl.querySelector('img, code, a')) return [pEl];
    const chunks = [];
    const sentences = text.split(/(?<=[。！？!?；;\n])/);
    let buf = '';
    for (const s of sentences) {
      if ((buf + s).length > maxChars && buf) {
        chunks.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
    if (chunks.length <= 1) return [pEl];
    return chunks.map((chunk) => {
      const p = pEl.cloneNode(false);
      p.textContent = chunk;
      return p;
    });
  }

  // ─── 纯算法版块级分页（可在 Node 无 DOM 环境下进行单元测试，浏览器内自动用真实高度） ───
  function paginateBlocksWithMeasurer(blocks, { maxBodyHeight, splitByHr, measureHeight }) {
    const pages = [];
    let current = [];

    const flush = (carryTrailingHeadings = false) => {
      if (current.length === 0) return [];
      const carried = [];
      if (carryTrailingHeadings) {
        while (current.length > 1 && current[current.length - 1].isHeading) {
          carried.unshift(current.pop());
        }
      }
      if (current.length > 0) {
        pages.push(current);
        current = [];
      }
      return carried;
    };

    for (let idx = 0; idx < blocks.length; idx++) {
      const block = blocks[idx];
      if (splitByHr && block.isHr) {
        flush(false);
        continue;
      }

      // 连续标题穿透孤行防护：沿连续标题向后查找到首个正文块，若整组放不下则提前换页
      if (block.isHeading && current.length > 0) {
        const curHeight = measureHeight(current);
        const lookahead = [block];
        for (let k = idx + 1; k < blocks.length; k++) {
          if (blocks[k].isHr) break;
          lookahead.push(blocks[k]);
          if (!blocks[k].isHeading) break;
        }
        const cantFitGroup = measureHeight([...current, ...lookahead]) > maxBodyHeight;
        if (curHeight > maxBodyHeight * 0.55 || cantFitGroup) {
          flush(false);
        }
      }

      const candidate = [...current, block];
      if (measureHeight(candidate) <= maxBodyHeight) {
        current = candidate;
        continue;
      }

      // 当前页已有内容时先翻页重试（若页尾残留连续标题则一并携带至下一页顶部）
      if (current.length > 0) {
        const carried = flush(true);
        const retryGroup = [...carried, block];
        if (measureHeight(retryGroup) <= maxBodyHeight) {
          current = retryGroup;
          continue;
        }
        current = carried;
      }

      // 单块本身超限：若是列表则按子项平滑拆分跨页
      if (block.listItems && block.listItems.length > 1) {
        let subItems = [];
        for (const itemHtml of block.listItems) {
          const nextSub = [...subItems, itemHtml];
          const testBlock = { ...block, html: block.wrapList(nextSub) };
          if (subItems.length > 0 && measureHeight([...current, testBlock]) > maxBodyHeight) {
            current.push({ ...block, html: block.wrapList(subItems) });
            flush();
            subItems = [itemHtml];
          } else {
            subItems = nextSub;
          }
        }
        if (subItems.length > 0) {
          current.push({ ...block, html: block.wrapList(subItems) });
        }
        continue;
      }

      // 不可再拆分的单块（例如大图/代码）直接单独成页
      current.push(block);
      flush();
    }

    flush();
    return pages;
  }

  function buildCoverCardInnerHtml({ title, subtitle, author, readingTime, tag }, t) {
    const badgeHtml = tag
      ? `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:${t.accentBg};color:${t.accent};font-size:11px;font-weight:700;letter-spacing:0.5px;margin-bottom:18px;">✦ ${escapeHtml(tag)}</div>`
      : '';
    const subHtml = subtitle
      ? `<p style="margin:14px 0 0;font-size:13.5px;line-height:1.75;color:${t.mutedColor};word-break:break-word;">${escapeHtml(subtitle)}</p>`
      : '';
    const metaParts = [author ? `@${author}` : '', readingTime ? `约 ${readingTime}` : ''].filter(Boolean).join(' · ');

    return `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:8px 2px;">
      <div>${badgeHtml}</div>
      <div style="width:36px;height:4px;border-radius:2px;background:${t.accent};margin-bottom:16px;"></div>
      <div style="font-size:25px;font-weight:800;line-height:1.35;letter-spacing:-0.3px;color:${t.textColor};word-break:break-word;">${escapeHtml(title)}</div>
      ${subHtml}
      ${metaParts ? `<div style="margin-top:26px;padding-top:14px;border-top:1px dashed ${t.borderColor};font-size:11.5px;color:${t.mutedColor};display:flex;align-items:center;justify-content:space-between;"><span>${escapeHtml(metaParts)}</span><span style="color:${t.accent};font-weight:600;">左滑查看干货 →</span></div>` : ''}
    </div>`;
  }

  function wrapCardFrame({ innerHtml, index, total, kind, author, showPageNumber, ratioSpec }, t) {
    const padOuter = t.id === 'aurora_glass' ? 16 : 14;
    const pageLabel = `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    const footerLeft = author ? `@${escapeHtml(author)}` : 'MoPai 墨排';
    const headerBar = t.id === 'clean_note'
      ? `<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid ${t.borderColor};font-size:10.5px;color:${t.mutedColor};"><span>● 笔记卡片</span><span>${kind === 'cover' ? 'COVER' : pageLabel}</span></div>`
      : '';
    const footerBar = showPageNumber
      ? `<div style="margin-top:auto;padding-top:10px;border-top:1px solid ${t.borderColor};display:flex;align-items:center;justify-content:space-between;font-size:10.5px;color:${t.mutedColor};flex-shrink:0;">
          <span>${footerLeft}</span>
          <span style="padding:1px 7px;border-radius:999px;background:${t.accentBg};color:${t.accent};font-weight:700;font-variant-numeric:tabular-nums;">${pageLabel}</span>
        </div>`
      : '';

    const safeFontFamily = String(t.fontFamily || '').replace(/"/g, "'");
    return `<div class="xhs-card-frame" style="width:${ratioSpec.width}px;height:${ratioSpec.height}px;box-sizing:border-box;padding:${padOuter}px;background:${t.outerBg};font-family:${safeFontFamily};display:flex;flex-direction:column;overflow:hidden;">
      <div style="flex:1;min-height:0;box-sizing:border-box;background:${t.cardBg};border:1px solid ${t.borderColor};border-radius:14px;padding:18px 18px 14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,${t.isDark ? '0.35' : '0.07'});">
        ${headerBar}
        <div style="flex:1;min-height:0;overflow:hidden;">${innerHtml}</div>
        ${footerBar}
      </div>
    </div>`;
  }

  // 浏览器端主入口：测量真实块高度并自动生成全部小红书卡片
  function generateDeckFromPreview({
    sourceEl,
    title = '知识笔记',
    subtitle = '',
    author = '',
    readingTime = '',
    tag = '知识卡片',
    styleKey = 'ink_paper',
    accent = '#4f6ef7',
    ratio = '3:4',
    includeCover = true,
    splitByHr = true,
    showPageNumber = true,
  }) {
    if (typeof document === 'undefined' || !sourceEl) return [];
    const t = resolveTheme(styleKey, accent);
    const ratioSpec = CARD_RATIOS[ratio] || CARD_RATIOS['3:4'];

    // 提取预览内容根节点（跳过外层 wrapper <div>）
    const rootNode = sourceEl.children.length === 1 && sourceEl.firstElementChild.tagName === 'DIV'
      ? sourceEl.firstElementChild
      : sourceEl;

    const rawNodes = Array.from(rootNode.children);
    const blocks = [];
    let skippedFirstH1 = false;

    for (const rawNode of rawNodes) {
      // 跳过微信文末参考资料区块
      if (rawNode.tagName === 'SECTION' && rawNode.textContent.trim().startsWith('参考资料')) {
        continue;
      }
      if (includeCover && !skippedFirstH1 && rawNode.tagName === 'H1') {
        skippedFirstH1 = true;
        continue;
      }
      const styled = styleNodeForCard(rawNode, t);
      const tagName = styled.tagName.toLowerCase();

      if (tagName === 'p') {
        for (const subP of splitLongParagraphHtml(styled, 160)) {
          blocks.push({ html: subP.outerHTML, isHr: false, isHeading: false });
        }
        continue;
      }
      if (tagName === 'ul' || tagName === 'ol') {
        const listItems = Array.from(styled.children).map((li) => li.outerHTML);
        const listStyle = styled.getAttribute('style') || '';
        blocks.push({
          html: styled.outerHTML,
          isHr: false,
          isHeading: false,
          listItems,
          wrapList: (items) => `<${tagName} style="${listStyle}">${items.join('')}</${tagName}>`,
        });
        continue;
      }
      blocks.push({
        html: styled.outerHTML,
        isHr: tagName === 'hr',
        isHeading: tagName === 'h1' || tagName === 'h2' || tagName === 'h3',
      });
    }

    // 如果没有显式副标题，自动从第一段纯文本中摘取精简导语
    let autoSubtitle = subtitle;
    if (!autoSubtitle && includeCover) {
      const firstTextEl = rawNodes.find((n) => n.tagName === 'P' || n.tagName === 'BLOCKQUOTE');
      if (firstTextEl) {
        const txt = firstTextEl.textContent.trim();
        if (txt) autoSubtitle = txt.length > 72 ? txt.slice(0, 72) + '…' : txt;
      }
    }

    // 离屏真实 DOM 测量容器（与最终卡片正文宽度一致）
    const padOuter = t.id === 'aurora_glass' ? 16 : 14;
    const innerWidth = ratioSpec.width - padOuter * 2 - 36 - 2;
    const chromeHeight = padOuter * 2 + 32 + (t.id === 'clean_note' ? 28 : 0) + (showPageNumber ? 30 : 0) + 10;
    const maxBodyHeight = Math.max(180, ratioSpec.height - chromeHeight);

    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;left:-9999px;top:0;width:${innerWidth}px;visibility:hidden;pointer-events:none;font-family:${t.fontFamily};box-sizing:border-box;`;
    document.body.appendChild(probe);

    let bodyPages = [];
    try {
      bodyPages = paginateBlocksWithMeasurer(blocks, {
        maxBodyHeight,
        splitByHr,
        measureHeight: (items) => {
          probe.innerHTML = items.map((b) => b.html).join('');
          return probe.scrollHeight;
        },
      });
    } finally {
      probe.remove();
    }

    const rawCards = [];
    if (includeCover) {
      rawCards.push({
        kind: 'cover',
        innerHtml: buildCoverCardInnerHtml({
          title,
          subtitle: autoSubtitle,
          author,
          readingTime,
          tag,
        }, t),
      });
    }
    for (const pageBlocks of bodyPages) {
      rawCards.push({
        kind: 'body',
        innerHtml: pageBlocks.map((b) => b.html).join(''),
      });
    }
    if (rawCards.length === 0) {
      rawCards.push({
        kind: 'body',
        innerHtml: `<p style="font-size:13px;color:${t.mutedColor};">暂无可分页内容</p>`,
      });
    }

    const total = rawCards.length;
    return rawCards.map((c, idx) => ({
      index: idx + 1,
      total,
      kind: c.kind,
      width: ratioSpec.width,
      height: ratioSpec.height,
      exportScale: ratioSpec.exportScale,
      html: wrapCardFrame({
        innerHtml: c.innerHtml,
        index: idx + 1,
        total,
        kind: c.kind,
        author,
        showPageNumber,
        ratioSpec,
      }, t),
    }));
  }

  // ─── 纯 JS 零依赖标准 ZIP 打包器（PKZIP 2.0 Store 模式 + IEEE 802.3 CRC32）───
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildZipBytes(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const data = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes);
      const crc = crc32(data);

      // Local file header (30 bytes + name)
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); // signature
      lv.setUint16(4, 20, true);         // version needed
      lv.setUint16(6, 0x0800, true);     // UTF-8 filename flag
      lv.setUint16(8, 0, true);          // method 0 = Store (PNG is already compressed)
      lv.setUint16(10, 0, true);         // mod time
      lv.setUint16(12, 0x5421, true);    // mod date
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      localParts.push(local, data);

      // Central directory header (46 bytes + name)
      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x5421, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length + data.length;
    }

    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const totalLen = offset + centralSize + eocd.length;
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of [...localParts, ...centralParts, eocd]) {
      out.set(p, pos);
      pos += p.length;
    }
    return out;
  }

  function buildZipBlob(entries) {
    return new Blob([buildZipBytes(entries)], { type: 'application/zip' });
  }

  function dataUrlToUint8Array(dataUrl) {
    const b64 = String(dataUrl).slice(String(dataUrl).indexOf(',') + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  return {
    CARD_THEMES,
    CARD_RATIOS,
    paginateBlocksWithMeasurer,
    generateDeckFromPreview,
    crc32,
    buildZipBytes,
    buildZipBlob,
    dataUrlToUint8Array,
  };
});
