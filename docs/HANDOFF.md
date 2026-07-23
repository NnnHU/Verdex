# Verdex 交接文档

> 写给一个**完全没有上下文的新会话**。读完这份文档，你应该能接手继续开发。
> 最后更新：2026-07-24（全部 5 阶段 + ASR 清洗 + 体验三件套完成；整条路线图走完）

---

## 一、我们在做什么

**Verdex** 是一个纯本地端、无服务器的**多模型裁判综合引擎（MoA）**桌面客户端，技术栈是 Tauri 2.0 + React 18 + TypeScript + Tailwind v4。

核心理念：让多个 AI 模型并行作答（Panel 层），再由裁判模型综合出结构化的四段裁决（共识/碰撞/盲点/裁决）。**拒绝任何第三方 AI 框架**（LangChain/AutoGen），调度逻辑全部用原生 TS 的 `Promise.all` 实现。

项目从零构建，经历了多轮迭代。当前处于**功能基本完整、准备做多轮上下文记忆**的阶段。

---

## 二、已完成的功能（全部已实现并验证通过）

### 架构与基础设施
- ✅ Tauri 2.0 + Vite + React 18 + TS + Tailwind v4 完整工程
- ✅ Rust 后端注册 `http` + `fs` 两个插件（`src-tauri/src/lib.rs`）
- ✅ Vitest 单元测试框架，26 个纯函数测试（`test/` 目录）
- ✅ 应用图标（`src-tauri/icons/`，由 `scripts/gen-icon.mjs` 生成）

### MoA 调度引擎（`src/services/moaEngine.ts`）
- ✅ `Promise.all` 并发调用 Panel 模型（每个 panel 独立 try/catch，resolve 为结果对象，永不 reject → **防失血**）
- ✅ Judge 综合输出四段结构化 JSON（consensus/divergence/blindspots/verdict）
- ✅ **Panel 单次重试**（瞬态错误 800ms 后重试 1 次；401/403 等鉴权错误不重试）
- ✅ **Judge 失败降级**：裁判失败时展示各 Panel 原始回答（降级视图）
- ✅ **熔断器** `checkInputLimits`：prompt > 8000 字符或累计上下文 > 32000 字符时拒绝
- ✅ **预检跳过**：Panel 的 `maxContextChars` 不足时跳过（`onPanelSkipped` 回调）
- ✅ 60ms 节流刷新（panel + judge 两套 buffer）

### 协议适配（`src/services/httpClient.ts`）
- ✅ **OpenAI / Anthropic 双协议**：同一 `streamChat` 入口，按 `protocol` 字段切换
  - OpenAI: `/chat/completions` + `Bearer` + `choices[0].delta.content`
  - Anthropic: `/v1/messages` + `x-api-key` + system 提取到顶层 + `content_block_delta`
- ✅ SSE 流式 + 非流式自动回退
- ✅ **Base URL 规范化** `normalizeBase`：去尾斜杠、去 `/chat/completions` 后缀、Anthropic 智能 `/v1` 去重
- ✅ Tauri（Rust-origin fetch，绕过 CORS）/ 原生 fetch 双路径
- ✅ **`testProvider`**：发 `max_tokens=1` 极小探测请求，验证 URL/Key/model 正确性

### 配置持久化（`src/services/configStore.ts` + `config.template.json`）
- ✅ **明文 config.json** 存在 Tauri `appDataDir`（Windows: `%APPDATA%\com.verdex.app\config.json`）
- ✅ 含全部数据：providers（含 API Key 明文）+ 角色模板 + Judge 提示词 + 会话历史 + currentSessionId
- ✅ **可读模板文件** `config.template.json`（provider 用稳定可读 id 如 `llama-3.3-70b`）
- ✅ 浏览器 dev 兜底（localStorage）+ 旧 5-key localStorage 一次性迁移
- ✅ 异步加载 + 防抖 600ms 写盘

### UI 组件（`src/components/`）
- ✅ **Sidebar**：会话历史列表（新建/重命名/删除）+ 底部「🎭 提示词模板」「⚙️ 模型设置」入口
- ✅ **MoAConfigBar**：会话级配置栏 —— 简单/高级模式切换 + Panel 多选（高级模式可挂角色）+ Judge 选择（单选/多选对撞）+ 提示词选择
- ✅ **SettingsModal**：Provider CRUD（name/model/baseUrl/apiKey/protocol）+ **🔌 测试连接**（并发探测 + 绿/红标记）+ **点外部不关闭**
- ✅ **TemplatesModal**：角色模板 + Judge 提示词模板 CRUD + 点外部不关闭
- ✅ **JudgeMessage**：四段式裁决卡片（共识蓝/碰撞橙/盲点紫/裁决高亮）+ 多 Judge 时显示 judgeLabel
- ✅ **PanelCollapseGroup**：并行 Panel 状态卡（含 skipped 状态 + 角色标签）
- ✅ **ChatInput**：自适应高度 + Ctrl/Cmd+Enter 发送 + running 时硬锁

### 状态机（`src/hooks/useMoa.ts`）
- ✅ 四套独立持久化域：providers / roleTemplates / judgePrompts / sessions
- ✅ 会话 CRUD + 模板 CRUD（删除时清理所有会话引用）
- ✅ 异步加载（loaded 状态 + loading 屏）
- ✅ 模式分层：简单（原流程）/ 高级（角色化 + 单 Judge 或多 Judge 对撞）

### 内置默认数据（`moaEngine.ts` 导出 + `config.template.json`）
- ✅ 4 个默认 Provider（Llama/Qwen/DeepSeek/Claude，API Key 空）
- ✅ 5 个中性角色模板（批判性审视/结构化拆解/实证核查/魔鬼代言人/第一性原理）—— **不含政治/商业刺客剧本**
- ✅ 3 个 Judge 提示词模板（默认四段/严格逻辑审计/多视角综合）

---

## 三、代码审计记录（2026-07-12 全量审计）

三路并行审计（services/types、useMoa、UI 组件）已完成。发现并修复了以下问题：

