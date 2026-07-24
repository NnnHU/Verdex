# Verdex 编排平台路线图（已完成）

> Verdex 从「单轮 MoA 综合引擎」升级为「三阶段文档智能编排平台」的路线图与架构文档。**所有功能已完成并验证通过（65/65 测试，已 push GitHub）。**
>
> - **架构**：三阶段融合（taskType: document_extract / document_analysis / quick_qa）
> - **核心能力**：多轮记忆 + 文档输入 + schema 抽取 + Map-Reduce + ASR 清洗 + 多模型分析
> - **三阶段架构详见**：[`THREE_STAGE_ARCHITECTURE.md`](./THREE_STAGE_ARCHITECTURE.md)
> - **文档版本**：2.0 · 2026-07-24
> - **基线 commit**：`1591da9`

---

## 0. 结论先行

### TL;DR

| 维度 | 结论 |
|---|---|
| **状态** | ✅ **全部完成**。5 阶段路线图 + 三阶段架构重构 + 体验三件套 + document_analysis 完整链路。65/65 测试通过，已 push 到 GitHub。 |
| **核心能力** | ① 多轮记忆（滑窗+摘要）② 文档输入 ③ 自定义 schema 抽取+校验 ④ Map-Reduce ⑤ ASR 清洗 ⑥ 三阶段融合架构（taskType）⑦ document_analysis（先提取→多模型分析→Judge综合） |
| **架构** | taskType（document_extract/document_analysis/quick_qa）替代旧 outputMode；outputKind（verdict/extract）引擎内部解耦；单模型自动降级。详见 [`THREE_STAGE_ARCHITECTURE.md`](./THREE_STAGE_ARCHITECTURE.md)。 |
| **JSON 结构** | 自定义 schema（路线 A），四段裁决降级为默认模板。 |
| **格式策略** | 中间全程 JSON；复制为 MD 按钮（不持久化 MD）。 |
| **Map-Reduce 定位** | 降级为"单次优先"的兜底（实测大模型单次远快于 Map-Reduce）。详见下文性能分析。 |
| **推荐路径** | 5 阶段递进：1 记忆 → 2 文档输入 → 3 schema 抽取 → 4 Map-Reduce → 5 ASR 清洗。每阶段独立可用。 |

### 一句话推荐

> Verdex 已从「单轮 MoA 综合工具」升级成**三阶段文档智能编排平台**：文档→提取结构化知识→多模型深度分析→Judge 综合裁决。支持多轮记忆、ASR 清洗、Map-Reduce、自定义 schema、单模型降级。所有功能完成并验证通过。

### 进度速览（2026-07-24 更新）

| 阶段 | 状态 | 验证 |
|---|---|---|
| 1a 多轮记忆（滑窗） | ✅ 完成 | tsc 0 / 36 测试 / 实测 recall 三项信息 |
| 1b 分层摘要记忆 | ✅ 完成 | tsc 0 / 63 测试 / con.txt 四类 + 会话级持久化 |
| 2 文档输入（txt/md） | ✅ 完成 | tsc 0 / 44 测试 / 实测 7 文档综合 |
| **3 自定义 schema 抽取** | ✅ 完成 | tsc 0 / 54 测试 / 双模式 Judge + 校验闭环 |
| 4 自适应 Map-Reduce | ✅ 完成 | tsc 0 / 63 测试 / 形态 A 多文档 Map→Reduce |
| 5 ASR 数据清洗（可选） | ✅ 完成 | tsc 0 / 65 测试 / 附件加载时清洗 + 会话级开关 |
| **三阶段架构重构** | ✅ 完成 | taskType 替代 outputMode + document_analysis 完整链路 + 配置简化 |

**全部完成**：5 阶段路线图 + 三阶段架构重构 + 体验三件套 + document_analysis 完整链路。
- 三阶段架构详见 [`THREE_STAGE_ARCHITECTURE.md`](./THREE_STAGE_ARCHITECTURE.md)
- Map-Reduce 阈值已据真实基准修正为"单次优先"（见下文性能分析）
- 详细进度与实现细节见 [HANDOFF.md](./HANDOFF.md) 第四节

---

## 1. 三类编排能力 × Verdex 匹配度

