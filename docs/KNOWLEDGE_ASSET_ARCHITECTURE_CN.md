# Knowledge Asset 架构设计

> Verdex 从"多模型编排平台"升级为"The compiler for reusable AI knowledge"的设计方向。
> 把推理过程沉淀成可复用、可导出、可追溯的知识资产；Skill 只是其中一种导出格式。
>
> 文档版本：0.1（设计讨论稿）· 2026-07-28 · 状态：方向确认，未开始实现

---

## 0. 核心洞察

### 借鉴的不是 book-to-skill，是 Skill 这个抽象

book-to-skill 最成功的不是"PDF → Skill"，而是：

```
Knowledge → Executable Skill
```

Skill 本身不是知识，它是：
```
Knowledge + When to use (description) + How to use (instruction) + How to load (按需)
```

### Verdex 应该做的是另一件事

不是 `Document → Skill`，而是：

```
Evidence → Reasoning → Knowledge Asset
```

Verdex 的资产链：
```
Conversation / Document
    ↓
Reasoning（Extract → Multi-model Analysis → Judge）
    ↓
Knowledge Asset（持久化、可复用、可导出）
```

### 为什么不是直接做 Skill

企业里越来越多的资料**根本没有一本书**：
- 会议纪要、设计讨论、ADR、RFC
- 竞品分析、行业报告、客户需求

这些资料产出的不是"书的知识摘要"，而是**"一群人/多个模型对证据推理后的结论资产"**——即 **Reasoning Skill**。

---

## 1. Knowledge Asset：内部核心抽象

**不叫 Skill，叫 Knowledge Asset（或 Knowledge Module）。**

内部格式不被任何外部标准绑住。Skill 只是其中一种导出格式。

```
                Knowledge Asset（Verdex Native 内部格式）
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    Claude Skill    Copilot Skill    MCP Resource
         │              │              │
     Markdown          JSON           HTML
```

**设计原则**：内部模型不被外部标准限制。Skill 放在 Exporter 层，不是内部存储。

---

## 2. 四阶段架构（Stage 4 是新增）

现有三阶段 + 新增 Stage 4：

```
Stage 1: Extract（提取证据）
Stage 2: Reasoning（多模型推理）
Stage 3: Judge（综合裁决）
Stage 4: Knowledge Packaging（新增）
  ├─ Metadata（名称、描述、触发条件）
  ├─ Evidence（原始证据索引，可追溯）
  ├─ Consensus（多模型共识）
  ├─ Divergences（保留的分歧）← Verdex 独有
  ├─ Blindspots（Judge 发现的盲点）← Verdex 独有
  ├─ Decision Tree（决策树/推理链）
  ├─ Triggers（何时使用此知识）
  └─ Source Trace（来源追溯）
       ↓ Package
  ↓ Exporter（按需导出）
  ├─ Claude Skill（SKILL.md + chapters/）
  ├─ Copilot Skill
  ├─ MCP Resource
  ├─ Markdown（人可读）
  ├─ JSON（机器可读）
  ├─ HTML
  └─ Verdex Native（内部复用）
```

**Stage 1-3 代码全部保留，Stage 4 是新增的打包层。**

---

## 3. Verdex vs book-to-skill：本质差异

| 维度 | book-to-skill | Verdex |
|---|---|---|
| **编译的是什么** | 一本书（静态、结构稳定） | 整个推理过程（动态、多视角） |
| **谁做分解** | 单一宿主 AI | 多模型 Panel + Judge 综合 |
| **Skill 特点** | 单一视角的框架提炼 | 多模型共识 + 保留分歧 + 盲点 |
| **独有产出** | — | Divergences（分歧）+ Blindspots（盲点）|
| **定位** | Book → Skill Compiler | Reasoning → Knowledge Asset Compiler |
| **资产复用** | 导出后离开工具 | Verdex 内部可复用 + 导出给外部 |

**Verdex 的差异化护城河**：Divergences 和 Blindspots 是 book-to-skill 给不了的——它们是多模型架构的独有产物。

---

## 4. 定位升级

| 阶段 | 定位 | 用户标签 |
|---|---|---|
| 原始 | 多模型裁判综合引擎（MoA） | "又一个聊天客户端" |
| 当前 | 三阶段文档智能编排平台 | 自造词，用户搜不到 |
| **目标** | **The compiler for reusable AI knowledge** | "把推理过程变成可复用知识资产" |

**多模型只是手段（Stage 2），知识资产化才是定位和护城河（Stage 4）。**

---

## 5. Asset 复用的两种路径

### A. 导出给外部工具（Exporter 路径）
- 导出成 Claude Skill → Claude Code 里用 `/my-research-asset` 查询
- 导出成 MCP Resource → Cursor/Copilot 里调用
- 导出成 Markdown → 人读 / 粘贴到别处

### B. Verdex 内部复用（Native 路径）——长期护城河
- 下次分析新文档时，调用已有 Knowledge Asset 作为参考
- 用户积累的 Asset 越多，Verdex 越有价值（网络效应）
- book-to-skill 没有这个（skill 生成后离开工具）