### 已修复的 Bug
1. **Anthropic 流式缺 `stream: true`**（`httpClient.ts` prepareAnthropic）— Anthropic 协议的 `streamBody` 没有在 body 里带 `"stream": true`，导致 SSE 解析全部静默失败，每次都走非流式回退。已修复：streamBody 现在含 `stream: true`，nonStreamBody 不含。
2. **SettingsModal `runTests` 缺 try/finally**（`SettingsModal.tsx`）— testProvider 抛错时 `testing` 永远不会重置为 false，按钮卡死在"测试中…"。已用 try/finally 包裹。
3. **SettingsModal 重开时 `testing` 不重置**（`SettingsModal.tsx`）— 重开 modal 的 useEffect 只清 testResults 不清 testing。已修复：同时清 testing。
4. **`collisionJudgePromptIds` 不清理**（`MoAConfigBar.tsx`）— 删 Judge / 切策略 / 切模式时碰撞提示词数组不截断，导致 stale entries 累积。已修复：toggleJudge/selectSingleJudge/setMode/策略切换都清理。

### 已清理的死代码
- `DEFAULT_PANEL_ROLES`（moaEngine.ts）— 完全冗余于 config.template.json，已删除。Panel 角色模板现在**唯一真相源是 config.template.json**。
- `ProviderCapabilities.streaming`（types/moa.ts）— 定义了但从未被任何代码读写，已删除。只保留 `maxContextChars`。
- `onPanelsComplete` no-op 回调（useMoa.ts）— 传了个空函数给引擎，已移除。
- `normalizeSessionConfig` 冗余谓词 `&& cfg.judgeIds !== undefined`（useMoa.ts）— `Array.isArray(x)` 为真时 x 不可能 undefined，已简化。
- `removeProvider` 的 `_dropped` 未用绑定（useMoa.ts）— computed-key 解构留的 unused var，已改为显式遍历删除。

### 已知的低优先级问题（审计发现但刻意保留）
- **`extractAnthropicSystem` 的 system 双发**（httpClient.ts:165-167）— 当所有输入都是 system 消息时，system 文本会同时作为顶层 `system` 参数和注入的 user 消息出现（重复）。引擎当前不会传全-system 输入，所以是潜伏 bug 非现行。修复：注入 user 时如果用了 system 内容，应清空返回的 system。
- **`DEFAULT_JUDGE_SYSTEM_PROMPT` 现在是 `const`（不再 export）** — 原来的 export 无外部消费者，已降级。`DEFAULT_JUDGE_PROMPTS` 仍 export（useMoa 用其 `[0]?.id` 做 fallback）。
- **`toggleSidebar`/`clearError` 未 memoize**（useMoa.ts）— 每次渲染返回新闭包，与 API 其余 useCallback 风格不一致。性能影响可忽略。
- **App.tsx 中 SettingsModal/TemplatesModal 在两个分支重复挂载**（无 session 分支 + 有 session 分支）— 维护隐患非运行时 bug。

---

## 四、当前卡在哪 / 未完成

> ⚠️ **新会话接手请先读 [`ORCHESTRATION_ROADMAP.md`](./ORCHESTRATION_ROADMAP.md)**
>
> 2026-07-23 重新评估后，"多轮上下文记忆"已不再是孤立单点任务，而是并入了一个更大的方向：**把 Verdex 从「单轮 MoA 综合引擎」原生升级为「通用多文档编排平台」**。完整路线图、决策依据、接入点行号、风险清单全在那份文档里。本节只做摘要 + 进度标记。

### 🎯 总方向：LLM 编排能力原生融合（5 阶段递进）

| 阶段 | 解锁什么 | 状态 |
|---|---|---|
| **1a · 多轮上下文记忆（滑窗版）** | 可用性（连续追问不失忆） | ✅ 已完成（2026-07-23：tsc 0 错、36/36 测试、build 通过） |
| **1b · 分层摘要记忆** | 中期摘要压缩（替代滑窗截断） | ✅ 已完成（2026-07-24：tsc 0 错、63/63 测试、build 通过） |
| **2 · 文档输入入口（txt/md）** | 数据来源（往会话喂文档） | ✅ 已完成（2026-07-23：tsc 0 错、44/44 测试、build 通过） |
| **3 · 自定义 schema 抽取 + 校验闭环** | 稳定产出结构化 JSON | ✅ 已完成（2026-07-23：tsc 0 错、54/54 测试、build 通过） |
| **4 · 自适应 Map-Reduce** | 处理任意规模文档 | ✅ 已完成（2026-07-24：tsc 0 错、63/63 测试、build 通过） |
| **5 · ASR / 数据清洗（可选开关）** | 脏数据鲁棒性 | ✅ 已完成（2026-07-24：tsc 0 错、65/65 测试、build 通过） |

**关键决策摘要**（详见 ROADMAP §6/§7/§8）：
- JSON 结构选 **A（自定义 schema）直做**，不做 B（固定四段）过渡；**四段裁决降级为 A 的默认预置模板**，继承现有 `parseJudgeResponse` + 四段 prompt 代码。
- **中间全程 JSON**，MD 仅在出口（导出）从 JSON 派生，**不持久化 MD**。
- Judge 重写循环上限 **3 次**。
- MD 渲染**分层**：通用结构自适应渲染器（默认）+ AI 针对性渲染（兜底，只改排版不改内容 + 字段覆盖校验）。

### ✅ 阶段 1a 已完成：多轮上下文记忆（滑窗版）

**完成于 2026-07-23。** 验证：tsc 0 错、36/36 测试过、build 通过；实测连问 3 轮完美 recall（小明/蓝色/橘子），关 Memory 开关后失忆，滑窗从第 2 轮即生效。

