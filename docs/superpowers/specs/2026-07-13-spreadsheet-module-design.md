# Built-in Spreadsheet Module Design

Date: 2026-07-13
Status: Design draft for review

## Goal

Add a first-class spreadsheet area to MythWriter: a standalone spreadsheet center plus an Excel-like spreadsheet editor. The first version targets standard spreadsheet workflows rather than lightweight tables: multi-sheet workbooks, formulas, formatting, merge cells, frozen rows/columns, sorting/filtering, copy/paste, undo/redo, and `.xlsx` import/export.

The module is independent from the existing Tiptap document editor. Documents may reference spreadsheets in a later phase, but the initial implementation should not store workbook state inside `Document.content`.

## Chosen Component

Use Handsontable through the official React wrapper:

- `handsontable`
- `@handsontable/react-wrapper`
- `hyperformula` for formula support
- `xlsx` or a similar parser/exporter for `.xlsx` import/export if Handsontable data extraction is not enough on its own

Why Handsontable:

- It fits the current React 19 + Vite + Tauri desktop stack.
- It is closer to an Excel-like editing surface than data-grid-first options.
- It supports the needed spreadsheet mechanics: keyboard navigation, clipboard, cell editing, context menus, row/column operations, formulas through HyperFormula, formatting, merge cells, filtering, and frozen rows/columns.
- The project is currently non-commercial/evaluation use, so Handsontable licensing is acceptable for this design. If usage changes to commercial production, licensing must be revisited before release.

References:

- https://handsontable.com/docs/react-data-grid/installation/
- https://handsontable.com/docs/react-data-grid/formula-calculation/
- https://handsontable.com/docs/react-data-grid/software-license/

## Non-Goals

- Do not embed a fully editable spreadsheet inside Tiptap in the first version.
- Do not build formula calculation manually.
- Do not attempt collaborative editing.
- Do not implement pivot tables or advanced charting in the first version.
- Do not introduce another design system; use the existing Radix/Tailwind UI components around the grid.

## Navigation And Product Shape

Add a new sidebar navigation item:

- Add i18n key `nav.spreadsheets` with Chinese and English labels.
- English label: `Sheets`.
- Icon: use an existing Lucide icon such as `Table2` or `Sheet`.

The route structure should mirror existing page patterns:

- `spreadsheets`: spreadsheet center.
- `spreadsheet-editor`: opened workbook editor, with a selected spreadsheet id.

The app-level state should track the active spreadsheet id similarly to the current editor document id. Deep links should be supported with a hash route such as `#/spreadsheets/:id` or `#/sheet/:id`, following existing hash routing conventions.

## Data Model

Add a new Prisma model for MySQL and the SQLite schema variant.

Suggested model:

```prisma
model Spreadsheet {
  id        String   @id @default(uuid())
  title     String
  preview   String?
  data      Json
  metadata  Json?
  isDeleted Boolean  @default(false) @map("is_deleted")
  deletedAt DateTime? @map("deleted_at")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  userId String @map("user_id")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  groupId String?        @map("group_id")
  group   DocumentGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([userId, isDeleted])
  @@index([groupId])
  @@map("spreadsheets")
}
```

`User` and `DocumentGroup` should get matching relation fields. Reusing `DocumentGroup` lets users organize documents and spreadsheets with the same group concept.

## Workbook JSON Shape

Store a workbook as JSON in `Spreadsheet.data`.

Suggested shape:

```ts
interface SpreadsheetWorkbook {
  version: 1;
  activeSheetId: string;
  sheets: SpreadsheetSheet[];
}

interface SpreadsheetSheet {
  id: string;
  name: string;
  data: unknown[][];
  cellMeta?: Record<string, SpreadsheetCellMeta>;
  merges?: Array<{ row: number; col: number; rowspan: number; colspan: number }>;
  rowHeights?: Record<number, number>;
  colWidths?: Record<number, number>;
  fixedRowsTop?: number;
  fixedColumnsLeft?: number;
  filters?: unknown;
}

interface SpreadsheetCellMeta {
  type?: "text" | "numeric" | "date" | "checkbox" | "dropdown";
  className?: string;
  format?: string;
  readOnly?: boolean;
  comment?: string;
}
```

