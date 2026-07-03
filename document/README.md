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
- `src/components/AgentWritePanel.tsx` — six-step Agent writing panel with SSE progress
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

For company LAN access, start the full project from the repository root:

```bash
./start.sh
```

In web mode the script exposes Vite on all interfaces and prints a LAN URL such as `http://<your-ip>:1420`. When the app is opened through that LAN URL, API requests automatically target `http://<your-ip>:3000/api`. You can override the API base with `VITE_API_BASE_URL` when needed.

## Verification

```bash
npx tsc --noEmit
npx vite build
```

The backend defaults to `http://localhost:3000` for local access. When the frontend is opened from a LAN host such as `http://<your-ip>:1420`, the frontend automatically uses `http://<your-ip>:3000/api`. Semantic RAG features also require the backend embedding and Milvus configuration, but the UI remains usable when vector services are unavailable.
