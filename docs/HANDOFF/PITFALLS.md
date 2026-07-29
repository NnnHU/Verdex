# ⚠️ 踩过的坑（绝对不要再踩）

> 9 个真实踩过的坑 + 2 个架构教训。新会话务必先读。
> 最后更新：2026-07-29

---

## 坑 1：React Hooks 规则——early return 必须在所有 hooks 之后

**症状**：黑屏崩溃。
**根因**：`App.tsx` 的 `if (!moa.loaded) return` 放在 `useEffect` 之前 → hooks 数量变化 → React 崩溃。
**铁律**：所有 hooks 必须在任何 `if (...) return` 之前无条件执行。

---

## 坑 2：bash 里 `%APPDATA%` 不展开

**症状**：`cmd /c "...%APPDATA%..."` 查文件永远 NOT_FOUND。
**根因**：bash 不认 Windows cmd 的 `%VAR%` 语法。
**正确**：用正斜杠全路径或 `echo $APPDATA`。

---

## 坑 3：Tauri 2 fs 权限用 `fs:allow-appdata-*`

**症状**：fs 写盘静默失败。
**根因**：通用权限默认 scope 为空。
**配置**：`fs:allow-appdata-read/write/meta`。

---

## 坑 4：端口 1420 占用

**症状**：`Port 1420 is already in use`。
**处理**：`netstat -ano | grep ":1420" | grep LISTENING` → `cmd //c "taskkill /F /PID <pid>"`。
**注意**：`taskkill /F` 在 bash 里用 `cmd //c`。

---

## 坑 5：Vite env 改了必须重启 dev server

**症状**：改了 `.env` 没生效。
**根因**：`import.meta.env` 是构建时注入，HMR 不重读 `.env`。
**正确**：停 server → 重启 → 刷新。

---

## 坑 6：outputMode 混了两个维度（已修复）

**症状**：用户分不清 Verdict/Extract/Map-Reduce 关系。
**修复**：拆成 `taskType`（session 级）+ `outputKind`（引擎内部）。

---

## 坑 7：Map-Reduce 对大模型是负优化

**症状**：7 份文档走 Map-Reduce 比 Extract 慢 4-5 倍。
**根因**：大模型单次 36-47s，Reduce 合并 119-187s。
**修复**：阈值改"单次优先"（>15 万字符才触发）。
**详见**：`docs/ORCHESTRATION_ROADMAP.md` 性能分析 + `scripts/perf-test.mjs`。

---

## 坑 8：cleanAttachment 闭包时序 bug

**症状**：「已清洗」标记不出现。
**根因**：闭包 sessions 读不到刚 addAttachments 的新附件。
**修复**：cleanAttachment 接受 sourceText 参数。

---

## 坑 9：预置假 Provider 污染界面

**症状**：每次显示 Llama/Qwen/DeepSeek/Claude 空假模型。
**修复**：config.template.json providers=[]，只靠 .env 种子。

---

## 架构教训 1：template JSON 缺新字段 → 黑屏

**症状**：localStorage.clear() 后黑屏 `Cannot read properties of undefined (reading 'length')`。
**根因**：config.template.json 没有 `knowledgeAssets`/`assetCategories` 字段，template spread 后为 undefined。
**修复**：loadConfig 的 template 分支加 `?? []` 兜底。
**教训**：每次给 ConfigFile 加新字段，**必须同步更新 template 兜底**。

---

## 架构教训 2：React StrictMode 双调用 → 重复 Asset

**症状**：保存一次出现两个相同 Asset。
**根因**：dev 模式下 setSessions 函数式更新被调用两次。
**修复**：packedTurnsRef（Set<turnId>）去重。
**教训**：任何在 setSessions/setXxx 函数式更新里的副作用（如派生 state 写入），都要加去重守卫。
