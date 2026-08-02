# 已完成功能清单

> v0.2.2 · 全部 ✅ 验证通过（88/88 测试 · tsc 0 · build OK）
> 最后更新：2026-08-02

## 核心编排

| 模块 | 文件 | 说明 |
|---|---|---|
| **三阶段架构（taskType）** | types/moa.ts, moaEngine.ts, useMoa.ts | document_extract / document_analysis / quick_qa |
| **多轮记忆（滑窗）** | services/memoryBuilder.ts | 每 Panel/Judge 独立历史，滑窗 N 轮 |
| **分层摘要记忆** | services/summarizer.ts | 超限时调模型压缩早期对话（con.txt 四类） |
| **文档输入** | services/fileReader.ts | txt/md 浏览器 file input |
| **Schema 抽取** | services/schemaValidator.ts | verdict/extract 双模式 + 3次重写循环 |
| **Map-Reduce** | services/mapreduceStrategy.ts | 自适应触发（单次优先） |
| **ASR 清洗** | services/cleaner.ts | 附件加载时修错别字 |
| **document_analysis** | hooks/useMoa.ts send | 先提取→多模型分析→Judge综合 |

## 步骤式配置栏（2026-07-29 重构）

| 功能 | 文件 | 说明 |
|---|---|---|
| 5 步引导流程 | components/MoAConfigBar.tsx | ❶任务→❷文档→❸结构→❹分析→❺选项 |
| 条件显示 | 同上 | 按 taskType 显示/隐藏步骤 |
| 高级折叠区 | 同上 | 角色模板 + 对撞策略折叠 |
| 删除简单/高级 | 同上 | 用高级折叠替代旧 mode toggle |

## Knowledge Vault（5 阶段全部完成）

| 阶段 | 文件 | 说明 |
|---|---|---|
| **1. 独立仓库** | components/VaultView.tsx + Sidebar.tsx | 侧边栏独立入口 + 浏览/搜索 |
| **2. 多选引用** | MoAConfigBar + useMoa.ts | referenceAssetIds + Panel 注入 |
| **3. AI 分类** | services/assetClassifier.ts | 自动/批量/手动分类 + 模型选择 |
| **4. AI 推荐** | services/assetRecommender.ts + ChatInput.tsx | 输入时实时推荐 chips |
| **5. 编辑+追踪** | VaultView.tsx + useMoa.ts | 编辑名称/描述/标签 + 引用追踪 |
| **筛选+排序** | VaultView.tsx | 任务类型筛选 + 最新/最旧/名称排序 |

## Knowledge Asset

| 功能 | 文件 | 说明 |
|---|---|---|
| 类型定义 | types/moa.ts | KnowledgeAsset + AssetCategory + AssetExportFormat |
| 打包 | services/assetPacker.ts | packVerdictAsset / packExtractAsset / packFromTurn |
| 4 种导出器 | services/exporters/index.ts | Claude Skill / Markdown / JSON / Verdex Native |
| 导出按钮 | components/AssetExportButton.tsx | 对话内导出 + 保存到资产 |
| 持久化 | configStore.ts + useMoa.ts | config.json 的 knowledgeAssets + assetCategories |
| 自动保存 | MoAConfigBar.tsx | 开关 + send 完成后自动打包 |

## 体验改进

| 功能 | 文件 | 说明 |
|---|---|---|
| ⏱ 运行计时 | hooks/useElapsed.ts + components/TurnTimer.tsx | 每秒 tick |
| 🛑 Stop 按钮 | httpClient.ts | streamChat 加 externalSignal（AbortController） |
| 📊 阶段进度 | components/MapReduceMessage.tsx | Map X/N + Reduce 状态 |
| 📋 复制为 MD | services/jsonToMd.ts | extract/mapreduce 结果旁按钮 |

## 基础设施

| 功能 | 文件 | 说明 |
|---|---|---|
| .env 配置 | services/envConfig.ts | VITE_ 前缀，双 Provider |
| 语言过滤 | services/templateFilter.ts | 中英文模板按语言显示 |
| 模板管理 | SettingsModal.tsx | Schemas tab（Assets tab 已移到 Vault） |
| 帮助文档 | HelpModal.tsx | 三阶段 + 配置 + 核心流程 + 适用场景 |
| 预置 Provider 清空 | config.template.json | providers=[] 只靠 .env 种子 |
| 欢迎页 | App.tsx EmptyState | 图标+标题，无示例噪音 |

## 引擎核心（moaEngine.ts）

- Promise.all 并发 Panel（永不 reject）
- Panel 单次重试（瞬态错误）
- Judge 校验重写循环（extract 模式 3 次）
- Map-Reduce 早期分支
- Map-Reduce 分支 aborted 检查
- outputKind 路由（verdict/extract）
- document_analysis 阶段1提取 → 阶段2 Panel → 阶段3 Judge
- **空响应重试**（v0.2.2）：一个返回空流的 Panel 现在会触发一次重试（BUG #2 修复）

## P0 Bug 修复（v0.2.2）

| 修复 | 文件 | 说明 |
|---|---|---|
| **导出字段错位** | services/assetPacker.ts | `packExtractAsset` 现在能识别 extract 数据里的四字段 verdict 形状并正确拆分取值（而不是把四个字段全部拼成一坨）；+3 个回归测试 |
| **导出冗余区段** | services/exporters/index.ts | 当 Markdown / Claude-Skill 导出器中 "Structured Data" 区段与四个 verdict 字段重复时，跳过该区段；+1 个回归测试 |
| **Panel 空响应重试** | services/moaEngine.ts | `runPanel` 在空完成时也会重试（不只是抛错时才重试）—— 针对 benchmark 中观察到的系统性空响应问题 |

## Benchmark 测试架（P1）

| 功能 | 文件 | 说明 |
|---|---|---|
| **5-mode benchmark** | scripts/benchmark.ts | M1 单次 / M1R +重试 / M2 单模型流水线 / M3 多模型 Panel+Judge / M4 单模型自我批判；驱动真实引擎 |
| **运行模式** | 同上 | `npm run bench`（增量 M1R+M4）/ `--full`（全部 5 种）/ `--remediate`（只重跑 M2+M3） |
| **语料库** | bench-samples/ | 13 个 cases（EN summary + 7 篇 zh-TW ASR + 3 篇大文档 + 1 篇超大 + 1 篇多文档）；可替换为其他领域 |
| **盲评打分包** | scripts/extract-grading.ts | 为每个 case 生成 A/B 文件供 LLM/人工盲评；A/B→mode 映射保存在 quality-grading-key.json |
| **工程报告** | 独立论文仓库（+CN） | 可复现报告："Structured Task Decomposition Improves Reliability of LLM-Based Knowledge Analysis" |
| **过程档案** | docs/HANDOFF/BENCHMARK_JOURNEY_CN.md | P0→P1 工作的完整时间顺序记录，含发现的 bug 和外部评审 |

## 协议适配（httpClient.ts）

- OpenAI / Anthropic 双协议
- SSE 流式 + 非流式回退
- Base URL 规范化
- 外部 cancel signal（Stop 按钮）
