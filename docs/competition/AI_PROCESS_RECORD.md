# ZNWriter AI Competition Process Record

## 1. Goal

ZNWriter targets a concrete long-form writing problem: AI writing tools often lose character settings, worldbuilding rules, document context, and edit history during multi-turn creation. The project turns those weak points into a reusable writing workflow with document management, AI Brain Memory, semantic RAG, writing review, version rollback, and the XiaoAn Agent Writer.

## 2. Scoring Alignment

| Scoring Area | Project Evidence | Current Status |
| --- | --- | --- |
| Completion and business value | Full-stack writing workspace, rich editor, document groups, import/export, AI chat, writing review, RAG, Agent Writer, version history, white-screen protection | Implemented |
| AI depth and process quality | AI is used for goal analysis, semantic retrieval, outline planning, drafting, review, and document publishing | Implemented |
| Process material completeness | This record documents task goals, AI usage steps, prompt design, iteration records, human judgement, and verification | Implemented, screenshots and videos supplied separately |
| Innovation | AI Brain Memory + semantic references + Agent Writer + version-safe AI edits | Implemented |
| Landing feasibility | Node/Express/React/Tauri stack, MySQL persistence, optional Redis/Milvus graceful fallback, low deployment complexity | Implemented |
| Presentation readiness | Demo story and process record are prepared; screenshots, video, and live data are intentionally excluded here | Partially prepared |

## 3. AI Workflow

The Agent Writer follows six explicit stages instead of a single black-box response:

1. Analyze: extract writing type, tone, themes, and estimated length.
2. Research: search AI Brain Memory and document chunks through semantic RAG.
3. Plan: produce a title and section outline.
4. Draft: write each section against the goal, outline, style, and references.
5. Review: score the draft and surface revision suggestions.
6. Publish: create a new editable document in the workspace.

The frontend displays these stages in real time through SSE events from `/api/ai/agent/write`.

## 4. Prompt Design

| Stage | Prompt Intent | Human Control |
| --- | --- | --- |
| Analyze | Ask the model to return compact JSON with genre, tone, themes, and estimatedWords | The UI constrains style and length before the model runs |
| Research | The system searches vectors before drafting, avoiding hallucinated context when sources exist | Users can toggle brain memory and document references |
| Plan | Ask for JSON with title and outline items, each with heading and brief | The service normalizes incomplete output and avoids adding extra sections when the model already planned enough |
| Draft | Ask for document-ready section text only, without meta commentary or JSON | Each section is scoped to one outline node and the retrieved references |
| Review | Ask for JSON with score and suggestions | The UI exposes the score and suggestions before opening the generated document |
| Publish | Convert markdown-like output to safe HTML and save it as a new document | The user chooses whether to open the generated document |

## 5. Iteration Record

| Iteration | Problem Found | Decision | Result |
| --- | --- | --- | --- |
| RAG upgrade | Keyword matching missed semantic setting references | Add Milvus vectors, embedding client, document chunking, reindex APIs, and graceful fallback | Brain cards and document chunks can be retrieved semantically |
| Reliability pass | Previous sessions had blank-screen risk | Add global error boundary, safe document route recovery, and Milvus startup hardening | Blank-screen failures are contained with retry and reload options |
| Branding pass | Assistant name was inconsistent | Rename visible UI, prompt identity, greetings, and docs to XiaoAn | User-facing assistant identity is consistent |
| Agent pass | The product had AI chat but lacked autonomous multi-step writing | Add Agent service, SSE route, frontend panel, `/write` command, and document-center entry | Users can generate an editable document through a visible six-step process |

## 6. Human Judgement and Safety

- The system rejects prompt-injection attempts before Agent execution.
- The Agent does not perform delete operations.
- Users can stop generation from the panel.
- RAG services are optional. If vectors are unavailable, the product keeps core writing features usable.
- AI edits and generated documents remain editable; the app does not lock users into model output.
- Version snapshots protect existing documents during AI update workflows.

## 7. Verification Checklist

Use this checklist before submission:

```bash
cd server && npm test
cd server && npx tsc --noEmit
cd server && npx prisma db push
cd document && npx tsc --noEmit
cd document && npx vite build
```

Manual checks:

- Open the document center and start XiaoAn Agent Writer.
- Submit a concrete writing goal.
- Confirm all six stages update in sequence.
- Confirm references, outline, review score, and generated document button appear.
- Open the generated document and verify it is editable.
- Test with brain memory disabled and document references disabled.
- Test without Milvus running and verify the app does not white-screen.

## 8. Materials Not Included Here

The following materials should be supplied from the real demo environment:

- Demo screenshots.
- Screen recording.
- Live demo data.
- Trial user feedback.
- Final presentation deck.
