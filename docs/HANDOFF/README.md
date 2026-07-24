# Verdex 交接文档

> 写给一个**完全没有上下文的新会话**。读本文件 + 按需查看子文档，即可接手开发。
> v0.1.3 · 2026-07-24 · 所有功能完成并验证通过

---

## Verdex 是什么

纯本地端、无服务器的**三阶段文档智能编排平台**（Tauri 2.0 + React 18 + TS + Tailwind v4）。

三种任务类型：
- 📄 **文档提取**：文档 → 结构化 JSON（Schema 抽取）
- 📊 **文档分析**：先提取 → 多模型分析 → Judge 综合（三阶段完整链路）
- 💬 **快速问答**：问题 → 多模型并行 → Judge 四段裁决

关键概念：`taskType`（session 级路由）、`outputKind`（引擎内部 verdict/extract）、Panel（专家）、Judge（裁决）、Schema（提取结构）、Map-Reduce（大文档兜底）。

技术原则：拒绝第三方 AI 框架，纯原生 TS `Promise.all` 调度；纯本地不联网。

## 当前状态

**所有功能已完成并验证通过。** v0.1.3 已发布（GitHub Release + Actions 自动构建）。
- 65/65 测试全过 · tsc 零错误 · build 成功 · 已 push GitHub

## 文档索引

| 文档 | 用途 |
|---|---|
| **[COMPLETED.md](./COMPLETED.md)** | 已完成功能清单（7 大模块 + 文件位置） |
| **[ROADMAP-NEXT.md](./ROADMAP-NEXT.md)** | 下一步计划（按优先级，全部可选） |
| **[PITFALLS.md](./PITFALLS.md)** | ⚠️ 踩过的坑（9 个，绝对不要再踩） |
| [../ORCHESTRATION_ROADMAP.md](../ORCHESTRATION_ROADMAP.md) | 路线图 + 性能基准 + 架构分析（已完成的路线图） |
| [../THREE_STAGE_ARCHITECTURE.md](../THREE_STAGE_ARCHITECTURE.md) | 三阶段架构设计 + 未来扩展（Python 等） |

## 快速接手

### 读代码顺序
1. `src/types/moa.ts` — 数据结构（单一真相源）
2. `src/services/moaEngine.ts` — 调度逻辑（runMoaSynthesis 核心）
3. `src/hooks/useMoa.ts` — 状态机（send 函数核心）
4. `src/components/MoAConfigBar.tsx` — 配置栏 UI（taskType 路由）
5. `docs/THREE_STAGE_ARCHITECTURE.md` — 三阶段架构设计

### 验证环境
```bash
cd C:\Users\k\Documents\project\no\lufei\Verdex
npm install && npx tsc --noEmit && npm test && npm run dev
```

### .env 配置
```
VITE_VERDEX_PROVIDER_*    = 第一模型（DeepSeek V3）
VITE_VERDEX_PROVIDER2_*   = 第二模型（DeepSeek R1，多模型用）
VITE_VERDEX_REQUEST_TIMEOUT_MS = 360000
```

config.json 位置：`%APPDATA%\com.verdex.app\config.json`（用正斜杠路径访问，见 PITFALLS.md 坑 2）。
