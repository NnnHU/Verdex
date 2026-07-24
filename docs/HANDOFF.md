# Verdex 交接文档

> 写给一个**完全没有上下文的新会话**。读完这份文档，你应该能接手继续开发。
> 最后更新：2026-07-24 · 版本 v0.1.3 · 所有功能完成并验证通过

---

## 一、我们在做什么

**Verdex** 是一个纯本地端、无服务器的**三阶段文档智能编排平台**，技术栈是 Tauri 2.0 + React 18 + TypeScript + Tailwind v4。

### 核心定位

从文档中提取结构化知识，运行多模型分析，并综合结果。三种任务类型：

| 任务 | 做什么 | 流程 |
|---|---|---|
| 📄 文档提取 | 文档 → 结构化 JSON | 文档 → [清洗] → Schema 提取 → JSON |
| 📊 文档分析 | 先提取再深度分析 | 阶段1提取 → 阶段2多模型分析 → 阶段3 Judge综合 |
| 💬 快速问答 | 多模型回答问题 | 问题 → Panel并行 → Judge四段裁决 |

### 技术原则
- **拒绝第三方 AI 框架**（LangChain/AutoGen），调度逻辑全部原生 TS `Promise.all`
- **纯本地**：API 请求从用户设备直接发送，不上传任何数据
- **OpenAI 兼容**：支持任何 OpenAI 兼容 API（DeepSeek/Qwen/Groq 等）+ Anthropic 原生协议

### 关键概念
- **taskType**（session 级）：document_extract / document_analysis / quick_qa，决定走哪条链路
- **outputKind**（引擎内部）：verdict / extract，JudgeSpec 和 parseJudgeResponse 用
- **Panel（专家）**：多个模型并行分析
- **Judge（裁决）**：综合 Panel 结果的模型
- **Schema（提取结构）**：文档提取的目标 JSON 结构模板
- **Map-Reduce**：大文档自动切分并行提取+合并（单次优先，超大才触发）

---

## 二、已完成的功能（全部 ✅ 验证通过）

### 核心编排能力

| 模块 | 文件 | 说明 |
|---|---|---|
| **多轮记忆（滑窗）** | `services/memoryBuilder.ts` | 每 Panel/Judge 独立历史，滑窗 N 轮，会话级开关 |
| **分层摘要记忆** | `services/summarizer.ts` | 超限时调模型压缩早期对话（con.txt 四类），持久化到 session.summary |
| **文档输入** | `services/fileReader.ts` | txt/md 浏览器 file input，会话级附件，为 Map-Reduce 铺路 |
| **Schema 抽取** | `services/schemaValidator.ts` | verdict/extract 双模式 Judge，轻量校验+3次重写循环 |
| **Map-Reduce** | `services/mapreduceStrategy.ts` | 每份文档并行 Map → Reduce 合并，自适应触发（单次优先） |
| **ASR 清洗** | `services/cleaner.ts` | 附件加载时修错别字，会话级开关默认关 |
| **document_analysis** | `hooks/useMoa.ts` send | 先提取→多模型分析→Judge综合（三阶段完整链路） |

### 三阶段架构（taskType 替代 outputMode）
- **types/moa.ts**：`taskType` 替代旧 `outputMode`；`outputKind` 解耦引擎内部
- **向后兼容**：normalizeSessionConfig 映射老 outputMode → taskType
- **单模型降级**：只有 1 个 Provider 时隐藏 Panel/Judge/角色（极简配置栏）
- **配置按执行阶段排序**：任务 → 提取结构 → 专家 → 裁决+分析风格
- **互斥显示**：提取结构只在文档任务显示，分析风格只在分析/问答显示
- 详见 `docs/THREE_STAGE_ARCHITECTURE.md`

### 体验改进
- **⏱ 运行计时**：`hooks/useElapsed.ts` + `components/TurnTimer.tsx`
- **🛑 Stop 按钮**：`httpClient.ts` streamChat 加 externalSignal（AbortController），引擎透传+aborted检查
- **📊 阶段进度**：MapReduceMessage Map X/N + Reduce 状态
- **📋 复制为 MD**：`services/jsonToMd.ts`，extract/mapreduce 结果旁按钮

### 基础设施
- **.env 配置**：`services/envConfig.ts`，VITE_ 前缀，支持双 Provider（PROVIDER + PROVIDER2）
- **.env 种子注入**：首次启动自动填充 Provider（config.json 不存在时）
- **语言过滤**：`services/templateFilter.ts`，中英文模板按界面语言显示
- **模板管理**：Settings → 📋 Schemas tab，4 个预置 Schema（en/zh 各 2）
- **帮助文档**：HelpModal 全面更新（三阶段 + 配置说明 + 核心流程 + 适用场景）

