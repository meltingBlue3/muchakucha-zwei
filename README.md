# Muchakucha Zwei（ムチャクチャ 2号）

共享家庭协作应用 — 让家庭成员在移动优先的体验中管理日程、任务、笔记和标签，也可通过自带模型的 AI 助手查询和整理内容。Android 与 iOS 为主要平台，Web 为次要平台。

## 技术栈

| 层 | 技术 |
|---|------|
| **移动端 / Web** | React Native 0.86 + Expo 57 + Expo Router（Metro 打包 Web） |
| **UI 系统** | Shopify Restyle 主题 + `apps/client/src/ui/` 共享组件，设计规范见 [docs/design.md](docs/design.md) |
| **API 服务** | NestJS 11 + Fastify，统一前缀 `/api/v1` |
| **数据库** | PostgreSQL（`compose.yaml` 提供 18.4；本机 PostgreSQL 16 可用于开发，但集成测试要求 17+） |
| **ORM** | Prisma 7 + `@prisma/adapter-pg` |
| **认证** | Argon2 密码哈希；HS256 Access Token（15 分钟，仅存内存）+ 轮换 Refresh Token（原生 SecureStore / Web HttpOnly Cookie） |
| **API 契约** | 由 `generate-openapi.ts` 生成 `packages/api-client`（OpenAPI JSON + TypeScript 客户端） |
| **AI 助手** | 自带 OpenAI 兼容 / Anthropic 模型；服务端工具调用、受限 ReAct 循环、写入确认与加密凭证 |
| **测试** | Vitest（API 单元 / 集成）、Jest + Testing Library（客户端）、Playwright（Web E2E + 无障碍） |
| **包管理** | pnpm 10 workspace monorepo（不要使用 npm 安装） |

## 项目结构

```
muchakucha-zwei/
├── apps/
│   ├── api/                       # NestJS + Fastify 后端
│   │   ├── prisma/                # schema.prisma 与迁移
│   │   ├── src/
│   │   │   ├── infrastructure/    # Prisma 数据库适配器
│   │   │   ├── modules/           # auth、users、households、events、tasks、recurrence、notes、labels、assistant
│   │   │   └── openapi/           # OpenAPI 契约与客户端生成器
│   │   └── test/                  # 集成测试（会清空测试库）
│   └── client/                    # Expo 跨平台客户端
│       ├── app/                   # Expo Router 文件路由
│       │   ├── (auth)/            # 登录、注册、离线页
│       │   └── (protected)/       # 需登录：家庭列表、个人中心、家庭内各页面
│       └── src/
│           ├── features/          # auth、households、events、tasks、recurrence、notes、labels、profile、assistant
│           ├── platform/          # 原生 / Web 差异适配（会话、当前家庭、邀请、浮层焦点、字体）
│           └── ui/                # 共享组件与主题 token
├── packages/
│   └── api-client/                # 生成产物，请勿手改
├── e2e/                           # Playwright 用例（auth、households、events、tasks、support）
├── docs/                          # 设计规范与调研、产品路线图、agent/ 操作手册、security/ ASVS 审计
├── scripts/                       # OpenAPI 漂移检查；PowerShell 测试门禁脚本
├── compose.yaml                   # 测试用 PostgreSQL
├── playwright.config.ts           # 完整 Web E2E（启动 API + Web）
└── playwright.ui.config.ts        # 仅 UI 回归（拦截全部 API 请求，无需数据库）
```

### 数据模型

```
User → AuthSession, RefreshToken
Household → Membership, Invitation, Event, Task, RecurrenceRule, Note, Label
Membership → Role (OWNER / ADMIN / MEMBER)
Membership → AssistantProvider（个人配置，可共享给本家庭）, AssistantConversation（私人对话）
AssistantProvider → 协议、服务地址、模型、加密凭证；对话绑定创建时的配置版本
Invitation → 按已注册用户名发出
RecurrenceRule → 每天 / 每周 / 每月 / 每年，滚动生成 Event 与 Task
Event → 全天 / 定时，可关联 RecurrenceRule 与多个 Label（EventLabel）
Task → 状态、优先级、多个负责人（TaskAssignee），可关联 RecurrenceRule 与多个 Label（TaskLabel）
Note → 家庭共享笔记（标题 + 正文，不支持标签）
Label → 家庭内唯一名称 + 颜色
```

