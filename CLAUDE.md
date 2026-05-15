# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Contract

TruestPrompt is a **PC-Web LLM debug console**: same `User Prompt + Tools`, multiple Slots running different model/system-prompt combinations side-by-side. Every change must serve the core loop — *compare, iterate, visualize, replay*.

**Explicit non-goals** (do not drift toward these): account systems, cloud storage, multi-user collaboration, server-side proxying. See `AGENTS.md` for the full product contract.

## Commands

Package manager is **pnpm** (a `pnpm-lock.yaml` is committed; Node 20 in CI).

```bash
pnpm install                        # install deps
pnpm dev                            # vite dev server (host:true, with /proxy/ark rewrite)
pnpm build                          # production build → dist/
pnpm preview                        # preview built dist
pnpm lint                           # eslint .ts/.tsx/.vue

# Tests — there is NO `pnpm test` script. Run vitest directly:
pnpm exec vitest                    # watch mode
pnpm exec vitest run                # single pass
pnpm exec vitest run src/__tests__/slot.test.ts            # one file
pnpm exec vitest run -t "stops all running slots"          # one test by name
pnpm exec vitest run --coverage     # v8 coverage report
```

Vitest uses `jsdom` + globals; many tests use `fast-check` for property-based checks. The README claims `pnpm test` works — it doesn't (no script). Update `package.json` if you want it.

## Deployment

`.github/workflows/deploy.yml` builds on push to `main` and deploys `dist/` to Cloudflare Pages (project `truestprompt`) via `wrangler-action`. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. There is also a `Dockerfile` (multi-stage → nginx) using `npmmirror` registry — not part of the prod deploy path.

## Architecture

### Layering

```
App.vue                          thin shell: wires composables → layout components
 └─ composables/                  state, side-effects, persistence (one concern each)
      ├─ useProjectManager       project list, switching, lifecycle hooks
      ├─ useProviderProfiles     ProviderProfile CRUD + model cache
      ├─ useSlotState            slots[] + per-slot AbortController map
      ├─ useSlotRunner           runSlot / stopSlot / stopAllSlots
      ├─ useEditorPersistence    debounced localStorage save of shared editor state
      ├─ useHistory              IndexedDB-backed run history (per project)
      ├─ useGatewayAuth          OAuth2+PKCE login, gateway provider import
      ├─ useTheme / useModals / useKeyboardShortcuts / useConfirmDialog
      └─ useCurlImport / useSlotCurl
 └─ lib/                         pure async / framework-agnostic logic
      ├─ chatOrchestrator        streaming for-await loop (NOT Vue-aware)
      ├─ requestBuilder          Shared + Slot → PluginRequest merging
      ├─ toolCallRunner          tool-call execution loop
      ├─ toolExecutor            HTTP tool dispatch + response extraction
      ├─ oauth                   PKCE helpers
      ├─ urlSharing              ?gateway=… ?project=… link parsing/building
      ├─ historyView / providerTransfer / clipboard / curlParser
 └─ modules/provider/            provider plugins + their UI
      ├─ domain/plugins.ts        registered Plugin[] (id, name, listModels, invokeChat, buildCurl)
      ├─ domain/strategies/       openai / alibaba / gemini / common factories
      ├─ domain/gateway.ts        gateway provider resolution + getEffectiveApiKey
      ├─ domain/tools.ts
      └─ components/              SlotsGrid, SlotCard, OutputBubble, ProviderPanel, modals
 └─ core/
      ├─ types/index.ts          PluginRequest, Plugin, Slot, HistoryItem, GatewayConfig…
      ├─ storage/index.ts        namespaced localStorage + memory fallback
      └─ utils/                   id, imageUtils, textUtils, secureZip, fallbackCrypto
```

`App.vue` should stay thin — orchestration only. Streaming/abort/history coupling was deliberately extracted to `lib/chatOrchestrator.ts` and `composables/useSlotRunner.ts`; comments in those files explain why. Don't re-inline business logic into `App.vue`.

### Plugin contract

Every model provider is a `Plugin` (`src/core/types/index.ts`):

```ts
interface Plugin {
  id: string;
  name: string;
  defaultBaseUrl?: string;
  listModels(config: ProviderProfile): Promise<{id, label}[]>;
  invokeChat(config, request, { stream, signal }): AsyncGenerator<PluginChunk>;
  buildCurl(config, request): string;
}
```