### 数据指标
- **65/65 测试全过**
- **tsc 零错误**
- **build 成功**
- **已 push GitHub**（commit `5a22c55`，tag `v0.1.3`）

---

## 三、当前状态

**所有计划功能已完成并验证通过。v0.1.3 已发布（GitHub Release，Actions 自动构建二进制）。**

### Git 状态
```
5a22c55 release: v0.1.3
12bbf08 docs: ROADMAP 一致化
9f048a9 docs: HANDOFF 更新
a4ff5aa docs: Python 未来扩展
...
1591da9 (原作者基线)
```

### 文件结构
```
Verdex/
├── docs/
│   ├── HANDOFF.md              ← 本文件（接手向）
│   ├── ORCHESTRATION_ROADMAP.md ← 路线图（已完成）
│   └── THREE_STAGE_ARCHITECTURE.md ← 三阶段架构设计
├── src/
│   ├── components/   ChatInput, MoAConfigBar, SettingsModal, HelpModal,
│   │                 JudgeMessage, MapReduceMessage, JsonCardRenderer,
│   │                 TurnTimer, PanelCollapseGroup, Sidebar, UserMessage
│   ├── hooks/        useMoa, useElapsed
│   ├── services/     moaEngine, httpClient, configStore, envConfig,
│   │                 memoryBuilder, summarizer, fileReader, cleaner,
│   │                 schemaValidator, mapreduceStrategy, jsonToMd,
│   │                 templateFilter
│   ├── types/        moa.ts（单一真相源）
│   └── i18n/         en.json, zh.json（250 key 对称）
├── test/             6 文件 65 测试
├── scripts/          perf-test.mjs, test-clean.mjs
├── src-tauri/        Rust 后端（http + fs 插件）
└── .env / .env.example  本地配置（git-ignore .env）
```

---

## 四、下一步计划（全部可选，按优先级）

### 🟡 待优化（体验类）
1. **mapreduce 模式 Panel 置灰**——document_analysis 时 Panel 控制更精细
2. **Map 失败单份重试**——目前失败只标 ✗，无重试按钮
3. **Map 阶段逐字流式**——目前完成才显 card，大文档干等
4. **单附件内部切分**——50 万字大文件按段落切分（现在只按附件数判断）

### 🟢 扩展能力
5. **PDF/Word 支持**——需 Rust crate（pdf-extract/docx），首版只 txt/md
6. **会话搜索**——会话多了找不到
7. **IndexedDB 替代 localStorage**——localStorage 5MB 上限
8. **动态阈值**——按模型上下文自动调整 Map-Reduce 触发线

### 🔵 架构扩展（记录在 THREE_STAGE_ARCHITECTURE.md §9）
9. **阶段间人工审核**——用户检查阶段1产出再决定进阶段2
10. **模型动态分配**——根据子任务类型自动选模型
11. **阶段间缓存**——阶段1结果缓存，改问题不重新提取
12. **任务类型自定义**——用户自建流水线模板
13. **Python 代码执行**（Code Interpreter）——详见 THREE_STAGE_ARCHITECTURE.md §9 未来扩展

### ⚪ 原作者审计遗留（刻意保留，不影响功能）
- extractAnthropicSystem 的 system 双发（httpClient.ts，潜伏 bug 非现行）
- DEFAULT_JUDGE_SYSTEM_PROMPT 降级为 const（无外部消费者）
- toggleSidebar/clearError 未 memoize（性能可忽略）
- App.tsx SettingsModal 两处挂载（维护隐患非 bug）

---

## 五、踩过的坑（⚠️ 绝对不要再踩）

### 🔴 坑 1：React Hooks 规则——early return 必须在所有 hooks 之后
**症状**：黑屏崩溃。
**根因**：`App.tsx` 里 `if (!moa.loaded) return (...)` 放在 `useEffect` 之前 → hooks 数量变化 → React 崩溃。
**铁律**：所有 `useEffect`/`useRef`/`useState`/`useCallback` 必须在任何 `if (...) return` **之前**无条件执行。