每项给出：是什么、Verdex 现状、接入点（行号）、要改什么、为何需要。

### 能力 A · 多轮上下文记忆

**是什么**：每个 Panel / Judge 在新一轮里能看到自己历史轮次的回答，追问时无需重头解释。

**Verdex 现状**：**完全没有。** 每轮只收到当前这一条 prompt。

**接入点（已精确定位）**：
- `src/hooks/useMoa.ts:601-608` —— 已经把历史 `session.messages` 拍平成 `history` 字符串，但**只喂给熔断器 `checkInputLimits`，从没传给引擎**。代码算出了历史却把它扔了。
- `src/hooks/useMoa.ts:762-767` —— 构造 `SynthesisRequest` 时 `prompt:` 字段是历史注入点。
- `src/services/moaEngine.ts:214-218` —— Panel 的 messages 数组（system + 单条 user）。
- `src/services/moaEngine.ts:439-448` —— Judge 的 messages 数组。
- `src/types/moa.ts:149-166` —— `SynthesisRequest` 类型需加历史字段。

**要改什么**：
1. `SynthesisRequest` 加 `panelHistory?: Record<providerId, ChatMessage[]>` 和 `judgeHistory?`。
2. 引擎 `callPanelOnce` / `runSingleJudge` 把历史插到当前 user 消息之前。
3. 状态机 `send` 从 `session.messages` 按 providerId 重建每个 panel 自己的历史（**每 Panel 独立记忆**，非混合）。
4. 超限时调一次模型做摘要压缩（不是简单截断）。

**为何需要**：这是编排平台的基本功，没有记忆连续分析多份文档时每轮都失忆。

### 能力 B · 自定义 schema 抽取 + 校验闭环

**是什么**：用户给/选 JSON Schema → Judge 按 schema 填 → 校验 → 不合规让模型重写，直到合法或达上限。这是 kimi2「修特殊字符」那套精神的工程化，也是「玩具」与「工具」的分水岭。

**Verdex 现状**：**部分有，但不闭环。**
- Panel 有瞬态错误重试（`moaEngine.ts:199-289`，5xx/429 重试 1 次，401/403 不重试）——网络层重试，非内容层校验。
- `parseJudgeResponse`（`moaEngine.ts:346-402`）能容错解析 JSON——但是**被动兜底**，发现错了只填占位，**不会让模型重写**。

**接入点**：
- `src/services/moaEngine.ts:346` `parseJudgeResponse` 升级为返回 `{ok, data, errors}`。
- 新增 `src/services/schemaValidator.ts`：`validateAgainstSchema(text, schema)`。
- `src/services/moaEngine.ts:424-481` `runSingleJudge` 加校验重写循环（上限 **3 次**）。
- `src/types/moa.ts:149-166` `SynthesisRequest` 加 `outputSchema?: object`。

**为何需要**：平台要产出「可入库的 JSON」，模型一次写对复杂 schema 概率不高，没有闭环就只能人工救场。

### 能力 C · 自适应 Map-Reduce 切分

**是什么**：输入大时自动切多块 → 并行 Map 抽取 → Reduce 合并；输入小时整包送。用户无感。

**Verdex 现状**：**完全没有。** Panel fan-out 是「同一问题问多个模型」，不是「同一份大文档切给多个处理单元」。

**接入点**：
- `src/types/moa.ts:107` `MoaMode = "simple" | "advanced"` → 扩成含 `"mapreduce"`。
- `MoASessionConfig`（`moa.ts:116-134`）加 `chunkSize?`、`mapPromptId?`、`reducePromptId?`、`overlap?`。
- `Turn`（`moa.ts:241-249`）加 `mapOutputs?`。
- `MoaCallbacks`（`moa.ts:284-300`）加 `onMapStage?` / `onReduceStage?`。
- `src/services/moaEngine.ts:494` `runMoaSynthesis` 加第三分支：chunk → `Promise.all` Map → Reduce。
- UI：`src/components/MoAConfigBar.tsx:117-144` 模式 2→3 态；`setMode`（`94-105`）加分支。
- 文档输入：`ChatMessage.content`（`moa.ts:29`）目前纯 string，多文件需新机制（见 §4）。

**为何需要**：未来文档「不确定规模，都要支持」。大文档**必须切分**否则必崩。

