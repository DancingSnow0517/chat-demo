# chat 云端化改造方案（Cloudflare Workers + D1 + R2）

目标：把纯本地存储的静态聊天应用改造成"一次部署、任意设备登录即用"的个人云服务，还原 DeepSeek 网页版的使用体验。单账户，不考虑多用户。

状态：**已实施**。域名 `chat.dancingsnow.xyz`，Worker 代码在 `worker/`，前端已适配。

## 1. 目标架构

```
浏览器（现有 SPA，GitHub Pages 托管 + CF 边缘缓存）
   │  同源请求，HttpOnly Cookie 鉴权
   ▼ Cloudflare（chat.dancingsnow.xyz）
   ├── /api/*            → Worker
   │     ├── /api/auth/*     → GitHub OAuth 登录、会话签发、登出
   │     ├── /api/storage/*  → D1（会话/草稿/原件索引）+ R2（附件原件）
   │     └── /api/llm/*      → 注入 DeepSeek Key，代理 api.deepseek.com（SSE 透传）
   └── 其余路径           → 回源 GitHub Pages（静态产物）
```

- 前端仍托管在 GitHub Pages，域名 CNAME 到 Cloudflare（橙云）；Worker 用路由 `chat.dancingsnow.xyz/api/*` 接管 API 路径，其余流量回源 Pages。前后端同源，无 CORS。
- DeepSeek API Key 从浏览器彻底移除，只存在于 Worker Secret。
- 数据主体在 D1（会话、草稿、附件索引）和 R2（附件原件），任意设备打开即同步。

## 2. 鉴权设计（细化）

### 2.1 方案选择

单用户场景下的候选：

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| GitHub OAuth + 账号白名单 | 无口令可泄露，强度继承 GitHub 账户（可挂 2FA/Passkey），无暴力破解面 | 登录瞬间浏览器需能访问 github.com | **采用** |
| 访问口令 + 签名 Cookie | 无第三方依赖 | 强度自负，需限流防爆破，泄露面大 | 不做 |
| WebAuthn/Passkey | 最安全 | 实现复杂，单设备绑定与"任意设备可用"目标冲突 | 不做 |

### 2.2 一次性准备

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App：
   - Homepage URL：`https://chat.dancingsnow.xyz`
   - Authorization callback URL：`https://chat.dancingsnow.xyz/api/auth/github/callback`
   - 拿到 Client ID 与 Client Secret。
2. 查询自己账号的**数字 user id**（`https://api.github.com/users/<用户名>` 的 `id` 字段）。用数字 id 而非用户名做白名单：用户名可改，id 不可变。

**密钥材料（Worker Secrets / Vars）：**

- `GITHUB_CLIENT_ID`：OAuth App 的 Client ID（非敏感，可放 `wrangler.toml` 的 `[vars]`）。
- `GITHUB_CLIENT_SECRET`：OAuth App 的 Client Secret（Secret）。
- `ALLOWED_GITHUB_ID`：允许登录的数字 user id（Secret；单用户白名单的唯一依据）。
- `SESSION_SECRET`：32 字节随机 hex，签名会话 Cookie 的 HMAC 密钥（Secret）。
- `DEEPSEEK_API_KEY`：DeepSeek API Key（Secret）。

### 2.3 登录链路

```
点击「使用 GitHub 登录」
  → GET /api/auth/github
      Worker 生成随机 state（16 字节 hex）写入短时效 Cookie
      （HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600，防 CSRF），
      302 到 https://github.com/login/oauth/authorize?client_id=...&state=...&scope=read:user
  → GitHub 授权页（同一浏览器授权过则跳过，直接回跳）
  → GET /api/auth/github/callback?code=...&state=...
      1. 校验 state 与 Cookie 一致、未过期，随后立即清除 state Cookie（一次性）
      2. POST https://github.com/login/oauth/access_token
         （code + client_id + client_secret，Accept: application/json）换 access_token
      3. GET https://api.github.com/user（Authorization: Bearer <token>）取数字 id
      4. id === ALLOWED_GITHUB_ID → 签发会话 Cookie，302 回 /
      5. 不匹配 → 302 回 /?login_error=denied
```

