---
name: dnd-kit-drag-overlay-fix
description: Fix dnd-kit DragOverlay position issues, Prisma transaction bugs, and know when to drop DragOverlay entirely
source: auto-skill
extracted_at: '2026-05-28T06:37:04.530Z'
---

# Fix dnd-kit DragOverlay Position Issues (and When to Remove It)

When using `@dnd-kit` inside a Dialog/Modal, the DragOverlay may jump to the wrong position (e.g., far right). This skill covers both targeted fixes and the nuclear option.

## Quick fixes (when you want to keep DragOverlay)

### Fix 1: Modifier forces `x: 0`

**Symptom**: Drag overlay jumps horizontally to the edge of the container.

**Cause**: A modifier returns `{ ...transform, x: 0 }` which resets the horizontal transform delta. This breaks when the overlay is portaled (as in dialogs) because the x offset from the original element position is lost.

**Fix**: Only constrain the axis you actually need. For vertical-only lists, constrain `y` but leave `x` unchanged, or remove the modifier entirely if `closestCenter` collision detection already handles vertical sorting:

```ts
// WRONG — causes overlay to jump
return { ...args.transform, x: 0, y: newY };

// CORRECT — only constrain y, leave x alone
return { ...args.transform, y: newY };

// BETTER — if verticalListSortingStrategy is used, skip the modifier entirely
// and let dnd-kit handle positioning naturally
```

### Fix 2: Drag listeners bound to wrapper div

**Symptom**: Drag behavior is inconsistent or the overlay position is wrong.

**Cause**: Wrapping the drag handle in `<div {...attributes} {...listeners} className="contents">` causes event propagation issues.

**Fix**: Bind `attributes` and `listeners` directly to the interactive element:

```tsx
// WRONG
<div {...attributes} {...listeners} className="contents">
  <Button><GripVertical /></Button>
</div>

// CORRECT
<Button {...attributes} {...listeners}>
  <GripVertical />
</Button>
```

### Fix 3: Modifier uses stale container snapshot

**Symptom**: Overlay drifts when the dialog has entrance animations or scroll.

**Cause**: Caching `getBoundingClientRect()` at drag-start gives a stale rect.

**Fix**: Read the container rect live in each modifier call, or remove the modifier entirely.

## Nuclear option: Remove DragOverlay entirely (recommended for simple vertical lists)

**When to use**: If you only need basic vertical reordering inside a dialog, `DragOverlay` adds complexity with little visual benefit. The item's own `opacity` transition during drag is sufficient feedback.

**What to remove:**
- `DragOverlay` component and its children
- `DragStartEvent` / `onDragStart` handler (no need to track dragging id)
- `KeyboardSensor` and `sortableKeyboardCoordinates` (unless keyboard support is needed)
- Custom `modifiers` on `DndContext`
- Dynamic height calculations, container refs, and pre-drag snapshots
- `draggingCategoryId` state

**What to keep:**
- `DndContext` with just `PointerSensor` (8px activation constraint)
- `SortableContext` with `verticalListSortingStrategy`
- `useSortable` hook in each item (provides transform, transition, isDragging)
- `onDragEnd` handler that calls `arrayMove`
- Simple `onDragCancel` that does nothing (or resets state)

**Minimal working example:**

```tsx
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({ item, index }: { item: Item; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 rounded-xl border bg-white px-3 py-3"
    >
      <button {...attributes} {...listeners} className="cursor-grab"><GripVertical /></button>
      <span>{item.name}</span>
    </div>
  );
}

function CategoryList({ items, setItems }: { items: Item[]; setItems: (fn: (prev: Item[]) => Item[]) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2" style={{ maxHeight: 360, overflow: "auto" }}>
          {items.map((item, i) => <SortableItem key={item.id} item={item} index={i} />)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

This reduced code by ~100 lines and eliminated all position-jump bugs.

## Fix 4: Y-axis boundary constraint prevents scroll bar flash

**Symptom**: When dragging quickly downward, a scroll bar appears, then disappears when dragging back up.

**Cause**: The modifier only constrains `x: 0` but leaves `y` unconstrained. The drag overlay can move beyond the container's `maxHeight`, triggering `overflow-y: auto` scroll bars.

**Fix**: Add Y-axis boundary clamping in the modifier:

```ts
const categoryListRef = useRef<HTMLDivElement | null>(null);

const restrictToVertical: Modifier = (args) => {
  const container = categoryListRef.current;
  if (!container) return { ...args.transform, x: 0 };

  const rect = container.getBoundingClientRect();
  const overlayRect = args.overlayNodeRect;
  if (!overlayRect) return { ...args.transform, x: 0 };

  let newY = args.transform.y;
  if (args.transform.y < 0) {
    newY = 0; // clamp top
  }
  const maxDrag = rect.height - overlayRect.height;
  if (args.transform.y > maxDrag) {
    newY = maxDrag; // clamp bottom
  }

  return { ...args.transform, x: 0, y: newY };
};

// Usage
<DndContext sensors={sensors} modifiers={[restrictToVertical]} ...>
```

Also bind `categoryListRef` to the container `<div>` that has `maxHeight` and `overflow-y: auto`.

## Related: `min-width` override by `w-screen`

**Symptom**: `body { min-width: 1024px }` has no effect, page still shrinks below 1024px.

**Cause**: React root container uses `className="w-screen overflow-hidden"` — `w-screen` forces `width: 100vw` which overrides the body's `min-width`, and `overflow-hidden` clips anything that exceeds.

**Fix**: On the root container, replace `w-screen overflow-hidden` with `min-w-[1024px] overflow-x-auto`:

```tsx
// WRONG
<div className="h-screen w-screen overflow-hidden">

// CORRECT
<div className="h-screen min-w-[1024px] overflow-x-auto">
```

## Related: Prisma `$transaction` Promise array type error

**Symptom**: `"All elements of the array need to be Prisma Client promises"` when using `$transaction` with `.map()`.

**Cause**: Prisma's batch transaction mode (Promise array) has strict type checking on array elements in some versions. `.map()` may produce values that fail the type guard.

**Fix**: Use interactive transaction mode instead:

```ts
// WRONG — Promise array mode
await prisma.$transaction(
  items.map((item) =>
    prisma.aIBrainCategory.updateMany({
      where: { id: item.id, userId },
      data: { sortOrder: item.sortOrder },
    })
  )
);

// CORRECT — interactive transaction
await prisma.$transaction(async (tx) => {
  for (const item of items) {
    await tx.aIBrainCategory.updateMany({
      where: { id: item.id, userId },
      data: { sortOrder: item.sortOrder },
    });
  }
});
```
