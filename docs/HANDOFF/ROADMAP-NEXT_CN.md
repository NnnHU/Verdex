# 下一步计划

> 在 P0 + P1 完成并经过外部评审后，于 2026-08-02 修订。各项优先级已
> 被 benchmark 发现重塑 —— 结论是如何得出的见
> [BENCHMARK_JOURNEY_CN.md](./BENCHMARK_JOURNEY_CN.md)，可复现报告见
> 工程报告（见独立论文仓库，待发布）。

---

## ✅ 已完成

### P0 —— 平台全面测试（完成，v0.2.2）
- T1–T7 功能测试全部通过。
- 修复了测试中发现的 2 个 bug：导出字段错位、Panel 空响应重试。
- 88/88 测试通过。

### P1 —— Execution Benchmark（完成）
- 在一个 13-case 语料库上的 5-mode benchmark 测试架（M1/M1R/M2/M3/M4）。
- **可靠性发现：** 任务分解把成功率从 31% 提到 92%；单靠重试只加 +8 pts；任务分解才是驱动因素。
- **质量发现：** 多模型 Panel+Judge 在 accuracy/coverage/overall/hallucination 上胜过单模型流水线（盲评双 LLM 评分，7/7 评分者一致，人工锚点 3/3 一致）。
- 产物：`scripts/benchmark.ts`、工程报告（独立论文仓库）、`docs/HANDOFF/BENCHMARK_JOURNEY_CN.md`。

---

## 🔴 战略转向（来自 benchmark + 外部评审）

Benchmark 改变了 Verdex 经过验证的价值主张。我们证实过的一切都是关于
**Execution**（可靠性、任务分解、多模型质量）的 —— 被测的没有任何一项是
关于**Knowledge Representation**（IR / Skill）的。下面的路线图正反映了这
一点：接下来做执行理解，知识表示则推迟到我们弄清楚什么东西值得被表示
之后。

---

## 🟡 P2 —— 执行理解（下一步）

理解流水线*为什么*赢，而不只是它*赢了*。

- **Trace 审视：** 分析补救后的 traces，刻画每个 mode *在何时* 失败，以及
  任务分解*改变了失败模式的什么*。
- **失败分类学：** 空响应 vs 解析失败 vs 拒绝 vs 低质但合法 —— 任务分解
  到底修复了哪一种？
- **Extract 步骤健壮性：** extract 预处理阶段有很高的空响应率
  （即便 4× 重试，仍有 6/13 个 cases 失败）。调查根因（prompt 结构？
  流式？模型行为？）—— 这既是一个研究问题，也是一个产品缺陷。
- **Judge 输入混杂变量消解：** M2 vs M3 里那个仅剩的混杂变量（M3 的
  Judge 收到 2 份分析，M2 的收到 1 份）。跑隔离实验：给 M2 的 Judge 喂
  两份相同的单模型分析。

## 🟢 P3 —— 真实用户 Benchmark（验证感知价值）

Benchmark 已经在*客观*质量上证明了 M3 > M2。悬而未决的问题
（ChatGPT 的提法）是：**用户能否感知到那 +0.9 的质量差距？** 如果不能，
那么不管 benchmark 分数多高，多模型在商业上的价值都是零。

- 招募 ~20 位用户做一项被试间（between-subjects）任务研究。
- 随机分配 M2 vs M3 输出；测量：完成时间、所需修订次数、追问数量、
  复制/采纳行为、陈述偏好。
- 选用能映射到商业价值的指标，而不仅仅是客观质量。
- 需要用户招募（取决于 owner 的能力）—— 先做设计，再评估可行性。

## 🔵 P4 —— Knowledge Representation（推迟）

只有在 P2/P3 确认了*什么*值得持久化之后才进行。

- Knowledge IR schema 设计（等待执行理解的数据涌现）。
- Skill / MCP 导出加固（消费端校验）。
- Benchmark 展示了"什么产生了价值"；这一阶段决定"从这些价值里要保存
  什么"。

## ⚪ 维护 / 已知问题

- **Extract 空响应**（产品缺陷）：6/13 个 benchmark cases 在 4× 重试后
  extract 仍返回空。它影响真实用户，不只是 benchmark。根因调查归入 P2，
  但一个临时止损（非流式回退？prompt 改写？）可能值得更早动手。
- **原作者审计遗留**（刻意保留）：Anthropic system 双发、DEFAULT_JUDGE_PROMPT
  降级、toggleSidebar/clearError 未 memoize、SettingsModal 重复挂载。

## ❌ 明确不做（目前）

- Knowledge IR Schema 设计（等 P2/P3 数据）。
- Graphify 代码引入（思想已吸收）。
- Synthesizer + Arbitrator 分离（等验证）。
- Evidence→Inference→Claim→Decision 链路（过度设计）。
- 在没有数据的情况下继续架构理论讨论（benchmark 正是它的解药 —— 见
  MULTI_MODEL_REVIEW_CN.md §8）。
