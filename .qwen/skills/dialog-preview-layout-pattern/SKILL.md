---
name: dialog-preview-layout-pattern
description: Pattern for Dialog with scrollable content and fixed footer buttons, plus null-safe rendering for pending async state
source: auto-skill
extracted_at: '2026-05-29T02:43:42.155Z'
---

# Dialog Preview Layout Pattern

When a Dialog shows a scrollable diff/preview with fixed action buttons at the bottom, several layout and state-safety pitfalls can occur.

## Problem 1: Bottom Buttons Clipped

With `max-h-[86vh] overflow-hidden` on `DialogContent`, the bottom action buttons get scrolled out of view or clipped.

### Fix: Flex Column Layout

```tsx
<DialogContent className="flex max-h-[86vh] max-w-[880px] flex-col overflow-hidden p-0">
  {/* Header: shrink-0 so it never collapses */}
  <div className="shrink-0 border-b border-surface-200 px-6 py-5 dark:border-surface-700">
    <DialogTitle>...</DialogTitle>
  </div>

  {/* Scrollable content: flex-1 takes remaining space */}
  <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden">
    <div className="grid shrink-0 grid-cols-[96px_1fr] border-b ...">
      {/* Table header — shrink-0 */}
    </div>
    <Scrollbar className="flex-1">
      {/* Scrollable content rows */}
    </Scrollbar>
  </div>

  {/* Footer buttons: shrink-0 so they're always visible */}
  <div className="shrink-0 flex items-center justify-end gap-2 bg-white px-6 py-4 dark:bg-surface-900">
    <Button variant="outline" onClick={() => setPendingUpdate(null)}>Cancel</Button>
    <Button onClick={applyPendingUpdate}>Apply</Button>
  </div>
</DialogContent>
```

### Key Rules

| Section | Class | Purpose |
|---|---|---|
| DialogContent | `flex flex-col` | Vertical flex container |
| Header | `shrink-0` | Never shrinks, always fully visible |
| Table header | `shrink-0` | Stays fixed at top of scroll area |
| Scroll area | `flex-1` | Takes all remaining space |
| Footer buttons | `shrink-0` | Always visible at bottom |

## Problem 2: Null State During Async Operations

When an async action (like `applyPendingUpdate`) is in progress and the user closes the Dialog (or `onOpenChange` fires), the state variable (`pendingUpdate`) becomes `null` before the async operation finishes, causing `Cannot read properties of null (reading 'stats')`.

### Fix: Cache at Function Entry

```tsx
const applyPendingUpdate = useCallback(async () => {
  if (!pendingUpdate || applyingUpdate) return;
  const update = pendingUpdate; // Cache current value before any state change
  setApplyingUpdate(true);
  try {
    // Use `update` (local const), NOT `pendingUpdate` (state ref)
    await createDocumentVersion(update.docId, "ai_edit");
    await updateDocument(update.docId, { title: update.title, content: update.nextHtml });
    // ...
  } finally {
    setApplyingUpdate(false);
  }
}, [applyingUpdate, pendingUpdate, ...]);
```

## Problem 3: Null Access in JSX During Re-render

Even though the Dialog has `open={!!pendingUpdate}`, React may re-render the Dialog's children one more time during the close transition, with `pendingUpdate` already `null`. Using `pendingUpdate!.stats` crashes.

### Fix: Conditional Render Block

```tsx
<Dialog open={!!pendingUpdate} onOpenChange={...}>
  <DialogContent>
    {/* Header always renders */}
    <div className="shrink-0 ...">...</div>

    {/* Content wrapped in null check */}
    {pendingUpdate && (
      <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden">
        <div className="grid shrink-0 grid-cols-[96px_1fr] ...">
          <div>{pendingUpdate.stats.unchanged}</div>  {/* Safe: guarded by outer && */}
        </div>
        <Scrollbar className="flex-1">...</Scrollbar>
      </div>
    )}

    {/* Footer buttons outside the && block (they use disabled prop, not pendingUpdate data) */}
    <div className="shrink-0 flex items-center justify-end gap-2 ...">
      <Button variant="outline" onClick={() => setPendingUpdate(null)} disabled={applyingUpdate}>
        Cancel
      </Button>
      <Button onClick={applyPendingUpdate} disabled={applyingUpdate}>
        Apply
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

## Summary

1. Use `flex flex-col` + `shrink-0` + `flex-1` for Dialogs with scrollable content and fixed footers
2. Cache state values at the top of async functions before any `setX(null)` can fire
3. Wrap JSX that reads nullable state in `{value && (...)}`, don't rely on `open={!!value}` alone