- `read:user` scope 只读公开资料，授权页无敏感权限提示。
- access_token 仅在回调内使用，**不落库、不写 Cookie**——它对本应用没有任何后续价值，白名单校验通过即丢弃。
- state 校验失败、code 换 token 失败、`/user` 请求失败：统一 302 回 `/?login_error=github`，前端展示通用"GitHub 登录失败，请重试"，不区分具体环节（细节进 Worker 日志）。

### 2.4 会话 Cookie

- 令牌为 HS256 JWT（jose 库），payload 含 `exp`，签名密钥为 `SESSION_SECRET`。无服务器端会话表，无状态验证。
- Cookie 属性：`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`（30 天）。不绑定设备指纹——"在哪都能用"要求换网络、换 UA 不失效。
- **无滑动续期**：30 天到期后重新走 OAuth。滑动续期需要每次响应重写 Cookie，与 SSE 长连接并存时会引入"旧连接覆盖新 Cookie"的竞态，单用户场景收益不值得这个复杂度。
- 每个 `/api/*` 请求（`/api/auth/github` 与回调除外）经鉴权中间件：解析 Cookie → 校验 HMAC → 校验 `exp`。失败返回 `401 { "error": "unauthorized" }`。
- 登录链路本身无暴力破解面（state 是随机数，code 一次性且绑定 client），**不需要限流规则**。

**登出：** `POST /api/auth/logout`，写 `Max-Age=0` 的同名会话 Cookie。

### 2.5 前端状态

- 启动时 `GET /api/auth/session`（鉴权中间件内验证），200 即已登录，401 跳登录页。不持久化"已登录"标志到 localStorage，以服务端为准。
- 登录页是一个独立小组件：**一个「使用 GitHub 登录」按钮**（`location.href = '/api/auth/github'`），无表单、无口令输入。URL 带 `login_error` 参数时显示对应错误提示（denied / github）。
- 前端在 OAuth 流程里只有按钮和回跳落地两个动作，不参与 code/token 处理。

## 3. API 出口改造清单

前端对 DeepSeek 的全部网络出口，以及改造方式：

| 位置 | 现状 | 改造 |
|---|---|---|
| [client.ts](../src/services/api/client.ts) `API_ORIGIN` | 构建期注入 `https://api.deepseek.com` | 改为同源相对路径 `/api/llm`；`__API_ORIGIN__` 定义保留给本地开发（见 §8） |
| [client.ts](../src/services/api/client.ts) `verifyApiKey` | `GET /models` 带 Bearer 校验 Key | 删除，由 `GET /api/auth/session` 取代（设置页改为展示"已连接"状态，或整个 API Key 区块替换为登录/登出区块） |
| [client.ts](../src/services/api/client.ts) `anthropicHeaders` | `x-api-key` + `anthropic-beta` | 浏览器不再发 `x-api-key`；`anthropic-beta: files-api-2025-04-14` 由 Worker 转发时注入 |
| [client.ts](../src/services/api/client.ts) `uploadFile` / `deleteFile` | POST/DELETE `/anthropic/v1/files` | URL 前缀换为 `/api/llm/anthropic/v1/files`，其余不变（multipart 透传） |
| [client.ts](../src/services/api/client.ts) `streamMessage` | POST `/anthropic/v1/messages` SSE | URL 前缀同上；SSE 消费逻辑（`readServerSentEvents`）不变，依赖 Worker 不缓冲透传 |
| [speech.ts](../src/services/api/speech.ts) `transcribe` / `synthesize` | POST `/v1/tools/asr|tts`，Bearer | URL 前缀换为 `/api/llm/v1/tools/...`；ASR ≤8MiB multipart、TTS PCM 流式均透传 |
| [settings.ts](../src/services/settings.ts) `apiKey` | localStorage 存 Key | 删除 `apiKey` 字段与 `setApiKey`；所有 `useSettings.getState().apiKey ?? ''` 调用点（[store.ts](../src/services/chat/store.ts)、[drafts.ts](../src/services/chat/drafts.ts)、[readAloud.ts](../src/services/speech/readAloud.ts)、[useVoiceInput.ts](../src/components/chatInput/useVoiceInput.ts)、[ChatInput.tsx](../src/components/chatInput/ChatInput.tsx)、[attachments.ts](../src/services/attachments.ts) 的 `uploadAttachment(apiKey, ...)` 签名）同步去掉该参数 |
| 设置页 [ApiKeyField.tsx](../src/components/settings/ApiKeyField.tsx) / [useApiKeyForm.ts](../src/components/settings/useApiKeyForm.ts) | Key 输入与校验 UI | 替换为账户区块：已登录账号展示、登出按钮 |
| 错误提示 [describe.ts](../src/services/chat/describe.ts) `action: 'apiKey'` | 提示"API Key 无效请更换" | 401 时改为跳转登录页（鉴权失败语义）；DeepSeek 侧返回的 Key 无效错误理论上不再出现（Key 是服务端配置），保留文案降级为通用错误 |
| i18n [zh.ts](../src/i18n/zh.ts) / [en.ts](../src/i18n/en.ts) | apiKey* 文案 | 删除 apiKey* 系列，新增 login* / logout* 文案 |

