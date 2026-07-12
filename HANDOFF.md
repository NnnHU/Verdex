# Verdex 交接文档

> 写给一个**完全没有上下文的新会话**。读完这份文档，你应该能接手继续开发。
> 最后更新：2026-07-12

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

### 🟡 待做：多轮上下文记忆（**下一步核心任务**）

**问题**：当前每轮对话每个 Panel/Judge 只收到当前这一条 prompt，**不带历史上下文**。用户追问"那你觉得谁对"时，模型完全不知道上一轮在讨论什么。

**已确认的设计决策**（用户已选）：
1. **每 Panel 独立记忆**：每个 Panel 只看自己的历史回答 + 历史用户问题（不是所有 Panel 的混合）。效果最自然，但实现最复杂（每个 panel 要单独组装历史 messages 数组）。
2. **摘要压缩**：超限时调一次模型把早期历史总结成摘要（而非简单截断）。多一次 API 调用但保留更多信息。
3. **模型上限可配**：在模型设置 UI 暴露 `maxContextChars` 字段（类型已有 `ProviderCapabilities.maxContextChars`，但 UI 未暴露）。
4. **熔断调整**：加了历史后上下文快速增长，需要配合上限做自动压缩而非直接拒绝。

**实现要点**（未开始）：
- 引擎 `runPanel` 的 messages 数组要从 `[{role:"user", content:prompt}]` 改为 `[...history, {role:"user", content:prompt}]`，其中 history 是该 provider 之前几轮的 user/assistant 交替
- 需要新的摘要压缩函数（超限时调模型总结早期历史）
- `useMoa.send` 需要把 `session.messages`（历史 Turn 数组）按 providerId 过滤出该 panel 的历史
- Judge 的历史注入类似（看自己之前的裁决）
- `checkInputLimits` 的 8000/32000 上限可能需要调高或改为"超限触发压缩"

### 🟡 待做：模型设置 UI 暴露 maxContextChars

`ProviderCapabilities.maxContextChars` 类型已定义且引擎已用它做预检跳过，但 SettingsModal 没有编辑入口。需要加一个输入框。

### 🟢 低优先
- 导出对话（markdown/JSON）
- 会话搜索
- IndexedDB 替代 localStorage（当前 localStorage 兜底有 5MB 上限）

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
