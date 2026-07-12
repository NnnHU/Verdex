# Verdex

> A fully local, server-less Mixture-of-Agents (MoA) synthesis engine desktop client.

Multiple AI models answer in parallel (the Panel), then a judge model synthesizes their answers into a structured four-field verdict (consensus / divergence / blind spots / final verdict). All data stays on your machine — API requests go directly from your device, nothing is uploaded.

[中文文档 (Chinese README)](./README_CN.md)

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2.0 (Rust backend + WebView frontend) |
| Frontend | React 18 + TypeScript 5 |
| Build | Vite 5 |
| Styling | Tailwind CSS v4 (CSS-first, themeable via CSS variables) |
| i18n | react-i18next (English default, Chinese available) |
| Persistence | Plaintext `config.json` (appDataDir) + browser localStorage fallback |
| AI orchestration | Pure native TS async (`Promise.all`), no LangChain/AutoGen |
| Testing | Vitest (26 unit tests) |

**No third-party AI frameworks. No backend server.**

## Quick Start

### Prerequisites
- Node.js 18+
- Rust toolchain (`rustup`; verify with `cargo --version`)
- Windows: WebView2 (included with Win10/11)

### Install & Run
```bash
npm install
npm run tauri dev      # Desktop app (first Rust compile ~1-2 min)
```

Frontend-only debug (browser, no Tauri shell, API calls subject to CORS):
```bash
npm run dev            # Open http://localhost:1420
```

### Verify
```bash
npx tsc --noEmit       # Type check
npm test               # Unit tests (26)
npm run build          # Frontend production build
```

## Usage

1. **Add API Keys**: Sidebar → ⚙️ Settings → Providers tab → fill Base URL + API Key + model name for each provider
2. **Test Connections**: Click "🔌 Test connection" to probe all providers (green = ok, red = error detail). Context window is auto-detected from the API or built-in database (40+ models) and shown in the badge (e.g. `✓ 234ms · 128K ctx`).
3. **Choose Mode**: Config bar → toggle Simple or Advanced mode, select Panels and Judge
4. **Ask**: Type in the input box, press `Ctrl/Cmd+Enter` to send

### Config File Location
- **Windows**: `%APPDATA%\com.verdex.app\config.json`
- Plaintext JSON, directly editable/backupable. Contains providers (including API keys), role templates, judge prompts, all chat history, language, and theme.

## Key Features

### MoA Synthesis Engine
- **Panel fan-out**: Multiple models answer in parallel via `Promise.all` (fail-safe — one failure doesn't block others)
- **Panel retry**: Transient errors (timeout/5xx/429) retried once with 800ms backoff; auth errors (401/403) not retried
- **Judge synthesis**: Four-field structured verdict (consensus / divergence / blind spots / verdict)
- **Multi-judge collision** (Advanced mode): Multiple judges produce independent verdicts, deliberately preserving disagreement
- **Degraded fallback**: If the judge fails, raw Panel answers are shown directly
- **Smart circuit breaker**: Input limits auto-derived from the smallest selected model's context window (or built-in database of 40+ models). Test connection auto-detects context size from the API or DB.

### Dual Protocol Support
| | OpenAI compatible | Anthropic native |
|---|---|---|
| Endpoint | `/chat/completions` | `/v1/messages` |
| Auth | `Bearer` | `x-api-key` + `anthropic-version` |
| System prompt | Stays in messages | Extracted to top-level `system` param |
| SSE streaming | `choices[0].delta.content` | `content_block_delta.delta.text` |

Base URL auto-normalization: strips trailing slashes, removes `/chat/completions` suffix, deduplicates `/v1` for Anthropic.

Works with: DeepSeek, Qwen, Groq (Llama), OpenRouter, NVIDIA, Anthropic (Claude), and any OpenAI-compatible endpoint.

### Internationalization (i18n)
- Default language: **English**
- Switchable to **中文** (Chinese) via Sidebar language dropdown
- Built-in prompt templates (5 roles + 3 judge prompts) provided in both languages
- Language persists to `config.json`

### Theming
Three themes switchable via Sidebar theme dropdown:
- **Dark** (default): Deep blue-black canvas, blue/purple accents
- **Light**: White canvas, dark text, blue accents
- **Soft**: Warm neutral tones, violet accents — easy on the eyes

All colors are CSS variables — modify `src/index.css` to customize any theme.

### Role Templates & Judge Prompts
- 5 built-in Panel role templates (Critical Scrutiny, Structural Decomposition, Empirical Verification, Devil's Advocate, First Principles)
- 3 built-in Judge prompt templates (Default four-field, Strict logic audit, Multi-perspective synthesis)
- Fully user-editable via Settings → Templates tab
- Templates are neutral, general-purpose thinking tools

## Project Structure

```
Verdex/
├── package.json · vite.config.ts · tsconfig.json · index.html
├── src/
│   ├── main.tsx · App.tsx · index.css · vite-env.d.ts
│   ├── i18n/                     ← i18next init + en.json + zh.json
│   ├── types/moa.ts              ← All data structures (single source of truth)
│   ├── services/
│   │   ├── httpClient.ts         ← Dual-protocol adapter + SSE streaming + testProvider
│   │   ├── moaEngine.ts          ← Promise.all panel/judge fan-out + circuit breaker
│   │   ├── configStore.ts        ← config.json read/write + template fallback
│   │   └── config.template.json  ← Factory defaults (bilingual templates)
│   ├── hooks/useMoa.ts           ← State machine + CRUD + async load + debounced save
│   └── components/               ← Sidebar / MoAConfigBar / SettingsModal (tabbed)
│       │                           JudgeMessage / PanelCollapseGroup / UserMessage
│       │                           ChatInput / HelpModal
├── test/                         ← Vitest unit tests
└── src-tauri/
    ├── Cargo.toml · tauri.conf.json · capabilities/default.json
    └── src/{lib.rs, main.rs}     ← Registers http + fs plugins
```

## Security Note

- **API keys are stored in plaintext** in `config.json`. Do not commit this file to public Git repos or sync it to untrusted cloud storage.
- All data is purely local — nothing is uploaded to any server.
- Built-in circuit breaker prevents concurrent API quota exhaustion.
