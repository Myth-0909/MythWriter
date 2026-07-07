# ZNWriter AI 竞赛增强方案

> **目标**：基于已有 Milvus 向量数据库，用最小改动实现——**真正的语义 RAG 知识库** + **Agent 自主写作流**

---

## 零、基础设施

### 已有资源

```
向量数据库: Milvus @ http://172.16.0.44:19530
Embedding 模型:
  BaseURL: http://172.16.76.112:8001/v1
  APIKey:  sk-4f8a7b2c9d1e6f3a5b8c2d7e9f4a6b3c
  Model:   Qwen/Qwen3-Embedding-8B
```

Milvus 端口 19530 是标准 Milvus 端口，使用 gRPC 协议。

---

## 一、现状分析

### 当前 AI 能力

| 功能 | 实现 | 技术含量 |
|------|------|:--------:|
| AI 聊天 | DeepSeek API 代理 + System Prompt | ⭐⭐ |
| 五种人格 | Prompt 模板切换 | ⭐⭐ |
| 划词改写 | 选中文本→API→替换 | ⭐⭐ |
| 写作审阅 | 全文→API→JSON 解析 | ⭐⭐ |
| 知识库检索 | **`str.includes(keyword)`** | ⭐ |
| 文档操作 | `<<ACTION_JSON>>` 协议解析 | ⭐⭐⭐ |

### 致命弱点

1. **知识库无语义检索** — `buildBrainKnowledgeContext()` 用 `lowerText.includes(k.title.toLowerCase())` 做关键词匹配
2. **没有 RAG** — 虽然有 Milvus 但代码中未使用
3. **没有 Agent** — 只能单轮对话，不能自主完成多步写作

### 竞争优势（保持）

- ✅ 产品完整度（全栈 + Tauri + 暗色模式 + GSAP 动画）
- ✅ 工程规范（i18n 双语、Radix UI、JWT + Redis、SSE）
- ✅ UX 打磨（浮动聊天窗、版本历史、文档分组、拖拽排序）

---

## 二、核心设计决策

### 2.1 向量存储：Milvus

已有 Milvus 实例 `172.16.0.44:19530`，直接使用：
- 创建两个 Collection：`knowledge_vectors`（知识卡片）和 `document_chunks`（文档分块）
- 向量维度由 Qwen3-Embedding-8B 决定（8192 维，实测后确认）
- 使用 `@zilliz/milvus2-sdk-node` npm 包连接

### 2.2 Embedding：Qwen3-Embedding-8B

```
POST http://172.16.76.112:8001/v1/embeddings
Authorization: Bearer sk-4f8a7b2c9d1e6f3a5b8c2d7e9f4a6b3c
Body: { model: "Qwen/Qwen3-Embedding-8B", input: "text..." }
```

配置作为服务端默认值，也支持用户在 Settings 中覆盖（复用现有 API Key 配置模式）。

### 2.3 设计原则

- **最小改动** — 不改 UI 框架，不改编辑器
- **降级优雅** — Milvus 不可用时回退关键词匹配
- **渐进增强** — 不破坏现有功能

---

## 三、Phase 1：Milvus + Embedding 基础设施

### 3.1 依赖安装

**server/package.json** — 添加：
```json
{
  "@zilliz/milvus2-sdk-node": "^2.4.0"
}
```

### 3.2 Milvus 连接管理

**新文件：`server/src/lib/milvus.ts`**

```typescript
// 核心职责：
// - 连接 Milvus（懒初始化，启动时检查可用性）
// - 创建 Collection（knowledge_vectors, document_chunks）
// - 提供 CRUD 封装：insert / delete / search

// Collection 设计：
//
// knowledge_vectors:
//   Fields: id (VARCHAR, pk), user_id (VARCHAR), knowledge_id (VARCHAR),
//           title (VARCHAR, 256), description (VARCHAR, 1024),
//           vector (FLOAT_VECTOR, dim=8192)
//   Index: IVF_FLAT on vector
//
// document_chunks:
//   Fields: id (VARCHAR, pk), user_id (VARCHAR), document_id (VARCHAR),
//           chunk_index (INT64), content (VARCHAR, 1024),
//           vector (FLOAT_VECTOR, dim=8192)
//   Index: IVF_FLAT on vector
//
// API:
//   initCollections() → 确保 Collection 存在（不存在则创建）
//   insertKnowledge(userId, knowledgeId, title, description, vector)
//   insertDocumentChunks(userId, documentId, chunks: {index, content, vector}[])
//   deleteKnowledge(knowledgeId) → 删除该知识卡片所有向量
//   deleteDocumentChunks(documentId) → 删除该文档所有分块
//   searchKnowledge(userId, queryVector, topK) → 语义搜索知识卡片
//   searchDocuments(userId, queryVector, topK) → 语义搜索文档分块
```

