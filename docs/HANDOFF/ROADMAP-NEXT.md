# 下一步计划

> 全部可选，无阻塞项。按优先级排列。

## 🔴 战略方向：Knowledge Asset 架构

**Verdex 从"多模型编排平台"升级为"The compiler for reusable AI knowledge"。**

核心思路：把推理过程（Extract → Reasoning → Judge）沉淀成可复用的 Knowledge Asset。Skill（SKILL.md）只是其中一种导出格式，不是内部核心。

- 详见 [`../KNOWLEDGE_ASSET_ARCHITECTURE.md`](../KNOWLEDGE_ASSET_ARCHITECTURE.md)
- 实现分三步：① 最小验证（导出 SKILL.md）② Knowledge Asset 抽象 ③ 仓库化+内部复用
- 未来分支：轻量版（单模型消费端，类比 book-to-skill 的使用端）

## 🟡 待优化（体验类）

1. **mapreduce 模式 Panel 置灰** — document_analysis 时 Panel 控制更精细
2. **Map 失败单份重试** — 目前失败只标 ✗，无重试按钮
3. **Map 阶段逐字流式** — 目前完成才显 card，大文档干等
4. **单附件内部切分** — 50 万字大文件按段落切分（现在只按附件数判断）

## 🟢 扩展能力

5. **PDF/Word 支持** — 需 Rust crate（pdf-extract/docx），首版只 txt/md
6. **会话搜索** — 会话多了找不到
7. **IndexedDB 替代 localStorage** — localStorage 5MB 上限
8. **动态阈值** — 按模型上下文自动调整 Map-Reduce 触发线

## 🔵 架构扩展（详见 THREE_STAGE_ARCHITECTURE.md §9）

9. **阶段间人工审核** — 用户检查阶段1产出再决定进阶段2
10. **模型动态分配** — 根据子任务类型自动选模型
11. **阶段间缓存** — 阶段1结果缓存，改问题不重新提取
12. **任务类型自定义** — 用户自建流水线模板
13. **Python 代码执行**（Code Interpreter）— 精确计算/可视化/严格 JSON 校验，详见 THREE_STAGE_ARCHITECTURE.md §9 未来扩展

## ⚪ 原作者审计遗留（刻意保留，不影响功能）

- extractAnthropicSystem 的 system 双发（httpClient.ts，潜伏 bug 非现行）
- DEFAULT_JUDGE_SYSTEM_PROMPT 降级为 const（无外部消费者）
- toggleSidebar/clearError 未 memoize（性能可忽略）
- App.tsx SettingsModal 两处挂载（维护隐患非 bug）