**新增文件（5）**：
- `.env` / `.env.example` —— 本地环境配置（VITE_ 前缀，git-ignore .env 保留 .env.example）。`.gitignore` 本就有 `.env` 规则，无需改。
- `src/services/envConfig.ts` —— .env 解析（手写零依赖）。导出 `getEnvProvider()`（首次启动种子 Provider）+ `getMemoryConfig()`（recentTurns/trimRatio/debugMemory/requestTimeoutMs/defaultMaxContextChars）。
- `src/services/memoryBuilder.ts` —— 记忆构造器纯函数：`buildHistory(session, providerId, isJudge, recentTurns)` 按 provider 过滤+user/assistant 交替+滑窗；`trimHistoryByRatio(history, prompt, maxChars, trimRatio)` 超限成对丢弃最旧。
- `test/memoryBuilder.test.ts` —— 10 个单测（隔离/交替/滑窗/截断）。

**修改文件（9）**：
- `src/services/configStore.ts` —— `loadConfig` 第 3 步（template）前注入 `getEnvProvider()` 种子。**约束：仅 config.json 不存在时种子，存在则以 config.json 为准（第 1 步 current 命中即 return）。**
- `src/types/moa.ts` —— `SynthesisRequest` 加 `panelHistory?`/`judgeHistory?`（Record<id, ChatMessage[]>）；`MoASessionConfig` 加 `memoryEnabled: boolean`。
- `src/services/moaEngine.ts` —— `callPanelOnce`/`runPanel`/`runSingleJudge` 加 history 参数并拼进 messages；`runMoaSynthesis` 两处 fan-out 从 request 取历史 + 调 `trimHistoryByRatio`（用 `getMemoryConfig().trimRatio`），debug 时打印裁剪日志。import 了 `getMemoryConfig` + `trimHistoryByRatio`。
- `src/hooks/useMoa.ts` —— import `buildHistory`/`getMemoryConfig`/`ChatMessage`；`send` 在构造 SynthesisRequest 前按 panelProviders/judgeProviders 各自调 `buildHistory` 组装 panelHistory/judgeHistory（仅 memoryEnabled 且有历史时）；`normalizeSessionConfig` + `makeDefaultConfig` 补 `memoryEnabled: true` 默认。
- `src/components/MoAConfigBar.tsx` —— row1 加 Memory checkbox（绑 config.memoryEnabled，走 onChange，running 时禁用）。
- `src/i18n/en.json` + `zh.json` —— `moaConfigBar.memory`/`memoryTooltip` 成对。
- `src/services/config.template.json` —— 默认 session config 补 `memoryEnabled: true`。

**核心行为**：每 Panel/Judge 只看自己历史轮次（独立记忆）；保留最近 N 轮（默认 8，.env `VITE_VERDEX_MEMORY_RECENT_TURNS` 可调）；历史+prompt 超 maxContextChars×trimRatio（默认 0.75）时从最旧成对丢弃；会话级开关默认开；向后兼容老 config（无 memoryEnabled 自动补 true）。

**遗留待 1b**：~~超限时目前是丢弃早期轮次~~ **→ 已由阶段 1b 解决（见下）**。

### ✅ 阶段 1b 已完成：分层摘要记忆（con.txt 四类 + 会话级持久化）

**完成于 2026-07-24。** 验证：tsc 0 错、63/63 测试过、build 通过。摘要放 hook（方案 A：useMoa.send，引擎零改动）、持久化到 session、会话级单摘要（近期 per-provider 原文不变）、con.txt 四类结构化摘要。

**新增文件（1）**：
- `src/services/summarizer.ts` —— `summarizeHistory(earlyTurns, existingSummary, provider, timeoutMs)`：调 streamChat 把早期对话压缩成结构化摘要（con.txt 四类：关键事实/用户偏好/待办/关系上下文），支持增量合并（已有摘要基础上叠加），失败时返回 existingSummary 不阻塞主流程。双语 prompt（按 i18n.language）。

**修改文件**：
- `src/types/moa.ts` —— ChatSession 加 `summary?: string`（滚动摘要）+ `summaryUpTo?: number`（已摘要到第几轮，避免重复摘要）。
- `src/hooks/useMoa.ts` —— send 里 buildHistory 后加摘要逻辑：①判断超限（messages.length > recentTurns）②时机控制（unsummarizedCount >= summaryInterval 才触发新摘要，否则复用 session.summary）③取早期 turns 调 summarizeHistory ④持久化（setSessions 写 summary/summaryUpTo）⑤注入：摘要作为 `{role:"system", content:"【对话摘要】\n"+summary}` 放每个 provider 历史最前。mapreduce 模式跳过摘要（有自己的语料）。
- `src/services/envConfig.ts` + `.env`/`.env.example` —— 加 `summaryModel`（空=用第一个 judge 模型）+ `summaryInterval`（默认 4：每攒 4 轮未摘要才触发）。
- `src/i18n/en.json`+`zh.json` —— 新 `memory.summaryPrefix` 命名空间（"【对话摘要】"）。

**核心行为（con.txt 分层）**：
```
[会话级摘要 session.summary]     ← 早期历史压缩（四类信息），所有 provider 共享
  ↓
[近期 N 轮原文 panelHistory]     ← per-provider，buildHistory 现状不变（1a 保留）
  ↓
[当前用户问题]
```
超限时不再纯丢弃（1a），而是先摘要早期部分→存 session.summary→注入历史开头。1a 的 buildHistory + trimHistoryByRatio **完全保留**作兜底（摘要后仍可能再 trim 兜底，双重保护）。

**与 1a 的关系**：1b 不替换 1a，是在 1a 前面加摘要层。1a 是 1b 失败/未触发时的 fallback。

**未做（留后续）**：per-provider 独立摘要（session.summaries[id]，未来多 AI 场景如需再升级）；摘要的摘要（递归压缩，超长会话才需要）；摘要质量校验（con.txt 提到的用 R1 二次确认）。

### 🟡 阶段 1b 待做：分层摘要记忆（不急）

当前滑窗对多数场景够用。1b 做时：替换 `memoryBuilder.trimHistoryByRatio` 为"超限调模型总结早期历史"，保留结构化关键信息（con.txt：关键事实/用户偏好/待办/关系上下文）。摘要可用更强模型（阶段 3 加 R1 时一并配 `VITE_VERDEX_SUMMARY_MODEL`）。