AI 编码代理从 [AGENTS.md](AGENTS.md) 进入：它是常驻入口，按任务类型路由到 `docs/agent/` 下的单篇手册，避免一次性加载全部文档。

## 本地开发

### 前置条件

- **Node.js** 24.x（`>=24.0.0 <25`）
- **pnpm** 10.x：`corepack enable` 会按 `packageManager` 字段启用 pnpm 10.34.5
- **PostgreSQL**：本机安装，或使用 Docker Compose

### 1. 安装依赖

```bash
git clone <repo-url>
cd muchakucha-zwei
corepack enable
pnpm install --frozen-lockfile
```

### 2. 准备数据库

**方式一：本机 PostgreSQL**

```sql
CREATE USER muchakucha_dev WITH PASSWORD 'muchakucha_dev_only';
CREATE DATABASE muchakucha_dev OWNER muchakucha_dev;
```

**方式二：Docker Compose**

```bash
docker compose up -d
# PostgreSQL 18.4：127.0.0.1:55432，库/用户 muchakucha_test，密码 muchakucha_test_only
```

Compose 中的库是测试库，运行集成测试或 E2E 时会被清空。

### 3. 配置 API 环境变量

API 和 Prisma CLI 都会读取 `apps/api/.env`（已被 git 忽略），也可以直接 export。首次配置时，将 [apps/api/.env.example](apps/api/.env.example) 复制为同目录下的 `.env`，再按本机环境填写；已有 `.env` 时只补充缺少的配置，不要覆盖现有值。

开发数据库配置示例：

```bash
# apps/api/.env
DATABASE_URL='postgresql://muchakucha_dev:muchakucha_dev_only@127.0.0.1:5432/muchakucha_dev'
```

未设置 `DATABASE_URL` 时，API 默认连接 `127.0.0.1:5432/muchakucha_test`。

| 变量 | 说明 | 非生产默认值 |
|------|------|--------------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test` |
| `NODE_ENV` | `development` / `test` / `production` | `development` |
| `HOST` / `PORT` | 监听地址与端口 | `127.0.0.1` / `3000`（生产默认 `0.0.0.0`） |
| `LOG_LEVEL` | Fastify 日志级别 | `info`（`test` 下为 `silent`） |
| `JWT_ACCESS_SECRET` | JWT 签名密钥，≥32 字节 | `development-only-access-secret-change-before-production` |
| `ASSISTANT_ENCRYPTION_KEY` | 助手凭证加密专用密钥：32 个随机字节的标准 Base64 字符串，与 JWT 密钥独立 | 无；未设置时无法保存或解密模型凭证，返回 `503 ASSISTANT_NOT_CONFIGURED` |
| `WEB_ORIGIN` | 生产 CORS 允许的精确来源（逗号分隔）；第一个值也用于生成邀请分享链接 | 非生产环境 CORS 放行所有来源 |

客户端通过 `EXPO_PUBLIC_API_ORIGIN` 指定 API 地址，默认 `http://localhost:3000`。在真机上调试时要改成电脑的局域网地址，并给 API 设置 `HOST=0.0.0.0`。

### 4. 生成 Prisma 客户端并迁移

```bash
pnpm --filter api prisma:generate
pnpm --filter api exec prisma migrate deploy
```

拉取到新的迁移后需要再次执行 `migrate deploy`。

### 5. 启动

```bash
# API：http://127.0.0.1:3000（先编译再运行，不监听文件变更，改代码后需重启）
pnpm --filter api dev

# Web 客户端：http://127.0.0.1:8081
pnpm --filter client exec expo start --web --port 8081

# 原生客户端：Expo 开发服务器，扫码或连接模拟器
pnpm --filter client start
```

`pnpm dev` 会并行运行 API 和 `expo start`。Web 请使用上面的 8081 命令：`client` 包的 `web` 脚本使用 18025 端口。

API 的 OpenAPI 文档位于 `http://127.0.0.1:3000/api/v1/openapi.json`（未启用 Swagger UI）。

### 使用流程