### 🔴 坑 2：bash 子进程里 `%APPDATA%` 不展开
**症状**：用 `cmd /c "if exist %APPDATA%\..."` 查文件永远 NOT_FOUND。
**根因**：bash 不认 Windows cmd 的 `%VAR%` 语法。
**正确做法**：用正斜杠全路径 `ls "C:/Users/k/AppData/Roaming/com.verdex.app/config.json"`，或 `echo $APPDATA`。

### 🔴 坑 3：Tauri 2 的 fs 权限要用 `fs:allow-appdata-*`
**症状**：fs 写盘静默失败，config.json 不生成。
**根因**：`fs:allow-read-file` 等通用权限默认 scope 为空。
**正确配置**（`src-tauri/capabilities/default.json`）：用 `fs:allow-appdata-read/write/meta`。

### 🔴 坑 4：端口 1420 占用导致 tauri dev 启动失败
**症状**：`Error: Port 1420 is already in use`。
**处理**：`netstat -ano | grep ":1420" | grep LISTENING` 找 PID → `cmd //c "taskkill /F /PID <pid>"`。
**注意**：`taskkill /F` 在 bash 里要用 `cmd //c "taskkill ..."`（`/F` 会被 bash 误判为路径）。

### 🔴 坑 5：Vite env 变量改了必须重启 dev server
**症状**：改了 `.env` 的超时/阈值但没生效。
**根因**：Vite 的 `import.meta.env` 是构建时注入，HMR 不会重新读取 `.env`。
**正确做法**：改 `.env` 后停 server → 重启 → 浏览器刷新。

### 🔴 坑 6：outputMode 混了两个维度（已修复）
**症状**：用户分不清 Verdict/Extract/Map-Reduce 什么关系。
**根因**：outputMode 混了 session 级（3 值含 mapreduce）和引擎级（2 值 verdict/extract）。
**修复**：拆成 taskType（session 级 3 值）+ outputKind（引擎级 2 值），解耦。

### 🔴 坑 7：Map-Reduce 对大模型是负优化（实测发现）
**症状**：7 份文档走 Map-Reduce 比 Extract 慢 4-5 倍。
**根因**：大模型（V3）单次处理 10 万字符只要 36-47s，而 Reduce 合并要 119-187s。
**修复**：阈值改为"单次优先"（>15 万字符或单份超大才触发 Map-Reduce）。
**详见**：`docs/ORCHESTRATION_ROADMAP.md` 性能分析节 + `scripts/perf-test.mjs`。

### 🔴 坑 8：cleanAttachment 闭包时序 bug
**症状**：勾选清洗+挂文件后「已清洗」标记不出现。
**根因**：cleanAttachment 从闭包 sessions 读附件，但 addAttachments 刚更新 sessions 还没反映到闭包。
**修复**：cleanAttachment 接受 sourceText 参数，handleAddFiles 直接传 a.text。

### 🔴 坑 9：预置假 Provider 污染界面
**症状**：每次新会话显示 Llama/Qwen/DeepSeek/Claude 四个空 key 假模型。
**修复**：config.template.json providers 改为空数组 `[]`，只靠 .env 种子注入。

---

## 六、快速接手指南

### 读代码顺序（建议）
1. `src/types/moa.ts` — 所有数据结构，单一真相源
2. `src/services/moaEngine.ts` — 调度逻辑（runMoaSynthesis 核心入口）
3. `src/hooks/useMoa.ts` — 状态机（send 函数是核心）
4. `src/components/MoAConfigBar.tsx` — 配置栏 UI（taskType 路由）
5. `docs/THREE_STAGE_ARCHITECTURE.md` — 三阶段架构设计

### 验证环境
```bash
cd C:\Users\k\Documents\project\no\lufei\Verdex
npm install
npx tsc --noEmit       # 零错误
npm test               # 65 passed
npm run dev            # 浏览器 http://localhost:1420
```

### .env 配置
```
VITE_VERDEX_PROVIDER_*    = 第一模型（如 DeepSeek V3）
VITE_VERDEX_PROVIDER2_*   = 第二模型（如 DeepSeek R1，多模型分析用）
VITE_VERDEX_REQUEST_TIMEOUT_MS = 360000（大文档+Reduce 需要）
```

### 关键文档
| 文档 | 用途 |
|---|---|
| `docs/HANDOFF.md` | 本文件——接手向 |
| `docs/ORCHESTRATION_ROADMAP.md` | 路线图+性能基准+架构分析 |
| `docs/THREE_STAGE_ARCHITECTURE.md` | 三阶段架构设计+未来扩展 |

---

*v0.1.3 · 2026-07-24 · 所有功能完成并验证通过 · 已 push GitHub*