### ✅ 阶段 2 已完成：文档输入入口（txt/md）

**完成于 2026-07-23。** 验证：tsc 0 错、44/44 测试过、build 通过。

**新增文件（2）**：
- `src/services/fileReader.ts` —— 文件读取服务。`readTextFile(file)`/`readTextFiles(files)`，白名单 `txt/md/markdown`，单文件上限 `MAX_ATTACHMENT_CHARS=200000`（超限截断+标记）。读取优先用 `file.text()`（现代 Promise API，浏览器/webview/Node 都支持），FileReader 作老环境回退。
- `test/fileReader.test.ts` —— 8 个单测（白名单/读取/截断/批量）。

**修改文件（5）**：
- `src/types/moa.ts` —— 新增 `Attachment` 类型（`{id,name,text,chars,source,truncated}`）；`ChatSession` 加可选 `attachments?: Attachment[]`（为阶段 4 Map-Reduce 铺路）。
- `src/hooks/useMoa.ts` —— 加 `addAttachments`/`removeAttachment` CRUD（按 name 去重）；`send` 里构造 `effectivePrompt`（附件文本拼在用户输入前），喂给熔断器和 request.prompt，但 `newTurn.prompt`/title 仍用原始 `trimmed`（避免历史臃肿）；接口暴露 `setError`。
- `src/components/ChatInput.tsx` —— 加 📎 按钮（触发隐藏 `<input type=file multiple accept=.txt,.md,.markdown>`）+ 附件 chip 列表（文件名+字符数+×删除+截断标记）；新 props `attachments/onAddFiles/onRemoveAttachment`。
- `src/App.tsx` —— `handleAddFiles`（异步 readTextFiles + addAttachments + 错误走 setError）、`handleRemoveAttachment`，传给 ChatInput。
- `src/i18n/en.json`+`zh.json` —— `chatInput.attach/attachTooltip/attachmentLabel/attachmentChars/attachmentTruncated/attachmentRemove/readError/attachmentsHint` 成对。

**核心行为**：附件会话级存储（`session.attachments`）；每条消息发送时附件文本拼进 prompt（首版用法）；数据结构按"独立数据源"存（阶段 4 Map-Reduce 时引擎直接从 attachments 取，不返工）；PDF/Word 不支持（白名单拒绝，错误走 setError 提示）。

**关键设计点**：附件拼进 `effectivePrompt` 发给模型，但**不存进 `newTurn.prompt`**——所以 1a 记忆里 turn.prompt 是干净的用户原话，附件每轮重新拼。附件文本不进 panelHistory。

**遗留待后续**：PDF/Word（需 Rust crate）；Tauri 原生对话框（首版浏览器 file input 够用）；附件作为 Map-Reduce 独立数据源（阶段 4，数据结构已就位）。

**实测发现（2026-07-23，7 份格兰瑟姆 txt 实测）**：
- **功能正确**：📎 加载 7 份（共 ~7.4 万字符），提问后 DeepSeek 能跨文档综合（同时引用 2000 泡沫/GMO 52 产品/安然避雷/格林斯潘批判等多文档细节），证明附件文本确实拼进 prompt 且被模型读到。
- **大文档超时问题**：单次塞 7 份全文，默认 60s 超时不够（Panel 失败，Judge 因不带附件反而成功）。**已临时修复**：`.env` 的 `VITE_VERDEX_REQUEST_TIMEOUT_MS` 从 60000 调到 180000，重启 dev server + 刷新页面后 7 文档场景跑通。
- **架构局限（阶段 4 的实证依据）**：当前是"一次塞全部"——7 份文档全文拼进 1 个 prompt 单次调用。20+ 份就会崩。**阶段 4 Map-Reduce 才是正解**：每份单独抽（并行小调用）→ Reduce 合并。这次实测直接证明了阶段 4 的必要性。
- **产物形态局限（阶段 3 的实证依据）**：当前输出是一大段 Markdown 文字（"### 1. ... ### 2. ..."），**不是结构化 JSON**（不像 grantham_models.json 那种 `{思维模型:[...],因果链:[...]}`）。要产出可入库的结构化数据，必须做阶段 3（自定义 schema + 校验闭环）。
- **附件是会话级持续显示**：chip 在输入框上方持续显示，每条消息都带附件——这是设计如此（附件作语料库），非 bug。点 × 才删。

### ✅ 阶段 3 已完成：自定义 schema 抽取 + 校验闭环（路线 1 自由 prompt 式）

**完成于 2026-07-23。** 验证：tsc 0 错、54/54 测试过、build 通过。路线选择：自由 prompt 式（预留升级 JSON Schema + ajv），通用卡片渲染器，重写上限 3。MD 出口渲染器本阶段不做（独立子任务）。

**核心设计：双模式 Judge**——`outputMode: "verdict"`（默认/现状，四段裁决）vs `"extract"`（自定义 schema JSON）。两种模式共用 Panel fan-out 和 Judge 调度，只差 Judge 的 systemPrompt + 解析/校验/渲染。

**新增文件（3）**：
- `src/services/schemaValidator.ts` —— 轻量校验（路线1）：`validateExtract(data, requiredKeys)` 检查 data 是对象 + 含所有 requiredKeys。未来换 ajv 时此函数内部替换，接口不变。
- `src/components/JsonCardRenderer.tsx` —— 通用 JSON→卡片递归渲染器：对象→标题层级、数组→列表、叶子→键值对，深度限 6 层，复用 verdict 卡片配色。
- `test/schemaValidator.test.ts` —— 6 个单测（合法/缺 key/非对象/空 requiredKeys）。

