# Built-in Spreadsheet Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone spreadsheet center and Excel-like spreadsheet editor using Handsontable, with backend persistence, grouping, import/export helpers, autosave, and app navigation.

**Architecture:** Add a new `Spreadsheet` resource parallel to `Document`, persisted by Prisma and exposed through `/api/spreadsheets`. Keep workbook JSON conversion and import/export logic in small helper modules, keep Handsontable-specific React code in `document/src/components/spreadsheet/SpreadsheetGrid.tsx`, and wire pages into the existing hash-route app shell.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI wrappers, Lucide icons, Express, Prisma, MySQL/SQLite schemas, Handsontable 18, `@handsontable/react-wrapper`, HyperFormula, SheetJS `xlsx`, Node `node:test`.

## Global Constraints

- i18n first: add every user-facing string to `document/src/components/I18nProvider.tsx` in Chinese and English before feature UI code.
- UI component first: use `document/src/components/ui/` wrappers for buttons, dialogs, dropdowns, selects, tooltips, inputs, and confirmations.
- Windows/Tauri first: verify WebView2-relevant layout, scrolling, clipboard, and CSS behavior.
- Full-stack verification: Prisma schema push, server `npx tsc --noEmit`, frontend API method, frontend component use, i18n keys.
- Use Handsontable only for non-commercial/evaluation usage; revisit license before commercial production.
- First implementation stores workbooks as independent spreadsheets, not inside `Document.content`.

---

## File Structure

- Modify `server/prisma/schema.prisma`: add `Spreadsheet` and relations.
- Modify `server/prisma/schema-sqlite.prisma`: mirror `Spreadsheet` and relations.
- Create `server/src/services/spreadsheetWorkbook.ts`: workbook validation, default workbook, preview generation.
- Create `server/src/services/spreadsheetService.ts`: database operations for spreadsheets.
- Create `server/src/services/spreadsheetService.test.ts`: service-helper tests with mocked dependencies where practical.
- Create `server/src/routes/spreadsheets.ts`: authenticated REST routes.
- Modify `server/src/index.ts`: mount `/api/spreadsheets`.
- Modify `document/package.json`: add Handsontable, React wrapper, HyperFormula, and `xlsx`.
- Modify `document/src/types.ts`: add spreadsheet/workbook TypeScript interfaces.
- Modify `document/src/api.ts`: add spreadsheet API methods.
- Create `document/tests/spreadsheetWorkbook.test.ts`: frontend workbook helper tests.
- Create `document/tests/spreadsheetApiWiring.test.ts`: source-level API route wiring regression test.
- Create `document/src/lib/spreadsheetWorkbook.ts`: default workbook, sheet operations, validation, preview helpers.
- Create `document/src/lib/spreadsheetImportExport.ts`: workbook-to/from `.xlsx` conversion helpers.
- Modify `document/src/components/I18nProvider.tsx`: add `nav.spreadsheets` and spreadsheet UI strings.
- Modify `document/src/components/SideNavBar.tsx`: add `spreadsheets` nav item.
- Modify `document/src/App.tsx`: add hash routes, active spreadsheet id, pages, and navigation handlers.
- Create `document/src/pages/SpreadsheetCenterPage.tsx`: list/create/import/open spreadsheet center.
- Create `document/src/pages/SpreadsheetEditorPage.tsx`: editor page shell, load/save/autosave.
- Create `document/src/components/spreadsheet/SpreadsheetToolbar.tsx`: toolbar controls.
- Create `document/src/components/spreadsheet/SheetTabs.tsx`: sheet tab controls.
- Create `document/src/components/spreadsheet/SpreadsheetGrid.tsx`: Handsontable wrapper.
- Create `document/src/components/spreadsheet/spreadsheet.css`: grid shell and Handsontable theme overrides.

---

### Task 1: Dependencies And Shared Workbook Helpers

**Files:**
- Modify: `document/package.json`
- Create: `document/src/lib/spreadsheetWorkbook.ts`
- Test: `document/tests/spreadsheetWorkbook.test.ts`

**Interfaces:**
- Produces:
  - `createDefaultWorkbook(): SpreadsheetWorkbook`
  - `createSpreadsheetSheet(name?: string): SpreadsheetSheet`
  - `validateSpreadsheetWorkbook(value: unknown): value is SpreadsheetWorkbook`
  - `buildSpreadsheetPreview(workbook: SpreadsheetWorkbook): string`
  - `renameSpreadsheetSheet(workbook: SpreadsheetWorkbook, sheetId: string, name: string): SpreadsheetWorkbook`
  - `addSpreadsheetSheet(workbook: SpreadsheetWorkbook, name?: string): SpreadsheetWorkbook`
  - `deleteSpreadsheetSheet(workbook: SpreadsheetWorkbook, sheetId: string): SpreadsheetWorkbook`

- [ ] **Step 1: Install spreadsheet dependencies**

Run:

```bash
cd document
pnpm add handsontable @handsontable/react-wrapper hyperformula xlsx
```

Expected: `document/package.json` and `document/pnpm-lock.yaml` include the four dependencies.

- [ ] **Step 2: Write the failing workbook helper test**

Create `document/tests/spreadsheetWorkbook.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addSpreadsheetSheet,
  buildSpreadsheetPreview,
  createDefaultWorkbook,
  createSpreadsheetSheet,
  deleteSpreadsheetSheet,
  renameSpreadsheetSheet,
  validateSpreadsheetWorkbook,
} from "../src/lib/spreadsheetWorkbook.ts";

describe("spreadsheet workbook helpers", () => {
  it("creates a valid default workbook with a first sheet", () => {
    const workbook = createDefaultWorkbook();

    assert.equal(workbook.version, 1);
    assert.equal(workbook.sheets.length, 1);
    assert.equal(workbook.activeSheetId, workbook.sheets[0].id);
    assert.equal(validateSpreadsheetWorkbook(workbook), true);
  });

  it("adds, renames, and deletes sheets without mutating the original workbook", () => {
    const workbook = createDefaultWorkbook();
    const withSecond = addSpreadsheetSheet(workbook, "Data");
    const secondSheet = withSecond.sheets[1];
    const renamed = renameSpreadsheetSheet(withSecond, secondSheet.id, "Budget");
    const deleted = deleteSpreadsheetSheet(renamed, secondSheet.id);

    assert.equal(workbook.sheets.length, 1);
    assert.equal(withSecond.sheets.length, 2);
    assert.equal(renamed.sheets[1].name, "Budget");
    assert.equal(deleted.sheets.length, 1);
    assert.equal(deleted.activeSheetId, deleted.sheets[0].id);
  });

  it("builds a compact preview from visible cell values", () => {
    const sheet = createSpreadsheetSheet("Outline");
    sheet.data = [
      ["Chapter", "Words"],
      ["Opening", 1200],
    ];
    const workbook = { version: 1 as const, activeSheetId: sheet.id, sheets: [sheet] };

    assert.equal(buildSpreadsheetPreview(workbook), "Chapter Words Opening 1200");
  });

  it("rejects malformed workbooks", () => {
    assert.equal(validateSpreadsheetWorkbook({ version: 1, sheets: [] }), false);
    assert.equal(validateSpreadsheetWorkbook({ version: 2, activeSheetId: "x", sheets: [] }), false);
    assert.equal(validateSpreadsheetWorkbook(null), false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetWorkbook.test.ts
```