The stored JSON should be owned by app helper functions, not by page components. Create conversion helpers between this workbook shape and Handsontable settings/data. This keeps a future grid replacement possible if licensing or UX needs change.

## Backend API

Add spreadsheet routes under `/api/spreadsheets`.

Required endpoints:

- `GET /spreadsheets`: list non-deleted spreadsheets for the current user.
- `POST /spreadsheets`: create a workbook with default data or imported data.
- `GET /spreadsheets/:id`: load one workbook.
- `PUT /spreadsheets/:id`: update title, data, metadata, or group.
- `POST /spreadsheets/:id/duplicate`: duplicate a workbook for the current user.
- `PATCH /spreadsheets/:id/trash`: soft-delete.
- `PATCH /spreadsheets/:id/restore`: restore from trash.
- `DELETE /spreadsheets/:id`: permanent delete.

For the first version, `.xlsx` import/export should be client-side to keep the server simple. Imported workbooks are persisted through `POST /spreadsheets` after client-side parsing. The backend owns persistence and authorization.

## Frontend API Client

Add spreadsheet methods to `document/src/api.ts`, following the existing authenticated request helper:

- `listSpreadsheets`
- `getSpreadsheet`
- `createSpreadsheet`
- `updateSpreadsheet`
- `duplicateSpreadsheet`
- `moveSpreadsheetToTrash`
- `restoreSpreadsheet`
- `deleteSpreadsheet`

All API result and request types should be added to `document/src/types.ts`.

## Frontend Modules

Suggested files:

- `document/src/pages/SpreadsheetCenterPage.tsx`
- `document/src/pages/SpreadsheetEditorPage.tsx`
- `document/src/components/spreadsheet/SpreadsheetShell.tsx`
- `document/src/components/spreadsheet/SpreadsheetToolbar.tsx`
- `document/src/components/spreadsheet/SpreadsheetGrid.tsx`
- `document/src/components/spreadsheet/SheetTabs.tsx`
- `document/src/lib/spreadsheetWorkbook.ts`
- `document/src/lib/spreadsheetImportExport.ts`

Keep Handsontable-specific code in `SpreadsheetGrid` and workbook conversion helpers. Other app surfaces should not depend on Handsontable APIs directly.

## Spreadsheet Center UI

The center should feel like the current document center, but denser and more operational.

Core elements:

- Top action row: search, create spreadsheet, import `.xlsx`.
- Filter row: group filter and sort mode.
- Main list/grid: title, preview, last updated, sheet count, group name.
- Row actions: open, rename, duplicate, move to group, delete.
- Empty state: create blank workbook or import Excel.

Use existing UI components from `document/src/components/ui/`: `Button`, `Input`, `Dialog`, `DropdownMenu`, `Tooltip`, `Select`, and related wrappers. Do not use native browser controls for interactive widgets when a project UI component exists.

## Spreadsheet Editor UI

Layout:

- Full-height editor page inside the existing app shell.
- Title strip: back button, editable workbook title, save status, import/export, more menu.
- Toolbar: compact icon controls.
- Formula/name strip: selected cell label and formula/value input.
- Grid body: Handsontable.
- Sheet tabs: bottom strip with sheet switching and sheet actions.

Toolbar controls:

- Undo and redo.
- Font size, bold, italic, text color, fill color.
- Horizontal alignment.
- Merge/unmerge cells.
- Freeze rows/columns.
- Sort/filter toggle.
- Insert/delete rows and columns.
- Import/export.

All visible strings must be added to `I18nProvider.tsx` before implementation code, in both Chinese and English.

## Styling

Design direction: quiet desktop productivity surface.

- Use existing `surface`, `brand`, and dark-mode token patterns.
- Keep the editor dense but not cramped.
- Avoid marketing-style cards around the grid. The grid is the workspace.
- Use `8px` or less radius for spreadsheet controls unless an existing UI component already defines a different radius.
- Use Lucide icons for toolbar actions.
- Wrap unfamiliar icon-only actions in tooltips.
- Ensure text does not overflow toolbar controls at the app minimum width.
- Handsontable CSS should be imported once in the spreadsheet module or app entry, then themed through a local stylesheet layer such as `spreadsheet.css`.
- Dark mode must be verified because Handsontable themes may need explicit overrides.

