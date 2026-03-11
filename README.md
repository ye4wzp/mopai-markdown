# MoPai 墨排 ✒️

> 市面上最好看的公众号 Markdown 排版工具

MoPai 墨排是一款本地运行的 Markdown 排版编辑器，专为微信公众号、知乎、CSDN 等内容平台的创作者设计。提供 13+ 精美主题、暗色模式、一键复制到公众号、智能多平台发布等功能。

![MoPai 墨排](https://img.shields.io/badge/MoPai-墨排-000?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IndoaXRlIj48cGF0aCBkPSJNMyAyMWMwIDAgMi0yIDQtMnMyLjUgMSA0LjUgMSAzLTEuNSA0LjUtMS41IDIgLjUgMiAuNSIvPjxwYXRoIGQ9Ik0xMiAzYy0uNSAyLTEgMy41LTEgNSAwIDIgMS41IDMgMS41IDVzLTEgMy41LTEgNSIgc3Ryb2tlPSJ3aGl0ZSIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iNSIgcj0iMS4yIiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&logo=vuedotjs)

## ✨ 核心功能

### 📝 编辑器
- **实时预览** — 左侧 Markdown 编辑，右侧即时渲染
- **语法高亮** — 编辑器区域 Markdown 语法着色
- **格式工具栏** — 加粗、斜体、标题、链接、图片、代码块等一键插入
- **Tab 缩进** — 编辑器支持 Tab/Shift+Tab 缩进
- **快捷键** — ⌘B/⌘I/⌘S 等常用快捷键

### 🎨 主题与样式
- **13 种精美主题** — 默认公众号、技术风格、优雅简约、深度阅读、纽约时报、金融时报、Medium、Apple 极简、Claude、少数派、竹林、暗夜模式、渐变彩虹
- **暗色模式** — 一键切换深色/浅色界面
- **自定义颜色** — 12 种预设色 + 取色器
- **字体设置** — 3 种字体风格 + 5 档字号
- **Mac 风格代码块** — 带红黄绿圆点的代码块

### 🚀 发布助手
- **14 平台一键发布** — 微信公众号、知乎、微博、CSDN、简书、掘金、今日头条、B站专栏、百家号、SF思否、大鱼号、企鹅号、小红书、豆瓣
- **智能格式适配** — 自动为每个平台复制最优格式（富文本/Markdown/摘要）
- **自动打开编辑器** — 复制后自动跳转到对应平台

### 📱 预览与导出
- **手机预览模式** — 模拟手机屏幕预览排版效果
- **一键复制到公众号** — 复制富文本直接粘贴到微信编辑器
- **导出 HTML** — 导出完整 HTML 文件
- **同步滚动** — 编辑器与预览区流畅同步滚动（easeOutCubic 缓动）

### 🔧 其他功能
- **浮动大纲目录** — TOC 面板快速跳转
- **微信链接转脚注** — 自动将超链接转为脚注格式
- **Mermaid 图表** — 支持流程图、时序图等
- **图片粘贴** — 支持 ⌘V 粘贴图片
- **草稿自动保存** — 内容自动保存到本地
- **文件上传** — 支持上传 .md 文件
- **字数统计** — 实时显示字数、字符数、阅读时间

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/ye4wzp/mopai-markdown.git
cd mopai-markdown

# 启动本地服务器（三选一）
python3 -m http.server 8080
# 或
npx serve -p 8080
# 或
php -S localhost:8080

# 打开浏览器访问
open http://localhost:8080
```

无需安装任何依赖，纯前端项目，开箱即用。

## 📦 技术栈

- **Vue 3** — CDN 引入，无需构建工具
- **markdown-it** — Markdown 解析引擎
- **Highlight.js** — 代码语法高亮
- **Mermaid.js** — 图表渲染
- **原生 CSS** — 无框架依赖，自定义设计系统

## 📁 项目结构

```
mopai-markdown/
├── index.html          # 主页面
├── css/
│   └── styles.css      # 样式文件
├── js/
│   ├── app.js          # Vue 应用主逻辑
│   ├── themes.js       # 13 种主题定义
│   └── sample.js       # 示例 Markdown 内容
└── README.md
```

## 🙏 致谢

本项目的开发受到以下优秀开源项目的启发：

| 项目 | 作者 | 贡献 |
|------|------|------|
| [花生编辑器 (huasheng_editor)](https://github.com/alchaincyf/huasheng_editor) | [@alchaincyf](https://github.com/alchaincyf) | 项目灵感来源，参考了其 Markdown 转公众号的核心思路 |
| [doocs/md](https://github.com/doocs/md) | [@doocs](https://github.com/doocs) | 参考了其主题设计和排版理念 |
| [Wechatsync](https://github.com/user/Wechatsync) | Wechatsync 团队 | 多平台发布功能的灵感来源 |
| [markdown-it](https://github.com/markdown-it/markdown-it) | markdown-it 团队 | Markdown 解析引擎 |
| [Highlight.js](https://github.com/highlightjs/highlight.js) | Highlight.js 团队 | 代码语法高亮 |
| [Mermaid](https://github.com/mermaid-js/mermaid) | Mermaid 团队 | 图表渲染支持 |

## 👨‍💻 创作团队

- **项目发起** — [@alchaincyf](https://github.com/alchaincyf)
- **原始项目参考** — [花生编辑器](https://github.com/alchaincyf/huasheng_editor) by [@alchaincyf](https://github.com/alchaincyf)、[doocs/md](https://github.com/doocs/md) by [@doocs](https://github.com/doocs)

## 📄 License

MIT License © 2025
