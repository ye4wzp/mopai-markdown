// ============================================
// MoPai 墨排 — 本地「AI 味体检」+「去 AI 味改写」引擎（v2）
// 零依赖 UMD 模块（浏览器 & Node 共用）
// 参考 2026 年持续维护的活跃开源项目（均核验近期提交）：
// - blader/humanizer（74k★, 2026-11）& op7418/Humanizer-zh（23.9k★, 2026-09）：25 类 AI 痕迹分类法
// - MrGeDiao/shuorenhua（2.8k★, 2026-11）：保数字/承诺/原口气、三档改动幅度、去掉宣传腔
// - LifelongLazyLearner/qu-ai-wei（790★, 2026-11）：冻结不可丢失事实、禁止伪造人味、破长状语前置
// - yanstd888/humanizer-lint（117★, 2026-11）：零依赖本地 MATTR 词丰度、n-gram 复读与节奏指标
// ============================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.MoPaiHumanizer = api;
  if (typeof globalThis !== 'undefined') globalThis.MoPaiHumanizer = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ─── 改写口吻风格预设 ───
  const REWRITE_STYLES = {
    plainspoken: {
      id: 'plainspoken',
      name: '白描干货',
      badge: '公众号推荐',
      desc: '克制平实、去空话留事实，用「动作 + 对象 + 结果」替代抽象黑话与官腔',
      instruction: [
        '采用「白描干货」风格（适合公众号深度长文与技术/商业专栏）：',
        '- 语气克制、清醒、有判断，不喊口号、不强行拔高升华。',
        '- 把抽象黑话与「进行+动词」「完成了对…的工作」等官腔还原为直接动词与客观结果。',
        '- 去掉「极致」「完美」「颠覆性」「无需妥协」等只表程度的宣传夸张词，但保留可核查的承诺与数字。',
      ].join('\n'),
    },
    conversational: {
      id: 'conversational',
      name: '真人聊天',
      badge: '小红书 / 知乎',
      desc: '像懂行朋友面对面分享，短句有呼吸感，不端着也不硬玩梗',
      instruction: [
        '采用「真人聊天」风格（适合小红书、知乎与个人经验贴）：',
        '- 像懂行的朋友面对面交代经验，口语自然但克制，不硬加网语、emoji 或浮夸感叹。',
        '- 主动打碎“首先/其次/最后”和强对称排比，多用短句与自然转折。',
        '- 直接说重点，删掉主持腔（“接下来让我们一起看看”）和说明书式预告。',
      ].join('\n'),
    },
    sharp: {
      id: 'sharp',
      name: '锐评观点',
      badge: '专栏评论',
      desc: '开门见山给判断，剔除“一方面…另一方面…”端水腔与假想敌辩论',
      instruction: [
        '采用「锐评观点」风格（适合行业评论与观点专栏）：',
        '- 开门见山抛结论，不做「在当今时代 / 在…背景下」的起跑式铺垫。',
        '- 剔除「一方面…另一方面…」「某种程度上」「有人可能会问」等端水、打圆场与假想敌腔。',
        '- 句子利落有力，长短句拉开对比，突出核心取舍。',
      ].join('\n'),
    },
    concise: {
      id: 'concise',
      name: '极简提纯',
      badge: '压缩水分',
      desc: '直奔核心信息，删铺垫与重复阐释，字数精简 20%–35%（数字与条件全留）',
      instruction: [
        '采用「极简提纯」风格（高信息密度表达）：',
        '- 大刀阔斧删掉招呼、预告、同义重复、元叙事和结尾致谢/升华。',
        '- 原文所有数字、比例、时间条件、承诺与专有名词必须 100% 保留，整体篇幅压缩约 20%–35%。',
        '- 一句话能讲清的绝不拆成两句，避免同义词堆砌。',
      ].join('\n'),
    },
  };

  // ─── 三档改写力度（参考 MrGeDiao/shuorenhua & LifelongLazyLearner/qu-ai-wei） ───
  const REWRITE_INTENSITIES = {
    light: {
      id: 'light',
      name: '轻修保原句',
      desc: '只删套话、重复铺垫与客服残余，原本没毛病的句子尽量不动',
      instruction: '【改写幅度：轻修（in-place）】最小化改动：只清理明确命中的套话、冗余铺垫、官腔与客服残余，尽量保留作者原句结构、段序与口气；拿不准的地方保持原样不动。',
    },
    balanced: {
      id: 'balanced',
      name: '标准去味',
      desc: '清除全部检出病灶、拆官腔、拉长短句节奏，保持原有段落骨架',
      instruction: '【改写幅度：标准（bounded）】保留现有章节标题与主体段落顺序，定点清除全部检出病灶，把黑话/官腔/假想敌/否定排比改写成自然中文，并拉开相邻句长节奏。',
    },
    deep: {
      id: 'deep',
      name: '深度重组',
      desc: '允许拆并句子与重排段落重心、打破机械清单（严禁编造新事实）',
      instruction: '【改写幅度：深度重组（structural）】在 100% 冻结原事实、数据与代码块的前提下，可主动拆并过长/过碎句、重排段内信息顺序、将机械加粗清单化为自然段落，彻底消除模板骨架。',
    },
  };

  // ─── 10 大检测维度元信息 ───
  const DIMENSIONS = {
    cliche_vocab: {
      id: 'cliche_vocab',
      name: '高频 AI 黑话与宣传拔高',
      shortName: '黑话宣传',
      weight: 22,
      tip: '删去空泛宏大词与程度夸张词，换成「谁做了什么、作用对象、产生什么结果」。',
    },
    bureaucratic_verb: {
      id: 'bureaucratic_verb',
      name: '官腔名物化与回避「是/有」',
      shortName: '官腔绕弯',
      weight: 14,
      tip: '把「进行优化 / 完成了对…的调整工作 / 扮演重要角色」改成直接动词（如「调整了…」）。',
    },
    formulaic_syntax: {
      id: 'formulaic_syntax',
      name: '模板句式、假想敌与借权威',
      shortName: '模板句式',
      weight: 18,
      tip: '打碎「不是…而是…」「首先/其次/最后」「有人会问」「专家指出（无出处）」等套路。',
    },
    staged_runup: {
      id: 'staged_runup',
      name: '起跑式铺垫与长状语压主干',
      shortName: '前置铺垫',
      weight: 10,
      tip: '别让「在…背景下 / 基于…前提」把主语压到句尾，直接把核心动作放到开头。',
    },
    chatbot_meta: {
      id: 'chatbot_meta',
      name: '客服残余与元叙事自述',
      shortName: '元叙事',
      weight: 16,
      tip: '直接写事物本身，删掉「本文旨在…」「希望以上内容对您有所帮助」等文档自指。',
    },
    heading_echo: {
      id: 'heading_echo',
      name: '标题-首句结构回声',
      shortName: '标题回声',
      weight: 10,
      tip: '让小标题各司其职，正文首句直接切入事实或细节，不要复述标题。',
    },
    bold_list_slop: {
      id: 'bold_list_slop',
      name: '机械「**加粗词**：解释」清单',
      shortName: '机械清单',
      weight: 10,
      tip: '避免整篇都用相同节奏的加粗冒号条目，适当合并成自然段落或有轻重区分。',
    },
    repeated_pattern: {
      id: 'repeated_pattern',
      name: '句首复读与短语重复',
      shortName: '复读重复',
      weight: 10,
      tip: '避免连续几句用相同词起头，或在同一篇短文里机械复读同一个四字短语。',
    },
    punctuation_tics: {
      id: 'punctuation_tics',
      name: '标点与引号机械癖',
      shortName: '标点癖',
      weight: 8,
      tip: '减少破折号万能连接和给普通词强加双引号的习惯。',
    },
    burstiness_rhythm: {
      id: 'burstiness_rhythm',
      name: '句长节奏过于均匀',
      shortName: '句长节奏',
      weight: 12,
      tip: '拉长/缩短相邻句子，恢复人类写作长短交错的节奏与停顿。',
    },
  };

  // ─── 词库与正则规则 ───
  const CLICHE_RULES = [
    { re: /在当今时代|当今社会|随着.{0,8}的(?:不断|快速|迅猛|飞速)?发展/g, label: '宏大背景起手式', severity: 'high' },
    { re: /值得注意的是|不可否认|毋庸置疑|毫无疑问|显而易见|不难发现|众所周知/g, label: 'AI 惯用强调垫话', severity: 'high' },
    { re: /综上所述|总而言之|由此可见|归根结底|简而言之|换句话说/g, label: '机械总结过渡词', severity: 'high' },
    { re: /赋能|抓手|闭环|提质增效|深耕|全方位|全链路|多维度|立体化|生态体系|精细化运营/g, label: '空泛黑话 / 报告腔', severity: 'high' },
    { re: /深远影响|未来可期|标志着|焕然一新|至关重要|不可或缺|坚实基础|核心引擎|重要里程碑|注入.{0,4}新活力|迈向新台阶|开创.{0,4}新篇章|质的飞跃/g, label: '空洞拔高与宣传腔', severity: 'high' },
    { re: /极致流畅|极致体验|真正做到|无需妥协|颠覆性|划时代|完美解决|无与伦比/g, label: '宣传夸张程度词', severity: 'medium' },
    { re: /某种程度上|在很大程度上|一定程度上|从本质上来说|从某种意义上讲/g, label: '模糊端水限定语', severity: 'medium' },
    { re: /深度剖析|全面解析|一站式|显著提升|极大提升|有效提升|有力推动|深度融合|精准触达/g, label: '模板修饰语', severity: 'medium' },
    { re: /\b(?:delve(?:s|d|ing)?\s+into|tapestry|testament\s+to|pivotal\s+moment|underscore(?:s|d)?\s+the|in\s+today'?s\s+fast-paced|game-?changer|seamlessly|navigating\s+the\s+landscape)\b/gi, label: '英文高频 AI 套词', severity: 'medium' },
  ];

  // 参考 op7418/Humanizer-zh #18（回避“是/有”）& MrGeDiao/shuorenhua（官腔名物化）
  const BUREAUCRATIC_RULES = [
    { re: /进行(?:了)?(?:深入|全面|系统|细致|有效)?(?:的)?(?:分析|处理|调整|优化|管理|开发|探讨|研究|评估|测试|梳理|排查|重构|升级)/g, label: '「进行+名物化动词」官腔', severity: 'medium' },
    { re: /完成了对[^，。！？\n]{1,14}的[^，。！？\n]{1,8}(?:工作|任务|调整|优化|升级)/g, label: '「完成了对…的…工作」绕弯句', severity: 'high' },
    { re: /扮演着?(?:越来越)?(?:重要|关键|核心|不可或缺)的?角色/g, label: '「扮演…角色」回避直接谓语', severity: 'medium' },
    { re: /(?:作为|成为)[^，。！？\n]{1,12}而存在/g, label: '「作为…而存在」翻译腔', severity: 'medium' },
    { re: /展现出(?:了)?(?:强大|卓越|出色|明显|巨大)的/g, label: '「展现出…的」间接修饰', severity: 'medium' },
  ];

  const FORMULA_RULES = [
    { re: /不是[^，。！？\n]{1,20}[，,]?\s*而是/g, label: '「不是…而是…」否定排比', severity: 'high' },
    { re: /不仅仅?是[^，。！？\n]{1,20}[，,]?\s*更(?:是|在于|重要)/g, label: '「不仅是…更是…」递进模板', severity: 'high' },
    { re: /不再只是[^，。！？\n]{1,20}[，,]?\s*而是/g, label: '「不再只是…而是…」套式', severity: 'medium' },
    { re: /一方面[^。！？\n]{2,36}另一方面/g, label: '「一方面…另一方面…」对称端水腔', severity: 'medium' },
    { re: /这不仅[^。！？\n]{2,28}(?:意义|价值|影响|体现|展现|说明)/g, label: '段尾空泛升华句式', severity: 'high' },
    { re: /为[^，。！？\n]{2,18}奠定了(?:坚实|良好)?基础/g, label: '「为…奠定基础」报告尾句', severity: 'medium' },
    // 参考 blader/humanizer #5（假想敌辩论）& #17（借权威无出处）
    { re: /(?:有人|很多人|不少读者|你)(?:可能)?(?:会问|会觉得|往往以为|常常误以为)/g, label: '与假想敌辩论（自设靶子）', severity: 'medium' },
    { re: /(?:业内|行业)?专家(?:普遍)?(?:指出|认为|表示)|(?:多项|大量|有关)?研究(?:表明|显示)|业界普遍认为/g, label: '无出处借权威（缺少具体来源）', severity: 'medium' },
  ];

  // 参考 blader/humanizer #4（起跑式铺垫）& qu-ai-wei（长状语压后主干）
  const STAGED_RUNUP_RULES = [
    { re: /在[^，。！？\n]{4,24}的(?:大)?背景下[，,]/g, label: '「在…背景下」起跑式铺垫', severity: 'medium' },
    { re: /基于[^，。！？\n]{4,20}的(?:原则|前提|考量|需求|背景)[，,]/g, label: '「基于…的考量」前置压主干', severity: 'medium' },
    { re: /(?:说到这里|坦白说|老实说|事实上|归根到底)[，,]\s*(?:我们需要|你必须|真正重要的是)/g, label: '舞台指令式起跑垫句', severity: 'medium' },
  ];

  const CHATBOT_META_RULES = [
    { re: /(?:(?:好的|当然可以|没问题|明白了|收到)[，,！!\s]*){1,3}(?:以下|下面|接下来|我来|为您|这是)/g, label: 'AI 对话开场残余', severity: 'high', cleanable: true },
    { re: /大家好[，,]\s*(?:下面|今天)我来给大家(?:详细)?(?:汇报|介绍|分享)/g, label: '冗余汇报开场白', severity: 'medium', cleanable: true },
    { re: /希望(?:这|以上|本文|这些)(?:内容|建议|回答)?(?:能够?)?(?:帮到您|帮到你|对您有所帮助|对你有所帮助|有所启发)[。！!]?/g, label: 'AI 客服式结尾残余', severity: 'high', cleanable: true },
    { re: /如果您还有(?:任何|其他)(?:问题|疑问|需求)[^。\n]{0,24}[。！!]?/g, label: 'AI 客服式追问残余', severity: 'high', cleanable: true },
    { re: /以上就是[^。\n]{0,16}(?:全部|所有)(?:内容|进展|分享)[，,]?\s*(?:感谢大家的?(?:关注|阅读|观看|支持))[！!。]?/g, label: '模板化致谢收尾', severity: 'medium', cleanable: true },
    { re: /让我们(?:拭目以待|一起(?:来看|探索|深入|揭开))/g, label: 'AI 主持腔过渡语', severity: 'medium' },
    { re: /本文(?:旨在|将)(?:探讨|介绍|深入分析|全面解析|为您(?:介绍|解析|梳理))/g, label: '元叙事（谈论文档本身）', severity: 'high' },
    { re: /(?:通过|从)(?:上述|以上|下面)(?:表格|对比|分析|内容)可以看出/g, label: '元叙事（自指图表/前文）', severity: 'medium' },
    { re: /接下来[，,]?我们将从以下(?:几个)?方面/g, label: '说明书式目录预告', severity: 'medium' },
  ];

  // ─── 工具函数：Markdown 安全遮罩（保留原始字符偏移与行号） ───
  function buildLineIndex(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') starts.push(i + 1);
    }
    return starts;
  }

  function offsetToLine(lineStarts, offset) {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid] <= offset) lo = mid + 1;
      else hi = mid - 1;
    }
    return Math.max(0, hi);
  }

  function maskNonProse(markdown) {
    const text = String(markdown || '');
    const chars = text.split('');
    const maskRange = (start, end) => {
      for (let i = start; i < end && i < chars.length; i++) {
        if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
      }
    };

    const fm = text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    if (fm) maskRange(0, fm[0].length);

    const lines = text.split('\n');
    let offset = 0;
    let inFence = false;
    let fenceChar = '';
    let fenceLen = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!inFence) {
        const open = trimmed.match(/^(`{3,}|~{3,})/);
        if (open) {
          inFence = true;
          fenceChar = open[1][0];
          fenceLen = open[1].length;
          maskRange(offset, offset + line.length);
        }
      } else {
        maskRange(offset, offset + line.length);
        const closeRe = new RegExp('^' + fenceChar + '{' + fenceLen + ',}\\s*$');
        if (closeRe.test(trimmed)) inFence = false;
      }
      offset += line.length + 1;
    }

    let masked = chars.join('');
    const inlineMaskPatterns = [
      /`[^`\n]+`/g,
      /!\[[^\]]*\]\([^)]*\)/g,
      /\]\([^)]*\)/g,
      /https?:\/\/[^\s)>"']+/g,
      /<[^>]+>/g,
    ];
    for (const re of inlineMaskPatterns) {
      masked = masked.replace(re, (m) => m.replace(/[^\r\n]/g, ' '));
    }
    return masked;
  }

  function stripMarkdownSyntaxForStats(text) {
    return String(text || '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^:::\w*.*$/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\[([^\]]+)\]/g, '$1');
  }

  function extractSnippet(lines, lineIdx, matchText) {
    const raw = (lines[lineIdx] || '').trim();
    if (raw.length <= 56) return raw;
    const pos = matchText ? raw.indexOf(matchText) : -1;
    if (pos === -1) return raw.slice(0, 56) + '…';
    const start = Math.max(0, pos - 16);
    const end = Math.min(raw.length, pos + matchText.length + 22);
    return (start > 0 ? '…' : '') + raw.slice(start, end) + (end < raw.length ? '…' : '');
  }

  // ─── 冻结事实提取与改写后保真核验（参考 shuorenhua & qu-ai-wei） ───
  function extractFrozenAnchors(markdown) {
    const raw = String(markdown || '');
    const masked = maskNonProse(raw);
    const anchors = new Set();

    // 1. 关键数字 + 单位 / 百分比 / 耗时 / 倍数（跳过纯序号行首 1. 2.）
    const numRe = /(?<![A-Za-z0-9.])\d+(?:\.\d+)?(?:\s*(?:%|‰|倍|次|个|条|项|件|万|亿|千|百|元|美元|天|小时|分钟|秒|ms|s|px|KB|MB|GB|TB|年|月|日|周))(?![A-Za-z0-9])/gi;
    for (const m of masked.matchAll(numRe)) {
      anchors.add(m[0].replace(/\s+/g, ''));
    }

    // 2. 明确时间节点 / 截止条件（如 周五前 / 下周三 / 2026年）
    const timeRe = /(?:周[一二三四五六日天]|星期[一二三四五六日天]|今明两天|本月底|下周[一二三四五六日天]?)(?:前|底|内)?/g;
    for (const m of masked.matchAll(timeRe)) {
      anchors.add(m[0]);
    }

    // 3. 外链 URL（从原文提取）
    for (const m of raw.matchAll(/https?:\/\/[^\s)>'"\]]+/g)) {
      anchors.add(m[0]);
    }

    // 4. 围栏代码块数量
    const fenceCount = (raw.match(/^\s*(`{3,}|~{3,})/gm) || []).length >> 1;

    return {
      items: [...anchors].slice(0, 24),
      fenceCount,
    };
  }

  function verifyFidelity(beforeText, afterText) {
    const beforeAnchors = extractFrozenAnchors(beforeText);
    const afterNorm = String(afterText || '').replace(/\s+/g, '');
    const afterRaw = String(afterText || '');
    const missing = [];
    for (const item of beforeAnchors.items) {
      const needle = item.startsWith('http') ? item : item.replace(/\s+/g, '');
      const hay = item.startsWith('http') ? afterRaw : afterNorm;
      if (!hay.includes(needle)) missing.push(item);
    }
    const afterFences = (afterRaw.match(/^\s*(`{3,}|~{3,})/gm) || []).length >> 1;
    const codeBlockLost = afterFences < beforeAnchors.fenceCount;

    return {
      total: beforeAnchors.items.length,
      missing,
      codeBlockLost,
      ok: missing.length === 0 && !codeBlockLost,
    };
  }

  // ─── MATTR 滑动窗口词汇丰富度（参考 humanizer-lint，避免长文 TTR 失真） ───
  function computeMattr(plainText, windowSize = 48) {
    const hanOnly = plainText.replace(/[^\u4e00-\u9fa5]/g, '');
    if (hanOnly.length < 30) return null;
    const bigrams = [];
    for (let i = 0; i < hanOnly.length - 1; i++) bigrams.push(hanOnly.slice(i, i + 2));
    if (bigrams.length <= windowSize) {
      return Math.round((new Set(bigrams).size / bigrams.length) * 100) / 100;
    }
    let sum = 0;
    const steps = bigrams.length - windowSize + 1;
    const stride = Math.max(1, Math.floor(steps / 40));
    let count = 0;
    for (let i = 0; i < steps; i += stride) {
      sum += new Set(bigrams.slice(i, i + windowSize)).size / windowSize;
      count++;
    }
    return Math.round((sum / Math.max(1, count)) * 100) / 100;
  }

  // ─── 核心体检分析函数（纯本地毫秒级，10 维检测） ───
  function analyzeAiFlavor(markdown) {
    const raw = String(markdown || '');
    const masked = maskNonProse(raw);
    const lines = raw.split('\n');
    const maskedLines = masked.split('\n');
    const lineStarts = buildLineIndex(raw);

    const plainText = stripMarkdownSyntaxForStats(masked).replace(/\s+/g, ' ').trim();
    const proseChars = plainText.replace(/\s+/g, '').length;

    if (proseChars < 20) {
      return {
        score: 0,
        level: 'clean',
        levelLabel: '文本过短',
        proseChars,
        sentenceCount: 0,
        avgSentenceLen: 0,
        burstinessCv: null,
        lexicalDiversity: null,
        frozenCount: 0,
        dimensions: {},
        issues: [],
        cleanableCount: 0,
      };
    }

    const issues = [];
    const pushIssue = (item) => {
      issues.push({ id: `${item.category}-${issues.length + 1}`, ...item });
    };

    const runRules = (category, rules) => {
      for (const rule of rules) {
        const re = new RegExp(rule.re.source, rule.re.flags);
        let m;
        while ((m = re.exec(masked)) !== null) {
          const line = offsetToLine(lineStarts, m.index);
          pushIssue({
            category,
            severity: rule.severity,
            label: rule.label,
            match: m[0],
            line,
            start: m.index,
            end: m.index + m[0].length,
            snippet: extractSnippet(lines, line, m[0]),
            suggestion: DIMENSIONS[category].tip,
            cleanable: Boolean(rule.cleanable),
          });
        }
      }
    };

    // 1–5. 词库、官腔、模板句式、前置铺垫、客服/元叙事
    runRules('cliche_vocab', CLICHE_RULES);
    runRules('bureaucratic_verb', BUREAUCRATIC_RULES);
    runRules('formulaic_syntax', FORMULA_RULES);
    runRules('staged_runup', STAGED_RUNUP_RULES);
    runRules('chatbot_meta', CHATBOT_META_RULES);

    // 机械「首先/其次/最后」或「第一/第二/第三」序列
    const seqMatches = [...masked.matchAll(/(?:首先|其次|再次|最后|第一|第二|第三)[，,、：:\s]/g)];
    const seqSet = new Set(seqMatches.map((m) => m[0].slice(0, 2)));
    const hasFirstSeq = seqSet.has('首先') && seqSet.has('其次') && (seqSet.has('最后') || seqSet.has('再次'));
    const hasNumSeq = seqSet.has('第一') && seqSet.has('第二') && seqSet.has('第三');
    if (hasFirstSeq || hasNumSeq) {
      const firstHit = seqMatches[0];
      const line = offsetToLine(lineStarts, firstHit.index);
      pushIssue({
        category: 'formulaic_syntax',
        severity: 'high',
        label: hasFirstSeq ? '「首先/其次/最后」机械多段论' : '「第一/第二/第三」模板枚举',
        match: firstHit[0].trim(),
        line,
        start: firstHit.index,
        end: firstHit.index + firstHit[0].length,
        snippet: extractSnippet(lines, line, firstHit[0].trim()),
        suggestion: '打散顺序连接词，直接按逻辑因果或轻重缓急推进。',
      });
    }

    // 6. 标题-首句结构回声（规则 24）
    for (let i = 0; i < maskedLines.length; i++) {
      const hMatch = maskedLines[i].match(/^#{1,4}\s+(.+)$/);
      if (!hMatch) continue;
      const headingCore = hMatch[1]
        .replace(/[*_`~]/g, '')
        .replace(/^(?:\d+[.、\s]+|[一二三四五六七八九十]+[、.\s]+)/, '')
        .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
        .trim();
      if (headingCore.length < 3) continue;

      let nextIdx = i + 1;
      while (nextIdx < maskedLines.length && !maskedLines[nextIdx].trim()) nextIdx++;
      if (nextIdx >= maskedLines.length) continue;
      const nextLine = maskedLines[nextIdx].trim();
      if (/^(?:#|[-*+]|\d+\.|>|:::|\|)/.test(nextLine)) continue;

      const firstClause = nextLine.split(/[。！？!?\n]/)[0].replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
      const prefix = headingCore.slice(0, Math.min(6, headingCore.length));
      if (firstClause.length >= prefix.length && firstClause.slice(0, prefix.length + 6).includes(prefix)) {
        const lineStart = lineStarts[nextIdx] || 0;
        const origLine = lines[nextIdx] || '';
        pushIssue({
          category: 'heading_echo',
          severity: 'medium',
          label: '标题-首句回声重复',
          match: prefix,
          line: nextIdx,
          start: lineStart,
          end: lineStart + Math.min(origLine.length, 28),
          snippet: `标题「${hMatch[1].trim().slice(0, 14)}」→ 首句「${origLine.trim().slice(0, 26)}…」`,
          suggestion: DIMENSIONS.heading_echo.tip,
        });
      }
    }

    // 7. 机械「**加粗词**：解释」连续清单体
    let boldRunStart = -1;
    let boldRunCount = 0;
    const flushBoldRun = () => {
      if (boldRunCount >= 3 && boldRunStart >= 0) {
        const startOff = lineStarts[boldRunStart] || 0;
        pushIssue({
          category: 'bold_list_slop',
          severity: boldRunCount >= 4 ? 'high' : 'medium',
          label: `连续 ${boldRunCount} 条「**加粗词**：解释」模板清单`,
          match: (lines[boldRunStart] || '').trim().slice(0, 24),
          line: boldRunStart,
          start: startOff,
          end: startOff + (lines[boldRunStart] || '').length,
          snippet: extractSnippet(lines, boldRunStart, ''),
          suggestion: DIMENSIONS.bold_list_slop.tip,
        });
      }
      boldRunStart = -1;
      boldRunCount = 0;
    };
    for (let i = 0; i < maskedLines.length; i++) {
      const trimmed = maskedLines[i].trim();
      if (/^(?:[-*+]|\d+\.)\s+\*\*[^*]{1,22}\*\*\s*[：:]/.test(trimmed)) {
        if (boldRunStart === -1) boldRunStart = i;
        boldRunCount++;
      } else if (trimmed !== '') {
        flushBoldRun();
      }
    }
    flushBoldRun();

    // 8. 句式开头复读（参考 blader/humanizer #7 & humanizer-lint）
    const proseLines = [];
    for (let i = 0; i < maskedLines.length; i++) {
      const t = stripMarkdownSyntaxForStats(maskedLines[i]).trim();
      if (t.length >= 10 && !/^#/.test(maskedLines[i].trim())) {
        proseLines.push({ line: i, text: t, head: t.slice(0, 2) });
      }
    }
    let headRun = 1;
    for (let i = 1; i <= proseLines.length; i++) {
      if (i < proseLines.length && proseLines[i].head === proseLines[i - 1].head && /^[\u4e00-\u9fa5]{2}$/.test(proseLines[i].head)) {
        headRun++;
      } else {
        if (headRun >= 3) {
          const first = proseLines[i - headRun];
          const off = lineStarts[first.line] || 0;
          pushIssue({
            category: 'repeated_pattern',
            severity: 'medium',
            label: `连续 ${headRun} 行以「${first.head}…」重复起头`,
            match: first.head,
            line: first.line,
            start: off,
            end: off + 2,
            snippet: extractSnippet(lines, first.line, first.head),
            suggestion: DIMENSIONS.repeated_pattern.tip,
          });
        }
        headRun = 1;
      }
    }

    // 9. 标点与引号机械癖
    const emDashes = [...masked.matchAll(/——|—/g)];
    const emDashPer500 = (emDashes.length * 500) / Math.max(200, proseChars);
    if (emDashes.length >= 3 && emDashPer500 >= 2.2) {
      const hit = emDashes[0];
      const line = offsetToLine(lineStarts, hit.index);
      pushIssue({
        category: 'punctuation_tics',
        severity: emDashPer500 >= 4 ? 'high' : 'medium',
        label: `破折号高频（共 ${emDashes.length} 处）`,
        match: hit[0],
        line,
        start: hit.index,
        end: hit.index + hit[0].length,
        snippet: extractSnippet(lines, line, hit[0]),
        suggestion: '把部分破折号改成逗号、句号或拆成两句短句。',
      });
    }

    const scareQuotes = [...masked.matchAll(/[“「]([\u4e00-\u9fa5]{2,4})[”」]/g)];
    const scarePer500 = (scareQuotes.length * 500) / Math.max(250, proseChars);
    if (scareQuotes.length >= 4 && scarePer500 >= 3.2) {
      const hit = scareQuotes[0];
      const line = offsetToLine(lineStarts, hit.index);
      pushIssue({
        category: 'punctuation_tics',
        severity: 'medium',
        label: `过度引号强调（共 ${scareQuotes.length} 处短词引号）`,
        match: hit[0],
        line,
        start: hit.index,
        end: hit.index + hit[0].length,
        snippet: extractSnippet(lines, line, hit[0]),
        suggestion: '普通概念不必反复加双引号，去掉非必要的“伪重点”引号。',
      });
    }

    // 10. 句长节奏突发性（Burstiness CV）与滑动窗口 MATTR 词丰度
    const sentences = plainText
      .split(/[。！？!?]+|\n+/)
      .map((s) => s.replace(/\s+/g, '').trim())
      .filter((s) => s.length >= 6);

    let avgSentenceLen = 0;
    let burstinessCv = null;
    const lexicalDiversity = computeMattr(plainText);

    if (sentences.length > 0) {
      const lens = sentences.map((s) => s.length);
      avgSentenceLen = Math.round((lens.reduce((a, b) => a + b, 0) / lens.length) * 10) / 10;
      if (sentences.length >= 6) {
        const variance = lens.reduce((acc, l) => acc + Math.pow(l - avgSentenceLen, 2), 0) / lens.length;
        const std = Math.sqrt(variance);
        burstinessCv = Math.round((std / Math.max(1, avgSentenceLen)) * 100) / 100;
        if (burstinessCv < 0.34) {
          pushIssue({
            category: 'burstiness_rhythm',
            severity: burstinessCv < 0.25 ? 'high' : 'medium',
            label: `句长过于均匀（变异系数 CV = ${burstinessCv}）`,
            match: '',
            line: 0,
            start: 0,
            end: 0,
            snippet: `平均句长 ${avgSentenceLen} 字，缺乏长短句错落（自然写作通常 CV ≥ 0.42）`,
            suggestion: DIMENSIONS.burstiness_rhythm.tip,
          });
        }
      }
    }

    // ─── 综合评分计算（0–100，按篇幅温和归一化） ───
    const normFactor = Math.max(1, proseChars / 450);
    const dimScores = {};
    let totalScore = 0;
    const fixedDims = new Set(['burstiness_rhythm', 'heading_echo', 'bold_list_slop', 'repeated_pattern']);

    for (const [key, spec] of Object.entries(DIMENSIONS)) {
      const dimIssues = issues.filter((it) => it.category === key);
      let rawPts = 0;
      for (const it of dimIssues) rawPts += it.severity === 'high' ? 10 : 6;
      const adjusted = fixedDims.has(key) ? rawPts : rawPts / Math.pow(normFactor, 0.55);
      const capped = Math.min(spec.weight, Math.round(adjusted));
      dimScores[key] = {
        name: spec.name,
        shortName: spec.shortName,
        count: dimIssues.length,
        score: capped,
        max: spec.weight,
      };
      totalScore += capped;
    }

    const score = Math.min(100, Math.max(0, Math.round(totalScore)));
    let level = 'clean';
    let levelLabel = '自然人味';
    if (score >= 70) { level = 'heavy'; levelLabel = '重度模板腔'; }
    else if (score >= 45) { level = 'moderate'; levelLabel = '明显 AI 腔'; }
    else if (score >= 21) { level = 'mild'; levelLabel = '轻微 AI 痕'; }

    const sevRank = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || (a.line - b.line));

    const frozen = extractFrozenAnchors(raw);

    return {
      score,
      level,
      levelLabel,
      proseChars,
      sentenceCount: sentences.length,
      avgSentenceLen,
      burstinessCv,
      lexicalDiversity,
      frozenCount: frozen.items.length,
      dimensions: dimScores,
      issues,
      cleanableCount: issues.filter((i) => i.cleanable).length,
    };
  }

  // ─── 一键本地无损清理（仅清 100% 安全的 AI 客服/汇报开场与结尾残余，自动跳过代码块） ───
  function quickCleanLocal(markdown) {
    const raw = String(markdown || '');
    const hadTrailingNewline = raw.endsWith('\n');
    const lines = raw.split('\n');
    const safeLineRes = [
      /^\s*(?:(?:好的|当然可以|没问题|明白了|收到)[，,！!\s]*){1,3}(?:以下|下面|接下来|我来|为您|这是)[^\n]*$/,
      /^\s*大家好[，,]\s*(?:下面|今天)我来给大家(?:详细)?(?:汇报|介绍|分享)[^\n]*$/,
      /^\s*希望(?:这|以上|本文|这些)(?:内容|建议|回答)?(?:能够?)?(?:帮到您|帮到你|对您有所帮助|对你有所帮助|有所启发)[。！!]?\s*$/,
      /^\s*如果您还有(?:任何|其他)(?:问题|疑问|需求)[^\n]*[。！!]?\s*$/,
      /^\s*以上就是[^。\n]{0,16}(?:全部|所有)(?:内容|进展|分享)[，,]?\s*(?:感谢大家的?(?:关注|阅读|观看|支持))[！!。]?\s*$/,
    ];

    let inFence = false;
    let fenceChar = '';
    let fenceLen = 0;
    let removed = 0;
    const kept = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!inFence) {
        const open = trimmed.match(/^(`{3,}|~{3,})/);
        if (open) {
          inFence = true;
          fenceChar = open[1][0];
          fenceLen = open[1].length;
          kept.push(line);
          continue;
        }
      } else {
        kept.push(line);
        if (new RegExp('^' + fenceChar + '{' + fenceLen + ',}\\s*$').test(trimmed)) {
          inFence = false;
        }
        continue;
      }

      if (safeLineRes.some((re) => re.test(line))) removed++;
      else kept.push(line);
    }

    const joined = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { text: joined + (hadTrailingNewline && joined ? '\n' : ''), removed };
  }

  // ─── 构造「病灶驱动 + 事实冻结」的去 AI 味改写 Prompt ───
  function buildRewriteMessages(sourceText, styleId = 'plainspoken', report = null, isSelection = false, intensityId = 'balanced') {
    const style = REWRITE_STYLES[styleId] || REWRITE_STYLES.plainspoken;
    const intensity = REWRITE_INTENSITIES[intensityId] || REWRITE_INTENSITIES.balanced;
    const audit = report || analyzeAiFlavor(sourceText);
    const frozen = extractFrozenAnchors(sourceText);

    // 按维度轮询抽样，确保结构/官腔/节奏病灶不被高频词挤出
    const byCat = new Map();
    for (const it of audit.issues) {
      if (!byCat.has(it.category)) byCat.set(it.category, []);
      byCat.get(it.category).push(it);
    }
    const sampled = [];
    const queues = [...byCat.values()];
    while (sampled.length < 16 && queues.some((q) => q.length > 0)) {
      for (const q of queues) {
        if (q.length > 0 && sampled.length < 16) sampled.push(q.shift());
      }
    }

    const findingLines = sampled.map((it, idx) =>
      `${idx + 1}. [L${it.line + 1}] ${it.label}${it.match ? `（命中：「${it.match}」）` : ''} — ${it.suggestion}`
    );

    const systemPrompt = [
      '你是资深中文非虚构编辑，擅长消除大模型生成文本的机械腔、官腔、翻译腔与空泛套话，同时原样保护事实、数据与 Markdown 排版。',
      '',
      '## 目标口吻风格',
      style.instruction,
      '',
      '## 改写力度控制',
      intensity.instruction,
      '',
      '## 六条编辑铁律（必须严格遵守）',
      '1. **严守事实，绝不编造**：原文没有给出数字、案例、人名、时间或个人经历时，绝不为了显得“像真人”而凭空杜撰；信息空洞处宁可删水，绝不加戏。',
      '2. **反矫枉过正**：自然不等于油腻或口语化；禁止为了制造“人味”而硬塞网语、错别字、emoji、感叹号或虚假的个人情绪。',
      '3. **还原直接动词，拆解官腔黑话**：把「进行优化 / 完成了对…的调整工作 / 赋能 / 闭环」改写成具体动作与结果，不做机械同义词替换。',
      '4. **打碎模板节奏**：消除否定排比、假想敌提问、无出处借权威、长状语前置、标题-首句复读与连续「**加粗词**：解释」清单；拉开相邻句子的长短变化。',
      '5. **无损保留 Markdown 与技术内容**：YAML frontmatter、所有 ``` 代码块、行内 `代码`、图片 `![](...)`、超链接 URL、`:::tip` 卡片与表格数据必须原样保留。',
      '6. **纯净输出**：只输出改写后的' + (isSelection ? '该段落' : '完整') + ' Markdown 文本本身，禁止附带任何开场白、修改说明或外层 ```markdown 围栏。',
      '',
      frozen.items.length
        ? '## 冻结事实锚点（改写后必须完整保留，不可遗漏或篡改）\n' + frozen.items.join('、')
        : '',
      '',
      findingLines.length
        ? '## 本次本地体检已检出的具体病灶（请定点清除）\n' + findingLines.join('\n')
        : '## 体检提示\n全文整体较干净，请按设定力度微调句长节奏与动词精准度。',
    ].filter((s) => s !== null).join('\n').replace(/\n{3,}/g, '\n\n');

    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `请按「${style.name} · ${intensity.name}」对以下${isSelection ? '选中片段' : '文章'}去 AI 味并直接输出改写结果：\n\n${sourceText}`,
      },
    ];
  }

  function sanitizeRewriteOutput(rawOutput, originalText) {
    let out = String(rawOutput || '').trim();
    const fence = out.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
    if (fence) out = fence[1].trim();
    const origFm = String(originalText || '').match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    if (origFm && !/^---\r?\n/.test(out)) {
      out = origFm[0] + '\n' + out;
    }
    return out;
  }

  // ─── 零依赖行级 LCS Diff（供改前/改后可视化确认） ───
  function computeLineDiff(beforeText, afterText) {
    const a = String(beforeText || '').split('\n');
    const b = String(afterText || '').split('\n');
    const m = a.length;
    const n = b.length;

    if (m * n > 120000) {
      let head = 0;
      while (head < m && head < n && a[head] === b[head]) head++;
      let tail = 0;
      while (tail < m - head && tail < n - head && a[m - 1 - tail] === b[n - 1 - tail]) tail++;
      const rows = [];
      for (let i = 0; i < head; i++) rows.push({ type: 'same', text: a[i] });
      for (let i = head; i < m - tail; i++) rows.push({ type: 'del', text: a[i] });
      for (let j = head; j < n - tail; j++) rows.push({ type: 'add', text: b[j] });
      for (let i = m - tail; i < m; i++) rows.push({ type: 'same', text: a[i] });
      return summarizeDiff(rows);
    }

    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const rows = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) { rows.push({ type: 'same', text: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) rows.push({ type: 'del', text: a[i++] });
      else rows.push({ type: 'add', text: b[j++] });
    }
    while (i < m) rows.push({ type: 'del', text: a[i++] });
    while (j < n) rows.push({ type: 'add', text: b[j++] });

    return summarizeDiff(rows);
  }

  function summarizeDiff(rows) {
    let added = 0;
    let removed = 0;
    for (const r of rows) {
      if (r.type === 'add') added++;
      else if (r.type === 'del') removed++;
    }
    const compact = [];
    let sameBuf = [];
    const flushSame = () => {
      if (!sameBuf.length) return;
      if (sameBuf.length <= 2) {
        compact.push(...sameBuf);
      } else {
        compact.push(sameBuf[0]);
        compact.push({ type: 'fold', count: sameBuf.length - 2, text: `… 省略 ${sameBuf.length - 2} 行未改动内容 …` });
        compact.push(sameBuf[sameBuf.length - 1]);
      }
      sameBuf = [];
    };
    for (const r of rows) {
      if (r.type === 'same') sameBuf.push(r);
      else { flushSame(); compact.push(r); }
    }
    flushSame();
    return { rows, compact, added, removed, changed: added > 0 || removed > 0 };
  }

  // ─── 提取纯正文供外部检测器（如腾讯朱雀网页版）免干扰检测 ───
  // 自动剥离 YAML frontmatter、代码块、行内代码、图片/URL 与 Markdown 标记符号
  function extractPlainTextForDetector(markdown) {
    const raw = String(markdown || '');
    const stripped = raw
      .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
      .replace(/```[\s\S]*?```/g, '\n')
      .replace(/~~~[\s\S]*?~~~/g, '\n')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`[^`\n]+`/g, '')
      .replace(/^:::\w*.*$/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, '')
      .replace(/^\s*[-*_]{3,}\s*$/gm, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return stripped;
  }

  return {
    REWRITE_STYLES,
    REWRITE_INTENSITIES,
    DIMENSIONS,
    analyzeAiFlavor,
    extractFrozenAnchors,
    verifyFidelity,
    extractPlainTextForDetector,
    quickCleanLocal,
    buildRewriteMessages,
    sanitizeRewriteOutput,
    computeLineDiff,
    maskNonProse,
  };
});
