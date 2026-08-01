# Roadmap: Muchakucha Zwei

**Created:** 2026-07-31  
**Structure:** Vertical MVP slices  
**Phases:** 6

## Overview

Muchakucha Zwei 将以“可实际使用的家庭协作闭环”为顺序推进。每个阶段都交付一段可验证的端到端能力，并持续扩展同一个 Expo 客户端、NestJS API 与 PostgreSQL 数据模型。移动端始终是主入口，Web 作为共享代码下的辅助入口。

## Phases

- [ ] **Phase 1: 安全账户入口** — 建立可运行的全栈骨架与完整邮箱账户闭环
- [ ] **Phase 2: 家庭组与成员协作** — 让用户创建、加入、切换和安全管理家庭组
- [ ] **Phase 3: 共享家庭日历** — 让家庭成员共同维护可靠的日期与时间安排
- [ ] **Phase 4: 任务与今日视图** — 让家庭成员分配、跟进任务并快速掌握今天
- [ ] **Phase 5: 笔记与标签整理** — 补全共享信息记录与跨资源整理能力
- [ ] **Phase 6: 跨平台完成度与发布准备** — 完成移动优先体验、辅助 Web 与发布质量门槛

## Phase Details

### Phase 1: 安全账户入口

**Goal:** 用户可以在真实客户端中安全地注册、验证邮箱、登录、恢复会话、重置密码和退出。  
**Mode:** mvp  
**UI hint:** yes  
**Depends on:** Nothing (first phase)  
**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03, SAFE-04

**Success Criteria:**

1. 访客可从 Android 或 Web 客户端使用邮箱、密码和显示昵称创建账户，并通过邮件链接完成验证。
2. 已验证用户可登录并在应用重启后恢复会话；未验证账户不能进入受保护功能。
3. 用户可通过限时邮件链接重置密码，也可退出当前设备且该设备的 Refresh Token 立即失效。
4. 用户可修改显示昵称，重复昵称不会造成账户身份冲突。
5. 移动端长期凭据进入系统安全存储，Web Refresh Token 使用 HttpOnly Cookie；服务端实现 Token 轮换、撤销、重放检测和哈希存储。

**Plans:** 17/27 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Approve exact official dependency pins before installation.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Install the pinned workspace and deterministic local services.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Configure API integration runners and fail-fast RED/no-placeholder audits.
- [x] 01-04-PLAN.md — Configure the Expo component and platform-adapter runner.
- [x] 01-09-PLAN.md — Create Web lifecycle and accessibility E2E contracts.

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Create the seven API behavior contracts.
- [x] 01-06-PLAN.md — Ground the common-password fixture and ASVS audit.
- [x] 01-07-PLAN.md — Create six client feature and platform-adapter contracts.
- [x] 01-08-PLAN.md — Create typed design-system behavior contracts.

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-10-PLAN.md — Migrate the durable authentication persistence foundation.
- [x] 01-14-PLAN.md — Implement the typed theme and owned accessible primitives.

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-11-PLAN.md — Bootstrap the versioned API and provider-neutral mail boundary.
- [x] 01-12-PLAN.md — Establish PendingProofStore, SessionTransport, and session-state contracts.

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-13-PLAN.md — Implement registration API and registration-side proof issuance.

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-15-PLAN.md — Deliver registration UI with native pending-proof persistence.
- [x] 01-16-PLAN.md — Implement transactional verification, resend, and proof/session issuance.

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 01-17-PLAN.md — Deliver sanitized verification with D-06 authenticated handoff.
- [ ] 01-18-PLAN.md — Implement verified login and atomic rotating session APIs.

**Wave 10** *(blocked on Wave 9 completion)*

- [ ] 01-19-PLAN.md — Register and expose minimal GET/PATCH users/me.

**Wave 11** *(blocked on Wave 10 completion)*

- [ ] 01-20-PLAN.md — Wire platform SessionTransport to generated session APIs.
- [ ] 01-22-PLAN.md — Implement atomic password-reset server behavior and global revoke.

**Wave 12** *(blocked on Wave 11 completion)*

- [ ] 01-21-PLAN.md — Deliver login, restore, offline, and no-household routes.
- [ ] 01-24-PLAN.md — Implement sid-only current-device logout.

**Wave 13** *(blocked on Wave 12 completion)*

- [ ] 01-23-PLAN.md — Deliver sanitized forgot/reset/success client flows.
- [ ] 01-25-PLAN.md — Deliver nickname editing and current-device logout UI.

**Wave 14** *(blocked on Wave 13 completion)*

- [ ] 01-26-PLAN.md — Enforce no-skips, accessibility, ASVS, and full-suite gates.

**Wave 15** *(blocked on Wave 14 completion)*

- [ ] 01-27-PLAN.md — Accept the complete account lifecycle on a real Android target.

### Phase 2: 家庭组与成员协作