**修改文件（关键）**：
- `src/types/moa.ts` —— 新增 `ExtractSchemaTemplate`（`{id,name,systemPrompt,requiredKeys?}`，预留 schemaJson 升级）；`MoASessionConfig` 加 `outputMode:"verdict"|"extract"` + `extractSchemaId`；**`SynthesisResponse` 改判别联合** `JudgeResponse = {kind:"verdict",consensus,...} | {kind:"extract",data:Record<string,unknown>}`（这是本阶段最大改动，用 kind 字段类型安全分叉）。
- `src/services/moaEngine.ts` —— 抽出 `extractJsonObject` 共用辅助；`parseJudgeResponse(raw, mode?)` 双模式（verdict 保留四段逻辑，extract 返回 `{kind:"extract",data}`）；**`runSingleJudge` 加校验重写循环**（extract 模式最多 3 次：调用→parse→validateExtract→不合规把 errors 拼进 messages 重写）；JudgeSpec 加 `outputMode?`+`requiredKeys?`，runMoaSynthesis 透传。
- `src/hooks/useMoa.ts` —— 新增 extractSchemas 域（ConfigFile + useState + 持久化 + CRUD `add/update/removeExtractSchema`，remove 时 null 化 session.extractSchemaId）；send 里 requestJudges 构造：extract 模式覆盖 systemPrompt 为 schema 模板 + 带 outputMode/requiredKeys。
- `src/services/configStore.ts` —— ConfigFile 加 extractSchemas；normalizeConfigShape 补默认 `[]`。
- `src/services/config.template.json` —— 加 4 个预置 schema（en/zh 各 2：四段裁决-extract 版 + 思维模型库）；welcome session config 补 outputMode/extractSchemaId。
- `src/components/SettingsModal.tsx` —— 加 📋 Schemas tab（activeTab 三态 + SchemaRow 组件：name+systemPrompt+requiredKeys 编辑）。
- `src/components/MoAConfigBar.tsx` —— 加 outputMode 切换 select + extract 模式时显示 schema select。
- `src/components/JudgeMessage.tsx` —— done 分支按 `response.kind` 分叉：verdict 走四卡片（现状），extract 走 JsonCardRenderer。
- `src/App.tsx` —— 两处 SettingsModal + MoAConfigBar 接线 extractSchemas + CRUD。
- `src/i18n/en.json`+`zh.json` —— settingsModal.tabSchemas + templatesModal.schemas* + moaConfigBar.outputMode*/extractSchema* + judge.extractHeader。
- `test/moaEngine.test.ts` —— 现有 verdict 测试加 `asVerdict` 类型守卫（适配判别联合）+ 4 个 extract 模式新测试。

**核心行为**：verdict 模式 = 现状不变；extract 模式 = Judge 按 schema 模板产出任意 JSON，validateExtract 校验 requiredKeys，不合规自动重写（上限 3），产出 `{kind:"extract",data}` 由 JsonCardRenderer 渲染。向后兼容：老 config 无 outputMode 自动补 verdict。

**遗留待后续**：正式 JSON Schema + ajv（路线 2 升级，schemaValidator 是替换点）；MD 出口渲染器（独立子任务）；阶段 4 Map-Reduce（数据结构已就位）。

**实测结果（2026-07-23/24，1 份格兰瑟姆 txt）**：
- extract 模式 + 「思维模型库」schema 产出**完美三层结构化 JSON**（思维模型/因果链/交易模型各 3 个对象，每个含 名称/定义/关键数据/应用规则 等字段），通用卡片渲染正确（对象→标题、数组→列表、叶子→键值）。"查看原始 JSON"展示的就是干净可入库 JSON。**这正是 grantham_models.json 那种结构**。
- 关键观察：Panel 产 Markdown 自由作答（不受 schema 约束），Judge 按 schema 产结构化 JSON——MoA 架构的"Panel 读懂/Judge 按结构产出"分工验证成立。

**两个实测后修复（2026-07-24）**：
1. **超时未生效修复**：`.env` 的 `VITE_VERDEX_REQUEST_TIMEOUT_MS=180000` 被 `getMemoryConfig()` 读到，但 useMoa 构造 SynthesisRequest 时**从没设置 timeoutMs**，引擎 streamChat 永远 fallback 到硬编码 60000。修复：`useMoa.ts` request 构造处加 `timeoutMs: memCfg.requestTimeoutMs`，把 .env 真正接到调用链。memCfg 同时提到 if 块外（request 构造在块外要用）。
2. **模板语言过滤修复**：预置模板有中英两套（id 后缀 -en/-zh），用户反馈冗余。新增 `src/services/templateFilter.ts`（`filterByLanguage` 按 id 后缀过滤，用户自建 UUID 模板始终显示）；MoAConfigBar（3 个 select）+ SettingsModal（3 个管理列表 + 空状态判断）都按当前界面语言过滤。中文界面只显中文预置，英文界面只显英文。
   - 修改文件：`useMoa.ts`（timeout 接线 + memCfg 作用域）、`services/templateFilter.ts`（新）、`components/MoAConfigBar.tsx`（import + i18n + 4 处 map 过滤）、`components/SettingsModal.tsx`（import + i18n + 3 处 map + 3 处空状态过滤）。
   - 验证：tsc 0 错、54/54 测试、build 通过。

### ✅ 阶段 4 已完成：自适应 Map-Reduce（形态 A：extract 模式的多文档扩展）

**完成于 2026-07-24。** 验证：tsc 0 错、63/63 测试过、build 通过。形态 A（每份附件单独 Map extract → Reduce 同 schema 合并），自适应触发 + .env 非常情况覆盖，Reduce 产同 schema JSON。复用阶段 3 extract 全链路。

**新增文件（3）**：
- `src/services/mapreduceStrategy.ts` —— `shouldMapReduce(attachments, maxContextChars, triggerRatio, forceMode)` 纯函数。auto 模式：总字符 > maxContextChars×triggerRatio 触发；force=always/never 覆盖；标记 oversized 附件。
- `src/components/MapReduceMessage.tsx` —— mapreduce Turn 渲染：📄 各文档 Map 状态卡（名称+字段数+✓/✗）+ 📋 合并结果（复用 JsonCardRenderer）+ raw 折叠。
- `test/mapreduceStrategy.test.ts` —— 9 个单测（单文档不触发/小文档不触发/大文档触发/force always/never/oversized 标记/totalChars/reason）。