**自适应规则**：
```
输入到达 → 估算总 token
  ├─ ≤ 单模型上下文的 60% → 整包送（Map-Reduce 退化为单次调用，不浪费）
  └─ > 60% → 自动切分（chunkSize + overlap）→ 并行 Map → Reduce 合并
```

---

## 2. 数据现实 vs 模式选择

> 解释「Map-Reduce 对小文档不必要，但对平台必要」——两者不矛盾。

**格兰瑟姆样本**（首个回归测试用）：7 份 txt 合计 **74,343 字符（约 4.6 万 token）**，单份最大 1.2 万字。任意单份塞 8K 上下文绰绰有余；7 份全塞 64K-128K 无压力。难点不是切分，而是 ASR 错别字 + 口语→严格 JSON + 跨文件综合。

**平台需求**：未来文档「不确定规模，都要支持」——必然出现单份几万到几十万字的长报告/PDF/代码库，**必须切分**。

**结论**：Map-Reduce 是平台级刚需，但对小文档要自动退化。格兰瑟姆样本走整包路径不浪费；大文档走切分路径不崩。**一份代码两条路，用户无感。**

---

## 3. 三种融合深度对比（为何选原生升级）

| 维度 | 原生升级 Verdex | Verdex 不动 + 外挂脚本 |
|---|---|---|
| 能力完整度 | 最高：记忆/校验/切分/双输出全内置 | 中：脚本能做，但与 UI/会话/模板割裂 |
| 复用 Verdex 基建 | 完全复用（Provider CRUD/双协议/会话/模板/i18n/主题） | 只能复用思路，代码重写 |
| 改动面 | 大：六层 | 小：Verdex 零改动 |
| 长期维护 | 一处 | 两处（易漂移） |
| 适合 | 产品化、长期用 | 一次性任务、快速验证 |

**已定：原生升级。** 理由：要的是「平台」不是「脚本」，原生升级虽改动大，但复用 Verdex 全部基建，长期维护成本反而低于双轨。

---

## 4. 文档输入：被低估的硬骨头

> 三类能力之外的前提问题：**Verdex 现在没有「喂文档」的入口。**

**现状**：`ChatMessage.content` 纯 string（`moa.ts:29`），`SynthesisRequest.prompt` 单字符串（`moa.ts:151`），UI `ChatInput.tsx` 无附件概念。Verdex 当前只能「问问题」，不能「读文档」。

**接入方案（两层）**：
1. **数据层**：`ChatSession` 加 `attachments?: Attachment[]`（`{id, name, text, chars, source}`）。txt/md 直接读；PDF/Word 用 Tauri Rust 侧解析（`src-tauri` 已有 fs 插件）。
2. **注入层**：Map-Reduce 引擎从 `session.attachments` 取文本作 Map 输入；非 Map-Reduce 模式可选「文档拼进 prompt」。

**阶段约束**：**首版只支持 txt/md**；PDF/Word 推迟到后续阶段（需加 Rust crate 如 `pdf-extract`/`docx`，增构建复杂度）。

---

## 5. 推荐路径：5 阶段递进

每阶段独立可用、可验证、可回滚。严格按顺序，后面依赖前面。

### 阶段 1 · 多轮上下文记忆（解锁可用性）
- **目标**：连续追问不再失忆。HANDOFF 既定任务。
- **改动**：能力 A 全部。
- **交付物**：能多轮对话的 Verdex。
- **工作量**：中。

### 阶段 2 · 文档输入入口（解锁数据来源）
- **目标**：能往会话加 txt/md 文档。
- **改动**：§4 数据层 + ChatInput 附件 UI。
- **交付物**：能读文档的 Verdex（首版拼进 prompt）。
- **工作量**：中小。PDF/Word 后续。

