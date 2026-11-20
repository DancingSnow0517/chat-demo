# chat

[English](README.md) | 简体中文

基于 DeepSeek API 的聊天应用。本仓库是 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 的云端化分支：会话、附件与鉴权由 Cloudflare Workers + D1 + R2 承载，浏览器不再直接持有 API Key，任意设备登录即用。

点击 [在线体验](https://chat.dancingsnow.xyz) 即可使用。

## 运行

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/DancingSnow0517/chat.git
cd chat
pnpm install
pnpm dev
```

开发服务器默认把 `/api` 代理到本地 Worker（`http://localhost:8787`）。需要另外启动 Worker：

```sh
cd worker
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到 GitHub Pages 等静态托管。

## 功能

- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。
- GitHub OAuth 登录，会话与附件云端同步。

## 数据

- 会话、附件原件、导入暂存保存在 Cloudflare D1 / R2。
- 语言、主题、位置、朗读音色、思考/搜索开关等设备偏好保存在浏览器 localStorage。
- DeepSeek API Key 只保存在 Cloudflare Worker Secret，浏览器不接触。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部云端会话和附件；导出包含会话与本地可用的图片原件。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。

## 开发

| 命令          | 用途                |
| ------------- | ------------------- |
| `pnpm dev`    | 启动开发服务器      |
| `pnpm build`  | 构建到 `dist/`      |
| `pnpm type`   | TypeScript 类型检查 |
| `pnpm lint`   | oxlint 检查         |
| `pnpm format` | oxfmt 格式化        |

```text
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、云端存储与历史导入导出
    markdown/          Markdown 解析、代码高亮与图表
    speech/            录音与朗读
  utils/               通用工具
worker/                Cloudflare Worker（鉴权、LLM 代理、D1/R2 存储）
```

## 与上游同步

本分支尽量保持与上游的目录结构一致，改动集中在：

- `src/services/api/client.ts` / `speech.ts`：去掉 apiKey 参数，改走同源相对路径。
- `src/services/chat/db.ts`：IndexedDB 实现替换为 fetch 调用，函数签名不变。
- `src/services/chat/drafts.ts` / `attachments.ts` / `store.ts`：移除 apiKey 参数透传。
- `src/components/settings/`：API Key 区块替换为账户/登出区块；新增 `Login.tsx`。
- `src/services/settings.ts`：移除 `apiKey` 字段。
- `src/i18n/zh.ts` / `en.ts`：替换 apiKey 相关文案。

拉取上游更新：

```sh
git fetch upstream
git merge upstream/main
# 冲突集中在上述文件；解决后跑 pnpm type && pnpm lint
```

Worker 代码在 `worker/` 目录，与前端独立发版，详见 [worker/wrangler.toml](worker/wrangler.toml)。

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自的许可证。
