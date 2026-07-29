# 下一步计划

> 全部可选，无阻塞项。按优先级排列。
> 最后更新：2026-07-29

## 🔴 P0：平台全面测试（进行中）

用户正在端到端测试现有平台。测试发现的问题优先修复。

覆盖范围：
- 三种任务类型（document_extract/analysis/quick_qa）
- Knowledge Vault 全部功能
- 导出（Claude Skill/MD/JSON）
- 配置栏步骤式流程
- 体验功能（计时/Stop/进度/复制MD）

## 🔴 战略方向：验证核心假设

详见 [`../MULTI_MODEL_REVIEW_CN.md`](../MULTI_MODEL_REVIEW_CN.md)

两个必须验证的假设：
1. 结构化多步骤（extract→analyze→judge）是否比单次回答产出更好？
2. 产出的知识资产是否可复用？

## 🟡 P1：Benchmark

- 收集 10-20 个真实案例
- 单模型 vs 单模型多步骤 vs 多模型+Judge
- 保存所有中间产物（Trace Dump）
- 对比：覆盖率/幻觉率/可追溯性

## 🟡 P2：Trace Dump

- Panel/Judge 完整输出持久化
- 为 IR Schema 涌现积累数据

## 🟢 P3：消费端验证

- Claude Skill 导出做到极致
- 验证"Verdex 产出的 Skill 被 Claude 实际使用"

## 🔵 Knowledge Vault 后续（设计文档已标注 🔜）

- 临时分组（AI 跨分类组织）
- 按来源/时间范围筛选
- 资产编辑 categories（当前通过📁单独操作）

## 🔵 扩展能力

- PDF/Word（需 Rust crate）
- 会话搜索
- IndexedDB 替代 localStorage
- 动态阈值

## 🔵 架构扩展（详见各设计文档）

- Python 代码执行（THREE_STAGE_ARCHITECTURE_CN.md §9）
- MCP Server（KNOWLEDGE_ASSET_ARCHITECTURE_CN.md）
- 轻量版（KNOWLEDGE_ASSET_ARCHITECTURE_CN.md §6）
- 阶间人工审核 / 模型动态分配 / 阶段缓存

## ⚪ 原作者审计遗留（刻意保留）

- Anthropic system 双发（潜伏 bug）
- DEFAULT_JUDGE_PROMPT 降级
- toggleSidebar/clearError 未 memoize
- SettingsModal 重复挂载

## ❌ 明确不做

- Knowledge IR Schema 设计（等数据涌现）
- Graphify 代码引入（思想已吸收）
- Synthesizer + Arbitrator 分离（等验证）
- Evidence→Inference→Claim→Decision 链路（过度设计）
