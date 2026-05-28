---
name: ai-chat-action-intent-and-doc-crud
description: Detect user action intent in AI chat and handle document create/update via model tags without showing raw content in chat
source: auto-skill
extracted_at: '2026-05-28T07:28:10.688Z'
---

# AI Chat Action Intent Detection & Document CRUD via Model Tags

When users ask the AI to generate or modify content, the model should handle it via special tags that trigger app actions, while only showing friendly confirmation messages in the chat interface.

## Detecting Action Intent

Use keyword matching on the user's message to set `actionMode`, which changes the thinking indicator text and suppresses streaming display for action operations.

```ts
const ACTION_KEYWORDS = /生成|创建|修改|删除|收藏|添加|编辑|写文章|新建|制作|翻译|改写|润色|扩写|总结/i;

function isActionIntent(message: string): boolean {
  return ACTION_KEYWORDS.test(message);
}
```

In `handleSend`:
```ts
setActionMode(isActionIntent(text));
```

When `actionMode` is true:
- Display "小麦正在行动..." instead of "小麦正在思考..."
- Suppress streaming content updates in the chat (return early from `onDelta` callback)
- Only show the final parsed reply after the model finishes

## Model Output Format (System Prompt)

The system prompt instructs the model to use special tags for content generation and modification:

```
CRITICAL RULE — How to handle content GENERATION requests:
<<DOC_BEGIN>>
[full generated content — NOT shown in chat]
<<DOC_END>>
<<CREATE_DOC:title_here>>
[brief confirmation message to user]

CRITICAL RULE — How to handle content MODIFICATION requests:
<<DOC_BEGIN>>
[full revised content — the complete updated version]
<<DOC_END>>
<<UPDATE_DOC:document_id_here>>
[brief confirmation message to user]
```

The model is told to look for `[doc:xxxxx]` markers in the conversation context to find the target document ID for updates.

## Parsing Actions

`parseAction()` in `server/src/services/aiService.ts` extracts actions from the model's raw output:

```ts
export function parseAction(reply: string): { reply: string; action: any } {
  const docContentMatch = reply.match(/<<DOC_BEGIN>>\n?([\s\S]*?)<<DOC_END>>/);
  const titleMatch = reply.match(/<<CREATE_DOC:(.+)>>/);
  const updateMatch = reply.match(/<<UPDATE_DOC:([^>]+)>>/);

  if (!titleMatch && !updateMatch) return { reply, action: null };

  const docContent = docContentMatch ? docContentMatch[1].trim() : "";

  if (updateMatch) {
    const docId = updateMatch[1].trim();
    let cleanReply = reply
      .replace(/<<DOC_BEGIN>>[\s\S]*?<<DOC_END>>\n?/g, "")
      .replace(/<<UPDATE_DOC:[^>]+>>\n?/g, "")
      .trim();
    if (!cleanReply) cleanReply = "已为您完成修改，请查看文档~";
    return { reply: cleanReply, action: { type: "update_document", docId, content: docContent } };
  }

  // create_document...
}
```

## Reference Context with Document IDs

`buildReferenceContext()` in `server/src/routes/ai.ts` includes `[doc:xxxxx]` in the reference text so the model knows the document ID:

```ts
`[引用文档：${doc.title}] [doc:${doc.id}]`
```

This lets the model output `<<UPDATE_DOC:actual-uuid>>` with the correct ID, rather than relying on client-side title matching.

## Client-Side Action Handlers

In `AIChatWidget.tsx`, after `streamChat` returns:

```ts
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

## Multi-Turn Document Context

After creating or updating a document, append a system note to `memoryRef` containing:
- Document title and ID (`[doc:xxxxx]`)
- Content summary (first 200 chars)

This enables multi-turn conversations like:
1. User: `@halou 改成200字` → Model updates doc, saves summary to memory
2. User: `这个文章再改长一点` → Model sees the summary in memory, understands "这个文章" refers to the previously modified document

## Key Principles

- **Model decides the target**: The model outputs the document ID in `<<UPDATE_DOC:id>>`, client code should NOT use title matching or heuristic logic to guess which document to update.
- **Content never shows in chat**: `parseAction` strips `<<DOC_BEGIN>>...<<DOC_END>>` from the reply. Only the confirmation message appears in the chat bubble.
- **Action mode suppresses streaming**: When `actionMode` is true, `onDelta` returns early so raw content never flashes in the chat during streaming.
- **Memory persists context**: System notes are saved to localStorage via `saveMemory()` so they survive page refreshes.