### 阶段 3 · 自定义 schema 抽取 + 校验闭环（解锁结构化产物）
- **目标**：按用户 schema 稳定产出合法 JSON。
- **改动**：能力 B 全部 + schema 模板管理 + MD 出口渲染。
- **交付物**：能稳定产出结构化 JSON 的 Verdex。
- **工作量**：中（schema 校验 + Judge 重写循环上限 3 + 模板 CRUD + 渲染器）。
- **实证依据（2026-07-23 实测）**：阶段 2 测试中，7 份格兰瑟姆文档的输出是一大段 Markdown 文字（"### 1. ... ### 2. ..."），**不是** grantham_models.json 那种 `{思维模型:[...],因果链:[...]}` 嵌套结构。要产出可入库/可程序消费的结构化数据，阶段 3 是必经之路。**阶段 3 必须先于阶段 4**——因为 Map-Reduce 的 Map 阶段需要"每份抽成什么 schema"由阶段 3 定义。

### 阶段 4 · 自适应 Map-Reduce（解锁规模）
- **目标**：大文档自动切分并行抽取，小文档整包。
- **改动**：能力 C 全部 + 切分策略。
- **交付物**：能处理任意规模文档的通用编排平台。
- **工作量**：大（引擎第三分支 + 新回调 + Turn 新结构 + UI 三态 + 切分算法）。
- **实证依据（2026-07-23 实测）**：阶段 2 测试中，7 份文档（~7.4 万字符）一次塞进单次调用，默认 60s 超时不够（Panel 失败），需调到 180s 才跑通。**20+ 份就会彻底崩**。当前"一次塞全部"的架构（阶段 2 用法）无法扩展，阶段 4 的 Map-Reduce（每份单独抽→并行→Reduce 合并）是唯一正解。数据结构已就位：`session.attachments` 作为语料源，Map 阶段直接取。

#### 阶段 4 的架构本质：Map-Reduce = 子代理 / Fan-out 编排

阶段 4 不仅是"切分文档"，它的结构本质是 LLM Orchestration 的核心模式之一。对照工业界术语：

```
编排器（runMoaSynthesis）
  │ ① 分解（Task Decomposition）：N 份文档 → N 个子任务
  ├─ 子代理1：抽文档1 → JSON1   ┐
  ├─ 子代理2：抽文档2 → JSON2   │  Fan-out（扇出）
  ├─ ...（N 个并行）             │  Promise.all 同时发起
  └─ 子代理N：抽文档N → JSONN   ┘
  │ ② 聚合（Aggregation / Reduce）
  ▼
Reduce：合并 JSON1..N → 最终一份 JSON（跨文档去重归纳）
```

| Verdex 实现 | 工业界术语 | 说明 |
|---|---|---|
| `runMapReduce` 顶层调度 | **Orchestrator（编排器）** | 分解任务、派发、聚合的主流程 |
| 把语料拆成 N 份各处理 | **Task Decomposition（任务分解）** | 大任务拆可并行的小任务 |
| 每份文档一次 Map 调用 | **子代理 / Worker** | 独立完成一个子任务的单元 |
| `Promise.all(attachments.map(...))` | **Fan-out / Scatter** | 并行派发所有子任务（非串行） |
| Map 调用同时发出 | **Worker Pool** | 一组工人并行干活 |
| 合并所有 Map JSON | **Reduce / Aggregator** | 聚合子结果成最终产出 |

**关键事实（实测验证）**：
- **是并行，不是串行**——`Promise.all` 让 N 份文档的 Map 调用**同时发起**。用户看到 ✓ 陆续出现是因为各份大小/返回时间略有差异，但调用是同时发出的。串行要 N 倍时间，并行只要最长那份的时间。
- **Verdex 的子代理是最简形态**：同一个模型（如 DeepSeek V3）的并行调用，子任务之间不通信、用固定指令（schema）。区别于"真正的多 agent 系统"（AutoGen/CrewAI）——后者每个子代理可以是不同模型、互相通信、自主决策。Verdex 适合"批量文档抽取"这类同质并行任务。

**这套结构的复用价值**：Map-Reduce 的"分解→并行→聚合"骨架不限于文档抽取。同样的结构可用于：批量翻译、批量摘要、批量情感分析、并行检索后综合等任何"大任务可拆成同质子任务"的场景。把 `runMapReduce` 里的"Map 指令"和"Reduce 指令"换成别的，就是新的编排应用。

#### Map-Reduce 性能瓶颈分析（为什么并行了还是慢）

实测 7 份格兰瑟姆文档，Map-Reduce 总耗时约 2-3 分钟。虽然 Map 是**并行**的，整体仍慢，瓶颈来自四个层面：

