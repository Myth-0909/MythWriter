# ZNWriter / ZN 智能写作

A full-stack cross-platform writing application — an intelligent document workspace with rich text editing, AI-assisted creation, semantic memory, and vector-powered context retrieval.

一个全栈跨平台写作应用——你的智能文档工作区，支持富文本编辑、AI 辅助创作、语义记忆和向量检索上下文。

[English](#english) | [中文](#中文)

---

## English

### What ZNWriter Can Do

#### Document Management
- **Create & Edit** — Rich text editor powered by Tiptap with full formatting support
- **7 Writing Categories** — Sci-Fi Novel, Fantasy, Design, Journal, Planning, Research, General
- **Document Groups** — Create folders, rename them, delete them, and move documents between groups
- **Favorites** — Star important documents for quick access
- **Trash & Recovery** — Soft-delete with 30-day trash retention and restore
- **Version History** — Save document snapshots, view version history, and restore previous versions

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

#### AI Writing Assistant (XiaoAn)
- **Smart Conversations** — Multi-turn dialogue with short-term and long-term memory
- **Streaming Output** — Real-time typewriter effect via SSE (Server-Sent Events)
- **5 Personalities** — Normal, Cute, Catgirl (喵~), Serious, Silly — each with distinct tone and style, instantly switchable with persistent preference
- **Auto Document Creation** — AI generates content directly into new documents when asked to write
- **Agent Writer** — Six-step autonomous writing flow: analyze, retrieve, outline, draft, review, publish
- **Writing Review** — AI-powered writing quality review with actionable suggestions
- **Prompt Injection Protection** — Detects and blocks jailbreak/DAN/instruction-leak attacks
- **Draggable Float Button** — Sparkles icon, drag to reposition, click to open chat dialog
- **Proactive Greeting** — AI greets user by name in the selected personality style on open

#### AI Brain Memory & Semantic RAG
- **AI Brain Base** — Create worldbuilding, character, location, and concept cards for consistent long-form writing
- **Category Management** — Create, edit, delete, color-code, and drag-reorder brain categories
- **Manual References** — Mention documents with `@title` and brain cards with `#title` in chat
- **Semantic References** — XiaoAn can automatically suggest high-confidence brain cards from the current prompt
- **Vector Search** — Milvus-backed semantic search for brain cards and document chunks
- **Automatic Reindexing** — Knowledge cards and documents are reindexed after edits, deletes, and version restores
- **Graceful Degradation** — If Redis, Milvus, or embedding services are unavailable, non-vector features keep working and RAG reports degraded status

#### Reliability
- **White-Screen Protection** — A global React error boundary prevents full blank screens and offers retry / reload actions
- **Safe Deep Links** — Missing editor document links redirect back to the document center instead of crashing
- **Startup Hardening** — Backend health checks remain available even when optional Redis or Milvus services are offline

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
| Cache / Rate Limit | Redis (optional, graceful fallback) |
| Vector Store | Milvus / Zilliz SDK |
| Auth | JWT + bcryptjs |
| AI | DeepSeek Chat API + OpenAI-compatible embeddings |
| Doc Parse | Mammoth (.docx) |

### Project Structure

```
MythWriter/
├── document/                  # Frontend (React + Tauri)
│   ├── src/
│   │   ├── pages/             # Documents, editor, brain base, settings, trash, login
│   │   ├── components/        # Shared UI, editor, AI chat, error boundary
│   │   ├── components/ui/     # Radix UI wrappers
│   │   ├── api.ts             # API client
│   │   ├── auth.tsx           # Auth context provider
│   │   ├── store.tsx          # Document state management
│   │   └── types.ts           # TypeScript type definitions
│   └── src-tauri/             # Tauri Rust backend
├── server/                    # Backend (Express + Prisma)
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   └── src/
│       ├── routes/            # API routes (auth, documents, ai, rag, groups, users)
│       ├── services/          # Business logic and RAG service
│       ├── lib/               # Prisma, Redis, Milvus, embeddings
│       └── middleware/        # JWT authentication middleware
├── docs/competition/          # AI competition process records and metric templates
└── start.sh                   # One-click start script
```

### Quick Start

#### Prerequisites
- Node.js >= 18
- pnpm
- MySQL 8+ running on localhost:3306
- Redis is recommended for blacklist / rate-limit cache; the app can run without it
- Milvus is optional for semantic RAG; non-vector features continue working when it is offline

#### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Myth-0909/MythWriter.git
cd MythWriter

# 2. Configure environment
# Update server/.env with your database, AI, and optional vector settings:
# DATABASE_URL="mysql://root:yourpassword@127.0.0.1:3306/prowriter"
# JWT_SECRET="replace-with-a-long-random-string"
# DEEPSEEK_API_KEY="sk-your-deepseek-api-key"
# EMBEDDING_API_KEY="sk-your-embedding-key"
# EMBEDDING_BASE_URL="http://your-embedding-service/v1"
# EMBEDDING_MODEL="Qwen/Qwen3-Embedding-8B"
# MILVUS_ADDRESS="http://127.0.0.1:19530"
# MILVUS_TIMEOUT_MS=3000

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
| GET | `/api/documents/:id/versions` | List document versions |
| POST | `/api/documents/:id/versions` | Save version snapshot |
| PATCH | `/api/documents/:id/versions/:versionId/restore` | Restore a version |
| GET | `/api/groups` | List document groups |
| POST | `/api/groups` | Create document group |
| PUT | `/api/groups/:id` | Rename document group |
| DELETE | `/api/groups/:id` | Delete document group |
| GET | `/api/stats/weekly` | Weekly writing statistics |
| POST | `/api/ai/chat` | AI chat (streaming SSE) |
| POST | `/api/ai/greeting` | AI greeting by personality |
| POST | `/api/ai/writing-review` | AI writing review |
| POST | `/api/ai/agent/write` | Agent writing flow (progress SSE) |
| GET | `/api/ai/knowledge` | List AI brain cards |
| POST | `/api/ai/knowledge` | Create AI brain card |
| PUT | `/api/ai/knowledge/:id` | Update AI brain card |
| DELETE | `/api/ai/knowledge/:id` | Delete AI brain card |
| GET | `/api/ai/categories` | List brain categories |
| POST | `/api/ai/categories` | Create brain category |
| PUT | `/api/ai/categories/:id` | Update brain category |
| PUT | `/api/ai/categories/reorder` | Reorder brain categories |
| DELETE | `/api/ai/categories/:id` | Delete brain category |
| GET | `/api/rag/status` | Vector store availability |
| POST | `/api/rag/search-knowledge` | Semantic brain search |
| POST | `/api/rag/search-documents` | Semantic document search |
| POST | `/api/rag/reindex-knowledge/:id` | Reindex one brain card |
| POST | `/api/rag/reindex-document/:id` | Reindex one document |
| POST | `/api/rag/reindex-all` | Reindex all brain cards |
| GET | `/api/users/me/apikey` | Get AI service configuration |
| PUT | `/api/users/me/apikey` | Save AI service configuration |
| GET | `/api/users/me/apikey/history` | List saved AI configurations |

### License

MIT

---

## 中文

### 功能特性

#### 文档管理
- **创建与编辑** — 基于 Tiptap 的富文本编辑器，支持完整的文本格式化
- **7 种写作分类** — 科幻小说、奇幻、设计、日记、规划、研究、通用
- **文档分组** — 支持创建文件夹、重命名、删除分组，并在分组之间移动文档
- **收藏功能** — 星标重要文档，快速访问
- **回收站与恢复** — 软删除机制，30 天保留期，支持恢复
- **版本历史** — 保存文档快照、查看版本记录，并恢复到历史版本

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

#### AI 写作助手（小安）
- **智能对话** — 支持多轮对话，具备短期记忆和长期记忆
- **流式输出** — 基于 SSE 的实时打字机效果，可随时中断生成
- **5 种性格** — 正常、可爱、猫娘（喵~）、严肃、搞怪，每种有独特语气风格，即时切换并持久化偏好
- **自动创建文档** — 用户要求写作时，AI 自动生成内容并创建新文档
- **Agent 自主写作** — 六步写作流：分析目标、检索资料、生成大纲、撰写草稿、自审优化、发布文档
- **写作审阅** — AI 对文本质量进行审阅，并给出可执行修改建议
- **提示词注入防护** — 检测并拦截越狱/DAN/指令泄露等攻击
- **可拖拽悬浮按钮** — Sparkles 图标，可拖动位置，点击展开对话窗口
- **主动问好** — 打开对话时，AI 以选中性格风格主动问候用户

#### AI 设定脑库与语义 RAG
- **AI 设定脑库** — 为世界观、角色、地点、概念等长期设定创建卡片，保持长篇写作一致性
- **类别管理** — 支持创建、编辑、删除、颜色标记和拖拽排序设定类别
- **手动引用** — 在对话中用 `@文档名` 引用文档，用 `#设定名` 引用脑库卡片
- **语义引用** — 小安可根据当前输入自动推荐高置信度设定卡
- **向量检索** — 基于 Milvus 对设定卡和文档分块进行语义检索
- **自动重建索引** — 设定卡、文档编辑、删除和版本恢复后会自动更新向量索引
- **降级可用** — Redis、Milvus 或 Embedding 服务不可用时，非向量功能继续可用，RAG 状态会显示降级

#### 稳定性
- **白屏保护** — 全局 React Error Boundary 阻止整页白屏，并提供重试 / 刷新操作
- **安全深链** — 不存在的编辑器文档链接会回到文档中心，不会导致页面崩溃
- **启动加固** — Redis 或 Milvus 等可选服务离线时，后端健康检查和基础 API 仍可用

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
| 缓存 / 限流 | Redis（可选，支持降级） |
| 向量库 | Milvus / Zilliz SDK |
| 认证 | JWT + bcryptjs |
| AI | DeepSeek Chat API + OpenAI 兼容 Embedding |
| 文档解析 | Mammoth (.docx) |

### 项目结构

```
MythWriter/
├── document/                  # 前端 (React + Tauri)
│   ├── src/
│   │   ├── pages/             # 文档、编辑器、脑库、设置、回收站、登录
│   │   ├── components/        # 共享 UI、编辑器、AI 聊天、错误兜底
│   │   ├── components/ui/     # Radix UI 封装组件
│   │   ├── api.ts             # API 客户端
│   │   ├── auth.tsx           # 认证上下文提供者
│   │   ├── store.tsx          # 文档状态管理
│   │   └── types.ts           # TypeScript 类型定义
│   └── src-tauri/             # Tauri Rust 后端
├── server/                    # 后端 (Express + Prisma)
│   ├── prisma/
│   │   └── schema.prisma      # 数据库结构
│   └── src/
│       ├── routes/            # API 路由 (auth, documents, ai, rag, groups, users)
│       ├── services/          # 业务逻辑与 RAG 服务
│       ├── lib/               # Prisma、Redis、Milvus、Embedding
│       └── middleware/        # JWT 认证中间件
├── docs/competition/          # AI 竞赛过程记录与指标模板
└── start.sh                   # 一键启动脚本
```

### 快速开始

#### 环境要求
- Node.js >= 18
- pnpm
- MySQL 8+ 运行在 localhost:3306
- 推荐安装 Redis 用于黑名单 / 限流缓存；未安装时应用可降级运行
- Milvus 用于语义 RAG；离线时非向量功能仍可用

#### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/Myth-0909/MythWriter.git
cd MythWriter

# 2. 配置环境变量
# 创建 MySQL 用户或使用 root，然后更新 server/.env：
# DATABASE_URL="mysql://root:yourpassword@127.0.0.1:3306/prowriter"
# JWT_SECRET="replace-with-a-long-random-string"
# DEEPSEEK_API_KEY="sk-your-deepseek-api-key"
# EMBEDDING_API_KEY="sk-your-embedding-key"
# EMBEDDING_BASE_URL="http://your-embedding-service/v1"
# EMBEDDING_MODEL="Qwen/Qwen3-Embedding-8B"
# MILVUS_ADDRESS="http://127.0.0.1:19530"
# MILVUS_TIMEOUT_MS=3000

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
| GET | `/api/documents/:id/versions` | 获取文档版本列表 |
| POST | `/api/documents/:id/versions` | 保存版本快照 |
| PATCH | `/api/documents/:id/versions/:versionId/restore` | 恢复历史版本 |
| GET | `/api/groups` | 获取文档分组 |
| POST | `/api/groups` | 创建文档分组 |
| PUT | `/api/groups/:id` | 重命名文档分组 |
| DELETE | `/api/groups/:id` | 删除文档分组 |
| GET | `/api/stats/weekly` | 每周写作统计 |
| POST | `/api/ai/chat` | AI 对话（SSE 流式） |
| POST | `/api/ai/greeting` | AI 性格化问候 |
| POST | `/api/ai/writing-review` | AI 写作审阅 |
| POST | `/api/ai/agent/write` | Agent 自主写作流（SSE 进度） |
| GET | `/api/ai/knowledge` | 获取 AI 设定卡 |
| POST | `/api/ai/knowledge` | 创建 AI 设定卡 |
| PUT | `/api/ai/knowledge/:id` | 更新 AI 设定卡 |
| DELETE | `/api/ai/knowledge/:id` | 删除 AI 设定卡 |
| GET | `/api/ai/categories` | 获取脑库类别 |
| POST | `/api/ai/categories` | 创建脑库类别 |
| PUT | `/api/ai/categories/:id` | 更新脑库类别 |
| PUT | `/api/ai/categories/reorder` | 重排脑库类别 |
| DELETE | `/api/ai/categories/:id` | 删除脑库类别 |
| GET | `/api/rag/status` | 向量库可用状态 |
| POST | `/api/rag/search-knowledge` | 语义检索设定卡 |
| POST | `/api/rag/search-documents` | 语义检索文档分块 |
| POST | `/api/rag/reindex-knowledge/:id` | 重建设定卡索引 |
| POST | `/api/rag/reindex-document/:id` | 重建文档索引 |
| POST | `/api/rag/reindex-all` | 重建全部设定卡索引 |
| GET | `/api/users/me/apikey` | 获取 AI 服务配置 |
| PUT | `/api/users/me/apikey` | 保存 AI 服务配置 |
| GET | `/api/users/me/apikey/history` | 获取历史 AI 配置 |

### 开源协议

MIT