### 3.3 Embedding 服务

**新文件：`server/src/lib/embedding.ts`**

```typescript
// 核心职责：调用 Qwen3-Embedding-8B 生成向量
//
// 配置（默认值）：
//   baseUrl: http://172.16.76.112:8001/v1
//   apiKey:  sk-4f8a7b2c9d1e6f3a5b8c2d7e9f4a6b3c
//   model:   Qwen/Qwen3-Embedding-8B
//
// 支持用户覆盖（从 User 表的 embeddingApiKey/embeddingBaseUrl/embeddingModel 读取）
//
// API:
//   generateEmbedding(text: string) → number[]
//   generateEmbeddings(texts: string[]) → number[][]（批量调用）
```

### 3.4 文档分块工具

**新文件：`server/src/lib/documentChunker.ts`**

```typescript
// HTML → 纯文本 → 段落分割 → 512字符chunk（128重叠）
function chunkDocument(html: string): { index: number; content: string }[]
```

### 3.5 Prisma 扩展（可选）

User 模型新增字段（允许用户覆盖 embedding 配置）：

```prisma
model User {
  // ... 现有字段 ...
  embeddingApiKey  String?  @map("embedding_api_key")
  embeddingBaseUrl String?  @map("embedding_base_url")
  embeddingModel   String?  @map("embedding_model")
}
```

不为空时使用用户配置，为空时使用服务器默认值。

---

## 四、Phase 2：RAG 知识库升级

### 4.1 知识卡片自动向量化

**修改：`server/src/routes/aiKnowledge.ts`**

```
POST /create → 保存后异步：generateEmbedding → insertKnowledge（失败不阻塞）
PUT /:id    → 更新后异步：deleteKnowledge → generateEmbedding → insertKnowledge
DELETE /:id → 删除前：deleteKnowledge（Milvus）
```

### 4.2 文档自动分块+向量化

**修改：`server/src/routes/documents.ts`**

```
PUT /:id → 保存后异步：chunkDocument → generateEmbeddings → insertDocumentChunks
DELETE /:id → 同步：deleteDocumentChunks（Milvus）
```

### 4.3 语义搜索路由

**新文件：`server/src/routes/rag.ts`**

```
GET  /api/rag/status                    → 检查 Milvus 连接状态
POST /api/rag/search-knowledge          → { query, topK? } → { results[] }
POST /api/rag/search-documents          → { query, topK? } → { results[] }
POST /api/rag/reindex-knowledge/:id     → 手动重建单张卡片向量
POST /api/rag/reindex-document/:id      → 手动重建单个文档向量
POST /api/rag/reindex-all               → 批量重建全部知识卡片
```

在 `server/src/index.ts` 注册：
```typescript
app.use("/api/rag", ragRoutes);
```

### 4.4 升级 AI Chat 上下文构建

**修改：`server/src/routes/ai.ts` 中的 `buildBrainKnowledgeContext()`**

```diff
- knowledges.filter(k => lowerText.includes(k.title.toLowerCase()))
+ const queryVector = await generateEmbedding(lastUserMessage);
+ const results = await searchKnowledge(userId, queryVector, 5);
+ // 筛选 score > 0.3 的结果
+ // Milvus 不可用时：自动降级到原关键词匹配
```

### 4.5 前端：语义引用展示

**修改：`document/src/components/AIChatWidget.tsx`**

- 发送消息时并行调用 `POST /api/rag/search-knowledge`
- 自动匹配的知识卡片显示为带「AI 推荐」标签的 reference chip
- 用户可移除自动引用，不想要可关掉此功能

### 4.6 知识库页面增强

**修改：`document/src/pages/BrainMemoryPage.tsx`**

- 每张卡片显示向量化状态（已索引 ✅ / 未索引 ⬜）
- 顶部「重建全部索引」按钮
- 单张卡片可手动重建索引

---

## 五、Phase 3：Agent 自主写作流

### 5.1 Agent 编排引擎

**新文件：`server/src/services/agentService.ts`**

六步流水线，每步独立 LLM 调用，步间通过 SSE 推送进度：

```
ANALYZE   → 分析目标：提取类型、基调、主题、长度
RESEARCH  → 语义搜索知识库 + 文档，收集参考资料
PLAN      → 生成章节大纲（含预估字数）
DRAFT     → 逐章写作（每章带参考上下文，流式生成）
REVIEW    → 自审：一致性、连贯性、与知识库冲突检查
PUBLISH   → 创建新文档（含标题、内容、大纲）
```

