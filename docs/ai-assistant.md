# Local AI assistant: interface, Ollama, model management, privacy and testing

> Status: **Accepted** design for BRD v2.4 (BR-39 – BR-45), implemented in phases
> (`docs/implementation-plan-v2.4.md`).
> Decision record: [ADR-0014](decisions/0014-llm-agnostic-assistant.md).

The assistant answers questions about the stored ride history, for example "How far did I ride
each month in 2024?" or "How often did I pass 52.4009, 13.0591?". The language model computes
nothing itself. It calls the application's deterministic analytics (BR-38) as tools, and the answer
quotes their results (RULE-25). The model runs in **Ollama on the user's own machine**.

## 1. Setting up Ollama

1. Install Ollama from ollama.com and start it. It listens on `http://127.0.0.1:11434` by default.
2. Recommended: set `OLLAMA_NO_CLOUD=1` before starting Ollama, so Ollama itself refuses cloud
   models. The app blocks them as well (§5).
3. In the app, open **Assistant → Settings**. Check the connection and download a model that
   supports tool calling, for example a Qwen 3 or Llama 3.x variant. Browse
   [ollama.com/search?c=tools](https://ollama.com/search?c=tools) for others (OD-35).
4. Select the model, run **Test model**, and ask.

Models are large: a 7–8 B parameter model at Q4 quantization is about 5 GB on disk and needs
roughly as much free memory.

## 2. The provider interface

Defined in `server/assistant/llm/types.ts`; the full listing is in ADR-0014 §2.

| Member                      | Contract                                                                                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `descriptor`                | Id, display name, and the settings the provider needs (Ollama: the server address). The settings screen renders them generically                                                                                                                                 |
| `checkConnection(signal)`   | Reachable or not, plus the version, without generating anything                                                                                                                                                                                                  |
| `listModels(signal)`        | `ModelInfo` for each model: id, size, parameter size, quantization, context window, capabilities (`toolCalling`, `streaming`, `structuredOutput`: `true`, `false` or `'unknown'`, plus others for information), location (`local` / `remote`), revision (digest) |
| `generate(request, signal)` | One model turn as an async stream of `text`, `tool-call` and exactly one `finish`. Failures throw `LLMError` with a `kind` (ADR-0014 §2)                                                                                                                         |
| `models?` (`ModelManager`)  | Optional. `install(name)` streams progress; `remove(name)`. Ollama has it; a provider without local models wouldn't                                                                                                                                              |

Rules for adapters:

- Provider formats, endpoints and error texts stay **inside the adapter**.
- Emit each tool call once, complete, with an id (assigned if the provider has none).
- Map every HTTP status, mid-stream error, malformed line and network failure to an `LLMError`.
- Abort the request when `signal` aborts.
- Pass the shared contract tests (§6).

## 3. Settings

| Setting               | Default                  | Stored                         |
| --------------------- | ------------------------ | ------------------------------ |
| Ollama server address | `http://127.0.0.1:11434` | `data/assistant-settings.json` |
| Selected model        | none                     | `data/assistant-settings.json` |

`data/assistant-settings.json` is git-ignored and contains no secrets. Deleting it while the app
is stopped resets these settings. The address must be on this machine: `127.0.0.1`, `::1` or
`localhost` (RULE-27, OD-36). Any other address is rejected with an explanation.

The settings screen shows:

- **Connection:** reachable or not, Ollama's version, and **Test connection**. When Ollama isn't
  reachable, it shows how to start or install it.
- **Installed models:** name, size on disk, parameter size, quantization, context window, and
  capabilities: tool calling, structured output, and others such as thinking and vision.
  - Models without tool calling are marked "can't answer ride questions".
  - Cloud models are marked "cloud model, not used" and can't be selected.
  - Each model has Select, **Test model** (with the last result) and **Remove** (asks for
    confirmation).
- **Download a model:** a name field (e.g. `qwen3:8b`) and a link to Ollama's library. Progress
  is shown in bytes and percent, with Cancel. Names ending in `:cloud` or `-cloud` are refused.
- **Changes outside the app:** a selected model removed outside the app (or in it) is reported, and
  the selection is cleared.

## 4. Behaviour and limits

- **Before every question** (RULE-26), the app checks that Ollama is reachable and that the model
  is installed, local and tool-capable. If any check fails, nothing is sent and the message says
  why. The model is never changed by the app.
- **Answers stream** as they are written. "Used: …" lists the analytics behind the answer.
  **Stop** cancels the request to Ollama.
- **Conversations** are kept in memory only (at most 20) and are gone when the app stops.
- **Limits** (provisional, OD-37):
  - Ollama: 3 s for the connection check; 180 s to the first part of an answer (loading a model
    can be slow); 60 s without new output; downloads end only after 120 s without progress.
  - Tools: 6 rounds per question, and 8 KB per tool result.
  - Context: up to 16,384 tokens.

## 5. Privacy and security

- **Local inference only** (BR-44, NFR-11):
  - The backend sends prompts, analytics results and coordinates only to the Ollama server on this
    machine.
  - The app contacts no AI cloud service, and no API key or account is needed.
  - Downloading a model makes Ollama fetch it from its registry. That request carries no user data.
  - The library link opens in the user's browser; the app itself never fetches ollama.com.
- **Cloud models are blocked** (RULE-27): a model that `/api/tags` reports with `remote_host` or
  `remote_model`, or whose name ends in `:cloud` or `-cloud`, is not offered, downloaded or used.
  Setting `OLLAMA_NO_CLOUD=1` also blocks them in Ollama itself.
- **Requests:** `/api/assistant/*` has the same loopback, Origin and `Sec-Fetch-Site` checks as
  the other APIs. It validates every request (the server address, model names) and returns error
  codes only (NFR-07, NFR-08).
  - The loopback-only address also stops the backend being used to reach other machines.
- **Tools:** arguments from the model are validated by the same parsers as `/api/analytics`.
  Tools are read-only: the assistant can't change rides, uploads, segments or settings.
- Tool results never contain GPS track points.
- With Ollama stopped or not installed, everything else works as before, including
  `/api/analytics`.

## 6. Testing

No automated test needs a running Ollama. Ollama's HTTP API is mocked (a stubbed `fetch` with
recorded or hand-written NDJSON), and the network stays blocked in tests (`tests/setup.ts`).

