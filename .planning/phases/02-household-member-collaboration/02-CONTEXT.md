# Phase 2: 家庭组与成员协作 - Context

**Gathered:** 2026-08-02
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段交付家庭协作的身份与上下文基础：已登录用户可以创建家庭、通过邮箱邀请加入家庭、查看并切换自己所属的多个家庭，以及在 owner、admin、member 权限边界内管理成员。所有读取与写入必须绑定到明确且有效的当前家庭；邀请接受、成员移除和所有权转移必须保持事务一致性。日历、任务、笔记、标签和推送通知等家庭内容能力不属于本阶段。

</domain>

<decisions>
## Implementation Decisions

### 家庭入口与当前上下文

- **D-01:** 无家庭用户登录后进入一个并列双入口页面，同时突出“创建家庭”和“接受邀请”，不预设用户意图。
- **D-02:** 家庭内容页顶部始终显示当前家庭名称；点击顶部家庭选择器打开用户所属的家庭列表并切换。
- **D-03:** 当前家庭按设备独立持久化，应用重启或重新登录后恢复该设备上次选择；若用户已失去该家庭的成员资格，则返回家庭选择页。
- **D-04:** 页面顶部持续显示当前家庭，创建或编辑家庭数据的表单标题下再次标注“保存到：{家庭名称}”；普通保存不增加确认弹窗。

### 邮箱邀请闭环

- **D-05:** 新邀请统一以 `member` 角色加入；邀请表单只要求邮箱，加入后再由授权成员显式提升角色。
- **D-06:** 邀请提交结果不得透露目标邮箱是否已注册，统一反馈“邀请已发送”；只有目标用户已经是当前家庭成员时可以明确提示，因为这是邀请人有权查看的家庭内信息。
- **D-07:** 有效邀请链接先展示目标家庭名称和邀请人，并提供登录与创建账户入口；认证完成后返回邀请页，由用户明确点击接受，不自动加入。
- **D-08:** 接受邀请的账户邮箱必须与受邀邮箱匹配；不匹配时提示切换账户，且不泄露更多邀请细节。邀请接受必须作为原子操作完成。

### 成员角色与危险操作

- **D-09:** `admin` 可邀请成员，并可提升、降级或移除任何非 owner 成员，包括其他 admin；admin 不能变更或移除 owner，也不能转移所有权。
- **D-10:** 角色降级和成员移除使用确认页，明确显示成员、家庭和操作后果；所有权转移在此基础上增加一次最终确认。
- **D-11:** owner 主动离开家庭时，必须在同一流程中选择一位现有成员作为继任者；所有权转移和原 owner 成员关系移除在同一事务中整体成功或整体失败。
- **D-12:** 用户失去当前家庭访问权后，客户端立即停止该家庭操作，明确说明权限状态已变化并进入家庭选择页；若没有其他家庭，则返回创建家庭/接受邀请双入口。

### the agent's Discretion

- 确定家庭名称限制、精确表单文案、家庭选择器的弹层样式、列表排序和空/加载/错误状态，但必须保持移动优先、当前家庭持续可见和既有可访问性标准。
- 确定邀请有效期、重复邀请、重发、撤销、已使用和过期状态的精确规则与文案；不得泄露账户存在性，且任何邀请只能成功建立一次成员关系。
- 确定数据库模型、事务隔离级别、API 路由、稳定错误码和 OpenAPI DTO；所有家庭资源必须从经过鉴权的成员关系解析，不能信任客户端选择来授予权限。
- 确定当前家庭在各平台的本地持久化机制、查询缓存隔离键和成员资格失效检测方式；不得把一次家庭切换静默扩散到用户的其他设备。
- 确定确认页的精确组件和动效；不得弱化 D-10 的分级确认或 D-11 的原子所有权交接。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and locked project decisions

