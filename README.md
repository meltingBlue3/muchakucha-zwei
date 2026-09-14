# Muchakucha Zwei（ムチャクチャ 2号）

共享家庭协作应用 — 让家庭成员在移动优先的体验中管理日历、任务和笔记。

## 技术栈

| 层 | 技术 |
|---|------|
| **移动端 / Web** | React Native 0.86 + Expo 57 + Expo Router |
| **UI 系统** | Shopify Restyle（主题化设计系统） |
| **API 服务** | NestJS 11 + Fastify |
| **数据库** | PostgreSQL 17（本地安装，无需 Docker） |
| **ORM** | Prisma 7 |
| **认证** | Argon2 密码哈希 + HS256 JWT 双 Token（Access + Refresh） |
| **API 文档** | OpenAPI / Swagger（从装饰器自动生成） |
| **邮件（可选）** | 仅旧邮箱 API 兼容流程使用；用户名注册、登录和家庭邀请不依赖 SMTP |
| **测试** | Vitest（API 集成）、Playwright（E2E + 无障碍）、Jest（客户端） |
| **包管理** | pnpm workspace monorepo |

## 项目结构

```
muchakucha-zwei/
├── apps/
│   ├── api/                     # NestJS + Fastify 后端
│   │   ├── prisma/              # 数据库 Schema & 迁移
│   │   │   └── schema.prisma    # 数据模型（用户/家庭/事件/任务/重复规则/笔记/标签）
│   │   ├── src/
│   │   │   ├── infrastructure/  # Prisma、邮件适配器
│   │   │   ├── modules/         # auth、users、households、events、tasks、recurrence、notes、labels
│   │   │   └── openapi/         # OpenAPI 自动生成器
│   │   └── test/                # 集成测试
│   └── client/                  # Expo 跨平台客户端
│       ├── app/                 # Expo Router 文件路由
│       │   └── (protected)/     # 受保护页面（需登录，含 recurrence-rules 规则管理页）
│       └── src/
│           ├── features/        # 功能模块 (auth, households, events, tasks, recurrence, notes, labels, profile)
│           └── ui/              # 共享 UI 组件 & 主题
├── e2e/                         # Playwright E2E 测试
│   ├── auth/                    # 认证流程
│   ├── households/              # 家庭协作
│   ├── events/                  # 日历事件、重复规则、无障碍
│   └── tasks/                   # 任务 & 无障碍
├── packages/
│   └── api-client/              # 自动生成（OpenAPI → TypeScript 客户端）
├── docs/
│   └── security/                # ASVS 安全审计证据
├── scripts/                     # 工具脚本（OpenAPI 漂移检查等）
└── .planning/                   # 路线图 & 计划文档
```

### 数据模型

```
User → AuthSession, RefreshToken（旧邮箱 API 另保留验证与重置凭据）
Household → Membership, Invitation, Label
Membership → Role (OWNER / ADMIN / MEMBER)
RecurrenceRule → 归属 Household，按频率（每天/每周/每月/每年）驱动 Event/Task 的滚动生成
Event → 归属 Household，支持全天/定时事件，可关联 RecurrenceRule 与多个 Label
Task → 归属 Household，过滤/状态流转/分配，可关联 RecurrenceRule 与多个 Label
Note → 归属 Household 的共享笔记，可关联多个 Label
```

## 快速开始

### 前置条件

- **Node.js** ≥ 24.0.0
- **pnpm** ≥ 10.x
- **PostgreSQL 17** 本地运行（推荐）

### 1. 克隆并安装

```bash
git clone <repo-url>
cd muchakucha-zwei
pnpm install
```

### 2. 配置数据库

**方式一：Docker Compose（推荐测试环境）**

```bash
docker compose up -d
# 启动 PostgreSQL 17 + Mailpit（SMTP 测试服务器）
# PostgreSQL: localhost:55432
# Mailpit Web UI: http://localhost:18025
```

**方式二：本地安装**

创建两个 PostgreSQL 数据库：

```sql
CREATE USER muchakucha_dev WITH PASSWORD 'muchakucha_dev_only';
CREATE USER muchakucha_test WITH PASSWORD 'muchakucha_test_only';
CREATE DATABASE muchakucha_dev OWNER muchakucha_dev;
CREATE DATABASE muchakucha_test OWNER muchakucha_test;
```

或通过环境变量自定义：

```bash
export DATABASE_URL='postgresql://user:password@localhost:5432/muchakucha_dev'
export TEST_DATABASE_URL='postgresql://user:password@localhost:5432/muchakucha_test'
```

### 3. 迁移数据库 & 生成 Prisma 客户端

```bash
cd apps/api
pnpm prisma:generate
npx prisma migrate deploy
```

### 4. 环境变量

API 服务需要的环境变量（开发环境有安全默认值）：

| 变量 | 说明 | 默认值（开发） |
|------|------|----------------|
| `DATABASE_URL` | PostgreSQL 连接串 | — |
| `JWT_ACCESS_SECRET` | JWT 签名密钥（≥32 字节） | `development-only-access-secret-change-before-production` |
| `NODE_ENV` | 运行环境 | `development` |
| `WEB_ORIGIN` | 允许的 CORS 来源（逗号分隔） | `http://127.0.0.1:8081` |
| `SMTP_*` | 可选，仅使用旧邮箱 API 时配置 | 开发环境自动使用控制台输出 |