1. 注册只需用户名、密码和确认密码，成功后自动登录。用户名为 3–32 个字母、数字、点、下划线或连字符（支持中文），忽略首尾空白和大小写；密码 8–128 个字符。
2. 创建家庭，或从收件箱接受家庭邀请。管理员按已注册用户名发送邀请，对方登录后可直接接受或拒绝，无需复制链接。收件箱入口位于个人信息图标左侧；消息以列表展示，点击可查看详情。进入页面或回到前台时自动更新，移动端支持下拉刷新。
3. 进入家庭后默认打开「今日」。App 底部导航有五个入口：**今日、日历、任务、笔记、家庭**；PC 侧栏另外提供独立的 **助手** 入口。App 可从「家庭」页打开助手；标签管理、周期规则和家庭设置（成员、邀请、角色、所有权）也在「家庭」页。
4. 通过账户菜单进入个人中心，可修改昵称、查看我的家庭、退出当前设备。

账户只支持用户名注册和登录，家庭邀请只面向已注册用户名，通过分享链接接受。**暂不提供密码找回或人工重置功能。**

邮箱注册、登录、验证、邀请和密码重置属于第一版开发遗留，没有实际用户依赖，现已删除。用户和邀请响应只提供 `username`，不再提供邮箱字段。历史迁移保留；清理迁移若发现邮箱账号或邮箱邀请会停止，需要先核实数据，不能直接删除账号绕过检查。

### AI 助手

先由服务管理员配置 `ASSISTANT_ENCRYPTION_KEY`，并按上述流程应用数据库迁移。可用以下命令生成加密密钥：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
pnpm --filter api exec prisma migrate deploy
```

将生成值作为 `ASSISTANT_ENCRYPTION_KEY` 保存在服务端环境配置中，并重启 API；不要写入客户端或提交到仓库。这是加密用户模型凭证的主密钥，与用户输入的模型 API Key 不同。数据库备份需要配套保管该密钥；丢失后无法解密已有凭证。当前没有自动密钥轮换流程，不能直接重新生成并替换，否则已有配置需要重新输入凭证。生产环境由运维管理现有服务端环境文件，本节不会自动修改部署配置。

进入 **家庭 → 助手 → 模型配置 → 添加**，填写配置名称、协议、服务地址、模型 ID、API 密钥和使用范围。保存前可点 **测试连接**：用填写的地址、模型和密钥发送一次只带测试工具的请求，确认地址、密钥和工具调用可用，不读取家庭数据。然后返回助手首页选择模型，直接输入第一个问题即可开始对话；没有发过消息的空对话在开始下一段对话时自动清理。

| 协议 | 服务地址示例 | 应用追加的请求路径 |
| --- | --- | --- |
| OpenAI 兼容 | `https://api.openai.com/v1`，或兼容服务的 API 目录 | `/chat/completions` |
| Anthropic | `https://api.anthropic.com/v1` | `/messages` |

服务地址应填写 **API 基础目录**，通常包含 `/v1`，不要填写聊天网页或完整的 `/chat/completions`、`/messages` 地址。模型 ID 使用供应商实际提供、支持工具调用的模型名称。当前仅接受公网 HTTPS，不能带 URL 用户名、密码、查询参数或片段；不跟随重定向，也不支持环回、局域网或其他私网模型地址。“仅自己”表示配置可见范围，不代表支持私网部署的模型。服务端不经过代理直连服务地址，所选服务必须能从 API 所在服务器访问。

模型服务出错时，对话里会说明具体原因：密钥被拒、额度不足、请求过于频繁、地址或模型不存在、上下文过长、模型不支持工具调用、服务不可用或响应超时。服务端日志只记录对话 ID、配置 ID、错误码与上游状态码或连接错误码，不记录地址、密钥、提示词或上游返回的正文。

配置可设为“仅自己”或“家庭可用”。家庭共享只授予本家庭成员模型调用权，费用使用该配置的凭证承担；完整 API Key 不会回传，只有创建者能编辑或删除配置，家人在应用里看不到彼此的对话。助手以实际使用者的身份访问家庭业务：共享所有者的模型不会获得所有者权限。使用时，对话及回答所需的家庭数据会发送到所选服务地址，该服务能看到这些内容；共享配置的服务地址由配置者填写。配置者可在模型配置页看到每位家人本月（UTC 自然月）的请求次数和 token 用量，看不到对话内容；当前没有用量上限。