**修改文件（关键）**：
- `src/types/moa.ts` —— `MoASessionConfig.outputMode` 加 `"mapreduce"`；`SynthesisRequest` 加 `outputMode?`+`attachments?`；`Turn` 加 `mapOutputs?: MapOutputState[]`+`mergedResult?: SynthesisResponse|null`；新增 `MapOutputState`（`{attachmentId,name,status,data?,error?}`）；`MoaCallbacks` 加 `onMapDocStart/Done/Error`+`onReduceStart/Delta/Done/Error`。
- `src/services/moaEngine.ts` —— 导出 `runSingleJudge`（供 Map 复用）；新增 `runMapReduce(request, providers, cb)`：Phase Map 用 `Promise.all` 每份附件调 runSingleJudge（{PANELS}=单文档全文，outputMode="extract"，复用校验循环），失败 per-doc 标记跳过；Phase Reduce 直接 `streamChat` 合并所有 Map JSON（{PANELS}=渲染多文档 JSON 块，指示"合并去重归纳成一份"）→ `parseJudgeResponse("extract")`+`validateExtract`；`runMoaSynthesis` 早期分支 `if outputMode==="mapreduce" && attachments → runMapReduce; return`（跳过 Panel/Judge）。
- `src/hooks/useMoa.ts` —— import shouldMapReduce；send 里 `mrDecision = shouldMapReduce(...)` 决定 useMapReduce（mapreduce 模式才判断，verdict/extract 不判断）；mapreduce 时 effectivePrompt=trimmed（不拼附件，附件走 request.attachments）；SynthesisRequest 带 `outputMode:"mapreduce"`+`attachments`；newTurn 初始化 mapOutputs/mergedResult 槽；加 setMapOutput/setMerged helper；回调对象接 onMapDocStart/Done/Error + onReduceStart/Delta/Done/Error。
- `src/services/envConfig.ts` + `.env`/`.env.example` —— 加 `mapreduceForce`（auto/always/never）+ `mapreduceTriggerRatio`（默认 0.6）。
- `src/components/MoAConfigBar.tsx` —— outputMode select 加 Map-Reduce 第三选项；extract/mapreduce 都显示 schema select；onChange 适配三态。
- `src/App.tsx` —— Turn 渲染分叉：`turn.mapOutputs ? <MapReduceMessage> : <JudgeMessage>`。
- `src/i18n/en.json`+`zh.json` —— moaConfigBar.outputModeMapreduce/mapreduceHint + 新 mapReduce.* 命名空间。

**核心行为**：mapreduce 模式 + 多文档 + 自动判断超阈值 → 每份文档并行 Map（用所选 schema 抽 JSON）→ Reduce 合并成一份完整 JSON（跨文档去重归纳）。小文档自动降级为 extract 整包（不浪费）。Reduce 产 `{kind:"extract",data}`，复用 JsonCardRenderer 渲染。force=always/never 供非常情况覆盖。

**首版限制（留后续）**：单附件内部切分（首版只按附件数+总大小判断，单份 50 万字的大文件内部切分留后续）；Map 阶段无逐字流式 UI（首版 Map 完成才显 card）；Map 失败无单份重试（失败标记 error，Reduce 跳过）。

**实测结果（2026-07-24，7 份格兰瑟姆 txt，force=always）**：
- **Map 阶段成功**：7 份文档并行抽取，全部 ✓（每个 3 字段：思维模型/因果链/交易模型），耗时约 1 分钟。
- **Reduce 阶段成功**：合并 7 份 Map JSON 成一份完整结构化 JSON——思维模型 23 个 + 因果链 20 条 + 交易模型 20 个，跨文档去重归纳（含 2000 泡沫/2008 危机/AI 泡沫/环保转型等多文档内容）。耗时约 2-3 分钟。
- **这正是 grantham_models.json 那种结构**——路线图核心目标"任意文档→结构化 JSON"完全达成。

**实测后修复（2026-07-24）**：
1. **schema 没解析（Bug 1）**：`useMoa.ts` extractSchema 只在 `config.outputMode === "extract"` 时解析，mapreduce 模式不解析 → Judge 走 verdict。修复：`(outputMode === "extract" || outputMode === "mapreduce")` 都解析。
2. **降级走错路（Bug 2）**：mapreduce 被自动判断降级时，request.outputMode 传成 "mapreduce" 但 attachments 空，引擎 fall through 到 verdict。修复：新增 `effectiveOutputMode`——mapreduce 降级时传 "extract"（带 schema 整包），不 fall through。
3. **send guard 误拦（Bug 3）**：`if (panelIds.length === 0 || judgeIds.length === 0) return` 在 mapreduce 模式误拦（mapreduce 不需要 Panel）。修复：mapreduce 模式只检查 judgeIds。
4. **Reduce 超时**：合并 7 份 JSON 重，180s 不够。`.env` 超时 180s→360s；Reduce maxTokens 4096→8192。
- 验证：tsc 0 错、63/63 测试、build 通过。

### ✅ Map-Reduce 触发阈值 —— 已定夺（2026-07-24，真实基准驱动）

**最终决策：单次优先**。auto 模式只在"总字符 > maxContextChars × 0.75（15 万）"或"单份附件超上下文"时触发 Map-Reduce；否则单次 Extract。份数不再触发。

**依据（真实 API 基准，scripts/perf-test.mjs）**：

| 组合 | 字数 | 单次 Extract | Map-Reduce | 结论 |
|---|---|---|---|---|
| C(5份) | 5.3 万 | **36s** | Map 34s + Reduce 119s = 153s | 单次快 4.3× |
| D(7份) | 7.4 万 | **47s** | Map 31s + Reduce 187s = 218s | 单次快 4.7× |
| F(3份大) | 9.7 万 | **34s** | — | 单次够快 |