Windows/Tauri considerations:

- Verify clipboard copy/paste in WebView2.
- Avoid relying on browser behaviors that differ between Chromium desktop and WebView2.
- Use stable heights with `min-h-0` and `overflow-hidden` so the grid can size correctly.
- Avoid CSS that depends on unsupported or inconsistent features in WebView2.

## Autosave And Dirty State

The editor should autosave after a debounce, similar to document editing.

Suggested behavior:

- Local workbook state changes immediately.
- Mark status as unsaved.
- Debounce `PUT /spreadsheets/:id` by about 1000-1500ms.
- Save on sheet switch, page navigation, and component unmount when possible.
- Show statuses: saved, unsaved, saving, failed.
- Failed saves should preserve local state and show retry.

Large workbooks can generate frequent changes. Use throttled change handling and avoid serializing the entire workbook on every minor Handsontable hook if possible.

## Import And Export

Import `.xlsx`:

- Parse workbook client-side.
- Convert each worksheet into the internal workbook JSON shape.
- Preserve values and formulas where practical.
- Preserve simple sheet names, merges, column widths, and basic formatting when practical.
- Show an import preview dialog before creating the spreadsheet.

Export `.xlsx`:

- Convert internal workbook JSON back to `.xlsx`.
- Include all sheets.
- Preserve values and formulas.
- Preserve simple formats where practical.

If formatting fidelity is incomplete, make the scope explicit in UI copy and tests. Do not silently imply perfect Excel compatibility.

## Error Handling

Backend:

- Return 401 for unauthenticated requests.
- Return 404 when a spreadsheet does not exist or belongs to another user.
- Validate workbook payload shape before saving.
- Limit payload size to avoid accidental huge JSON submissions.

Frontend:

- Show loading states for list and editor load.
- Show inline/empty error states for failed list load.
- Show toast or inline retry for failed saves.
- Block destructive delete actions with confirmation.
- If import fails, show a specific unsupported/corrupt file message.

## Testing And Verification

Unit tests:

- Workbook default creation.
- Workbook JSON validation.
- Import/export conversion helpers.
- Preview generation.
- API request helper method paths.

Backend checks:

- `cd server && npx prisma db push`
- `cd server && npx tsc --noEmit`

Frontend checks:

- `cd document && npx tsc --noEmit`
- `cd document && npx vite build`
- Targeted Node tests for helper modules.

Manual verification:

- Create spreadsheet.
- Edit cell and autosave.
- Reload and confirm values persist.
- Add second sheet.
- Use formula such as `=SUM(A1:A3)`.
- Merge cells.
- Freeze first row.
- Copy/paste a range.
- Import `.xlsx`.
- Export `.xlsx` and reopen it.
- Verify dark mode.
- Verify Windows/Tauri WebView2 behavior, especially clipboard and scrolling.

## Implementation Order

1. Add i18n keys for all user-facing strings.
2. Add Prisma schema and API routes.
3. Add frontend API methods and types.
4. Add workbook helper library and tests.
5. Add spreadsheet center page.
6. Add spreadsheet editor shell.
7. Integrate Handsontable grid and formula support.
8. Add import/export.
9. Wire navigation, deep links, and sidebar item.
10. Run full verification.

## Acceptance Criteria

- Users can create, open, edit, save, rename, duplicate, group, and delete spreadsheets.
- Users can use a multi-sheet Excel-like grid with formulas, copy/paste, formatting, merge cells, freeze rows/columns, sorting/filtering, and undo/redo.
- Users can import and export `.xlsx` files.
- Spreadsheet data persists through backend APIs and reloads.
- All user-facing strings are bilingual in `I18nProvider.tsx`.
- UI controls use existing Radix/Tailwind component wrappers where applicable.
- Frontend and backend type checks pass.
- Prisma schema is pushed successfully.
- The module behaves correctly in Tauri/WebView2 on Windows.

## Risks

- Handsontable licensing must be revisited before commercial production use.
- Formula and import/export fidelity may not match desktop Excel perfectly.
- Very large workbooks may need payload size limits, virtualization tuning, or save chunking.
- Dark mode theming may need explicit Handsontable CSS overrides.
- Tauri/WebView2 clipboard behavior must be manually verified.
