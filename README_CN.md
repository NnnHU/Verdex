# Verdex

> 纯本地端、无服务器的多模型裁判综合引擎（MoA Synthesis Engine）桌面客户端。

让多个 AI 模型并行作答（Panel 层），再由裁判模型综合出结构化的四段裁决（核心共识 / 观点碰撞 / 独特盲点 / 最终裁决）。所有数据纯本地存储，API 请求由本地直接发起，不上传任何服务器。

[English README](./README.md)

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2.0（Rust 后端 + WebView 前端） |
| 前端 | React 18 + TypeScript 5 |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS v4（CSS-first，通过 CSS 变量支持主题切换） |
| 国际化 | react-i18next（默认英文，可切中文） |
| 持久化 | 明文 `config.json`（appDataDir）+ 浏览器 localStorage 兜底 |
| AI 调度 | 纯原生 TS 异步（Promise.all），无 LangChain/AutoGen |
| 测试 | Vitest（26 个单元测试） |

**拒绝任何第三方 AI 框架。无后端服务器。**

## 快速开始

### 环境要求
- Node.js 18+
- Rust 工具链（`rustup` 安装；`cargo --version` 验证）
- Windows: WebView2（Win10/11 自带）

### 安装与运行
```bash
npm install
npm run tauri dev      # 桌面应用开发模式（首次编译 Rust 约 1-2 分钟）
```

纯前端调试（浏览器，无 Tauri 桌面壳，API 受 CORS 限制）：
```bash
npm run dev            # 访问 http://localhost:1420
```

### 验证
```bash
npx tsc --noEmit       # 类型检查
npm test               # 单元测试（26 个）
npm run build          # 前端打包
```

## 使用方法

1. **填 API Key**：左侧栏 → ⚙️ 设置 → 模型供应商标签 → 每个 provider 填入 Base URL + API Key + 模型名
2. **测试连接**：点「🔌 测试连接」并发探测每个 provider（绿=通过，红=错误详情）。上下文窗口自动从 API 或内置数据库（40+ 模型）检测，显示在徽章中（如 `✓ 234ms · 128K ctx`）。
3. **选模式**：配置栏切换简单/高级模式，选择 Panel 和 Judge
4. **提问**：底部输入框，`Ctrl/Cmd+Enter` 发送

### 配置文件位置
- **Windows**: `%APPDATA%\com.verdex.app\config.json`
- 明文 JSON，可直接编辑/备份。含 providers（含 API Key）、角色模板、Judge 提示词、全部会话历史、语言、主题。

## 核心功能

### MoA 综合引擎
- **Panel 并发**：多个模型通过 `Promise.all` 并行作答（防失血——单个失败不阻塞其他）
- **Panel 重试**：瞬态错误（超时/5xx/429）800ms 后重试 1 次；鉴权错误（401/403）不重试
- **Judge 综合**：四段结构化裁决（共识/碰撞/盲点/裁决）
- **多裁判对撞**（高级模式）：多个裁判各出独立裁决，刻意保留分歧
- **降级展示**：裁判失败时直接展示各 Panel 原始回答
- **智能熔断器**：输入上限自动从选中模型中最小的上下文窗口推导（或内置 40+ 模型数据库）。测试连接自动检测上下文大小。

### 双协议适配
| | OpenAI 兼容 | Anthropic 原生 |
|---|---|---|
| 端点 | `/chat/completions` | `/v1/messages` |
| 鉴权 | `Bearer` | `x-api-key` + `anthropic-version` |
| system 处理 | 留在 messages | 提取到顶层 `system` 参数 |
| SSE 流式 | `choices[0].delta.content` | `content_block_delta.delta.text` |

Base URL 自动规范化：去尾斜杠、去 `/chat/completions` 后缀、Anthropic 智能 `/v1` 去重。

支持：DeepSeek、Qwen、Groq (Llama)、OpenRouter、NVIDIA、Anthropic (Claude) 及任何 OpenAI 兼容端点。

### 国际化（i18n）
- 默认语言：**英文**
- 可切换至 **中文**（左侧栏语言下拉）
- 内置提示词模板（5 个角色 + 3 个 Judge 提示词）提供中英双语版本
- 语言选择持久化到 `config.json`

### 主题系统
通过左侧栏主题下拉切换三种主题：
- **Dark 深色**（默认）：深蓝黑画布，blue/purple 强调色
- **Light 浅色**：白底深灰文字，蓝色强调
- **Soft 柔和**：暖灰底，violet 强调色——护眼不刺眼

所有颜色均为 CSS 变量——修改 `src/index.css` 即可自定义任意主题。

### 角色模板与 Judge 提示词
- 5 个内置 Panel 角色模板（批判性审视、结构化拆解、实证核查、魔鬼代言人、第一性原理）
- 3 个内置 Judge 提示词模板（默认四段裁决、严格逻辑审计、多视角综合）
- 通过 设置 → 提示词模板标签 完全可编辑
- 模板为中性通用思维工具

## 项目结构

```
Verdex/
├── package.json · vite.config.ts · tsconfig.json · index.html
├── src/
│   ├── main.tsx · App.tsx · index.css · vite-env.d.ts
│   ├── i18n/                     ← i18next 初始化 + en.json + zh.json
│   ├── types/moa.ts              ← 全部数据结构（单一真相源）
│   ├── services/
│   │   ├── httpClient.ts         ← 双协议适配 + SSE 流式 + testProvider
│   │   ├── moaEngine.ts          ← Promise.all 并发调度 + 熔断器
│   │   ├── configStore.ts        ← config.json 读写 + 模板兜底
│   │   └── config.template.json  ← 出厂默认配置（双语模板）
│   ├── hooks/useMoa.ts           ← 状态机 + CRUD + 异步加载 + 防抖写盘
│   └── components/               ← Sidebar / MoAConfigBar / SettingsModal(标签页)
│       │                           JudgeMessage / PanelCollapseGroup / UserMessage
│       │                           ChatInput / HelpModal
├── test/                         ← Vitest 单元测试
└── src-tauri/
    ├── Cargo.toml · tauri.conf.json · capabilities/default.json
    └── src/{lib.rs, main.rs}     ← 注册 http + fs 插件
```

## 安全说明

- **API Key 明文存储**在 `config.json` 中。请勿将该文件推送到公开 Git 仓库或同步到不受信任的云盘。
- 所有数据纯本地，无任何上传。
- 内置熔断器防止并发刷爆 API 额度。
