# 已完成功能清单

> v0.1.3 · 全部 ✅ 验证通过（65/65 测试 · tsc 0 · build OK）

## 核心编排能力

| 模块 | 文件 | 说明 |
|---|---|---|
| **多轮记忆（滑窗）** | `services/memoryBuilder.ts` | 每 Panel/Judge 独立历史，滑窗 N 轮，会话级开关 |
| **分层摘要记忆** | `services/summarizer.ts` | 超限时调模型压缩早期对话（con.txt 四类），持久化到 session.summary |
| **文档输入** | `services/fileReader.ts` | txt/md 浏览器 file input，会话级附件，为 Map-Reduce 铺路 |
| **Schema 抽取** | `services/schemaValidator.ts` | verdict/extract 双模式 Judge，轻量校验 + 3 次重写循环 |
| **Map-Reduce** | `services/mapreduceStrategy.ts` | 每份文档并行 Map → Reduce 合并，自适应触发（单次优先） |
| **ASR 清洗** | `services/cleaner.ts` | 附件加载时修错别字，会话级开关默认关 |
| **document_analysis** | `hooks/useMoa.ts` send | 先提取→多模型分析→Judge综合（三阶段完整链路） |

## 三阶段架构（taskType 替代 outputMode）

- **types/moa.ts**：`taskType` 替代旧 `outputMode`；`outputKind` 解耦引擎内部
- **向后兼容**：normalizeSessionConfig 映射老 outputMode → taskType
- **单模型降级**：只有 1 个 Provider 时隐藏 Panel/Judge/角色（极简配置栏）
- **配置按执行阶段排序**：任务 → 提取结构 → 专家 → 裁决+分析风格
- **互斥显示**：提取结构只在文档任务显示，分析风格只在分析/问答显示
- 详见 `docs/THREE_STAGE_ARCHITECTURE.md`

## 体验改进

| 功能 | 文件 | 说明 |
|---|---|---|
| ⏱ 运行计时 | `hooks/useElapsed.ts` + `components/TurnTimer.tsx` | 每秒 tick，running turn 显示 |
| 🛑 Stop 按钮 | `httpClient.ts` streamChat 加 externalSignal | AbortController 取消，引擎透传+aborted检查 |
| 📊 阶段进度 | `components/MapReduceMessage.tsx` | Map X/N + Reduce waiting/merging |
| 📋 复制为 MD | `services/jsonToMd.ts` | extract/mapreduce 结果旁按钮 |
| 🧹 清洗状态 | `components/ChatInput.tsx` | chip 三态：无标记/清洗中…/已清洗 |

## 基础设施

- **.env 配置**：`services/envConfig.ts`，VITE_ 前缀，双 Provider（PROVIDER + PROVIDER2）
- **.env 种子注入**：首次启动自动填充 Provider（config.json 不存在时）
- **语言过滤**：`services/templateFilter.ts`，中英文模板按界面语言显示
- **模板管理**：Settings → 📋 Schemas tab，4 个预置 Schema（en/zh 各 2）
- **帮助文档**：HelpModal 全面更新（三阶段 + 配置说明 + 核心流程 + 适用场景）
- **预置 Provider 清空**：config.template.json providers=[]，只靠 .env 种子
- **欢迎页**：图标 + 标题（MoA Synthesis Engine），无示例问题噪音

## 引擎核心（moaEngine.ts）

- `Promise.all` 并发 Panel（永不 reject → 防失血）
- Panel 单次重试（瞬态错误 800ms 重试；401/403 不重试）
- Judge 失败降级（展示 Panel 原始回答）
- 熔断器 checkInputLimits（prompt/context 字符上限）
- Map-Reduce 早期分支（taskType=document_extract + attachments）
- runSingleJudge 校验重写循环（extract 模式最多 3 次）
- document_analysis 阶段1 提取 → 阶段2 Panel → 阶段3 Judge

## 协议适配（httpClient.ts）

- OpenAI / Anthropic 双协议（streamChat 按 protocol 切换）
- SSE 流式 + 非流式自动回退
- Base URL 规范化 normalizeBase
- testProvider 连接测试
- 外部 cancel signal（Stop 按钮）

## 配置持久化（configStore.ts）

- 明文 config.json 存 appDataDir（Windows: %APPDATA%\com.verdex.app\）
- 异步加载 + 防抖 600ms 写盘
- 浏览器 dev 兜底（localStorage）+ 旧格式迁移
