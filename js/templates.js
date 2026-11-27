// ============================================
// MoPai 墨排 — 模板库
// ============================================

const templateLibrary = [
  {
    key: 'tech-tutorial',
    name: '💻 技术教程',
    title: '技术教程',
    color: '#4f6ef7',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><polyline points="8 10 11 12.5 8 15"/><line x1="13" y1="15" x2="16.5" y2="15"/></svg>',
    desc: '编程教程、工具使用指南',
    content: `# 技术教程标题

## 前言

简要介绍本文要讲什么，解决什么问题。

## 环境准备

- 操作系统：
- 语言/框架版本：
- 必要工具：

## 步骤一：基础配置

详细描述第一步操作...

\`\`\`bash
# 命令示例
\`\`\`

## 步骤二：核心实现

详细描述第二步操作...

\`\`\`javascript
// 代码示例
\`\`\`

## 步骤三：测试验证

如何验证结果是否正确...

## 常见问题

### Q1: 遇到 xxx 错误怎么办？

解决方案...

## 总结

回顾要点，给出延伸阅读链接。
`
  },
  {
    key: 'product-review',
    name: '📦 产品评测',
    title: '产品评测',
    color: '#f59e0b',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7L12 2.5Z"/><polyline points="3.5 7 12 11.5 20.5 7"/><line x1="12" y1="11.5" x2="12" y2="21.5"/></svg>',
    desc: '科技产品、工具评测',
    content: `# 产品名称 评测

## 产品概述

| 项目 | 详情 |
|------|------|
| 品牌 |  |
| 型号 |  |
| 价格 |  |
| 购入渠道 |  |

## 外观设计

对外观、材质、做工的描述...

## 功能体验

### 核心功能

功能 1 的使用体验...

### 特色功能

与竞品不同的亮点...

## 优缺点

**优点：**
- ✅ 
- ✅ 

**缺点：**
- ❌ 
- ❌ 

## 综合评分

| 维度 | 评分 (1-10) |
|------|-------------|
| 外观 |  |
| 性能 |  |
| 性价比 |  |

## 购买建议

适合 / 不适合什么样的用户...
`
  },
  {
    key: 'weekly-report',
    name: '📊 周报/月报',
    title: '周报 / 月报',
    color: '#10b981',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>',
    desc: '工作汇报、项目总结',
    content: `# 周报 | YYYY.MM.DD - MM.DD

## 本周完成

### 项目 A
- [x] 任务 1
- [x] 任务 2
- [ ] 任务 3（进行中）

### 项目 B
- [x] 任务 1

## 关键数据

| 指标 | 上周 | 本周 | 变化 |
|------|------|------|------|
|  |  |  |  |

## 遇到的问题

1. **问题描述**
   - 原因分析：
   - 解决方案：

## 下周计划

- [ ] 计划 1
- [ ] 计划 2
- [ ] 计划 3

## 需要的支持

- 
`
  },
  {
    key: 'interview',
    name: '🎯 面试经验',
    title: '面试经验',
    color: '#8b5cf6',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
    desc: '面试复盘、经验分享',
    content: `# 公司名 - 岗位名 面试经验

## 基本信息

| 项目 | 详情 |
|------|------|
| 公司 |  |
| 岗位 |  |
| 面试时间 |  |
| 面试结果 |  |

## 面试流程

### 第一轮：XX 面

**面试官：** 
**时长：** 
**氛围：** 

**面试题：**
1. 
2. 
3. 

### 第二轮：XX 面

**面试题：**
1. 
2. 

## 经验总结

### 做得好的地方
- 

### 需要改进的地方
- 

## 给后来者的建议

- 
`
  },
  {
    key: 'book-notes',
    name: '📚 读书笔记',
    title: '读书笔记',
    color: '#0ea5e9',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M9 7h6"/><path d="M9 11h4"/></svg>',
    desc: '阅读笔记、书评',
    content: `# 《书名》读书笔记

## 书籍信息

| 项目 | 详情 |
|------|------|
| 书名 |  |
| 作者 |  |
| 出版社 |  |
| 阅读日期 |  |
| 推荐指数 | ⭐⭐⭐⭐⭐ |

## 核心观点

### 观点一

作者的论述...

> 原文引用

我的理解...

### 观点二

...

## 金句摘录

- 
- 

## 读后感想

阅读后的思考和启发...

## 行动清单

- [ ] 
- [ ] 
`
  },
  {
    key: 'travel',
    name: '✈️ 旅行游记',
    title: '旅行游记',
    color: '#ec4899',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    desc: '旅行攻略、游记',
    content: `# 目的地名称 旅行游记

## 行程概览

| 项目 | 详情 |
|------|------|
| 目的地 |  |
| 出行时间 |  |
| 天数 |  |
| 人均花费 |  |
| 交通方式 |  |

## 行程安排

### Day 1

上午：
下午：
晚上：

### Day 2

上午：
下午：
晚上：

## 推荐

### 🍜 美食推荐
- 

### 🏨 住宿推荐
- 

### 📸 拍照打卡点
- 

## 花费明细

| 项目 | 费用 |
|------|------|
| 交通 |  |
| 住宿 |  |
| 餐饮 |  |
| 门票 |  |
| **合计** |  |

## Tips

- 
`
  },
  {
    key: 'readme',
    name: '📘 项目 README',
    title: '项目 README',
    color: '#14b8a6',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
    desc: 'GitHub 项目文档',
    content: `# 项目名称

简短的项目描述。

## ✨ 功能特性

- 功能 1
- 功能 2
- 功能 3

## 🚀 快速开始

### 安装

\`\`\`bash
npm install your-package
\`\`\`

### 使用

\`\`\`javascript
import { something } from 'your-package';
\`\`\`

## 📖 文档

详细文档请访问 [文档链接]()

## 🤝 贡献

欢迎贡献代码！请阅读 [贡献指南](CONTRIBUTING.md)

## 📄 License

[MIT](LICENSE)
`
  },
  {
    key: 'annual-review',
    name: '🎆 年终总结',
    title: '年终总结',
    color: '#f97316',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    desc: '年度回顾、个人总结',
    content: `# YYYY 年终总结

## 关键成就

### 🏆 成就一

描述...

### 🏆 成就二

描述...

## 数据回顾

| 指标 | 年初目标 | 实际完成 | 完成率 |
|------|---------|---------|--------|
|  |  |  |  |

## 成长与收获

### 技能提升
- 

### 认知升级
- 

### 人脉拓展
- 

## 遗憾与反思

- 

## YYYY+1 年规划

### 目标一

- 具体行动：
- 衡量标准：
- 截止日期：

### 目标二

- 具体行动：
- 衡量标准：
- 截止日期：
`
  },
  {
    key: 'news',
    name: '📰 新闻稿',
    title: '新闻稿',
    color: '#6366f1',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>',
    desc: '新闻通稿、公关稿',
    content: `# 新闻标题

**副标题（若有）**

---

**[城市，日期]** — 导语，用一句话概括核心信息。

## 正文

### 背景

事件的背景信息...

### 详情

具体的细节描述...

### 引用

> "引用相关人员的发言。" —— 姓名，职位

## 关于 [公司/组织名]

简介段落...

## 联系方式

- 联系人：
- 邮箱：
- 电话：
`
  },
  {
    key: 'blank',
    name: '📝 空白模板',
    title: '空白模板',
    color: '#64748b',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    desc: '仅标题，自由发挥',
    content: `# 标题

`
  },
];