Expected: FAIL with module-not-found for `src/lib/spreadsheetWorkbook.ts`.

- [ ] **Step 4: Implement workbook helpers**

Create `document/src/lib/spreadsheetWorkbook.ts`:

```ts
export interface SpreadsheetCellMeta {
  type?: "text" | "numeric" | "date" | "checkbox" | "dropdown";
  className?: string;
  format?: string;
  readOnly?: boolean;
  comment?: string;
}

export interface SpreadsheetSheet {
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

export interface SpreadsheetWorkbook {
  version: 1;
  activeSheetId: string;
  sheets: SpreadsheetSheet[];
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSpreadsheetSheet(name = "Sheet 1"): SpreadsheetSheet {
  return {
    id: createId("sheet"),
    name,
    data: Array.from({ length: 24 }, () => Array.from({ length: 8 }, () => "")),
    cellMeta: {},
    merges: [],
    rowHeights: {},
    colWidths: {},
    fixedRowsTop: 0,
    fixedColumnsLeft: 0,
  };
}

export function createDefaultWorkbook(): SpreadsheetWorkbook {
  const sheet = createSpreadsheetSheet();
  return {
    version: 1,
    activeSheetId: sheet.id,
    sheets: [sheet],
  };
}

function isSheet(value: unknown): value is SpreadsheetSheet {
  if (!value || typeof value !== "object") return false;
  const sheet = value as SpreadsheetSheet;
  return typeof sheet.id === "string" && typeof sheet.name === "string" && Array.isArray(sheet.data);
}

export function validateSpreadsheetWorkbook(value: unknown): value is SpreadsheetWorkbook {
  if (!value || typeof value !== "object") return false;
  const workbook = value as SpreadsheetWorkbook;
  if (workbook.version !== 1) return false;
  if (typeof workbook.activeSheetId !== "string") return false;
  if (!Array.isArray(workbook.sheets) || workbook.sheets.length === 0) return false;
  return workbook.sheets.every(isSheet) && workbook.sheets.some((sheet) => sheet.id === workbook.activeSheetId);
}

export function buildSpreadsheetPreview(workbook: SpreadsheetWorkbook): string {
  const values: string[] = [];
  for (const sheet of workbook.sheets) {
    for (const row of sheet.data) {
      for (const cell of row) {
        const text = String(cell ?? "").trim();
        if (text) values.push(text);
        if (values.join(" ").length >= 80) return values.join(" ").slice(0, 80);
      }
    }
  }
  return values.join(" ").slice(0, 80);
}

export function addSpreadsheetSheet(workbook: SpreadsheetWorkbook, name = `Sheet ${workbook.sheets.length + 1}`): SpreadsheetWorkbook {
  const sheet = createSpreadsheetSheet(name);
  return {
    ...workbook,
    activeSheetId: sheet.id,
    sheets: [...workbook.sheets, sheet],
  };
}

export function renameSpreadsheetSheet(workbook: SpreadsheetWorkbook, sheetId: string, name: string): SpreadsheetWorkbook {
  const trimmed = name.trim();
  if (!trimmed) return workbook;
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet) => sheet.id === sheetId ? { ...sheet, name: trimmed } : sheet),
  };
}

export function deleteSpreadsheetSheet(workbook: SpreadsheetWorkbook, sheetId: string): SpreadsheetWorkbook {
  if (workbook.sheets.length <= 1) return workbook;
  const sheets = workbook.sheets.filter((sheet) => sheet.id !== sheetId);
  const activeSheetId = sheets.some((sheet) => sheet.id === workbook.activeSheetId) ? workbook.activeSheetId : sheets[0].id;
  return { ...workbook, sheets, activeSheetId };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetWorkbook.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

Run:

```bash
git add document/package.json document/pnpm-lock.yaml document/src/lib/spreadsheetWorkbook.ts document/tests/spreadsheetWorkbook.test.ts
git commit -m "Add spreadsheet workbook helpers"
```

---

### Task 2: Backend Schema, Service, And Routes

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/prisma/schema-sqlite.prisma`
- Create: `server/src/services/spreadsheetWorkbook.ts`
- Create: `server/src/services/spreadsheetService.ts`
- Create: `server/src/services/spreadsheetService.test.ts`
- Create: `server/src/routes/spreadsheets.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: workbook JSON shape from Task 1.
- Produces:
  - `createDefaultWorkbook(): SpreadsheetWorkbook`
  - `validateSpreadsheetWorkbook(value: unknown): value is SpreadsheetWorkbook`
  - `buildSpreadsheetPreview(workbook: SpreadsheetWorkbook): string`
  - `listSpreadsheets(userId: string)`
  - `getSpreadsheet(id: string, userId: string)`
  - `createSpreadsheet(userId: string, data: SpreadsheetMutationInput)`
  - `updateSpreadsheet(id: string, userId: string, data: SpreadsheetMutationInput)`
  - `duplicateSpreadsheet(id: string, userId: string)`
  - `moveSpreadsheetToTrash(id: string, userId: string)`
  - `restoreSpreadsheetFromTrash(id: string, userId: string)`
  - `permanentlyDeleteSpreadsheet(id: string, userId: string)`

- [ ] **Step 1: Write failing backend helper tests**

Create `server/src/services/spreadsheetService.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSpreadsheetPreview,
  createDefaultWorkbook,
  validateSpreadsheetWorkbook,
} from "./spreadsheetWorkbook";

