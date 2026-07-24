# ⚠️ 踩过的坑（绝对不要再踩）

> 9 个真实踩过的坑，每个含症状/根因/修复。新会话务必先读。

---

## 坑 1：React Hooks 规则——early return 必须在所有 hooks 之后

**症状**：黑屏崩溃。App 完全不渲染。

**根因**：`App.tsx` 里 `if (!moa.loaded) return (...)` 放在 `useEffect` **之前**。`loaded` 从 false→true 时，第一次 render 跑了 3 个 hooks 就 return，第二次 render 跑了 4 个 hooks → hooks 数量变化 → React 崩溃。

**铁律**：所有 `useEffect`/`useRef`/`useState`/`useCallback` 必须在任何 `if (...) return` **之前**无条件执行。Early return 只能放在最后一个 hook 之后。

---

## 坑 2：bash 子进程里 `%APPDATA%` 不展开

**症状**：用 `cmd /c "if exist %APPDATA%\com.verdex.app\config.json"` 查文件，永远返回 NOT_FOUND。

**根因**：bash 不认 Windows cmd 的 `%VAR%` 语法。

**正确做法**：
- 用正斜杠全路径：`ls "C:/Users/k/AppData/Roaming/com.verdex.app/config.json"`
- 或先 `echo $APPDATA`（bash 里是 `$APPDATA`）
- **永远不要在 bash 里用 `cmd /c "...%VAR%..."`**

---

## 坑 3：Tauri 2 的 fs 权限要用 `fs:allow-appdata-*`

**症状**：fs 写盘静默失败，config.json 不生成。

**根因**：Tauri 2 的 fs plugin 中，`fs:allow-read-file` / `fs:allow-write-file` 等通用权限**默认 scope 为空**（哪都不能访问）。必须用带目录名的权限。

**正确配置**（`src-tauri/capabilities/default.json`）：
```json
"fs:allow-appdata-read",
"fs:allow-appdata-write",
"fs:allow-appdata-meta"
```

---

## 坑 4：端口 1420 占用导致 dev 启动失败

**症状**：`Error: Port 1420 is already in use`。

**根因**：之前的 vite dev server 进程没完全退出。

**处理**：
```bash
netstat -ano | grep ":1420" | grep "LISTENING"   # 找 PID
cmd //c "taskkill /F /PID <pid>"                   # 杀掉
```
注意：`taskkill /F` 在 bash 里要用 `cmd //c "taskkill ..."`（`/F` 会被 bash 误判为路径）。

---

## 坑 5：Vite env 变量改了必须重启 dev server

**症状**：改了 `.env` 的超时/阈值但没生效。

**根因**：Vite 的 `import.meta.env` 是**构建时注入**，HMR 不会重新读取 `.env`。

**正确做法**：改 `.env` 后停 server → 重启 `npm run dev` → 浏览器刷新（清 localStorage）。

---

## 坑 6：outputMode 混了两个维度（已修复）

**症状**：用户分不清 Verdict/Extract/Map-Reduce 什么关系，配置项同时显示导致困扰。

**根因**：outputMode 混了两个含义：
- session 级（用户面）：verdict/extract/mapreduce（3 值）
- 引擎级（内部）：verdict/extract（2 值，JudgeSpec/parseJudgeResponse 用）

**修复**：拆成 `taskType`（session 级：document_extract/document_analysis/quick_qa）+ `outputKind`（引擎级：verdict/extract），解耦。

---

## 坑 7：Map-Reduce 对大模型是负优化（实测发现）

**症状**：7 份文档走 Map-Reduce 比 Extract 慢 4-5 倍（153s vs 36s）。

**根因**：大模型（DeepSeek V3）单次处理 10 万字符只要 36-47s，而 Map-Reduce 的 Reduce 合并要 119-187s（合并任务本身重）。

**修复**：阈值改为"单次优先"（triggerRatio 0.75 = 15 万字符才触发，或单份附件超上下文）。小模型用户应调小 MAX_CONTEXT_CHARS 或 force=always。

**详见**：`docs/ORCHESTRATION_ROADMAP.md` 性能分析节 + `scripts/perf-test.mjs`。

---

## 坑 8：cleanAttachment 闭包时序 bug

**症状**：勾选清洗 + 挂文件后「已清洗」标记不出现。

**根因**：`cleanAttachment` 从闭包 `sessions` 读附件，但 `addAttachments` 刚更新 sessions 还没反映到闭包 → 找不到新附件 → 直接 return。

**修复**：`cleanAttachment` 接受可选 `sourceText` 参数，`handleAddFiles` 直接传 `a.text`（刚读到的原始文本），不依赖 sessions 闭包。

---

## 坑 9：预置假 Provider 污染界面

**症状**：每次新会话显示 Llama/Qwen/DeepSeek/Claude 四个空 key 假模型（尤其 Claude 从来没用过）。

**根因**：config.template.json 预置了 4 个空 key 的假 Provider。

**修复**：config.template.json providers 改为空数组 `[]`，只靠 `.env` 种子注入真实 Provider。welcome session 的 panelIds/judgeIds 也清空。

**注意**：老用户需 `localStorage.clear()` 才能看到效果（旧 config 已存了假 Provider）。