可以请求“明天下午两点到四点添加家庭采购”“把买牛奶任务标记为完成”“查询下周安排，并结合未完成任务列出需要准备的事”。助手可查询日程、任务、笔记、标签与成员，提出新增、编辑、删除操作；**每项写入均先展示预览，确认后才执行**。编辑会列出修改前后的值，笔记正文按行显示删除和新增的内容，正文明显变短时提示可能误删。互不依赖的多项修改可以一次提出，逐项勾选后执行，未勾选的项不会执行。取消不会执行修改，重复确认不会再次执行；目标内容变化时需要重新查询并提出操作。

相对日期按用户设备的时区理解：每条消息都记下发送时间，“明天”按那条消息发出的日期计算；查询结果附带当地时间，只写日期的截止时间按当地零点保存，全天日程按当地整天保存。查询依据可以直接打开对应的日程、任务或笔记。

每段对话绑定开始时的服务地址与协议。修改服务地址或协议后，旧对话保留历史，但继续调用模型或确认写入须开始新对话，这样不会将已有对话历史自动发送到新的服务地址；只改名称、模型或密钥不影响已有对话。删除配置或撤销共享也会阻止后续调用及待执行操作的确认。

当前实现边界：

- 每轮最多 8 次模型调用、24 次工具调用，互不依赖的查询可在同一步并行提出；运行预算为 120 秒，在调用边界检查，已发出的请求可能让总耗时超过 120 秒，单次网络请求另有 45 秒超时，单次回答最多 8,192 个输出 token。单条消息最多 8,000 字符。发给模型的内容预算为 180,000 字符：较早轮次的查询结果只保留 ID、标题等摘要，需要正文时由助手重新读取；完整记录另以 600,000 字符、400 条消息为上限保存，超出时需新开对话。
- 接口同步返回整轮结果，没有流式输出或后台任务；处理期间界面每 2 秒读取已保存的进度，请求中断后也会自动接上结果。处理超过 5 分钟仍未结束视为中断。中断时不会自动重试写入，先检查实际结果再继续。
- 可以创建重复日程和任务；通过助手编辑、删除重复内容只作用于单次实例，系列修改请使用现有周期规则界面。
- 重复内容查询只覆盖已生成的实例，会返回生成范围提示；不能把未生成的远期实例当作没有安排。工具输出有分页及文本截断，但底层仍调用现有业务服务全量读取后过滤，尚未下推数据库分页和搜索。
- 尚未进行真实模型联调或供应商兼容性矩阵验证；“OpenAI 兼容”不保证所有模型都支持本项目所需的工具调用协议。没有原生 Gemini、Responses API、语义索引或私网地址接入。

数据库迁移 `20261006000000_assistant_provider_destination` 和 `20261006010000_assistant_usage` 分别加入配置的服务地址版本和用量表，部署时与其他迁移一样用 `prisma migrate deploy` 应用。

扩展时，在 [assistant-provider.ts](apps/api/src/modules/assistant/assistant-provider.ts) 增加协议适配，在 [assistant-tools.service.ts](apps/api/src/modules/assistant/assistant-tools.service.ts) 注册业务工具并复用现有服务；[assistant.service.ts](apps/api/src/modules/assistant/assistant.service.ts) 负责有上限的循环与确认流程。替换供应商协议不需要重写业务权限和 CRUD。架构依据与后续建议见 [AI 助手调研](docs/ai-assistant-research.md)。

## 测试与检查

```bash
pnpm --recursive typecheck   # 所有包类型检查
pnpm test:quick              # API 单元测试 + 客户端 Jest
pnpm test:integration        # API 集成测试（需要测试库，见下文）
pnpm test:e2e:web            # Web E2E（自动启动 API 与 Web，或复用已运行的服务）
pnpm openapi:check           # 重新生成 api-client 并检查与 HEAD 是否一致

# 仅 UI 回归（拦截 API，无需数据库）
pnpm exec playwright test -c playwright.ui.config.ts
```