**设置类数据（语言、主题、位置、音色、开关）仍留 localStorage**——它们是设备偏好（比如手机和桌面主题不同才合理），不做同步。只有 `apiKey` 被移除。

## 4. 上下文存储设计

### 4.1 D1 Schema

```sql
-- 会话：data 为 Session 整体 JSON（含消息分支树），与现 IndexedDB sessions 表同构
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  data        TEXT               -- ≤1.9MB 内联；超限时为空，见 body_r2_key
  body_r2_key TEXT,              -- 非空时会话 JSON 存 R2，data 为空
  body_size   INTEGER NOT NULL   -- JSON 字节数，用于列表页之外的诊断与阈值判断
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

-- 附件原件索引：blob 在 R2，key 固定为 files/{id}
CREATE TABLE files (
  id        TEXT PRIMARY KEY,    -- 与前端 FileAttachment.id 一致
  mime_type TEXT NOT NULL,
  size      INTEGER NOT NULL
);

-- 会话对附件的引用（对应现 sessionSummaries.fileIds 索引）
CREATE TABLE session_files (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_id    TEXT NOT NULL REFERENCES files(id),
  PRIMARY KEY (session_id, file_id)
);

-- 导入暂存（对应现 sessionsStaging/filesStaging 两阶段提交）
CREATE TABLE staging_sessions (
  id   TEXT PRIMARY KEY,
  data TEXT NOT NULL             -- 暂存会话不超 2MB：导入归档本身受 ZIP 尺寸约束，超限直接拒绝导入
);
CREATE TABLE staging_files (
  id        TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL
);
```

设计说明：

- **摘要不单独建表**：`SELECT id, title, created_at, updated_at FROM sessions` 即摘要，`sessionSummaries` 的存在是 IndexedDB 索引模型的产物，关系库里是冗余。
- **草稿不同步**：[drafts.ts](../src/services/chat/drafts.ts) 的草稿本来就是纯内存（连 IndexedDB 都不进），附件在选中时即上传 Files API。保持现状，不引入草稿表。
- **引用计数在 SQL 里做**：删除会话时 `DELETE FROM sessions WHERE id=?`（级联清 session_files），然后 `DELETE FROM files WHERE NOT EXISTS (SELECT 1 FROM session_files WHERE file_id = files.id)`，并同步删 R2 对象——与现 [db.ts](../src/services/chat/db.ts) `deleteSession` 的"仅清理无引用原件"语义一致。DeepSeek 远端文件仍不删（现状如此，多会话共享 serverId 无引用计数）。
- **导入两阶段提交**：staging 表 + D1 事务（D1 支持 `batch` 原子提交；跨表多步写用单条事务语义重排为 batch）。R2 对象不支持事务，staging 文件先写 `staging/` 前缀，commit 时**全部读入内存后统一写入 `files/` 前缀并删除原对象**，失败时 `staging/` 前缀对象仍保留供重试。D1 事务失败时 R2 已搬迁的对象成为孤儿，不影响正式数据。

### 4.2 会话大小的结构性限制

`Session` 是"全量消息数组整体 JSON"的存储模型，随对话增长。D1 单行上限 2MB，因此：

