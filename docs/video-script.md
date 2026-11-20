# 《简单聊天&搜索：功能介绍与自部署教程》视频脚本

> 预计时长：10–12 分钟｜形式：录屏 + 口播｜语言：中文
> 演示环境：线上站点 https://chat.dancingsnow.xyz ＋ 一个全新的 Cloudflare 账号 / GitHub 账号用于部署演示

---

## 录制前准备清单

- [ ] 演示站点已登录管理员账号，准备 1–2 条有代表性的会话（含代码块、公式、附件）
- [ ] 一个用于演示"添加用户"的第二个 GitHub 账号（小号）
- [ ] 干净的浏览器 Profile（无无关书签栏/插件），窗口 1280×720 或 1920×1080，缩放 100%
- [ ] Cloudflare 账号：已有一个接入 Cloudflare DNS 的域名（或演示用免费 `workers.dev` 变体，需另行改路由）
- [ ] GitHub 账号：准备好 fork 用的新账号或组织
- [ ] 关闭系统通知，浏览器开"勿扰"；录屏软件设置鼠标高亮/点击动画
- [ ] 提词：本脚本"口播"列

---

## 第一部分：开场（0:00–0:40）

| # | 画面 | 口播 |
|---|------|------|
| 1.1 | 黑屏渐入，浏览器打开 https://chat.dancingsnow.xyz ，登录页展示 Logo 和「使用 GitHub 登录」按钮 | "这是一个基于 DeepSeek API 的开源聊天应用——简单聊天&搜索。它最大的特点是：**一次部署，任意设备登录即用**，会话和附件全部云端同步。" |
| 1.2 | 快速 montage：登录 → 发一条消息 → 流式输出 → 切到手机端同一账号，会话已同步 | "它支持多用户：管理员可以邀请其他人一起用，每个人配置自己的 API Key。整个前端托管在 GitHub Pages，后端是 Cloudflare Workers——**全部在免费额度内**。" |
| 1.3 | 屏幕右侧打出本期大纲字幕：① 功能介绍 ② 部署教程 | "这期视频分两部分：先快速过一遍功能，重点看管理员和用户管理；然后从零开始，手把手带你部署一套属于自己的实例。" |

---

## 第二部分：功能介绍（0:40–4:00）

### 2.1 基础聊天（0:40–1:40）

| # | 画面 | 口播 |
|---|------|------|
| 2.1.1 | 点击「使用 GitHub 登录」，GitHub 授权页一闪而过，回到主界面 | "登录走的是 GitHub OAuth，没有密码，授权一下就能进来。" |
| 2.1.2 | 输入一个问题，发送，展示流式输出、代码高亮 | "聊天体验对齐 DeepSeek 网页版：流式输出、Markdown、代码高亮、KaTeX 公式、Mermaid 图表都有。" |
| 2.1.3 | 演示：编辑已发送的消息 → 出现分支切换箭头；点「重新生成」 | "消息可以编辑、可以重新生成，每次修改都会产生一个分支，随时可以切回去。" |
| 2.1.4 | 拖拽一张图片进输入框，发送后点开图片查看 | "附件支持粘贴和拖拽上传，原件存在云端，换设备也能查看。" |
| 2.1.5 | 切到手机浏览器（或模拟器），展示移动端布局、语音输入 | "移动端做了完整适配，还支持语音输入和回复朗读。" |

### 2.2 账户与 API Key（1:40–2:30）

| # | 画面 | 口播 |
|---|------|------|
| 2.2.1 | 点击左下角头像区域，弹出小菜单：系统设置 / 登出 | "左下角是自己的头像和用户名，点开有系统设置和登出。" |
| 2.2.2 | 打开设置，切到第二个 tab「账户」，特写 API Key 输入框 | "在设置第二页的账户里，每个人填**自己的** DeepSeek API Key。Key 只保存在服务端数据库里，浏览器不会接触，换设备也不用重新填。" |
| 2.2.3 | 展示设置其他 tab：通用（语言/主题）、数据管理（导入导出） | "语言、主题这些是设备偏好，存在本地；历史会话可以在数据管理里导出成 ZIP 备份，也能整体导入。" |

### 2.3 管理员与用户管理（2:30–4:00）⭐重点