describe("spreadsheet service workbook helpers", () => {
  it("creates a valid default workbook", () => {
    const workbook = createDefaultWorkbook();

    assert.equal(workbook.version, 1);
    assert.equal(workbook.sheets.length, 1);
    assert.equal(validateSpreadsheetWorkbook(workbook), true);
  });

  it("builds preview text from cells", () => {
    const workbook = createDefaultWorkbook();
    workbook.sheets[0].data = [["角色", "战力"], ["林动", 9000]];

    assert.equal(buildSpreadsheetPreview(workbook), "角色 战力 林动 9000");
  });

  it("rejects invalid workbook payloads", () => {
    assert.equal(validateSpreadsheetWorkbook({ version: 1, activeSheetId: "missing", sheets: [] }), false);
    assert.equal(validateSpreadsheetWorkbook({ version: 1, activeSheetId: "x", sheets: [{ id: "x" }] }), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd server
npm test -- src/services/spreadsheetService.test.ts
```

Expected: FAIL with module-not-found for `spreadsheetWorkbook`.

- [ ] **Step 3: Implement backend workbook helpers**

Create `server/src/services/spreadsheetWorkbook.ts` with the same interfaces as the frontend helper, using `crypto.randomUUID()` from Node:

```ts
import { randomUUID } from "node:crypto";

export interface SpreadsheetCellMeta {
  type?: "text" | "numeric" | "date" | "checkbox" | "dropdown";
  className?: string;
  format?: string;
  readOnly?: boolean;
  comment?: string;
}

export interface SpreadsheetSheet {
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

export interface SpreadsheetWorkbook {
  version: 1;
  activeSheetId: string;
  sheets: SpreadsheetSheet[];
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function createSpreadsheetSheet(name = "Sheet 1"): SpreadsheetSheet {
  return {
    id: createId("sheet"),
    name,
    data: Array.from({ length: 24 }, () => Array.from({ length: 8 }, () => "")),
    cellMeta: {},
    merges: [],
    rowHeights: {},
    colWidths: {},
    fixedRowsTop: 0,
    fixedColumnsLeft: 0,
  };
}

export function createDefaultWorkbook(): SpreadsheetWorkbook {
  const sheet = createSpreadsheetSheet();
  return { version: 1, activeSheetId: sheet.id, sheets: [sheet] };
}

function isSheet(value: unknown): value is SpreadsheetSheet {
  if (!value || typeof value !== "object") return false;
  const sheet = value as SpreadsheetSheet;
  return typeof sheet.id === "string" && typeof sheet.name === "string" && Array.isArray(sheet.data);
}

export function validateSpreadsheetWorkbook(value: unknown): value is SpreadsheetWorkbook {
  if (!value || typeof value !== "object") return false;
  const workbook = value as SpreadsheetWorkbook;
  return workbook.version === 1 &&
    typeof workbook.activeSheetId === "string" &&
    Array.isArray(workbook.sheets) &&
    workbook.sheets.length > 0 &&
    workbook.sheets.every(isSheet) &&
    workbook.sheets.some((sheet) => sheet.id === workbook.activeSheetId);
}

export function buildSpreadsheetPreview(workbook: SpreadsheetWorkbook): string {
  const values: string[] = [];
  for (const sheet of workbook.sheets) {
    for (const row of sheet.data) {
      for (const cell of row) {
        const text = String(cell ?? "").trim();
        if (text) values.push(text);
        if (values.join(" ").length >= 80) return values.join(" ").slice(0, 80);
      }
    }
  }
  return values.join(" ").slice(0, 80);
}
```

- [ ] **Step 4: Run helper tests to verify pass**

Run:

```bash
cd server
npm test -- src/services/spreadsheetService.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Add Prisma schema**

Modify both Prisma schema files:

```prisma
model User {
  // existing fields
  spreadsheets Spreadsheet[]
}

model DocumentGroup {
  // existing fields
  spreadsheets Spreadsheet[]
}

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

In `server/prisma/schema-sqlite.prisma`, use `data Json` if Prisma SQLite supports JSON in this project; if generation fails, use `data String` and parse/stringify only in the SQLite-specific service path. Prefer matching MySQL first and let Prisma validation decide.

- [ ] **Step 6: Implement spreadsheet service**

Create `server/src/services/spreadsheetService.ts`:

```ts
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  buildSpreadsheetPreview,
  createDefaultWorkbook,
  validateSpreadsheetWorkbook,
  type SpreadsheetWorkbook,
} from "./spreadsheetWorkbook";

export interface SpreadsheetMutationInput {
  title?: string;
  data?: SpreadsheetWorkbook;
  metadata?: Prisma.InputJsonValue | null;
  groupId?: string | null;
}

async function checkOwnership(id: string, userId: string) {
  const spreadsheet = await prisma.spreadsheet.findUnique({ where: { id } });
  if (!spreadsheet || spreadsheet.userId !== userId) return null;
  return spreadsheet;
}

function resolveWorkbook(data?: SpreadsheetWorkbook): SpreadsheetWorkbook {
  if (!data) return createDefaultWorkbook();
  if (!validateSpreadsheetWorkbook(data)) throw new Error("INVALID_WORKBOOK");
  return data;
}

export async function listSpreadsheets(userId: string) {
  return prisma.spreadsheet.findMany({
    where: { userId, isDeleted: false },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listSpreadsheetTrash(userId: string) {
  return prisma.spreadsheet.findMany({
    where: { userId, isDeleted: true },
    orderBy: { deletedAt: "desc" },
  });
}

export async function getSpreadsheet(id: string, userId: string) {
  return checkOwnership(id, userId);
}

export async function createSpreadsheet(userId: string, input: SpreadsheetMutationInput) {
  const workbook = resolveWorkbook(input.data);
  return prisma.spreadsheet.create({
    data: {
      title: input.title?.trim() || "Untitled sheet",
      preview: buildSpreadsheetPreview(workbook),
      data: workbook as unknown as Prisma.InputJsonValue,
      metadata: input.metadata ?? undefined,
      userId,
      groupId: input.groupId || null,
    },
  });
}

export async function updateSpreadsheet(id: string, userId: string, input: SpreadsheetMutationInput) {
  const spreadsheet = await checkOwnership(id, userId);
  if (!spreadsheet) return null;
  const workbook = input.data ? resolveWorkbook(input.data) : null;
  return prisma.spreadsheet.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title.trim() || spreadsheet.title }),
      ...(workbook && {
        data: workbook as unknown as Prisma.InputJsonValue,
        preview: buildSpreadsheetPreview(workbook),
      }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
      ...(input.groupId !== undefined && { groupId: input.groupId }),
    },
  });
}

export async function duplicateSpreadsheet(id: string, userId: string) {
  const spreadsheet = await checkOwnership(id, userId);
  if (!spreadsheet) return null;
  return prisma.spreadsheet.create({
    data: {
      title: `${spreadsheet.title} Copy`,
      preview: spreadsheet.preview,
      data: spreadsheet.data as Prisma.InputJsonValue,
      metadata: spreadsheet.metadata === null ? undefined : spreadsheet.metadata as Prisma.InputJsonValue,
      userId,
      groupId: spreadsheet.groupId,
    },
  });
}

export async function moveSpreadsheetToTrash(id: string, userId: string) {
  const spreadsheet = await checkOwnership(id, userId);
  if (!spreadsheet) return null;
  return prisma.spreadsheet.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function restoreSpreadsheetFromTrash(id: string, userId: string) {
  const spreadsheet = await checkOwnership(id, userId);
  if (!spreadsheet) return null;
  return prisma.spreadsheet.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentlyDeleteSpreadsheet(id: string, userId: string) {
  const spreadsheet = await checkOwnership(id, userId);
  if (!spreadsheet) return false;
  await prisma.spreadsheet.delete({ where: { id } });
  return true;
}
```

- [ ] **Step 7: Implement routes**

Create `server/src/routes/spreadsheets.ts`:

```ts
import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";
import {
  createSpreadsheet,
  duplicateSpreadsheet,
  getSpreadsheet,
  listSpreadsheetTrash,
  listSpreadsheets,
  moveSpreadsheetToTrash,
  permanentlyDeleteSpreadsheet,
  restoreSpreadsheetFromTrash,
  updateSpreadsheet,
} from "../services/spreadsheetService";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

router.use(authMiddleware);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheets = await listSpreadsheets(req.user!.userId);
    res.json({ spreadsheets });
  } catch (error) {
    console.error("List spreadsheets error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取表格列表失败", "Failed to load sheets") });
  }
});

router.get("/trash", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheets = await listSpreadsheetTrash(req.user!.userId);
    res.json({ spreadsheets });
  } catch (error) {
    console.error("List spreadsheet trash error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取表格回收站失败", "Failed to load sheet trash") });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await getSpreadsheet(String(req.params.id), req.user!.userId);
    if (!spreadsheet) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Sheet not found") });
      return;
    }
    res.json({ spreadsheet });
  } catch (error) {
    console.error("Get spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取表格失败", "Failed to load sheet") });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await createSpreadsheet(req.user!.userId, req.body || {});
    res.status(201).json({ spreadsheet });
  } catch (error: any) {
    console.error("Create spreadsheet error:", error);
    const message = error?.message === "INVALID_WORKBOOK"
      ? t(requestLang(req), "表格数据格式无效", "Invalid workbook data")
      : t(requestLang(req), "创建表格失败", "Failed to create sheet");
    res.status(error?.message === "INVALID_WORKBOOK" ? 400 : 500).json({ error: message });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await updateSpreadsheet(String(req.params.id), req.user!.userId, req.body || {});
    if (!spreadsheet) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Sheet not found") });
      return;
    }
    res.json({ spreadsheet });
  } catch (error: any) {
    console.error("Update spreadsheet error:", error);
    const message = error?.message === "INVALID_WORKBOOK"
      ? t(requestLang(req), "表格数据格式无效", "Invalid workbook data")
      : t(requestLang(req), "更新表格失败", "Failed to update sheet");
    res.status(error?.message === "INVALID_WORKBOOK" ? 400 : 500).json({ error: message });
  }
});

