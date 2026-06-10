---
name: editor-external-reload
description: Make Editor re-render when its content is updated externally (e.g., by AI), not just when doc.id changes
source: auto-skill
extracted_at: '2026-05-29T02:29:04.425Z'
---

# Editor External Reload

When a document's content is updated in the background (e.g., by AI via `api.updateDocument`), the Editor component does **not** re-render the new content because it only checks `doc.id` for changes.

## Root Cause

The Editor's `useEffect` that loads content into Tiptap uses `loadedDocumentIdRef` to skip reloading:

```tsx
useEffect(() => {
  if (!editor || !doc) return;
  if (loadedDocumentIdRef.current === doc.id) return; // skips if same ID
  // ...load content
  loadedDocumentIdRef.current = doc.id;
}, [doc?.id, editor]);
```

When `refreshDocuments()` updates the store with a new `content` for the **same** `doc.id`, the effect short-circuits and never calls `editor.chain().setContent()`.

## Fix

Track the document's `updatedAt` timestamp alongside its `id` to detect external changes:

```tsx
const prevUpdatedAtRef = useRef<string | null>(null);

useEffect(() => {
  if (!editor || !doc) return;
  // Reload if document ID changed OR if updatedAt changed (external update)
  const docChangedExternally = loadedDocumentIdRef.current === doc.id &&
    prevUpdatedAtRef.current && prevUpdatedAtRef.current !== doc.updatedAt;
  if (loadedDocumentIdRef.current === doc.id && !docChangedExternally) return;

  // Flush pending changes of previous document
  if (loadedDocumentIdRef.current && saveTimerRef.current) {
    const prevDocId = loadedDocumentIdRef.current;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    updateDocumentRef.current(prevDocId, {
      title: titleRef.current,
      content: editor.getHTML(),
    });
  }

  editor.chain().setContent(doc.content).setTextSelection(0).run();
  setSelectionChars(0);
  setTitle(doc.title);
  updateCounts(editor);
  loadedDocumentIdRef.current = doc.id;
  prevUpdatedAtRef.current = doc.updatedAt;
}, [doc?.id, doc?.updatedAt, editor, updateCounts]);
```

## Key Points

- **Both `doc.id` and `doc.updatedAt`** must be in the dependency array.
- `prevUpdatedAtRef` stores the last loaded `updatedAt` to compare against.
- The external change check only fires when `doc.id` is the same but `updatedAt` differs from the previous value.
- This also handles the initial load correctly since `prevUpdatedAtRef` starts as `null` (so `docChangedExternally` is false on first mount).

## When This Matters

- AI generates a new document → Editor should show it when the user switches to it
- AI modifies a document in the background → Editor should refresh with the new content without the user switching away and back
- Real-time collaboration (if added later)