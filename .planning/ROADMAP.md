# Roadmap: Muchakucha Zwei

**Created:** 2026-07-31  
**Structure:** Vertical MVP slices  
**Phases:** 6

## Overview

Muchakucha Zwei 将以“可实际使用的家庭协作闭环”为顺序推进。每个阶段都交付一段可验证的端到端能力，并持续扩展同一个 Expo 客户端、NestJS API 与 PostgreSQL 数据模型。移动端始终是主入口，Web 作为共享代码下的辅助入口。

## Phases

- [x] **Phase 1: 安全账户入口** — 建立可运行的全栈骨架与完整邮箱账户闭环 (completed 2026-08-02)
- [~] **Phase 2: 家庭组与成员协作** — 让用户创建、加入、切换和安全管理家庭组 (12/13 plans done, Android acceptance pending)
- [~] **Phase 3: 共享家庭日历** — 让家庭成员共同维护可靠的日期与时间安排 (3/4 plans done, all automated gates green except accessibility audit; Android acceptance pending)
- [~] **Phase 4: 任务与今日视图** — 让家庭成员分配、跟进任务并快速掌握今天 (3/4 plans done, all automated gates green including accessibility; only Android acceptance pending)
- [~] **Phase 5: 笔记与标签整理** — 补全共享信息记录与跨资源整理能力 (功能代码已实现于主分支，但绕过了正式 GSD plan/execute 流程；零自动化测试覆盖，缺"按标签筛选"能力)
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

**Plans:** 27/27 plans complete

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
- [x] 01-18-PLAN.md — Implement verified login and atomic rotating session APIs.

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 01-19-PLAN.md — Register and expose minimal GET/PATCH users/me.

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 01-20-PLAN.md — Wire platform SessionTransport to generated session APIs.
- [x] 01-22-PLAN.md — Implement atomic password-reset server behavior and global revoke.

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 01-21-PLAN.md — Deliver login, restore, offline, and no-household routes.
- [x] 01-24-PLAN.md — Implement sid-only current-device logout.

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 01-23-PLAN.md — Deliver sanitized forgot/reset/success client flows.
- [x] 01-25-PLAN.md — Deliver nickname editing and current-device logout UI.

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 01-26-PLAN.md — Enforce no-skips, accessibility, ASVS, and full-suite gates.

**Wave 15** *(blocked on Wave 14 completion)*

- [x] 01-27-PLAN.md — Accept the complete account lifecycle on a real Android target.

### Phase 2: 家庭组与成员协作

**Goal:** As a 已登录的成员, I want to 创建或通过邀请加入协作组，在多个组之间切换，并在权限范围内管理成员, so that 我可以和信任的人在明确、安全且彼此隔离的组上下文中协作.
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

**Plans:** 13 plans (12 complete, 1 remaining)

Plans:
**Wave 1** — [x] 02-01-PLAN.md — Create household from D-01 handoff
**Wave 2** — [x] 02-02-PLAN.md — Guarded household listing, device restore/switch, accessChanged recovery
**Wave 3** — [x] 02-03-PLAN.md — Household destination and isolated roster
**Wave 4** — [x] 02-04-PLAN.md — Owner rename household
**Wave 5** — [x] 02-05-PLAN.md — Privacy-preserving invitation send
**Wave 6** — [x] 02-06-PLAN.md — Invitation preview, authenticate, atomic accept
**Wave 7** — [x] 02-07-PLAN.md — Invitation lifecycle (status, resend, revoke)
**Wave 8** — [x] 02-08-PLAN.md — Role governance (D-09 permission matrix)
**Wave 9** — [x] 02-09-PLAN.md — Non-owner member removal
**Wave 10** — [x] 02-10-PLAN.md — Pointer-based ownership transfer
**Wave 11** — [x] 02-11-PLAN.md — Atomic owner leave with successor handoff
**Wave 12** — [x] 02-12-PLAN.md — Responsive a11y, ASVS, migration, regression gates
**Wave 13** — [ ] 02-13-PLAN.md — ◷ Human Android acceptance checkpoint

