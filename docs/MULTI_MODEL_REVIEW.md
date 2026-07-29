# 多模型架构评审评估

> 基于 GPT/Gemini/DeepSeek/KIMI/QWEN/GLM 六个模型对 Verdex 架构方向的评审讨论（2026-07-29）。
> 本文档从 Verdex 实际代码出发评估这些讨论的结论，而非理论推演。

---

## 0. 讨论来源

- 文件：`修正判断Graphify 对 Verdex 到底有没有价值.md`
- 参与模型：DeepSeek、Gemini、GPT、KIMI 2.6、QWEN 3.8、GLM
- 讨论 6 轮，从"Graphify 价值评估"演变为"Verdex 知识计算架构"

---

## 1. 六个模型达成的核心共识（3 条）

| 共识 | 说明 | Verdex 代码现状 |
|---|---|---|
| **Claim 不是 Concept** | 模型对名词（Transformer）不会分歧，对命题（Transformer 比 RNN 更适合长距离依赖）才会分歧。直接影响 IR 设计。 | ❌ 当前 KnowledgeAsset 是 flat 结构，没有 Claim 层级 |
| **IR 是资产，格式是 Adapter** | Knowledge IR（内部知识表示）是核心壁垒，SKILL.md/MCP/RAG 只是导出格式。 | ✅ 已实现：KnowledgeAsset 内部格式 + 4 种导出器 |
| **Benchmark 必须带单模型基线** | 不跟单模型对比，无法证明多模型的价值。 | ❌ 没有 Benchmark，没有单模型基线 |

---

## 2. GLM 的清醒警告（最值得重视）

GLM 是唯一一个"不奖励抽象"的评审者。核心观点：

### "5 个 AI 打 9/10 = 同一个奖励函数跑了 5 次"

LLM 会奖励抽象，因为抽象听起来深刻。讨论越来越漂亮 ≠ 越来越接近可执行的产品。

### "Verdex 是 2 人项目，不是博士论文"

讨论在谈"知识计算基础设施""对抗 LLVM 的 IR""沉淀可信知识资产"——这是 Google/Meta 级别、几十人几年的目标。

### "丢掉了之前最重要的发现"

之前讨论确定的 Verdex 不火的根本原因：**生态位 + 分发 + 定位**（book-to-skill 火因为它挂上了 Agent Skills 标准的顺风车 + 命中高频痛点 + 传播点清晰）。

六轮架构讨论**完全抛弃了分发和定位**，一头扎进架构理论。这是严重的退步。

---

## 3. 基于 Verdex 实际代码的评估

### 讨论中的概念 vs 代码现状

| 概念 | 代码状态 | 差距分析 |
|---|---|---|
| Panel（多模型并行） | ✅ 已实现 | — |
| Judge（综合裁决） | ✅ 已实现 | 但只做文本对比，没做根因分析 |
| Consensus/Divergence/Blindspots | ✅ 已实现 | JudgeResponse 四段 |
| KnowledgeAsset（IR 雏形） | ✅ 已实现 | 缺 Evidence/Claim 层级 |
| Asset 导出器 | ✅ 已实现 | Claude Skill/MD/JSON/Verdex Native |
| Knowledge Vault | ✅ 已实现 | 独立仓库 + 分类 + 搜索 + 引用 |
| AI 推荐 | ✅ 已实现 | 关键词匹配 |
| Claim 层级 | ❌ 未实现 | 当前是 flat JSON，不是 Claim-based |
| Evidence Trace | ❌ 未实现 | 当前只有 sources（文件名列表），没有证据引用 |
| Synthesizer + Arbitrator 分离 | ❌ 未实现 | 当前 Judge 是单步 |
| Trace Dump（中间产物保存） | ⚠️ 部分 | Judge raw 已保存，但 Panel raw 只存会话内 |
| Benchmark | ❌ 未实现 | 最关键的缺失 |
| 单模型基线对比 | ❌ 未实现 | 验证多模型价值的前提 |
| Root Cause Analysis（根因仲裁） | ❌ 未实现 | 当前 Judge 只做文本综合 |

### 已验证的能力（实测数据）

