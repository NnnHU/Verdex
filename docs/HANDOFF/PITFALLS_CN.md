# ⚠️ 踩过的坑（绝对不要再踩）

> 9 个真实踩过的坑 + 2 个架构教训 + 2 个 benchmark 时代的坑。新会话务必先读。
> 最后更新：2026-08-02

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
**详见**：`docs/ORCHESTRATION_ROADMAP_CN.md` 性能分析 + `scripts/perf-test.mjs`。

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

---

## Benchmark 坑 1：extract 空响应下毒了整条流水线

**症状**：M2/M3 的输出读作"无法回答 —— 提取的知识为空"；评分者给它们打 1/5。
**根因**：extract 预处理阶段（直接 `streamChat`，没有重试）在 DeepSeek 上频繁返回空字符串。这个空的"提取出来的知识"被喂给 Panel 和 Judge，他们正确地报告自己无法回答 —— 但这*整个回合*看起来像是一次模型失败，而实际上只是 extract 这一步失败了。
**修复**：在 extract 步骤上加 `streamChatWithRetry`（4 次尝试、1.2s 退避）。可用 case 比例从 1/13 升到 7/13。
**教训**：在一条多步流水线里，*任何一处*的空响应都会无声地拖垮下游的一切。每一个喂给下一步的阶段都需要它自己的空响应守卫，而不只是最后一次调用。

---

## Benchmark 坑 2：解析占位符被算作成功（最危险的 bug）

**症状**：自动生成的 benchmark SUMMARY 对每个 mode 都报"100% 成功" —— 干净得不可信。
**根因**：`parseJudgeResponse` 在失败时会吐出非空的占位字符串（`"(could not parse structured consensus)"`、`"(judge returned no content)"`）。一个天真的"非空字段 = 成功"判定把这些占位符算成了成功，于是隐藏了单次 mode 真实约 31% 的失败率。
**修复**：引入 `isPlaceholder()` 把解析回退字符串排除掉；成功要求的是*真实*内容，而不只是非空字符串。
**教训**：*最危险的失败，是那些看起来像成功的失败。* 永远拿"合理性"去对账那些"过于干净"的结果，并按内容有效性 —— 而不是结构上的非空 —— 来定义成功。这个 bug 如果没被抓出来，会让整个 benchmark 毫无价值。
