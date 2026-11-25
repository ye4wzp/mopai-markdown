// ============================================
// MoPai 发布 HTML 兼容处理
// ============================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MoPaiPublishUtils = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SIMPLE_STYLE_ALLOWLIST = new Set([
    'background',
    'background-color',
    'border',
    'border-left',
    'border-right',
    'border-top',
    'border-bottom',
    'border-collapse',
    'color',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'height',
    'letter-spacing',
    'line-height',
    'margin',
    'margin-bottom',
    'margin-left',
    'margin-right',
    'margin-top',
    'max-width',
    'padding',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'padding-top',
    'text-align',
    'text-decoration',
    'vertical-align',
    'width',
  ]);

  function appendInlineStyle(el, styleText) {
    if (!styleText) return;
    const existing = el.getAttribute('style') || '';
    el.setAttribute('style', `${existing}${existing && !existing.trim().endsWith(';') ? '; ' : ''}${styleText}`);
  }

  function inlineCodeTokenStyles(cloneEl, sourceEl) {
    if (!sourceEl || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;

    const cloneSpans = Array.from(cloneEl.querySelectorAll('pre code span'));
    const sourceSpans = Array.from(sourceEl.querySelectorAll('pre code span'));

    cloneSpans.forEach((span, index) => {
      const sourceSpan = sourceSpans[index];
      if (!sourceSpan) return;

      const computed = window.getComputedStyle(sourceSpan);
      let inlineStyle = '';
      if (computed.color) inlineStyle += `color: ${computed.color};`;
      if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        inlineStyle += ` background-color: ${computed.backgroundColor};`;
      }
      if (computed.fontWeight && computed.fontWeight !== '400' && computed.fontWeight !== 'normal') {
        inlineStyle += ` font-weight: ${computed.fontWeight};`;
      }
      if (computed.fontStyle && computed.fontStyle !== 'normal') {
        inlineStyle += ` font-style: ${computed.fontStyle};`;
      }
      appendInlineStyle(span, inlineStyle);
    });
  }

  function svgToPngDataUrl(svgEl) {
    if (typeof document === 'undefined' || typeof XMLSerializer === 'undefined') {
      return Promise.resolve(null);
    }
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox?.baseVal;
    const width = Math.ceil(rect.width || vb?.width || parseFloat(svgEl.getAttribute('width')) || 600);
    const height = Math.ceil(rect.height || vb?.height || parseFloat(svgEl.getAttribute('height')) || 320);
    if (!width || !height) return Promise.resolve(null);

    const svgClone = svgEl.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    const serialized = new XMLSerializer().serializeToString(svgClone);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = 2;
          const canvas = document.createElement('canvas');
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = svgDataUrl;
    });
  }

  async function inlineMermaidSvgs(cloneEl, sourceEl) {
    if (!sourceEl || typeof document === 'undefined') return;
    const sourceDiagrams = Array.from(sourceEl.querySelectorAll('.mermaid-diagram svg'));
    const cloneDiagrams = Array.from(cloneEl.querySelectorAll('.mermaid-diagram svg'));
    if (!sourceDiagrams.length) return;

    await Promise.all(cloneDiagrams.map(async (cloneSvg, index) => {
      const sourceSvg = sourceDiagrams[index];
      if (!sourceSvg) return;
      const pngUrl = await svgToPngDataUrl(sourceSvg);
      if (!pngUrl) return;
      const img = document.createElement('img');
      img.setAttribute('src', pngUrl);
      img.setAttribute('alt', 'Mermaid 图表');
      img.setAttribute('style', 'max-width: 100%; height: auto; display: block; margin: 14px auto;');
      cloneSvg.replaceWith(img);
    }));
  }

  async function inlineLocalImages(cloneEl, imageToBase64) {
    if (typeof imageToBase64 !== 'function') return;

    const imgs = Array.from(cloneEl.querySelectorAll('img'));
    await Promise.all(imgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src.startsWith('blob:') && !src.startsWith('data:')) return;

      try {
        img.setAttribute('src', await imageToBase64(src));
      } catch (e) {
        console.warn('图片转换失败:', e);
      }
    }));
  }

  function filterInlineStyles(styleText) {
    return styleText
      .split(';')
      .map(rule => rule.trim())
      .filter(Boolean)
      .filter(rule => {
        const prop = rule.split(':')[0]?.trim().toLowerCase();
        return SIMPLE_STYLE_ALLOWLIST.has(prop);
      })
      .join('; ');
  }

  function simplifyMacCodeBlocks(cloneEl) {
    cloneEl.querySelectorAll('.mac-code-block').forEach(block => {
      const pre = block.querySelector('pre');
      if (!pre) {
        block.remove();
        return;
      }

      const simplePre = pre.cloneNode(true);
      const preStyle = filterInlineStyles(simplePre.getAttribute('style') || '');
      simplePre.setAttribute(
        'style',
        `${preStyle ? preStyle + '; ' : ''}margin: 14px 0; padding: 14px 16px; background: #282c34; color: #abb2bf; line-height: 1.7; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px;`
      );
      simplePre.removeAttribute('class');
      simplePre.removeAttribute('data-lang');

      const code = simplePre.querySelector('code');
      if (code) {
        code.setAttribute('style', 'font-family: inherit; font-size: inherit; color: inherit; background: transparent;');
        code.removeAttribute('class');
      }

      block.replaceWith(simplePre);
    });
  }

  function simplifyHtmlForPlatform(cloneEl) {
    simplifyMacCodeBlocks(cloneEl);

    cloneEl.querySelectorAll('*').forEach(el => {
      el.removeAttribute('class');
      el.removeAttribute('data-lang');
      el.removeAttribute('data-highlighted');

      const simpleStyle = filterInlineStyles(el.getAttribute('style') || '');
      if (simpleStyle) {
        el.setAttribute('style', simpleStyle);
      } else {
        el.removeAttribute('style');
      }
    });

    cloneEl.querySelectorAll('pre').forEach(pre => {
      if (!pre.getAttribute('style')) {
        pre.setAttribute('style', 'margin: 14px 0; padding: 14px 16px; background: #282c34; color: #abb2bf; line-height: 1.7; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px;');
      }
    });

    cloneEl.querySelectorAll('img').forEach(img => {
      appendInlineStyle(img, 'max-width: 100%; height: auto;');
    });
  }

  async function prepareHtml(previewEl, options = {}) {
    if (!previewEl) return '';

    const cloneEl = previewEl.cloneNode(true);
    inlineCodeTokenStyles(cloneEl, previewEl);
    if (options.inlineMermaid !== false) {
      await inlineMermaidSvgs(cloneEl, previewEl);
    }
    await inlineLocalImages(cloneEl, options.imageToBase64);

    if (options.simple) {
      simplifyHtmlForPlatform(cloneEl);
    }

    return cloneEl.innerHTML;
  }

  return {
    prepareHtml,
    simplifyHtmlForPlatform,
    svgToPngDataUrl,
  };
});