**Cross-cutting constraints:**

- Per D-12, membership loss freezes household actions, clears the lost household cache and device persistence, renders the explicit accessChanged explanation first, and only an explicit user action continues to /households when memberships remain or to the equal D-01 create/accept handoff when none remain; it never automatically selects or enters another household.

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

**Plans:** 4 plans (streamlined — no per-endpoint atomic waves)

- [x] **03-01:** Prisma migration + events module + full CRUD API with timezone-safe timestamptz modeling
- [x] **03-02:** Calendar views (month grid, date list) + date navigation + household-scoped queries
- [x] **03-03:** Event create/edit forms + delete + mobile touch-optimized date/time pickers
- [~] **03-04:** Gates — integration tests ✅ (167/167, `apps/api/test/events/events.int.test.ts`), Playwright E2E ✅ (`e2e/events/calendar-api.spec.ts`), accessibility audit ❌ (no dedicated a11y E2E spec for calendar/events, unlike tasks), Android acceptance ❌ (real-device session pending, same as 02-13)

**Verified status (2026-08-05 handoff, `.planning/phases/03-shared-calendar/.continue-here.md`):** typecheck, Prisma migrations (4 on PG17), client Jest (153 passed/2 skipped), API unit (4/4), and API integration (167/167) all green. Only accessibility audit and Android acceptance remain.

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

**Plans:** 4 plans (streamlined)

- [x] **04-01:** Prisma migration + tasks module + CRUD API with filtering, status transitions, single assignee
- [x] **04-02:** Task list views (filtered/sorted) + create/edit forms + status update + assignment selector
- [x] **04-03:** Today view: merged events + assigned tasks + overdue items, mobile-first
- [~] **04-04:** Gates — integration tests ✅, Playwright E2E ✅, accessibility audit ✅ (`e2e/tasks/accessibility.spec.ts` — axe, reduced-motion, forced-colors across tasks list + Today view), Android acceptance ❌ (real-device session pending, same as 02-13/03-04)

**Note:** ROADMAP text previously lagged the commit history — the accessibility E2E suite (`57e2e5e`) landed after the "3/4 complete" doc update (`97335e4`) and was never reflected here until this pass. All automated gates for Phase 4 are green; Android acceptance is the sole remaining item.

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

**Plans:** 3 plans (streamlined — notes and labels share the same household scope)

⚠️ **This phase's code was written directly on main without going through `/gsd-discuss-phase` → `/gsd-plan-phase` → `/gsd-execute-phase`.** No `.planning/phases/05-*` PLAN.md/SUMMARY.md files exist, so `gsd-tools` cannot see this work — the automated progress scan (`roadmap.analyze`) still reports 0/3. Status below is from direct source verification on 2026-08-11.

- [x] **05-01:** Prisma migration + notes & labels modules + full CRUD APIs + label color/name — verified in code (migration `20260805075417_add_notes_labels`; `abf7f5c`, `36147fa`)
- [~] **05-02:** Notes UI (list, detail, create/edit) + label management UI + tag/untag on events & tasks — verified in code; **gap: no "filter events/tasks by label" capability** (success criterion 3 requires it; no `labelId` query param on events/tasks list endpoints, no filter UI)
- [ ] **05-03:** Gates: integration tests, Playwright E2E, accessibility audit, Android acceptance — **not started; zero test files found** (no `apps/api/test/notes/`, `apps/api/test/labels/`, `e2e/notes/`, or `e2e/labels/`)

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

**Plans:** 3 plans (streamlined — all release auditing consolidated here)

- [ ] **06-01:** iOS real-device acceptance + EAS Android/iOS build profiles + deep-link config
- [ ] **06-02:** Cross-platform brand audit (colors, typography, spacing, components) + responsive Web parity
- [ ] **06-03:** Final gates: full ASVS L1, axe accessibility, API v1 compat, migration check, CI, release checklist

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 安全账户入口 | 27/27 | ✅ Complete | 2026-08-02 |
| 2. 家庭组与成员协作 | 12/13 | 🔄 Android acceptance pending | — |
| 3. 共享家庭日历 | 3/4 | 🔄 Android acceptance + accessibility audit pending | — |
| 4. 任务与今日视图 | 3/4 | 🔄 Android acceptance pending (all other gates green) | — |
| 5. 笔记与标签整理 | ~2/3 (code only, untracked) | ⚠️ Code done outside GSD flow — zero tests, label-filter gap, no gates run | — |
| 6. 跨平台完成度与发布准备 | 0/3 | Not started | — |