router.post("/:id/duplicate", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await duplicateSpreadsheet(String(req.params.id), req.user!.userId);
    if (!spreadsheet) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Sheet not found") });
      return;
    }
    res.status(201).json({ spreadsheet });
  } catch (error) {
    console.error("Duplicate spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "复制表格失败", "Failed to duplicate sheet") });
  }
});

router.patch("/:id/trash", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await moveSpreadsheetToTrash(String(req.params.id), req.user!.userId);
    if (!spreadsheet) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Sheet not found") });
      return;
    }
    res.json({ spreadsheet });
  } catch (error) {
    console.error("Trash spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "移动到回收站失败", "Failed to move sheet to trash") });
  }
});

router.patch("/:id/restore", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await restoreSpreadsheetFromTrash(String(req.params.id), req.user!.userId);
    if (!spreadsheet) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Sheet not found") });
      return;
    }
    res.json({ spreadsheet });
  } catch (error) {
    console.error("Restore spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "恢复表格失败", "Failed to restore sheet") });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await permanentlyDeleteSpreadsheet(String(req.params.id), req.user!.userId);
    if (!deleted) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Sheet not found") });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Delete spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "删除表格失败", "Failed to delete sheet") });
  }
});

export default router;
```

- [ ] **Step 8: Mount route**

Modify `server/src/index.ts`:

```ts
import spreadsheetRoutes from "./routes/spreadsheets";

