# Muchakucha Zwei

## What This Is

Muchakucha Zwei 是一个面向家庭成员的共享协作应用，用于共同管理日历事件、任务、笔记与标签。产品以 Android 和 iOS 手机 App 为主要入口，Web 作为辅助入口，并以统一的视觉语言提供跨平台体验。

这是对旧版 Muchakucha 的从零重构。旧项目只作为业务需求与交互参考，不复用其 Vue、FastAPI、Kotlin 或 MySQL 实现，也不迁移历史数据。

## Core Value

家庭成员可以在手机上低摩擦地共享安排与待办，并始终看到一致、可信的家庭协作状态。

## Requirements

### Validated

- [x] 用户可以通过邮箱和密码注册、验证邮箱、登录、重置密码并安全地保持会话。— Validated in Phase 1: Safe Account Entry（Android 核心流程通过；离线与无障碍设备检查为已接受风险）。

### Active

- [ ] 任意已注册用户可以创建家庭组，或通过邀请加入其他家庭组。
- [ ] 用户可以属于多个家庭组，家庭数据按家庭组严格隔离。
- [ ] 家庭组支持 owner、admin 和 member 角色以及安全的所有权管理。
- [ ] 家庭成员可以共同管理日历事件、任务、笔记与标签。
- [ ] 手机端提供优先于桌面密度的日历与任务交互。
- [ ] Android、iOS 和 Web 共享核心业务逻辑、API Client 与品牌视觉系统。
- [ ] 服务端提供版本化、可演进且对已发布旧客户端保持兼容的 API。

### Out of Scope

- 第三方登录 — 第一版只提供邮箱和密码，数据模型保留未来扩展空间。
- 历史 MySQL 数据迁移 — 新项目从空 PostgreSQL 数据库开始。
- 独立 Next.js Web 应用 — 第一版 Web 只是 Expo 通用客户端的辅助入口。
- 微服务 — 当前领域适合模块化单体，避免不必要的部署与一致性成本。
- 系统日历深度双向同步 — 复杂度较高，待核心共享流程验证后再评估。
- 完整离线写入与冲突解决 — 第一版优先可靠的在线协作体验。
- 推送通知与精细通知偏好 — 架构预留能力，但不作为初始核心闭环的前置条件。

## Context

- 旧版 Muchakucha 使用 Vue 3、FastAPI、SQLAlchemy、MySQL 和独立 Kotlin Android 客户端。
- 旧版已覆盖 JWT 认证、家庭组、成员角色、事件、任务、笔记、标签和分页查询。
- 本次重构的首要动机是让项目更现代、更容易维护，并减少 Web 与移动端技术栈分裂。
- 产品方向已经确定为手机 App 优先、Web 辅助，并为未来 iOS 发布做好准备。
- 任何人都可以自行注册并创建家庭组，不采用邀请制注册。
- 第一版使用邮箱作为登录标识；昵称独立保存、允许重复，不引入全局唯一用户名。
- 当前开发环境为 Windows。Android 和 Web 可本地开发；iOS 使用实体设备与 EAS 云构建，完整模拟器/Xcode 调试需要 macOS。
- 当前目录是全新 Git 仓库，尚无应用源代码。

## Constraints

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

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 使用 Expo/React Native 通用客户端 | 手机 App 为主，同时需要 Android、iOS 和辅助 Web | — Pending |
| 前后端统一 TypeScript | 降低认知切换与长期维护成本 | — Pending |
| 使用 NestJS 模块化单体 | 业务领域已经超过简单 CRUD，但尚不需要微服务 | — Pending |
| 使用 REST/OpenAPI 而非紧耦合 RPC | 已发布移动客户端无法与服务端强制同步升级 | — Pending |
| 使用 PostgreSQL 与稳定版 Prisma ORM | 获得关系完整性、迁移与类型安全查询 | — Pending |
| 使用邮箱密码作为第一版认证 | 支持验证、找回密码与家庭邀请，同时控制首版范围 | — Pending |
| 使用统一品牌设计系统 | 三端需要一致视觉，不追随平台默认组件风格 | — Pending |
| Web 第一版不拆为 Next.js | Web 是辅助入口，避免维护第二套 UI | — Pending |
| 旧项目只作参考且不迁移数据 | 允许清理旧架构与数据模型问题 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone**:
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-02 after Phase 1 completion*