**总耗时构成**：
| 阶段 | 能并行吗 | 典型耗时 | 占比 |
|---|---|---|---|
| Map（N 份抽取） | ✅ 并行 | 30-60s | ~30% |
| **Reduce（合并）** | ❌ **必须串行** | **120-180s** | **~60%** |
| 网络/调度开销 | — | 10-20s | ~10% |

**瓶颈 1 · Reduce 的串行本质（最大瓶颈）**
Reduce 要一次性读入 N 份完整 Map JSON（每份几百行 = 上万 token 输入）+ 跨文档比对/去重/归纳 + 输出一份大 JSON。这是**单次串行调用，无法并行**——合并本质要求先有全部子结果才能合。这是 Map-Reduce 范式的**固有特性**，任何实现都绕不开。

**瓶颈 2 · Map 受"最慢份"拖累**
`Promise.all` 并行，但**等所有完成**才进 Reduce。N 份里 1 份慢，整体卡在那份：
```
7 份并行发出（t=0）
  6 份 12-20s 完成 ✓
  第 7 份 45s 完成 ✓  ← 整体 Map 阶段 = 45s（最长，非平均）
```
慢份原因：文档信息密 + 生成 JSON 长（口语播客稿要"读懂+结构化"，比摘要重）。

**瓶颈 3 · 每份 Map 本身不轻**
不是"快速摘要"，是**结构化抽取**——按 schema 从 1 万字口语稿识别/提炼/组织嵌套 JSON。单份 15-30s 正常。

**瓶颈 4 · API 网关 + 网络**
硅基流动是中转网关，走代理（10808）有额外延迟。N 份并行 = N 个并发请求过代理，可能抢带宽。

#### Map-Reduce vs 单次 Extract：真实 API 基准测试（2026-07-24）

**测试方法**：`scripts/perf-test.mjs`，直接调硅基流动 DeepSeek-V3（非 UI，排除渲染开销），对比"单次 Extract（全部文档拼一起一次调用）"vs"Map-Reduce（每份并行 Map → 1 次 Reduce 合并）"。三组文档组合，相同 schema（思维模型库）+ 相同问题。

**测试数据**（真实 API 耗时）：

| 组合 | 字数 | 单次 Extract | Map-Reduce（Map + Reduce = 总） | 谁快 |
|---|---|---|---|---|
| C: 5 份 × ~1 万 | 5.3 万 | **36.0s** | Map 34.3s + Reduce 119.1s = **153.4s** | 单次快 4.3× |
| D: 7 份 × ~1 万 | 7.4 万 | **46.7s** | Map 31.2s + Reduce 186.9s = **218.2s** | 单次快 4.7× |
| F: 3 份 × ~3 万 | 9.7 万 | **34.2s** | （中断，单次已证明够快） | — |

**关键发现**：

1. **单次 Extract 远比预想强**：DeepSeek V3 处理 7.4 万字符结构化抽取只要 **47s**（之前 UI 测 150s 是渲染/流式开销，非模型本身）。9.7 万字符只要 **34s**。**大模型 + 大上下文 = 单次足够处理 10 万字符以内的抽取**。

2. **Map-Reduce 反而慢 4-5 倍**：Map 并行快（30-34s），但 **Reduce 是瓶颈**（119-187s）——"合并 N 份 JSON 去重归纳"这个任务本身比"一次读全文抽取"重得多。Reduce 慢不是技术问题，是任务复杂度问题。

3. **结论：对 DeepSeek V3 这种大上下文模型，10 万字符以内单次 Extract 又快又好，Map-Reduce 是负优化**。

**⚠️ 结论的适用边界（重要）——和模型强相关**：

上述结论**只在"大上下文大模型"成立**。换不同模型，结论可能反转：

| 模型类型 | 上下文 | 单次 Extract | Map-Reduce | 该用哪个 |
|---|---|---|---|---|
| **大模型（V3/R1/72B）** | 64K-128K token | ✅ 快（47s/7万） | ❌ 慢（Reduce 重） | **单次**（10万字符内） |
| **小模型（7B/14B/Air）** | 8K-32K token | ❌ 塞不下/超时 | ✅ 每份小调用能跑 | **Map-Reduce**（必须切分） |
| **超大语料（50+ 份/百万字）** | 任何 | ❌ 任何模型都塞不下 | ✅ 唯一选择 | **Map-Reduce**（兜底） |

