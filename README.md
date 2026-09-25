# Muchakucha Zwei（ムチャクチャ 2号）

共享家庭协作应用 — 让家庭成员在移动优先的体验中管理日程、任务、笔记和标签。Android 与 iOS 为主要平台，Web 为次要平台。

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
| **邮件（可选）** | 仅旧邮箱 API 兼容流程使用；用户名注册、登录和家庭邀请不依赖 SMTP |
| **测试** | Vitest（API 单元 / 集成）、Jest + Testing Library（客户端）、Playwright（Web E2E + 无障碍） |
| **包管理** | pnpm 10 workspace monorepo（不要使用 npm 安装） |

## 项目结构

```
muchakucha-zwei/
├── apps/
│   ├── api/                       # NestJS + Fastify 后端
│   │   ├── prisma/                # schema.prisma 与迁移
│   │   ├── src/
│   │   │   ├── infrastructure/    # Prisma、邮件适配器（SMTP / 控制台 / 禁用）
│   │   │   ├── modules/           # auth、users、households、events、tasks、recurrence、notes、labels
│   │   │   └── openapi/           # OpenAPI 契约与客户端生成器
│   │   └── test/                  # 集成测试（会清空测试库）
│   └── client/                    # Expo 跨平台客户端
│       ├── app/                   # Expo Router 文件路由
│       │   ├── (auth)/            # 登录、注册、离线页
│       │   ├── invite/            # 邀请链接落地页
│       │   └── (protected)/       # 需登录：家庭列表、个人中心、家庭内各页面
│       └── src/
│           ├── features/          # auth、households、events、tasks、recurrence、notes、labels、profile
│           ├── platform/          # 原生 / Web 差异适配（会话、当前家庭、邀请、浮层焦点、字体）
│           └── ui/                # 共享组件与主题 token
├── packages/
│   └── api-client/                # 生成产物，请勿手改
├── e2e/                           # Playwright 用例（auth、households、events、tasks、support）
├── docs/                          # 设计规范与调研、产品路线图、agent/ 操作手册、security/ ASVS 审计
├── scripts/                       # OpenAPI 漂移检查；PowerShell 测试门禁脚本
├── compose.yaml                   # 测试用 PostgreSQL + Mailpit
├── playwright.config.ts           # 完整 Web E2E（启动 API + Web）
└── playwright.ui.config.ts        # 仅 UI 回归（拦截全部 API 请求，无需数据库）
```

### 数据模型

```
User → AuthSession, RefreshToken（旧邮箱 API 另有 EmailVerificationToken、PasswordResetToken）
Household → Membership, Invitation, Event, Task, RecurrenceRule, Note, Label
Membership → Role (OWNER / ADMIN / MEMBER)
Invitation → 按已注册用户名发出（旧邮箱邀请仍兼容）
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
# Mailpit：SMTP 127.0.0.1:11025，Web UI http://127.0.0.1:18025
```

Compose 中的库是测试库，运行集成测试或 E2E 时会被清空。

### 3. 配置 API 环境变量

API 和 Prisma CLI 都会读取 `apps/api/.env`（已被 git 忽略），也可以直接 export：

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
| `WEB_ORIGIN` | 生产 CORS 允许的精确来源（逗号分隔）；第一个值也用于生成邀请分享链接 | 非生产环境 CORS 放行所有来源 |
| `EMAIL_LINK_ORIGIN` | 旧邮箱流程链接的来源 | `http://127.0.0.1:8081` |
| `SMTP_*` | 旧邮箱 API 的发信配置 | 未设置 `SMTP_HOST` 时邮件输出到控制台 |

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

`pnpm dev` 会并行运行 API 和 `expo start`。Web 请使用上面的 8081 命令：`client` 包的 `web` 脚本使用 18025 端口，与 Mailpit 冲突。

API 的 OpenAPI 文档位于 `http://127.0.0.1:3000/api/v1/openapi.json`（未启用 Swagger UI）。

### 使用流程

1. 注册只需用户名、密码和确认密码，成功后自动登录。用户名为 3–32 个字母、数字、点、下划线或连字符（支持中文），忽略首尾空白和大小写；密码 8–128 个字符。
2. 创建家庭，或通过邀请链接加入。邀请按已注册用户名生成分享链接，无需邮箱。
3. 进入家庭后默认打开「今日」。底部导航（宽屏为侧栏）有五个入口：**今日、日历、任务、笔记、家庭**。标签管理、周期规则和家庭设置（成员、邀请、角色、所有权）都在「家庭」页。
4. 通过账户菜单进入个人中心，可修改昵称、查看我的家庭、退出当前设备。