**测试数据库会被清空。** 集成测试和 E2E 只接受回环地址、且库名含独立 `test` 片段的数据库：

- 集成测试读取 `TEST_DATABASE_URL`，或由 `TEST_POSTGRES_DB/USER/PASSWORD/PORT` 拼接（默认端口 5432）。
- E2E 读取 `DATABASE_URL`，默认 `127.0.0.1:5432/muchakucha_test`。
- 使用 Docker Compose 时参考 [`.env.test.example`](.env.test.example)，端口为 55432。根目录 `.env.test` **不会**被自动加载，需要自行导出变量。

集成测试会在启动时对测试库执行 `prisma migrate deploy`，且要求 PostgreSQL 17+；E2E 使用的测试库需要先手动迁移。

修改 API 契约时，更新 `apps/api/src/openapi/generate-openapi.ts` 中的 DTO 与模板，然后运行 `pnpm openapi:generate`，不要手改 `packages/api-client`。

## 功能

- **账户**：用户名注册与登录、会话恢复、昵称修改、设备级退出；API 全局限流（每个客户端每分钟 60 次）
- **家庭协作**：创建 / 重命名 / 切换家庭；按用户名发送收件箱邀请，接受 / 拒绝 / 重发 / 撤回邀请；OWNER / ADMIN / MEMBER 角色治理、移除成员、所有权转移、所有者离开；只有所有者能任免或移除管理员，管理员可邀请、移除普通成员；普通成员和管理员可主动退出，所有者须先转让所有权。退出或被移除时，清除该成员在本家庭所有任务中的负责人关系（含已完成任务和重复实例），保留其他负责人；无人负责则为未分配，后续重复任务不再分配给他。共享日程、任务、笔记及作者信息留在家庭中
- **今日**：当天日程、待办与逾期任务的概览，后续安排默认收起；临近截止与更远的后续任务按重复规则分组，只展示每组最近一次未完成、未取消的任务，当天和逾期实例仍逐条展示
- **日历**：月视图、全天 / 定时事件；所有成员均可编辑任意日程及重复设置，删除、取消和结束重复限创建者、管理员和所有者；按标签和是否重复筛选；查看未来月份时按需补齐该月重复事件，可打开详情并按原有方式修改或取消；时间点使用 `timestamptz`
- **任务**：待处理 → 进行中 → 已完成、优先级、多负责人；家庭所有成员均可修改任意任务的内容、状态、负责人及重复设置，删除仍限创建者、管理员和所有者；按状态、标签和是否重复筛选；筛选状态在切换页面后保留
- **周期性重复**：事件与任务支持每天 / 每周（多选星期）/ 每月 / 每年，月末钳位并正确处理夏令时；可选择「仅此一次」或「此后所有」范围编辑 / 删除；周期规则列表与详情页支持编辑规则和结束重复
- **笔记**：家庭共享笔记的增删改查；所有成员均可编辑任意笔记，删除限创建者、管理员和所有者
- **草稿**：日程、任务和笔记草稿按账号及家庭保存在本机，重启后可恢复；保存成功、主动丢弃、退出登录或确认失去家庭访问权时清除，不跨设备同步
- **标签**：OWNER / ADMIN 可创建、重命名、着色、删除；所有成员都可给事件和任务打标签
- **AI 助手**：用户自带 OpenAI 兼容或 Anthropic 模型，配置可私有或共享给当前家庭；自然语言查询及跨日程、任务、笔记分析，写入逐项预览确认；凭证加密保存、对话私人、沿用调用者权限。配置和当前限制见上文「AI 助手」

成员主动退出使用 `POST /api/v1/households/{id}/leave`，无需指定其他成员。当前所有者会收到 `OWNER_TRANSFER_REQUIRED`，先完成转让后才能退出。`/ownership/leave` 接口在同一事务内先交接所有权、再退出；两种退出方式都保留共享内容。

共同编辑采用乐观并发检查：当前客户端保存任务、笔记、日程和重复规则时提交开始编辑时的 `expectedUpdatedAt`，重复实例同时提交 `expectedRuleUpdatedAt`。服务端在事务内锁定并核对版本，过期返回 `409 EDIT_CONFLICT`，内容、负责人、标签均不写入。任务和日程编辑的 `labelIds` 与内容在同一事务中保存。没有旧客户端兼容要求；保存必须提交版本号，重复实例还必须提交规则版本。缺少或无效版本返回 `400 VALIDATION_FAILED`，不能绕过冲突检查。

