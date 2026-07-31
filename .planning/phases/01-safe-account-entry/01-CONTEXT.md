# Phase 1: 安全账户入口 - Context

**Gathered:** 2026-08-01
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段交付可运行的 Expo 客户端、NestJS API 与 PostgreSQL 数据层骨架，以及完整的邮箱账户闭环：注册、邮箱验证、登录、会话恢复、密码重置、当前设备退出和昵称修改。家庭组创建与加入从 Phase 2 开始；第三方登录、会话设备管理和离线业务写入不属于本阶段。

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and requirements

- `.planning/PROJECT.md` — 产品定位、全局约束、已排除范围与技术决策。
- `.planning/REQUIREMENTS.md` — Phase 1 对应的 AUTH-01..06、SAFE-03 和 SAFE-04，以及后续阶段边界。
- `.planning/ROADMAP.md` — Phase 1 目标、成功标准、依赖关系与完整路线图。

### Architecture and implementation guidance

- `.planning/notes/technology-stack.md` — 已批准的跨平台、服务端、认证和数据库技术选型说明。
- `.planning/research/STACK.md` — 推荐版本、兼容矩阵、支持库和明确禁止的技术选择。
- `.planning/research/ARCHITECTURE.md` — 模块化单体、客户端边界、OpenAPI 与数据层架构指导。
- `.planning/research/PITFALLS.md` — 会话安全、跨平台存储、API 演进与数据库完整性风险。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- 当前仓库没有应用源代码、组件、Hook 或工具函数可复用；本阶段建立首套规范资产。

### Established Patterns

- 除规划文档中的技术与架构约束外，没有遗留代码模式需要兼容。
- 旧项目只作为业务参考，不复制其 Vue、FastAPI、Kotlin 或 MySQL 实现。

### Integration Points

- 新建 pnpm workspace，并建立 Expo 通用客户端、NestJS API、PostgreSQL/Prisma 数据层和 OpenAPI 生成客户端之间的第一条端到端路径。
- 认证路由必须同时支持 Android/iOS 深链接和 Web 回调，同时保持平台对应的 Refresh Token 存储策略。

</code_context>

<specifics>
## Specific Ideas

- 验证邮件重发按钮使用 60 秒倒计时。
- 认证页避免单独欢迎页和大幅人物插画，以品牌字标、抽象色块和表单为视觉中心。
- 主要表单控件采用约 48–52px 的舒展触控高度。
- 会话恢复、网络失败和凭据失效必须呈现不同状态，不能以登录页闪烁代替明确反馈。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-安全账户入口*
*Context gathered: 2026-08-01*