- 序列化后 ≤1.9MB：内联 `data` 列。
- 超限：JSON 写入 R2（`bodies/{session_id}`），`data` 置空、`body_r2_key` 置位。读写路径在 Worker 存储层内透明处理，前端无感知。
- 不在第一版做"消息分行存储"：改动面大（store.ts 全量读写模型、分支树序列化、导入导出都要动），而单用户绝大多数会话远低于 1MB。

### 4.3 并发写语义

单用户也可能多标签页/多设备并发。**采用"带 updatedAt 的乐观写"**：

- `PUT /api/storage/sessions/{id}` 请求体带 `baseUpdatedAt`（客户端持有的版本）。
- Worker 执行 `UPDATE sessions SET ... WHERE id=? AND updated_at=?`；影响行数为 0 时返回 `409` 和当前服务端摘要。
- 前端收到 409：**丢弃本地覆盖，重新拉取该会话并提示**（单用户场景冲突几乎都是"另一个标签页还在流式生成"，简单重新加载即可，不做合并）。
- 现版本的内存模型（zustand 是单一事实源、persist 是异步落盘）与这个语义兼容：persist 前记录当时的 `updatedAt`。

## 5. 附件链路

两层职责保持不变：**DeepSeek Files API 的 `serverId` 管模型上下文，R2 原件管展示与补传**。

- **上传路径**：[attachments.ts](../src/services/attachments.ts) 选中即上传（≤64MB / user_data ≤32MB）：
  1. `POST /api/storage/files`（multipart 到 Worker → R2）保存原件，写入 `files` 索引；
  2. 现有 `uploadFile` 到 `/api/llm/anthropic/v1/files` 拿 `serverId`。
  
  两个上传可以并行；原件上传失败时附件只保留 `serverId`（可对话、换设备后不可查看原件——与现版本"导入后没有原件的附件"行为一致，不阻塞发送）。**注：当前实现中原件仅在发送后持久化时写入 R2（`db.saveSession`），选中附件后关闭页面会丢失未发送的草稿附件原件。**
- **读取路径**：[useFileView.ts](../src/components/files/useFileView.ts) 的 `loadFile(id)` 改为 `GET /api/storage/files/{id}`，Worker 从 R2 流式返回（带 `Content-Type` 与 `Content-Disposition`）。图片缩略图直接 `<img src>` 指向该地址，不再走 `URL.createObjectURL`（同源 + Cookie，天然鉴权）；SVG 的 data: 隔离逻辑保留，改为先 fetch 再转 data URL。
- **补传路径**：[store.ts](../src/services/chat/store.ts) `ensureServerId` 中 `db.loadFile` 换为远端原件拉取，失败返回 null 的行为不变（附件只展示不进请求）。
- **导出 ZIP**：[exportArchive.ts](../src/services/chat/history/exportArchive.ts) 现在逐个 `db.loadFile` 收原件；远程版从 R2 逐个拉，逻辑不变、速度略慢（网络换本地盘），可接受。

## 6. LLM 代理

Worker 路由 `/api/llm/*` 的处理：

1. 鉴权中间件通过。
2. 剥离 `/api/llm` 前缀，拼到 `https://api.deepseek.com`。
3. 注入 `Authorization: Bearer ${DEEPSEEK_API_KEY}`（Anthropic 端点用 `x-api-key`，两者都带上由 DeepSeek 兼容层处理——与现前端行为一致），按是否有文件块注入 `anthropic-beta`。**原样透传** method、body、以及 `Content-Type` / `Accept`。
4. SSE 响应：`new Response(response.body, response)` 直接返回流，**不做任何缓冲/转换**；Worker 运行时对流式 body 默认透传。`message_stop` 语义、断流后 `interrupted` 错误的判定全留在前端，代理不参与协议。
5. TTS 的 PCM 流同理透传。
6. 转发失败（DeepSeek 不可达）时返回 502 + 上游错误体原文，前端现有 `ApiError` 分类逻辑（http/stream/network/protocol）不需要改。

**Worker 不设置全局 `Cache-Control` 影响**；存储接口显式 `Cache-Control: no-store`，LLM 接口由 SSE 性质决定不被缓存。