发生编辑冲突时保留本机草稿及其原始版本，包括重启后的草稿；用户查看最新内容并确认后，再手动整理和保存。仅刷新页面或重试不会自动接受新版本。重复安排同时检查规则版本，其他实例或规则的编辑也会要求重新查看；后台生成进度不算内容修改。

日历查询通过可选的 `expandRecurring=true` 按需生成，必须提供起止日期，单次最多 366 天。只补齐查看的时间范围，不推进后台连续生成进度，也不会补出今天到远期月份之间的全部实例。重复事件的结束日期、次数上限和单次修改 / 取消仍然有效。未启用此参数的 API 查询保留原行为；后台仍按规则时区生成近期实例（每日到当天，其他频率提前 6 天）。

### 已知缺口

- 备份只有本机每日 `pg_dump`（见生产部署）。整盘级别的冗余是**已评估后放弃**的，不是待办项：系统盘损坏或实例丢失会丢掉全部数据，这是明确接受的代价
- 家庭、日历、任务三块尚未完成 Android 真机验收

## 生产部署

已部署在 `47.117.148.16`（阿里云 ECS，cn-shanghai，Ubuntu 24.04，`ecs.e-c1m1.large` 2 vCPU / 2 GiB）。

**单一来源架构**：Caddy 在 443 终止 TLS，`/api/*` 转发到本机 3000 的 API，其余路径交给 Expo web 静态导出。Web 端与 API 同源，因此不涉及 CORS，`__Secure-` 刷新令牌 Cookie 也成立。

| 组件 | 单元 / 位置 | 说明 |
|------|------|------|
| API | systemd `muchakucha-api` | 以 `muchakucha` 系统用户运行 `node dist/main.js`，只监听 `127.0.0.1:3000` |
| 反向代理 | systemd `caddy` | 唯一对外监听 80 / 443 的进程 |
| 数据库 | systemd `postgresql`（18.6） | 只监听 localhost，库与角色均为 `muchakucha` |
| 证书续期 | `snap.certbot.renew.timer` | 每日两次 |
| 备份 | systemd `muchakucha-backup.timer` | 每日 `pg_dump -Fc` 到 `/var/backups/muchakucha/`，保留 14 天 |
| 代码 | `/opt/muchakucha` | git 仓库，当前为 main |
| Web 静态产物 | `/var/www/muchakucha` | 本地 `expo export` 的结果 |
| 密钥 | `/etc/muchakucha/api.env` | `0600 root`，由 systemd `EnvironmentFile` 读取，**不在仓库内** |

对外只开放 22 / 80 / 443。PostgreSQL 与 API 都绑定 localhost，无法从公网直达。

### 证书

不使用域名。Let's Encrypt 自 2026-01-15 起[正式签发 IP 地址证书](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)，直接为服务器公网 IP 取得受信任证书。

`--ip-address` 需要 certbot ≥ 5.3，**Ubuntu 24.04 的 apt 源只有 2.9.0，装上也没有这个参数**，必须用 snap（附带 `snap.certbot.renew.timer`，无需自建定时任务）：

```bash
snap install --classic certbot
```

首签时 Caddy 尚未占用 80 端口，用 `--standalone`：

```bash
certbot certonly --standalone \
  --preferred-profile shortlived \
  --ip-address 47.117.148.16
```

> **IP 证书有效期仅 160 小时（约 6.7 天）**，远短于域名证书的 90 天。续期一旦停摆，不到一周就会中断服务。

#### 续期：必须改成 webroot

首签留下的续期配置是 `authenticator = standalone`，而 Caddy 之后会一直占着 80 端口，**照原样续期必然失败**。改 `/etc/letsencrypt/renewal/47.117.148.16.conf`：

```ini
authenticator = webroot

[[webroot_map]]
47.117.148.16 = /var/www/html
```

质询目录由 Caddy 的 80 端口站点对外提供，见下面的 Caddyfile。

#### 续期后让 Caddy 拿到新证书