- **大模型（V3, 64K+ 上下文）单次处理 10 万字符只要 34-47s**，远快于 Map-Reduce（Reduce 合并任务本身重，119-187s）。
- **Map-Reduce 的价值场景**：① 小模型（8-32K 上下文，单次塞不下）；② 超大语料（>15 万字符，任何模型都塞不下）。对 V3 处理 10 万字符以内，Map-Reduce 是负优化。
- **配置**：`.env` `FORCE=auto`, `TRIGGER_RATIO=0.75`, force=always/never 供小模型/特殊场景覆盖。小模型用户应调小 MAX_CONTEXT_CHARS 或 force=always。

**树形 Reduce —— 取消**。原计划优化"Reduce 太慢"，但根本问题是"对大模型 Map-Reduce 整体不如单次"。优化 Reduce 也只是 153s→~90s，仍远慢于单次 36s。前提不成立，不做。

### 🟡 待优化（用户反馈，体验类，非功能 bug）

**运行可观测性三件套（等 Reduce 时是黑盒，用户反馈强烈）—— ✅ 已完成（2026-07-24）**：
- **运行计时** ✅：新 `src/hooks/useElapsed.ts`（每秒 tick）+ `src/components/TurnTimer.tsx`，App 在当前 running turn 的 UserMessage 下显示"⏱ Xs"。
- **发送→Stop 按钮** ✅：`httpClient.ts` 的 streamChat 加 `externalSignal?: AbortSignal` 参数（用户取消抛 errors.CANCELLED，区别于超时）；`SynthesisRequest` 加 `signal?`；引擎三处 streamChat 调用（callPanelOnce/runSingleJudge/Reduce）+ Map→Reduce 间 + panels→judges 间加 aborted 检查；`useMoa` 加 `abortRef` + `stop()`（接口暴露）；ChatInput running 时按钮变红 Stop（onStop prop）。
- **阶段进度** ✅：MapReduceMessage 的 📄 标题加"X/N 完成"（mapOutputs done 计数）；📋 区分"等待 Map 完成"/"合并中…"（reduceWaiting/reduceMerging）。
- 验证：tsc 0 错、63/63 测试、build 通过。

**Map-Reduce 渲染细化**：
- Map 阶段目前无逐字流式（完成才显 card）——大文档时用户干等。可加 Map 流式（但 Map 是并行的，流式 UI 复杂）。
- Reduce 的 raw JSON 折叠已有，但 mergedResult 渲染依赖 JsonCardRenderer——超长合并结果（如 60+ 条目）渲染可能卡顿，待观察。

**其他体验**：
- 配置栏 Output 选 mapreduce 时，Panel 选择应置灰/隐藏（mapreduce 不用 Panel，留着误导）。
- Map 失败的文档目前只标 ✗，无重试——可加单份重试按钮。

### ✅ 阶段 5 已完成：ASR / 数据清洗（可选开关）

**完成于 2026-07-24。** 验证：tsc 0 错、65/65 测试过、build 通过。时机 A（附件加载时清洗），会话级开关默认关，脏数据才开。

**新增文件（1）**：
- `src/services/cleaner.ts` —— `cleanText(text, provider, timeoutMs)`：调 streamChat 修 ASR 错误（实体归一化/数字修正/明显错别字），严格指令（只修错不改意、不确定保留原文、保持段落结构），失败返回原文（best-effort）。双语 prompt。

**修改文件**：
- `src/types/moa.ts` —— `Attachment` 加 `cleanedText?`（清洗后文本）+ `cleaned?`（标记）；`MoASessionConfig` 加 `cleanAttachments: boolean`（默认 false）。
- `src/hooks/useMoa.ts` —— `cleanAttachment(sessionId, attachmentId)` 方法（用第一个 provider 清洗，写回 cleanedText/cleaned）；`normalizeSessionConfig`/`makeDefaultConfig` 补 cleanAttachments 默认（顺手修了 outputMode 三态归一化）；send 里 attachmentBlock 用 `cleanedText ?? text`，mapreduce 传 attachments 时 cleanedText 覆盖 text。
- `src/App.tsx` —— handleAddFiles 里若 cleanAttachments 开启，逐个调 cleanAttachment（异步，不阻塞）。
- `src/components/MoAConfigBar.tsx` —— Memory 旁加 Clean 开关（绑 cleanAttachments）。
- `src/components/ChatInput.tsx` —— 附件 chip 显示「已清洗」标记。
- `src/services/config.template.json` —— welcome session 补 cleanAttachments: false。
- `src/i18n/en.json`+`zh.json` —— moaConfigBar.clean/cleanTooltip + chatInput.attachmentCleaned。

**核心行为**：cleanAttachments 开启 → 附件加载时自动清洗（修 ASR 错别字）→ 清洗后文本存 cleanedText → 后续 extract/mapreduce/verdict 都用 cleanedText。关闭 → 用原文（不浪费调用）。chip 显示「已清洗」标记。失败 best-effort（保留原文）。

**适用场景**：格兰瑟姆那种 ASR 播客转录稿（Grantham 4 种写法、208→2008、Kistone→Keystone）。干净数据（手写/PDF 导出）不需要开。

### 🟢 低优先（不在 5 阶段路线图内，按需做）
- 会话搜索
- IndexedDB 替代 localStorage（当前 localStorage 兜底有 5MB 上限）

> 注：原"导出对话（markdown/JSON）"已并入路线图阶段 3 的 MD 出口渲染，不再单列。
> 注：`settingsModal.maxContext` UI **已存在**（SettingsModal.tsx:156-170，en.json:114），ROADMAP §11 标注的"待加"是过时信息，实际无需做。

---

## 五、踩过的坑（**绝对不要再踩**）

### 🔴 坑 1：React Hooks 规则——early return 必须在所有 hooks 之后

**症状**：黑屏。App 完全不渲染。

**根因**：在 `App.tsx` 里，loading 屏的 `if (!moa.loaded) return (...)` 被放在了 `useEffect` **之前**。当 `loaded` 从 false→true 时，第一次 render 跑了 3 个 hooks 就 return，第二次 render 跑了 4 个 hooks → hooks 数量变化 → React 抛 "Rendered more hooks than during the previous render" → 崩溃。

