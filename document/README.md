# ZNWriter Frontend

React + Tauri frontend for ZNWriter. The app provides document management, the rich text editor, AI chat, AI Brain Memory, semantic reference UI, settings, and stability fallback screens.

## Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- Radix UI wrappers in `src/components/ui`
- Tiptap editor
- ECharts writing statistics
- Tauri v2 desktop shell

## Key Areas

- `src/App.tsx` — route and layout orchestration
- `src/components/Editor.tsx` — Tiptap rich text editor
- `src/components/AIChatWidget.tsx` — streaming assistant, document references, semantic brain references
- `src/pages/BrainMemoryPage.tsx` — AI brain cards, categories, RAG reindex controls
- `src/pages/SettingsPage.tsx` — profile, theme, language, AI service configuration history
- `src/components/AppErrorBoundary.tsx` — global white-screen protection
- `src/api.ts` — typed API client
- `src/store.tsx` — document state, version restore, local cache updates

## Development

```bash
pnpm install
pnpm dev
```

Default frontend URL: `http://localhost:1420`.

## Verification

```bash
npx tsc --noEmit
npx vite build
```

The backend must be available at `http://localhost:3000` for authenticated API flows. Semantic RAG features also require the backend embedding and Milvus configuration, but the UI remains usable when vector services are unavailable.
