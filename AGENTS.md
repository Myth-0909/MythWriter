# ZNWriter - Project Guidelines

## Always

- **Karpathy Guidelines for coding**: When writing, reviewing, or refactoring code, follow `/Users/lijialong/.codex/skills/karpathy-guidelines/SKILL.md`: state assumptions when needed, prefer the simplest working change, keep edits surgical, and verify with clear success criteria.
- **i18n FIRST (non-negotiable)**: Before writing any feature code, add i18n keys to `document/src/components/I18nProvider.tsx`. Every user-facing string — frontend AND backend — must be bilingual (zh/en). Never hardcode Chinese or English strings anywhere.
- **UI Library Components First (non-negotiable)**: All input, interactive, and selection controls (such as dropdowns, confirm popups, buttons, select menus) must utilize custom Radix UI library components located in `document/src/components/ui/` (e.g. `<Select>`, `<Dialog>`, `<Tooltip>`), never browser native inputs.
- **Windows compatibility FIRST (non-negotiable)**: Always consider and verify Windows desktop behavior, especially Tauri WebView2 differences, filesystem paths, keyboard shortcuts, scrolling, animation/reduced-motion behavior, and CSS/browser compatibility. Do not optimize only for macOS.
- **Full-stack verification**: Every feature must verify the complete chain end-to-end:
  1. Prisma schema → `npx prisma db push`
  2. Backend route → compile check with `npx tsc --noEmit`
  3. Frontend API client → method added to `api.ts`
  4. Frontend component → uses the API method
  5. i18n keys added for all user-facing strings
  Never ship a feature without verifying all 5 layers are connected.
- **Commit after each session**: When the conversation ends and there are uncommitted changes, always commit with a descriptive message and push to `origin/master`.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI, Lucide Icons, Tiptap
- **Backend**: Node.js, Express, TypeScript, Prisma, MySQL
- **AI**: DeepSeek Chat API (streaming SSE)
- **Desktop**: Tauri v2 (Rust)
- **Package Manager**: pnpm (frontend), npm (server)

## Project Structure

```
cc_figma/
├── document/        # Frontend (React + Tauri)
│   └── src/
│       ├── components/
│       │   └── ui/  # Radix UI wrappers
│       ├── pages/
│       ├── api.ts   # API client
│       ├── auth.tsx  # Auth context
│       ├── store.tsx # Document state
│       └── types.ts  # TypeScript types
├── server/          # Backend (Express + Prisma)
│   └── src/
│       ├── routes/
│       ├── middleware/
│       └── lib/
└── start.sh         # Launch script (port 3000 + 1420)
```

## Commands

- Frontend dev: `cd document && pnpm dev`
- Frontend build: `cd document && npx vite build`
- Frontend type check: `cd document && npx tsc --noEmit`
- Server dev: `cd server && npm run dev`
- Server type check: `cd server && npx tsc --noEmit`
- Prisma push: `cd server && npx prisma db push`
- Start all: `./start.sh`

## Key Patterns

- **Theme**: `useTheme()` from `ThemeProvider` — `theme === "dark"` for conditional styling
- **Auth**: `useAuth()` from `auth.tsx` — provides `user` object with `name`, `email`, `avatar`
- **Documents**: `useDocuments()` from `store.tsx` — CRUD operations on documents
- **Toast**: `useToast()` for notifications — `toast(message, "success" | "error" | "info")`
- **Styling**: Tailwind CSS 4 with custom theme colors (brand, surface, accent). Use `cn()` from `@/lib/utils` for conditional classes.
- **API calls**: Use `api` object from `api.ts` — handles auth token injection automatically
- **Streaming API**: For SSE endpoints (like `/api/ai/chat`), use raw `fetch` instead of the `api` helper

## AI Chat Architecture

- Backend proxies to DeepSeek API with SSE streaming (`stream: true`)
- System prompt built dynamically from personality + memory context
- Security: prompt injection detection + delete keyword blocking
- Personalities: `normal`, `cute`, `catgirl`, `serious`, `silly`
- Memory: localStorage for short-term, MySQL for long-term (Conversation model)
- Feedback: ChatFeedback model with like/dislike + star ratings

## Environment

- `server/.env`: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `DEEPSEEK_API_KEY`
- `.env` is git-ignored — never commit it
