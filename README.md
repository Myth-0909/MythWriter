# ZNWriter / ZN智能写作

A full-stack cross-platform writing application — your intelligent document workspace with rich text editing, category management, and cloud sync.

一个全栈跨平台写作应用——你的智能文档工作区，支持富文本编辑、分类管理和云端同步。

[English](#english) | [中文](#中文)

---

## English

### What ZNWriter Can Do

#### Document Management
- **Create & Edit** — Rich text editor powered by Tiptap with full formatting support
- **7 Writing Categories** — Sci-Fi Novel, Fantasy, Design, Journal, Planning, Research, General
- **Favorites** — Star important documents for quick access
- **Trash & Recovery** — Soft-delete with 30-day trash retention and restore

#### Rich Text Editor
- **Text Formatting** — Bold, Italic, Underline, Strikethrough, Highlight
- **Headings** — H1, H2, H3
- **Code** — Inline code and code blocks with syntax highlighting
- **Text Color** — 8 preset colors with clear option
- **Alignment** — Left, Center, Right
- **Lists** — Bullet and ordered lists
- **Blockquote** & **Horizontal Rule**
- **Font Size** — 5 size options (12px - 30px)
- **Line Height** — 4 spacing options (1.5 - 2.5)
- **Undo / Redo** — Full edit history
- **Auto-save** — Changes saved automatically after 1.5s debounce
- **Word & Character Count** — Real-time statistics

#### User System
- **Registration & Login** — JWT-based authentication
- **Password Reset** — Email-based verification code flow
- **Profile Management** — Edit name, upload avatar
- **Avatar Upload** — Click-to-upload with camera icon

#### Internationalization (i18n)
- **Chinese / English** — Full UI language switching
- All system text, labels, toasts, and placeholders are localized

#### Interface
- **Dark / Light Theme** — System-aware with manual toggle
- **Collapsible Sidebar** — Maximize writing space when needed
- **Responsive Layout** — Optimized for desktop writing experience

#### Data & Export
- **MySQL Persistence** — All documents stored in MySQL database
- **RESTful API** — Full backend with Express + Prisma
- **Weekly Writing Stats** — ECharts-powered activity bar chart
- **Export to HTML** — Download document as standalone HTML file
- **File Import** — Import TXT, MD, DOCX files as new documents

#### AI Writing Assistant (ZNWriter AI)
- **Smart Conversations** — Multi-turn dialogue with short-term and long-term memory
- **Streaming Output** — Real-time typewriter effect via SSE (Server-Sent Events)
- **5 Personalities** — Normal, Cute, Catgirl (喵~), Serious, Silly — each with distinct tone and style, instantly switchable with persistent preference
- **Auto Document Creation** — AI generates content directly into new documents when asked to write
- **Prompt Injection Protection** — Detects and blocks jailbreak/DAN/instruction-leak attacks
- **Draggable Float Button** — Sparkles icon, drag to reposition, click to open chat dialog
- **Proactive Greeting** — AI greets user by name in the selected personality style on open

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| Rich Text | Tiptap (ProseMirror) |
| Charts | ECharts |
| UI Components | Radix UI, Lucide Icons |
| Desktop Shell | Tauri v2 (Rust) |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma |
| Database | MySQL |
| Auth | JWT + bcryptjs |
| AI | DeepSeek Chat API |
| Doc Parse | Mammoth (.docx) |

### Project Structure

```
cc_figma/
├── document/                  # Frontend (React + Tauri)
│   ├── src/
│   │   ├── pages/             # 7 page components
│   │   ├── components/        # Shared components (AIChatWidget, Particles, etc.)
│   │   ├── api.ts             # API client
│   │   ├── auth.tsx           # Auth context provider
│   │   ├── store.tsx          # Document state management
│   │   └── types.ts           # TypeScript type definitions
│   └── src-tauri/             # Tauri Rust backend
├── server/                    # Backend (Express + Prisma)
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   └── src/
│       ├── routes/            # API routes (auth, documents, users, stats, ai)
│       └── middleware/        # JWT authentication middleware
└── start.sh                   # One-click start script
```

### Quick Start

#### Prerequisites
- Node.js >= 18
- pnpm
- MySQL 8+ running on localhost:3306

#### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Myth-0909/ZNWriter.git
cd cc_figma

# 2. Configure environment
# Update server/.env with your MySQL credentials and DeepSeek API key:
# DATABASE_URL="mysql://root:yourpassword@127.0.0.1:3306/prowriter"
# DEEPSEEK_API_KEY="sk-your-deepseek-api-key"

# 3. Install dependencies
cd server && npm install && npx prisma db push && cd ..
cd document && pnpm install && cd ..

# 4. Start both frontend and backend
./start.sh
```

#### Access
- **Frontend**: http://localhost:1420
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/health

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with code |
| GET | `/api/users/me` | Get current user profile |
| PUT | `/api/users/me` | Update profile |
| POST | `/api/users/avatar` | Upload avatar (base64) |
| GET | `/api/documents` | List user's documents |
| POST | `/api/documents` | Create document |
| GET | `/api/documents/:id` | Get document |
| PUT | `/api/documents/:id` | Update document |
| DELETE | `/api/documents/:id` | Permanently delete |
| PATCH | `/api/documents/:id/favorite` | Toggle favorite |
| PATCH | `/api/documents/:id/trash` | Move to trash |
| PATCH | `/api/documents/:id/restore` | Restore from trash |
| GET | `/api/stats/weekly` | Weekly writing statistics |
| POST | `/api/ai/chat` | AI chat (streaming SSE) |
| POST | `/api/ai/greeting` | AI greeting by personality |

### License

MIT

---

## 中文

### 功能特性

#### 文档管理
- **创建与编辑** — 基于 Tiptap 的富文本编辑器，支持完整的文本格式化
- **7 种写作分类** — 科幻小说、奇幻、设计、日记、规划、研究、通用
- **收藏功能** — 星标重要文档，快速访问
- **回收站与恢复** — 软删除机制，30 天保留期，支持恢复

#### 富文本编辑器
- **文本格式** — 粗体、斜体、下划线、删除线、高亮
- **标题** — H1、H2、H3
- **代码** — 行内代码和带语法高亮的代码块
- **文字颜色** — 8 种预设颜色，支持清除
- **对齐方式** — 左对齐、居中、右对齐
- **列表** — 无序列表和有序列表
- **引用块** 与 **分割线**
- **字号** — 5 种字号选项（12px - 30px）
- **行高** — 4 种行间距选项（1.5 - 2.5）
- **撤销 / 重做** — 完整的编辑历史
- **自动保存** — 1.5 秒防抖后自动保存修改
- **字数统计** — 实时字数与字符数统计

#### 用户系统
- **注册与登录** — 基于 JWT 的身份认证
- **密码重置** — 基于邮箱验证码的找回流程
- **个人资料管理** — 修改昵称、上传头像
- **头像上传** — 点击上传，带相机图标

#### 国际化 (i18n)
- **中文 / English** — 完整的界面语言切换
- 所有系统文本、标签、提示和占位符均已本地化

#### 界面
- **深色 / 浅色主题** — 跟随系统，支持手动切换
- **可折叠侧边栏** — 需要时最大化写作空间
- **响应式布局** — 针对桌面写作体验优化

#### 数据与导出
- **MySQL 持久化** — 所有文档存储在 MySQL 数据库中
- **RESTful API** — 完整的 Express + Prisma 后端
- **每周写作统计** — ECharts 驱动的活跃度柱状图
- **导出 HTML** — 将文档下载为独立 HTML 文件
- **文件导入** — 支持导入 TXT、MD、DOCX 文件并创建为新文档

#### AI 写作助手（ZN助手）
- **智能对话** — 支持多轮对话，具备短期记忆和长期记忆
- **流式输出** — 基于 SSE 的实时打字机效果，可随时中断生成
- **5 种性格** — 正常、可爱、猫娘（喵~）、严肃、搞怪，每种有独特语气风格，即时切换并持久化偏好
- **自动创建文档** — 用户要求写作时，AI 自动生成内容并创建新文档
- **提示词注入防护** — 检测并拦截越狱/DAN/指令泄露等攻击
- **可拖拽悬浮按钮** — Sparkles 图标，可拖动位置，点击展开对话窗口
- **主动问好** — 打开对话时，AI 以选中性格风格主动问候用户

### 技术栈

| 层级 | 技术 |
|-------|-----------|
| 前端 | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| 富文本 | Tiptap (ProseMirror) |
| 图表 | ECharts |
| UI 组件 | Radix UI, Lucide Icons |
| 桌面端 | Tauri v2 (Rust) |
| 后端 | Node.js, Express, TypeScript |
| ORM | Prisma |
| 数据库 | MySQL |
| 认证 | JWT + bcryptjs |
| AI | DeepSeek Chat API |
| 文档解析 | Mammoth (.docx) |

### 项目结构

```
cc_figma/
├── document/                  # 前端 (React + Tauri)
│   ├── src/
│   │   ├── pages/             # 7 个页面组件
│   │   ├── components/        # 共享组件 (AIChatWidget, Particles 等)
│   │   ├── api.ts             # API 客户端
│   │   ├── auth.tsx           # 认证上下文提供者
│   │   ├── store.tsx          # 文档状态管理
│   │   └── types.ts           # TypeScript 类型定义
│   └── src-tauri/             # Tauri Rust 后端
├── server/                    # 后端 (Express + Prisma)
│   ├── prisma/
│   │   └── schema.prisma      # 数据库结构
│   └── src/
│       ├── routes/            # API 路由 (auth, documents, users, stats, ai)
│       └── middleware/        # JWT 认证中间件
└── start.sh                   # 一键启动脚本
```

### 快速开始

#### 环境要求
- Node.js >= 18
- pnpm
- MySQL 8+ 运行在 localhost:3306

#### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/Myth-0909/ZNWriter.git
cd cc_figma

# 2. 配置 MySQL
# 创建 MySQL 用户或使用 root，然后更新 server/.env：
# DATABASE_URL="mysql://root:yourpassword@127.0.0.1:3306/prowriter"

# 3. 安装依赖
cd server && npm install && npx prisma db push && cd ..
cd document && pnpm install && cd ..

# 4. 启动前后端
./start.sh
```

#### 访问地址
- **前端**: http://localhost:1420
- **后端 API**: http://localhost:3000
- **健康检查**: http://localhost:3000/api/health

### API 接口

| 方法 | 接口 | 说明 |
|--------|----------|-------------|
| POST | `/api/auth/register` | 注册新用户 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/forgot-password` | 请求密码重置 |
| POST | `/api/auth/reset-password` | 使用验证码重置密码 |
| GET | `/api/users/me` | 获取当前用户信息 |
| PUT | `/api/users/me` | 更新个人资料 |
| POST | `/api/users/avatar` | 上传头像 (base64) |
| GET | `/api/documents` | 获取用户文档列表 |
| POST | `/api/documents` | 创建文档 |
| GET | `/api/documents/:id` | 获取文档 |
| PUT | `/api/documents/:id` | 更新文档 |
| DELETE | `/api/documents/:id` | 永久删除 |
| PATCH | `/api/documents/:id/favorite` | 切换收藏 |
| PATCH | `/api/documents/:id/trash` | 移入回收站 |
| PATCH | `/api/documents/:id/restore` | 从回收站恢复 |
| GET | `/api/stats/weekly` | 每周写作统计 |
| POST | `/api/ai/chat` | AI 对话（SSE 流式） |
| POST | `/api/ai/greeting` | AI 性格化问候 |

### 开源协议

MIT