`invokeChat` yields a discriminated `PluginChunk`: `content | thinking | tool_calls | usage`. `chatOrchestrator.runChat` consumes the generator, batches UI yields every `STREAM_UI_YIELD_INTERVAL_MS` (32ms), and routes chunks to `onChunk` so the caller (useSlotRunner) maps them onto Slot state. Plugins **only** map between the unified `PluginRequest` and vendor wire format — they never touch Vue refs, history, or auth.

New providers: register in `src/modules/provider/domain/plugins.ts`, ideally via an existing strategy factory (`createOpenAICompatiblePlugin`, `createAlibabaPlugin`, `createGeminiPlugin`). See `docs/PLUGIN_INTEGRATION.md`.

### Cancellation semantics

`runChat` has two abort sources: external `signal.aborted` and `isActive()` returning false (e.g., `slot.lastRunId` changed mid-stream). Either throws `AbortError` and returns `{status:'canceled'}`. The runner uses `lastRunId` so late chunks from a stale run are silently dropped — preserve this when touching slot runner code.

### Storage

`core/storage/index.ts` namespaces all keys as `truestprompt-<projectId>-<baseKey>` **except** the global set (`theme`, `projects`, `current-project`, `migration-v1`). `setCurrentProjectId` is called from `useProjectManager` on switch; all reads/writes route through `getItem/setItem`. If `localStorage` is unavailable, `enableMemoryFallback()` keeps the app functional for the session. Provider profiles and editor state live in localStorage; history and model cache live in IndexedDB via `localforage`.

API keys are stored in localStorage — UI must surface this risk and the "clear all keys" action. Don't add silent persistence of secrets elsewhere.

### Gateway mode (LLM Proxy Gateway)

When a project's `gatewayConfig.enabled` is true, providers are imported from the gateway (`/api/llmproxy/providers`) and auth is OAuth 2.0 + PKCE (`lib/oauth.ts`, `useGatewayAuth`). `getEffectiveApiKey` in `modules/provider/domain/gateway.ts` resolves the access token at call time — plugins receive a normal-looking `ProviderProfile`, so they don't need gateway-awareness. URL params (`gateway=`, `project=`, `autoLogin=`, `clientId=`) auto-configure on first load via `lib/urlSharing.ts`.

### Dev proxy

The Ark/Volces models endpoint is CORS-blocked, so `vite.config.ts` rewrites `/proxy/ark/*` → `https://ark.cn-beijing.volces.com/*` in dev. The ark plugin uses `/proxy/ark/api/v3/models` for its `defaultModelsUrl`. In production (Cloudflare Pages), there is no equivalent rewrite — the model-list call will fall back to the plugin's `fallbackModels` list.

## Conventions

- **TypeScript strict** is on. No `any` shortcuts; prefer extending the discriminated types in `core/types`.
- **Comments answer "why", not "what".** Existing comments in `chatOrchestrator.ts` / `useSlotRunner.ts` set the tone — extraction rationales, cancellation semantics, ownership of state.
- **Request snapshot must be reproducible.** `HistoryItem.requestSnapshot` and `providerProfileSnapshot` are deep-copied at run time — replay must not depend on the current live config. Don't store refs into history items.
- **Shared vs Slot merge order is part of the contract** — Shared (User Prompt / Tools / defaultParams) merges with Slot (System Prompt / paramOverride) in a fixed order; see `lib/requestBuilder.ts` before touching merge logic.
- **Stop button stops *one* slot; "Stop all" exists separately.** Don't conflate.
- **Don't write executable JS as plugin config.** Plugins are declarative; tool execution goes through `toolExecutor` HTTP dispatch.
- See `AGENTS.md` for the team's Chinese-language code-collaboration rules (UI aesthetics, accessibility, the 6 product-logic questions before changing a feature).

## Notable loose files

- `Sider.vue`, `test-curl.mjs`, `issues.md` at repo root are scratch/experiment artifacts — not imported by the app. Don't assume they reflect current architecture.
- `.kiro/specs/` holds product specs (curl-import, llm-proxy-gateway, project-management, sidebar-optimization, thinking-output, ui-redesign-langui-antdv, vl-image-upload). Useful when changing a feature whose spec is captured there.