## 7. 部署配置

1. **DNS**：`chat.dancingsnow.xyz` CNAME `DancingSnow0517.github.io`，橙云。GitHub 仓库 Pages 设置 Custom domain（若 GitHub 侧证书签发失败，临时灰云签完再切回橙云；实际生效的是 CF 边缘证书）。
2. **Worker 路由**：`chat.dancingsnow.xyz/api/*` → Worker。
3. **缓存规则**（Cache Rules）：
   - `chat.dancingsnow.xyz/static/*`（rspack 产物带 contenthash）→ Edge TTL 一个月，`immutable`。
   - `index.html` → Bypass cache 或 Edge TTL 5 分钟（发版生效窗口）。
   - `/api/*` → Bypass cache。
4. **Secrets**：`wrangler secret put GITHUB_CLIENT_SECRET / ALLOWED_GITHUB_ID / SESSION_SECRET / DEEPSEEK_API_KEY`；`GITHUB_CLIENT_ID` 写入 `wrangler.toml` 的 `[vars]`。
5. **绑定**：`wrangler.toml` 声明 D1 database 与 R2 bucket。
6. **OAuth App**：按 §2.2 注册 GitHub OAuth App，回调地址与 Worker 路由一致。

## 8. 本地开发

- `wrangler dev` 起 Worker（端口 8787），rspack devServer 把 `/api` 代理到它：`createConfig({ devServer: { proxy: [{ context: ['/api'], target: 'http://localhost:8787' }] } })`。rspack.config.ts 现有的 `createConfig({ apiOrigin, devServer })` 参数结构正好支持。
- D1/R2 本地用 wrangler 的内置模拟（`--local`，默认）。
- `__API_ORIGIN__` 定义从"DeepSeek 地址"改为"同源占位"（生产构建注入空串，代码里统一走相对路径 `/api/...`）。

## 9. 实施步骤

| 步骤 | 内容 | 独立可验证 |
|---|---|---|
| 1 | Worker 骨架 + 鉴权（GitHub OAuth 登录/回调/会话验证/登出）+ 健康检查 | `curl` 全流程验证 Cookie 签发与校验（OAuth 回调用浏览器走一遍） |
| 2 | LLM 代理 + 前端 API 出口改造（去 apiKey、改相对路径、设置页登录区块） | 在 Worker 直连 DeepSeek 下完整聊天、附件、语音；数据仍本地 |
| 3 | D1 schema + 存储接口 + db.ts 远程实现（含 R2 原件、乐观写、导入两阶段） | 双设备/无痕窗口验证会话同步、附件查看、导入导出 |
| 4 | 部署配置（DNS、路由、缓存规则、Secrets） | 线上域名全流程回归 |

步骤 2 完成后应用即"Key 在服务端、数据仍在本地"；步骤 3 完成后才是完整的"哪都能用"。

## 10. 风险与限制

1. **会话 2MB 天花板**：长会话（数十万 token 级别）会走到 R2 外置路径，功能正常但读写多一次往返；D1 免费库 10GB 对单用户无压力。
2. **SSE 透传需双端验证**：wrangler dev 与线上 Workers 的流式行为要各测一次断流/停止/`interrupted` 路径（现前端依赖精确的 SSE 帧边界）。
3. **无离线能力**：第一版是在线应用，断网即不可用（现版本地优先）。如后续需要离线，再在 IndexedDB 加读缓存 + 写队列，属增量改动。
4. **鉴权的外部依赖**：登录瞬间浏览器需能访问 github.com（Worker 侧换 token 走 Cloudflare 出口，通常无阻）。已登录 GitHub 的浏览器回跳很快；会话 30 天有效期内不再接触 GitHub。泄露应急路径：GitHub 侧 Revoke OAuth App 授权 + 换 `SESSION_SECRET` 作废旧会话。
5. **成本**：单用户远低于 CF 免费额度（Worker 10 万请求/天、D1 500 万读/10 万写/天、R2 10GB/百万次读）。GitHub Pages 带宽由 CF 缓存兜底。DeepSeek API 费用照常。
6. **GitHub Pages 公开**：前端代码公开可下载，与现状一致；所有数据都在鉴权之后。