| # | 画面 | 口播 |
|---|------|------|
| 2.3.1 | 设置 tab 栏特写：管理员账号比普通账号多一个「用户管理」tab | "如果你部署时把自己设成了管理员，设置里会多出第四个 tab——用户管理。普通用户是看不到的。" |
| 2.3.2 | 展示用户列表：头像、昵称、@登录名、管理员徽章、最后登录时间、删除按钮 | "这里能看到所有已注册的用户：头像、GitHub 账号、最后登录时间，还有谁配了 API Key。" |
| 2.3.3 | 在输入框输入小号 GitHub 用户名，点「添加用户」，列表出现新用户（标注"从未登录"） | "加人很简单：输入对方的 GitHub 用户名，点添加。对方下次打开网站、用 GitHub 登录，就能直接进来了。" |
| 2.3.4 | 切到小号的浏览器（或无痕窗口），演示登录成功，发一条消息 | "新用户登录后，数据和管理员完全隔离——会话、附件、API Key 都是各自的。" |
| 2.3.5 | 切回管理员，点小号旁边的「删除」，弹出确认框，确认后列表刷新 | "删除用户会连带清掉他的所有云端数据：会话、附件原件，所以这里有一个确认弹窗。注意管理员的删除按钮是不存在的——**管理员不能被删除**。" |
| 2.3.6 | （可选）屏幕字幕总结权限模型 | "总结一下：第一个登录的是部署时指定的管理员，之后所有人都由管理员在界面上邀请。没有注册入口，外人拿不到地址也进不来。" |

---

## 第三部分：部署教程（4:00–结尾）⭐重点

> 本部分节奏放慢，每一步都给出完成标志（"看到 XX 就说明成功了"）。

### 3.1 架构速览（4:00–4:40）

