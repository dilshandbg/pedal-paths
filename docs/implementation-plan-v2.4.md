# BRD v2.4: implementation plan (local AI assistant on Ollama)

> Status: **Approved** by the owner (2026-11-20). Design: [ADR-0014](decisions/0014-llm-agnostic-assistant.md),
> [ai-assistant.md](ai-assistant.md). Phase 6 of v2.3 (segment matching) stays deferred.

## 1. Gap analysis

| Area      | Today                                                          | Needed                                                                                         |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Analytics | `RideAnalytics` and `/api/analytics` (BR-38, without segments) | Unchanged; `ANALYTICS_CATALOG` moves to a shared module so the tools reuse it                  |
| AI        | None; the BRD excluded it                                      | `server/assistant`: interface, orchestrator, tools, settings, model management, Ollama adapter |
| Local API | Segments, uploads, rides, analytics                            | `/api/assistant/*`, with streamed (SSE) answers and download progress                          |
| UI        | Map, Filters, Segments, Uploads tabs                           | Assistant tab: chat and settings (connection, models)                                          |
| Lint      | Purity rules for `src/`                                        | Provider isolation rules (ADR-0014 §1)                                                         |

Nothing in the ride storage, upload management, analytics or the NFR-10 benchmark changes.

## 2. Phases (each on its own feature branch, merged into `dev`, then `main`)

1. **Core** (BR-39, BR-40, RULE-25, RULE-26, RULE-28), on `feature/assistant-core`. **Done**
   (awaiting review), including the provider-neutral parts of BR-41 – BR-43: loopback endpoint
   checks (`llm/localEndpoint.ts`), the download manager (`downloads.ts`) and the model
   evaluation (`evaluation.ts`), its saved results (`evaluationStore.ts`, `data/assistant-settings.json`)
   and the traceable-number check (`numberCheck.ts`, flagged answers, AC-55):
   - `llm/types.ts`, `llm/errors.ts`, `llm/streams.ts` (NDJSON and SSE line readers),
     `llm/registry.ts`;
   - `tools/analyticsTools.ts` (validated through `parseAnalyticsQuery`), `systemPrompt.ts`,
     `conversations.ts` and `orchestrator.ts`;
   - `tests/server/assistant/fakeProvider.ts` (permanent), the provider contract tests, and tests for the tools and the
     orchestrator;
   - the ESLint isolation rules.
2. **Ollama adapter** (BR-41 – BR-44, RULE-27), on `feature/assistant-ollama`:
   - `providers/ollama.ts`: connection, model discovery with capabilities, remote/cloud detection,
     streaming chat with tools, structured output, install and remove, error mapping and timeouts;
   - every test on mocked Ollama HTTP (ai-assistant.md §6).
3. **Settings, model management and API** (BR-41 – BR-43, NFR-12), on `feature/assistant-api`:
   - `settings.ts`, `models.ts` (list, install, remove, model test), `server/http/assistantApi.ts`,
     mounted by a Vite plugin;
   - README and `.env.example` (no new secrets; the settings file location; `OLLAMA_NO_CLOUD`).
4. **Chat UI** (BR-39, BR-41 – BR-43, BR-45, UX-13, UX-14), on `feature/assistant-ui`:
   - `src/types/assistant.ts`, `services/assistant-api` (fetch and SSE reader), and
     `features/assistant` (store, chat, settings, model list, download, remove, test);
   - RTL integration tests.
5. **End-to-end with a mocked Ollama** (AC-43 – AC-53):
   - a Playwright journey on the real backend;
   - `/verify`, all e2e tests, `npm run perf` and `npm run perf:history`, to show that nothing
     regressed.
   - Ollama isn't installed on this machine, so a check against a real local Ollama is optional,
     for you to run (or for me to run if you install it). Everything stays local either way.

## 3. Open decisions (technical design §9)

- OD-33 is closed: conversations are kept in memory only (owner decision).
- Still open, each with a proposed answer:
  - OD-34: no geocoding.
  - OD-35: model discovery by name plus a link to Ollama's library.
  - OD-36: the Ollama address must be on this machine.
  - OD-37: limits.
  - OD-38: the model test.
- Phase 1 can start before these are closed. OD-36 and OD-37 must be closed before phase 2 ends,
  and OD-35 and OD-38 before phase 3.