**所以**：Map-Reduce 的价值在"小模型处理大语料"或"语料超过任何单模型上下文"。用 V3 这种大模型处理 10 万字符以内，单次完胜。

**对阈值的影响**：当前 auto 规则（份数≥4 或 >8万 → Map-Reduce）对 V3 太激进（强制 C/D 走慢 4-5 倍的 Map-Reduce）。应改为**只在单次真的撑不下时才 Map-Reduce**（阈值大幅提高，或按所用模型的实际上下文判断）。待据模型能力动态调整。

**对树形 Reduce 的影响**：~~树形 Reduce 是最值优化~~ **取消**。树形 Reduce 优化的是"Reduce 太慢"，但根本问题是"Map-Reduce 整体不如单次（对大模型）"。优化 Reduce 也只是 153s→~90s，还是远慢于单次 36s。**前提不成立，不做树形 Reduce**。

**保留 Map-Reduce 的定位**：从"核心能力"降级为"**极端场景兜底 + 小模型场景必需**"。代码保留，默认不触发（对大模型），只在超大语料或小模型时用。

### 阶段 5 · ASR / 数据清洗预处理（解锁数据质量，可选）
- **目标**：脏数据先清洗再提取。
- **改动**：可选的「归一化 Panel」前置步骤。
- **交付物**：对噪声数据鲁棒的 Verdex。
- **工作量**：小。对干净数据可关掉。

### 阶段工作量总览

| 阶段 | 改动层 | 文件数 | 风险 | 独立可用 |
|---|---|---|---|---|
| 1 记忆 | 类型/引擎/状态机/UI | ~5 | 低 | ✅ |
| 2 文档输入 | 类型/UI/Tauri | ~4 | 低 | ✅ |
| 3 schema 抽取 | 引擎/新工具/UI/i18n | ~5 | 中 | ✅ |
| 4 Map-Reduce | 类型/引擎/状态机/UI/i18n | ~8 | 高 | ✅ |
| 5 清洗 | 引擎/模板 | ~2 | 低 | ✅ |

---

## 6. JSON 输出结构决策：A 直做，不做 B 过渡

### 背景：A vs B

| 维度 | B 固定四段 | A 自定义 schema |
|---|---|---|
| 产出结构 | 永远 consensus/divergence/blindspots/verdict 4 字段 | 任意嵌套，用户给模板 |
| 能产 grantham_models.json 那种嵌套吗 | ❌ 只能塞 4 个文字桶 | ✅ 按模板产 |
| 本质角色 | 综合器（多视角压扁成总结） | 抽取器（素材→固定结构） |
| 可入库/可程序消费 | 弱 | 强 |
| 需要校验闭环吗 | 不需要 | **必须** |
| 用户门槛 | 零 | 中（要选/写 schema） |
| 阶段 3 工作量 | 小 | 中 |
| 典型场景 | 「几个模型谁说得对」 | 「把文档抽成结构化数据」 |

### 决策：选 A，不做 B 过渡

理由：
1. 平台要产 `grantham_models.json` 那种任意嵌套结构 → **B 做不到**。
2. → 核心路径必须 A。
3. 但 **B 是 A 的特例**（模板设成四段 + 不校验，A 跑出来就是四段裁决）。所以选 A **不丢失** Verdex 现有能力。
4. 「B 过渡」对当前用户无价值：典型任务是文档抽取不是开放辩论；预置模板可消除 A 的门槛。
5. → **四段裁决降级为 A 的第一个预置 schema 模板**，继承现有 `parseJudgeResponse` + 四段 prompt 代码，零额外成本。

**一句话**：直接做 A；四段裁决当 A 的默认模板保留，不单独做、不删、不过渡。

---

## 7. 预置 schema 模板

**原则**：覆盖最可能遇到的几类任务，而非越多越好。首批交付 2 个，其余列为可扩展。

