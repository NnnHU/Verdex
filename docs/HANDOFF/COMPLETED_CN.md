# 已完成功能清单

> v0.1.3 · 全部 ✅ 验证通过（84/84 测试 · tsc 0 · build OK）
> 最后更新：2026-07-29

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

## 协议适配（httpClient.ts）

- OpenAI / Anthropic 双协议
- SSE 流式 + 非流式回退
- Base URL 规范化
- 外部 cancel signal（Stop 按钮）
