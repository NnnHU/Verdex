# Verdex 交接文档

> 写给一个**完全没有上下文的新会话**。读本文件 + 按需查看子文档，即可接手开发。
> v0.2.2 · 2026-08-03 · 核心功能 + Knowledge Vault + 步骤式配置栏 + P0 bug 修复 + P1 Execution Benchmark + P2 执行理解修复 全部完成

---

## Verdex 是什么

纯本地端、无服务器的**知识精炼引擎**（Tauri 2.0 + React 18 + TS + Tailwind v4）。

### 三种任务类型（核心主线）

| 任务 | 做什么 | 流程 |
|---|---|---|
| 📄 **文档提取** | 文档 → 结构化 JSON | 文档 → [清洗] → Schema 提取 → JSON |
| 📊 **文档分析** | 先提取再深度分析 | 阶段1提取 → 阶段2多模型分析 → 阶段3 Judge综合 |
| 💬 **快速问答** | 多模型回答问题 | 问题 → Panel并行 → Judge四段裁决 |

### Knowledge Vault（独立知识仓库）

侧边栏独立入口，资产管理：浏览/搜索/分类/引用/导出/编辑。

### 配置栏（步骤式）

5 步引导流程：❶任务 → ❷文档 → ❸提取结构 → ❹分析配置 → ❺选项。按 taskType 条件显示。

## 当前状态（2026-08-03）

**所有核心功能 + Knowledge Vault 5 阶段 + 步骤式配置栏 + P0 bug 修复 + P1 Execution Benchmark + P2 执行理解修复 全部完成。88/88 测试通过。tsc 零错误。build 成功。**

### P1 Benchmark 证明了什么

- **可靠性：** 任务分解（extract→analyze→judge）把成功率从 ~31% 提到 ~92%；单靠重试只加 +8 pts。驱动因素是任务分解 —— 不是重试。
- **质量：** 多模型 Panel+Judge 在 accuracy/coverage/overall/hallucination 上胜过单模型流水线（盲评双 LLM 评分，7/7 评分者一致，人工锚点 3/3 一致）。
- **质量（P2 后干净的 5-case 结果）：** 在修复了 extract 空响应和 Judge 的「Expert 1/2」泄露（两者此前都在掩盖 M3 真实的质量优势）之后，一次干净的盲评显示 M3 胜过 M2 —— accuracy 4.6 vs 4.2、coverage 4.9 vs 3.6、overall 4.7 vs 3.6、preference 9/10 vs 1/10。这推翻了早先被污染的结果（那次泄露让 M3 输了 5/22）。
- 完整报告：工程报告（见独立论文仓库，待发布） · 过程：[`BENCHMARK_JOURNEY_CN.md`](./BENCHMARK_JOURNEY_CN.md)

### 下一步（详见 [ROADMAP-NEXT_CN.md](./ROADMAP-NEXT_CN.md)）

1. **P2 —— 执行理解：** 流水线为什么能赢？Trace 审视、失败分类学。（extract 空响应和 Judge Expert 泄露缺陷已修复 —— 见 PITFALLS_CN.md 坑 3 和坑 4。）
2. **P3 —— 真实用户 Benchmark：** 用户能否感知到质量差距？（~20 位用户，需招募）
3. **P4 —— Knowledge Representation：** 推迟到 P2/P3 表明什么值得持久化之后。
4. **不做：** IR Schema 设计、Graphify 代码、在没数据情况下继续架构理论讨论。

## 关键概念

| 概念 | 说明 |
|---|---|
| **taskType** | session 级路由（document_extract/document_analysis/quick_qa） |
| **outputKind** | 引擎内部（verdict/extract），JudgeSpec 和 parseJudgeResponse 用 |
| **Panel（专家）** | 多个模型并行分析 |
| **Judge（裁决）** | 综合 Panel 结果的模型 |
| **Schema（提取结构）** | 文档提取的目标 JSON 结构模板 |
| **KnowledgeAsset** | 持久化的知识资产（含 consensus/divergences/blindspots/verdict） |
| **Map-Reduce** | 大文档自动切分并行（单次优先，超大才触发） |

## 技术原则

- **拒绝第三方 AI 框架**（LangChain/AutoGen），纯原生 TS Promise.all 调度
- **纯本地**：API 请求从用户设备直接发送，不上传
- **OpenAI 兼容**：支持任何 OpenAI 兼容 API + Anthropic 原生协议
- **.env 种子**：首次启动自动填充 Provider（config.json 不存在时）
- **单模型降级**：只有 1 个 Provider 时隐藏多模型配置