| Test                          | Location                                                                 | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider contract             | `tests/server/assistant/providerContract.ts`, run by each adapter's test | Text, streaming, tool calls, finish reasons, every `LLMError` kind, abort                                                                                                                                                                                                                                                                                                                                                                                  |
| Ollama adapter                | `tests/server/assistant/providers/ollama.test.ts`                        | Connection (version, refused, slow → timeout), model discovery (`tags` + `show`, context-length key, capabilities with and without `tools`), remote and cloud models, chat streaming (NDJSON chunks, final `done`, `done_reason`), tool calls (object arguments, ids, `tool_name` results), structured output (`format`), install progress, success, cancel and failure, remove (200, 404), mid-stream `{"error"}`, malformed lines, 400 / 404 / 500 / 503 |
| Fake provider                 | `tests/server/assistant/fakeProvider.ts` (permanent)                     | Scripted turns: text, tool calls, errors, no tools, no streaming, slow responses                                                                                                                                                                                                                                                                                                                                                                           |
| Analytics tools               | `tests/server/assistant/analyticsTools.test.ts`                          | Schemas, validation errors, results equal to `RideAnalytics` on a synthetic history, size caps                                                                                                                                                                                                                                                                                                                                                             |
| Orchestrator                  | `tests/server/assistant/orchestrator.test.ts`                            | Tool loop and round limit, context trimming, checks before sending (unreachable, not installed, remote, no tools), no model switch, abort, timeouts                                                                                                                                                                                                                                                                                                        |
| Model management and settings | `tests/server/assistant/models.test.ts`, `settings.test.ts`              | Selection, install and remove flows, selected model removed, model test pass and fail, address validation (loopback only)                                                                                                                                                                                                                                                                                                                                  |
| API                           | `tests/server/http/assistantApi.test.ts`                                 | Routes, validation, SSE streams, loopback and Origin checks                                                                                                                                                                                                                                                                                                                                                                                                |
| UI                            | `tests/integration/assistant.test.tsx`                                   | Chat streaming, analytics used, Stop, settings, model list, download progress and cancel, remove confirmation, error messages                                                                                                                                                                                                                                                                                                                              |
| Journey                       | `tests/e2e/assistant.spec.ts`                                            | Real backend with a mocked Ollama: connect, select a model, ask, see the analytics-based answer                                                                                                                                                                                                                                                                                                                                                            |

## 7. Adding a provider later

See ADR-0014, "Adding a provider later": one adapter file, one registry entry and its contract
tests. Nothing else changes. A cloud provider also needs a BRD change, because v2.4 rules out
cloud inference.