| 模板 | 解决什么 | 状态 | 结构骨架（示意） |
|---|---|---|---|
| **四段裁决** | 多模型综合/辩论（继承 Verdex） | 首版交付（默认） | `{consensus, divergence, blindspots, verdict}` |
| **思维模型库** | 抽方法论（格兰瑟姆类） | 首版交付 | `{模型:[{名称,定义,关键数据{},应用规则}], 因果链:[...], 交易模型:[...]}` |
| 要点清单 | 最通用抽重点 | 后续可扩展 | `{主题, 要点:[{要点,依据,来源}], 待办:[...]}` |
| 表格抽取 | 研报财务表/对比表 | 后续可扩展 | `{标题, 列:[字段], 行:[{字段:值}]}` |
| 实体关系 | 传记/新闻/卷宗 | 后续可扩展 | `{实体:[{名称,类型,属性{}}], 关系:[{主体,关系,客体}]}` |

**设计约束**：
1. **模板可编辑**：用户能改字段名、加字段。复用 Verdex 现有 TemplatesModal CRUD 模式。
2. **用户能自建全新模板**：不限于预置。
3. **存储位置**：`config.json` 新增 `extractSchemas` 域（与 `roleTemplates`/`judgePrompts` 并列），单一真相源；`ConfigFile` 类型 + `config.template.json` + `normalizeConfigShape` 三处同步。
4. **首版只交付前 2 个**，避免阶段 3 工作量爆炸。

---

## 8. MD 出口渲染：分层策略

> 用户要求：中间全程 JSON；MD 仅在出口（导出时）从 JSON 派生，**不持久化 MD**。

### 分层架构

```
导出 MD 时
   │
   ▼
第一层：通用结构自适应渲染器（默认）
  按 JSON 结构自动转 MD：对象→标题层级 / 数组→列表或表格 / 叶子→键值
  覆盖 ~90% 场景，零成本、零延迟、可离线
   │ 能处理 → 直接输出 MD ✅
   │ 不在默认范围 / 渲染效果差
   ▼
第二层：AI 针对性渲染（兜底）
  把 JSON + 导出意图喂给模型，生成针对性 MD
   │
   ▼ 输出 MD ✅
```

### 为何分层
1. 默认渲染器覆盖 90%，零成本可离线——规则结构（四段、思维模型库）完全够。
2. AI 兜底处理长尾——大量自由文本排版、特殊格式（双栏、表格嵌套）通用规则做不好。
3. 符合「省调用」原则——不是每次导出都调 AI，只有默认搞不定才调。

### AI 兜底的硬约束（必须遵守）
**最危险点**：AI 渲染可能顺手「润色」或漏字段，导致 MD 和 JSON 不一致。

→ **约束**：
1. AI 兜底 prompt 明确「**只改排版、不改内容、不漏字段，严格基于给定 JSON**」。
2. 渲染后做**字段覆盖校验**：JSON 里每个键在 MD 里都要能找到对应；否则视为渲染失败，回退通用渲染器或报错。
3. AI 只动格式不动内容，且有校验守门。

### 实现位置
- 通用渲染器：新增 `src/services/mdRenderer.ts`（纯函数，JSON→MD）。
- AI 兜底：复用现有 `streamChat`，加一个 `renderMdWithAI(json, intent)`。
- 触发点：用户点「导出 MD」按钮时调用，结果直接下载，**不写回 config.json、不进会话历史**。

---

## 9. ASR / 数据清洗策略

格兰瑟姆样本的 ASR 噪声（Grantham 一名 4 种写法、208→2008、Kistone→Keystone）是真实问题。

| 选项 | 做法 | 优 | 缺 |
|---|---|---|---|
| 编排时顺手清洗 | 加「实体归一化」Panel 前置 | 一体化 | 增复杂度 |
| 先单独清洗再编排 | 一次专门调用修错别字存干净版 | 清晰可复查 | 多一步人工 |
| 不清洗硬扛 | 直接喂原文 | 最快 | 跨文件综合时名字对不上 |

**推荐**：阶段 5 做「编排时顺手清洗」作为**可选**前置 Panel（对干净数据关掉）。理由：通用平台不能假设输入干净，但也不能强制清洗——做成开关最灵活。格兰瑟姆样本验证这道工序。

---

## 10. 风险清单与开放问题

