<!-- GSD:project-start source:PROJECT.md -->

## Project

**Muchakucha Zwei**

Muchakucha Zwei 是一个面向家庭成员的共享协作应用，用于共同管理日历事件、任务、笔记与标签。产品以 Android 和 iOS 手机 App 为主要入口，Web 作为辅助入口，并以统一的视觉语言提供跨平台体验。

这是对旧版 Muchakucha 的从零重构。旧项目只作为业务需求与交互参考，不复用其 Vue、FastAPI、Kotlin 或 MySQL 实现，也不迁移历史数据。

**Core Value:** 家庭成员可以在手机上低摩擦地共享安排与待办，并始终看到一致、可信的家庭协作状态。

### Constraints

- **客户端技术栈**：Expo、React Native、TypeScript、Expo Router — 支持移动优先的 Android/iOS 体验并保留辅助 Web。
- **视觉系统**：统一品牌视觉、类型化设计令牌与自有组件层 — 避免 Android/iOS 各自套用不同视觉规范。
- **服务端技术栈**：NestJS、Fastify adapter、TypeScript 严格模式 — 以模块化单体保持清晰业务边界。
- **API**：REST、OpenAPI、`/api/v1` — 移动商店中的旧客户端必须能与升级后的服务端共存。
- **数据层**：PostgreSQL、稳定版 Prisma ORM、Prisma Migrate — 使用数据库约束和事务保证完整性。
- **仓库**：pnpm workspace 单体仓库 — 统一管理客户端、API 与生成的共享包。
- **认证安全**：短期 Access Token、轮换 Refresh Token、服务端只存哈希 — Web 不得在 localStorage 保存 Refresh Token。
- **数据时间**：时间点使用 PostgreSQL `timestamptz`，服务端按 UTC 处理 — 避免跨时区日历错误。
- **数据完整性**：使用真实外键、唯一约束、检查约束与事务 — 不沿用旧项目仅靠应用层维持一致性的策略。
- **迁移**：不迁移旧版数据 — 允许根据新领域模型从零设计 schema。

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24 LTS | Shared JavaScript runtime and toolchain | Node 24 is the current LTS line; production projects should prefer LTS over Node 26 Current |
| TypeScript | Current stable 5.x | Client and API language | One strict type system across the monorepo reduces context switching |
| Expo SDK | 57 | Android, iOS and auxiliary Web client | SDK 57 targets React Native 0.86, React 19.2.3 and React Native Web 0.21 |
| Expo Router | SDK 57 compatible | Universal file-based navigation | One route model supports native navigation, Web links and deep links |
| NestJS | 11.x stable | Modular API application framework | Modules, services, guards and dependency injection fit the existing domain breadth |
| Fastify | Nest-supported stable major | HTTP adapter | Schema-oriented, efficient request handling without changing Nest module boundaries |
| PostgreSQL | 18.x stable | Relational system of record | Strong constraints, transactions, time-zone-aware types and indexing |
| Prisma ORM | 7.x stable | Type-safe data access and migrations | Generated query client plus reviewable SQL migrations; use stable releases only |

### Supporting Libraries

| Library | Version Policy | Purpose | When to Use |
|---------|----------------|---------|-------------|
| `@shopify/restyle` | Pin current stable | Typed design tokens and themes | All shared UI primitives and responsive styling |
| TanStack Query | Pin current stable major | Server-state cache | All authenticated API queries and mutations |
| React Hook Form | Pin current stable major | Form state | Registration, event, task and household forms |
| Zod | Pin current stable major | Client-side runtime validation | Form schemas and environment/config validation |
| `expo-secure-store` | Install via `expo install` | Encrypted native secret storage | Refresh/session material on Android and iOS |
| Argon2id implementation | Pin audited current stable | Password hashing | API credential storage; tune work factor in deployment |
| OpenAPI client generator | Pin chosen stable tool | Generated API client | Generate `packages/api-client` from the versioned contract |
| Vitest | Pin current stable major | Unit/integration tests | Shared packages and API service logic |
| Playwright | Pin current stable major | Browser flows | Auxiliary Web registration and core collaboration checks |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm workspace | Monorepo dependency management | One lockfile; enforce package boundaries |
| Docker Compose | Local PostgreSQL and supporting services | App processes may run natively for fast reload |
| Prisma Migrate | Schema history | Commit migrations and review generated SQL |
| OpenAPI | API contract | Generate client types; do not share Prisma types |
| GitHub Actions | CI | Typecheck, lint, tests, migration validation and builds |
| EAS Build | Android/iOS cloud builds | Enables iOS builds from Windows; retain real-device validation |

## Installation Strategy

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Expo universal client | Separate Next.js + Expo apps | Web becomes a full product with SEO/SSR or desktop-only workflows |
| NestJS modular monolith | Hono/Fastify routes directly | The API remains very small and the team accepts defining its own architecture rules |
| REST/OpenAPI | tRPC/Hono RPC | All clients can update atomically with the server |
| Prisma | Drizzle | SQL control becomes more important than Prisma's migration and relation ergonomics |
| Restyle/custom components | Tamagui | A larger ready-made universal component system justifies added abstraction |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Node 26 Current for production | It has not entered LTS as of the research date | Node 24 LTS |
| Expo canary/beta | Pre-releases explicitly carry compatibility risk | Stable Expo SDK 57 |
| Prisma Next/Early Access features | Preview behavior can change during the project | Stable Prisma 7.x APIs |
| NativeWind v5 pre-release | Styling is foundational and should not depend on a preview compiler | Restyle plus React Native primitives |
| Prisma models as client DTOs | Leaks persistence structure and couples app releases to schema changes | OpenAPI-generated client models |
| Refresh tokens in AsyncStorage/localStorage | These stores are unsuitable for long-lived secrets | SecureStore on native and HttpOnly cookie on Web |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Expo SDK 57 | React Native 0.86, React 19.2.3, RN Web 0.21 | Minimum Node 22.13; project standardizes on Node 24 LTS |
| Expo SDK packages | Expo SDK 57 | Install with `npx expo install`, verify with `expo-doctor` |
| NestJS 11 | Node 24 LTS | Confirm adapter/plugin compatibility in the foundation phase |
| Prisma 7 stable | Node 24 LTS + PostgreSQL 18 | Pin CLI and client to the same version |

## Sources

- https://docs.expo.dev/versions/latest/ — SDK 57 compatibility matrix
- https://docs.expo.dev/router/introduction/ — universal routing
- https://nodejs.org/en/about/previous-releases — LTS status
- https://docs.nestjs.com/openapi/introduction — REST/OpenAPI generation
- https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/ — schema validation and serialization
- https://www.prisma.io/docs/orm — ORM and migration capabilities
- https://www.postgresql.org/docs/18/ddl-constraints.html — relational constraints
- https://shopify.github.io/restyle/ — type-enforced design systems

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
