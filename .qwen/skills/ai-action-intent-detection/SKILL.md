---
name: ai-action-intent-detection
description: Show different status text ("acting" vs "thinking") based on user intent keywords, show only confirmation messages (not article content) in chat for document creation/update actions, and maintain multi-turn document context
source: auto-skill
extracted_at: '2026-05-28T07:00:42.981Z'
---

# AI Chat: Action Intent Detection, Chat Output Suppression, and Multi-Turn Document Context

When users explicitly ask the AI to perform actions (generate, create, modify, etc.), the chat should:
1. Show "正在行动..." instead of "正在思考..."
2. Only show the model's confirmation message in chat (NOT the generated article content)
3. Maintain document context in conversation memory for multi-turn follow-ups like "这个文章多增加点字数"

## Pattern: Detect action intent from user message

Define a keyword regex to detect whether a user message is an action request:

```ts
const ACTION_KEYWORDS = /生成|创建|修改|删除|收藏|添加|编辑|写文章|新建|制作|翻译|改写|润色|扩写|总结/i;

function isActionIntent(message: string): boolean {
  return ACTION_KEYWORDS.test(message);
}
```

## Pattern: Conditional status indicator

Track `actionMode` state alongside `loading`/`streaming`. Set it when the user sends a message:

```tsx
const [actionMode, setActionMode] = useState(false);

// In handleSend:
setLoading(true);
setActionMode(isActionIntent(text));

// In the thinking/action indicator:
{loading && !streaming && (
  <span>{(actionMode ? t("ai.action") : t("ai.thinking"))}</span>
)}

// In finally block, reset:
setActionMode(false);
```

## Backend: System prompt defines `<<DOC_BEGIN>>...<<UPDATE_DOC>>` format

The system prompt in `server/src/services/aiService.ts` must tell the model to use special tags for both creation and modification:

```
CRITICAL RULE — How to handle content GENERATION requests:
<<DOC_BEGIN>>
[content]
<<DOC_END>>
<<CREATE_DOC:title_here>>
[confirmation message]

CRITICAL RULE — How to handle content MODIFICATION requests:
<<DOC_BEGIN>>
[revised content]
<<DOC_END>>
<<UPDATE_DOC>>
[confirmation message]
```

The `parseAction` function extracts both action types:

```ts
export function parseAction(reply: string): { reply: string; action: any } {
  const docContentMatch = reply.match(/<<DOC_BEGIN>>\n?([\s\S]*?)<<DOC_END>>/);
  const titleMatch = reply.match(/<<CREATE_DOC:(.+)>>/);
  const updateMatch = reply.match(/<<UPDATE_DOC>>/);

  if (!titleMatch && !updateMatch) return { reply, action: null };

  const docContent = docContentMatch ? docContentMatch[1].trim() : "";

  if (updateMatch) {
    let cleanReply = reply
      .replace(/<<DOC_BEGIN>>[\s\S]*?<<DOC_END>>\n?/g, "")
      .replace(/<<UPDATE_DOC>>\n?/g, "").trim();
    return { reply: cleanReply || "已为您完成修改，请查看文档~", action: docContent ? { type: "update_document", content: docContent } : null };
  }

  const title = titleMatch[1].trim();
  let cleanReply = reply
    .replace(/<<DOC_BEGIN>>[\s\S]*?<<DOC_END>>\n?/g, "")
    .replace(/<<CREATE_DOC:(.+)>>\n?/g, "").trim();
  return { reply: cleanReply || `已为您生成文档「${title}」，请查看~`, action: docContent ? { type: "create_document", title, content: docContent } : null };
}
```

## Pattern: Always show reply in chat (parseAction already strips content)

IMPORTANT: `parseAction` removes `<<DOC_BEGIN>>...<<DOC_END>>` from the reply, leaving only the confirmation message. So always show the reply — the article content is already stripped:

```tsx
const { reply, action } = await streamChat(..., (delta) => {
  fullContent += delta;
  if (actionMode) return; // Don't stream into chat for actions
  // ...normal streaming logic
}, abort.signal);

const finalContent = reply || fullContent;

// Always show reply in chat (parseAction already strips doc content)
setMessages((prev) => { ...update last message with finalContent... });
memoryRef.current = [...memory, { role: "assistant", content: finalContent }];

// Then handle the action
if (action?.type === "create_document" && action.content) {
  await createDocument("general", action.title, markdownToHtml(action.content));
  // Append system note to memory for multi-turn context
  const docNote = { role: "assistant" as const, content: `[系统] 已为用户创建文档「${action.title}」。内容摘要：${action.content.slice(0, 200)}...` };
  memoryRef.current = [...memoryRef.current, docNote];
  saveMemory(memoryRef.current);
}

if (action?.type === "update_document" && action.content) {
  // Find the last created/updated document title from memory
  const lastDocNote = [...memoryRef.current].reverse().find(
    (m) => m.role === "assistant" && m.content.startsWith("[系统] 已为用户创建文档") || m.content.startsWith("[系统] 已为用户更新文档")
  );
  const docTitle = lastDocNote?.content.match(/「(.+?)」/)?.[1];
  if (docTitle) {
    const targetDoc = documents.find((d) => d.title === docTitle);
    if (targetDoc) {
      await api.updateBrainKnowledge(targetDoc.id, { title: docTitle, description: action.content });
      refreshDocuments();
      const updatedNote = { role: "assistant" as const, content: `[系统] 已为用户更新文档「${docTitle}」。最新内容摘要：${action.content.slice(0, 200)}...` };
      memoryRef.current = [...memoryRef.current, updatedNote];
      saveMemory(memoryRef.current);
    }
  }
}
```

## Why multi-turn document context matters

Without appending the document summary to `memoryRef.current`, when a user says "这个文章不要200字了" in a follow-up turn, the model only sees:
- User: "生成一篇200字的文章"
- Assistant: "已为您生成文档「标题」，请查看~"

The model has NO idea what the actual article content was, so it cannot understand "这个文章" refers to the previously generated content. Appending a system note with the content summary (first 200 chars) gives the model enough context for follow-up modification requests.

## I18n keys needed

```ts
"ai.thinking": { zh: "小麦正在思考...", en: "XiaoMai is thinking..." },
"ai.action": { zh: "小麦正在行动...", en: "XiaoMai is acting..." },
```
