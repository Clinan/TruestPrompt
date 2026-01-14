# TruestPrompt

PC Web 端的「大模型调试台」，用同一份 User Prompt + Tools，快速对比不同模型/不同系统提示词的输出与耗时指标。

## 核心特性

- **多模型并行对比** - 多 Slot 槽位独立运行，快速 A/B 测试
- **系统提示词快速迭代** - 每个 Slot 独立 System Prompt，支持复制/新增/删除
- **工具调用可视化** - Tool Calls 展示、可折叠代码块、语法高亮
- **一键导出 cURL** - 方便调试和分享
- **本地历史追溯** - Star 标记、搜索筛选、一键载入回放
- **项目管理** - 多项目完全隔离，独立的 Provider、历史、配置
- **网关模式** - 支持 LLM Proxy Gateway，OAuth SSO 登录，无需管理 API Key
- **便捷分享** - 一键生成分享链接，自动配置网关并跳转登录

## 技术栈

- Vue 3 + TypeScript + Vite
- Ant Design Vue - 企业级 UI 组件
- LangUI 风格 - AI 对话气泡样式
- pnpm 包管理

## 快速开始

```bash
# 安装依赖
pnpm install

# 本地开发
pnpm dev

# 构建
pnpm build

# 运行测试
pnpm test
```

## 界面布局

采用**顶部工具栏驱动**的简洁单栏布局，主页面专注于 Prompt 调试：

