// ============================================
// 样式主题配置 — 13 种精美主题
// ============================================

const themes = {
  // ─── 经典公众号系列 ─────────────────────
  default: {
    name: '默认公众号',
    emoji: '📱',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    desc: '经典微信公众号排版',
    category: 'classic',
    accent: '#4f6ef7',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; color: #333; line-height: 1.75; padding: 16px 20px; font-size: 15px;',
      h1: 'font-size: 22px; font-weight: bold; text-align: center; margin: 24px 0 16px; color: #1a1a1a; border-bottom: 2px solid {{PRIMARY}}; padding-bottom: 12px;',
      h2: 'font-size: 18px; font-weight: bold; margin: 20px 0 12px; color: #1a1a1a; border-left: 4px solid {{PRIMARY}}; padding-left: 12px;',
      h3: 'font-size: 16px; font-weight: bold; margin: 16px 0 8px; color: #333;',
      p: 'margin: 8px 0; line-height: 1.8; letter-spacing: 0.5px;',
      blockquote: 'border-left: 4px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 12px 16px; margin: 12px auto; color: #555; border-radius: 0 4px 4px 0;',
      code_inline: 'background: #fff5f5; color: #c7254e; padding: 2px 6px; border-radius: 3px; font-size: 90%;',
      code_block: 'background: #282c34; color: #abb2bf; padding: 16px; border-radius: 8px; font-size: 13px; line-height: 1.6; overflow-x: auto;',
      ul: 'margin: 8px 0; padding-left: 24px;',
      ol: 'margin: 8px 0; padding-left: 24px;',
      li: 'margin: 4px 0; line-height: 1.8;',
      img: 'max-width: 100%; border-radius: 8px; margin: 12px auto; display: block;',
      a: 'color: {{PRIMARY}}; text-decoration: none; border-bottom: 1px solid {{PRIMARY}};',
      table: 'width: 100%; border-collapse: collapse; margin: 12px auto; font-size: 14px;',
      th: 'background: {{PRIMARY_BG}}; padding: 10px 12px; border: 1px solid #e8e8e8; font-weight: bold; text-align: left;',
      td: 'padding: 10px 12px; border: 1px solid #e8e8e8;',
      hr: 'border: none; height: 1px; background: linear-gradient(to right, transparent, {{PRIMARY}}, transparent); margin: 24px 0;',
      strong: 'color: {{PRIMARY}}; font-weight: bold;',
      em: 'font-style: italic; color: #666;',
    }
  },

  tech: {
    name: '技术风格',
    emoji: '💻',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    desc: '适合技术文章',
    category: 'classic',
    accent: '#667eea',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif; color: #2d3748; line-height: 1.8; padding: 16px 20px; font-size: 15px;',
      h1: 'font-size: 24px; font-weight: 700; margin: 28px 0 16px; color: {{PRIMARY}}; padding-bottom: 8px; border-bottom: 2px solid {{PRIMARY_BG}};',
      h2: 'font-size: 19px; font-weight: 600; margin: 22px 0 12px; color: #2d3748; border-left: 4px solid {{PRIMARY}}; background: linear-gradient(to right, {{PRIMARY_BG}}, transparent); padding: 8px 12px; border-radius: 0 4px 4px 0;',
      h3: 'font-size: 16px; font-weight: 600; margin: 16px 0 8px; color: #4a5568;',
      p: 'margin: 8px 0; line-height: 1.8; color: #4a5568;',
      blockquote: 'border-left: 4px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 14px 18px; margin: 14px auto; color: #374151; border-radius: 0 8px 8px 0; font-style: italic;',
      code_inline: 'background: {{PRIMARY_BG}}; color: {{PRIMARY}}; padding: 2px 8px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #1a1b26; color: #a9b1d6; padding: 18px; border-radius: 10px; font-size: 13px; line-height: 1.7; overflow-x: auto; border: 1px solid #2d3748;',
      ul: 'margin: 8px 0; padding-left: 24px;',
      ol: 'margin: 8px 0; padding-left: 24px;',
      li: 'margin: 4px 0; line-height: 1.8; color: #4a5568;',
      img: 'max-width: 100%; border-radius: 10px; margin: 14px auto; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
      a: 'color: {{PRIMARY}}; text-decoration: none; border-bottom: 1px dashed {{PRIMARY}};',
      table: 'width: 100%; border-collapse: collapse; margin: 14px auto; font-size: 14px;',
      th: 'background: {{PRIMARY}}; color: white; padding: 10px 14px; border: 1px solid #e2e8f0; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #e2e8f0;',
      hr: 'border: none; height: 2px; background: linear-gradient(to right, {{PRIMARY}}, transparent); margin: 24px 0; border-radius: 1px;',
      strong: 'color: {{PRIMARY}}; font-weight: 700;',
      em: 'font-style: italic; color: #718096;',
    }
  },

  elegant: {
    name: '优雅简约',
    emoji: '✨',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>',
    desc: '精致杂志风排版',
    category: 'classic',
    accent: '#c9a96e',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: "Georgia", "Noto Serif SC", "Source Han Serif SC", serif; color: #3c3c3c; line-height: 1.9; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 26px; font-weight: 700; text-align: center; margin: 32px 0 20px; color: #1a1a1a; letter-spacing: 2px;',
      h2: 'font-size: 20px; font-weight: 600; margin: 24px 0 14px; color: #2c2c2c; text-align: center; border-bottom: 1px solid {{PRIMARY_BG}}; padding-bottom: 6px;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 10px; color: #444;',
      p: 'margin: 10px 0; line-height: 2; text-indent: 2em; letter-spacing: 0.5px;',
      blockquote: 'border-left: 3px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 16px 20px; margin: 16px auto; color: #6b5b3e; font-style: italic; border-radius: 0 6px 6px 0;',
      code_inline: 'background: {{PRIMARY_BG}}; color: {{PRIMARY}}; padding: 2px 6px; border-radius: 3px; font-size: 90%;',
      code_block: 'background: #2b2b2b; color: #d4d4d4; padding: 18px; border-radius: 8px; font-size: 13px; line-height: 1.6; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 20px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 6px 0; line-height: 1.9;',
      img: 'max-width: 100%; border-radius: 6px; margin: 16px auto; display: block; box-shadow: 0 2px 12px rgba(0,0,0,0.08);',
      a: 'color: {{PRIMARY}}; text-decoration: none; border-bottom: 1px solid {{PRIMARY}};',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto; font-size: 14px;',
      th: 'background: {{PRIMARY_BG}}; padding: 12px 14px; border: 1px solid #e8dcc8; font-weight: bold;',
      td: 'padding: 12px 14px; border: 1px solid #e8dcc8;',
      hr: 'border: none; height: 1px; background: linear-gradient(to right, transparent, {{PRIMARY}}, transparent); margin: 28px 0;',
      strong: 'color: {{PRIMARY}}; font-weight: 700;',
      em: 'font-style: italic; color: #777;',
    }
  },

  deep_read: {
    name: '深度阅读',
    emoji: '📖',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    desc: '适合长文阅读',
    category: 'classic',
    accent: '#6366f1',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; color: #374151; line-height: 2; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 28px; font-weight: 800; margin: 36px 0 20px; color: #111827; letter-spacing: -0.5px;',
      h2: 'font-size: 22px; font-weight: 700; margin: 28px 0 14px; color: #1f2937; padding-bottom: 8px; border-bottom: 2px solid {{PRIMARY_BG}};',
      h3: 'font-size: 18px; font-weight: 600; margin: 20px 0 10px; color: #374151;',
      p: 'margin: 12px 0; line-height: 2; color: #4b5563; letter-spacing: 0.3px;',
      blockquote: 'border-left: 3px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 16px 20px; margin: 16px auto; color: #374151; border-radius: 0 8px 8px 0;',
      code_inline: 'background: #f3f4f6; color: {{PRIMARY}}; padding: 2px 6px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #111827; color: #e5e7eb; padding: 20px; border-radius: 12px; font-size: 14px; line-height: 1.7; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 6px 0; line-height: 2; color: #4b5563;',
      img: 'max-width: 100%; border-radius: 12px; margin: 20px auto; display: block;',
      a: 'color: {{PRIMARY}}; text-decoration: none; font-weight: 500;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: {{PRIMARY_BG}}; padding: 12px 16px; border: 1px solid #e5e7eb; font-weight: 600;',
      td: 'padding: 12px 16px; border: 1px solid #e5e7eb;',
      hr: 'border: none; border-top: 1px solid {{PRIMARY_BG}}; margin: 32px 0;',
      strong: 'color: {{PRIMARY}}; font-weight: 700;',
      em: 'font-style: italic; color: #6b7280;',
    }
  },

  // ─── 媒体风格系列 ─────────────────────
  nyt: {
    name: '纽约时报',
    emoji: '📰',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>',
    desc: '经典报刊风格',
    category: 'media',
    accent: '#326891',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: "Georgia", "Noto Serif SC", serif; color: #333; line-height: 1.8; padding: 20px 24px; font-size: 17px;',
      h1: 'font-family: "Georgia", serif; font-size: 32px; font-weight: 900; margin: 32px 0 8px; color: #121212; letter-spacing: -0.5px; line-height: 1.2;',
      h2: 'font-family: "Georgia", serif; font-size: 22px; font-weight: 700; margin: 28px 0 10px; color: #121212; border-bottom: 1px solid {{PRIMARY}}; padding-bottom: 4px;',
      h3: 'font-size: 18px; font-weight: 700; margin: 20px 0 8px; color: #333; font-style: italic;',
      p: 'margin: 8px 0; line-height: 1.85; color: #333;',
      blockquote: 'border-left: 3px solid {{PRIMARY}}; padding: 0 0 0 20px; margin: 16px auto; color: #555; font-style: italic; font-size: 18px;',
      code_inline: 'background: #f7f7f7; color: #333; padding: 2px 6px; border-radius: 2px; font-size: 88%;',
      code_block: 'background: #f7f7f7; color: #333; padding: 20px; border-radius: 4px; font-size: 14px; line-height: 1.6; overflow-x: auto; border: 1px solid #e0e0e0;',
      ul: 'margin: 8px 0; padding-left: 20px;',
      ol: 'margin: 8px 0; padding-left: 20px;',
      li: 'margin: 4px 0; line-height: 1.85;',
      img: 'max-width: 100%; margin: 16px auto; display: block;',
      a: 'color: {{PRIMARY}}; text-decoration: underline;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: #f7f7f7; padding: 10px 14px; border-bottom: 2px solid {{PRIMARY}}; font-weight: bold; text-align: left;',
      td: 'padding: 10px 14px; border-bottom: 1px solid #e0e0e0;',
      hr: 'border: none; border-top: 1px solid #ccc; margin: 28px 0;',
      strong: 'font-weight: 900; color: #121212;',
      em: 'font-style: italic;',
    }
  },

  ft: {
    name: '金融时报',
    emoji: '💰',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
    desc: 'FT 经典粉橙色调',
    category: 'media',
    accent: '#0d7680',
    bg: '#fff1e5',
    styles: {
      wrapper: 'font-family: "Georgia", "Noto Serif SC", serif; color: #33302e; line-height: 1.8; padding: 20px 24px; font-size: 16px; background: #fff1e5;',
      h1: 'font-size: 28px; font-weight: 700; margin: 32px 0 12px; color: #33302e; letter-spacing: -0.3px; line-height: 1.2; border-bottom: 1px solid #ccc1b7; padding-bottom: 8px;',
      h2: 'font-size: 22px; font-weight: 600; margin: 24px 0 10px; color: #33302e;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: #66605c;',
      p: 'margin: 8px 0; line-height: 1.85; color: #33302e;',
      blockquote: 'border-left: 4px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 14px 20px; margin: 14px auto; color: {{PRIMARY}}; border-radius: 0 4px 4px 0;',
      code_inline: 'background: {{PRIMARY_BG}}; color: {{PRIMARY}}; padding: 2px 6px; border-radius: 3px; font-size: 90%;',
      code_block: 'background: #262a33; color: #ccc1b7; padding: 18px; border-radius: 6px; font-size: 13px; line-height: 1.6; overflow-x: auto;',
      ul: 'margin: 8px 0; padding-left: 24px;',
      ol: 'margin: 8px 0; padding-left: 24px;',
      li: 'margin: 4px 0; line-height: 1.85;',
      img: 'max-width: 100%; margin: 16px auto; display: block; border-radius: 4px;',
      a: 'color: {{PRIMARY}}; text-decoration: none; border-bottom: 1px solid {{PRIMARY}};',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: {{PRIMARY_BG}}; padding: 10px 14px; border-bottom: 2px solid {{PRIMARY}}; font-weight: bold; text-align: left;',
      td: 'padding: 10px 14px; border-bottom: 1px solid #ccc1b7;',
      hr: 'border: none; border-top: 1px solid #ccc1b7; margin: 28px 0;',
      strong: 'font-weight: 700; color: {{PRIMARY}};',
      em: 'font-style: italic; color: #66605c;',
    }
  },

  medium: {
    name: 'Medium',
    emoji: '📝',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="6.5" cy="12" r="4.5"/><ellipse cx="15" cy="12" rx="2.6" ry="4.2"/><ellipse cx="20.5" cy="12" rx="1.2" ry="3.8"/></svg>',
    desc: 'Medium 博客风格',
    category: 'media',
    accent: '#292929',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: "Charter", "Georgia", "Noto Serif SC", serif; color: #292929; line-height: 1.85; padding: 20px 24px; font-size: 18px;',
      h1: 'font-family: "Lucida Grande", "PingFang SC", sans-serif; font-size: 30px; font-weight: 800; margin: 36px 0 12px; color: #292929; letter-spacing: -0.5px; line-height: 1.25;',
      h2: 'font-family: "Lucida Grande", "PingFang SC", sans-serif; font-size: 22px; font-weight: 700; margin: 28px 0 8px; color: #292929;',
      h3: 'font-family: "Lucida Grande", "PingFang SC", sans-serif; font-size: 18px; font-weight: 600; margin: 20px 0 6px; color: #292929;',
      p: 'margin: 12px 0; line-height: 1.85; color: #292929; letter-spacing: -0.003em;',
      blockquote: 'border-left: 3px solid {{PRIMARY}}; padding: 0 0 0 20px; margin: 20px auto; color: #292929; font-style: italic; font-size: 21px; line-height: 1.58;',
      code_inline: 'background: #f2f2f2; color: #292929; padding: 3px 6px; border-radius: 3px; font-size: 85%;',
      code_block: 'background: #f2f2f2; color: #292929; padding: 20px; border-radius: 6px; font-size: 14px; line-height: 1.6; overflow-x: auto;',
      ul: 'margin: 12px 0; padding-left: 28px;',
      ol: 'margin: 12px 0; padding-left: 28px;',
      li: 'margin: 6px 0; line-height: 1.85;',
      img: 'max-width: 100%; margin: 20px auto; display: block;',
      a: 'color: {{PRIMARY}}; text-decoration: underline;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'padding: 10px 14px; border-bottom: 2px solid {{PRIMARY}}; font-weight: bold; text-align: left;',
      td: 'padding: 10px 14px; border-bottom: 1px solid #e0e0e0;',
      hr: 'border: none; border-top: 1px solid #e0e0e0; margin: 32px auto;',
      strong: 'font-weight: 700; color: {{PRIMARY}};',
      em: 'font-style: italic;',
    }
  },

  // ─── 现代数字系列 ─────────────────────
  apple: {
    name: 'Apple 极简',
    emoji: '🍎',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>',
    desc: '苹果风格极简设计',
    category: 'modern',
    accent: '#0071e3',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif; color: #1d1d1f; line-height: 1.75; padding: 20px 28px; font-size: 17px;',
      h1: 'font-size: 32px; font-weight: 700; margin: 40px 0 16px; color: #1d1d1f; letter-spacing: -0.5px; line-height: 1.15;',
      h2: 'font-size: 24px; font-weight: 600; margin: 32px 0 12px; color: #1d1d1f;',
      h3: 'font-size: 19px; font-weight: 600; margin: 24px 0 8px; color: #1d1d1f;',
      p: 'margin: 10px 0; line-height: 1.75; color: #1d1d1f;',
      blockquote: 'border-left: 3px solid {{PRIMARY}}; padding: 12px 20px; margin: 16px auto; color: #6e6e73; background: #f5f5f7; border-radius: 0 12px 12px 0;',
      code_inline: 'background: #f5f5f7; color: #1d1d1f; padding: 3px 8px; border-radius: 6px; font-size: 88%;',
      code_block: 'background: #1d1d1f; color: #f5f5f7; padding: 20px; border-radius: 14px; font-size: 14px; line-height: 1.7; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 6px 0; line-height: 1.75;',
      img: 'max-width: 100%; border-radius: 16px; margin: 20px auto; display: block;',
      a: 'color: {{PRIMARY}}; text-decoration: none;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: #f5f5f7; padding: 12px 16px; border-bottom: 1px solid #d2d2d7; font-weight: 600; text-align: left;',
      td: 'padding: 12px 16px; border-bottom: 1px solid #d2d2d7;',
      hr: 'border: none; height: 1px; background: #d2d2d7; margin: 32px 0;',
      strong: 'font-weight: 600; color: {{PRIMARY}};',
      em: 'font-style: italic; color: #6e6e73;',
    }
  },

  claude: {
    name: 'Claude',
    emoji: '🤖',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2.5" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="18.7" y2="18.7"/><line x1="18.7" y1="5.3" x2="5.3" y2="18.7"/></svg>',
    desc: 'Anthropic Claude 风格',
    category: 'modern',
    accent: '#c96442',
    bg: '#fffcf5',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; color: #2d2b2a; line-height: 1.8; padding: 20px 24px; font-size: 16px; background: #fffcf5;',
      h1: 'font-size: 26px; font-weight: 700; margin: 32px 0 16px; color: {{PRIMARY}}; letter-spacing: -0.3px;',
      h2: 'font-size: 21px; font-weight: 600; margin: 24px 0 12px; color: {{PRIMARY}}; border-bottom: 2px solid {{PRIMARY_BG}}; padding-bottom: 8px;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: #8b5c3e;',
      p: 'margin: 10px 0; line-height: 1.85; color: #2d2b2a;',
      blockquote: 'border-left: 3px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 14px 20px; margin: 14px auto; color: #5c4a3a; border-radius: 0 8px 8px 0;',
      code_inline: 'background: {{PRIMARY_BG}}; color: {{PRIMARY}}; padding: 2px 8px; border-radius: 5px; font-size: 90%;',
      code_block: 'background: #2d2b2a; color: #f5ede4; padding: 18px; border-radius: 12px; font-size: 13.5px; line-height: 1.7; overflow-x: auto; border: 1px solid #e8dcc8;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 5px 0; line-height: 1.85;',
      img: 'max-width: 100%; border-radius: 12px; margin: 18px auto; display: block; box-shadow: 0 2px 8px rgba(150,100,60,0.1);',
      a: 'color: {{PRIMARY}}; text-decoration: none; border-bottom: 1px solid {{PRIMARY}};',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: {{PRIMARY_BG}}; padding: 10px 14px; border: 1px solid #e8dcc8; font-weight: 600; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #e8dcc8;',
      hr: 'border: none; height: 2px; background: linear-gradient(to right, transparent, {{PRIMARY}}, transparent); margin: 28px 0;',
      strong: 'color: {{PRIMARY}}; font-weight: 600;',
      em: 'font-style: italic; color: #8b7b6b;',
    }
  },

  // ─── V3 新增主题 ─────────────────────
  sspai: {
    name: '少数派',
    emoji: '🔮',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7v11"/><path d="M15 7v8a3 3 0 0 0 3 3"/></svg>',
    desc: 'sspai 清新科技风',
    category: 'modern',
    accent: '#d71a18',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; color: #2b2b2b; line-height: 1.8; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 26px; font-weight: 700; margin: 32px 0 16px; color: {{PRIMARY}}; letter-spacing: -0.3px;',
      h2: 'font-size: 20px; font-weight: 600; margin: 24px 0 12px; color: #2b2b2b; border-left: 4px solid {{PRIMARY}}; padding-left: 12px;',
      h3: 'font-size: 16px; font-weight: 600; margin: 18px 0 8px; color: #444;',
      p: 'margin: 10px 0; line-height: 1.85; color: #2b2b2b;',
      blockquote: 'border-left: 4px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 14px 18px; margin: 14px auto; color: #666; border-radius: 0 6px 6px 0;',
      code_inline: 'background: #f4f4f4; color: {{PRIMARY}}; padding: 2px 8px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #1e1e1e; color: #d4d4d4; padding: 18px; border-radius: 10px; font-size: 13px; line-height: 1.7; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 5px 0; line-height: 1.8;',
      img: 'max-width: 100%; border-radius: 8px; margin: 16px auto; display: block;',
      a: 'color: {{PRIMARY}}; text-decoration: none;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: {{PRIMARY_BG}}; padding: 10px 14px; border: 1px solid #eee; font-weight: 600; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #eee;',
      hr: 'border: none; height: 2px; background: linear-gradient(to right, {{PRIMARY}}, transparent); margin: 28px 0;',
      strong: 'color: {{PRIMARY}}; font-weight: 700;',
      em: 'font-style: italic; color: #888;',
    }
  },

  bamboo: {
    name: '竹林',
    emoji: '🎋',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="10" y1="9" x2="14" y2="9"/><line x1="10" y1="15" x2="14" y2="15"/><path d="M12 11c2.5-3.5 6-4 7-3.5-.5 2-2.5 4.5-7 3.5Z"/><path d="M12 16c-2.5-3-5.5-3.5-6.5-3 .5 1.8 2.2 4 6.5 3Z"/></svg>',
    desc: '中国风绿色雅致',
    category: 'creative',
    accent: '#2e7d32',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: "STKaiti", "KaiTi", "Noto Serif SC", "Georgia", serif; color: #2c3e2d; line-height: 1.9; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 28px; font-weight: 700; text-align: center; margin: 36px 0 20px; color: {{PRIMARY}}; letter-spacing: 4px;',
      h2: 'font-size: 20px; font-weight: 600; margin: 24px 0 14px; color: {{PRIMARY}}; padding-bottom: 8px; border-bottom: 2px solid {{PRIMARY_BG}};',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 10px; color: #3a7d44;',
      p: 'margin: 10px 0; line-height: 2; text-indent: 2em; color: #2c3e2d;',
      blockquote: 'border-left: 4px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 16px 20px; margin: 16px auto; color: {{PRIMARY}}; border-radius: 0 8px 8px 0; font-style: italic;',
      code_inline: 'background: {{PRIMARY_BG}}; color: {{PRIMARY}}; padding: 2px 6px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #1b2a1b; color: #a5d6a7; padding: 18px; border-radius: 8px; font-size: 13px; line-height: 1.7; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 6px 0; line-height: 1.9;',
      img: 'max-width: 100%; border-radius: 8px; margin: 16px auto; display: block; box-shadow: 0 2px 12px rgba(60,120,60,0.1);',
      a: 'color: {{PRIMARY}}; text-decoration: none; border-bottom: 1px dashed {{PRIMARY}};',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: {{PRIMARY_BG}}; padding: 10px 14px; border: 1px solid #c8e6c9; font-weight: 600; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #c8e6c9;',
      hr: 'border: none; height: 1px; background: linear-gradient(to right, transparent, {{PRIMARY}}, transparent); margin: 28px 0;',
      strong: 'color: {{PRIMARY}}; font-weight: 700;',
      em: 'font-style: italic; color: #689f63;',
    }
  },

  dark_night: {
    name: '暗夜模式',
    emoji: '🌃',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/><path d="M19 3v4"/><path d="M21 5h-4"/></svg>',
    desc: '暗色背景高对比',
    category: 'creative',
    accent: '#e94560',
    bg: '#1a1a2e',
    isDark: true,
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: #e0e0e0; line-height: 1.8; padding: 20px 24px; font-size: 16px; background: #1a1a2e;',
      h1: 'font-size: 26px; font-weight: 700; margin: 32px 0 16px; color: {{PRIMARY}}; letter-spacing: -0.3px;',
      h2: 'font-size: 20px; font-weight: 600; margin: 24px 0 12px; color: {{PRIMARY}}; border-left: 4px solid {{PRIMARY}}; padding-left: 12px;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: #ff8a80;',
      p: 'margin: 10px 0; line-height: 1.85; color: #c0c0c0;',
      blockquote: 'border-left: 4px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 14px 18px; margin: 14px auto; color: #e0e0e0; border-radius: 0 8px 8px 0;',
      code_inline: 'background: rgba(255,255,255,0.08); color: #64ffda; padding: 2px 8px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #0f0f1a; color: #a9b1d6; padding: 18px; border-radius: 10px; font-size: 13px; line-height: 1.7; overflow-x: auto; border: 1px solid #16213e;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 5px 0; line-height: 1.85; color: #c0c0c0;',
      img: 'max-width: 100%; border-radius: 10px; margin: 16px auto; display: block;',
      a: 'color: #64ffda; text-decoration: none;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: {{PRIMARY_BG}}; padding: 10px 14px; border: 1px solid #16213e; font-weight: 600; text-align: left; color: {{PRIMARY}};',
      td: 'padding: 10px 14px; border: 1px solid #16213e; color: #c0c0c0;',
      hr: 'border: none; height: 2px; background: linear-gradient(to right, {{PRIMARY}}, #0f3460, {{PRIMARY}}); margin: 28px 0;',
      strong: 'color: {{PRIMARY}}; font-weight: 700;',
      em: 'font-style: italic; color: #888;',
    }
  },

  gradient: {
    name: '渐变彩虹',
    emoji: '🌈',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 17a10 10 0 0 0-20 0"/><path d="M18 17a6 6 0 0 0-12 0"/><path d="M14 17a2 2 0 0 0-4 0"/></svg>',
    desc: '标题彩色渐变效果',
    category: 'creative',
    accent: '#f5576c',
    bg: '#ffffff',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: #333; line-height: 1.8; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 28px; font-weight: 800; margin: 32px 0 16px; color: {{PRIMARY}}; background: linear-gradient(135deg, #f093fb 0%, {{PRIMARY}} 50%, #4facfe 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center;',
      h2: 'font-size: 21px; font-weight: 700; margin: 24px 0 12px; color: {{PRIMARY}}; border-left: 4px solid {{PRIMARY}}; padding-left: 10px;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: {{PRIMARY}};',
      p: 'margin: 10px 0; line-height: 1.85; color: #444;',
      blockquote: 'border-left: 4px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 14px 18px; margin: 14px auto; color: #555; border-radius: 0 6px 6px 0;',
      code_inline: 'background: {{PRIMARY_BG}}; color: {{PRIMARY}}; padding: 2px 8px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #1a1a2e; color: #e0e0e0; padding: 18px; border-radius: 12px; font-size: 13px; line-height: 1.7; overflow-x: auto; border: 1px solid {{PRIMARY}};',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 5px 0; line-height: 1.85;',
      img: 'max-width: 100%; border-radius: 12px; margin: 16px auto; display: block;',
      a: 'color: {{PRIMARY}}; text-decoration: none; border-bottom: 1px solid {{PRIMARY}}; font-weight: 600;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: {{PRIMARY_BG}}; padding: 10px 14px; border: 1px solid #e2e8f0; font-weight: 600; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #e2e8f0;',
      hr: 'border: none; height: 3px; background: linear-gradient(to right, #f093fb, {{PRIMARY}}, #4facfe); margin: 28px 0; border-radius: 2px;',
      strong: 'color: {{PRIMARY}}; font-weight: 800;',
      em: 'font-style: italic; color: #888;',
    }
  },
};