- 多模型 Panel + Judge：✅ 可跑通，四段裁决产出正常
- document_analysis（三阶段链路）：✅ 先提取再分析再综合
- Knowledge Asset 打包+导出：✅ SKILL.md 可被 Claude 识别
- Map-Reduce：✅ 实现但实测对大模型是负优化（单次优先）
- 单模型多步骤：✅ document_analysis 支持单模型跑三阶段

---

## 4. Graphify 框架对 Verdex 的价值评估

### 不值得引入的

| Graphify 能力 | 为什么不值得 |
|---|---|
| AST 解析引擎（40 种语言 tree-sitter） | Verdex 处理文档/知识，不处理代码结构 |
| 图查询语言（path/explain/query） | Verdex 不需要图查询 |
| NetworkX 图数据库 | JSON 存储已够用 |
| 社区检测（Leiden 聚类） | Verdex 用 AI 分类，不需要图算法 |

### 有启发但不需要代码的

| Graphify 思想 | Verdex 如何吸收 |
|---|---|
| 复杂对象 → 可计算中间表示 | 已实现：文档 → KnowledgeAsset → 导出 |
| 多平台分发 | 已规划：Claude Skill/Copilot/MCP 等 Adapter |
| Skill 安装流程（AI 自动识别） | 已实现：SKILL.md 带 frontmatter name+description |

### 最终判断

**Graphify 的具体代码对 Verdex 无用。它的抽象思想已经被吸收。不需要引入任何代码。**

---

## 5. Verdex 的核心假设（需要验证的）

所有讨论最终归结为两个核心假设：

### 假设 A：结构化多步骤优于单次回答

```
单模型一次回答（1× 成本）
  vs
单模型多步骤 extract→analyze→judge（3× 成本）
  vs
多模型 Panel+Judge（4× 成本）
```

**Verdex 支持全部三种模式**（taskType + 单模型降级）。关键是验证哪种在什么场景下最优。

### 假设 B：产出的知识可以复用

- 如果用户每次还是重新问 Claude → Knowledge Asset 没有意义
- 如果用户复用了导出的 Skill → 假设成立

---

## 6. 下一步优先级（基于全部讨论 + 代码现状）

### P0：平台测试和梳理（当前最紧急）

在加任何新功能前，必须先确保现有平台稳定可用：
- 全面测试三种任务类型（document_extract/analysis/quick_qa）
- 测试 Knowledge Vault 全部功能
- 测试导出（Claude Skill/MD/JSON）
- 修复发现的 bug
- 更新所有文档

### P1：建立 Benchmark（所有模型都同意的最高优先）

- 收集 10-20 个真实案例
- 每个案例跑：单模型 vs 单模型多步骤 vs 多模型+Judge
- 保存所有中间产物（Trace Dump）
- 对比：覆盖率/幻觉率/可追溯性/用户完成时间

### P2：Trace Dump 增强

- 每次 Panel/Judge 完整输出都持久化保存
- 为未来"Schema 涌现"积累数据
- 记录：输入材料/Prompt 版本/模型版本/温度/输出/成本/延迟

### P3：消费端验证

- 先锚定 Claude Skill 导出做到极致
- 验证"Verdex 产出的 Skill 真的被 Claude 用了"
- 再考虑其他 Adapter

### 不做（现在）

- ❌ Knowledge IR v1 Schema（等数据涌现）
- ❌ Synthesizer + Arbitrator 分离（等 Judge 质量验证）
- ❌ Evidence→Inference→Claim→Decision 链路（过度设计）
- ❌ Graphify 代码引入
- ❌ 继续理论讨论（已经讨论够了）

---

## 7. 三条不可违背的设计原则（六模型共识）

1. **Claim 是知识的最小原子**（不是 Concept，不是 Node）—— 未来 IR 要基于此
2. **IR 是资产，格式是衣服**（Skill/MCP 只是 Adapter）—— 已实现
3. **Schema 是实验的产物，不是设计的产物**（先跑 Pipeline，后抽象结构）—— 必须遵守

---

## 8. 一句话总结

> 六轮讨论的最大价值不是产出了什么 IR Schema，而是收敛到一个清醒的结论：**停止理论推演，回到 Benchmark 验证。** Verdex 已经有了完整的 Pipeline（三阶段 + Knowledge Vault + 导出），下一步不是设计更漂亮的 IR，而是用真实数据证明这个 Pipeline 到底有没有价值。

---

*评估文档版本 1.0 · 2026-07-29*