app.use("/api/spreadsheets", spreadsheetRoutes);
```

- [ ] **Step 9: Verify backend compile and Prisma schema**

Run:

```bash
cd server
npx prisma db push
npx tsc --noEmit
npm test -- src/services/spreadsheetService.test.ts
```

Expected: Prisma push succeeds, TypeScript emits no errors, spreadsheet tests pass.

- [ ] **Step 10: Commit**

Run:

```bash
git add server/prisma/schema.prisma server/prisma/schema-sqlite.prisma server/src/services/spreadsheetWorkbook.ts server/src/services/spreadsheetService.ts server/src/services/spreadsheetService.test.ts server/src/routes/spreadsheets.ts server/src/index.ts
git commit -m "Add spreadsheet backend API"
```

---

### Task 3: Frontend Types, API Methods, And Source-Level Wiring Tests

**Files:**
- Modify: `document/src/types.ts`
- Modify: `document/src/api.ts`
- Test: `document/tests/spreadsheetApiWiring.test.ts`

**Interfaces:**
- Consumes: `/api/spreadsheets` backend routes.
- Produces:
  - `Spreadsheet`, `SpreadsheetWorkbook`, `SpreadsheetSheet`, `SpreadsheetCellMeta`
  - `api.listSpreadsheets`, `api.getSpreadsheet`, `api.createSpreadsheet`, `api.updateSpreadsheet`, `api.duplicateSpreadsheet`, `api.moveSpreadsheetToTrash`, `api.restoreSpreadsheet`, `api.deleteSpreadsheet`

- [ ] **Step 1: Write failing API wiring test**

Create `document/tests/spreadsheetApiWiring.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("spreadsheet frontend API wiring", () => {
  it("exposes spreadsheet API methods against the /spreadsheets backend", () => {
    const apiSource = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8");
    const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");

    for (const method of [
      "listSpreadsheets",
      "getSpreadsheet",
      "createSpreadsheet",
      "updateSpreadsheet",
      "duplicateSpreadsheet",
      "moveSpreadsheetToTrash",
      "restoreSpreadsheet",
      "deleteSpreadsheet",
    ]) {
      assert.match(apiSource, new RegExp(`${method}:`), method);
    }

    assert.match(apiSource, /"\\/spreadsheets"/);
    assert.match(apiSource, /`\\/spreadsheets\\/\\$\\{id\\}`/);
    assert.match(apiSource, /`\\/spreadsheets\\/\\$\\{id\\}\\/duplicate`/);
    assert.match(typesSource, /export interface Spreadsheet /);
    assert.match(typesSource, /export interface SpreadsheetWorkbook /);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
```

Expected: FAIL because methods and types do not exist.

- [ ] **Step 3: Add types**

Modify `document/src/types.ts`:

```ts
export interface SpreadsheetCellMeta {
  type?: "text" | "numeric" | "date" | "checkbox" | "dropdown";
  className?: string;
  format?: string;
  readOnly?: boolean;
  comment?: string;
}

export interface SpreadsheetSheet {
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

export interface SpreadsheetWorkbook {
  version: 1;
  activeSheetId: string;
  sheets: SpreadsheetSheet[];
}

export interface Spreadsheet {
  id: string;
  title: string;
  preview?: string | null;
  data: SpreadsheetWorkbook;
  metadata?: Record<string, unknown> | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  groupId?: string | null;
}
```

- [ ] **Step 4: Add API methods**

Modify import line in `document/src/api.ts`:

```ts
import type { Document, DocumentVersion, Spreadsheet, SpreadsheetWorkbook, WorkRecord, WorkRecordPeriod } from "@/types";
```

Add methods near the documents methods:

```ts
  listSpreadsheets: () =>
    request<{ spreadsheets: Spreadsheet[] }>("/spreadsheets"),

  listSpreadsheetTrash: () =>
    request<{ spreadsheets: Spreadsheet[] }>("/spreadsheets/trash"),

  getSpreadsheet: (id: string) =>
    request<{ spreadsheet: Spreadsheet }>(`/spreadsheets/${id}`),

  createSpreadsheet: (data?: { title?: string; data?: SpreadsheetWorkbook; metadata?: Record<string, unknown> | null; groupId?: string | null }) =>
    request<{ spreadsheet: Spreadsheet }>("/spreadsheets", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  updateSpreadsheet: (id: string, data: { title?: string; data?: SpreadsheetWorkbook; metadata?: Record<string, unknown> | null; groupId?: string | null }) =>
    request<{ spreadsheet: Spreadsheet }>(`/spreadsheets/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  duplicateSpreadsheet: (id: string) =>
    request<{ spreadsheet: Spreadsheet }>(`/spreadsheets/${id}/duplicate`, { method: "POST" }),

  moveSpreadsheetToTrash: (id: string) =>
    request<{ spreadsheet: Spreadsheet }>(`/spreadsheets/${id}/trash`, { method: "PATCH" }),

  restoreSpreadsheet: (id: string) =>
    request<{ spreadsheet: Spreadsheet }>(`/spreadsheets/${id}/restore`, { method: "PATCH" }),

  deleteSpreadsheet: (id: string) =>
    request<{ success: boolean }>(`/spreadsheets/${id}`, { method: "DELETE" }),
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
npx tsc --noEmit
```

Expected: API wiring test passes and TypeScript emits no errors.

- [ ] **Step 6: Commit**

Run:

```bash
git add document/src/types.ts document/src/api.ts document/tests/spreadsheetApiWiring.test.ts
git commit -m "Add spreadsheet frontend API types"
```

---

### Task 4: Navigation, i18n, And App Route Skeleton

**Files:**
- Modify: `document/src/components/I18nProvider.tsx`
- Modify: `document/src/components/SideNavBar.tsx`
- Modify: `document/src/App.tsx`
- Create: `document/src/pages/SpreadsheetCenterPage.tsx`
- Create: `document/src/pages/SpreadsheetEditorPage.tsx`
- Test: extend `document/tests/spreadsheetApiWiring.test.ts`

**Interfaces:**
- Consumes: API methods from Task 3.
- Produces:
  - Page route `spreadsheets`
  - Hash route `#/spreadsheets`
  - Hash route `#/spreadsheets/:id`
  - Navigation id `spreadsheets`

- [ ] **Step 1: Extend source-level routing test**

Append to `document/tests/spreadsheetApiWiring.test.ts`:

```ts
  it("wires spreadsheets into app navigation and hash routes", () => {
    const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    const navSource = readFileSync(new URL("../src/components/SideNavBar.tsx", import.meta.url), "utf8");
    const i18nSource = readFileSync(new URL("../src/components/I18nProvider.tsx", import.meta.url), "utf8");

    assert.match(i18nSource, /"nav\\.spreadsheets"/);
    assert.match(navSource, /id: "spreadsheets"/);
    assert.match(appSource, /SpreadsheetCenterPage/);
    assert.match(appSource, /SpreadsheetEditorPage/);
    assert.match(appSource, /spreadsheets\\//);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
```

Expected: FAIL because navigation is not wired.

- [ ] **Step 3: Add i18n keys first**

Modify `document/src/components/I18nProvider.tsx`:

```ts
  "nav.spreadsheets": { zh: "表格", en: "Sheets" },

  "sheets.title": { zh: "表格", en: "Sheets" },
  "sheets.subtitle": { zh: "管理工作簿、素材表和结构化数据。", en: "Manage workbooks, reference tables, and structured data." },
  "sheets.new": { zh: "新建表格", en: "New sheet" },
  "sheets.import": { zh: "导入 Excel", en: "Import Excel" },
  "sheets.searchPlaceholder": { zh: "搜索表格...", en: "Search sheets..." },
  "sheets.emptyTitle": { zh: "还没有表格", en: "No sheets yet" },
  "sheets.emptyDesc": { zh: "新建一个工作簿，或导入 .xlsx 文件开始整理数据。", en: "Create a workbook or import an .xlsx file to start organizing data." },
  "sheets.updated": { zh: "更新", en: "Updated" },
  "sheets.sheetCount": { zh: "{count} 个工作表", en: "{count} sheet(s)" },
  "sheets.open": { zh: "打开", en: "Open" },
  "sheets.rename": { zh: "重命名", en: "Rename" },
  "sheets.duplicate": { zh: "复制", en: "Duplicate" },
  "sheets.delete": { zh: "删除", en: "Delete" },
  "sheets.deleteTitle": { zh: "删除这个表格？", en: "Delete this sheet?" },
  "sheets.deleteDesc": { zh: "表格会移入回收站，之后可在后续版本中恢复。", en: "This sheet will be moved to trash." },
  "sheets.loading": { zh: "正在加载表格...", en: "Loading sheets..." },
  "sheets.loadFailed": { zh: "加载表格失败", en: "Failed to load sheets" },
  "sheets.createFailed": { zh: "创建表格失败", en: "Failed to create sheet" },
  "sheets.saveFailed": { zh: "保存表格失败", en: "Failed to save sheet" },
  "sheets.saved": { zh: "已保存", en: "Saved" },
  "sheets.saving": { zh: "保存中...", en: "Saving..." },
  "sheets.unsaved": { zh: "未保存", en: "Unsaved" },
```

- [ ] **Step 4: Add nav id and item**

Modify `document/src/components/SideNavBar.tsx`:

```ts
import { Table2 } from "lucide-react";

export type NavId = "workbench" | "documents" | "spreadsheets" | "favorites" | "records" | "record-history" | "trash" | "settings" | "brain" | "model-config";

interface NavItem {
  id: NavId;
  labelKey: "nav.workbench" | "nav.documents" | "nav.spreadsheets" | "nav.favorites" | "nav.records" | "nav.recordHistory" | "nav.trash" | "nav.settings" | "nav.brain" | "nav.modelConfig";
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { id: "workbench", labelKey: "nav.workbench", icon: LayoutDashboard },
  { id: "documents", labelKey: "nav.documents", icon: FileText },
  { id: "spreadsheets", labelKey: "nav.spreadsheets", icon: Table2 },
  // existing items
];
```

- [ ] **Step 5: Create skeleton pages**

Create `document/src/pages/SpreadsheetCenterPage.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";

interface SpreadsheetCenterPageProps {
  onOpenSpreadsheet?: (id: string) => void;
}

export function SpreadsheetCenterPage({ onOpenSpreadsheet: _onOpenSpreadsheet }: SpreadsheetCenterPageProps) {
  const { t } = useI18n();

  return (
    <main className="min-h-0 flex-1 overflow-hidden bg-surface-50 dark:bg-surface-950">
      <div className="flex h-full flex-col px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-surface-950 dark:text-surface-50">{t("sheets.title")}</h1>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">{t("sheets.subtitle")}</p>
          </div>
          <Button type="button">{t("sheets.new")}</Button>
        </div>
      </div>
    </main>
  );
}
```

Create `document/src/pages/SpreadsheetEditorPage.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";

interface SpreadsheetEditorPageProps {
  spreadsheetId: string;
  onBack?: () => void;
}

export function SpreadsheetEditorPage({ spreadsheetId, onBack }: SpreadsheetEditorPageProps) {
  const { t } = useI18n();

  return (
    <main className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-surface-950">
      <div className="flex h-full flex-col">
        <header className="flex h-12 items-center gap-3 border-b border-surface-200 px-4 dark:border-surface-800">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            {t("common.back")}
          </Button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">{t("sheets.title")}</div>
            <div className="truncate text-[11px] text-surface-400">{spreadsheetId}</div>
          </div>
        </header>
      </div>
    </main>
  );
}
```

Add `common.back` to `I18nProvider.tsx` in this task if it is not already present: `"common.back": { zh: "返回", en: "Back" }`.

- [ ] **Step 6: Wire App routes**

Modify `document/src/App.tsx`:

```ts
import { SpreadsheetCenterPage } from "@/pages/SpreadsheetCenterPage";
import { SpreadsheetEditorPage } from "@/pages/SpreadsheetEditorPage";

type Page = "editor" | "spreadsheet-editor" | "workbench" | "documents" | "spreadsheets" | ...;

const VALID_PAGES = new Set<string>(["workbench", "documents", "spreadsheets", ...]);

function pageFromHash(hash: string): { page: Page; editorId?: string; spreadsheetId?: string } | null {
  const name = hash.replace(/^#\//, "");
  if (VALID_PAGES.has(name)) return { page: name as Page };
  if (name.startsWith("spreadsheets/")) {
    const id = name.slice("spreadsheets/".length);
    return { page: "spreadsheet-editor", spreadsheetId: id || undefined };
  }
  // existing editor handling
}

function hashFromPage(page: Page, editorDocId?: string, spreadsheetId?: string): string {
  if (page === "spreadsheet-editor") return spreadsheetId ? `#/spreadsheets/${spreadsheetId}` : "#/spreadsheets";
  // existing behavior
}
```

Add state and rendering:

```tsx
const [activeSpreadsheetId, setActiveSpreadsheetId] = useState<string>(() => {
  const fromHash = pageFromHash(window.location.hash);
  return fromHash?.page === "spreadsheet-editor" ? fromHash.spreadsheetId || "" : "";
});

const handleOpenSpreadsheet = (spreadsheetId: string) => {
  setActiveSpreadsheetId(spreadsheetId);
  setCurrentPage("spreadsheet-editor");
  setActiveNav("spreadsheets");
  window.location.hash = `#/spreadsheets/${spreadsheetId}`;
};
```

Render pages:

```tsx
{currentPage === "spreadsheets" && (
  <SpreadsheetCenterPage onOpenSpreadsheet={handleOpenSpreadsheet} />
)}
{currentPage === "spreadsheet-editor" && (
  <SpreadsheetEditorPage spreadsheetId={activeSpreadsheetId} onBack={() => handleNavChange("spreadsheets")} />
)}
```

- [ ] **Step 7: Verify**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript emits no errors.

- [ ] **Step 8: Commit**

Run:

```bash
git add document/src/components/I18nProvider.tsx document/src/components/SideNavBar.tsx document/src/App.tsx document/src/pages/SpreadsheetCenterPage.tsx document/src/pages/SpreadsheetEditorPage.tsx document/tests/spreadsheetApiWiring.test.ts
git commit -m "Wire spreadsheet navigation"
```

---

### Task 5: Spreadsheet Center Data Flow

**Files:**
- Modify: `document/src/pages/SpreadsheetCenterPage.tsx`

**Interfaces:**
- Consumes: `api.listSpreadsheets`, `api.createSpreadsheet`, `api.duplicateSpreadsheet`, `api.moveSpreadsheetToTrash`.
- Produces: spreadsheet list UI that opens editor via `onOpenSpreadsheet(id)`.

- [ ] **Step 1: Write source regression assertions**

Extend `document/tests/spreadsheetApiWiring.test.ts`:

```ts
  it("uses spreadsheet API methods from the spreadsheet center", () => {
    const source = readFileSync(new URL("../src/pages/SpreadsheetCenterPage.tsx", import.meta.url), "utf8");

    assert.match(source, /api\\.listSpreadsheets/);
    assert.match(source, /api\\.createSpreadsheet/);
    assert.match(source, /api\\.duplicateSpreadsheet/);
    assert.match(source, /api\\.moveSpreadsheetToTrash/);
    assert.match(source, /onOpenSpreadsheet\\?\\./);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
```

Expected: FAIL because center skeleton does not call API methods.

- [ ] **Step 3: Implement center page**

Replace `SpreadsheetCenterPage.tsx` with a page that:

- `useEffect` loads `api.listSpreadsheets()`.
- Shows loading, empty, error, and list states.
- Creates blank spreadsheet with `api.createSpreadsheet({ title: t("sheets.untitled") })`.
- Duplicates with `api.duplicateSpreadsheet(id)`.
- Moves to trash with `api.moveSpreadsheetToTrash(id)`.
- Calls `onOpenSpreadsheet?.(id)` on row open.

Use these imports:

```tsx
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search, Sheet, Upload } from "lucide-react";
import { api } from "@/api";
import type { Spreadsheet } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LoadingOverlay } from "@/components/LoadingSpinner";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { formatRelativeModified } from "@/lib/date";
```

The render must avoid nested cards. Use one full-width list surface with `divide-y`.

- [ ] **Step 4: Verify**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript emits no errors.

- [ ] **Step 5: Commit**

Run:

```bash
git add document/src/pages/SpreadsheetCenterPage.tsx document/tests/spreadsheetApiWiring.test.ts
git commit -m "Build spreadsheet center"
```

---

### Task 6: Spreadsheet Editor Shell, Autosave, Toolbar, And Sheet Tabs

**Files:**
- Modify: `document/src/pages/SpreadsheetEditorPage.tsx`
- Create: `document/src/components/spreadsheet/SpreadsheetToolbar.tsx`
- Create: `document/src/components/spreadsheet/SheetTabs.tsx`

**Interfaces:**
- Consumes: `api.getSpreadsheet`, `api.updateSpreadsheet`, workbook helper functions.
- Produces:
  - `SpreadsheetToolbar`
  - `SheetTabs`
  - editor autosave state.

- [ ] **Step 1: Extend source test**

Append:

```ts
  it("loads and autosaves spreadsheet data in the editor", () => {
    const source = readFileSync(new URL("../src/pages/SpreadsheetEditorPage.tsx", import.meta.url), "utf8");

    assert.match(source, /api\\.getSpreadsheet/);
    assert.match(source, /api\\.updateSpreadsheet/);
    assert.match(source, /SpreadsheetToolbar/);
    assert.match(source, /SheetTabs/);
    assert.match(source, /setTimeout/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create toolbar component**

Create `document/src/components/spreadsheet/SpreadsheetToolbar.tsx`:

```tsx
import { Bold, Download, Filter, Italic, Merge, PanelTop, RotateCcw, RotateCw, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useI18n } from "@/components/I18nProvider";

interface SpreadsheetToolbarProps {
  saveStatus: "saved" | "unsaved" | "saving" | "failed";
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onToggleBold?: () => void;
  onToggleItalic?: () => void;
  onMerge?: () => void;
  onFreezeTopRow?: () => void;
  onToggleFilters?: () => void;
  onImport?: () => void;
  onExport?: () => void;
}

export function SpreadsheetToolbar({
  saveStatus,
  onUndo,
  onRedo,
  onSave,
  onToggleBold,
  onToggleItalic,
  onMerge,
  onFreezeTopRow,
  onToggleFilters,
  onImport,
  onExport,
}: SpreadsheetToolbarProps) {
  const { t } = useI18n();
  const statusKey = saveStatus === "saving" ? "sheets.saving" : saveStatus === "unsaved" ? "sheets.unsaved" : saveStatus === "failed" ? "sheets.saveFailed" : "sheets.saved";

  const tools = [
    { label: t("editor.undo"), icon: RotateCcw, action: onUndo },
    { label: t("editor.redo"), icon: RotateCw, action: onRedo },
    { label: t("common.save"), icon: Save, action: onSave },
    { label: t("editor.bold"), icon: Bold, action: onToggleBold },
    { label: t("editor.italic"), icon: Italic, action: onToggleItalic },
    { label: t("sheets.merge"), icon: Merge, action: onMerge },
    { label: t("sheets.freezeTopRow"), icon: PanelTop, action: onFreezeTopRow },
    { label: t("sheets.filters"), icon: Filter, action: onToggleFilters },
    { label: t("sheets.import"), icon: Upload, action: onImport },
    { label: t("sheets.export"), icon: Download, action: onExport },
  ];

  return (
    <div className="flex h-10 items-center justify-between gap-3 border-b border-surface-200 bg-white px-3 dark:border-surface-800 dark:bg-surface-950">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {tools.map((tool) => (
          <Tooltip key={tool.label} content={tool.label} delay={150}>
            <Button type="button" variant="ghost" size="icon-sm" onClick={tool.action} aria-label={tool.label}>
              <tool.icon className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        ))}
      </div>
      <span className="shrink-0 text-[11px] text-surface-500 dark:text-surface-400">{t(statusKey)}</span>
    </div>
  );
}
```

Add missing i18n keys before this code: `sheets.merge`, `sheets.freezeTopRow`, `sheets.filters`, `sheets.export`.

- [ ] **Step 4: Create sheet tabs component**

Create `document/src/components/spreadsheet/SheetTabs.tsx`:

```tsx
import { Plus, X } from "lucide-react";
import type { SpreadsheetSheet } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/I18nProvider";

interface SheetTabsProps {
  sheets: SpreadsheetSheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onDeleteSheet: (sheetId: string) => void;
}

export function SheetTabs({ sheets, activeSheetId, onSelectSheet, onAddSheet, onDeleteSheet }: SheetTabsProps) {
  const { t } = useI18n();
  return (
    <div className="flex h-10 items-center gap-1 border-t border-surface-200 bg-surface-50 px-2 dark:border-surface-800 dark:bg-surface-900">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {sheets.map((sheet) => (
          <div
            key={sheet.id}
            className={cn(
              "flex h-7 max-w-[180px] items-center rounded-md transition-colors",
              sheet.id === activeSheetId
                ? "bg-white text-surface-950 shadow-sm dark:bg-surface-800 dark:text-surface-50"
                : "text-surface-600 hover:bg-white/70 dark:text-surface-300 dark:hover:bg-surface-800"
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectSheet(sheet.id)}
              className="h-7 min-w-0 flex-1 justify-start px-3 text-xs"
            >
              <span className="truncate">{sheet.name}</span>
            </Button>
            {sheets.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("sheets.deleteSheet")}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteSheet(sheet.id);
                }}
                className="mr-1 h-5 w-5 text-surface-400 hover:text-surface-700 dark:hover:text-surface-100"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onAddSheet} aria-label={t("sheets.addSheet")}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
```

Add i18n keys `sheets.addSheet`, `sheets.deleteSheet`.

- [ ] **Step 5: Implement editor shell**

Replace `SpreadsheetEditorPage.tsx` with a component that:

- Loads `api.getSpreadsheet(spreadsheetId)`.
- Holds `title`, `workbook`, `saveStatus`.
- Uses `addSpreadsheetSheet`, `deleteSpreadsheetSheet`, `renameSpreadsheetSheet` helpers.
- Debounces `api.updateSpreadsheet(spreadsheetId, { title, data: workbook })`.
- Renders `SpreadsheetToolbar` and `SheetTabs`.

- [ ] **Step 6: Verify**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts tests/spreadsheetWorkbook.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript emits no errors.

- [ ] **Step 7: Commit**

Run:

```bash
git add document/src/pages/SpreadsheetEditorPage.tsx document/src/components/spreadsheet/SpreadsheetToolbar.tsx document/src/components/spreadsheet/SheetTabs.tsx document/src/components/I18nProvider.tsx document/tests/spreadsheetApiWiring.test.ts
git commit -m "Add spreadsheet editor shell"
```

---

### Task 7: Handsontable Grid Integration

**Files:**
- Create: `document/src/components/spreadsheet/SpreadsheetGrid.tsx`
- Create: `document/src/components/spreadsheet/spreadsheet.css`
- Modify: `document/src/pages/SpreadsheetEditorPage.tsx`
- Modify: `document/tests/spreadsheetApiWiring.test.ts`

**Interfaces:**
- Consumes: active `SpreadsheetSheet`.
- Produces:
  - `SpreadsheetGrid` with `onSheetChange(nextSheet: SpreadsheetSheet): void`

- [ ] **Step 1: Extend source test**

Append:

```ts
  it("isolates Handsontable usage inside SpreadsheetGrid", () => {
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");
    const editorSource = readFileSync(new URL("../src/pages/SpreadsheetEditorPage.tsx", import.meta.url), "utf8");

    assert.match(gridSource, /@handsontable\\/react-wrapper/);
    assert.match(gridSource, /registerAllModules/);
    assert.match(gridSource, /HyperFormula/);
    assert.match(gridSource, /licenseKey="non-commercial-and-evaluation"/);
    assert.match(editorSource, /<SpreadsheetGrid/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
```

Expected: FAIL because `SpreadsheetGrid.tsx` does not exist.

- [ ] **Step 3: Create CSS**

Create `document/src/components/spreadsheet/spreadsheet.css`:

```css
.zn-spreadsheet-grid {
  min-height: 0;
  height: 100%;
}

.zn-spreadsheet-grid .handsontable {
  font-family: inherit;
  color: #171717;
}

.dark .zn-spreadsheet-grid .handsontable {
  color: #f4f4f5;
}
```

- [ ] **Step 4: Create Handsontable wrapper**

Create `document/src/components/spreadsheet/SpreadsheetGrid.tsx`:

```tsx
import { useMemo, useRef } from "react";
import { HotTable, type HotTableRef } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import HyperFormula from "hyperformula";
import type { SpreadsheetSheet } from "@/types";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import "./spreadsheet.css";

registerAllModules();

interface SpreadsheetGridProps {
  sheet: SpreadsheetSheet;
  onSheetChange: (sheet: SpreadsheetSheet) => void;
}

export function SpreadsheetGrid({ sheet, onSheetChange }: SpreadsheetGridProps) {
  const hotRef = useRef<HotTableRef>(null);
  const formulaEngine = useMemo(() => HyperFormula.buildEmpty({ licenseKey: "internal-use-in-handsontable" }), []);

  return (
    <div className="zn-spreadsheet-grid min-h-0 flex-1 overflow-hidden">
      <HotTable
        ref={hotRef}
        data={sheet.data}
        height="100%"
        width="100%"
        rowHeaders
        colHeaders
        contextMenu
        dropdownMenu
        filters
        manualColumnResize
        manualRowResize
        manualColumnMove
        manualRowMove
        mergeCells={sheet.merges || []}
        fixedRowsTop={sheet.fixedRowsTop || 0}
        fixedColumnsLeft={sheet.fixedColumnsLeft || 0}
        formulas={{ engine: formulaEngine, sheetName: sheet.name }}
        licenseKey="non-commercial-and-evaluation"
        stretchH="all"
        className="ht-theme-main"
        afterChange={(_, source) => {
          if (source === "loadData") return;
          const hot = hotRef.current?.hotInstance;
          if (!hot) return;
          onSheetChange({ ...sheet, data: hot.getData() });
        }}
        afterMergeCells={() => {
          const hot = hotRef.current?.hotInstance;
          const plugin = hot?.getPlugin("mergeCells");
          const mergedCells = plugin?.mergedCellsCollection?.mergedCells || [];
          onSheetChange({
            ...sheet,
            data: hot?.getData() || sheet.data,
            merges: mergedCells.map((cell: any) => ({
              row: cell.row,
              col: cell.col,
              rowspan: cell.rowspan,
              colspan: cell.colspan,
            })),
          });
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Wire grid into editor**

In `SpreadsheetEditorPage.tsx`, import and render:

```tsx
import { SpreadsheetGrid } from "@/components/spreadsheet/SpreadsheetGrid";

const activeSheet = workbook?.sheets.find((sheet) => sheet.id === workbook.activeSheetId) ?? workbook?.sheets[0];

const updateActiveSheet = (nextSheet: SpreadsheetSheet) => {
  setWorkbook((current) => current ? {
    ...current,
    sheets: current.sheets.map((sheet) => sheet.id === nextSheet.id ? nextSheet : sheet),
  } : current);
  setSaveStatus("unsaved");
};
```

Render:

```tsx
{activeSheet && <SpreadsheetGrid sheet={activeSheet} onSheetChange={updateActiveSheet} />}
```

- [ ] **Step 6: Verify**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetApiWiring.test.ts
npx tsc --noEmit
npx vite build
```

Expected: tests pass, TypeScript emits no errors, Vite build succeeds.

- [ ] **Step 7: Commit**

Run:

```bash
git add document/src/components/spreadsheet/SpreadsheetGrid.tsx document/src/components/spreadsheet/spreadsheet.css document/src/pages/SpreadsheetEditorPage.tsx document/tests/spreadsheetApiWiring.test.ts
git commit -m "Integrate Handsontable spreadsheet grid"
```

---

### Task 8: XLSX Import And Export

**Files:**
- Create: `document/src/lib/spreadsheetImportExport.ts`
- Create: `document/tests/spreadsheetImportExport.test.ts`
- Modify: `document/src/pages/SpreadsheetCenterPage.tsx`
- Modify: `document/src/pages/SpreadsheetEditorPage.tsx`

**Interfaces:**
- Consumes: `SpreadsheetWorkbook`.
- Produces:
  - `workbookFromXlsxArrayBuffer(buffer: ArrayBuffer): SpreadsheetWorkbook`
  - `workbookToXlsxBlob(workbook: SpreadsheetWorkbook): Blob`

- [ ] **Step 1: Write failing import/export helper test**

Create `document/tests/spreadsheetImportExport.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultWorkbook } from "../src/lib/spreadsheetWorkbook.ts";
import { workbookFromXlsxArrayBuffer, workbookToXlsxBlob } from "../src/lib/spreadsheetImportExport.ts";

describe("spreadsheet xlsx import/export", () => {
  it("exports a workbook to an xlsx blob", () => {
    const workbook = createDefaultWorkbook();
    workbook.sheets[0].data = [["Name", "Value"], ["Lin", 7]];

    const blob = workbookToXlsxBlob(workbook);

    assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.ok(blob.size > 0);
  });

  it("imports a workbook from an exported xlsx buffer", async () => {
    const workbook = createDefaultWorkbook();
    workbook.sheets[0].name = "Data";
    workbook.sheets[0].data = [["Name", "Value"], ["Lin", 7]];
    const blob = workbookToXlsxBlob(workbook);
    const imported = workbookFromXlsxArrayBuffer(await blob.arrayBuffer());

    assert.equal(imported.sheets[0].name, "Data");
    assert.equal(imported.sheets[0].data[0][0], "Name");
    assert.equal(imported.sheets[0].data[1][1], 7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetImportExport.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement import/export helper**

Create `document/src/lib/spreadsheetImportExport.ts`:

```ts
import * as XLSX from "xlsx";
import type { SpreadsheetWorkbook } from "./spreadsheetWorkbook";
import { createSpreadsheetSheet } from "./spreadsheetWorkbook";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function workbookFromXlsxArrayBuffer(buffer: ArrayBuffer): SpreadsheetWorkbook {
  const parsed = XLSX.read(buffer, { type: "array", cellFormula: true, cellStyles: true });
  const sheets = parsed.SheetNames.map((name) => {
    const sheet = createSpreadsheetSheet(name);
    const worksheet = parsed.Sheets[name];
    sheet.data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "" });
    return sheet;
  });
  const safeSheets = sheets.length > 0 ? sheets : [createSpreadsheetSheet()];
  return {
    version: 1,
    activeSheetId: safeSheets[0].id,
    sheets: safeSheets,
  };
}

export function workbookToXlsxBlob(workbook: SpreadsheetWorkbook): Blob {
  const xlsxWorkbook = XLSX.utils.book_new();
  for (const sheet of workbook.sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(xlsxWorkbook, worksheet, sheet.name.slice(0, 31) || "Sheet");
  }
  const output = XLSX.write(xlsxWorkbook, { bookType: "xlsx", type: "array" });
  return new Blob([output], { type: XLSX_MIME });
}
```

- [ ] **Step 4: Wire import in center**

Add hidden file input to `SpreadsheetCenterPage.tsx`, parse `.xlsx` with `workbookFromXlsxArrayBuffer`, create spreadsheet with `api.createSpreadsheet({ title, data: workbook })`, then open it.

- [ ] **Step 5: Wire export/import in editor**

In `SpreadsheetEditorPage.tsx`, connect toolbar export to:

```ts
const blob = workbookToXlsxBlob(workbook);
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = `${title || "sheet"}.xlsx`;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
URL.revokeObjectURL(url);
```

Use a hidden file input for import and replace current workbook only after parsing succeeds.

- [ ] **Step 6: Verify**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetImportExport.test.ts tests/spreadsheetWorkbook.test.ts
npx tsc --noEmit
npx vite build
```

Expected: tests pass, TypeScript emits no errors, Vite build succeeds.

- [ ] **Step 7: Commit**

Run:

```bash
git add document/src/lib/spreadsheetImportExport.ts document/tests/spreadsheetImportExport.test.ts document/src/pages/SpreadsheetCenterPage.tsx document/src/pages/SpreadsheetEditorPage.tsx
git commit -m "Add spreadsheet xlsx import export"
```

---

### Task 9: Full Verification And Finish

**Files:**
- Review all changed files.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified implementation.

- [ ] **Step 1: Run backend verification**

Run:

```bash
cd server
npx prisma db push
npx tsc --noEmit
npm test -- src/services/spreadsheetService.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
cd document
node --test --experimental-strip-types tests/spreadsheetWorkbook.test.ts tests/spreadsheetApiWiring.test.ts tests/spreadsheetImportExport.test.ts
npx tsc --noEmit
npx vite build
```

Expected: tests pass, TypeScript emits no errors, Vite build succeeds.

- [ ] **Step 3: Manual smoke test**

Run:

```bash
./start.sh
```

In the app:

- Open `#/spreadsheets`.
- Create a sheet.
- Open the editor.
- Edit a cell.
- Wait for save status.
- Reload and confirm value persists.
- Add a second sheet.
- Enter `=SUM(A1:A3)` in a cell.
- Export `.xlsx`.
- Import `.xlsx`.
- Toggle dark mode.

Expected: no blank page, no console crash, no overlapping toolbar text, grid remains scrollable.

- [ ] **Step 4: Final status**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: only intentional committed changes or an empty working tree.
