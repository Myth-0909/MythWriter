---
name: ai-chat-action-intent-and-doc-crud
description: LLM-based intent detection for AI chat actions with document create/update via structured JSON blocks and diff preview
source: auto-skill
extracted_at: '2026-05-29T03:30:00.000Z'
---

# AI Chat Action Intent & Document CRUD via LLM

Users can ask the AI to generate or modify documents. The model decides via semantic understanding whether to emit an action block, and the client executes it with a diff preview before applying.

## LLM-Based Intent Detection (No Regex)

**Do NOT use regex keyword matching for intent detection.** Always pass the current open document as context to the backend, and let the LLM decide based on semantic understanding.

```ts
// In handleSend: always pass current document as context
const currentDocument = currentDocumentId ? getDocument(currentDocumentId) : undefined;
const currentReference = currentDocument && !currentDocument.isDeleted
  ? [{ type: "document" as const, id: currentDocument.id, title: currentDocument.title }]
  : [];
const requestReferences = uniqueReferences([...currentReference, ...references, ...referencedByText, ...brainReferences]);
```

The model receives `references: requestReferences` in the `streamChat` call and sees the document UUID in the reference context.

## Dynamic Thinking/Acting Indicator

Use `isActing` state that switches based on detected action markers in the model's streaming output:

```ts
const [isActing, setIsActing] = useState(false);

// During streaming — detect action markers
(delta) => {
  fullContent += delta;
  if (/<<ACTION_JSON>>|<<DOC_BEGIN>>|<<UPDATE_DOC:/.test(fullContent)) {
    setIsActing(true);  // Switch to "小麦正在行动"
  }
  // ... update messages
}

// After streaming — confirm from parsed action
const hasAction = !!(action && (action.type === "create_document" || action.type === "update_document"));
setIsActing(hasAction);
```

Reset `isActing` on stop and in `finally` block.

## Model Output Format — Structured JSON

The system prompt tells the model to use `<<ACTION_JSON>>` blocks:

```
## 新建文档:
<<ACTION_JSON>>
{ "reply": "已为您生成文档「标题」，请查看~", "action": { "type": "create_document", "title": "...", "content": "..." } }
<<ACTION_JSON_END>>

## 修改文档:
<<ACTION_JSON>>
{ "reply": "已为您完成修改，请查看文档~", "action": { "type": "update_document", "docId": "UUID", "content": "..." } }
<<ACTION_JSON_END>>
```

## Reply Sanitization (Server-Side)

In `extractStructuredAction()`, strip content-description patterns and cap reply to 60 chars:

```ts
const ACTION_DESC_PATTERNS = [
  /以下是[修改后|更新后|新|调整][^：:]*[:：]?[\s\S]*/g,
  /本次[修改|调整|更新|改动][^：:]*[:：]?[\s\S]*/g,
  /改动说明[:：][\s\S]*$/g, /修改内容[:：][\s\S]*$/g,
];
for (const pattern of ACTION_DESC_PATTERNS) cleanReply = cleanReply.replace(pattern, "").trim();

if (cleanReply.length > 60 || !cleanReply) {
  cleanReply = action?.type === "update_document" ? "已为您完成修改，请查看文档~" : `已为您生成文档「${title}」，请查看~`;
}
```

## Diff Preview Before Applying

Show a `PendingUpdate` dialog with `flex flex-col` layout: header (`shrink-0`), scrollable diff content (`flex-1`), buttons (`shrink-0` always visible).

## Apply Update with Cache

Cache `pendingUpdate` to a local variable before async operations to prevent null reference if dialog closes mid-operation.

## Key Principles

- **LLM decides intent**: No regex. Model sees document context and decides semantically
- **Reply must be short**: One sentence confirmation only
- **Diff preview before apply**: User reviews changes, clicks confirm
- **Cache pending update**: Prevent null reference during async operation
- **isActing tracks streaming**: Switch indicator based on detected action markers