- `.planning/PROJECT.md` — 产品定位、全局约束、已排除范围，以及“任何人可注册并创建家庭、用户可属于多个家庭”的项目级决定。
- `.planning/REQUIREMENTS.md` — Phase 2 的 HHLD-01..09、EXPR-02、SAFE-01 和 SAFE-02 完整需求与追踪关系。
- `.planning/ROADMAP.md` — Phase 2 目标、成功标准、Phase 1 依赖和后续家庭内容阶段边界。
- `.planning/phases/01-safe-account-entry/01-CONTEXT.md` — 登录后家庭分流、会话恢复、视觉系统和跨平台凭据边界等必须延续的 Phase 1 决策。

### Architecture and implementation guidance

- `.planning/notes/technology-stack.md` — 已批准的 Expo、NestJS、PostgreSQL、Prisma、OpenAPI 与跨平台技术边界。
- `.planning/research/ARCHITECTURE.md` — 模块化单体、家庭域边界、客户端状态和数据访问架构指导。
- `.planning/research/PITFALLS.md` — 跨家庭越权、事务完整性、客户端上下文漂移和 API 演进风险。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `apps/client/src/ui/primitives.tsx` 与 `apps/client/src/ui/theme.ts`：复用 `Screen`、`Stack`、`Inline`、`Button`、`IconButton`、`TextField`、`StatusPanel` 和类型化 Restyle 主题构建家庭入口、选择器、表单与确认状态。
- `apps/client/src/features/auth/session-bootstrap.tsx`：已有会话恢复、离线保留和受控 intended-route 模式，可扩展登录后的家庭解析与成员资格失效路由。
- `apps/client/app/(protected)/household-handoff.tsx`：Phase 1 的家庭占位入口，是 D-01 双入口体验的直接替换点。
- `apps/api/src/infrastructure/prisma/prisma.service.ts` 与现有认证服务事务模式：可作为邀请接受、成员移除和所有权转移的事务边界基础。
- `packages/api-client` 的 OpenAPI 生成链路：家庭 API DTO 必须继续由版本化契约生成，不能共享 Prisma 类型。

### Established Patterns

- 客户端使用 Expo Router、按 feature 划分业务逻辑，并通过自有组件层和类型化主题禁止功能页面散落原始视觉值。
- 会话凭据按平台隔离；导航只接受内部白名单路由，网络失败与认证/授权失效必须呈现为不同状态。
- API 使用 NestJS 模块边界、Access Token guard、严格 DTO 与 `/api/v1` OpenAPI 契约；持久化由 Prisma schema、真实外键、唯一约束和 PostgreSQL 事务保证。
- 当前 `User` schema 尚无家庭关系，家庭、成员和邀请模型可以从零建立，不需要兼容旧数据库或迁移历史数据。

### Integration Points

- 将 `household-handoff` 占位页替换为创建/接受邀请入口，并扩展根路由在恢复会话后根据有效家庭成员关系列表进行分流。
- 在客户端会话运行时之上增加当前家庭状态边界，并把家庭 ID 纳入所有后续家庭查询的缓存键与路由上下文。
- 在 API 中新增独立家庭领域模块，接入现有 `AppModule`、认证 guard、Prisma 服务和邮件端口。
- 扩展 Prisma `User` 关系及迁移，建立 Household、Membership 与 Invitation 的约束和索引；关键治理操作必须使用数据库事务。
- 更新 OpenAPI 文档并重新生成 `packages/api-client`，让 Android、iOS 和辅助 Web 共享同一家庭契约。

</code_context>

<specifics>
## Specific Ideas

- 无家庭页的两个主操作文案为“创建家庭”和“接受邀请”。
- 家庭表单使用“保存到：{家庭名称}”再次标明写入上下文。
- 邀请预览明确展示家庭名称和邀请人，但账户不匹配时不继续泄露邀请细节。
- 用户被移除后不能静默切换家庭或被误导到登录页，必须说明是家庭访问权限发生变化。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-家庭组与成员协作*
*Context gathered: 2026-08-02*