```
┌─────────────────────────────────────────────────────────────┐
│  🔷 TruestPrompt  [Project ▼] │ [Provider] [Params] [Tools] │
│                               │ [Vars] [History] [🌙]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📝 Prompt Composer                          [+ Add Msg]   │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ [user ▼]  Hello, please help me with...        [🗑️]  │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  🎰 Slots Lab                               [+ Add Slot]   │
│  ┌─────────────────────┐  ┌─────────────────────┐         │
│  │ [Provider] [Model]  │  │ [Provider] [Model]  │         │
│  │ System Prompt...    │  │ System Prompt...    │         │
│  │ [▶ Run] [📋] [🗑️]  │  │ [▶ Run] [📋] [🗑️]  │         │
│  │ 💬 Output bubble... │  │ 💬 Output bubble... │         │
│  │ TTFB: 120ms         │  │ TTFB: 95ms          │         │
│  └─────────────────────┘  └─────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## 便捷分享功能

### URL 参数自动配置

支持通过 URL 参数自动配置网关并跳转登录，方便团队分享：

```
https://app.example.com?gateway=https://gateway.example.com&project=MyProject&autoLogin=true
```

**支持的参数：**

| 参数 | 说明 | 默认值 |
|-----|------|--------|
| `gateway` 或 `gatewayUrl` | 网关地址 | - |
| `clientId` 或 `client_id` | 客户端ID | `truestprompt` |
| `project` 或 `projectName` | 项目名称 | - |
| `autoLogin` 或 `auto_login` | 自动跳转登录 | `true` |

### 分享流程

1. **配置网关** - 在 Provider 管理中连接 LLM Proxy Gateway
2. **点击分享** - 工具栏中的"分享"按钮（仅网关模式显示）
3. **复制链接** - 自动生成包含网关配置的分享链接
4. **团队使用** - 其他用户打开链接自动配置并跳转登录

### 使用场景

- **团队协作** - 快速分享调试环境给同事
- **演示展示** - 一键分享给客户或合作伙伴
- **培训教学** - 为学员预配置好环境

## 网关模式

### LLM Proxy Gateway 接入

支持通过 OAuth SSO 方式接入企业级 LLM 代理网关，无需管理各厂商 API Key：

**优势：**
- 🔐 **安全** - 前端无需存储 API Key，通过 OAuth 获取临时 Token
- 🏢 **企业级** - 支持统一的用户认证和权限管理
- 🔄 **自动同步** - 登录后自动获取可用的 Provider 和模型列表
- 📊 **统一计费** - 后端统一管理各厂商的用量和计费

**配置步骤：**
1. 在 Provider 管理中选择"网关模式"
2. 填写网关地址和客户端ID（默认：truestprompt）
3. 点击"连接网关"跳转 OAuth 登录
4. 登录成功后自动导入可用的 Provider

**网关要求：**
- 实现 OAuth 2.0 + PKCE 认证流程
- 提供 OpenAI Compatible API 接口
- 支持 `/api/llmproxy/providers` 端点获取 Provider 列表

> 详细接入文档：[LLM Proxy Gateway 接入文档](LLM%20Proxy%20Gateway%20接入文档.md)

## 功能模块

### 项目管理

支持创建多个独立项目，每个项目的数据完全隔离：
|-----|------|
| 新建项目 | 点击项目下拉框 → 新建项目 |
| 切换项目 | 从下拉框选择目标项目 |
| 重命名 | 悬停项目名 → 点击编辑图标 |
| 删除项目 | 悬停项目名 → 点击删除图标（默认项目不可删除） |

**隔离的数据：**
- Provider 配置（API Key、Base URL）
- 编辑器状态（Slots、Prompts、Tools、Variables）
- 历史记录
- 模型缓存

**全局共享：**
- 主题偏好（浅色/深色）

### 工具栏

| 按钮 | 功能 |
|-----|------|
| Provider | 管理 API 密钥和连接配置 |
| Params | 配置 temperature、top_p、max_tokens |
| Tools | 编辑 Function Calling 工具定义 (JSON) |
| Vars | 管理模板变量 `{{变量名}}` |
| History | 查看运行历史记录 |
| 🌙 | 切换浅色/深色主题 |

### Prompt Composer

- 多消息编辑器，支持 user/system/assistant 角色
- 变量自动补全（输入 `{{` 触发）
- 拖拽排序消息
- 自动保存到 localStorage

### Slot 卡片

- 独立选择 Provider 和 Model
- 独立 System Prompt 编辑
- 独立运行/停止
- 复制 Slot 快速 A/B 测试
- 导出 cURL 命令

### 输出展示

- LangUI 风格对话气泡
- 流式输出 + 打字光标动画
- 指标徽章：TTFB、总耗时、Token 用量
- Tool Calls 可折叠展示

## 插件系统

内置插件：
- OpenAI Compatible (Chat Completions)
- 阿里云 DashScope
- Kimi (Moonshot)
- 方舟 Ark

> 💡 接入新模型厂商？参考 [插件接入指南](docs/PLUGIN_INTEGRATION.md)

每个插件实现统一接口：
```typescript
interface Plugin {
  listModels(config) -> ModelInfo[]
  invokeChat(config, request, { stream }) -> Stream | Promise
  buildCurl(config, request) -> string
}
```

## 数据结构

### Slot（调试槽位）
```typescript
interface Slot {
  id: string
  providerProfileId: string | null
  pluginId: string
  modelId: string
  systemPrompt: string
  paramOverride: Record<string, unknown> | null
  status: 'idle' | 'running' | 'done' | 'error' | 'canceled'
  output: string
  toolCalls: ToolCall[] | null
  metrics: { ttfbMs, totalMs, tokens }
}
```

### Shared State（全局共享）
```typescript
interface SharedState {
  userPrompts: UserPromptPreset[]
  toolsDefinition: string
  variables: Variable[]
  defaultParams: { temperature, top_p, max_tokens }
}
```

### History Item（历史记录）
```typescript
interface HistoryItem {
  id: string
  createdAt: number
  star: boolean
  title: string
  providerProfileSnapshot: ProviderProfile
  requestSnapshot: { systemPrompt, userPrompt, tools, params, modelId }
  responseSnapshot: { outputText, toolCalls, usage, metrics }
}
```

## 键盘快捷键

| 快捷键 | 功能 |
|-------|------|
| `Ctrl + .` | 停止所有运行中的 Slot |
| `Escape` | 关闭当前模态框 |
| `Tab` | 焦点导航 |

## 存储说明

- **Provider 配置** - localStorage（按项目隔离，含 API Key，注意安全风险）
- **编辑器状态** - localStorage（按项目隔离）
- **历史记录** - IndexedDB（按项目隔离）
- **模型缓存** - IndexedDB（按项目隔离）
- **主题偏好** - localStorage（全局共享）
- **项目列表** - localStorage（全局）

⚠️ API Key 存储在 localStorage 有被同域脚本读取的风险，请谨慎使用。提供一键清空密钥功能。

## 项目结构

```
src/
├── components/
│   ├── layout/          # 布局组件
│   │   ├── AppToolbar.vue
│   │   ├── MainWorkspace.vue
│   │   └── ProjectSelector.vue
│   ├── prompt/          # Prompt 编辑器
│   │   ├── PromptComposer.vue
│   │   └── MessageItem.vue
│   ├── slots/           # Slot 卡片
│   │   ├── SlotsGrid.vue
│   │   ├── SlotCard.vue
│   │   └── OutputBubble.vue
│   ├── modals/          # 模态框
│   │   ├── ProviderModal.vue
│   │   ├── ParamsModal.vue
│   │   ├── ToolsModal.vue
│   │   └── VarsModal.vue
│   └── drawers/         # 抽屉
│       └── HistoryDrawer.vue
├── composables/         # 组合式函数
│   └── useProjectManager.ts
├── styles/              # 样式文件
│   ├── theme.css        # 主题变量
│   ├── animations.css   # 动画定义
│   └── langui.css       # LangUI 风格
└── lib/                 # 工具库
    └── storage.ts       # 项目隔离存储服务
```

## 设计规范

### 动画时长
- 快速：150ms（按钮点击）
- 正常：200ms（模态框）
- 慢速：300ms（主题切换、抽屉）

### 颜色系统
- 对话气泡采用 LangUI 风格
- 表单组件采用 Ant Design Vue 设计语言
- 支持浅色/深色主题，满足 WCAG AA 对比度标准

## 非目标

明确边界，避免功能膨胀：
- ❌ 账号体系
- ❌ 云端存储
- ❌ 多人协作
- ❌ 服务端代理

## License

MIT
