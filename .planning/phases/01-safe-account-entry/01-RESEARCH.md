# Phase 1: 安全账户入口 - Research

**Researched:** 2026-08-01
**Domain:** Expo 通用客户端、NestJS/Fastify 认证 API、Prisma/PostgreSQL 会话安全
**Confidence:** HIGH（项目决策与安全不变量）；MEDIUM（当前版本与官方文档经 WebSearch 核验，Context7/Jina 在本会话不可用）

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### 账户入口与页面流程

- **D-01:** 未登录用户首次打开应用时直接进入登录页；页面内提供清晰的创建账户入口，不增加独立欢迎页。
- **D-02:** 注册采用单页精简表单，一次填写邮箱、允许重复的昵称和密码；不要求重复输入密码，但必须提供密码显示或隐藏控制。
- **D-03:** 登录成功后智能分流：已有家庭组的用户进入 Today；没有家庭组的用户进入创建或加入家庭组引导。Phase 1 可先提供明确的后续占位边界，实际家庭流程由 Phase 2 实现。
- **D-04:** 应用启动恢复会话时保持品牌启动屏，直到会话状态判定完成，避免登录页或主界面闪烁。

### 邮箱验证与密码恢复

- **D-05:** 注册提交后进入验证等待页，显示目标邮箱、打开邮箱引导和重新发送入口。
- **D-06:** 同一设备打开验证链接后自动完成验证并继续；在其他设备或浏览器打开时显示验证成功，并引导用户登录。
- **D-07:** 验证链接的过期、已使用和无效状态必须区分：过期可重新发送，已使用可直接登录，无效链接引导重新发起。
- **D-08:** 重新发送成功后显示确认反馈和 60 秒倒计时；倒计时结束前禁用重复发送按钮。
- **D-09:** 密码重置成功后显示成功确认并返回登录页，用户必须使用新密码重新登录，不自动建立会话。

### 会话与异常行为

- **D-10:** 允许同一账户在多个设备同时登录；每台设备拥有独立 Refresh Token，普通退出仅撤销当前设备会话。
- **D-11:** Refresh Token 过期、撤销或发生重放检测时，客户端清理本地会话，说明“登录已过期，请重新登录”，并返回登录页；重新登录后尽量恢复原目标路由。
- **D-12:** 已登录用户无网启动时保留本地会话，显示带重试操作的离线等待页；网络失败不得被误判为凭据失效，本阶段不承诺离线业务操作。
- **D-13:** 密码重置成功时撤销该账户全部 Refresh Token，所有设备都必须使用新密码重新登录。

### 视觉基调与认证页面

- **D-14:** 品牌气质为“温暖、现代、克制”：有家庭感但不幼稚，优先保证长期高频使用时的清晰与安静。
- **D-15:** 主色方向采用暖珊瑚色与奶油白；深墨色承担正文和关键对比，青绿色只作为少量状态辅助色。最终色值必须满足可访问性对比要求。
- **D-16:** 认证页面由品牌字标、简洁表单和抽象色块构成，不使用大幅家庭场景插画。
- **D-17:** 组件采用舒展的移动触控密度与中等圆角；主要输入框和按钮高度约 48–52px，以边框和轻微层次表达结构，不使用厚重阴影。

### the agent's Discretion

- 在符合安全基线和上述体验决策的前提下，确定密码策略、Access/Refresh Token 精确有效期、哈希参数与限流阈值。
- 选择开发期邮件适配方式、生产事务邮件提供商接口边界和邮件模板细节。
- 确定精确色值、字体、图标、动效时长以及表单校验文案，但必须遵守已锁定的视觉方向和可访问性要求。
- 确定 API 错误码、深链接路由和会话恢复实现细节，确保所有已决定状态都可稳定区分和测试。

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | 访客可以使用邮箱和密码创建账户。 | 注册事务、邮箱规范化唯一键、Argon2id、枚举安全响应与注册 UI。 |
| AUTH-02 | 新用户可以通过邮件链接验证邮箱。 | 单次哈希令牌、HTTPS/深链落地页、同设备 continuation proof、四种验证结果。 |
| AUTH-03 | 已验证用户可以使用邮箱和密码登录，并在应用重启后保持会话。 | Access JWT + 轮换 Refresh、SecureStore/Cookie 分流、启动状态机。 |
| AUTH-04 | 用户可以通过发送到注册邮箱的限时链接重置密码。 | 通用请求响应、单次重置令牌、密码更新与全会话撤销事务。 |
| AUTH-05 | 用户可以退出当前设备，退出后该设备的 Refresh Token 不再有效。 | JWT `sid`、单设备 Session 撤销、Cookie/SecureStore 清理。 |
| AUTH-06 | 用户可以设置和修改允许重复的显示昵称。 | `User.displayName` 非唯一字段、受保护 `/users/me` PATCH。 |
| SAFE-03 | Android/iOS 的长期会话凭据必须存入系统安全存储，Web 的 Refresh Token 必须由 HttpOnly Cookie 承载。 | 平台 `SessionStore`/transport adapter 与明确的禁用 localStorage 规则。 |
| SAFE-04 | 服务端必须支持 Refresh Token 轮换、撤销和重放检测，并且数据库只保存 Token 哈希。 | Session + RefreshToken 世代表、条件消费事务、family 撤销与重放测试矩阵。 |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- 客户端必须使用 Expo、React Native、TypeScript、Expo Router，Android/iOS 移动优先，Web 仅为辅助入口；不得拆出独立 Next.js 客户端。（项目锁定）
- UI 必须使用统一品牌、类型化设计令牌与自有组件层；已批准的 UI-SPEC 进一步锁定 `@shopify/restyle`、Lucide、Noto Sans SC、本阶段浅色主题和认证原语集合。（项目锁定）
- API 必须使用 NestJS 11、Fastify adapter、TypeScript strict、REST/OpenAPI 和 `/api/v1`；不得把 Prisma model 暴露为客户端 DTO。（项目锁定）
- 数据必须使用 PostgreSQL、稳定 Prisma 7、Prisma Migrate、真实外键/唯一/检查约束和事务；时间点使用 `timestamptz`，服务端以 UTC 处理。（项目锁定）
- 仓库必须是 pnpm workspace 单体仓库，客户端、API 和生成的 API client 共享一个 lockfile。（项目锁定）
- Access Token 必须短期；Refresh Token 必须轮换、服务端只存哈希；Web 不得在 localStorage 保存 Refresh Token。（项目锁定）
- 旧项目只能作为需求参考，不复用 Vue、FastAPI、Kotlin、MySQL 代码，也不迁移历史数据。（项目锁定）
- 当前没有既有代码约定或架构映射；新模式应遵循规划研究中的模块化单体、生成契约和平台 adapter 边界。（AGENTS.md）
- 项目没有本地 skill；本研究不需要叠加额外项目 skill 规则。（已检查 `.codex/skills`、`.agents/skills`、`.cursor/skills`、`.github/skills`）
- 文件变更必须经 GSD workflow；本文件由已启动的 Phase 1 plan/research workflow 生成。（AGENTS.md）

## Summary