**Total remaining plans: 15 formally tracked** (1 in Phase 2, 1 in Phase 3, 1 in Phase 4, 3 in Phase 5, 3 in Phase 6) — **plus a backlog of untracked work**: a shared Android-acceptance session covering Phases 2–4, retroactive GSD plan/summary artifacts for Phase 5, its missing test suite, and its label-filter feature.
**Estimated plans saved vs. original methodology: ~40-50**

### Phase 7: 周期性重复事件与任务

**Goal:** As a household member who manages the family schedule, I want to set a recurrence rule (daily, selected weekdays, weekly, monthly, or yearly) on an event or task, so that I don't have to manually recreate the same item over and over.
**Mode:** mvp
**UI hint:** yes
**Depends on:** Phase 3 (共享家庭日历), Phase 4 (任务与今日视图) — 与 Phase 6 并行，不受其阻塞
**Requirements:** RECR-01, RECR-02
**Plans:** 10/15 plans executed

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Tracer：每日重复任务端到端（schema + 手写迁移 + 纯日期模块 + 嵌套 DTO + 生成器 + TasksService）

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-02-PLAN.md — 完整规则词汇表（每周/每月/每年 + D-09 月末钳位 + D-10 DST）与滚动生成 worker
- [x] 07-03-PLAN.md — 事件侧重复、已取消事件读路径过滤、列表生成水位线与手写 OpenAPI 客户端契约

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07-04-PLAN.md — 「仅此一次」语义、cancelled 状态归一与「此后所有」原子拆系列 + /series 子资源

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 07-05-PLAN.md — RecurrencePicker 与中文摘要，接入事件表单与任务表单

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 07-06-PLAN.md — 重复徽标、详情页重复信息块、已取消状态三重表达与今日待办排除
- [x] 07-07-PLAN.md — SeriesScopeSheet 范围选择弹层、两个编辑页接线与生成窗口专用空态

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 07-08-PLAN.md — Web 端到端旅程、事件侧无障碍审计（补 Phase 3 缺口）与 Android 真机验收

**Wave 7** *(addendum D-11…D-20; independent of the pending 07-08 checkpoint)*

- [x] 07-09-PLAN.md — 按频率提前量 + 按规则时区的生成窗口、水位线只增不减、1 小时 tick 与创建即标准检查
- [x] 07-10-PLAN.md — 客户端「仅看周期性」筛选与生成窗口两状态改造（生成落后 / 更远日期注记）

**Wave 8** *(blocked on 07-09)*

- [x] 07-11-PLAN.md — 服务端 recurring 查询参数（任务与事件）与两处列表 where 的类型化

**Wave 9** *(blocked on 07-11)*

- [ ] 07-12-PLAN.md — 规则列表/详情接口、由规则推算的下一次发生，与规则级「结束此重复」

**Wave 10** *(blocked on 07-12)*

- [ ] 07-13-PLAN.md — 规则级编辑接口 updateRuleFromAnchor（以规则时区的明天为锚的原子拆系列）

**Wave 11** *(blocked on 07-13)*

- [ ] 07-14-PLAN.md — 周期规则列表屏与详情屏、类型徽标与家庭首页入口卡片

**Wave 12** *(blocked on 07-10 and 07-14)*

- [ ] 07-15-PLAN.md — addendum 的 Web 端到端旅程、必需测试清单与验证映射、Android 真机验收

---
*Roadmap created: 2026-07-31*
*Last updated: 2026-08-11 — reconciled Phases 3-5 status against source code and test files (see verification notes above); `.planning` artifacts had fallen behind actual implementation*