为保持 `/api/v1` 兼容，旧邮箱注册、验证、找回密码接口仍保留，但客户端只使用用户名流程。新账号的邮箱字段为空，旧响应中的 `email` 返回空字符串，并新增 `username`。

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
- **家庭协作**：创建 / 重命名 / 切换家庭；按用户名邀请，接受 / 重发 / 撤回邀请；OWNER / ADMIN / MEMBER 角色治理、移除成员、所有权转移、所有者离开
- **今日**：当天日程、待办与逾期任务的概览，后续安排默认收起
- **日历**：月视图、全天 / 定时事件，按标签和是否重复筛选；时间点使用 `timestamptz`
- **任务**：待处理 → 进行中 → 已完成、优先级、多负责人，按状态、标签和是否重复筛选；筛选状态在切换页面后保留
- **周期性重复**：事件与任务支持每天 / 每周（多选星期）/ 每月 / 每年，月末钳位并正确处理夏令时；可选择「仅此一次」或「此后所有」范围编辑 / 删除；周期规则列表与详情页支持编辑规则和结束重复
- **笔记**：家庭共享笔记的增删改查；草稿在取消后保留，保存成功后清除
- **标签**：OWNER / ADMIN 可创建、重命名、着色、删除；所有成员都可给事件和任务打标签

### 已知缺口

- 标签管理页未按角色隐藏创建 / 编辑 / 删除入口，MEMBER 操作时会被 API 拒绝并显示失败提示
- 备份只有本机每日 `pg_dump`（见生产部署），**未配置阿里云快照**，系统盘损坏或实例丢失仍会丢掉全部数据
- 没有测试覆盖 `dist/` 的运行时资源：测试从 `src/` 读密码字典，`build` 若漏掉复制步骤，只有线上旧邮箱接口会抛 ENOENT
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
pnpm --filter api build          # tsc + 复制运行时资源

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

> 这些 dump **和数据库在同一块盘上**，只防误删和逻辑损坏，**挡不住系统盘损坏或实例丢失**。整盘级别的兜底要在阿里云控制台配自动快照策略，仓库里的任何脚本都做不到这件事。

### TRUST_PROXY

限流按客户端 IP 计数。经过反向代理后，每个请求的来源地址都是代理自身，未配置 `TRUST_PROXY` 时全体用户会共用同一份配额——全局 60 次/分钟、注册与密码重置 5 次/小时都会变成全站共享，一个人用完其他人全被拒。

`TRUST_PROXY` 填写**代理自身**的地址，支持逗号分隔的 IP 或 CIDR。代理与 API 同机时填 `127.0.0.1`。该项只接受明确地址：`true`、`*` 和域名都会导致启动失败，因为无条件信任 `X-Forwarded-For` 会让任何调用方伪造来源、绕过限流。不经过代理直连时不要设置它。

### 局域网联调

开发阶段用 `preview` profile 直连局域网内的开发机：

```bash
export HOST=0.0.0.0   # 开发环境默认只监听 127.0.0.1，手机无法连接
pnpm dev
```

`apps/client/eas.json` 的 preview profile 指向 `http://192.168.1.7:3000`，换成开发机实际的局域网地址即可。此阶段走明文 HTTP：`NODE_ENV` 非 production 时不强制 HTTPS 来源，Android 已开启 `usesCleartextTraffic`。**iOS 无 ATS 例外，连不上明文地址**，局域网联调只能用 Android 或 Web。

### 邮件（可选）

用户名注册和家庭邀请不需要邮件服务。只有需要旧邮箱 API 时才配置以下变量（生产环境设置了 `SMTP_HOST` 后，其余项均为必填）：

```bash
export EMAIL_LINK_ORIGIN='https://your-app.example.com'
export SMTP_HOST='smtp.example.com'
export SMTP_PORT=587
export SMTP_SECURE=false
export SMTP_USER='noreply@example.com'
export SMTP_PASSWORD='<smtp-password>'
export SMTP_FROM='noreply@example.com'
```

未配置 SMTP 时邮件功能不可用，用户名流程不受影响。

### 移动端

使用 EAS Build（`apps/client/eas.json`）：`development`（开发客户端）、`preview`（内部分发）、`production`。构建时通过各 profile 的 `EXPO_PUBLIC_API_ORIGIN` 指定 API 地址。Android 包名与 iOS Bundle ID 均为 `app.muchakucha.zwei`。

`production` 指向 `https://47.117.148.16`，证书已就绪，可直接构建；`preview` 直连局域网开发机的明文地址，仅 Android 与 Web 可用。

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