## 文档索引

| 文档 | 用途 |
|---|---|
| [COMPLETED.md](./COMPLETED_CN.md) | 已完成功能清单（模块 + 文件位置） |
| [ROADMAP-NEXT.md](./ROADMAP-NEXT_CN.md) | 下一步计划（P1 benchmark 后修订） |
| [PITFALLS.md](./PITFALLS_CN.md) | ⚠️ 踩过的坑（9 个 + 2 个架构教训 + 4 个 benchmark 时代的坑） |
| [BENCHMARK_JOURNEY.md](./BENCHMARK_JOURNEY_CN.md) | 🔬 完整的 P0→P1 过程档案（实验、bug、外部评审） |
| 工程报告（独立论文仓库 —— 待发布） | 📄 工程报告（那件"硬资产"—— 可复现 benchmark） |
| [../MULTI_MODEL_REVIEW.md](../MULTI_MODEL_REVIEW_CN.md) | 六模型架构评审（含优先级 + Graphify 评估） |
| [../KNOWLEDGE_VAULT_DESIGN.md](../KNOWLEDGE_VAULT_DESIGN_CN.md) | 知识仓库设计（5 阶段全部完成） |
| [../KNOWLEDGE_ASSET_ARCHITECTURE.md](../KNOWLEDGE_ASSET_ARCHITECTURE_CN.md) | Knowledge Asset 战略方向 + 轻量版分支 |
| [../THREE_STAGE_ARCHITECTURE.md](../THREE_STAGE_ARCHITECTURE_CN.md) | 三阶段架构 + 未来扩展（Python 等） |
| [../ORCHESTRATION_ROADMAP.md](../ORCHESTRATION_ROADMAP_CN.md) | 编排路线图（已完成） |

## 快速接手

### 读代码顺序
1. `src/types/moa.ts` — 数据结构（单一真相源）
2. `src/components/MoAConfigBar.tsx` — 步骤式配置栏（taskType 路由）
3. `src/hooks/useMoa.ts` — 状态机（send 函数核心）
4. `src/services/moaEngine.ts` — 调度逻辑
5. `src/components/VaultView.tsx` — 知识仓库
6. `docs/MULTI_MODEL_REVIEW.md` — 架构评审和下一步

### 验证环境
```bash
cd C:\Users\k\Documents\project\no\lufei\Verdex
# Node 路径（nvm）：
export PATH="/c/Users/k/AppData/Roaming/nvm/v24.13.1:/c/Program Files/nodejs:/c/Users/k/AppData/Roaming/npm:$PATH"
npm install && npx tsc --noEmit && npm test && npm run dev
```

### .env 配置
```
VITE_VERDEX_PROVIDER_*    = 第一模型（如 deepseek-v4-flash）
VITE_VERDEX_PROVIDER2_*   = 第二模型（如 deepseek-v4-pro，多模型用）
VITE_VERDEX_REQUEST_TIMEOUT_MS = 360000
VITE_VERDEX_MAPREDUCE_FORCE = auto
```

### config.json 位置
`%APPDATA%\com.verdex.app\config.json`（用正斜杠路径访问，见 PITFALLS_CN.md 坑 2）。

## 核心数据指标
- **88/88 测试通过**
- **tsc 零错误**
- **build 成功**
- **P1 Benchmark 完成：** 5 modes × 13 cases；可靠性 + 质量都已验证（双 LLM + 人工锚点）
- **GitHub** 已同步至 commit `9301168`；后续文档更新待提交

## 文件结构
```
src/
├── components/   ChatInput, MoAConfigBar(步骤式), SettingsModal, HelpModal,
│                 JudgeMessage, MapReduceMessage, JsonCardRenderer,
│                 TurnTimer, PanelCollapseGroup, Sidebar, UserMessage,
│                 VaultView, AssetExportButton
├── hooks/        useMoa, useElapsed
├── services/     moaEngine, httpClient, configStore, envConfig,
│                 memoryBuilder, summarizer, fileReader, cleaner,
│                 schemaValidator, mapreduceStrategy, jsonToMd,
│                 templateFilter, assetPacker, assetClassifier,
│                 assetRecommender, exporters/
├── types/        moa.ts（单一真相源）
└── i18n/         en.json, zh.json
```