**Goal:** 用户可以创建和加入多个家庭组，并在明确、隔离且一致的家庭上下文中管理成员。  
**Mode:** mvp  
**UI hint:** yes  
**Depends on:** Phase 1  
**Requirements:** HHLD-01, HHLD-02, HHLD-03, HHLD-04, HHLD-05, HHLD-06, HHLD-07, HHLD-08, HHLD-09, EXPR-02, SAFE-01, SAFE-02

**Success Criteria:**

1. 已登录用户可创建家庭组并自动成为 owner，也可查看和切换自己加入的多个家庭组。
2. owner 或 admin 可发出邮箱邀请；已注册或新注册用户都可接受有效邀请并进入目标家庭。
3. 成员可查看当前家庭的成员与角色；授权用户可变更角色、移除成员或转移所有权。
4. 客户端始终清楚显示当前家庭，并在创建或编辑家庭数据前保持上下文明确。
5. 跨家庭访问被拒绝；邀请接受、成员移除和所有权转移具备事务一致性，任何操作都不会留下无 owner 家庭。

**Plans:** TBD

### Phase 3: 共享家庭日历

**Goal:** 家庭成员可以在移动端优先的日历体验中共同维护定时事件和全天事件。  
**Mode:** mvp  
**UI hint:** yes  
**Depends on:** Phase 2  
**Requirements:** EVNT-01, EVNT-02, EVNT-03, EVNT-04, EVNT-05, EVNT-06

**Success Criteria:**

1. 成员可按日期范围查看当前家庭事件，并在日历与日程列表中定位具体日期。
2. 成员可创建定时事件或全天事件；授权成员可编辑和删除已有事件。
3. 定时事件在不同时区显示正确本地时间，全天事件不会因时区或夏令时变化移动日期。
4. 所有事件读写都限定在当前家庭和成员权限范围内。

**Plans:** TBD

### Phase 4: 任务与今日视图

**Goal:** 家庭成员可以分配和推进共享任务，并通过 Today 视图快速掌握个人当日重点。  
**Mode:** mvp  
**UI hint:** yes  
**Depends on:** Phase 3  
**Requirements:** TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, EXPR-01

**Success Criteria:**

1. 成员可创建包含可选截止日期、优先级和单一负责人或未分配状态的任务。
2. 成员可按状态、优先级、负责人和标签筛选任务；授权成员可编辑或删除任务。
3. 任务可在 pending、in_progress 和 completed 之间更新，负责人必须属于当前家庭。
4. Today 视图同时展示当天事件、分配给当前用户的待办与逾期任务，并支持移动端快速进入处理流程。

**Plans:** TBD

### Phase 5: 笔记与标签整理

**Goal:** 家庭成员可以记录共享信息，并使用统一标签组织事件和任务。  
**Mode:** mvp  
**UI hint:** yes  
**Depends on:** Phase 4  
**Requirements:** NOTE-01, NOTE-02, NOTE-03, NOTE-04, LABL-01, LABL-02, LABL-03, LABL-04

**Success Criteria:**

1. 成员可创建和查看共享笔记；授权成员可编辑和删除笔记。
2. 成员可创建、重命名、着色和删除当前家庭的标签。
3. 成员可为事件或任务附加和移除多个标签，并按标签筛选这两类资源。
4. 笔记、标签及其关联始终受家庭隔离和权限规则保护。

**Plans:** TBD

### Phase 6: 跨平台完成度与发布准备

**Goal:** v1 在 Android 与 iOS 上达到可发布质量，同时提供一致、受控的辅助 Web 入口。  
**Mode:** mvp  
**UI hint:** yes  
**Depends on:** Phase 5  
**Requirements:** EXPR-03, EXPR-04, EXPR-05, SAFE-05

**Success Criteria:**

1. Android 与 iOS 可完成全部 v1 核心流程，并在真实设备上通过关键路径验收。
2. Web 支持注册登录、家庭切换以及事件、任务和笔记核心流程，并针对辅助入口提供合适的响应式布局。
3. 三个平台共享品牌颜色、字体、间距、圆角和组件状态令牌，关键页面保持统一而适配各自交互环境。
4. `/api/v1` 兼容性检查、CI、数据库迁移检查、EAS Android/iOS 构建与发布清单全部通过。

**Plans:** TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 安全账户入口 | 17/27 | In Progress|  |
| 2. 家庭组与成员协作 | 0 / TBD | Not started | — |
| 3. 共享家庭日历 | 0 / TBD | Not started | — |
| 4. 任务与今日视图 | 0 / TBD | Not started | — |
| 5. 笔记与标签整理 | 0 / TBD | Not started | — |
| 6. 跨平台完成度与发布准备 | 0 / TBD | Not started | — |

---
*Roadmap created: 2026-07-31*
*Last updated: 2026-07-31 after v1 requirements approval*