SSE 推送格式：
```
event: progress
data: {"stage":"analyze","message":"正在分析写作目标...","themes":["玄幻","修炼"],"estimatedWords":2000}

event: progress  
data: {"stage":"research","message":"检索到 5 条相关设定","sources":[{id,title,similarity}]}

event: progress
data: {"stage":"plan","outline":"# 大纲\n\n## 第一章 灵气复苏\n..."}

event: progress
data: {"stage":"draft","sectionIndex":1,"totalSections":4,"content":"..."}

event: progress
data: {"stage":"review","score":85,"suggestions":[{"detail":"...", "severity":"medium"}]}

event: done
data: {"title":"...","content":"...","outline":"...","docId":"uuid"}
```

### 5.2 Agent 路由

**修改：`server/src/routes/ai.ts`** — 新增端点：

```
POST /api/ai/agent/write
Body: {
  goal: string;                   // 写作目标（必填）
  style?: string;                 // "默认"|"文学"|"学术"|"商务"|"技术"
  length?: "short"|"medium"|"long";
  personality?: string;           // 默认用户当前人格
  includeBrain?: boolean;         // 默认 true
  includeDocuments?: boolean;     // 默认 true
}
Response: text/event-stream (SSE，步间实时推送，不缓冲)
```

安全：复用 `authMiddlewareWithBlacklist` + `detectInjection()` + `aiChatLimiter`

### 5.3 前端 Agent 写作面板

**新组件：`document/src/components/AgentWritePanel.tsx`**

```
┌──────────────────────────────────────────────┐
│  🤖  AI 智能写作                     [×]      │
│                                              │
│  写作目标：                                    │
│  ┌──────────────────────────────────────────┐ │
│  │ 描述你想写什么...                         │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  风格：[默认 ▾]    篇幅：[中等 ▾]               │
│  ☑ 参考知识库   ☑ 参考已有文档                  │
│                                              │
│  [ 🚀 开始写作 ]                              │
│                                              │
│  ──────── 执行进度 ────────                   │
│  ✅ 分析目标 → 玄幻小说，~2000字                │
│  ✅ 检索资料 → 5 条知识，2 篇文档               │
│  ⏳ 撰写中 → 第 2/4 章                         │
│  ⬜ 审阅优化                                   │
│  ⬜ 发布文档                                   │
│                                              │
│  [ 📝 打开文档 ]                              │
└──────────────────────────────────────────────┘
```

**入口点**（两个）：
1. `DocumentCenterPage` 头部「🤖 AI 写作」按钮
2. `AIChatWidget` 新增 `/write` slash command

---

## 六、完整文件清单

### 新建文件（6 个）

| 文件 | 用途 |
|------|------|
| `server/src/lib/milvus.ts` | Milvus 连接管理 + Collection CRUD + 向量搜索 |
| `server/src/lib/embedding.ts` | Qwen3-Embedding-8B 调用 |
| `server/src/lib/documentChunker.ts` | 文档分块工具 |
| `server/src/routes/rag.ts` | RAG 路由（搜索、重建索引） |
| `server/src/services/agentService.ts` | Agent 六步编排引擎 |
| `document/src/components/AgentWritePanel.tsx` | Agent 写作 Dialog |

### 修改文件（14 个）

| 文件 | 改动 |
|------|------|
| `server/package.json` | 添加 `@zilliz/milvus2-sdk-node` |
| `server/prisma/schema.prisma` | User 增加 `embeddingApiKey/BaseUrl/Model`（可选） |
| `server/prisma/schema-sqlite.prisma` | 同步 |
| `server/src/index.ts` | 启动时 `initCollections()` + 注册 ragRoutes |
| `server/src/routes/aiKnowledge.ts` | CRUD 钩子 → Milvus 向量化 |
| `server/src/routes/documents.ts` | 更新/删除钩子 → Milvus 向量化 |
| `server/src/routes/ai.ts` | +Agent 路由 + semantic-search 路由 + 升级 buildBrainKnowledgeContext |
| `server/src/routes/users.ts` | API key 配置增加 embedding 字段 |
| `server/src/services/aiService.ts` | 导出复用函数供 agent/embedding 使用 |
| `document/src/api.ts` | 新增 ragSearch、agentWrite 等 API 方法 |
| `document/src/components/I18nProvider.tsx` | 新增 ~40 个 i18n 键 |
| `document/src/components/AIChatWidget.tsx` | /write 命令 + 语义引用 + AgentWritePanel 集成 |
| `document/src/pages/BrainMemoryPage.tsx` | 索引状态 + 重建索引按钮 |
| `document/src/pages/DocumentCenterPage.tsx` | 「AI 写作」入口按钮 |

---