**建议先做 A（导出，接生态红利），再做 B（内部消费，长期黏性）。**

---

## 6. 未来分支：轻量版（Knowledge Asset Consumer）

### 定位区分

| 版本 | 角色 | 类比 | 模型 | 场景 |
|---|---|---|---|---|
| **Verdex（单机版）** | Knowledge Asset **工厂** | book-to-skill 的生产端 | 多模型（Panel+Judge） | 有多模型 API，要生产知识资产 |
| **轻量版** | Knowledge Asset **消费端** | book-to-skill 的使用端 | 单一模型（如本地模型） | 只想查询/使用已打包的知识 |

### 轻量版做什么

单机版生产的 Knowledge Asset 导出后，轻量版**装载并按需查询**：

```
用户在轻量版里：
  /grantham-investment-models 均值回归
    ↓
轻量版加载对应的 Knowledge Asset（按需，~5K token）
    ↓
单一模型从 Asset 的真实内容回答（不瞎编）
```

### 轻量版的技术特点

- **单模型**（甚至本地模型如 Ollama），不需要多模型 API
- **轻量**（Web 版或轻量桌面，不需要 Tauri Rust 后端）
- **按需加载**（只加载用户查询的那部分 Asset，不是全量）
- **零生产成本**（不调多模型，只调一个模型回答）

### 两个版本的关系

```
Verdex 单机版（生产端）
  ├─ 多模型 API 调用（贵，但质量高）
  ├─ 三阶段推理 → Knowledge Asset
  ├─ 导出标准格式（Claude Skill / Copilot Skill / MCP / Markdown）
  │
  └─ 导出的 Asset 可被以下消费：
     ├─ Claude Code / Copilot CLI / Cursor（通过 Agent Skills 标准）
     ├─ Verdex 轻量版（通过 Verdex Native 格式）
     └─ 任何支持标准格式的工具
```

**这是 book-to-skill 的"生产端 + 使用端"模式，但 Verdex 版本的"生产端"是多模型的，产出的 Asset 质量更高（含共识/分歧/盲点）。**

---

## 7. 与现有代码的距离

现有三阶段（Stage 1-3）完整。Stage 4 Packaging 需要：

| 新增 | 说明 |
|---|---|
| **数据结构** | `KnowledgeAsset` 类型（metadata + evidence + consensus + divergences + blindspots + triggers + sources） |
| **打包服务** | `services/assetPacker.ts`（把 Judge 产出打包成 KnowledgeAsset） |
| **导出器** | `services/exporters/`（claude-skill.ts / markdown.ts / json.ts / mcp-resource.ts） |
| **管理 UI** | Knowledge Asset 管理界面（列表/查看/编辑/导出/删除） |
| **持久化** | Asset 存 config.json 或独立文件 |
| **内部复用** | Panel 引用已有 Asset 作参考（Stage 5） |

**Stage 1-3 完全不动，纯新增 Stage 4。改动量中等。**

---

## 8. 实现路线（建议分三步）

### 步骤 1：最小验证（1-2 周）
- document_analysis 结束后，额外导出一个标准 SKILL.md 到本地
- description 让 Judge 顺手生成
- 验证"Verdex 产物能被 Claude 识别"

### 步骤 2：Knowledge Asset 抽象（2-4 周）
- 设计 KnowledgeAsset 内部格式
- 把共识/分歧/盲点固化进 Asset（这是 Verdex 独有的）
- 实现 Markdown / JSON / Claude Skill 导出器

### 步骤 3：仓库化 + 内部复用（长期）
- Verdex 内 Asset 管理（列表/编辑/删除/导出）
- Panel 引用已有 Asset 作参考
- 轻量版原型（单模型消费端）

---

## 9. 设计决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 内部格式 | Knowledge Asset（非 Skill） | 不被外部标准绑住，Skill 只是 Exporter |
| 多模型定位 | 手段（Stage 2），不是终极价值 | 终极价值是 Stage 4 的 Knowledge Asset |
| 与 book-to-skill 关系 | 借鉴 Skill 抽象，不做"书→Skill" | Verdex 编译的是推理过程，不是一本书 |
| 差异化护城河 | Divergences + Blindspots | book-to-skill 给不了的多模型独有产出 |
| 先做导出还是内部复用 | 先导出（接生态红利）再内部复用 | 导出能立即破圈 |
| 轻量版 | 作为未来分支 | 单模型消费端，类比 book-to-skill 的使用端 |

---

## 10. 一句话定位

> **book-to-skill 编译一本书。Verdex 编译整个推理过程。**
>
> 书只是输入之一。未来会议、RFC、代码库、需求、邮件、论文、对话，都可以进入同一条流水线，产出可复用、可导出、可追溯的 Knowledge Asset。Skill 只是其中一种导出格式。
>
> 未来轻量版（单模型消费端）让这些 Asset 在任何工具里按需使用。

---

*设计文档版本 0.1 · 2026-07-28 · 方向确认，待详细设计后进入实现*