| # | 画面 | 口播 |
|---|------|------|
| 3.1.1 | 展示架构图（可用 docs/cloudflare-migration.md 的图重绘为简洁版动画）：浏览器 → Cloudflare（/api/* → Worker → D1/R2；其余 → GitHub Pages） | "开始之前先花半分钟理解架构：前端静态文件托管在 GitHub Pages；Cloudflare Worker 接管 `/api` 路径，负责登录鉴权、转发 DeepSeek 请求、读写 D1 数据库和 R2 存储。你的域名解析到 Cloudflare，剩下的交给它。" |
| 3.1.2 | 字幕列出需要的账号：GitHub ×1、Cloudflare ×1、域名 ×1（已接入 CF DNS）、DeepSeek API Key | "你需要准备四样东西：一个 GitHub 账号、一个 Cloudflare 账号、一个已经接入 Cloudflare DNS 的域名，和一个 DeepSeek API Key。" |

### 3.2 Fork 仓库（4:40–5:20）

| # | 画面 | 口播 |
|---|------|------|
| 3.2.1 | 打开 https://github.com/DancingSnow0517/chat-demo ，点右上角 Fork，勾选/取消 copy main branch only，Create fork | "第一步，Fork 仓库。打开项目地址，点右上角 Fork，默认设置就可以。" |
| 3.2.2 | 进入 fork 后的仓库 → Settings → Pages → Source 选 GitHub Actions | "Fork 完进入你自己仓库的 Settings → Pages，Source 选择 GitHub Actions。" |
| 3.2.3 | 点 Actions tab，手动触发一次「Deploy GitHub Pages」workflow，等它变绿 | "然后到 Actions 页手动跑一次部署工作流。变绿之后，Pages 就有内容了。先别急，域名还没配，我们继续。" |

### 3.3 创建 GitHub OAuth App（5:20–6:30）

| # | 画面 | 口播 |
|---|------|------|
| 3.3.1 | GitHub 头像 → Settings → Developer settings → OAuth Apps → New OAuth App | "第二步，创建一个 GitHub OAuth App，用户靠它登录。注意是 **OAuth Apps**，不是 GitHub Apps，别点错了。" |
| 3.3.2 | 填表特写，逐行字幕：<br>Application name: 随意<br>Homepage URL: `https://chat.你的域名`<br>Authorization callback URL: `https://chat.你的域名/api/auth/github/callback` | "三个字段：名字随便起；Homepage URL 填你的站点地址；**回调地址最重要**，是站点地址加上 `/api/auth/github/callback`，一个字符都不能错。" |
| 3.3.3 | 创建后页面特写：Client ID 和 Generate a new client secret 按钮 | "创建之后，页面上这串 `Ov` 开头的是 Client ID，这个不敏感，待会儿写进配置文件。再点按钮生成一个 Client Secret——**它只显示一次，先复制好**。" |
| 3.3.4 | 打开 `https://api.github.com/users/你的用户名`，高亮 `"id": 数字` | "最后查一下你自己的 GitHub 数字 ID：访问 api.github.com/users/你的用户名，这个 id 字段就是。待会儿用它把自己设成管理员。" |

### 3.4 Cloudflare 配置（6:30–10:00）

#### D1 数据库（6:30–7:30）

| # | 画面 | 口播 |
|---|------|------|
| 3.4.1 | CF 仪表盘 → 存储和数据库 → D1 → 创建数据库，名称 `chat` | "第三步是 Cloudflare。先建 D1 数据库，名字就叫 chat。" |
| 3.4.2 | 终端：`cd worker && pnpm install`，然后 `npx wrangler login`（浏览器授权） | "然后本地打开终端，进 worker 目录装依赖，用 wrangler 登录你的 Cloudflare 账号。" |
| 3.4.3 | 编辑 `worker/wrangler.toml`：替换 `database_id` 为刚创建的 D1 的 ID（高亮位置），`GITHUB_CLIENT_ID` 填入上一步的 Client ID，routes 改成自己的域名 | "接着改 wrangler.toml 三个地方：database_id 换成刚才 D1 的 ID；GITHUB_CLIENT_ID 填 OAuth App 的 Client ID；最上面的 routes 改成你的域名。R2 bucket 名字保持 chat-files，待会儿建一个同名的就行。" |
| 3.4.4 | 终端：`npx wrangler d1 migrations apply chat --remote`，展示建表成功输出 | "然后跑数据库迁移，把表结构建好。看到列出两个 migration 都 applied 就成功了。" |

#### R2 存储桶（7:30–8:00）

| # | 画面 | 口播 |
|---|------|------|
| 3.4.5 | CF 仪表盘 → R2 → 创建存储桶，名称 `chat-files` | "R2 用来存附件原件，建一个叫 chat-files 的桶，和 wrangler.toml 里的名字对上就行，其他默认。" |

#### Secrets 与部署（8:00–9:00）

| # | 画面 | 口播 |
|---|------|------|
| 3.4.6 | 终端依次执行四条 `wrangler secret put`（字幕列出）：<br>`GITHUB_CLIENT_SECRET`（粘贴 OAuth Secret）<br>`ADMIN_GITHUB_ID`（你的数字 ID）<br>`SESSION_SECRET`（演示用 `openssl rand -hex 32` 现场生成） | "现在写入三个密钥：OAuth App 的 Client Secret、你的 GitHub 数字 ID——这就是管理员白名单、还有一个随机会话密钥，用 openssl 现场生成一个 32 字节的随机 hex 就行。密钥只存在 Cloudflare，不进 git。" |
| 3.4.7 | 终端：`npx wrangler deploy`，展示成功输出和路由绑定 | "最后 `wrangler deploy`，Worker 上线。看到它绑定到你域名的 `/api/*` 路由，后端就完成了。" |

#### DNS 与收尾（9:00–10:00）

| # | 画面 | 口播 |
|---|------|------|
| 3.4.8 | CF DNS 页：添加 CNAME 记录 `chat` → `你的用户名.github.io`，代理状态：已代理（橙云） | "最后一步是 DNS：加一条 CNAME，chat 指向你的 GitHub Pages 地址，**一定要保持橙云代理状态**——这样流量才会经过 Cloudflare，Worker 路由才生效。" |
| 3.4.9 | GitHub 仓库 Settings → Pages → Custom domain 填 `chat.你的域名`，等证书对勾 | "回到 GitHub 仓库的 Pages 设置，Custom domain 填你的域名，等证书检查通过。" |
| 3.4.10 | 打开 `https://chat.你的域名`，点登录，GitHub 授权，成功进入主界面 | "打开你的域名，点登录——能授权回来、看到这个界面，整套部署就成功了！🎉" |

### 3.5 验证与收尾（10:00–结尾）

| # | 画面 | 口播 |
|---|------|------|
| 3.5.1 | 发一条消息验证聊天；打开设置 → 账户填 API Key → 再发一条成功 | "第一次聊天前记得先去设置的账户页填你的 DeepSeek API Key。填完发一条消息，有回复就全链路通了。" |
| 3.5.2 | 展示设置 → 用户管理 tab | "你是管理员，用户管理 tab 已经在了。想邀请朋友，输入他的 GitHub 用户名就行。" |
| 3.5.3 | 字幕列出常见问题（口播带过）：<br>· 登录回调 404 → 检查回调地址与路由<br>· 登录被拒绝 → 检查 ADMIN_GITHUB_ID 是否为数字 ID<br>· 聊天报 api key not configured → 账户页没填 Key | "几个常见的坑：回调 404 一般是回调地址或 Worker 路由没配对；登录被拒绝通常是管理员的数字 ID 填成了用户名；聊天报 key 没配置，就是账户页还没填 Key。" |
| 3.5.4 | 结尾画面：项目地址二维码/链接 + "开源 MIT，欢迎 Star" | "项目完全开源，MIT 协议，地址在屏幕上。觉得有用的话欢迎 Star，我们下期见。" |

---

## 素材与后期备注

- **架构图**（3.1.1）：按 `docs/cloudflare-migration.md` 第 9–18 行的 ASCII 图重绘，保留三个元素：Pages / Worker / D1+R2。
- **敏感信息打码**：Client Secret、`SESSION_SECRET` 输入过程、D1 database_id 可按需打码（database_id 本身泄露风险低，但习惯上遮一半）。
- **等待环节加速**：GitHub Actions 构建（约 1–2 分钟）、DNS/证书生效（最长几分钟）用快进 + 计时器角标处理。
- **分叉准备**：如果观众没有自有域名，录制一版 `workers.dev` + `*.github.io` 变体的备选口播（OAuth 回调和 Pages 自定义域名都要相应改），后期作为 P2 或置顶评论链接。
- BGM：轻快 Lo-fi，人声出现时 -12dB 闪避。
