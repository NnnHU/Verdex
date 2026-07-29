# Verdex 交接文档

> 写给一个**完全没有上下文的新会话**。读本文件 + 按需查看子文档，即可接手开发。
> v0.1.3 · 2026-07-29 · 核心功能 + Knowledge Vault 全部完成

---

## Verdex 是什么

纯本地端、无服务器的**知识精炼引擎**（Tauri 2.0 + React 18 + TS + Tailwind v4）。

三种任务类型：
- 📄 **文档提取**：文档 → 结构化 JSON（Schema 抽取）
- 📊 **文档分析**：先提取 → 多模型分析 → Judge 综合（三阶段完整链路）
- 💬 **快速问答**：问题 → 多模型并行 → Judge 四段裁决

**Knowledge Vault**（独立知识仓库）：资产浏览/搜索/分类/引用/导出/编辑。

## 当前状态

**所有核心功能 + Knowledge Vault 5 阶段全部完成。84/84 测试通过。**

### 紧急待办：平台全面测试和梳理
在加任何新功能前，必须先全面测试现有平台：
1. 三种任务类型（document_extract/analysis/quick_qa）端到端测试
2. Knowledge Vault 全部功能（浏览/搜索/分类/引用/导出/编辑）
3. 导出验证（Claude Skill/MD/JSON/Verdex Native）
4. 修复发现的 bug
5. 更新所有文档

### 下一步（测试完成后）
- P1: 建立 Benchmark（单模型 vs 多模型对比）
- P2: Trace Dump（中间产物持久化）
- P3: 消费端验证（Claude Skill 实际使用）
- 不做: IR Schema 设计（等数据涌现）、Graphify 代码引入

详见 [MULTI_MODEL_REVIEW.md](../MULTI_MODEL_REVIEW.md)

## 文档索引

| 文档 | 用途 |
|---|---|
| [COMPLETED.md](./COMPLETED.md) | 已完成功能清单 |
| [ROADMAP-NEXT.md](./ROADMAP-NEXT.md) | 下一步计划 |
| [PITFALLS.md](./PITFALLS.md) | ⚠️ 踩过的坑（9 个） |
| [../KNOWLEDGE_VAULT_DESIGN.md](../KNOWLEDGE_VAULT_DESIGN.md) | 知识仓库设计（5 阶段全部完成） |
| [../KNOWLEDGE_ASSET_ARCHITECTURE.md](../KNOWLEDGE_ASSET_ARCHITECTURE.md) | Knowledge Asset 战略方向 |
| [../THREE_STAGE_ARCHITECTURE.md](../THREE_STAGE_ARCHITECTURE.md) | 三阶段架构 + 未来扩展 |
| [../MULTI_MODEL_REVIEW.md](../MULTI_MODEL_REVIEW.md) | 六模型架构评审评估（含优先级） |
| [../ORCHESTRATION_ROADMAP.md](../ORCHESTRATION_ROADMAP.md) | 编排路线图（已完成） |

## 快速接手

### 读代码顺序
1. `src/types/moa.ts` — 数据结构（单一真相源）
2. `src/services/moaEngine.ts` — 调度逻辑
3. `src/hooks/useMoa.ts` — 状态机
4. `src/components/MoAConfigBar.tsx` — 配置栏
5. `src/components/VaultView.tsx` — 知识仓库
6. `docs/MULTI_MODEL_REVIEW.md` — 架构评审和下一步

### 验证环境
```bash
cd C:\Users\k\Documents\project\no\lufei\Verdex
npm install && npx tsc --noEmit && npm test && npm run dev
```
Node 路径：`/c/Users/k/AppData/Roaming/nvm/v24.13.1`

### .env 配置
```
VITE_VERDEX_PROVIDER_*    = 第一模型
VITE_VERDEX_PROVIDER2_*   = 第二模型（多模型用）
VITE_VERDEX_REQUEST_TIMEOUT_MS = 360000
```

## 核心数据指标
- 84/84 测试全过
- tsc 零错误
- build 成功
- 已 push GitHub（commit 至 `8f10591`，后续提交未 push）