certbot 把证书写成 root 独占，且**每次续期都会重置权限**，而 Caddy 以 `caddy` 用户运行，读不到私钥。`/etc/letsencrypt/renewal-hooks/deploy/10-caddy.sh` 一并解决权限与重载：

```sh
#!/bin/sh
set -e
SRC=/etc/letsencrypt/live/47.117.148.16
install -d -m 750 -o root -g caddy /etc/caddy/tls
install -m 640 -o root -g caddy "$SRC/fullchain.pem" /etc/caddy/tls/fullchain.pem
install -m 640 -o root -g caddy "$SRC/privkey.pem"   /etc/caddy/tls/privkey.pem
systemctl reload caddy
```

用 `certbot renew --dry-run` 实跑一次确认整条链路。

### Caddyfile

```caddyfile
{
	auto_https off
}

:80 {
	handle /.well-known/acme-challenge/* {
		root * /var/www/html
		file_server
	}
	handle {
		redir https://47.117.148.16{uri} permanent
	}
}

:443 {
	tls /etc/caddy/tls/fullchain.pem /etc/caddy/tls/privkey.pem

	encode zstd gzip

	handle /api/* {
		reverse_proxy 127.0.0.1:3000
	}

	handle {
		root * /var/www/muchakucha
		try_files {path} /index.html
		file_server
	}
}
```

> 站点必须按**端口**（`:443`）而不是按主机（`https://47.117.148.16`）声明。SNI 不允许填 IP 字面量（RFC 6066），所以直连 IP 的客户端根本不发 SNI，按主机声明的站点永远匹配不上，握手会以 `tlsv1 alert internal error` 失败。

Expo web 导出是单页应用，只有一个 `index.html`，所以需要 `try_files` 兜底，否则刷新深层路由会 404。`encode` 让 2 MB 的 JS bundle 压到约 500 KB。

### 部署与更新

服务器只跑 API，不在上面构建 Web，也不在上面装客户端依赖：

```bash
pnpm install --frozen-lockfile --filter api...
pnpm --filter api prisma:generate
pnpm --filter api exec prisma migrate deploy
pnpm --filter api build          # tsc

systemctl restart muchakucha-api
```

Web 静态产物在开发机上构建后上传（服务器只有 2 GiB，就地构建会被 OOM 杀掉）：

```bash
EXPO_PUBLIC_API_ORIGIN=https://47.117.148.16 pnpm --filter client exec expo export --platform web
rsync -az --delete apps/client/dist/ <server>:/var/www/muchakucha/
```

大陆服务器上有两个网络坑：

- **GitHub HTTPS 会被重置**（`GnuTLS recv error (-110)`），克隆不下来。用能连 GitHub 的机器 `git bundle create` 后 scp 过去，再从 bundle 克隆。
- **`registry.npmjs.org` 慢到不可用**（约 160 KB/s）。`/root/.npmrc` 写 `registry=https://registry.npmmirror.com`；`--frozen-lockfile` 仍按 lockfile 的哈希校验每个包，镜像不影响完整性。

服务器初始 `vm.swappiness = 0`（阿里云镜像默认），加了 swap 也不会真用上，需要一并调高，否则构建照样 OOM。

### 环境变量

`/etc/muchakucha/api.env`（`0600`，由 systemd 读取，不要提交进仓库）：

```bash
NODE_ENV=production
PORT=3000
HOST=127.0.0.1                      # 只监听本机，强制流量经过代理
TRUST_PROXY=127.0.0.1               # 见下文，缺失会让限流失效
WEB_ORIGIN=https://47.117.148.16    # 必填，必须是 HTTPS 精确来源
DATABASE_URL=postgresql://muchakucha:<密码>@127.0.0.1:5432/muchakucha?schema=public
JWT_ACCESS_SECRET=<强随机密钥，≥32 字节，如 openssl rand -base64 48>
```

生产环境只允许 `WEB_ORIGIN` 中的精确来源跨域访问。

### 备份

`muchakucha-backup.timer` 每日触发 `/usr/local/sbin/muchakucha-backup`：`pg_dump -Fc` 写到 `/var/backups/muchakucha/`，保留 14 天。

