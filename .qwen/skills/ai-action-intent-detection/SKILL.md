---
name: ai-action-intent-detection
description: Always pass current document context to LLM for intent detection; show only confirmation messages (not article content) in chat for document creation/update actions; maintain multi-turn document context
source: auto-skill
extracted_at: '2026-05-29T03:02:51.815Z'
---

# AI Chat: LLM-Based Intent Detection, Chat Output Suppression, and Multi-Turn Document Context

When users explicitly ask the AI to perform actions (generate, create, modify, etc.), the chat should:
1. Only show the model's confirmation message in chat (NOT the generated article content)
2. Maintain document context in conversation memory for multi-turn follow-ups like "这个文章多增加点字数"

## Pattern: Always pass current document as context

Do NOT use regex keyword matching to decide whether to pass document context. Instead, always include the current open document as a reference — the LLM decides based on semantic understanding:

```ts
const currentDocument = currentDocumentId ? getDocument(currentDocumentId) : undefined;
// Always pass current document as context for LLM-based intent detection
const currentReference = currentDocument && !currentDocument.isDeleted
  ? [{ type: "document" as const, id: currentDocument.id, title: currentDocument.title }]
  : [];
const requestReferences = uniqueReferences([...currentReference, ...references, ...referencedByText, ...brainReferences, ...referencedBrainsByText]);
```

## Why LLM-based over regex-based

The old regex approach had problems:
- Missed keywords like "增加" (increase/add)
- Required manual maintenance of keyword list
- Could not handle nuanced expressions like "加一点" or "写长一些"

With LLM-based detection, the model sees the document context + user message and decides semantically whether to emit `create_document` or `update_document` actions.

## Backend: System prompt defines `<<ACTION_JSON>>` format

The system prompt in `server/src/services/aiService.ts` uses structured JSON blocks:

```
CONTEXT AWARENESS:
You will always be given the current document context if the user has a document open.
When the user's message relates to the current document (e.g., "make it longer", "add more words", "change the tone"), you MUST use the document's [doc:xxxxx] ID to update it.

CRITICAL RULE — How to handle content GENERATION requests:
<<ACTION_JSON>>
{
  "reply": "已为您生成文档「标题」，请查看~",
  "action": { "type": "create_document", "title": "title", "content": "markdown content" }
}
<<ACTION_JSON_END>>

CRITICAL RULE — How to handle content MODIFICATION requests:
<<ACTION_JSON>>
{
  "reply": "已为您完成修改，请查看文档~",
  "action": { "type": "update_document", "docId": "uuid from [doc:xxxxx]", "content": "complete revised markdown" }
}
<<ACTION_JSON_END>>

The docId MUST be the UUID from [doc:xxxxx], never the document title.
```

The `parseAction` function extracts both action types via `extractStructuredAction`:

```ts
function extractStructuredAction(reply: string): { reply: string; action: any } | null {
  const blockMatch = reply.match(/<<ACTION_JSON>>\s*([\s\S]*?)\s*<<ACTION_JSON_END>>/);
  // Parses JSON payload inside the block
  // Returns { reply: cleanReply, action: { type, docId/title, content } }
}
```

## Pattern: Handle create/update document actions

After `streamChat` returns with parsed action:

```tsx
// Create document
if (action?.type === "create_document" && action.content) {
  const docId = await createDocument("general", action.title, markdownToHtml(action.content));
  // Append system note to memory for multi-turn context
  memoryRef.current = [...memoryRef.current, {
    role: "assistant",
    content: `[系统] 已为用户创建文档「${action.title}」[doc:${docId}]。内容摘要：${action.content.slice(0, 200)}...`
  }];
  saveMemory(memoryRef.current);
}

// Update document (model provides the docId)
if (action?.type === "update_document" && action.content) {
  const targetDoc = action.docId ? getDocument(action.docId) : null;
  if (targetDoc) {
    await api.updateDocument(targetDoc.id, {
      title: targetDoc.title,
      content: markdownToHtml(action.content),
    });
    refreshDocuments();
    memoryRef.current = [...memoryRef.current, {
      role: "assistant",
      content: `[系统] 已为用户更新文档「${targetDoc.title}」[doc:${targetDoc.id}]。最新内容摘要：${action.content.slice(0, 200)}...`
    }];
    saveMemory(memoryRef.current);
  }
}
```

## Why multi-turn document context matters

Without appending the document summary to `memoryRef.current`, when a user says "这个文章不要200字了" in a follow-up turn, the model only sees:
- User: "生成一篇200字的文章"
- Assistant: "已为您生成文档「标题」，请查看~"

The model has NO idea what the actual article content was. Appending a system note with the content summary (first 200 chars) gives the model enough context for follow-up modification requests.

## I18n keys needed

```ts
"ai.thinking": { zh: "小麦正在思考...", en: "XiaoMai is thinking..." },
```

Note: The old "action mode" with "正在行动..." indicator has been removed — the LLM now decides intent semantically rather than via keyword matching.