// ─── 预设颜色板 ─────────────────────
const colorPresets = [
  { name: '翡翠绿', color: '#10b981' },
  { name: '天空蓝', color: '#3b82f6' },
  { name: '靛蓝', color: '#4f6ef7' },
  { name: '薰衣紫', color: '#8b5cf6' },
  { name: '玫瑰粉', color: '#ec4899' },
  { name: '珊瑚红', color: '#ef4444' },
  { name: '琥珀橙', color: '#f59e0b' },
  { name: '青碧', color: '#0d9488' },
  { name: '海军蓝', color: '#1e40af' },
  { name: '深玫瑰', color: '#be185d' },
  { name: '石墨灰', color: '#4b5563' },
  { name: '经典蓝', color: '#1890ff' },
];

// ─── 示例 Markdown 内容 ─────────────────
const sampleMarkdown = `# MoPai 墨排 V3

欢迎使用 **MoPai 墨排** V3！✒️ 优雅高效的多平台 Markdown 排版工具。

## 🎯 核心功能

### 1. 实时预览
左侧输入 Markdown，右侧即时查看排版效果。

### 2. 13 种精美主题
> 💡 支持 13 种专业设计主题，涵盖经典公众号、媒体风格、现代数字、创意系列。

### 3. 暗色模式
点击右上角 🌙 图标切换暗色界面，减轻眼睛疲劳。

### 4. 自定义样式
- 🎨 12 种预设颜色 + 自定义取色器
- 🔤 3 种字体风格 + 5 档字号
- 💻 Mac 风格代码块

## 📝 排版示例

### 文字样式

**加粗文字** 和 *斜体文字*，以及 \`行内代码\`。

### 信息卡片

:::tip 💡 使用提示
你可以使用 \`:::info\`、\`:::warning\`、\`:::tip\` 来创建漂亮的信息卡片。
:::

:::warning ⚠️ 注意事项
复制到公众号时，请确保使用「复制到公众号」按钮。
:::

### 代码块

\`\`\`python
def hello():
    """Mac 风格代码块，带三色圆点"""
    print("Hello, Markdown! 🎉")
    return True
\`\`\`

\`\`\`javascript
const themes = ['默认', '技术', '优雅', 'Claude', '暗夜'];
themes.forEach(theme => console.log(\`🎨 \${theme}\`));
\`\`\`

### 表格

| 功能 | 说明 | 状态 |
|------|------|------|
| 13 种主题 | 经典 + 媒体 + 现代 + 创意 | ✅ |
| 暗色模式 | 一键切换 | ✅ |
| 自定义颜色 | 12 预设 + 自选 | ✅ |
| Mac 代码块 | 三色圆点标题栏 | ✅ |
| 格式工具栏 | 快捷插入语法 | ✅ |
| 导出 HTML | 下载排版文件 | ✅ |

### 有序列表

1. 编写 Markdown 内容
2. 选择心仪的样式主题
3. 调整字体和颜色
4. 点击复制到公众号
5. 粘贴到微信编辑器 🎉

---

*由 MoPai 墨排 V3 生成 · 优雅高效的排版工具*
`;

if (typeof globalThis !== 'undefined') {
  globalThis.MoPaiThemes = { themes, colorPresets, sampleMarkdown };
}