脚本先写 `.partial` 再改名，中断的 dump 不会被误认成可用备份。timer 带 `Persistent=true`，机器错过了触发时刻会在下次启动时补跑。

```bash
systemctl start muchakucha-backup.service          # 立即备份一次
systemctl list-timers muchakucha-backup.timer      # 确认还在排程
```

恢复演练（**不要往正式库里 restore**，先进临时库确认再说）：

```bash
sudo -u postgres createdb muchakucha_restore_drill
sudo -u postgres pg_restore -d muchakucha_restore_drill --exit-on-error <dump>
sudo -u postgres dropdb muchakucha_restore_drill
```

> 这些 dump **和数据库在同一块盘上**，只防误删和逻辑损坏，**挡不住系统盘损坏或实例丢失**。
>
> 阿里云自动快照能补上这一层，但按存储容量计费，对家庭自用规模不值得长期付费，因此**决定不配**。代价是明确的：盘没了，数据和备份一起没。要改变这个结论，不必动仓库里的任何代码，在 ECS 控制台配一条自动快照策略即可。

### TRUST_PROXY

限流按客户端 IP 计数。经过反向代理后，每个请求的来源地址都是代理自身，未配置 `TRUST_PROXY` 时全体用户会共用同一份配额——全局 60 次/分钟、注册 5 次/小时都会变成全站共享，一个人用完其他人全被拒。

`TRUST_PROXY` 填写**代理自身**的地址，支持逗号分隔的 IP 或 CIDR。代理与 API 同机时填 `127.0.0.1`。该项只接受明确地址：`true`、`*` 和域名都会导致启动失败，因为无条件信任 `X-Forwarded-For` 会让任何调用方伪造来源、绕过限流。不经过代理直连时不要设置它。

### 局域网联调

开发阶段在手机上用 Expo Go 直连局域网内的开发机。`apps/client/.env` 里的 `localhost` 在手机上指向手机自己，启动时用开发机的局域网地址覆盖它（命令行变量优先于 `.env`）：

```bash
HOST=0.0.0.0 PORT=3100 pnpm --filter api dev   # 开发环境默认只监听 127.0.0.1，手机无法连接
EXPO_PUBLIC_API_ORIGIN=http://<开发机局域网 IP>:3100 pnpm --filter client exec expo start --lan
```

手机上的 Expo Go 打开 `exp://<开发机局域网 IP>:8081`；连不上时检查 Windows 防火墙是否放行这两个端口。此阶段走明文 HTTP：`NODE_ENV` 非 production 时不强制 HTTPS 来源，Android 已开启 `usesCleartextTraffic`。**iOS 无 ATS 例外，连不上明文地址**，局域网联调只能用 Android 或 Web。

### 移动端

使用 EAS Build（`apps/client/eas.json`）：`development`（开发客户端）、`preview`（内部分发）、`production`。构建时通过各 profile 的 `EXPO_PUBLIC_API_ORIGIN` 指定 API 地址。Android 包名与 iOS Bundle ID 均为 `app.muchakucha.zwei`。

`preview` 与 `production` 都指向 `https://47.117.148.16`，证书已就绪，可直接构建：`preview` 是内部分发的安装包，装上即连线上数据，不依赖开发机。

```bash
cd apps/client
pnpm exec eas build --profile preview --platform android
```

## CLI 参考

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 并行启动 API 与 Expo 开发服务器 |
| `pnpm --filter api dev` | 编译并启动 API |
| `pnpm --filter client exec expo start --web --port 8081` | 启动 Web 客户端 |
| `pnpm --filter api prisma:generate` | 生成 Prisma 客户端 |
| `pnpm --filter api exec prisma migrate deploy` | 执行数据库迁移 |
| `pnpm --recursive typecheck` | 全部类型检查 |
| `pnpm test` | 运行全部 API（含集成，需要测试库）与客户端测试 |
| `pnpm test:quick` | API 单元测试 + 客户端测试 |
| `pnpm test:integration` | API 集成测试 |
| `pnpm test:e2e:web` | Web E2E |
| `pnpm openapi:generate` | 重新生成 OpenAPI 契约与客户端 |
| `pnpm openapi:check` | 检查生成产物是否与提交一致 |