## 七、i18n 键

```typescript
// Agent
"agent.title" / "agent.goalLabel" / "agent.goalPlaceholder" / "agent.style" 
"agent.styleDefault" / "agent.styleLiterary" / "agent.styleAcademic" 
"agent.styleBusiness" / "agent.styleTechnical" / "agent.length"
"agent.lengthShort" / "agent.lengthMedium" / "agent.lengthLong"
"agent.includeBrain" / "agent.includeDocs" / "agent.start" / "agent.stop"
"agent.step.analyze" / "agent.step.research" / "agent.step.plan"
"agent.step.draft" / "agent.step.review" / "agent.step.publish"
"agent.openDocument" / "agent.saveDraft" / "agent.researchFound"
"agent.reviewScore" / "agent.emptyGoal" / "agent.error"

// RAG
"rag.autoReference" / "rag.searching" / "rag.reindexAll"
"rag.reindexing" / "rag.reindexDone" / "rag.similarity"
"rag.indexed" / "rag.notIndexed"

// Settings
"apikey.embeddingModel" / "apikey.embeddingModelDesc"
```

---

## 八、实施顺序

```
Day 1 — Milvus + Embedding 基础设施
  1. npm install @zilliz/milvus2-sdk-node
  2. server/src/lib/milvus.ts
  3. server/src/lib/embedding.ts
  4. server/src/lib/documentChunker.ts
  5. Prisma User 扩展（可选）
  6. server/src/index.ts 初始化
  → npx tsc --noEmit 验证

Day 2 — RAG 升级
  7. server/src/routes/rag.ts
  8. aiKnowledge.ts + documents.ts 向量化钩子
  9. ai.ts buildBrainKnowledgeContext 升级 + semantic-search
  10. api.ts + I18nProvider + BrainMemoryPage 前端改动
  11. AIChatWidget 语义引用
  → ./start.sh 端到端验证

Day 3 — Agent 写作流
  12. server/src/services/agentService.ts
  13. ai.ts agent/write 路由
  14. AgentWritePanel.tsx
  15. /write 命令 + 入口按钮 + App.tsx 集成
  → ./start.sh 完整流程验证

Day 4 — 打磨
  16. Milvus 降级策略测试
  17. SQLite fallback 兼容性
  18. UI 细节 + 性能优化
```

---

## 九、验证方案

### 编译验证
```bash
cd server && npx tsc --noEmit
cd document && npx tsc --noEmit
cd server && npx prisma db push
```

### Phase 2 验证（RAG）
```bash
./start.sh

# 1. 创建知识卡片「大炎王朝：修炼体系分为炼气/筑基/金丹/元婴/化神」
# 2. AI Chat 问「怎么变强？」 → 语义检索到卡片（关键词匹配不到但语义能搜到）
# 3. 停止 Milvus → 确认降级到关键词匹配
```

### Phase 3 验证（Agent）
```bash
# 1. 点「AI 写作」→ 输入「写一篇大炎王朝修炼体系的入门文章」
# 2. 观察六步流程实时推送
# 3. 打开生成的文档 → 确认引用了知识库内容
```

---

## 十、比赛 Demo 剧本

```
🎬 场景 1：语义检索（1 分钟）
  问「怎么变强？」→ 系统理解你在问修炼体系，自动找到「大炎王朝」卡片
  对比：关键词会漏掉 —— 展示语义搜索的价值

🎬 场景 2：Agent 写作（3 分钟）
  点「AI 写作」→ 输入目标 → 展示六步自动化流程
  每一步都有可视化进度——不是黑盒

🎬 场景 3：亮点总结（1 分钟）
  1. 语义 RAG — Milvus 驱动的真正向量检索
  2. Agent 写作 — 从调研到成文全自动
  3. 用户数据自主 — 所有配置可自定义，不绑定任何云服务
```

---

## 附录：可复用的现有代码

| 函数 | 位置 | 复用场景 |
|------|------|----------|
| `stripHtml()` | `server/src/routes/ai.ts:106` | 文档分块 |
| `extractJsonObject()` | `server/src/routes/ai.ts:169` | Agent 解析 LLM 回复 |
| `buildSystemPrompt()` | `server/src/services/aiService.ts:211` | Agent 系统提示词 |
| `getUserApiKey()` | `server/src/services/aiService.ts:414` | Embedding 配置模式 |
| `detectInjection()` | `server/src/services/aiService.ts:384` | Agent goal 安全检查 |
| `streamChat()` (SSE) | `document/src/components/AIChatWidget.tsx:292` | Agent SSE 模式参考 |
| `markdownToHtml()` | `document/src/components/AIChatWidget.tsx:146` | Agent 输出转换 |
