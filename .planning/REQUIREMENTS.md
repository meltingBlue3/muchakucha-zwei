# Requirements: Muchakucha Zwei

**Defined:** 2026-07-31  
**Core Value:** 家庭成员可以在手机上低摩擦地共享安排与待办，并始终看到一致、可信的家庭协作状态。

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: 访客可以使用邮箱和密码创建账户。
- [ ] **AUTH-02**: 新用户可以通过邮件链接验证邮箱。
- [ ] **AUTH-03**: 已验证用户可以使用邮箱和密码登录，并在应用重启后保持会话。
- [ ] **AUTH-04**: 用户可以通过发送到注册邮箱的限时链接重置密码。
- [ ] **AUTH-05**: 用户可以退出当前设备，退出后该设备的 Refresh Token 不再有效。
- [ ] **AUTH-06**: 用户可以设置和修改允许重复的显示昵称。

### Households

- [ ] **HHLD-01**: 已登录用户可以创建家庭组，并自动成为该家庭组的 owner。
- [ ] **HHLD-02**: 家庭组 owner 或 admin 可以通过邮箱邀请用户加入家庭组。
- [ ] **HHLD-03**: 收到有效邀请的用户可以注册或登录后接受邀请。
- [ ] **HHLD-04**: 用户可以查看自己已加入的全部家庭组并切换当前家庭组。
- [ ] **HHLD-05**: 家庭成员可以查看当前家庭组的成员及其角色。
- [ ] **HHLD-06**: owner 或 admin 可以在权限范围内将成员设置为 admin 或 member。
- [ ] **HHLD-07**: owner 或 admin 可以在权限范围内移除家庭成员。
- [ ] **HHLD-08**: owner 可以将家庭组所有权转移给另一位现有成员。
- [ ] **HHLD-09**: 系统必须阻止会导致家庭组没有 owner 的退出、移除或角色变更。

### Calendar Events

- [ ] **EVNT-01**: 家庭成员可以按日期范围查看当前家庭组的共享事件。
- [ ] **EVNT-02**: 家庭成员可以创建包含标题、开始时间、结束时间和可选描述、地点的定时事件。
- [ ] **EVNT-03**: 家庭成员可以创建只包含日期语义的全天事件。
- [ ] **EVNT-04**: 有权限的家庭成员可以编辑现有事件。
- [ ] **EVNT-05**: 有权限的家庭成员可以删除现有事件。
- [ ] **EVNT-06**: 用户在不同时区查看定时事件时可以看到正确的本地时间，全天事件不得因时区变化而移动日期。

### Tasks

- [ ] **TASK-01**: 家庭成员可以查看当前家庭组的任务，并按状态、优先级、负责人和标签筛选。
- [ ] **TASK-02**: 家庭成员可以创建包含标题和可选描述、截止日期、优先级的任务。
- [ ] **TASK-03**: 家庭成员可以将任务分配给当前家庭组中的一位负责人或保持未分配。
- [ ] **TASK-04**: 家庭成员可以在 pending、in_progress 和 completed 状态之间更新任务。
- [ ] **TASK-05**: 有权限的家庭成员可以编辑任务详情。
- [ ] **TASK-06**: 有权限的家庭成员可以删除任务。

### Notes

- [ ] **NOTE-01**: 家庭成员可以创建包含标题和正文的共享笔记。
- [ ] **NOTE-02**: 家庭成员可以查看当前家庭组的笔记列表和笔记详情。
- [ ] **NOTE-03**: 有权限的家庭成员可以编辑共享笔记。
- [ ] **NOTE-04**: 有权限的家庭成员可以删除共享笔记。

### Labels

- [ ] **LABL-01**: 家庭成员可以创建、重命名、选择颜色和删除家庭组内的标签。
- [ ] **LABL-02**: 家庭成员可以为事件附加或移除多个家庭组标签。
- [ ] **LABL-03**: 家庭成员可以为任务附加或移除多个家庭组标签。
- [ ] **LABL-04**: 家庭成员可以通过标签筛选事件和任务。

### Core Experience

- [ ] **EXPR-01**: 用户可以在一个 Today 视图中查看当天事件以及分配给自己的待办和逾期任务。
- [ ] **EXPR-02**: 应用必须始终清晰显示当前家庭组，并在创建或编辑家庭数据前保持家庭组上下文明确。
- [ ] **EXPR-03**: Android 和 iOS 必须提供完成全部 v1 核心流程的移动优先界面。
- [ ] **EXPR-04**: 辅助 Web 入口必须支持注册登录、家庭组切换以及事件、任务和笔记核心流程。
- [ ] **EXPR-05**: Android、iOS 和 Web 必须共享颜色、字体、间距、圆角和组件状态等品牌设计令牌。

### Privacy and Reliability