本阶段应规划为一条真正可运行的 vertical walking skeleton：先建立 pnpm workspace、Expo universal app、NestJS/Fastify API、Prisma 7/PostgreSQL 18 和 OpenAPI client generation，再在同一条骨架上完成注册→验证→登录→恢复→资料修改→退出与重置闭环。Prisma 7 的 relational driver adapter 是必需连接层，PostgreSQL 适配器为 `@prisma/adapter-pg`；连接 URL 放在 `prisma.config.ts`，migration history 与 schema 一起提交。[CITED: https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql] [CITED: https://www.prisma.io/docs/orm/v6/prisma-migrate/getting-started]

安全核心不是“签一个 JWT”，而是服务器持久化的设备 Session 与 RefreshToken family。Refresh token 每次使用都原子消费并创建下一代；再次出现已消费 token 时撤销整个设备 session。RFC 9700 明确要求 public client 的 refresh token 使用 sender constraint 或 rotation，并保留关系以检测 replay。[CITED: https://www.rfc-editor.org/rfc/rfc9700.html] 密码使用 Argon2id；验证/重置/refresh 均使用高熵 opaque token，仅保存 SHA-256 哈希；密码重置在一个数据库事务里同时消费 reset token、更新 password hash、撤销该用户所有 Session。[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html]

客户端必须把 native 与 Web 的 refresh transport 分开：Android/iOS 只把 Refresh Token 放入 SecureStore；Web 只依赖 HttpOnly Cookie，Access Token 仅驻留内存。Expo 官方确认 SecureStore 面向小型敏感值且 Web 没有等价实现；其 Router 示例中的 Web localStorage 不能用于本项目 refresh token。[CITED: https://docs.expo.dev/develop/user-interface/store-data/] [CITED: https://docs.expo.dev/router/advanced/authentication/] 启动恢复是一个明确状态机，网络错误保留本地 credential 并进入 offline-waiting，只有服务端明确返回 credential invalid/revoked/replayed 才清理会话。

**Primary recommendation:** 用 `User + AuthSession + RefreshToken + EmailVerificationToken + PasswordResetToken` 五个持久模型、平台分流 refresh transport、事务化 rotation/revocation 和端到端验证矩阵组织 Phase 1；不要把认证实现成客户端 token boolean 或单表 JWT 黑名单。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 注册/登录/密码策略 | API / Backend | Database / Storage | API owns use-case rules; database enforces email uniqueness and token relations. |
| 密码与 token 哈希 | API / Backend | Database / Storage | Secrets are transformed before persistence; storage only keeps derived values. |
| Refresh rotation/replay | API / Backend | Database / Storage | Detection depends on atomic state transition and durable family history. |
| Native credential persistence | Browser / Client | OS secure storage | Expo adapter invokes Android Keystore/iOS Keychain through SecureStore.[CITED: https://docs.expo.dev/versions/v55.0.0/sdk/securestore/] |
| Web refresh credential | API / Backend | Browser / Client | API sets/clears HttpOnly Cookie; browser transports it without JS access.[CITED: https://docs.nestjs.com/techniques/cookies] |
| Session bootstrap/routing | Browser / Client | API / Backend | Client owns splash and route state; API decides whether credential is valid. |
| Verification/reset deep link | Browser / Client | API / Backend | Router parses and sanitizes link; API alone consumes and classifies token. |
| Email composition/delivery | API / Backend adapter | External SMTP service | Auth use case calls a port; vendor/SMTP details remain infrastructure. |
| User/session/token persistence | Database / Storage | API / Backend | PostgreSQL owns constraints; Prisma maps use cases to transactions. |
| OpenAPI/generated client | API / Backend | Browser / Client | Controller DTOs publish contract; generated package is consumed by client. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.18.0 LTS | Runtime/toolchain | Installed locally and matches locked Node 24 line. `[VERIFIED: local CLI]` |
| Expo | 57.0.9 | Universal client | Locked SDK line; registry reports this patch published 2026-07-29. `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]` |
| Expo Router | 57.0.9 | File routes, protected routes, deep links | Bundled SDK 57 line; official docs expose protected routes and native intent handling.[CITED: https://docs.expo.dev/versions/latest/sdk/router/] Exact patch `[ASSUMED]`. `[WARNING: seam SUS—latest patch too new]` |
| React / React Native | 19.2.8 / 0.86.2 | UI runtime | Matches project SDK 57 compatibility research; registry reports patches dated 2026-07-21/27. `[ASSUMED]` `[WARNING: seam SUS—latest patches too new]` |
| NestJS | 11.1.28 | Modular API | Locked server framework; use aligned core/common/platform-fastify versions. `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]` |
| `@nestjs/platform-fastify` | 11.1.28 | HTTP adapter | Nest 11 supports Fastify 5.[CITED: https://docs.nestjs.com/migration-guide] Exact patch `[ASSUMED]`. `[WARNING: seam SUS—latest patch too new]` |
| Prisma / `@prisma/client` | 7.9.1 | ORM and migrations | Current registry v7 patch; CLI/client/adapter versions must match. `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]` |
| `@prisma/adapter-pg` / `pg` | 7.9.1 / 8.22.0 | Required Prisma 7 PostgreSQL transport | Driver adapters are required for relational connectivity in v7.[CITED: https://docs.prisma.io/docs/orm/v6/more/internals/engines] Adapter patch `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]`; `pg` `[VERIFIED: npm registry]`. |
| PostgreSQL | 18.x | System of record | Locked target; unique constraints automatically create enforcement indexes.[CITED: https://www.postgresql.org/docs/18/ddl-constraints.html] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `expo-secure-store` | 57.0.1 | Native refresh/pending-proof storage | Android/iOS only; install with Expo version resolver.[CITED: https://docs.expo.dev/versions/v55.0.0/sdk/securestore/] Exact patch `[ASSUMED]`. `[WARNING: seam SUS—latest patch too new]` |
| `@shopify/restyle` | 2.4.5 | Typed UI tokens | Every shared UI primitive; locked by UI-SPEC; exact patch `[ASSUMED]` despite an OK registry gate. |
| `lucide-react-native` | 1.28.0 | Icons | Individual imports only; locked by UI-SPEC. `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]` |
| `@tanstack/react-query` | 5.101.4 | API mutation/query lifecycle | Auth mutations and later server state; not the source of truth for session credential. `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]` |
| `react-hook-form` / `zod` | 7.83.0 / 4.4.3 | Client forms/runtime schemas | Registration/login/reset/profile forms; exact patches `[ASSUMED]`; RHF `[WARNING: seam SUS—latest patch too new]`, Zod passed the registry gate. |
| `@nestjs/swagger` | 11.4.6 | OpenAPI generation | Controller DTO contract; generate `packages/api-client`. `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]` |
| `@nestjs/jwt` | 11.0.2 | Access JWT signing/verification | Access token only; refresh tokens remain opaque; exact patch `[ASSUMED]` despite an OK registry gate. |
| `class-validator` / `class-transformer` | 0.15.1 / 0.5.1 | API DTO validation | Use global `ValidationPipe` with whitelist/transform; exact patches `[ASSUMED]` despite OK registry gates. |
| `@fastify/cookie` | 11.1.2 | Web cookie parse/set | Register before auth routes; Nest documents this plugin for Fastify.[CITED: https://docs.nestjs.com/techniques/cookies] Exact patch `[ASSUMED]`. `[WARNING: seam SUS—latest patch too new]` |
| `@nestjs/throttler` | 6.5.0 | Auth endpoint rate limits | Global baseline plus tighter per-route policies; official Nest solution.[CITED: https://docs.nestjs.com/security/rate-limiting] |
| `argon2` | 0.45.1 | Password Argon2id | Hash/verify passwords only. `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]` |
| `nodemailer` | 9.0.3 | SMTP infrastructure adapter | Local Mailpit and production SMTP-compatible provider behind `MailPort`; `verify()` checks transport connectivity.[CITED: https://nodemailer.com/smtp] |
| Vitest / Nest testing / Supertest | 4.1.10 / 11.1.28 / 7.2.2 | API unit/integration | Nest is test-runner agnostic and exposes testing modules.[CITED: https://docs.nestjs.com/fundamentals/testing] Vitest/Nest exact patches `[ASSUMED]` `[WARNING: seam SUS—latest patches too new]`; Supertest `[VERIFIED: npm registry]`. |
| Jest / `jest-expo` / RNTL | 30.4.2 / 57.0.3 / 14.0.1 | Expo component/integration | Expo officially recommends the Jest preset and React Native Testing Library.[CITED: https://docs.expo.dev/develop/unit-testing/] `jest-expo` exact patch `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]`; Jest/RNTL passed the gate. |
| Playwright / axe | 1.62.1 / 4.12.1 | Web E2E/accessibility | Browser auth flows, cookies, links and automated WCAG checks; manual a11y remains required.[CITED: https://playwright.dev/docs/next/accessibility-testing] Playwright patch `[ASSUMED]` `[WARNING: seam SUS—latest patch too new]`; axe `[VERIFIED: npm registry]`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Opaque rotating refresh token | Refresh JWT | JWT still needs durable generation/revocation state for replay detection; opaque values reduce claims leakage and simplify hash lookup. |
| SMTP `MailPort` | Vendor SDK | Vendor SDK can offer richer events, but locks the auth module to an unresolved deployment provider; defer vendor adapter. |
| Prisma models as DTO | Generated OpenAPI client | Hand-sharing persistence types leaks hashes/internal timestamps and couples mobile releases to schema changes; prohibited by project constraints. |
| Jest for Expo UI | Vitest everywhere | Vitest is preferred for API/shared packages, but Expo's current official native preset is `jest-expo`; use the supported tool per runtime.[CITED: https://docs.expo.dev/develop/unit-testing/] |
| Application-lowercased email unique field | PostgreSQL `citext` | PostgreSQL recommends considering nondeterministic collations for broader Unicode behavior; explicit canonicalization is simpler and portable for this v1 identity policy.[CITED: https://www.postgresql.org/docs/17/citext.html] |

**Installation (after one human verification checkpoint for all `[SUS]` latest patches):**

```bash
corepack prepare pnpm@latest-10 --activate
pnpm add -w -D typescript vitest @playwright/test @axe-core/playwright
pnpm --filter api add @nestjs/common@11.1.28 @nestjs/core@11.1.28 @nestjs/platform-fastify@11.1.28 @nestjs/swagger@11.4.6 @nestjs/jwt@11.0.2 @nestjs/throttler@6.5.0 @fastify/cookie@11.1.2 class-validator@0.15.1 class-transformer@0.5.1 argon2@0.45.1 nodemailer@9.0.3 prisma@7.9.1 @prisma/client@7.9.1 @prisma/adapter-pg@7.9.1 pg@8.22.0
pnpm --filter api add -D @nestjs/testing@11.1.28 supertest@7.2.2 @types/supertest@7.2.1 @types/nodemailer@8.0.1 @types/pg@8.20.0
pnpm --filter client exec expo install expo-router expo-secure-store
pnpm --filter client add @shopify/restyle@2.4.5 lucide-react-native@1.28.0 @tanstack/react-query@5.101.4 react-hook-form@7.83.0 zod@4.4.3
pnpm --filter client exec expo install jest-expo jest @types/jest @testing-library/react-native --dev
```

Pin the workspace `packageManager` field after installing pnpm; do not leave `latest-10` in committed setup instructions. `[ASSUMED]`

## Package Legitimacy Audit

Registry versions, publish timestamps, downloads, repository URLs and `postinstall` fields were checked on 2026-08-01.[CITED: https://registry.npmjs.org/] The seam marks a release younger than its age threshold as `SUS` even when it is an official high-download package; protocol therefore still requires a single human checkpoint before installing the flagged set. No inspected current release declared a `postinstall` script.[CITED: https://registry.npmjs.org/]

| Package | Registry | Age / Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----------------|-------------|---------|-------------|
| `expo`, `expo-router`, `expo-secure-store` | npm | latest patches 3–17d; 4.3–7.3M/wk | github.com/expo/expo | SUS (too-new) | Flagged — one human verify checkpoint; retain because locked and official-doc confirmed |
| `react`, `react-native` | npm | latest patches 5–11d; 11–163M/wk | github.com/react/* | SUS (too-new) | Flagged — verify Expo compatibility before install |
| `@shopify/restyle` | npm | release >1y; 68k/wk | github.com/Shopify/restyle | OK | Approved |
| `lucide-react-native` | npm | latest patch 2d; 1.6M/wk | github.com/lucide-icons/lucide | SUS (too-new) | Flagged — locked UI dependency |
| `@tanstack/react-query` | npm | latest patch 11d; 61M/wk | github.com/TanStack/query | SUS (too-new) | Flagged |
| `react-hook-form` | npm | latest patch 7d; 58M/wk | github.com/react-hook-form/react-hook-form | SUS (too-new) | Flagged |
| `zod` | npm | release 3mo; 246M/wk | github.com/colinhacks/zod | OK | Approved |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify`, `@nestjs/testing` | npm | latest patch 24d; 1.5–13.6M/wk | github.com/nestjs/nest | SUS (too-new) | Flagged — install aligned versions only |
| `@nestjs/swagger` | npm | latest patch 15d; 7.3M/wk | github.com/nestjs/swagger | SUS (too-new) | Flagged |
| `@nestjs/jwt` | npm | release 8mo; 4.4M/wk | github.com/nestjs/jwt | OK | Approved |
| `@nestjs/throttler` | npm | release 8mo; 3.5M/wk | github.com/nestjs/throttler | OK | Approved |
| `fastify` | npm | latest patch 2d; 10.6M/wk | github.com/fastify/fastify | SUS (too-new) | Flagged; prefer adapter-resolved compatible Fastify 5 |
| `@fastify/cookie` | npm | latest patch 17d; 2.3M/wk | github.com/fastify/fastify-cookie | SUS (too-new) | Flagged |
| `class-validator`, `class-transformer` | npm | releases 5mo / 4.7y; 11–12M/wk | github.com/typestack/* | OK | Approved |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg` | npm | latest patch 5d; 4.4–15.7M/wk | github.com/prisma/prisma | SUS (too-new) | Flagged — install all at exact 7.9.1 |
| `pg` | npm | release 6wk; 39M/wk | github.com/brianc/node-postgres | OK | Approved |
| `argon2` | npm | latest patch 11d; 1.8M/wk | github.com/ranisalt/node-argon2 | SUS (too-new) | Flagged — native binary dependency; verify Windows/Linux CI install |
| `nodemailer` | npm | release 1mo; 17M/wk | github.com/nodemailer/nodemailer | OK | Approved |
| `vitest` | npm | latest patch 26d; 86M/wk | github.com/vitest-dev/vitest | SUS (too-new) | Flagged |
| `jest` | npm | release 3mo; 47M/wk | github.com/jestjs/jest | OK | Approved |
| `jest-expo` | npm | latest patch 3d; 2.3M/wk | github.com/expo/expo | SUS (too-new) | Flagged — use SDK 57 compatible patch |
| `@testing-library/react-native` | npm | release 6wk; 3.4M/wk | github.com/callstack/react-native-testing-library | OK | Approved |
| `@playwright/test` | npm | latest patch 2d; 51M/wk | github.com/microsoft/playwright | SUS (too-new) | Flagged |
| `@axe-core/playwright` | npm | release 6wk; 7.5M/wk | github.com/dequelabs/axe-core-npm | OK | Approved |
| `supertest` | npm | release 7mo; 17M/wk | github.com/ladjs/supertest | OK | Approved |
| `@types/supertest` | npm | latest patch 18d; 14M/wk | github.com/DefinitelyTyped/DefinitelyTyped | SUS (too-new) | Flagged |
| `@types/nodemailer`, `@types/pg` | npm | releases 2–4mo; 9.7–48M/wk | github.com/DefinitelyTyped/DefinitelyTyped | OK | Approved |

**Packages removed due to [SLOP] verdict:** none. A version-qualified probe `fastify@5.10.0` produced a false SLOP because this seam accepts package names, not `name@version`; it is not a recommendation and was excluded from the audit verdicts.

**Packages flagged as suspicious [SUS]:** the latest-patch groups shown above. Planner must insert one `checkpoint:human-verify` before the initial workspace install, confirming the names, official repositories, lockfile resolution and Expo/Nest/Prisma version alignment.

## Architecture Patterns

### System Architecture Diagram

```text
Email link (HTTPS; GET only serves app route)
                |
                v
Expo Router link landing -> remove token from visible URL -> POST complete
 Android/iOS      |                                  | Web
 SecureStore      |                                  | HttpOnly Cookie
 refresh + proof  |                                  | refresh + pending proof
       \           v                                  /
        +---- Generated /api/v1 OpenAPI client ------+
                              |
                              v
                    NestJS Fastify boundary
        DTO validation -> throttle -> auth guard -> use case
                              |
               +--------------+---------------+
               |                              |
               v                              v
      Prisma repositories/tx               MailPort
               |                              |
               v                              v
       PostgreSQL 18                    SMTP / Mailpit
 User -> AuthSession -> RefreshToken      (external)
      -> VerificationToken / ResetToken

Decision branches:
 refresh response 401 invalid/revoked/replayed -> clear local state -> login
 refresh network/5xx                         -> retain credential -> offline wait/retry
 verification token valid + same-device proof -> verify + issue session
 verification token valid without proof       -> verify + guide to login
```

### Recommended Project Structure

```text
apps/
├── client/
│   ├── app/                         # Expo Router layouts/routes only
│   │   ├── (auth)/                  # login/register/forgot/reset/status
│   │   ├── (protected)/             # profile + Phase 2 handoff
│   │   └── auth/                    # verify/reset link landing routes
│   └── src/
│       ├── features/auth/           # state machine, forms, mutations
│       ├── platform/session/        # native and web credential transports
│       ├── api/                     # generated-client wrapper + refresh mutex
│       └── ui/                      # tokens and UI-SPEC primitives
└── api/
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    └── src/
        ├── modules/auth/            # controllers, use cases, DTOs, guards
        ├── modules/users/           # me query/update nickname
        ├── infrastructure/prisma/   # PrismaPg adapter and repositories
        ├── infrastructure/mail/     # MailPort + SMTP/test adapters
        └── common/                  # error envelope, validation, rate limiting
packages/
├── api-client/                      # generated from OpenAPI; no Prisma imports
├── config/                          # shared TS/lint config
└── test-support/                    # environment-neutral builders only
```

### Pattern 1: Server-authoritative Session Family

**What:** Access JWT carries minimal `sub` and `sid` plus `iat`/`exp`; `AuthSession` represents one device login; every opaque RefreshToken generation is a child row of that session. A refresh atomically marks the presented generation consumed and inserts the successor. `[CITED: https://www.rfc-editor.org/rfc/rfc9700.html]`

**When to use:** Every login, verification auto-login, refresh, logout and password reset.

**Recommended schema:**

```prisma
// Source: Prisma/PostgreSQL official schema and migration docs.
model User {
  id              String    @id @default(uuid()) @db.Uuid
  email            String
  emailCanonical   String    @unique @map("email_canonical")
  displayName      String    @map("display_name")
  passwordHash     String    @map("password_hash")
  emailVerifiedAt  DateTime? @map("email_verified_at") @db.Timestamptz(3)
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt        DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  sessions         AuthSession[]
  verificationTokens EmailVerificationToken[]
  passwordResetTokens PasswordResetToken[]
}

model AuthSession {
  id             String    @id @default(uuid()) @db.Uuid
  userId         String    @map("user_id") @db.Uuid
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  absoluteEndsAt DateTime  @map("absolute_ends_at") @db.Timestamptz(3)
  revokedAt      DateTime? @map("revoked_at") @db.Timestamptz(3)
  compromisedAt  DateTime? @map("compromised_at") @db.Timestamptz(3)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  lastSeenAt     DateTime  @default(now()) @map("last_seen_at") @db.Timestamptz(3)
  refreshTokens  RefreshToken[]

  @@index([userId, revokedAt])
}

model RefreshToken {
  id          String        @id @default(uuid()) @db.Uuid
  sessionId   String        @map("session_id") @db.Uuid
  session     AuthSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  tokenHash   String        @unique @map("token_hash") @db.Char(64)
  parentId    String?       @unique @map("parent_id") @db.Uuid
  parent      RefreshToken? @relation("RefreshChain", fields: [parentId], references: [id])
  child       RefreshToken? @relation("RefreshChain")
  expiresAt   DateTime      @map("expires_at") @db.Timestamptz(3)
  consumedAt  DateTime?     @map("consumed_at") @db.Timestamptz(3)
  createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([sessionId, consumedAt])
}

model EmailVerificationToken {
  id               String    @id @default(uuid()) @db.Uuid
  userId           String    @map("user_id") @db.Uuid
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash        String    @unique @map("token_hash") @db.Char(64)
  pendingProofHash String?   @map("pending_proof_hash") @db.Char(64)
  expiresAt        DateTime  @map("expires_at") @db.Timestamptz(3)
  consumedAt       DateTime? @map("consumed_at") @db.Timestamptz(3)
  invalidatedAt    DateTime? @map("invalidated_at") @db.Timestamptz(3)
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([userId, consumedAt, invalidatedAt])
}

model PasswordResetToken {
  id            String    @id @default(uuid()) @db.Uuid
  userId        String    @map("user_id") @db.Uuid
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash     String    @unique @map("token_hash") @db.Char(64)
  expiresAt     DateTime  @map("expires_at") @db.Timestamptz(3)
  consumedAt    DateTime? @map("consumed_at") @db.Timestamptz(3)
  invalidatedAt DateTime? @map("invalidated_at") @db.Timestamptz(3)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([userId, consumedAt, invalidatedAt])
}
```

Prisma-generated SQL must be reviewed and extended with named `CHECK` constraints for nonblank display names and any retention/status invariants that Prisma schema cannot express directly. Prisma documents editing generated migrations for unsupported database features.[CITED: https://www.prisma.io/docs/orm/v6/prisma-migrate/getting-started]

### Pattern 2: Conditional Consume + Replay Revocation

**What:** Hash the incoming opaque token, load its generation and session, then use a serializable transaction plus a conditional `updateMany` (`consumedAt IS NULL`, session active, expiries valid). Exactly one request consumes the token and creates its child. A request presenting a known consumed token marks that session compromised/revoked. RFC 9700 describes revoking the active refresh token when rotation reveals reuse.[CITED: https://www.rfc-editor.org/rfc/rfc9700.html]

**When to use:** Refresh and all one-time verification/reset tokens.

```typescript
// Source: RFC 9700 rotation semantics + Prisma transaction docs.
const outcome = await prisma.$transaction(async (tx) => {
  const claimed = await tx.refreshToken.updateMany({
    where: { id: token.id, consumedAt: null },
    data: { consumedAt: now },
  });

  if (claimed.count !== 1) {
    await tx.authSession.update({
      where: { id: token.sessionId },
      data: { revokedAt: now, compromisedAt: now },
    });
    return { kind: 'replayed' } as const; // return so revocation commits
  }

  await tx.refreshToken.create({ data: nextGeneration });
  await tx.authSession.update({
    where: { id: token.sessionId },
    data: { lastSeenAt: now },
  });
  return { kind: 'rotated' } as const;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

if (outcome.kind === 'replayed') throw new SessionReplayedError();
```

Retry serialization conflicts a small bounded number of times; never retry a domain replay result. `[ASSUMED]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived bearer access token | Short access token + rotated, replay-detectable refresh family | RFC 9700 published January 2025 | Limits access-token exposure and gives public clients a defined replay response.[CITED: https://www.rfc-editor.org/rfc/rfc9700.html] |
| Prisma datasource URL in schema + Rust engine default | `prisma.config.ts` + TypeScript client + required driver adapter | Prisma 7 | Planner must include config and `PrismaPg`; old v6 bootstrap examples are incomplete.[CITED: https://docs.prisma.io/docs/orm/v6/more/internals/engines] |
| Expo Router redirect-only auth examples | Protected Routes | Expo Router SDK 53+ guide | Route groups express authenticated availability, but API authorization remains server-side.[CITED: https://docs.expo.dev/router/advanced/authentication/] |
| `react-test-renderer` for Expo | React Native Testing Library | React 19 era | Expo marks `react-test-renderer` deprecated/incompatible and recommends RNTL.[CITED: https://docs.expo.dev/develop/unit-testing/] |
| Vitest workspace config | Vitest `projects` | Deprecated since Vitest 3.2 | Root test config should use `projects`, not `workspace`.[CITED: https://vitest.dev/guide/projects.html] |
| `citext` as default case-insensitive answer | Explicit canonicalization or nondeterministic collation policy | Current PostgreSQL guidance | Email identity comparison must be a documented product rule, not an accidental locale behavior.[CITED: https://www.postgresql.org/docs/17/citext.html] |

**Deprecated/outdated:**

- Persisting Web tokens in localStorage for this project: conflicts with SAFE-03 even though generic Expo examples show it.
- `react-test-renderer`: Expo documentation says RNTL replaces it for React 19+.[CITED: https://docs.expo.dev/develop/unit-testing/]
- Prisma 6 bootstrap snippets without `prisma.config.ts`/driver adapter: incomplete for Prisma 7.[CITED: https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql]
- Nest/Fastify middleware wildcard `(.*)`: Nest 11 documents named wildcard syntax for Fastify 5.[CITED: https://docs.nestjs.com/migration-guide]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Password is 12–128 chars; Access 15m; Refresh inactivity 30d/absolute 90d; verify 24h; reset 30m. | Security Defaults | UX/security balance changes config and expiry tests, not architecture. |
| A2 | Login 10/IP/min + 5/account/15m; register/reset/resend 5/IP/hour + 3/account/hour. | Security Defaults | Too strict harms families behind shared IP; too loose permits abuse. Make env-configured and observe. |
| A3 | Email canonicalization trims, normalizes and lowercases full address while preserving original. | Security Defaults | Some provider/local-part edge cases could merge identities; must be explicitly accepted as v1 policy. |
| A4 | Web deploys same-site HTTPS origins, allowing `SameSite=Lax`; cookie path is `/api/v1/auth`. | Security Defaults | Cross-site client/API deployment would need `SameSite=None; Secure` plus stronger CSRF design. |
| A5 | One shared refresh route selects output by credential source. | Platform-Split Transport | Ambiguous requests containing both sources need deterministic rejection/priority. Tests must lock behavior. |
| A6 | Same-device auto-login uses a separate pending-registration proof stored SecureStore/HttpOnly cookie. | Safe Email Link | Adds schema/API work; without it D-06 cannot safely distinguish devices. |
| A7 | Mailpit + SMTP adapter is acceptable for local walking skeleton; production provider remains config. | Email Port | Deployment may require a vendor SDK/event model earlier. |
| A8 | Serializable transaction conflicts get bounded retries; replay domain outcomes never retry. | Conditional Consume | Retry count/backoff needs performance testing under actual PostgreSQL load. |
| A9 | Web Locks is the primary cross-tab refresh mutex; local HTTP/unsupported Web gets only in-tab fallback. | Refresh Concurrency | Auxiliary browsers without locks can self-revoke under concurrent refresh. |
| A10 | Registration/reset request responses are enumeration-safe and generic. | API Contract | Product may prefer explicit duplicate-email UX; changing it requires conscious privacy tradeoff. |
| A11 | Consumed auth-token rows are retained for 90 days after their security usefulness ends, then purged by a later maintenance job. | Data retention | Retention is neither legally nor operationally approved; planner should make cleanup configurable and avoid claiming compliance. |
| A12 | A single checkpoint may approve all official-package latest patches flagged only for age. | Package Audit | Workflow may require one checkpoint per package; orchestrator can split if policy demands. |
| A13 | Exact versions for every seam-SUS latest patch are suitable after the human checkpoint. | Standard Stack | A compatibility regression could require pinning an earlier patch within the same locked major/SDK line. |
| A14 | Corepack activation, proposed scripts and the under-30-second quick-test target fit this Windows workspace. | Installation / Validation | Tool setup or test startup may require different commands/targets after the skeleton exists. |
| A15 | Proposed endpoint names, error codes, error envelope and bootstrap state taxonomy are the stable v1 contract. | API / Client Patterns | Renaming after generated client adoption causes contract churn; planner should lock them in Wave 0. |
| A16 | POST-only link consumption, pending-device proof, single-flight/Web Locks, in-memory Access Token and credential-source response selection are acceptable v1 mechanics. | Architecture Patterns | Different deployment/browser constraints could require another continuation/refresh protocol. |
| A17 | Production uses `__Secure-mk_refresh` with the narrow auth path; local HTTP uses an explicitly development-only unprefixed name. | Cookie Example | ASVS v5.0.0 L1 requires Secure and a `__Secure-` prefix when `__Host-` is not used; `__Host-` still conflicts with the narrow path. |

## Open Questions (RESOLVED)

1. **Production origins — deployment-deferred release gate.** Wave 0 defines and validates `WEB_ORIGIN`, `API_ORIGIN`, `EMAIL_LINK_ORIGIN`, the Expo scheme, and association-file configuration without claiming real production domains. The Phase 6 release owner must select the public origins and verify HTTPS, CORS, Android App Links, and iOS associated domains before release. This is not a Phase 1 implementation blocker.

2. **Production transactional email — deployment-deferred release gate.** Phase 1 implements `MailPort`, an SMTP environment contract, Mailpit local delivery, and a capture adapter for tests. The Phase 6 release owner must select the SMTP provider and sender domain, provision credentials, and verify SPF/DKIM/DMARC and transport reachability. Provider selection does not enter authentication-domain code and is not a Phase 1 implementation blocker.

3. **Email identity canonicalization — locked for Phase 1.** Trim surrounding whitespace, apply Unicode normalization, then lowercase the complete address for the durable unique `emailCanonical` key. Preserve the original submitted address separately for delivery and display. Tests must cover case, surrounding whitespace, Unicode-equivalent forms, race safety, and preservation of the delivery value. Any later change requires an explicit data migration and collision analysis.

4. **Common/breached password policy — locked for Phase 1.** Registration and password-reset completion reject passwords found in a committed, licensed deterministic fixture containing at least the top 3000 policy-matching common passwords. The fixture records source, license, checksum, and update date and is exercised locally with no network dependency. A production-scale breached-password dataset/provider is owned by the Phase 6 release gate; online HIBP lookup is not introduced in Phase 1. This satisfies the applicable ASVS v5.0.0 L1 common-password control; breached-password screening is an L2 control and remains release-policy work.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | entire workspace | ✓ | 24.18.0 | — |
| npm | initial tooling | ✓ | 11.8.0 | — |
| Corepack | provision pnpm | ✓ | 0.35.0 | install verified pnpm explicitly if Corepack fails |
| pnpm | locked workspace manager | ✗ | — | Corepack activation; planner Wave 0 |
| Docker CLI | PostgreSQL 18/Mailpit compose | ✓ | 29.1.3 | — |
| Docker engine | compose integration env | ✗ (daemon unavailable) | — | Start Docker Desktop; local PG17 is not target-version equivalent |
| PostgreSQL CLI/server | diagnostics | ✓ | psql 17.7; localhost accepts connections | target integration uses PostgreSQL 18 container |
| Mailpit CLI | local email inbox | ✗ | — | Mailpit Docker service once daemon runs |
| ADB | Android device checks | ✓ | 1.0.41 | Expo Go/development build |
| Java | Android toolchain | ✓ | 17.0.12 LTS | — |
| EAS CLI | cloud iOS/Android builds | ✗ | — | invoke pinned project dev dependency later; no global install required |
| macOS/Xcode/iOS Simulator | full local iOS validation | ✗ (Windows host) | — | EAS cloud build + real iPhone; final Xcode debugging needs macOS |

**Missing dependencies with no fallback:** Docker engine must be started for target PostgreSQL 18 + Mailpit integration tests; production domains and SMTP credentials block deployment, not local implementation.

**Missing dependencies with fallback:** pnpm can be provisioned through installed Corepack; EAS need not be global; iOS simulator coverage is replaced partially by EAS/real-device validation but macOS remains necessary for hard native debugging.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| API/shared framework | Vitest 4.1.10 + `@nestjs/testing` 11.1.28 + Supertest 7.2.2 |
| Expo component framework | Jest 30.4.2 + `jest-expo` 57.0.3 + RNTL 14.0.1 |
| Web E2E/a11y | Playwright 1.62.1 + `@axe-core/playwright` 4.12.1 |
| Database/email integration | Docker Compose PostgreSQL 18 + Mailpit; migrations applied to dedicated test DB |
| Config files | none — all are Wave 0 (`vitest.config.ts`, client Jest config, `playwright.config.ts`, compose file) |
| Quick run command | `pnpm test:quick` |
| Full suite command | `pnpm test && pnpm test:integration && pnpm test:e2e:web` |

Nest officially supports isolated/unit/e2e tests and is runner agnostic, so using Vitest rather than default Jest on the API preserves Nest test modules while following the locked project stack.[CITED: https://docs.nestjs.com/fundamentals/testing] Expo's native tests should use its documented Jest preset rather than forcing one runner across incompatible transform stacks.[CITED: https://docs.expo.dev/develop/unit-testing/]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | register email/password/nickname; duplicate/canonical race safe; hash persisted | API integration + client component | `pnpm --filter api test --run test/auth/register.int.test.ts` | ❌ Wave 0 |
| AUTH-02 | verify success/expired/used/invalid; same/cross-device branch; resend cooldown | API integration + Web E2E + client | `pnpm --filter api test --run test/auth/verify-email.int.test.ts` | ❌ Wave 0 |
| AUTH-03 | verified login; unverified deny; restart restore; offline distinction | API integration + client state + Web E2E | `pnpm --filter client test --runInBand session-bootstrap` | ❌ Wave 0 |
| AUTH-04 | generic request; token expiry/single use; reset then normal login | API integration + Web E2E | `pnpm --filter api test --run test/auth/password-reset.int.test.ts` | ❌ Wave 0 |
| AUTH-05 | logout revokes only `sid`; second device remains active | API integration | `pnpm --filter api test --run test/auth/logout.int.test.ts` | ❌ Wave 0 |
| AUTH-06 | duplicate nickname allowed; current user can update own nickname | API integration + client component | `pnpm --filter api test --run test/users/me.int.test.ts` | ❌ Wave 0 |
| SAFE-03 | native uses SecureStore; Web cookie is HttpOnly and response never exposes refresh | adapter unit + Playwright cookie assertions | `pnpm --filter client test --runInBand session-transport` | ❌ Wave 0 |
| SAFE-04 | every refresh rotates; old token replay revokes family; DB contains hashes only; concurrency serialized | DB integration + property/concurrency cases | `pnpm --filter api test --run test/auth/refresh-rotation.int.test.ts` | ❌ Wave 0 |

### Required Scenario Matrix

| Area | Must-cover cases |
|------|------------------|
| Refresh | success; expired; revoked; replay; unknown hash; two devices independent; two simultaneous requests; absolute expiry; password-reset global revoke |
| Link tokens | valid; expired; used; unknown; old token after resend; mail landing GET does not consume; token absent from resulting URL/logs |
| Session bootstrap | no credential; valid; 401; timeout; DNS/offline; 5xx; Web cookie; native SecureStore; intended internal route restore |
| Enumeration | existing/nonexisting reset/register same status/body shape; login generic invalid credentials; rate limit response |
| Cookie | HttpOnly/Secure/SameSite/Path/Max-Age; exact-origin credentialed CORS; clear uses matching attributes; JSON contains no Web refresh token |
| UI contract | input/button states; 320/390/768/1440 widths; 200% text; keyboard focus; live announcements; reduced motion; contrast tokens |

### Sampling Rate

- **Per task commit:** `pnpm test:quick` (API unit + relevant client component; target under 30s once warm). `[ASSUMED]`
- **Per wave merge:** `pnpm test && pnpm test:integration`.
- **Phase gate:** Full suite plus Playwright Web green; Android real/emulator smoke; iOS EAS build and real-device deep-link/SecureStore smoke before claiming cross-platform completion.

### Wave 0 Gaps

- [ ] root `package.json`, `pnpm-workspace.yaml`, shared strict TypeScript configs and pinned `packageManager`
- [ ] `compose.yaml` with PostgreSQL 18 and Mailpit health checks; `.env.test` contract without committed secrets
- [ ] `apps/api/vitest.config.ts`, `apps/api/test/setup-integration.ts`, database reset/migrate helper
- [ ] `apps/client/jest.config.js` or package preset plus SecureStore/network mocks
- [ ] `playwright.config.ts` and Web server orchestration
- [ ] `apps/api/test/auth/*.int.test.ts` files listed above
- [ ] `apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx`
- [ ] `apps/client/src/platform/session/__tests__/session-transport-test.ts`
- [ ] `e2e/auth/*.spec.ts` for registration/mail/verify/login/reset/cookie/a11y
- [ ] contract generation drift check: generate OpenAPI client and fail if Git diff changes
- [ ] human package checkpoint for all seam-SUS latest patches before install

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not set `security_enforcement: false`.

### Applicable ASVS Categories

ASVS 5.0.0 is the current stable release listed by OWASP.[CITED: https://owasp.org/www-project-application-security-verification-standard/] The template's legacy V2/V3 names are mapped here to current relevant authentication/session controls; pin exact requirement identifiers as `v5.0.0-*` in later security test cases because OWASP warns identifiers change between versions.[CITED: https://owasp.org/www-project-application-security-verification-standard/]

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication / ASVS 5 Ch.6 | yes | Argon2id, sane length, generic errors, verification/reset single-use tokens, rate limits |
| V3 Session Management | yes | short Access JWT, per-device session, rotation, expiry, revoke, replay family response, secure transport |
| V4 Access Control | yes (limited) | JWT guard; `/users/me` derives subject from `sub`, never request-body user id |
| V5 Input Validation | yes | global DTO validation/whitelist plus database constraints; reject unexpected fields |
| V6 Cryptography | yes | established Argon2id/JWT/Node CSPRNG; no custom cryptography |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential stuffing/brute force | Spoofing | generic response, Argon2id, per-IP/account throttles, audit correlation |
| Refresh token theft/replay | Spoofing | native SecureStore/Web HttpOnly Cookie, rotation, hash-at-rest, family revoke |
| Refresh race false positive | Denial of Service | client single-flight/Web Lock, atomic transaction, concurrency tests |
| CSRF on cookie refresh/logout | Spoofing / DoS | SameSite, POST, Origin allowlist, exact credentialed CORS |
| Email/reset token leakage | Information Disclosure | HTTPS, immediate URL sanitization, log redaction, single use/short expiry |
| Account enumeration | Information Disclosure | consistent status/body/timing intent; generic reset/register/login failures |
| DB dump | Information Disclosure | Argon2id password hash; SHA-256 only for high-entropy tokens; no plaintext refresh/reset/verify |
| Session fixation | Elevation of Privilege | create new Session at login; rotate refresh each use; clear pending proof |
| Mass assignment | Elevation of Privilege | whitelisted DTOs; `/users/me` permits only nickname in this phase |
| SQL injection | Tampering | Prisma parameterized queries; isolate/review any raw SQL migrations |
| Proxy IP spoofing defeats throttles | Spoofing | configure Fastify `trustProxy` only for known proxy hops; Nest docs call out proxy configuration.[CITED: https://docs.nestjs.com/security/rate-limiting] |
| Sensitive logs | Information Disclosure | structured redaction for authorization, cookie, password and all token query/body fields |

### Security Invariants the Planner Must Turn Into Assertions

1. No database column stores plaintext password, refresh, verification, reset or pending-proof secrets.
2. A RefreshToken generation transitions from active to consumed at most once.
3. Known consumed refresh presentation revokes its containing Session family.
4. Ordinary logout revokes exactly JWT `sid`; password reset revokes every Session for `sub`.
5. Unverified users never receive an authenticated Session except the atomic verification same-device success path.
6. Web auth responses never expose refresh material to JavaScript; native refresh material never enters AsyncStorage.
7. Transport failures never delete a credential; explicit auth rejection does.
8. Token values never appear in logs, analytics, UI copy or post-navigation URL.
9. Nickname has no unique constraint; canonical email does.
10. All authentication mutations use server-side throttles independent of UI disabled state.

## Sources

### Primary (HIGH confidence domain authority; MEDIUM retrieval confidence)

- https://www.rfc-editor.org/rfc/rfc9700.html — refresh token rotation, replay detection and revocation behavior.
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html — Argon2id selection and minimum parameters.
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html — password policy, generic responses, enumeration and automated attacks.
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html — random, expiring, single-use reset links and post-reset login/session handling.
- https://owasp.org/www-project-application-security-verification-standard/ — current ASVS stable version and identifier guidance.
- https://cornucopia.owasp.org/taxonomy/asvs-5.0/06-authentication/02-password-security — ASVS 5 password controls.
- https://docs.expo.dev/develop/authentication/ — platform session storage direction.
- https://docs.expo.dev/router/advanced/authentication/ — protected route/session-provider patterns and the Web localStorage example that this project's stricter constraint overrides.
- https://docs.expo.dev/versions/v55.0.0/sdk/securestore/ — SecureStore API and native behavior; the page was the current indexed SDK reference returned by search, while installation must use SDK 57's resolver.
- https://docs.expo.dev/develop/unit-testing/ — Jest Expo and React Native Testing Library setup; React 19 testing note.
- https://docs.nestjs.com/techniques/cookies — Nest + Fastify cookie integration.
- https://docs.nestjs.com/security/rate-limiting — official throttler, per-route definitions and proxy caveat.
- https://docs.nestjs.com/fundamentals/testing — Nest testing module and runner-agnostic support.
- https://docs.nestjs.com/migration-guide — Nest 11/Fastify 5 compatibility and migration constraints.
- https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql — Prisma 7 PostgreSQL config and `@prisma/adapter-pg` construction.
- https://docs.prisma.io/docs/orm/v6/more/internals/engines — Prisma 7 TypeScript engine and required driver adapter.
- https://www.prisma.io/docs/orm/v6/prisma-migrate/getting-started — migration creation, custom SQL and commit guidance.
- https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/migration-histories — migration history as source of truth.
- https://www.postgresql.org/docs/18/ddl-constraints.html — unique/check/foreign-key constraint behavior.
- https://www.postgresql.org/docs/current/datatype-datetime.html — `timestamptz` semantics.
- https://www.postgresql.org/docs/17/citext.html — case-insensitive comparison alternatives and Unicode caveat.
- https://nodejs.org/docs/latest-v24.x/api/crypto.html — random generation, hashing and timing-safe comparison.
- https://nodemailer.com/smtp — SMTP transport construction and `verify()`.
- https://vitest.dev/guide/projects.html — monorepo test projects and workspace deprecation.
- https://playwright.dev/docs/next/accessibility-testing — axe integration and manual-testing limitation.

### Secondary (MEDIUM confidence)

- https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API — same-origin, cross-tab exclusive lock behavior and secure-context requirement.
- https://registry.npmjs.org/ — exact current package metadata; legitimacy seam results are recorded in the audit and do not override official documentation.

### Tertiary (LOW confidence)

- Exact token lifetimes, rate thresholds, email canonicalization, cookie topology, token-row retention and fallback behavior are recommendations tagged `[ASSUMED]`, not external standards.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH for framework lines / MEDIUM for exact patches** — locked by project, official docs confirm current architecture; many latest patches are seam-SUS solely because of release age and need a checkpoint.
- Architecture: **HIGH** — derived from locked requirements, RFC 9700, OWASP and official Prisma/Expo/Nest guidance.
- Security invariants: **HIGH** — directly traceable to SAFE-03/04, user decisions and primary security standards.
- Exact policy defaults: **MEDIUM** — deliberately chosen under agent discretion and listed in Assumptions Log.
- Testing architecture: **HIGH for framework choice / MEDIUM for timing targets** — official framework guidance, but no project tests exist yet.
- Environment: **HIGH** — probed locally on 2026-08-01.

**Research date:** 2026-08-01
**Valid until:** 2026-08-08 for exact package versions; 2026-08-31 for architecture/security guidance.

**What might have been missed:** production domain/cookie topology, sender-domain deliverability setup, legal password/token retention requirements, real iOS universal-link association, and behavior of Web refresh coordination in the project's eventual minimum-browser matrix remain explicit open/deployment questions rather than hidden assumptions.

## Architecture Patterns (continued)

The remaining client/link patterns below complete the architecture section above; they are placed after the environment/security planning annex so the planner can read those gates before locking client mechanics.

### Pattern 3: Platform-Split Refresh Transport

**What:** One application-facing `SessionTransport` exposes `restore`, `refresh`, `acceptLogin`, and `clear`, but native and Web implementations transport refresh material differently. Native uses SecureStore; Web sends `credentials: 'include'` and never receives refresh token in JSON. `[CITED: https://docs.expo.dev/guides/authentication/]`

```typescript
interface SessionTransport {
  restore(): Promise<RestoreResult>;
  refresh(): Promise<AccessSession>;
  acceptLogin(response: LoginResponse): Promise<AccessSession>;
  clear(): Promise<void>;
}

// Native: refresh token is request-body credential loaded from SecureStore.
// Web: no refresh getter exists; browser carries the HttpOnly cookie.
```

On a shared `/auth/refresh` endpoint, choose response mode from credential source, not a caller-controlled platform header: cookie input rotates to `Set-Cookie` and omits refresh from JSON; body input returns the rotated refresh token for native. This prevents browser JavaScript from requesting a readable refresh token merely by spoofing `X-Client-Platform`. `[ASSUMED]`

### Pattern 4: Explicit Bootstrap State Machine

**What:** Model `booting -> authenticated | unauthenticated | offlineWaiting | reauthRequired`; do not reduce it to `isLoading/isLoggedIn`. Expo protected routes redirect based on runtime authentication state.[CITED: https://docs.expo.dev/router/advanced/authentication/]

```typescript
type BootstrapState =
  | { kind: 'booting' }
  | { kind: 'authenticated'; accessToken: string; user: Me }
  | { kind: 'unauthenticated' }
  | { kind: 'offlineWaiting'; retainedCredential: true }
  | { kind: 'reauthRequired'; reason: 'expired' | 'revoked' | 'replayed' };
```

Only a protocol-level 401/explicit auth error moves to `reauthRequired`; timeout, DNS, offline and 5xx move to `offlineWaiting` while keeping native SecureStore/Web cookie untouched. `[ASSUMED]`

### Pattern 5: Safe Email-Link Landing + Same-Device Proof

**What:** Email links point to an HTTPS Expo route, not a mutating API GET. The route extracts the token, immediately replaces the visible/history URL with a token-free route, then POSTs completion. A separate high-entropy pending-registration proof distinguishes the registering device: native stores it in SecureStore; Web receives an HttpOnly pending cookie. The API may create a session only when this proof matches; otherwise it returns verified-success with login guidance. Credential-bearing URLs can leak through history, and RFC 9700 documents that class of leakage.[CITED: https://www.rfc-editor.org/rfc/rfc9700.html]

Consume the verification token and set `emailVerifiedAt` in one transaction; when the pending proof matches, create `AuthSession` plus its first `RefreshToken` in that same transaction so “verified but auto-login half-created” is impossible. `[ASSUMED]`

**When to use:** Email verification. Password reset never auto-logs in and therefore needs no pending proof.

**Required result codes:** `VERIFICATION_SUCCEEDED_AUTO_LOGIN`, `VERIFICATION_SUCCEEDED_LOGIN_REQUIRED`, `VERIFICATION_EXPIRED`, `VERIFICATION_ALREADY_USED`, `VERIFICATION_INVALID`. `[ASSUMED]`

### Pattern 6: Email Port, Post-Commit Delivery

**What:** `AuthService` writes user/token state first, commits, then invokes `MailPort`; SMTP details live in `infrastructure/mail`. Nodemailer SMTP transport supports connection verification.[CITED: https://nodemailer.com/smtp]

```typescript
export interface MailPort {
  sendEmailVerification(message: VerificationMail): Promise<void>;
  sendPasswordReset(message: PasswordResetMail): Promise<void>;
  sendPasswordChangedNotice(message: PasswordChangedMail): Promise<void>;
}
```

Phase 1 uses Mailpit locally and a fake capture adapter in tests. Production supplies the same SMTP-shaped config or a later vendor adapter; provider selection is not a domain decision. `[ASSUMED]`

### API Contract and Error Taxonomy

Use these `/api/v1` endpoints so each requirement has a named use case rather than generic CRUD. `[ASSUMED]`

| Method / Route | Auth / Credential | Success | Security behavior |
|----------------|-------------------|---------|-------------------|
| `POST /auth/register` | public | `202 REGISTRATION_ACCEPTED` | Generic response shape; create/send only as policy permits. |
| `POST /auth/email-verifications/resend` | pending proof or email | `202 RESEND_ACCEPTED` | Generic account response; return `retryAfterSeconds`. |
| `POST /auth/email-verifications/complete` | link token + optional pending proof | result code above | Token may distinguish expired/used/invalid because caller possesses link. |
| `POST /auth/login` | email/password | access + platform refresh transport | Generic `INVALID_CREDENTIALS`; correct password on unverified user may return `EMAIL_NOT_VERIFIED`. |
| `POST /auth/refresh` | cookie (Web) or body (native) | new access + rotated refresh transport | Replay revokes current device Session. |
| `POST /auth/logout` | access JWT `sid` | `204` | Revoke only current Session; clear Web cookie/native store. |
| `POST /auth/password-resets/request` | public email | `202 RESET_ACCEPTED` | Same response/timing intent for present/absent account. |
| `POST /auth/password-resets/complete` | reset token + new password | `204` | One transaction: consume, change hash, revoke all Sessions. |
| `GET /users/me` | access JWT | public profile DTO | Never return email canonicalization internals or auth records. |
| `PATCH /users/me` | access JWT | updated profile DTO | `displayName` is non-unique. |

Use a stable error envelope: `{ code, message, fieldErrors?, retryAfterSeconds?, correlationId }`; clients branch on `code`, never localized `message`. `[ASSUMED]` Keep enumeration-sensitive responses consistent in status, body shape and processing path; OWASP warns that body, HTTP status and timing discrepancies can disclose account existence.[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html]

### Recommended Security Defaults

These are Phase 1 policy choices under the agent's discretion, not universal standards:

| Control | Recommendation | Provenance |
|---------|----------------|------------|
| Password length and common-password policy | 12–128 Unicode characters; no forced upper/lower/digit/symbol classes; reject a committed licensed fixture of at least the top 3000 policy-matching common passwords during registration and reset | ASVS v5.0.0 L1 controls 6.2.1, 6.2.4, 6.2.5 and 6.2.8; exact 12/128 bounds are a project policy. [CITED: https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv] |
| Password hash | Argon2id, memory 19 MiB, iterations 2, parallelism 1 as floor; benchmark target host and only raise cost | OWASP minimum.[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] |
| Access JWT | 15 minutes; asymmetric signing preferred when deploy topology warrants, otherwise rotated high-entropy symmetric secret | Exact lifetime/key choice `[ASSUMED]`; short-lived is project locked. |
| Refresh | 30-day inactivity expiry, 90-day absolute Session cap; opaque 32 random bytes | Exact durations `[ASSUMED]`; rotation/replay behavior is RFC-backed.[CITED: https://www.rfc-editor.org/rfc/rfc9700.html] |
| Verify email | 24 hours; each resend invalidates previous active verification tokens | `[ASSUMED]` |
| Reset password | 30 minutes; single use; new request invalidates previous active reset tokens | Exact duration `[ASSUMED]`; single-use/expiry is OWASP-backed.[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html] |
| Opaque token generation | `randomBytes(32)`, base64url; persist lowercase SHA-256 hex | Node crypto provides CSPRNG/hashing APIs.[CITED: https://nodejs.org/docs/latest-v24.x/api/crypto.html] Exact 32-byte format `[ASSUMED]`. |
| Login throttle | per IP 10/min plus per canonical email 5/15min; return generic 429/retry time | Thresholds `[ASSUMED]`; rate limiting is OWASP/Nest recommended.[CITED: https://docs.nestjs.com/security/rate-limiting] |
| Register/reset/resend | per IP 5/hour; per email 3/hour; local UI resend cooldown 60s does not replace server limit | Thresholds `[ASSUMED]`; server-side automated-abuse controls are OWASP-backed.[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html] |
| Web refresh cookie | Production `__Secure-mk_refresh`; local-HTTP development name is explicitly separate. `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/api/v1/auth`, no broad Domain, bounded `Max-Age` | ASVS v5.0.0 L1 control 3.3.1 requires Secure and a `__Secure-` prefix when `__Host-` is not used.[CITED: https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv] Fastify cookie mechanism is official.[CITED: https://docs.nestjs.com/techniques/cookies] |
| Cookie endpoint CSRF | POST only, exact Origin allowlist, credentialed CORS to exact Web origin; never `*`; Access Authorization header for business APIs | `[ASSUMED]` defense-in-depth recommendation. |
| Email canonicalization | trim, Unicode normalization, lowercase full address; preserve original email for display/delivery; unique canonical column | `[ASSUMED]` project identity policy; document it as an API invariant. |

### Refresh Concurrency Rule

Strict rotation can mistake normal simultaneous refreshes for theft if clients fire multiple requests with one generation. Native uses one process-wide single-flight promise. Web wraps refresh in one same-origin `navigator.locks.request('muchakucha-session-refresh', ...)` exclusive lock; the browser sends the newest HttpOnly cookie after queued tabs acquire the lock. Web Locks coordinates work across same-origin tabs and is available only in secure contexts.[CITED: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API] Under local HTTP or unsupported environments, use an in-tab mutex and treat multi-tab race behavior as a documented limitation to test before release. `[ASSUMED]`

### Anti-Patterns to Avoid

- **Refresh JWT without durable family rows:** signature validation cannot by itself detect rotation replay or targeted device revocation; persist server state.
- **One token-storage implementation:** Expo's sample Web localStorage branch conflicts with SAFE-03; do not copy it.[CITED: https://docs.expo.dev/router/advanced/authentication/]
- **GET consumes email token:** mail scanners and previews can prefetch GET; landing GET must render/route only, POST performs mutation. `[ASSUMED]`
- **Send mail inside DB transaction:** network latency/failure holds locks and couples rollback to SMTP; commit token state before calling the adapter.
- **Delete consumed RefreshToken immediately:** replay detection loses family identity; retain generations for a bounded security window. `[ASSUMED]`
- **Refresh on every 401 without mutex:** parallel callers can self-trigger replay revocation.
- **Trust a platform header to decide secret exposure:** response mode follows actual credential source, not caller claim.
- **Clear credentials on network error:** violates D-12; distinguish transport failure from server auth rejection.
- **Access token in persistent storage:** keep it in memory and reacquire through refresh; only long-lived native material belongs in SecureStore. `[ASSUMED]`
- **Email/profile as JWT authority:** `sub` is identity; current email/nickname comes from `/users/me`, avoiding stale profile claims. `[ASSUMED]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | SHA-256/salt scheme or custom KDF | `argon2` Argon2id with OWASP floor | Password hashing requires memory-hard, salted, versioned encodings.[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] |
| Random token source | timestamps, UUID concatenation, `Math.random` | Node `crypto.randomBytes` | Verification/reset/refresh tokens need cryptographic unpredictability.[CITED: https://nodejs.org/docs/latest-v24.x/api/crypto.html] |
| Native secret store | AsyncStorage/file/preferences wrapper | `expo-secure-store` | Expo identifies SecureStore for small encrypted secrets and AsyncStorage as non-secure.[CITED: https://docs.expo.dev/guides/authentication/] |
| Cookie parsing/signing | raw `Cookie` header parsing | `@fastify/cookie` | It is Nest's documented Fastify integration.[CITED: https://docs.nestjs.com/techniques/cookies] |
| API rate limiter | ad hoc counters in controller | `@nestjs/throttler` | Official Nest guard supports route-specific policy and proxy-aware tracking.[CITED: https://docs.nestjs.com/security/rate-limiting] |
| API types | duplicated hand-written client DTOs | Nest OpenAPI + generated `packages/api-client` | Prevents contract drift; project architecture locks this boundary. |
| SQL migration history | startup `db push` or runtime DDL | Prisma Migrate + reviewed SQL | Prisma treats migration folder as source-of-truth history.[CITED: https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/migration-histories] |
| SMTP protocol | socket-level SMTP client | Nodemailer transport behind `MailPort` | SMTP connection/TLS/auth/error handling is established adapter work.[CITED: https://nodemailer.com/smtp] |
| Form state | bespoke touched/error/loading maps | React Hook Form + Zod | Locked supporting stack; keeps UI behavior testable and consistent. |
| Accessibility audit | color-only/manual spot check | RNTL semantics + Playwright/axe + manual keyboard/screen reader | Automated tools find only a subset; Playwright explicitly recommends combined manual testing.[CITED: https://playwright.dev/docs/next/accessibility-testing] |

**Key insight:** custom auth plumbing fails at lifecycle edges—concurrency, replay, cookie scope, one-time token state, error privacy and platform differences—not at the happy-path password comparison.

## Common Pitfalls

### Pitfall 1: Rotation Race Becomes False Replay
**What goes wrong:** two API calls refresh concurrently; one succeeds, the other presents the now-consumed token and revokes the session.
**Why it happens:** no client-wide/cross-tab serialization.
**How to avoid:** native single-flight; Web same-origin Web Lock; one automatic retry only after acquiring the lock and using current cookie.
**Warning signs:** intermittent forced logout during app bootstrap or multiple tabs.

### Pitfall 2: Cookie Rotation Is Exposed in JSON
**What goes wrong:** a browser spoofs a native header and reads a refresh token.
**Why it happens:** response shape selected from untrusted platform metadata.
**How to avoid:** select response shape from where the accepted credential came from—HttpOnly cookie vs explicit body.
**Warning signs:** Web network response contains `refreshToken`.

### Pitfall 3: Network Failure Clears Valid Session
**What goes wrong:** airplane mode at launch sends user to login and discards long-lived credential.
**Why it happens:** all refresh failures are mapped to unauthenticated.
**How to avoid:** typed transport/domain errors and explicit bootstrap states.
**Warning signs:** client storage `clear()` in a generic `catch`.

### Pitfall 4: Token Link Leaks
**What goes wrong:** verification/reset token remains in history, logs, analytics or Referer.
**Why it happens:** screen renders and calls analytics before sanitizing the URL.
**How to avoid:** dedicated landing route, extract once, `replace` URL immediately, redact query strings at proxy/app logger, never interpolate token in errors.
**Warning signs:** screenshots/logs show `?token=`.

### Pitfall 5: Mail Scanner Consumes Single-Use Link
**What goes wrong:** the user's link is already used before clicking.
**Why it happens:** GET endpoint performs verification/reset.
**How to avoid:** GET only loads route; client POST consumes. Reset additionally requires entering a new password.
**Warning signs:** token `consumedAt` timestamps precede user action by seconds/minutes.

### Pitfall 6: Enumeration Through Status or Timing
**What goes wrong:** login/reset/register reveals whether an email exists.
**Why it happens:** early return, different status codes, SMTP awaited only for real accounts.
**How to avoid:** generic response envelopes and equivalent processing path; enqueue/send after generic response where possible. OWASP calls out status and timing discrepancy factors.[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html]
**Warning signs:** absent-email reset is consistently faster or returns a different code.

### Pitfall 7: Password Reset Revocation Is Non-Atomic
**What goes wrong:** password changes but old devices retain usable sessions after partial failure.
**Why it happens:** password update and session revocation are separate calls.
**How to avoid:** consume reset token, update hash and revoke all Sessions in one transaction.
**Warning signs:** more than one service call/transaction owns reset completion.

### Pitfall 8: Prisma 7 Is Configured Like Prisma 6
**What goes wrong:** generated client cannot connect or config is duplicated.
**Why it happens:** URL left in `schema.prisma` and no driver adapter passed.
**How to avoid:** `prisma.config.ts`, `prisma-client` output, `PrismaPg`, matched 7.9.1 packages.[CITED: https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql]
**Warning signs:** `new PrismaClient()` without adapter or `url = env(...)` in v7 datasource.

### Pitfall 9: UI Countdown Is Treated as Security Limit
**What goes wrong:** attacker bypasses the 60-second disabled button by calling API directly.
**Why it happens:** server lacks independent per-email/IP throttling.
**How to avoid:** UI countdown mirrors `retryAfterSeconds`; server remains authoritative.
**Warning signs:** resend endpoint has no throttler or persistent eligibility check.

### Pitfall 10: Development Email Works but Production Boundary Does Not
**What goes wrong:** auth domain imports Mailpit/provider details or silently logs production links.
**Why it happens:** no explicit port and environment validation.
**How to avoid:** `MailPort`, SMTP adapter, capture test adapter, fail-fast production config.
**Warning signs:** `console.log(resetToken)` or provider SDK imports inside `AuthService`.

## Code Examples

### Prisma 7 Client Construction

```typescript
// Source: https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
export const prisma = new PrismaClient({ adapter });
```

### Fastify Refresh Cookie

```typescript
// Source: https://docs.nestjs.com/techniques/cookies
reply.setCookie(config.isProduction ? '__Secure-mk_refresh' : 'mk_refresh_dev', refreshToken, {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: config.refreshCookieMaxAgeSeconds,
});
```

`__Host-` cookies formally require `Secure`, `Path=/`, and no `Domain`; because the recommended narrow auth path conflicts with `Path=/`, use production `__Secure-mk_refresh`. Local HTTP uses the explicitly development-only `mk_refresh_dev` because Secure-prefixed cookies cannot be set over insecure transport. The planner must not combine `__Host-` with `/api/v1/auth`.

### Native SecureStore Adapter

```typescript
// Source: https://docs.expo.dev/versions/v55.0.0/sdk/securestore/
import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'muchakucha.refresh.v1';

export const nativeRefreshStore = {
  get: () => SecureStore.getItemAsync(REFRESH_KEY),
  set: (value: string) => SecureStore.setItemAsync(REFRESH_KEY, value),
  clear: () => SecureStore.deleteItemAsync(REFRESH_KEY),
};
```

### Web Cross-Tab Refresh Lock

```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
export async function refreshOnWeb(): Promise<AccessSession> {
  return navigator.locks.request('muchakucha-session-refresh', async () => {
    return api.auth.refresh({ credentials: 'include' });
  });
}
```

### Password Reset Transaction

```typescript
// Source: Prisma transactions + OWASP Forgot Password guidance.
const newPasswordHash = await passwordHasher.hash(newPassword);

await prisma.$transaction(async (tx) => {
  const claimed = await tx.passwordResetToken.updateMany({
    where: { id: reset.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) throw new ResetTokenInvalidError();

  await tx.user.update({
    where: { id: reset.userId },
    data: { passwordHash: newPasswordHash },
  });
  await tx.authSession.updateMany({
    where: { userId: reset.userId, revokedAt: null },
    data: { revokedAt: now },
  });
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```
