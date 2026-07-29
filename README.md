# Verdex

> **Turn scattered documents into trusted, reusable knowledge — through structured multi-model reasoning.**

[中文文档](./README_CN.md) · [Documentation](./docs/HANDOFF/README.md)

---

## 🤔 The Problem

You have 7 research reports. You ask Claude for the key findings. You get a confident answer — but:

- **Did it read all 7?** You can't tell.
- **Did it hallucinate?** One number seems off. You're not sure.
- **Can you reuse this next month?** No — the answer lives in a chat that's gone tomorrow.

**Verdex solves this by running multiple AI models in parallel, having them debate, and producing a structured knowledge asset you can trust, reuse, and export.**

---

## ✨ What Verdex Does

**Three task types, one workflow:**

| Task | What it does | Best for |
|------|-------------|----------|
| 📄 **Document Extract** | Load docs → extract structured JSON (mental models, causal chains, etc.) | Converting raw text into reusable data |
| 📊 **Document Analysis** | Extract → multiple models analyze → Judge synthesizes | Deep multi-perspective analysis (≥2 models) |
| 💬 **Quick Q&A** | Ask → models answer in parallel → Judge synthesizes | Getting diverse opinions on any question |

**The key difference from a single model:**

```
Single model:   Document → Answer (trust me bro)

Verdex:         Document → [Model A] [Model B] [Model C]
                              ↓           ↓           ↓
                         ┌─────────────────────────────┐
                         │  Judge: synthesize + arbittate │
                         │                               │
                         │  ✅ Consensus (all agree)     │
                         │  ⚔️  Divergence (they disagree)│
                         │  💡 Blind spots (nobody saw)  │
                         │  ⚖️  Final verdict             │
                         └─────────────────────────────┘
```

You don't just get an answer. You get **where models agreed, where they fought, and what everyone missed.**

---

## 📦 Knowledge Assets — Not Just Answers

Every analysis produces a **Knowledge Asset** — a persistent, reusable knowledge package:

```
Knowledge Asset
├── Consensus     — what all models agreed on
├── Divergences   — where models disagreed (and why)
├── Blind spots   — what everyone missed
├── Verdict       — the final synthesized conclusion
├── Sources       — traceable back to original documents
└── Metadata      — which models, when, what task

Export to:
├── Claude Skill (SKILL.md) — drop into ~/.claude/skills/
├── Markdown     — human-readable document
├── JSON         — machine-readable data
└── Verdex Native — internal reuse across sessions
```

---

## 📚 Knowledge Vault

A built-in knowledge library where every analysis is automatically stored:

- **AI auto-classification** — new assets are categorized automatically
- **Full-text search** — find any asset by name, content, or source
- **Smart filtering** — by category, task type, date
- **Asset reference** — inject past knowledge into new analyses
- **AI recommendations** — suggests relevant assets as you type
- **One-click export** — Claude Skill / Markdown / JSON

---

## 🚀 Quick Start

### 1. Download

Grab the latest release for your platform:

| Platform | Download |
|----------|----------|
| Windows | `.msi` installer |
| macOS | `.dmg` |
| Linux | `.deb` / `.AppImage` |

→ [Releases](https://github.com/NnnHU/Verdex/releases)

### 2. Configure

Open Settings → add your AI model providers (any OpenAI-compatible API):

```
Base URL:  https://api.siliconflow.cn/v1
API Key:   sk-xxxx
Model:     deepseek-ai/DeepSeek-V3
```

Works with: DeepSeek, Qwen, Groq, OpenRouter, and any OpenAI-compatible endpoint.

### 3. Use

1. Pick a task type (📄 Extract / 📊 Analysis / 💬 Q&A)
2. Attach documents (📎 .txt / .md)
3. Ask your question
4. Get structured results with consensus, divergences, and blind spots
5. Export as Knowledge Asset or Claude Skill

---

## 🔑 Key Features

### Multi-Model Reasoning
- Parallel model execution (Panel) with fail-safe error handling
- Judge synthesizes consensus / divergence / blind spots / verdict
- Per-model role templates (Critical Scrutiny, First Principles, Devil's Advocate)

### Document Intelligence
- Load .txt / .md files as analysis corpus
- ASR cleaning for speech-to-text transcripts
- Custom extraction schemas (define what JSON structure to extract)
- Schema validation with 3-attempt rewrite loop
- Adaptive Map-Reduce for large document sets

### Memory & Context
- Multi-turn conversation memory (sliding window + hierarchical summary)
- Reference past Knowledge Assets in new analyses
- AI-powered asset recommendations as you type

### Privacy
- **100% local.** No servers, no cloud, no data upload.
- API requests go directly from your device to the provider.
- All data (config, sessions, assets) stored in local config.json.

---

## 🏗️ Architecture

```
Input (PDF/MD/TXT/Meeting notes/...)
    ↓
Stage 1: Extract    — structured knowledge extraction
    ↓
Stage 2: Reasoning  — multi-model parallel analysis
    ↓
Stage 3: Judge      — synthesis + arbitration
    ↓
Stage 4: Knowledge Asset — persistent, reusable, exportable
    ↓
Export: Claude Skill | Markdown | JSON | Verdex Native
```

**Tech stack:** Tauri 2.0 (Rust + WebView) · React 18 · TypeScript · Tailwind CSS v4

No third-party AI frameworks. No backend server. Pure native orchestration.

---

## 📖 Documentation

| Doc | What's inside |
|-----|---------------|
| [Handoff Guide](./docs/HANDOFF/README.md) | Complete developer guide (start here) |
| [Completed Features](./docs/HANDOFF/COMPLETED.md) | Full feature list with file locations |
| [Pitfalls](./docs/HANDOFF/PITFALLS.md) | 11 gotchas to avoid |
| [Architecture Review](./docs/MULTI_MODEL_REVIEW.md) | 6-model architecture evaluation |
| [Knowledge Vault Design](./docs/KNOWLEDGE_VAULT_DESIGN.md) | Knowledge library design doc |

---

## 📋 Requirements

- Any OpenAI-compatible API (DeepSeek, Qwen, Groq, etc.)
- Windows 10+ / macOS / Linux
- No installation of Python, Node.js, or any runtime — Verdex is a standalone app

---

## License

MIT