**铁律**：所有 `useEffect`/`useRef`/`useState`/`useCallback` 必须在任何 `if (...) return` **之前**无条件执行。Early return 只能放在最后一个 hook 之后。

### 🔴 坑 2：bash 子进程里 `%APPDATA%` 不展开

**症状**：用 `cmd /c "if exist %APPDATA%\com.verdex.app\config.json"` 查文件，永远返回 `NOT_FOUND`，导致误以为 config.json 没落盘，浪费大量时间排查一个不存在的问题。

**根因**：在 bash 子进程里调 `cmd /c`，`%APPDATA%` 环境变量**不会展开**（bash 不认 Windows cmd 的 `%VAR%` 语法）。

**正确做法**：
- 用正斜杠全路径：`ls "C:/Users/k/AppData/Roaming/com.verdex.app/config.json"`
- 或先 `echo $APPDATA`（bash 里是 `$APPDATA` 不是 `%APPDATA%`）
- **永远不要在 bash 里用 `cmd /c "...%VAR%..."`**

### 🔴 坑 3：Tauri 2 的 fs 权限要用 `fs:allow-appdata-*`

**症状**：fs 写盘静默失败，config.json 不生成。

**根因**：Tauri 2 的 fs plugin 中，`fs:allow-read-file` / `fs:allow-write-file` 等通用权限**默认 scope 为空**（哪都不能访问）。必须用带目录名的权限如 `fs:allow-appdata-read` / `fs:allow-appdata-write` / `fs:allow-appdata-meta`，这些**内置了 appDataDir 的 scope**。

**正确配置**（见 `src-tauri/capabilities/default.json`）：
```json
"fs:allow-appdata-read",
"fs:allow-appdata-write",
"fs:allow-appdata-meta"
```

### 🟡 坑 4：端口 1420 占用导致 tauri dev 启动失败

**症状**：`Error: Port 1420 is already in use`。

**根因**：之前的 vite dev server 进程没完全退出，或 tauri dev 被杀但子进程残留。

**处理**：
```bash
netstat -ano | findstr ":1420" | findstr "LISTENING"   # 找 PID
cmd //c "taskkill /F /PID <pid>"                        # 杀掉
```
注意：`taskkill /F` 在 bash 里要用 `cmd //c "taskkill /F /PID ..."`（`/F` 会被 bash 误判为路径）。

### 🟡 坑 5：Tauri dev 模式的 Vite server 是内部机制，不是独立 web 服务

**误解**：以为 `tauri dev` 启动的 `localhost:1420` 是多余的 web 服务，想要纯桌面应用。

**事实**：Tauri 开发模式下，`beforeDevCommand` 会启动 Vite dev server 供 WebView 加载前端代码（HMR）。**这是 Tauri 的正常开发机制**。最终 `tauri build` 产物是纯桌面 exe，前端编译成静态文件嵌入，没有 1420 端口。

### 🟡 坑 6：JS console.log 在 Tauri webview 不转发到启动终端

**事实**：Tauri dev 模式下，webview 的 `console.log` **不会**输出到 `npm run tauri dev` 的终端 stdout。要看 JS 日志必须开 webview devtools（F12）。

**替代诊断方案**（按可靠度排序）：
1. 写到 localStorage + 用 UI 渲染读取（最可靠，但 localStorage 变化不触发 re-render，需要配合 state）
2. 直接渲染诊断信息到 DOM（DebugOverlay 模式）
3. 写文件到 appDataDir（需要 fs 权限，鸡生蛋问题）

### 🟡 坑 7：Anthropic 流式必须在 body 带 `"stream": true`，不能只靠 Accept 头

**症状**：Anthropic 协议的调用永远不流式，每次都走非流式回退（输出一次性出现而非逐字）。

**根因**：Anthropic Messages API 要在 **请求 body** 里带 `"stream": true` 才返回 SSE，光设 `Accept: text/event-stream` 头无效。这与 OpenAI（body 里 `stream: true`）一致，但容易误以为 Anthropic 靠头控制。

**教训**：协议适配层必须对每个协议验证流式实际生效，不能假设"设了 Accept 就行"。

---

## 六、关键架构决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| AI 框架 | 拒绝 LangChain/AutoGen，纯原生 TS | 极致轻量与可控，透明 |
| Provider 角色 | 不绑定在 Provider 上，由会话决定 | 一个 Provider 可同时当 Panel 和 Judge |
| Turn 数据结构 | `judges: JudgeState[]`（数组） | 支持多 Judge 对撞，简单模式=长度 1 |
| 角色模板存储 | 全局库 + 会话级引用 | 可复用，删模板按 id 清理引用 |
| API Key 存储 | 明文 config.json（用户明确选择） | 最简、可备份；用户自担误推 git 风险 |
| 模式作用域 | 会话级 | 不同任务可用不同模式 |
| 配置模板 | 可读 JSON 文件（`config.template.json`） | 自文档化 + 可编辑出厂默认 |
| 内置角色 | 中性通用思维工具 | 不照搬任何政治/商业剧本 |

---

## 七、快速接手指南

### 读代码顺序（建议）
1. `src/types/moa.ts` — 所有数据结构，单一真相源
2. `src/services/moaEngine.ts` — 调度逻辑（`runMoaSynthesis` 是核心入口）
3. `src/services/httpClient.ts` — 协议适配（`streamChat` + `testProvider` + `normalizeBase`）
4. `src/hooks/useMoa.ts` — 状态机（`send` 函数是状态流转核心）
5. `src/App.tsx` — UI 编排
6. `src/components/` — 各 UI 组件

### 验证环境
```bash
cd C:\Users\k\Documents\project\Verdex
npm install
npx tsc --noEmit       # 零错误
npm test               # 26 passed
npm run tauri dev      # 桌面应用
```

### config.json 位置
`C:\Users\k\AppData\Roaming\com.verdex.app\config.json`（用正斜杠路径访问，见坑 2）

### 下一步任务
做多轮上下文记忆（见第三节）。先进 plan 模式设计，再动手。