### 风险
| 风险 | 等级 | 缓解 |
|---|---|---|
| 引擎复杂度上升（三分支 + 校验循环 + 切分） | 高 | 分阶段、每阶段加 Vitest 测试 |
| UI 膨胀（模式 2→3 态 + 附件 + 模板 + 清洗开关） | 中 | 渐进式，高级选项折叠 |
| PDF/Word 解析引入 Rust crate | 中 | 首版只 txt/md |
| 摘要压缩多一次 API 调用 | 低 | 可配开关 + 缓存 |
| AI 兜底渲染改内容 | 中 | 「只改排版」约束 + 字段覆盖校验 |

### 开放问题（已决策）
1. ✅ 阶段顺序：1→2→3→4→5
2. ✅ PDF/Word：首版只 txt/md
3. ✅ Judge 重写上限：3 次
4. ✅ JSON 结构：A 直做，四段当默认模板
5. ✅ 格式：中间 JSON，出口 MD，不持久化 MD

---

## 11. 附：Verdex 关键接入点速查表

> 行号基于基线 commit `1591da9`。

| 能力 | 文件 | 行号 | 改什么 |
|---|---|---|---|
| **A 记忆** | `types/moa.ts` | 149-166 | `SynthesisRequest` 加 `panelHistory?`/`judgeHistory?` |
| | `hooks/useMoa.ts` | 601-608 | history 拍平逻辑改为按 providerId 重建并传入引擎 |
| | `hooks/useMoa.ts` | 762-767 | `SynthesisRequest` 构造处注入历史 |
| | `services/moaEngine.ts` | 214-218 | Panel messages 插入历史 |
| | `services/moaEngine.ts` | 439-448 | Judge messages 插入历史 |
| **B schema** | `services/moaEngine.ts` | 346-402 | `parseJudgeResponse` 升级返回 `{ok,data,errors}` |
| | `services/moaEngine.ts` | 424-481 | `runSingleJudge` 加校验重写循环（上限 3） |
| | 新文件 `services/schemaValidator.ts` | — | 新增 schema 校验工具 |
| | `types/moa.ts` | 149-166 | `SynthesisRequest` 加 `outputSchema?` |
| | `services/configStore.ts` + `config.template.json` | 33-44 / 全文 | 加 `extractSchemas` 域 |
| | `components/SettingsModal.tsx` | 383, 456-479, 507 | 加 schema 模板 tab |
| **C Map-Reduce** | `types/moa.ts` | 107 | `MoaMode` 加 `"mapreduce"` |
| | `types/moa.ts` | 116-134 | `MoASessionConfig` 加 chunk/map/reduce 字段 |
| | `types/moa.ts` | 241-249 | `Turn` 加 `mapOutputs?` |
| | `types/moa.ts` | 284-300 | `MoaCallbacks` 加 `onMapStage?`/`onReduceStage?` |
| | `services/moaEngine.ts` | 494-573 | `runMoaSynthesis` 加第三分支 |
| | `components/MoAConfigBar.tsx` | 94-105, 117-144 | 模式 3 态 + setMode 分支 |
| **文档输入** | `types/moa.ts` | 29, 259-270 | `ChatSession` 加 attachments |
| | `components/ChatInput.tsx` | — | 附件按钮 + 列表 |
| | `src-tauri/src/lib.rs` | — | 文件读取插件（txt/md 首版） |
| **MD 渲染** | 新文件 `services/mdRenderer.ts` | — | 通用 JSON→MD 自适应渲染器 |
| | `services/moaEngine.ts` 或新文件 | — | `renderMdWithAI` 兜底 + 字段覆盖校验 |
| **通用** | `i18n/en.json` `zh.json` | 全文 | 新字符串成对加，保持镜像 |

---

## 12. 一句话总结

> Verdex 是一台好车，但只有一档。给它加变速箱（多轮记忆）、ABS（自定义 schema + 校验闭环）、涡轮（Map-Reduce 并行）、油箱盖（文档输入），它就从「单轮多模型综合工具」升级成「任意文档 → 结构化产物」的通用编排平台。**JSON 选 A 直做、四段当默认模板、中间 JSON 出口 MD**；改动可控、分 5 阶段递进、每阶段独立可用。格兰瑟姆样本作为首个回归测试。

---

*评估文档版本 1.0 · 2026-07-23 · 基线 commit `1591da9` · 进度见 HANDOFF.md*
