---
name: semantic-context-extraction
description: Backend-based semantic context extraction for AI selection editing, replacing frontend fixed-character cuts
source: auto-skill
extracted_at: '2026-05-29T05:04:13.747Z'
---

# Semantic Context Extraction for AI Selection Editing

When users select text in the editor and invoke AI actions (rewrite/expand/summarize), the AI needs surrounding context to maintain tone, logic, and consistency. **Do NOT use frontend fixed-character extraction** — use backend semantic-based extraction instead.

## Why Backend, Not Frontend

| Issue | Frontend Fixed-Char | Backend Semantic |
|-------|---------------------|------------------|
| Sentence completeness | May cut mid-sentence | Always ends at sentence/paragraph boundary |
| Token efficiency | Fixed 400 chars regardless of selection | Dynamic: 150-500 chars based on selection length |
| Full document access | Only has editor viewport | Has entire document from database |
| Flexibility | Requires frontend rebuild to adjust | Backend can adjust strategy independently |

## Implementation

### Backend (`server/src/services/aiService.ts`)

```ts
// Sentence boundary: Chinese/English punctuation
const SENTENCE_BOUNDARY = /[\u3002\uff01\uff1f\.!?]+[\s\n]*/;
// Paragraph boundary: double newline
const PARAGRAPH_BOUNDARY = /\n\s*\n/;

function findSemanticBoundary(
  text: string,
  limit: number,
  direction: "backward" | "forward"
): number {
  if (text.length <= limit) return text.length;
  const slice = direction === "backward" ? text.slice(-limit) : text.slice(0, limit);

  // Priority: paragraph > sentence > fallback
  const paraMatches = [...slice.matchAll(new RegExp(PARAGRAPH_BOUNDARY.source, "g"))];
  if (paraMatches.length > 0) {
    const match = direction === "backward" ? paraMatches[paraMatches.length - 1] : paraMatches[0];
    // Return position after the boundary
  }

  const sentenceMatches = [...slice.matchAll(new RegExp(SENTENCE_BOUNDARY.source, "g"))];
  if (sentenceMatches.length > 0) {
    // Return position after sentence boundary
  }

  return limit; // Fallback
}

export function getSemanticContext(
  fullText: string,
  selectedText: string
): { preceding: string; succeeding: string } {
  const selStart = fullText.indexOf(selectedText);
  if (selStart === -1) return { preceding: "", succeeding: "" };

  const selLen = selectedText.length;
  // Dynamic context range based on selection length
  const contextLimit = selLen < 50 ? 150 : selLen < 200 ? 300 : 500;

  const beforeText = fullText.slice(0, selStart);
  const precedingLen = findSemanticBoundary(beforeText, contextLimit, "backward");
  const preceding = beforeText.slice(-precedingLen);

  const afterText = fullText.slice(selStart + selectedText.length);
  const succeedingLen = findSemanticBoundary(afterText, contextLimit, "forward");
  const succeeding = afterText.slice(0, succeedingLen);

  return { preceding, succeeding };
}
```

### Backend Route (`server/src/routes/ai.ts`)

```ts
// In /chat route, when purpose === "selection_edit":
if (isSelectionEdit && references) {
  const docRef = references.find((r: any) => r?.type === "document" && r?.id && r?.selectedText);
  if (docRef) {
    const doc = await prisma.document.findFirst({
      where: { id: docRef.id, userId, isDeleted: false },
      select: { content: true },
    });
    if (doc) {
      const plainText = stripHtml(doc.content);
      const { preceding, succeeding } = getSemanticContext(plainText, docRef.selectedText);
      selectionContext = `【选中文字的上下文】\n前文：${preceding || "(无)"}\n后文：${succeeding || "(无)"}`;
    }
  }
}
```

### Frontend (`document/src/components/AIBubbleMenu.tsx`)

```ts
// Only pass selectedText and documentId — NO context extraction
const references = documentId
  ? [{ type: "document", id: documentId, selectedText }]
  : [];

const reply = await streamChat({
  messages: [{ role: "user", content: userMessage }],
  personality: "normal",
  purpose: "selection_edit",
  references,
}, onDelta, signal);
```

## Context Range Guidelines

| Selection Length | Context Range | Rationale |
|-----------------|---------------|-----------|
| < 50 chars | 150 chars | Short selection needs ~1 sentence context |
| 50-200 chars | 300 chars | Medium selection needs 1-2 paragraphs |
| > 200 chars | 500 chars | Long selection needs more context for consistency |

## Key Principles

- **Frontend only sends**: `selectedText` + `documentId`
- **Backend extracts context**: from full document in database
- **Semantic boundaries preferred**: paragraph > sentence > character limit
- **Dynamic range**: shorter selections get less context, longer get more
- **Context injected into system prompt**: not shown to user in chat