### 5. 启动开发服务器

```bash
# 启动 API 服务 (http://127.0.0.1:3000)
cd apps/api && pnpm dev

# 启动客户端 Web 开发服务 (http://127.0.0.1:8081)
pnpm --filter client exec expo start --web --port 8081
```

注册只需用户名、密码和确认密码，成功后自动登录。用户名支持 3–32 个字母、数字、点、下划线或连字符（包含中文），忽略首尾空白及大小写；密码为 8–128 个字符，两次输入必须一致。登录使用用户名和密码。家庭邀请按已注册用户名生成分享链接，无需邮箱。

为保持 `/api/v1` 兼容，旧邮箱注册、验证、找回密码接口仍保留；客户端使用新的用户名流程。新账号的邮箱字段在数据库中为空，旧响应中的 `email` 返回空字符串并新增 `username`。应用启动前需执行新增数据库迁移。

### 6. 运行测试

```bash
# API 集成测试
pnpm test:integration

# API 类型检查
cd apps/api && pnpm typecheck

# 客户端类型检查
cd apps/client && pnpm typecheck

# E2E 测试（需要先启动 API 和客户端）
pnpm test:e2e:web

# OpenAPI 一致性检查
pnpm openapi:check
```

## 功能完成度

| 阶段 | 进度 | 状态 |
|------|------|--------|
| Phase 1: 安全账户入口 | 27/27 | ✅ 完成 |
| Phase 2: 家庭组与成员协作 | 12/13 | 🔄 待 Android 真机验收 |
| Phase 3: 共享家庭日历 | 3/4 | 🔄 待 Android 真机验收 + 无障碍审计 |
| Phase 4: 任务与今日视图 | 3/4 | 🔄 待 Android 真机验收（其余门禁均绿） |
| Phase 5: 笔记与标签整理 | ~2/3（代码完成，未走 GSD 流程） | ⚠️ 零自动化测试、缺"按标签筛选"能力、未跑门禁 |
| Phase 6: 跨平台完成度与发布准备 | 0/3 | 待开始 |
| Phase 7: 周期性重复事件与任务 | 15/15 | ✅ 完成（含 Android 真机验收） |

### 已实现功能

- **账户**：用户名注册与登录、注册后自动登录、会话恢复、昵称修改、设备级退出；密码使用 Argon2id 哈希，刷新凭据存于原生 SecureStore 或 Web HttpOnly Cookie
- **家庭协作**：创建/命名家庭、邀请成员、接受/拒绝/撤回邀请、角色治理（OWNER/ADMIN/MEMBER）、移除成员、所有权转移
- **共享日历**：月视图、日期列表、全天/定时事件、创建/编辑/删除、时区安全 timestamptz 建模
- **任务管理**：状态流转（pending → in_progress → completed）、优先级、负责人分配、过滤排序
- **今日视图**：逾期任务高亮、今日事件、今日待办、即将到来 — 一站式聚合
- **周期性重复**：事件与任务均支持每天/每周（多选星期几）/每月/每年重复，月末自动钳位、DST 正确处理；「仅此一次」与「此后所有」两种编辑/删除范围由服务端强制执行；重复规则管理页（列表 + 详情）支持规则级编辑与「结束此重复」
- **笔记与标签**：家庭共享笔记的创建/查看/编辑/删除；标签的创建/重命名/着色/删除；事件与任务可打标签（⚠️ 尚不支持按标签筛选列表，且此功能未走完整测试门禁 — 见下方测试覆盖）

### 测试覆盖

- **API 集成测试**：用户名注册和登录、旧邮箱 API 兼容、会话、用户、家庭邀请、事件、任务、周期性重复及安全边界；笔记与标签模块目前**没有**集成测试覆盖
- **Playwright E2E**：认证流程、家庭协作矩阵、日历 API、任务 API、周期性重复的 Web 端到端旅程与重复规则管理页、无障碍审计
- **客户端单元测试**：Jest + Testing Library

## 生产部署

生产环境需要额外配置：

```bash
export NODE_ENV=production
export JWT_ACCESS_SECRET='<强随机密钥 32+ 字节>'
export WEB_ORIGIN='https://your-app.example.com'
```

用户名注册和家庭邀请无需配置邮件服务。只有需要旧邮箱 API 时才配置：

```bash
export EMAIL_LINK_ORIGIN='https://your-app.example.com'
export SMTP_HOST='smtp.example.com'
export SMTP_PORT=587
export SMTP_SECURE=false
export SMTP_USER='noreply@example.com'
export SMTP_PASSWORD='<smtp-password>'
export SMTP_FROM='noreply@example.com'
```

生产 CORS 仅允许 `WEB_ORIGIN` 配置的精确来源。未配置 SMTP 时邮件功能不可用，用户名流程照常使用。

## CLI 参考

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 并行启动 API + 客户端开发服务器 |
| `pnpm test` | 运行全部测试 |
| `pnpm test:integration` | API 集成测试 |
| `pnpm test:e2e:web` | Web E2E 测试 |
| `pnpm test:quick` | 快速单元测试 |
| `pnpm openapi:generate` | 从 API 装饰器重新生成 OpenAPI 客户端 |
| `pnpm openapi:check` | 检查 OpenAPI 生成文件是否与提交一致 |