- [ ] **SAFE-01**: 用户无法读取或修改任何自己未加入家庭组的事件、任务、笔记、标签或成员数据。
- [ ] **SAFE-02**: owner 转移、成员移除和邀请接受等多记录操作必须整体成功或整体失败。
- [ ] **SAFE-03**: Android/iOS 的长期会话凭据必须存入系统安全存储，Web 的 Refresh Token 必须由 HttpOnly Cookie 承载。
- [ ] **SAFE-04**: 服务端必须支持 Refresh Token 轮换、撤销和重放检测，并且数据库只保存 Token 哈希。
- [ ] **SAFE-05**: 已发布的 v1 移动客户端必须能够在约定兼容窗口内继续使用升级后的 `/api/v1` 服务。

## v2 Requirements

### Authentication

- **AUTH-07**: 用户可以使用 Apple 登录关联或创建账户。
- **AUTH-08**: 用户可以使用 Google 登录关联或创建账户。
- **AUTH-09**: 用户可以查看活跃设备会话并退出指定设备或全部设备。

### Notifications

- **NOTF-01**: 用户可以为事件和任务设置提醒。
- **NOTF-02**: 用户可以在 Android/iOS 上接收推送通知。
- **NOTF-03**: 用户可以按家庭组和通知类型配置偏好。

### Advanced Calendar and Tasks

- **RECR-01**: 用户可以创建符合明确重复规则的周期事件和周期任务。
- **RECR-02**: 用户可以编辑或删除单次发生项、当前及未来发生项或整个系列。
- **SYNC-01**: 用户可以按明确的冲突规则与系统日历同步选定事件。
- **OFFL-01**: 用户可以离线创建和编辑数据，并在恢复连接后处理同步冲突。

### Collaboration Enhancements

- **ACTV-01**: 家庭成员可以查看关键变更活动记录。
- **CMNT-01**: 家庭成员可以在任务或事件下添加上下文评论。
- **ATCH-01**: 家庭成员可以向任务、事件或笔记添加附件。
- **WDGT-01**: 用户可以通过 Android/iOS 桌面小组件查看今日安排。

## Out of Scope

| Feature | Reason |
|---------|--------|
| 旧 MySQL 数据迁移 | 新项目明确从空 PostgreSQL 数据库开始 |
| 独立 Next.js Web 产品 | 第一版 Web 只是辅助入口，避免维护第二套 UI |
| 微服务架构 | 当前规模适合模块化单体，拆分会增加部署与一致性成本 |
| 家庭内完整即时聊天 | 会形成独立消息产品，偏离核心安排与待办价值 |
| 一个任务同时分配多人 | 责任边界模糊；第一版采用单一负责人 |
| 第一版实时同步所有资源 | 在验证实际实时需求前，不引入 WebSocket 生命周期与冲突复杂度 |
| 第一版完整离线写入 | 需要独立冲突模型，先保证可靠的在线闭环 |
| 第一版周期事件 | 需要系列、发生项例外及时区规则，安排在专门后续阶段 |

## Traceability

Roadmap 创建时填充。每个 v1 需求必须且只能映射到一个阶段。

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| SAFE-03 | Phase 1 | Pending |
| SAFE-04 | Phase 1 | Pending |
| HHLD-01 | Phase 2 | Pending |
| HHLD-02 | Phase 2 | Pending |
| HHLD-03 | Phase 2 | Pending |
| HHLD-04 | Phase 2 | Pending |
| HHLD-05 | Phase 2 | Pending |
| HHLD-06 | Phase 2 | Pending |
| HHLD-07 | Phase 2 | Pending |
| HHLD-08 | Phase 2 | Pending |
| HHLD-09 | Phase 2 | Pending |
| EXPR-02 | Phase 2 | Pending |
| SAFE-01 | Phase 2 | Pending |
| SAFE-02 | Phase 2 | Pending |
| EVNT-01 | Phase 3 | Pending |
| EVNT-02 | Phase 3 | Pending |
| EVNT-03 | Phase 3 | Pending |
| EVNT-04 | Phase 3 | Pending |
| EVNT-05 | Phase 3 | Pending |
| EVNT-06 | Phase 3 | Pending |
| TASK-01 | Phase 4 | Pending |
| TASK-02 | Phase 4 | Pending |
| TASK-03 | Phase 4 | Pending |
| TASK-04 | Phase 4 | Pending |
| TASK-05 | Phase 4 | Pending |
| TASK-06 | Phase 4 | Pending |
| EXPR-01 | Phase 4 | Pending |
| NOTE-01 | Phase 5 | Pending |
| NOTE-02 | Phase 5 | Pending |
| NOTE-03 | Phase 5 | Pending |
| NOTE-04 | Phase 5 | Pending |
| LABL-01 | Phase 5 | Pending |
| LABL-02 | Phase 5 | Pending |
| LABL-03 | Phase 5 | Pending |
| LABL-04 | Phase 5 | Pending |
| EXPR-03 | Phase 6 | Pending |
| EXPR-04 | Phase 6 | Pending |
| EXPR-05 | Phase 6 | Pending |
| SAFE-05 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0

---
*Requirements defined: 2026-07-31*
*Last updated: 2026-07-31 after project research*
