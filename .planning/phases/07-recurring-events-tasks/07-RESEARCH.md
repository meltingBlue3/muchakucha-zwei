# Phase 7: 周期性重复事件与任务 - Research

**Researched:** 2026-08-12
**Domain:** Recurring-instance materialization (NestJS/Fastify + Prisma 7 + PostgreSQL 18) + IANA-timezone calendar arithmetic + Expo/React Native recurrence UI
**Confidence:** HIGH for codebase facts (all read from source this session); MEDIUM for the scheduler/date-library recommendation (design judgement, two viable options presented)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

> Copied verbatim from `.planning/phases/07-recurring-events-tasks/07-CONTEXT.md`. These are locked. Do not re-derive.

### Locked Decisions

#### 存储与生成策略

- **D-01:** 采用预生成实例行（materialized instances），不做虚拟展开。新增共享的 `RecurrenceRule` 表（字段：`householdId`、`freq`、`interval`、`byWeekday`、`startsOn`、`endsOn`、`count`、`timezone`、`materializedThrough`）。`Task` 与 `Event` 各加 `recurrenceRuleId`（可空外键，`onDelete: SetNull`）与 `occurrenceDate`（Date，去重键）。`recurrenceRuleId` 为空即普通一次性任务/事件，完全不受影响。
- **D-02:** 每个实例是一条真实的 Task/Event 行，可独立编辑、指派、标记完成、删除；必须天然兼容现有查询、筛选、索引（如 `Task_household_status_idx`），不得为"是否重复"引入专门的展开层或额外的前端渲染路径。
- **D-03:** 后台 worker 定时滚动生成未来窗口（建议未来 90 天）内缺失的实例，用 `(recurrenceRuleId, occurrenceDate)` 判重，`materializedThrough` 做水位线避免漏跑重复生成。规则创建/编辑时必须立即触发一次生成，不等下一次定时任务。

#### 任务重复语义

- **D-04:** 任务按固定日历排期生成下一次，不看上一次是否按时完成——即使上一次逾期未完成，下一次仍按规则准时出现在列表里。这是家务型重复任务（倒垃圾、打扫）的预期语义。

#### 规则表达力

- **D-05:** 只做预设频率：每日 / 每周（可多选星期几，如"周二四六"）/ 每月（固定"同一天"重复）/ 每年（固定"同一月同一天"重复）。不支持完整 RRULE 的序数规则（"每月第二个周三"）。`interval` 字段预留"每 N 个周期一次"的扩展空间，但本阶段 UI 只需支持 `interval=1`。
- **D-06:** 重复结束条件二选一：`endsOn`（到某天为止）或 `count`（重复 N 次后结束），两者互斥；均为空表示永不结束。

#### 单次编辑 vs 系列编辑

- **D-07:** "仅此一次"的编辑/删除直接操作该实例行本身（改字段，或将 Task 的 `status` 置为 `cancelled`／给 Event 加 `cancelledAt`）。因为该行已经是真实数据，生成器判重时会跳过这天，不需要额外的例外表。
- **D-08:** "此后所有"的编辑/删除走拆系列：旧 `RecurrenceRule.endsOn` 设为这一次的前一天；新建一条规则从这一次的日期开始，带上新字段值；删除旧规则下这一次及以后尚未发生的已生成实例，交给新规则重新生成。已经过去的历史实例不受影响。

#### 边界情况（必须显式处理，不能默默丢失）

- **D-09:** 月末钳位——`startsOn` 为每月 31 日、`freq=MONTHLY` 时，遇到没有 31 日的月份钳到当月最后一天（2 月钳到 28/29），不得跳过该月不生成。
- **D-10:** 时区与夏令时——`RecurrenceRule.timezone` 必须存 IANA 时区标识，日期推算按本地日期做，不能直接对 UTC 时间戳做天数加法，否则夏令时切换日会错位一小时或错位一天。

### Claude's Discretion

- 确定 worker 的具体调度实现方式（cron/queue/定时任务框架）与执行窗口长度的精确默认值（建议 90 天，可调整），但必须保证水位线机制、幂等生成和创建时立即触发这三点不被弱化。
- 确定 API 路由、DTO 形状、OpenAPI 契约，以及"仅此一次 / 此后所有"在前端交互上的具体呈现（弹窗/选项/文案），但拆系列的原子性（D-08）不能弱化——不能出现旧规则已终止、新规则未建成的中间态。
- 确定重复设置 UI 的具体组件形态（星期选择器、结束条件切换等），但必须保持移动优先与现有可访问性标准。
- 确定 `Task.status`/`Event.cancelledAt` 之外是否需要额外索引支持"按规则查所有未来实例"这类生成器内部查询，不影响对外行为。

### Deferred Ideas (OUT OF SCOPE)

Per the CONTEXT.md `<domain>` boundary — **不包含**:

- 完整 RRULE 语义（如"每月第二个周三"这类序数规则）
- 跨家庭共享重复规则
- 重复规则模板库
</user_constraints>

---

<phase_requirements>
## Phase Requirements

**No v1 requirement IDs are currently assigned to Phase 7.** `.planning/ROADMAP.md:260` reads `**Requirements**: TBD` [VERIFIED: .planning/ROADMAP.md:260 — verbatim: `**Requirements**: TBD`].

Two requirement IDs already exist in `.planning/REQUIREMENTS.md` under `## v2 Requirements → Advanced Calendar and Tasks` that describe exactly this phase's scope [VERIFIED: .planning/REQUIREMENTS.md:93-94 — verbatim:
```
- **RECR-01**: 用户可以创建符合明确重复规则的周期事件和周期任务。
- **RECR-02**: 用户可以编辑或删除单次发生项、当前及未来发生项或整个系列。
```
]

**Recommendation for the planner:** promote `RECR-01` and `RECR-02` from the v2 section into a v1 (or v1.1) section and add the traceability rows `| RECR-01 | Phase 7 | Pending |` and `| RECR-02 | Phase 7 | Pending |`. Note that `## Out of Scope` currently contains the row `| 第一版周期事件 | 需要系列、发生项例外及时区规则，安排在专门后续阶段 |` [VERIFIED: .planning/REQUIREMENTS.md:116] — that row should be removed or amended in the same edit, otherwise REQUIREMENTS.md self-contradicts.

| ID | Description | Research Support |
|----|-------------|------------------|
| RECR-01 | 用户可以创建符合明确重复规则的周期事件和周期任务 | Standard Stack (schema + no-new-dep date module), Architecture Patterns 1–3, Code Examples 1–3 |
| RECR-02 | 用户可以编辑或删除单次发生项、当前及未来发生项或整个系列 | Architecture Pattern 4 (atomic series split), Pitfall 2 (`cancelled` status fan-out), Pitfall 6 |

This is an **open item** — the planner should not block on it, but should include a task that reconciles REQUIREMENTS.md and ROADMAP.md.
</phase_requirements>

---

## Summary

This phase adds recurrence to a codebase that is **completely greenfield in three specific dimensions**: it has (a) no scheduler, job queue, or background-work mechanism of any kind, (b) no date/time library at all, and (c) no `cancelled` state in either the Task status enum or the Event model. All three are hard-verified by direct source inspection, not inference: a repo-wide grep for `nestjs/schedule|node-cron|bullmq|@Cron|setInterval|agenda|pg-boss|graphile` across `apps/`, `packages/`, `scripts/`, and `compose.yaml` returns **zero matches**, as does a grep for `date-fns|luxon|dayjs|temporal|Intl.DateTimeFormat|timeZone`. Every date computation currently in the product is hand-rolled `new Date()` arithmetic that runs in the **process's ambient local timezone** (`apps/client/src/features/events/calendar-utils.ts`, `apps/api/src/modules/events/events.service.ts:112-159`). D-10 is therefore not a refinement of an existing timezone layer — it is the introduction of the project's first one.

The good news is that D-01's design makes the timezone problem far smaller than it looks. Because `occurrenceDate` is a plain calendar date and the recurrence walk (daily / selected-weekdays / monthly-same-day / yearly-same-month-day, with D-09 month-end clamping) is pure `(year, month, day)` **integer** arithmetic, the walk itself involves no timezone and no DST at all. Timezone enters at exactly **one** boundary: converting a materialized `occurrenceDate` plus the template's local wall-clock time-of-day into the UTC `timestamptz` stored in `Event.startTime` / `Event.endTime` / `Task.dueDate`. Isolating that single conversion into one pure, unit-testable function is the entire architectural trick of this phase.

The second dominant risk is not date math at all — it is **fan-out of the `cancelled` state**. D-07 proposes reusing `Task.status = 'cancelled'`, but `status` is validated against a hard-coded triple in *three separate places* (an API DTO const, a duplicated const inside the service, and a client form array), and is consumed by filtering logic in the Today view and the task-card status cycle. Adding one enum value touches at least six files, and missing any one of them produces a silently-wrong product (cancelled tasks still counted in "今日待办", or a 400 on every save). This is the single most likely source of escaped defects in this phase, and the plan must enumerate all call sites rather than treat it as a one-line change.

Third, the OpenAPI client is **not actually generated from the OpenAPI document**. `packages/api-client/src/generated/{models,client}.ts` are written from hand-maintained template literals embedded inside `apps/api/src/openapi/generate-openapi.ts` (`modelsSource` at line 9, `clientSource` at line 339). Adding any recurrence field or endpoint requires manually editing those template strings, re-running `pnpm openapi:generate`, and committing — `pnpm openapi:check` fails CI-style on drift. A planner who assumes "the client regenerates itself from decorators" will produce plans whose tasks silently do nothing.

**Primary recommendation:** Implement recurrence as a new `apps/api/src/modules/recurrence/` module containing (1) a **zero-dependency pure date module** (`recurrence-date.ts`) covering the calendar walk plus one `Intl.DateTimeFormat`-based local-wall-time→UTC conversion, unit-tested under `src/**/*.test.ts`; (2) a `RecurrenceMaterializerService` guarded by a PostgreSQL **transaction-level** advisory lock (`pg_try_advisory_xact_lock`) and driven by a plain `setInterval` registered in `OnApplicationBootstrap` — adding **no new npm dependency**; and (3) thin recurrence extensions to the existing `EventsService` / `TasksService` following their exact established shape. Add `cancelled` to the Task status enum only after enumerating all six consumers; add `Event.cancelledAt` as a new nullable `Timestamptz(3)` column.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recurrence rule storage (`RecurrenceRule` table) | Database / Storage | — | D-01 locks a real table with FKs; the project mandates DB-enforced integrity (AGENTS.md `数据完整性`) |
| Calendar walk (freq/interval/byWeekday/month-end clamp) | API / Backend | — | Pure function, must be identical for the immediate-trigger path and the worker path; duplicating it client-side would drift |
| Local-date → UTC instant conversion | API / Backend | — | `timestamptz` is server-owned per AGENTS.md `数据时间`; the client already assumes the server returns absolute instants |
| Rolling materialization of future instances | API / Backend (in-process background provider) | Database (advisory lock) | D-03 watermark + idempotency; no Redis or external queue exists in this project |
| Idempotency / de-duplication of instances | Database / Storage | API / Backend | `(recurrenceRuleId, occurrenceDate)` unique constraint makes double-runs a no-op at the strongest layer |
| Series split atomicity (D-08) | API / Backend | Database (transaction) | `prisma.$transaction` is already the established pattern for multi-record atomicity (SAFE-02) |
| Recurrence rule authoring UI (freq picker, weekday multi-select, end condition) | Browser / Client | — | Follows existing chip-selector patterns in `task-form.tsx` / `label-picker.tsx` |
| "仅此一次 / 此后所有" scope choice | Browser / Client | API / Backend | Client presents the choice; server enforces the semantics — the client must never emulate a split by issuing multiple writes |
| Instance rendering (calendar, task list, Today) | Browser / Client | — | D-02 forbids a separate render path; existing `EventCard` / `TaskCard` consume instances unchanged |
| Scheduling trigger (interval tick) | API / Backend | — | Single Node process; no OS cron, no container orchestrator in this repo |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/common` / `@nestjs/core` | 11.1.28 | Module, provider, lifecycle hooks (`OnApplicationBootstrap`, `OnModuleDestroy`) for the materializer | Already the app framework [VERIFIED: apps/api/package.json:19-20 — verbatim: `"@nestjs/common": "11.1.28"`, `"@nestjs/core": "11.1.28"`] |
| `@prisma/client` + `prisma` | 7.9.1 | `RecurrenceRule` model, migrations, `$transaction`, `$queryRaw` for advisory locks | Already the data layer [VERIFIED: apps/api/package.json:25-26,36 — verbatim: `"@prisma/client": "7.9.1"`, `"@prisma/adapter-pg": "7.9.1"`, `"prisma": "7.9.1"`] |
| `class-validator` / `class-transformer` | 0.15.1 / 0.5.1 | Recurrence DTO validation, **including `@ValidateNested()` + `@Type()` for the nested recurrence object** | Already the validation layer [VERIFIED: apps/api/package.json:28-29 — verbatim: `"class-transformer": "0.5.1"`, `"class-validator": "0.15.1"`] |
| `@nestjs/swagger` | 11.4.6 | `@ApiProperty` / `@ApiPropertyOptional` on new DTOs | Already used on every DTO [VERIFIED: apps/api/package.json:24] |
| Node.js built-in `Intl.DateTimeFormat` | Node 24.18.0 | IANA-timezone-aware local-date extraction (D-10) | **No dependency needed** — verified working in this session (below) |
| PostgreSQL `pg_try_advisory_xact_lock` | PG 18.4 | Prevent duplicate materialization runs if more than one API process is ever run | Zero-dependency; no Redis exists in this project |

**`Intl` timezone capability verified this session** by running against the repo's own Node:

```
$ node -v
v24.18.0
$ node -e "console.log('Temporal:', typeof globalThis.Temporal); ..."
Temporal: undefined
ICU tz test: 2026-08-13
parts: 8/11/2026, GMT-4
```

[VERIFIED: executed `node -v` and `node -e` in the repository root this session] — meaning: (a) `Temporal` is **NOT** available and must not be used; (b) full-ICU `Intl.DateTimeFormat` with `timeZone: 'Asia/Shanghai'` and `timeZoneName: 'shortOffset'` works correctly, including correct DST offset resolution for `America/New_York`.

### Supporting

| Library | Version Policy | Purpose | When to Use |
|---------|----------------|---------|-------------|
| `pg` | 8.22.0 (already installed) | Raw SQL in integration tests, advisory-lock probes | Test fixtures already use it directly [VERIFIED: apps/api/package.json:31; apps/api/test/tasks/tasks.int.test.ts:5 — verbatim: `import { Client } from 'pg';`] |
| `vitest` | 4.1.10 (already installed) | Unit tests for the pure date module; integration tests for endpoints + materializer | Already the API test runner [VERIFIED: apps/api/package.json:38] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `setInterval` in an `OnApplicationBootstrap` provider | `@nestjs/schedule` 6.1.3 (+ transitive `cron` 4.4.0) | The NestJS-blessed scheduler with `@Cron`/`@Interval` decorators and a `SchedulerRegistry` for dynamic control. Legitimacy verdict `OK` (see audit). **Cost:** two new runtime dependencies in a repo whose Phase 1 decision log records "Install only the audited official package pins in Plan 01-02; no substitutions or preview packages" [VERIFIED: .planning/STATE.md:111]. **Benefit is small here** — this phase needs one fixed-period rolling job, not cron expressions. Recommend only if the team wants declarative scheduling for future phases (v2 NOTF-01 reminders would benefit). |
| Hand-rolled `Intl`-based local↔UTC conversion | `luxon` 3.7.2 | Mature IANA-aware `DateTime.fromObject({...}, {zone})`; removes the trickiest ~40 lines. Registry-verified: version 3.7.2, repo `git+https://github.com/moment/luxon.git`, 36,802,716 downloads in the week 2026-08-03→2026-08-09 [VERIFIED: npm registry + `api.npmjs.org/downloads/point/last-week/luxon`, queried this session]. Adds one runtime dep + `@types/luxon`. |
| Hand-rolled `Intl`-based conversion | `date-fns` 4.4.0 + `@date-fns/tz` 1.5.0 | `date-fns` v4 moved timezone support into the separate `@date-fns/tz` package (`TZDate`). Registry-verified: `date-fns` 4.4.0 / 98,305,312 weekly downloads; `@date-fns/tz` 1.5.0 / 34,908,556 weekly downloads, repo `git+https://github.com/date-fns/date-fns.git` [VERIFIED: npm registry, queried this session]. Two deps, and the tree-shaken function-per-import style is a poor fit for a single conversion. |
| Preset-frequency model (D-05) | `rrule` 2.8.1 (`OK` verdict, 2,649,589 weekly downloads) | **Explicitly out of scope** — D-05 forbids full RRULE semantics and CONTEXT.md's `<domain>` lists 完整 RRULE 语义 as 不包含. Listed here only so the planner can reject it deliberately rather than rediscover it. |
| In-process interval | PostgreSQL `pg_cron` extension | Would require a DB extension not present in the pinned `postgres:18.4-alpine3.24` image [VERIFIED: compose.yaml — verbatim: `image: postgres:18.4-alpine3.24`] and would push business logic into SQL. Reject. |
| In-process interval | BullMQ / Redis-backed queue | **No Redis exists anywhere in this project** — `compose.yaml` defines exactly two services, `postgres` and `mailpit` [VERIFIED: compose.yaml, read in full this session]. Adding Redis is infrastructure this project does not run. Reject. |

**Installation (primary recommendation):**

```bash
# No new packages required.
```

**Installation (only if the team accepts the @nestjs/schedule alternative):**

```bash
pnpm --filter api add @nestjs/schedule@6.1.3
```

---

## Package Legitimacy Audit

Run against the `gsd-tools query package-legitimacy check --ecosystem npm` seam this session, cross-checked with `npm view` and `api.npmjs.org` download endpoints.

| Package | Registry | Age (first publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|---------------------|-----------|-------------|---------|-------------|
| `@nestjs/schedule` | npm | 2019-12-14 (~6.7 yrs) | 4,395,468/wk | github.com/nestjs/schedule | **OK** | Approved *if* the team chooses the scheduler alternative; not in the primary recommendation |
| `cron` (transitive of above) | npm | last publish 2025-12-09 | 6,635,609/wk | github.com/kelektiv/node-cron | **OK** | Approved as transitive only |
| `luxon` | npm | v3.7.2 | 36,802,716/wk | github.com/moment/luxon | **OK** (re-verified manually; seam returned `SUS` on a transient null-signal response) | Alternative only — not recommended |
| `date-fns` | npm | v4.4.0 | 98,305,312/wk | github.com/date-fns/date-fns | **OK** (re-verified manually; seam returned `SUS` on transient nulls) | Alternative only — not recommended |
| `@date-fns/tz` | npm | 2026-05-21 | 34,908,556/wk | github.com/date-fns/date-fns | **OK** | Alternative only — not recommended |
| `rrule` | npm | 2023-11-10 | 2,649,589/wk | github.com/jakubroztocil/rrule | **OK** | **Out of scope** per D-05 — do not use |

**Postinstall audit:** `npm view @nestjs/schedule scripts.postinstall` and `npm view cron scripts.postinstall` both return empty; the seam reports `"postinstall": null` for every package above. No suspicious install-time behavior. [VERIFIED: `npm view` + seam output, this session]

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none after manual re-verification. The seam's initial `SUS` verdicts for `luxon` and `date-fns` carried `"exists": null` with reasons `unknown-age`, `unknown-downloads`, `no-repository` — the signature of a transient registry-metadata fetch failure, not a real risk signal. Both were re-verified directly against the npm registry and `api.npmjs.org`, returning real versions, real repos, and 8-figure weekly download counts.

> **Note for the planner:** the primary recommendation installs **nothing**, so no `checkpoint:human-verify` install gate is required. If the plan instead adopts `@nestjs/schedule`, insert one `checkpoint:human-verify` task before the install, consistent with this repo's Phase 1 supply-chain precedent ([VERIFIED: .planning/STATE.md:111]).

---

## Project Constraints (from AGENTS.md)

This repo has **no `CLAUDE.md`** at the root and **no `.claude/skills/` or `.agents/skills/` directory** [VERIFIED: `ls` of repo root and skill paths this session; AGENTS.md:135 states verbatim: `No project skills found.`]. The equivalent authority document is `AGENTS.md`. Extracted actionable directives that constrain this phase:

| # | Directive | Source | Impact on Phase 7 |
|---|-----------|--------|-------------------|
| C-01 | 服务端技术栈：NestJS、Fastify adapter、TypeScript 严格模式 | AGENTS.md:17 | Materializer must be a Nest provider, not a detached script |
| C-02 | API：REST、OpenAPI、`/api/v1` — 移动商店中的旧客户端必须能与升级后的服务端共存 | AGENTS.md:18 | Recurrence fields must be **additive and optional** on existing DTOs; no breaking changes to `CreateEventDto` / `CreateTaskDto` |
| C-03 | 数据层：PostgreSQL、稳定版 Prisma ORM、Prisma Migrate — 使用数据库约束和事务保证完整性 | AGENTS.md:19 | The `(recurrenceRuleId, occurrenceDate)` uniqueness must be a real DB constraint, not app-level checking |
| C-04 | 数据时间：时间点使用 PostgreSQL `timestamptz`，服务端按 UTC 处理 | AGENTS.md:22 | `Event.startTime` / `Task.dueDate` stay `Timestamptz(3)`; `RecurrenceRule.startsOn`/`endsOn` and `occurrenceDate` are the *only* `@db.Date` columns |
| C-05 | 数据完整性：使用真实外键、唯一约束、检查约束与事务 | AGENTS.md:23 | D-06 mutual exclusion (`endsOn` XOR `count`) should be a PostgreSQL `CHECK` constraint, not just DTO validation |
| C-06 | Prisma models as client DTOs → **avoid**; use OpenAPI-generated client models | AGENTS.md:91 | Never leak `RecurrenceRule` Prisma types to the client; define `RecurrenceDto` explicitly |
| C-07 | Prisma Next/Early Access features → **avoid**; use stable Prisma 7.x APIs | AGENTS.md:90 | No preview features for the new model |
| C-08 | GSD Workflow Enforcement — start work through a GSD command before file-changing tools | AGENTS.md:140-150 | Execution must go through `/gsd-execute-phase` |
| C-09 | 迁移：Prisma Migrate，commit migrations and review generated SQL | AGENTS.md:19, 67 | See Migration Workflow below |

---

## Migration Workflow (answers research question 6)

**Migrations in this repo are hand-authored SQL, hand-reviewed, and applied with `migrate deploy` — never with `migrate dev` in the test/CI path.**

Evidence:

- Directory listing shows **two coexisting naming conventions** [VERIFIED: `ls apps/api/prisma/migrations` this session — verbatim entries: `0001_auth_foundation`, `0002_household_core`, `0003_household_invitations`, `0004_events`, `0005_tasks`, `20260805075417_add_notes_labels`, `20260812000000_task_multiple_assignees`, `migration_lock.toml`]. Phases 1–4 used a hand-numbered `NNNN_snake_case` scheme; Phases 5 and the multi-assignee change used Prisma's `YYYYMMDDHHMMSS_snake_case` timestamp scheme.
- The most recent migration is unmistakably hand-written — it contains a prose comment and a hand-ordered data backfill interleaved between DDL statements [VERIFIED: apps/api/prisma/migrations/20260812000000_task_multiple_assignees/migration.sql — verbatim excerpt:
  ```sql
  -- Migrate existing single-assignee data into the new join table before the
  -- column is dropped, so tasks that already had an assignee keep it.
  INSERT INTO "task_assignees" ("task_id", "user_id")
  SELECT "id", "assignee_id" FROM "tasks" WHERE "assignee_id" IS NOT NULL;
  ```
  ]. `prisma migrate dev` does not emit comments like this or order a backfill before `DropColumn`. Note also its timestamp is `20260812000000` — a round zero-padded value, i.e. hand-typed, not clock-generated.
- Integration test setup applies migrations with `deploy`, and does so from the **repository root** via a pnpm filter [VERIFIED: apps/api/test/setup-integration.ts:58 — verbatim: `run('pnpm', ['--filter', 'api', 'exec', 'prisma', 'migrate', 'deploy']);`].
- `prisma.config.ts` pins the migrations path and a guarded loopback default URL [VERIFIED: apps/api/prisma.config.ts:13-20 — verbatim: `schema: 'prisma/schema.prisma'`, `migrations: { path: 'prisma/migrations' }`].
- **There is no CI configuration in this repo** — `ls -a .github` returns "no .github" [VERIFIED: `ls -a .github` this session]. Gating is therefore local/manual: `pnpm openapi:check`, `pnpm test:integration`, `scripts/check-required-tests.ps1`, `scripts/assert-red.ps1`.
- `apps/api/src/generated/prisma/` is **gitignored** [VERIFIED: .gitignore final line — verbatim: `apps/api/src/generated/prisma/`; confirmed with `git ls-files apps/api/src/generated` → 0 tracked files]. So the Prisma client is regenerated locally; `pretest` runs `prisma generate` [VERIFIED: apps/api/package.json:12 — verbatim: `"pretest": "prisma generate"`].

**Planner guidance:** author the Phase 7 migration by hand as `apps/api/prisma/migrations/YYYYMMDDHHMMSS_recurrence_rules/migration.sql` (follow the newer timestamp convention used by the two most recent migrations), mirroring the exact DDL idioms already present: `UUID NOT NULL DEFAULT gen_random_uuid()`, `TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`, named `-- CreateTable` / `-- CreateIndex` / `-- AddForeignKey` section comments, and snake_case table/column names with PascalCase index names (e.g. `Task_household_status_idx`).

---

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────────────────────────┐
   Mobile / Web client   │  Expo app (apps/client)                  │
   authors a rule        │  EventForm / TaskForm + <RecurrencePicker>│
                         └───────────────┬──────────────────────────┘
                                         │ POST/PUT .../events | .../tasks
                                         │ body: { ...fields, recurrence?: {...} }
                                         ▼
                    ┌────────────────────────────────────────────────┐
                    │ Fastify + Nest global ValidationPipe            │
                    │  whitelist:true, forbidNonWhitelisted:true      │
                    │  ⚠ nested `recurrence` needs @ValidateNested    │
                    └───────────────┬────────────────────────────────┘
                                    ▼
             ┌───────────────────────────────────────────────────────┐
             │ EventsService / TasksService  (existing shape)         │
             │  resolveActorRole → canMutate → validate → persist     │
             └──────────┬───────────────────────────┬────────────────┘
                        │ recurrence present         │ recurrence absent
                        ▼                            ▼
     ┌──────────────────────────────────┐   ┌────────────────────────┐
     │ RecurrenceService                │   │ plain one-off row       │
     │  • create/replace RecurrenceRule │   │ recurrenceRuleId = NULL │
     │  • D-08 series split (1 txn)     │   │  → unchanged behaviour  │
     │  • immediate materialize (D-03)  │   └────────────────────────┘
     └──────────────┬───────────────────┘
                    │ calls
                    ▼
     ┌────────────────────────────────────────────────────────────┐
     │ RecurrenceMaterializerService                              │
     │  1. acquire pg_try_advisory_xact_lock(<const>, ruleIdHash) │
     │  2. read rule + materializedThrough (watermark)            │
     │  3. walk occurrences  ── pure ──► recurrence-date.ts       │
     │       nextOccurrence(freq, interval, byWeekday, prev)      │
     │       clampToMonthEnd()            ← D-09                   │
     │  4. for each date: localDateTimeToInstant(date, hh:mm, tz) │
     │       ← the ONLY timezone-aware step  (D-10)               │
     │  5. createMany(skipDuplicates) on (ruleId, occurrenceDate) │
     │  6. advance materializedThrough                             │
     │  7. copy TaskAssignee / TaskLabel / EventLabel per instance │
     └──────────────┬─────────────────────────────┬───────────────┘
                    │                              │
      triggered by  │                              │ writes
   ┌────────────────┴─────────────┐                ▼
   │ (a) rule create/edit  ← D-03 │   ┌────────────────────────────────┐
   │ (b) interval tick, N hours   │   │ PostgreSQL 18                  │
   │     setInterval registered   │   │  recurrence_rules              │
   │     in OnApplicationBootstrap│   │  events   (+recurrence_rule_id,│
   └──────────────────────────────┘   │            occurrence_date,    │
                                      │            cancelled_at)       │
                                      │  tasks    (+recurrence_rule_id,│
                                      │            occurrence_date)    │
                                      │  UNIQUE(rule_id, occ_date) ×2  │
                                      └───────────────┬────────────────┘
                                                      │ read path UNCHANGED (D-02)
                                                      ▼
                          GET .../events?startDate&endDate   → EventCard
                          GET .../tasks?status&priority&…    → TaskCard / Today
```

### Recommended Project Structure

```
apps/api/src/modules/recurrence/
├── recurrence.module.ts              # mirrors events.module.ts exactly (controllers+providers)
├── recurrence.service.ts             # rule CRUD, D-08 series split (transactional)
├── recurrence-materializer.service.ts# watermark walk, advisory lock, createMany
├── recurrence-scheduler.ts           # OnApplicationBootstrap setInterval / OnModuleDestroy clear
├── recurrence-date.ts                # PURE: no Nest, no Prisma, no I/O
├── recurrence-date.test.ts           # picked up by the `unit` vitest project
└── dto/
    └── recurrence.dto.ts             # RecurrenceDto, RECURRENCE_FREQUENCIES, WEEKDAYS,
                                      # RecurrenceResponseDto, SeriesScope enum

apps/api/test/recurrence/
├── recurrence-rules.int.test.ts      # create/edit/split via HTTP inject
└── materializer.int.test.ts          # watermark idempotency, month-end, DST

apps/client/src/features/recurrence/
├── recurrence-picker.tsx             # freq chips + weekday multi-select + end-condition
├── recurrence-summary.tsx            # "每周二、四、六" human-readable line for cards
├── series-scope-dialog.tsx           # "仅此一次 / 此后所有" Modal
└── __tests__/recurrence-picker-test.tsx   # NOTE the `-test.tsx` suffix (not `.test.`)
```

### Pattern 1: Nest module shape — copy `events.module.ts` verbatim

The project's module convention is minimal and consistent. `EventsModule` is the exact template to follow, including the mandatory `.js` extension on relative imports (NodeNext ESM):

```typescript
// Source: apps/api/src/modules/events/events.module.ts (read in full this session)
import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
```

Register in `AppModule` alongside the other plain modules — note that only `Auth`, `Users`, and `Households` use the `.register(environment)` dynamic-module form; `Events`, `Tasks`, `Notes`, and `Labels` are registered as plain classes [VERIFIED: apps/api/src/app.module.ts:33-39 — verbatim:
```typescript
        AuthModule.register(environment),
        UsersModule.register(environment),
        HouseholdsModule.register(environment),
        EventsModule,
        TasksModule,
        NotesModule,
        LabelsModule,
```
]. `RecurrenceModule` should be a plain module unless the interval period must come from `process.env`, in which case use `.register(environment)`.

**When to use:** every new API module in this repo.

### Pattern 2: Service authorization preamble — identical in both target services

`EventsService` and `TasksService` carry a byte-for-byte identical authorization pair. Any new recurrence endpoint must reproduce it:

```typescript
// Source: apps/api/src/modules/events/events.service.ts:40-57
//   (character-identical copy at apps/api/src/modules/tasks/tasks.service.ts:53-69)
private async resolveActorRole(
  actorId: string,
  householdId: string,
): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | null> {
  const membership = await this.prisma.membership.findUnique({
    where: { userId_householdId: { userId: actorId, householdId } },
    include: { household: { select: { ownerMembershipId: true } } },
  });
  if (membership === null) return null;
  if (membership.id === membership.household.ownerMembershipId) return 'OWNER';
  return membership.role as 'ADMIN' | 'MEMBER';
}

private canMutate(actorRole: 'OWNER' | 'ADMIN' | 'MEMBER', eventCreatorId: string, actorId: string): boolean {
  if (actorRole === 'MEMBER') return eventCreatorId === actorId;
  return true; // OWNER or ADMIN
}
```

Every mutating method begins with the same three lines, and a non-member is deliberately given `404 HOUSEHOLD_NOT_FOUND` (not 403) so household existence is not leaked — this is the SAFE-01 boundary and must be preserved:

```typescript
// Source: apps/api/src/modules/events/events.service.ts:66-67
const role = await this.resolveActorRole(actorId, householdId);
if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
```

**When to use:** every recurrence endpoint. **Anti-pattern:** returning 403 for a non-member.

### Pattern 3: Structured error envelope — exact literal codes

Errors are thrown as structured objects and normalized by a global filter. The literal codes in use in the two target services are, verbatim [VERIFIED: apps/api/src/modules/events/events.service.ts:67,72,83,91,174,194 and apps/api/src/modules/tasks/tasks.service.ts:78,93,99,116,179,200,227,238,260]:

```
'HOUSEHOLD_NOT_FOUND'  'EVENT_NOT_FOUND'  'TASK_NOT_FOUND'
'VALIDATION_FAILED'    'FORBIDDEN'
```

The shape, verbatim from source:

```typescript
// Source: apps/api/src/modules/tasks/tasks.service.ts:97-102
throw new BadRequestException({
  code: 'VALIDATION_FAILED',
  message: 'Request validation failed.',
  details: [{ field: 'title', codes: ['length'], message: `Title must be ${TITLE_MIN}–${TITLE_MAX} characters.` }],
});
```

The global filter reads `code`, `message`, `details`, `retryAfterSeconds` off the exception response and wraps them as `{ error: {...}, requestId }` [VERIFIED: apps/api/src/main.ts:137-175].

New codes this phase will need (planner's choice, but keep the SCREAMING_SNAKE convention): `RECURRENCE_RULE_NOT_FOUND`, and `VALIDATION_FAILED` with `codes: ['ends_on_and_count_mutually_exclusive']` for D-06.

### Pattern 4: Transactional multi-record mutation (required for D-08)

The project already establishes `prisma.$transaction([...])` with an array of operations for atomic multi-record work:

```typescript
// Source: apps/api/src/modules/tasks/tasks.service.ts:269-283
await this.prisma.$transaction([
  // Remove assignees that are no longer selected
  this.prisma.taskAssignee.deleteMany({
    where: { taskId, userId: { notIn: assigneeIds } },
  }),
  // Upsert the currently selected assignees
  ...assigneeIds.map((userId) =>
    this.prisma.taskAssignee.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId },
      update: {},
    }),
  ),
]);
```

**For D-08 the array form is insufficient** — the split needs the *id* of the newly created rule before it can re-point rows, so use the **interactive** callback form `await this.prisma.$transaction(async (tx) => { ... })`. This is the only place in the phase where the interactive form is required, and it is precisely the "不能出现旧规则已终止、新规则未建成的中间态" guarantee.

**When to use:** D-08 series split; the immediate-materialize-on-create path should be a *separate* transaction so a slow materialization does not hold a write lock across the user's request.

### Pattern 5: DTO shape — `class-validator` + Swagger decorators + exported const tuples

The task DTO establishes the exact enum idiom to copy for `freq` and `byWeekday`:

```typescript
// Source: apps/api/src/modules/tasks/dto/create-task.dto.ts:5-9,23-27
export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

  @ApiPropertyOptional({ description: '任务状态', enum: TASK_STATUSES, default: 'pending' })
  @IsOptional()
  @IsString()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;
```

Descriptions are written in **Chinese** in the tasks/labels DTOs and in **English** in the events DTO [VERIFIED: create-task.dto.ts:12 verbatim `description: '任务标题'` vs create-event.dto.ts:6 verbatim `description: 'Event title'`]. Prefer Chinese for new recurrence DTOs to match the newer (tasks/labels/notes) convention.

**Critical:** the global `ValidationPipe` runs with `whitelist: true` and `forbidNonWhitelisted: true` [VERIFIED: apps/api/src/main.ts:220-231 — verbatim: `forbidNonWhitelisted: true,` / `forbidUnknownValues: true,` / `transform: true,` / `whitelist: true,`]. A nested `recurrence` object therefore **must** carry both `@ValidateNested()` and `@Type(() => RecurrenceDto)`; without `@Type`, `class-transformer` leaves it a plain object, `class-validator` cannot descend into it, and the whitelist strips its properties — the recurrence silently vanishes with a 201 success response. See Pitfall 1.

### Pattern 6: Controller shape — nested household route + `operationId`

```typescript
// Source: apps/api/src/modules/events/events.controller.ts:33-54
class HouseholdIdParam {
  @IsUUID('4')
  householdId!: string;
}

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ operationId: 'createEvent' })
  @ApiCreatedResponse({ type: EventResponseDto })
  create(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam,
    @Body() input: CreateEventDto,
  ): Promise<EventResponseDto> {
    return this.eventsService.create(request.auth.sub, params.householdId, input);
  }
}
```

Note the `labels` module demonstrates that **multiple controllers can live in one file** for sub-resource routes [VERIFIED: apps/api/src/modules/labels/labels.controller.ts:38,91,122 — verbatim controller decorators: `@Controller('households/:householdId/labels')`, `@Controller('households/:householdId/events/:eventId/labels')`, `@Controller('households/:householdId/tasks/:taskId/labels')`]. This is the precedent for adding e.g. `@Controller('households/:householdId/events/:eventId/series')` in the recurrence module.

The API prefix `api/v1` is applied globally, not per-controller [VERIFIED: apps/api/src/main.ts:26,207 — verbatim: `const API_PREFIX = 'api/v1';` and `app.setGlobalPrefix(API_PREFIX);`].

### Pattern 7: Client form + chip multi-select (the weekday picker template)

The weekday multi-select in the recurrence picker should copy the assignee chip pattern verbatim in structure — it is already a toggle-a-set-of-chips control with correct a11y roles:

```tsx
// Source: apps/client/src/features/tasks/task-form.tsx:213-239 (assignee multi-select)
{members.map((m) => {
  const selected = form.assigneeIds.includes(m.userId);
  return (
    <Pressable
      key={m.userId}
      onPress={() =>
        updateField(
          'assigneeIds',
          selected
            ? form.assigneeIds.filter((id) => id !== m.userId)
            : [...form.assigneeIds, m.userId],
        )
      }
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [chipStyle(selected), { opacity: pressed ? 0.7 : 1 }]}
      accessibilityLabel={`分配给 ${m.displayName}`}
    >
      <Text variant="bodySm" color={chipTextColor(selected)}>{m.displayName}</Text>
    </Pressable>
  );
})}
```

The single-select frequency picker copies the status/priority chips from the same file (lines 154-193), which use only `accessibilityLabel` without a role. **Recommendation:** use `accessibilityRole="radio"` + `accessibilityState={{ checked }}` for the frequency picker — the existing status chips are the weaker precedent, and CONTEXT.md requires "保持移动优先与现有可访问性标准".

Forms are **plain `useState` + a `updateField` callback**, not React Hook Form, despite `react-hook-form` 7.83.0 being installed [VERIFIED: apps/client/src/features/events/event-form.tsx:43-65 and apps/client/src/features/tasks/task-form.tsx:60-83 both use `useState<...>` + `useCallback` `updateField`; `react-hook-form` appears in apps/client/package.json:27 but is not imported by either form]. **Follow the existing `useState` pattern** — do not introduce RHF into these two forms in this phase.

Both forms share the identical `inputStyle` / `chipStyle` / cancel+submit button block; the recurrence picker must be inserted as another `<Stack gap={1}>` section inside the existing `<Stack gap={4}>` body, between "Due date"/"End" and "Description".

### Pattern 8: Modal for the "仅此一次 / 此后所有" scope choice

The project's only Modal precedent is `HouseholdSwitcher` [VERIFIED: apps/client/src/ui/household-components.tsx:24 imports `Modal`, used at lines 425 and 450]. It carries a documented React-Native-Web caveat worth reusing:

```tsx
// Source: apps/client/src/ui/household-components.tsx:331 (comment verbatim)
// React Native Web keeps a closed Modal subtree in the DOM. Unmounting it
```

There is also a non-Modal focus-trap precedent using `accessibilityViewIsModal` [VERIFIED: apps/client/src/features/auth/logout-action.tsx:65]. Either is acceptable; `HouseholdSwitcher` is the closer analog for a bottom-sheet-style choice.

### Anti-Patterns to Avoid

- **Virtual expansion of occurrences at read time.** Explicitly forbidden by D-01/D-02. Every occurrence is a real row; `GET /events` and `GET /tasks` must not change shape.
- **A second rendering path for "is recurring".** D-02 forbids it. `EventCard` / `TaskCard` render an instance identically; at most, add a small recurrence badge driven by `recurrenceRuleId !== null`.
- **Copying the calendar walk into the client.** The client must never compute future occurrences; it displays what the server materialized. A client-side preview string ("每周二、四、六") is fine — that is formatting, not date arithmetic.
- **Doing day arithmetic on UTC timestamps.** Explicitly named in D-10. Note the existing code already does exactly this in the events list filter (`startUtc.setUTCDate(startUtc.getUTCDate() - 1)`, apps/api/src/modules/events/events.service.ts:132) with an apologetic 6-line comment — do not extend that approach into recurrence.
- **Session-level `pg_advisory_lock` with a pooled connection.** The Prisma client runs on `@prisma/adapter-pg` with a connection pool [VERIFIED: apps/api/src/infrastructure/prisma/prisma.service.ts:15 — verbatim: `const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() });`]. A session-level advisory lock taken on a pooled connection can be silently held or released on the wrong connection. Use **`pg_try_advisory_xact_lock`** inside `$transaction`, which auto-releases at commit/rollback.
- **Holding the materialization transaction across the user's HTTP request.** The immediate-trigger (D-03) should be awaited but kept as its own short transaction, or fired after the rule-write transaction commits — mirroring the established precedent that side effects run post-commit [VERIFIED: .planning/STATE.md:145 — verbatim: `Start verification mail delivery only after commit and keep provider latency outside the generic 202 response path.`].

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| De-duplicating generated instances | An app-level "does this occurrence already exist?" `findFirst` before each insert | A real `@@unique([recurrenceRuleId, occurrenceDate])` constraint + `createMany({ skipDuplicates: true })` | Check-then-insert races under concurrent immediate-trigger + interval-tick. C-05 mandates DB constraints. The unique index also serves the generator's own lookup query (satisfies the CONTEXT.md discretion item about extra indexes). |
| Preventing duplicate scheduler runs | A `worker_locks` table with your own lease/heartbeat/expiry logic | `SELECT pg_try_advisory_xact_lock($1, $2)` via `prisma.$queryRaw` inside the materialization transaction | Lease tables need expiry, clock-skew handling, and crash recovery. Advisory locks are released automatically by the database when the transaction ends — including on process crash. [CITED: https://kerkour.com/postgresql-leader-election-advisory-lock, https://jeremydmiller.com/2020/05/05/using-postgresql-advisory-locks-for-leader-election/] |
| IANA timezone offset lookup | A hard-coded offset table, or `+08:00` string concatenation | `Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'shortOffset' })` / `.formatToParts()` | Offsets change with DST *and* with political decisions. Node 24 ships full ICU with the current tz database — verified working this session. |
| Mutual exclusion of `endsOn` and `count` (D-06) | Only a DTO-level `@ValidateIf` | DTO validation **plus** a PostgreSQL `CHECK` constraint | C-05 mandates check constraints; the materializer must be safe against rows written by future code paths or by hand. Precedent: Phase 1 used DB CHECK constraints for exactly this reason [VERIFIED: .planning/STATE.md:133 — verbatim: `...binding pending proof validity to active verification state with database CHECK constraints.`] |
| Month-end clamping (D-09) | Incrementing a JS `Date`'s month and hoping | Explicit `min(day, daysInMonth(y, m))` on integer `(y, m, d)` triples | `new Date(2026, 0, 31)` then `setMonth(1)` yields **March 3**, not Feb 28 — JS silently rolls over. This is the exact bug D-09 forbids. |
| Copying label/assignee associations to each instance | Ad-hoc per-model copy loops scattered in the materializer | One `materializeAssociations(tx, sourceId, newIds)` helper per relation, called from one place | Three join tables are involved (`TaskAssignee`, `TaskLabel`, `EventLabel` [VERIFIED: apps/api/prisma/schema.prisma:221-253]); scattering the copy guarantees one gets forgotten. CONTEXT.md `<canonical_refs>` recommends copying so each instance stays independently re-assignable. |

**Key insight:** in this domain the *generator* is the easy part and the *invariants* are the hard part. Every safety property this phase needs (no duplicates, no double-runs, no impossible rule shapes) has a one-line database-level expression and a hundred-line application-level equivalent that is subtly wrong under concurrency. Push all of them to PostgreSQL — which is also exactly what AGENTS.md C-03/C-05 already require.

---

## Common Pitfalls

### Pitfall 1: The nested `recurrence` object is silently stripped by the global ValidationPipe

**What goes wrong:** you add `recurrence?: RecurrenceDto` to `CreateEventDto` with `@IsOptional() @IsObject()`. The request returns `201 Created`, the event is created, and no recurrence rule exists. No error anywhere.
**Why it happens:** the global pipe runs `whitelist: true, forbidNonWhitelisted: true, transform: true` [VERIFIED: apps/api/src/main.ts:220-231]. `class-transformer` will not instantiate the nested class unless told to; `class-validator` then has no metadata for the nested properties, and whitelisting removes them.
**How to avoid:** always pair `@ValidateNested()` with `@Type(() => RecurrenceDto)` from `class-transformer` (already a dependency at 0.5.1). Note that **no existing DTO in this repo has a nested object** — every DTO field today is a primitive or a `string[]` — so there is no in-repo precedent to copy. This is genuinely new ground for the codebase.
**Warning signs:** an integration test that asserts the created event's `recurrenceRuleId` is non-null fails while the endpoint returns 201. Write that assertion first.

### Pitfall 2: Adding `cancelled` to Task status touches six files, not one

**What goes wrong:** D-07 says to set `status = 'cancelled'`. You add it to one list, the API 400s (or the Today view keeps counting cancelled chores as 待办).
**Why it happens:** the status triple is duplicated across the API and the client, and is *consumed* by list-partitioning logic. All confirmed sites:

1. `apps/api/src/modules/tasks/dto/create-task.dto.ts:5` — verbatim: `export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;`
2. `apps/api/src/modules/tasks/tasks.service.ts:14` — verbatim: `const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed'];` (a **duplicate** of the DTO const, not an import) — enforced at tasks.service.ts:224 verbatim: `if (!VALID_STATUSES.includes(input.status as TaskStatus)) {`
3. `apps/client/src/features/tasks/task-form.tsx:10-14` — verbatim:
   ```typescript
   const STATUSES = [
     { value: 'pending', label: '待办' },
     { value: 'in_progress', label: '进行中' },
     { value: 'completed', label: '已完成' },
   ] as const;
   ```
4. `apps/client/app/(protected)/households/[id]/today.tsx:77` — verbatim: `if (task.status === 'completed') continue;` — a cancelled task would fall through into 今日待办
5. `apps/client/app/(protected)/households/[id]/today.tsx:159-162` — the status cycle, verbatim:
   ```typescript
   const nextStatus =
     task.status === 'pending' ? 'in_progress'
       : task.status === 'in_progress' ? 'completed'
       : 'pending';
   ```
   — tapping a cancelled task's status control would resurrect it as `pending`
6. `apps/api/src/openapi/generate-openapi.ts` — `CreateTaskDto.status` / `TaskResponseDto.status` are typed `string` in the hand-maintained template (line ~250), so no type break, but the generated file must still be regenerated and committed

Also note `apps/client/src/features/tasks/task-card.tsx` and `task-utils.ts` (`isOverdue` / `isApproachingDeadline`) which likely need a cancelled guard.

**How to avoid:** make step 1 of the plan "unify the status enum" — have `tasks.service.ts` import `TASK_STATUSES` from the DTO instead of redeclaring `VALID_STATUSES`, then add `'cancelled'` in exactly one place server-side. Add an explicit task for each client consumer.
**Warning signs:** an integration test that PUTs `status: 'cancelled'` returns 400; a Today-view unit test that renders a cancelled task in 今日待办.

### Pitfall 3: `Event` has no cancellation column and the list filter ignores one

**What goes wrong:** D-07 says "给 Event 加 `cancelledAt`", which is a new nullable `Timestamptz(3)` column — but adding the column alone does nothing. `EventsService.list` builds its `where` clause from `householdId` and a `startTime` range only [VERIFIED: apps/api/src/modules/events/events.service.ts:121-144], so cancelled occurrences continue to appear on the calendar and in the Today view.
**Why it happens:** the read path was written before any soft-delete concept existed.
**How to avoid:** add `cancelledAt: null` to the `where` in `list()` **and** decide explicitly whether `getById` returns a cancelled event (probably yes, so a deep link still resolves). Cover both with integration assertions.
**Warning signs:** a cancelled occurrence still counted in `total` in `EventListResponseDto`.

### Pitfall 4: The OpenAPI "generator" is a hand-maintained template literal

**What goes wrong:** you add `@ApiProperty()` decorators to the new DTOs, run `pnpm openapi:generate`, and the client package is unchanged — so `sessionApiClient.createEvent(...)` still has no `recurrence` field and the client cannot compile against it.
**Why it happens:** `packages/api-client/src/generated/models.ts` and `client.ts` are produced from two enormous string constants inside the generator [VERIFIED: apps/api/src/openapi/generate-openapi.ts:9 — verbatim: `const modelsSource = \`// Generated from openapi.json. Do not edit.` and line 339 — verbatim: `const clientSource = \`// Generated from openapi.json. Do not edit.`]. The decorators only affect `openapi.json` and a set of assertion guards; the TypeScript client is written by hand inside the generator script.
**How to avoid:** the plan must include an explicit task "edit `modelsSource` and `clientSource` in `apps/api/src/openapi/generate-openapi.ts`" — not merely "regenerate the client". Then run `pnpm openapi:generate` and commit `packages/api-client/`. `pnpm openapi:check` regenerates and fails on any diff or untracked file [VERIFIED: scripts/check-openapi-drift.mjs:26-37].
**Warning signs:** `pnpm --filter client typecheck` reports that `recurrence` does not exist on `CreateEventDto`.

### Pitfall 5: JS `Date` month arithmetic silently overflows (the D-09 trap)

**What goes wrong:** `const d = new Date(2026, 0, 31); d.setMonth(d.getMonth() + 1);` → **2026-03-03**, not 2026-02-28. The February occurrence is not clamped; it is *moved into March*, so February silently has no occurrence and March has two.
**Why it happens:** `Date` normalizes out-of-range day-of-month by rolling forward.
**How to avoid:** never call `setMonth`/`setDate` for the recurrence walk. Work on `{ year, month, day }` integer triples and clamp explicitly: `day = Math.min(anchorDay, daysInMonth(year, month))`. Only convert to a `Date`/instant at the final materialization step.
**Warning signs:** a rule anchored on the 29th/30th/31st produces an occurrence count that does not match the month count. Test anchors 29, 30, 31 across a leap year (2028) and a non-leap year (2027).

### Pitfall 6: The D-08 split leaves an orphaned half-state if not interactive-transactional

**What goes wrong:** the old rule's `endsOn` is written, then the new rule's insert fails (validation, constraint, connection blip). The series is now permanently truncated with nothing continuing it.
**Why it happens:** the array form of `$transaction` used elsewhere in the codebase cannot express "insert, then use the returned id" — so it is tempting to do three sequential awaits.
**How to avoid:** use `await this.prisma.$transaction(async (tx) => { ... })` and perform all four steps inside it: (1) set old `endsOn` = occurrenceDate − 1 day, (2) create the new rule, (3) delete not-yet-occurred instances of the old rule from `occurrenceDate` forward, (4) return the new rule id. Materialize the new rule *after* the transaction commits.
**Warning signs:** an integration test that forces a failure on step 2 and then asserts the old rule's `endsOn` is unchanged.

### Pitfall 7: `exactOptionalPropertyTypes: true` makes `field?: string` reject `undefined`

**What goes wrong:** `data.recurrence = maybeUndefined;` fails to compile with a confusing message, or a spread like `{ ...base, endsOn: rule.endsOn ?? undefined }` is rejected.
**Why it happens:** the shared tsconfig sets `exactOptionalPropertyTypes: true` along with `noUncheckedIndexedAccess: true`, `noUnusedLocals`, `noUnusedParameters`, and `strict` [VERIFIED: tsconfig.base.json:6,12,13,14,16 — verbatim: `"exactOptionalPropertyTypes": true,`, `"noUncheckedIndexedAccess": true,`, `"noUnusedLocals": true,`, `"noUnusedParameters": true,`, `"strict": true`].
**How to avoid:** the codebase's established workaround is conditional spreading — e.g. `...(signal === undefined ? {} : { signal })` [VERIFIED: apps/api/src/openapi/generate-openapi.ts client template, repeated ~20×] and `...(details === undefined ? {} : { details })` [VERIFIED: apps/api/src/main.ts:168]. Copy that idiom.
**Warning signs:** `pnpm --filter api typecheck` errors mentioning "not assignable ... with `exactOptionalPropertyTypes: true`".

### Pitfall 8: `noUncheckedIndexedAccess` makes every array index `T | undefined`

**What goes wrong:** `const [y, m, d] = iso.split('-').map(Number);` gives `y: number | undefined`, which then poisons every arithmetic expression in the date module.
**Why it happens:** `noUncheckedIndexedAccess: true` [VERIFIED: tsconfig.base.json:12].
**How to avoid:** the codebase's precedent is non-null assertion at the destructure site — verbatim from `apps/client/src/ui/date-field.tsx:16`: `const date = new Date(y!, m! - 1, d!);` and from `apps/api/test/setup-integration.ts:33`: `const major = Math.floor(result.rows[0]!.version / 10_000);`. Prefer an explicit parse-and-validate function in the new pure date module (it returns a validated triple), which is cleaner than `!` and is directly unit-testable.

### Pitfall 9: The materializer runs during integration tests and pollutes fixtures

**What goes wrong:** every integration test calls `createApplication(...)` followed by `app.init()` [VERIFIED: apps/api/test/tasks/tasks.int.test.ts:108-116]. If the materializer registers a `setInterval` in `OnApplicationBootstrap`, it fires during unrelated test files, mutates the shared database, and leaks a timer that keeps Vitest's process alive.
**Why it happens:** `fileParallelism: false` for the integration project means tests share one database serially [VERIFIED: apps/api/vitest.config.ts:22 — verbatim: `fileParallelism: false,`], so cross-test pollution is real.
**How to avoid:** gate interval registration on `NODE_ENV !== 'test'` (or an explicit `RECURRENCE_WORKER_ENABLED` env flag), keep the run method public so tests invoke it deterministically, and always `clearInterval` in `OnModuleDestroy` — `afterAll` already calls `await app?.close()` [VERIFIED: apps/api/test/tasks/tasks.int.test.ts:118-120]. There is direct precedent for env-gated test behavior [VERIFIED: apps/api/src/app.module.ts:16-17 — verbatim: `const bypassE2eRateLimits = environment.NODE_ENV === 'test' && environment.E2E_DISABLE_RATE_LIMITS === 'true';`].
**Warning signs:** Vitest hangs after the last test; unrelated test files start failing with unexpected row counts.

### Pitfall 10: `occurrenceDate` typed as `Timestamptz(3)` instead of `Date`

**What goes wrong:** the de-duplication key drifts by a timezone offset, and `(ruleId, occurrenceDate)` uniqueness stops matching for users east of UTC.
**Why it happens:** every other datetime column in this schema is `@db.Timestamptz(3)` — copying that habit is the natural mistake.
**How to avoid:** D-01 specifies `occurrenceDate` is a **Date**. Use Prisma `DateTime @db.Date`, which is supported for PostgreSQL and maps to a JS `Date` in the client [CITED: https://www.prisma.io/docs/orm/reference/prisma-schema-reference — the reference confirms `@db.Date` and `@db.Timestamptz(x)` are both supported PostgreSQL native types for `DateTime`, and that "Prisma Client returns all `DateTime` as native `Date` objects"]. The same applies to `startsOn` / `endsOn` / `materializedThrough`, which are calendar dates, not instants. This is the *only* place in the schema where `@db.Date` is correct and `@db.Timestamptz(3)` is wrong.
**Warning signs:** a user in `Asia/Shanghai` gets two instances for the same day, or the watermark advances by one day per run without generating anything.

---

## Code Examples

### Example 1: Pure recurrence walk — no timezone, no `Date`

```typescript
// apps/api/src/modules/recurrence/recurrence-date.ts
// PURE MODULE — no Nest, no Prisma, no I/O. Unit-tested by the `unit` vitest project.
// Pattern precedent: apps/client/src/features/events/calendar-utils.ts opens with
//   "/** Pure date helpers for the calendar month grid. No React dependency. */"

export interface CalendarDate { year: number; month: number; day: number } // month: 1-12

export function daysInMonth(year: number, month: number): number {
  // Day 0 of month+1 == last day of month. Safe because we build the Date from
  // explicit numbers and read it back immediately (no tz math on the result).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** D-09: clamp, never roll over. new Date(2026,0,31).setMonth(1) → Mar 3 (wrong). */
export function clampDay(year: number, month: number, anchorDay: number): CalendarDate {
  return { year, month, day: Math.min(anchorDay, daysInMonth(year, month)) };
}

export function addMonths(from: CalendarDate, months: number, anchorDay: number): CalendarDate {
  const zeroBased = (from.month - 1) + months;
  const year = from.year + Math.floor(zeroBased / 12);
  const month = (((zeroBased % 12) + 12) % 12) + 1;
  return clampDay(year, month, anchorDay);
}
```

### Example 2: The single timezone-aware boundary (D-10)

```typescript
// apps/api/src/modules/recurrence/recurrence-date.ts (continued)
// The ONLY function in this phase that knows about timezones.
// Verified this session: Node 24.18.0 has no global Temporal; Intl with
// timeZoneName:'shortOffset' resolves real IANA offsets including DST.

function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, timeZoneName: 'longOffset',
  }).formatToParts(instant);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (match === null) return 0;               // "GMT" == UTC
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? '0'));
}

/**
 * Convert a local wall-clock date+time in an IANA zone to a UTC instant.
 * Two-pass: guess with the offset at the naive instant, then correct using the
 * offset that actually applies at the guessed instant. This is the standard fix
 * for DST-transition days, where the first guess can be off by the DST delta.
 */
export function localDateTimeToInstant(
  date: CalendarDate, hour: number, minute: number, timeZone: string,
): Date {
  const naiveUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0, 0);
  const guess = new Date(naiveUtc - zoneOffsetMinutes(new Date(naiveUtc), timeZone) * 60_000);
  const corrected = naiveUtc - zoneOffsetMinutes(guess, timeZone) * 60_000;
  return new Date(corrected);
}
```

> **`[ASSUMED]` — the two-pass offset algorithm.** The `Intl` capability is `[VERIFIED]` (executed this session), but this specific two-pass correction is written from general knowledge, not copied from an authoritative source or from any existing code in this repo. It **must** be covered by unit tests at real DST boundaries (`America/New_York` 2027-03-14 02:00 spring-forward and 2027-11-07 01:00 fall-back) before being trusted. If the team prefers to eliminate this risk, that is the strongest argument for adopting `luxon` (see Alternatives Considered).

### Example 3: Advisory-locked, watermarked materialization

```typescript
// apps/api/src/modules/recurrence/recurrence-materializer.service.ts
const RECURRENCE_LOCK_NAMESPACE = 0x7265_6375; // any stable 32-bit constant

async materializeRule(ruleId: string, horizonDays = 90): Promise<number> {
  return this.prisma.$transaction(async (tx) => {
    // Transaction-level lock: auto-released at COMMIT/ROLLBACK, safe with a
    // pooled connection (see PrismaService, which uses @prisma/adapter-pg).
    const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${RECURRENCE_LOCK_NAMESPACE}, hashtext(${ruleId})) AS locked
    `;
    if (!locked) return 0;                        // another run owns this rule

    const rule = await tx.recurrenceRule.findUnique({ where: { id: ruleId } });
    if (rule === null) return 0;

    const occurrences = walkOccurrences(rule, horizonDays); // pure, see Example 1
    const rows = occurrences.map((occ) => ({ /* ...template fields..., */
      recurrenceRuleId: rule.id,
      occurrenceDate: toUtcMidnightDate(occ),     // @db.Date column
    }));

    // Idempotent by the (recurrence_rule_id, occurrence_date) unique index —
    // D-07 "仅此一次" edits already occupy their date, so they are skipped.
    const { count } = await tx.task.createMany({ data: rows, skipDuplicates: true });

    await tx.recurrenceRule.update({
      where: { id: rule.id },
      data: { materializedThrough: horizonEnd },  // watermark, D-03
    });
    return count;
  });
}
```

### Example 4: Zero-dependency scheduler provider

```typescript
// apps/api/src/modules/recurrence/recurrence-scheduler.ts
@Injectable()
export class RecurrenceScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly materializer: RecurrenceMaterializerService) {}

  onApplicationBootstrap(): void {
    // Pitfall 9: never auto-run under the integration suite. Precedent for
    // env-gated test behavior: app.module.ts:16-17 (bypassE2eRateLimits).
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.materializer.materializeAllDue().catch(() => undefined);
    }, 6 * 60 * 60 * 1000);
    this.timer.unref();          // do not keep the process alive on shutdown
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
```

The `OnModuleInit` / `OnModuleDestroy` lifecycle-interface idiom is already established [VERIFIED: apps/api/src/infrastructure/prisma/prisma.service.ts:13 — verbatim: `export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {`].

---

## Runtime State Inventory

Not applicable — Phase 7 is a **greenfield feature addition**, not a rename, refactor, or migration. No existing runtime string, stored key, service registration, or build artifact is being renamed.

One adjacent item does qualify as pre-existing runtime state the plan must respect:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing `events` / `tasks` rows have no `recurrence_rule_id` or `occurrence_date` | Add columns as **nullable**; no backfill needed (`recurrenceRuleId IS NULL` ⇒ one-off, per D-01) |
| Live service config | None — the only external services are `postgres` and `mailpit`, both defined in the committed `compose.yaml` | None |
| OS-registered state | None — no cron entries, no systemd units, no Task Scheduler jobs; the repo-wide scheduler grep returned zero matches | None |
| Secrets / env vars | None required by the primary recommendation. If the interval period is made configurable, add e.g. `RECURRENCE_HORIZON_DAYS` to `README.md`'s env table (README.md:122-123 documents `JWT_ACCESS_SECRET` / `NODE_ENV`) and `.env.test.example` | Document if added |
| Build artifacts | `apps/api/src/generated/prisma/` (gitignored, regenerated by `pretest`) and `packages/api-client/src/generated/` (**tracked**, drift-checked) | Run `prisma generate`; edit + regenerate + commit the api-client |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | API + client + tests | ✓ | v24.18.0 (engines require `>=24.0.0 <25`) | — |
| Full-ICU `Intl` with IANA timezones | D-10 local-date arithmetic | ✓ | Verified: `Asia/Shanghai` and `America/New_York` offsets resolve correctly | — |
| `globalThis.Temporal` | (would simplify D-10) | ✗ | `typeof globalThis.Temporal === 'undefined'` | `Intl.DateTimeFormat` two-pass conversion (Example 2), or `luxon` |
| PostgreSQL 18 | `RecurrenceRule` table, advisory locks, `@db.Date` | ✓ | `postgres:18.4-alpine3.24` pinned in compose.yaml; `setup-integration.ts` enforces server major ≥ 17 | — |
| pnpm | workspace commands | ✓ | `packageManager: pnpm@10.34.5` | — |
| Redis | (would be needed by BullMQ) | ✗ | — | Not needed — DB-driven design avoids it entirely |
| Docker | local Postgres + Mailpit | ✓ (compose.yaml present; `setup-integration.ts` also accepts an already-running local PG ≥ 17) | — | Native PostgreSQL install per README.md:94-96 |
| Any scheduler/cron package | D-03 worker | ✗ | Repo-wide grep for `nestjs/schedule\|node-cron\|bullmq\|@Cron\|setInterval\|agenda\|pg-boss\|graphile` → **0 matches** | `setInterval` in a Nest lifecycle provider (Example 4) — zero new deps |
| Any date/time library | D-09/D-10 arithmetic | ✗ | Repo-wide grep for `date-fns\|luxon\|dayjs\|temporal\|Intl.DateTimeFormat\|timeZone` → **0 matches** | Pure `recurrence-date.ts` module (Examples 1–2) — zero new deps |
| CI pipeline | migration/OpenAPI gating | ✗ | `ls -a .github` → not present | Local scripts: `pnpm openapi:check`, `pnpm test:integration`, `scripts/check-required-tests.ps1` |

**Missing dependencies with no fallback:** none — every gap has a zero-dependency path.

**Missing dependencies with fallback:** scheduler (→ `setInterval` provider), date library (→ pure module), `Temporal` (→ `Intl`), CI (→ local scripts run by the executor).

---

## Validation Architecture

`workflow.nyquist_validation` is `true` [VERIFIED: .planning/config.json — verbatim: `"nyquist_validation": true,`], so this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework (API) | Vitest 4.1.10, two named projects: `unit` and `integration` |
| Config file (API) | `apps/api/vitest.config.ts` |
| Unit include glob | `['src/**/*.test.ts', 'test/**/*.unit.test.ts']` |
| Integration include glob | `['test/**/*.int.test.ts', 'test/security/**/*.test.ts']`, `globalSetup: ['./test/setup-integration.ts']`, `fileParallelism: false` |
| Quick run (API) | `pnpm --filter api test:quick` → `vitest run --project unit` |
| Integration run (API) | `pnpm --filter api test:integration` → `vitest run --project integration` |
| Full API suite | `pnpm --filter api test` → `vitest run` |
| Framework (client) | Jest 30.4.2 + `jest-expo` 57.0.3 + `@testing-library/react-native` 14.0.1 |
| Config file (client) | `apps/client/jest.config.js` |
| Client test glob | `['<rootDir>/src/**/__tests__/**/*-test.[jt]s?(x)']` — **note the `-test` suffix, not `.test.`** |
| Client run | `cd apps/client && pnpm test` → `jest --runInBand` |
| E2E | Playwright 1.62.1, `playwright.config.ts` at repo root, specs under `e2e/<domain>/*.spec.ts`; run `pnpm test:e2e:web` |
| Repo-wide | `pnpm test`, `pnpm test:quick`, `pnpm test:integration` fan out via `pnpm --if-present --recursive` |

[VERIFIED: apps/api/vitest.config.ts (read in full), apps/client/jest.config.js:43, apps/api/package.json:11-13, apps/client/package.json:10-11, package.json:11-14]

**Important:** the `unit` project currently has exactly **one** matching file (`apps/api/src/infrastructure/mail/smtp-mail.adapter.test.ts`) [VERIFIED: `find apps/api -name "*.test.ts"` this session — the only `src/**/*.test.ts` hit]. The pure `recurrence-date.test.ts` will be the second, and is the single highest-value test artifact of this phase: it exercises D-09 and D-10 with zero database or HTTP setup, in milliseconds.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RECR-01 | Month-end clamping: anchor 29/30/31 across leap + non-leap years (D-09) | unit | `pnpm --filter api test:quick` | ❌ Wave 0 — `apps/api/src/modules/recurrence/recurrence-date.test.ts` |
| RECR-01 | Local-wall-time → UTC across DST spring-forward and fall-back (D-10) | unit | `pnpm --filter api test:quick` | ❌ Wave 0 — same file |
| RECR-01 | Weekly-with-selected-weekdays walk produces the right dates; `interval` respected | unit | `pnpm --filter api test:quick` | ❌ Wave 0 — same file |
| RECR-01 | `endsOn` XOR `count` termination (D-06) | unit | `pnpm --filter api test:quick` | ❌ Wave 0 — same file |
| RECR-01 | `POST /households/:id/events` with `recurrence` creates a rule + N instances | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — `apps/api/test/recurrence/recurrence-rules.int.test.ts` |
| RECR-01 | `POST .../tasks` with `recurrence` copies `TaskAssignee` + `TaskLabel` per instance | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — same file |
| RECR-01 | D-06 mutual exclusion rejected with `VALIDATION_FAILED` | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — same file |
| RECR-01 | Non-member gets `404 HOUSEHOLD_NOT_FOUND` on every recurrence route (SAFE-01) | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — same file |
| RECR-01 | Running the materializer twice creates zero extra rows (D-03 idempotency) | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — `apps/api/test/recurrence/materializer.int.test.ts` |
| RECR-01 | Watermark advances; a second run within the horizon is a no-op | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — same file |
| RECR-02 | "仅此一次" edit does not affect siblings; the edited date is not regenerated | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — `recurrence-rules.int.test.ts` |
| RECR-02 | "此后所有" split: old `endsOn` = date−1, new rule created, future instances replaced, **past instances untouched** | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — same file |
| RECR-02 | Split is atomic — forced failure mid-split leaves the old rule unmodified (D-08) | integration | `pnpm --filter api test:integration` | ❌ Wave 0 — same file |
| RECR-02 | Cancelled task (`status='cancelled'`) is excluded from Today's 今日待办 partition | client unit | `cd apps/client && pnpm test` | ❌ Wave 0 — `apps/client/src/features/tasks/__tests__/task-status-test.tsx` |
| RECR-01 | Recurrence picker: weekday toggle, freq switch, end-condition switch, a11y roles | client unit | `cd apps/client && pnpm test` | ❌ Wave 0 — `apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx` |
| RECR-02 | Scope dialog offers exactly "仅此一次" / "此后所有" and dispatches the right call | client unit | `cd apps/client && pnpm test` | ❌ Wave 0 — `.../__tests__/series-scope-dialog-test.tsx` |
| RECR-01/02 | End-to-end web flow: create a recurring event, verify instances on the calendar, split the series | e2e | `pnpm test:e2e:web` | ❌ Wave 0 — `e2e/events/recurrence.spec.ts` |
| — (regression) | OpenAPI client matches the committed tree after recurrence fields are added | contract | `pnpm openapi:check` | ✅ `scripts/check-openapi-drift.mjs` exists |

### Sampling Rate

- **Per task commit:** `pnpm --filter api test:quick` (pure date module — sub-second, no DB) plus `pnpm --filter api typecheck` and `cd apps/client && pnpm typecheck`
- **Per wave merge:** `pnpm --filter api test:integration` + `cd apps/client && pnpm test` + `pnpm openapi:check`
- **Phase gate:** `pnpm test` (all workspaces) + `pnpm test:integration` + `pnpm test:e2e:web` + `pnpm openapi:check` all green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/modules/recurrence/recurrence-date.test.ts` — covers RECR-01 (D-05, D-06, D-09, D-10); **highest priority, zero infrastructure cost**
- [ ] `apps/api/test/recurrence/recurrence-rules.int.test.ts` — covers RECR-01, RECR-02
- [ ] `apps/api/test/recurrence/materializer.int.test.ts` — covers RECR-01 (D-03 idempotency + watermark)
- [ ] `apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx` — covers RECR-01 UI
- [ ] `apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx` — covers RECR-02 UI
- [ ] `apps/client/src/features/tasks/__tests__/task-status-test.tsx` — covers the `cancelled` fan-out (Pitfall 2)
- [ ] `e2e/events/recurrence.spec.ts` — covers the RECR-01/02 web journey
- [ ] Framework install: **none needed** — Vitest, Jest, and Playwright are all installed and configured
- [ ] Shared fixtures: the integration fixture helpers (`insertActor`, `createHousehold`, `addMemberViaDb`, `taskApi`) are currently **duplicated per test file** rather than extracted [VERIFIED: apps/api/test/tasks/tasks.int.test.ts:33-99 defines all four locally]. Follow the existing convention (copy into the new files) rather than refactoring shared fixtures in this phase — extracting them would touch every existing integration test and inflate the phase's blast radius.
- [ ] Optionally extend `scripts/check-required-tests.ps1` with the new required paths (its `$requiredTests` array currently covers only Phase 1 artifacts [VERIFIED: scripts/check-required-tests.ps1, read in full]). Note its `$forbiddenPattern` rejects `.skip`/`.todo`/`IMPLEMENTATION_MISSING` in any listed file.

---

## Security Domain

`security_enforcement` is absent from `.planning/config.json` [VERIFIED: .planning/config.json, read in full this session — keys present are `mode`, `granularity`, `parallelization`, `commit_docs`, `model_profile`, `workflow`, `plan_review`, `ship`, `git`], therefore treated as **enabled**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (reused) | Every recurrence route sits behind the existing `@UseGuards(AccessTokenGuard)` — no new auth surface |
| V3 Session Management | no (reused) | No session behavior changes |
| V4 Access Control | **yes** | `resolveActorRole` + `canMutate` on **every** recurrence route, including the sub-resource `.../series` routes. A `RecurrenceRule` is scoped by `householdId` (D-01) and must be re-checked on every access — never trust a `recurrenceRuleId` supplied in a request body without confirming its `householdId` matches the path `householdId`. This is the SAFE-01 boundary. |
| V5 Input Validation | **yes** | `class-validator` 0.15.1 + global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`). New surface: `freq` (`@IsIn`), `interval` (`@IsInt` + `@Min(1)` + **`@Max`**), `byWeekday` (`@IsArray` + `@IsInt({each:true})` + range 0–6), `count` (`@IsInt` + `@Min(1)` + **`@Max`**), `timezone` (must be validated as a real IANA identifier), `startsOn`/`endsOn` (date format). |
| V6 Cryptography | no | No new secrets, tokens, or crypto in this phase |
| V7 Error Handling & Logging | **yes** | Reuse the structured `{code, message, details}` envelope; the global Fastify logger redacts a fixed path list [VERIFIED: apps/api/src/main.ts:186-197] — recurrence fields carry no secrets, so no redaction changes are needed |

The repo already carries an ASVS L1 V5 evidence suite at `apps/api/test/security/asvs-v5-l1.test.ts`, which is in the `integration` project's include glob [VERIFIED: apps/api/vitest.config.ts:19 — verbatim: `include: ['test/**/*.int.test.ts', 'test/security/**/*.test.ts'],`], and the Phase 1 decision log records a pinned ASVS 5.0.0 CSV checksum [VERIFIED: .planning/STATE.md:126]. New recurrence input surfaces should be represented there.

### Known Threat Patterns for NestJS + Prisma + PostgreSQL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unbounded `count` / `interval` causing mass row generation (DoS-by-recurrence) | Denial of Service | Cap `count` and `interval` with `@Max(...)`, and hard-cap generated rows per run in the materializer regardless of what the rule requests. **This is the most phase-specific security risk and has no existing precedent in the codebase to copy.** A rule with `freq=DAILY, count=1000000` must not be accepted. |
| SQL injection through the new `$queryRaw` advisory-lock call | Tampering | Use Prisma's **tagged-template** `$queryRaw\`...\`` form (parameterized), never `$queryRawUnsafe`. The repo currently has **zero** `$queryRaw` usages, so this introduces the first one — call it out explicitly in the plan. |
| IDOR on `recurrenceRuleId` — editing another household's series | Elevation of Privilege | Re-resolve the rule's `householdId` from the database and compare against the path parameter before any mutation; return `404` (not `403`) on mismatch, matching the existing `HOUSEHOLD_NOT_FOUND` convention |
| Cross-household instance leakage via the generator | Information Disclosure | The materializer must derive `householdId` from the rule row, never from request input |
| Timezone string used unvalidated in `Intl.DateTimeFormat` | Denial of Service (thrown `RangeError` → 500) | `Intl.DateTimeFormat` throws `RangeError` on an unknown `timeZone`. Validate the identifier at the DTO boundary (e.g. `Intl.supportedValuesOf('timeZone')` membership, or a try/catch probe) so a bad value yields a `400 VALIDATION_FAILED`, not an unhandled 500 inside the background worker |
| Background worker swallowing errors silently | Repudiation | The scheduler's `.catch(() => undefined)` must log via the Fastify logger, not discard; a permanently-failing rule should be observable |
| Rate limiting | Denial of Service | Global `ThrottlerGuard` at 60 requests / 60 s already applies [VERIFIED: apps/api/src/app.module.ts:23-32 — verbatim: `limit: 60,` / `ttl: 60_000,`]. No per-route change needed, but note that a materialize-heavy create still costs far more than a normal write — the row cap above is the real control. |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `moment-timezone` for IANA arithmetic | `Intl.DateTimeFormat` with `timeZone` (full ICU is default in Node) / `Temporal` where available | Node 13+ ships full ICU; Temporal still not global in Node 24.18.0 (verified) | This project can do D-10 with no dependency, but must hand-write the local→UTC conversion |
| `date-fns-tz` companion package | `@date-fns/tz` with `TZDate` (date-fns v4+) | date-fns 4.x | If a date library is ever adopted, the v3-era `date-fns-tz` guidance is stale |
| Redis-backed job queues for every periodic task | PostgreSQL-native coordination (advisory locks / `SKIP LOCKED` queues) for single-DB apps | Widely adopted | Avoids standing up Redis purely to run one periodic job [CITED: https://dev.to/mukesh_13/postgres-advisory-locks-for-distributed-cron-killing-duplicate-job-runs-without-a-redis-dependency-1bfl] |
| Full RRULE stored as an opaque string | Structured columns for the small set of frequencies a product actually offers | Product-dependent | D-05 already chose the structured approach; keeps the rule queryable and validatable by DB constraints |

**Deprecated / outdated:**
- `moment` / `moment-timezone` — in maintenance mode; do not introduce.
- `Temporal` — **not available** in this project's Node 24.18.0 (verified `typeof globalThis.Temporal === 'undefined'`). Any guidance recommending it does not apply here yet.
- `date-fns-tz` (the v3-era standalone package) — superseded by `@date-fns/tz`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The two-pass `Intl` offset algorithm in Example 2 correctly handles DST spring-forward gaps and fall-back overlaps | Code Examples | Occurrences land one hour (or one day) off on DST transition days — exactly the D-10 failure mode. **Mitigation: the Wave 0 unit tests at real DST boundaries are non-negotiable.** Note: `Asia/Shanghai`, the likely primary user timezone, has had no DST since 1991, so this bug would hide from the most common usage and surface only for overseas users. |
| A2 | A single API process runs in production, so the advisory lock is defense-in-depth rather than load-bearing | Architecture | If multiple instances are ever run without the lock, duplicate instances appear. Low risk — the lock is included regardless. |
| A3 | 90 days is an appropriate materialization horizon | Standard Stack / Examples | Too short → occurrences vanish from far-future calendar views; too long → row bloat for daily rules (365 rows/yr/rule). CONTEXT.md marks this as Claude's discretion and suggests 90. Make it a named constant. |
| A4 | `RECR-01` / `RECR-02` from the v2 requirements section are the intended requirement IDs for this phase | Phase Requirements | Traceability mismatch only; no code impact. Requires user confirmation. |
| A5 | Reusing `Task.status = 'cancelled'` (D-07) is preferred over adding a `Task.cancelledAt` column symmetric with `Event.cancelledAt` | Pitfalls | D-07 *suggests* `status` ("建议复用 `status` 字段加 `cancelled` 取值，避免新增列") but the asymmetry with Event's `cancelledAt` means two different cancellation mechanisms in one feature. **Worth one confirming question to the user during planning.** |
| A6 | Chinese-language DTO descriptions are preferred for new modules | Pattern 5 | Cosmetic only. The codebase is genuinely mixed (events = English, tasks/labels/notes = Chinese). |
| A7 | `luxon` / `date-fns` / `@date-fns/tz` / `rrule` package *names* are correct as recommended alternatives | Alternatives Considered | Registry existence, versions, repos, and download counts were confirmed by direct `npm view` + `api.npmjs.org` queries this session, but the names originate from training knowledge rather than from official documentation fetched in this session. Since the primary recommendation installs nothing, the practical risk is nil. If an alternative is adopted, gate it behind `checkpoint:human-verify`. |
| A8 | `Intl.supportedValuesOf('timeZone')` is available in Node 24 for IANA identifier validation | Security Domain | If unavailable, fall back to a `try { new Intl.DateTimeFormat('en', { timeZone }) } catch { … }` probe, which is guaranteed to work. Cheap to verify at implementation time. |

---

## Open Questions (RESOLVED — see 07-01-PLAN.md through 07-08-PLAN.md)

> Resolved by planning pass 2026-08-12: Q1/Q3/Q4/Q5 implemented directly per the recommendations below; Q2 (recurrence time-of-day storage) routed through a blocking `checkpoint:decision` task in 07-01-PLAN.md Task 1 rather than pre-decided here.

1. **Should Task cancellation reuse `status` or add a `cancelledAt` column?**
   - What we know: D-07 suggests reusing `status` to avoid a new column. Event will get `cancelledAt` regardless, since it has no status field.
   - What's unclear: whether the asymmetry (Task uses an enum value; Event uses a timestamp) is acceptable, and whether "cancelled" should remain distinguishable from "completed" in historical reporting.
   - Recommendation: follow D-07 as written (reuse `status`), but make Pitfall 2's six-site enumeration an explicit checklist in the plan. Surface this as a one-line confirmation during `/gsd-discuss-phase` rather than a blocker.

2. **Where does the recurrence rule's time-of-day live?**
   - What we know: `RecurrenceRule` per D-01 has no time-of-day field. `Event` needs `startTime`/`endTime` and `Task` needs `dueDate` on each instance.
   - What's unclear: whether the materializer reads the wall-clock time from the *first* (template) instance, or whether the rule needs an added `startTimeLocal` / `durationMinutes` pair.
   - Recommendation: derive it from the first instance created alongside the rule (keeps `RecurrenceRule` exactly as D-01 specifies, and preserves "相对时长不变" from CONTEXT.md `<canonical_refs>`). Note this makes the first instance load-bearing — deleting it must not orphan the rule's timing. An alternative is to store `startTimeLocal` + `durationMinutes` on the rule, which is more robust but extends D-01's field list. **Worth confirming with the user.**

3. **What is the maximum number of instances a single rule may materialize per run?**
   - What we know: no cap exists; `count` and `interval` are unbounded in D-05/D-06.
   - What's unclear: the acceptable ceiling.
   - Recommendation: cap at ~400 rows per run (roughly one year of daily occurrences) and cap `count` at e.g. 1000 in the DTO. Treat as Claude's discretion under the horizon-length clause, but state the numbers explicitly in the plan so they are reviewable.

4. **Should recurrence be exposed on the existing create/update endpoints, or on dedicated `/series` sub-resources?**
   - What we know: CONTEXT.md grants full discretion over routes and DTO shape. C-02 requires additive, non-breaking changes.
   - What's unclear: whether "此后所有" edits belong on `PUT /events/:id` with a `scope` field, or on a separate `PUT /events/:id/series`.
   - Recommendation: additive optional `recurrence` on the existing create endpoints (simplest for RECR-01), plus a dedicated `PUT/DELETE /households/:hid/events/:eid/series` sub-resource for RECR-02's split semantics. The labels module already establishes the multi-controller sub-resource pattern in one file.

5. **Phase 5's untested code and the three parked Android acceptance checkpoints.**
   - What we know: STATE.md records that Phase 5 has zero automated test coverage and that `02-13`, `03-04`, `04-04` are parked on one real-device session [VERIFIED: .planning/STATE.md:54-56].
   - What's unclear: whether Phase 7 should batch its own Android acceptance into that pending session.
   - Recommendation: plan a Phase 7 Android acceptance checkpoint but explicitly note it can be batched with the existing backlog — do not let it block the automated gates.

---

## Sources

### Primary (HIGH confidence) — read directly from the repository this session

- `apps/api/prisma/schema.prisma` — full model/index/`@map` inventory
- `apps/api/package.json`, `apps/client/package.json`, `package.json`, `packages/api-client/package.json` — exact dependency pins
- `apps/api/src/app.module.ts`, `main.ts`, `infrastructure/prisma/prisma.service.ts` — bootstrap, ValidationPipe config, global filter, Prisma adapter
- `apps/api/src/modules/events/{events.service.ts, events.controller.ts, events.module.ts, dto/create-event.dto.ts}`
- `apps/api/src/modules/tasks/{tasks.service.ts, dto/create-task.dto.ts}`
- `apps/api/src/modules/labels/labels.controller.ts` (route decorators only)
- `apps/api/src/openapi/generate-openapi.ts` — the hand-maintained client templates
- `apps/api/vitest.config.ts`, `prisma.config.ts`, `tsconfig.json`, `tsconfig.base.json`
- `apps/api/test/setup-integration.ts`, `apps/api/test/tasks/tasks.int.test.ts`
- `apps/api/prisma/migrations/` — directory listing + `0005_tasks` + `20260812000000_task_multiple_assignees` SQL
- `apps/client/src/features/{events/event-form.tsx, events/calendar-utils.ts, tasks/task-form.tsx, labels/label-picker.tsx}`
- `apps/client/src/ui/date-field.tsx`, `apps/client/app/(protected)/households/[id]/today.tsx`, `.../events/new.tsx`
- `apps/client/jest.config.js`, `apps/client/jest.setup.ts`
- `scripts/check-openapi-drift.mjs`, `scripts/check-required-tests.ps1`
- `compose.yaml`, `.gitignore`, `AGENTS.md`, `README.md`
- `.planning/{PROJECT.md-derived AGENTS.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, config.json}`
- `.planning/phases/07-recurring-events-tasks/07-CONTEXT.md`
- Executed commands: `node -v` (v24.18.0), `node -e` Temporal/Intl probe, `npm view` for 6 packages, `api.npmjs.org` download counts, `gsd-tools query package-legitimacy check`, repo-wide `grep` for scheduler and date-library identifiers, `git ls-files apps/api/src/generated`

### Secondary (MEDIUM confidence)

- [Prisma Schema Reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference) — confirms `@db.Date` and `@db.Timestamptz(x)` are supported PostgreSQL native types for `DateTime` and that Prisma Client returns all `DateTime` as native `Date` objects
- npm registry metadata for `@nestjs/schedule` (6.1.3, peer `@nestjs/common: ^10.0.0 || ^11.0.0`, dependency `cron: 4.4.0`), `cron` (4.4.0), `luxon` (3.7.2), `date-fns` (4.4.0), `@date-fns/tz` (1.5.0), `rrule`

### Tertiary (LOW confidence — pattern guidance, not authoritative for this codebase)

- [Leader election with PostgreSQL's advisory locks](https://kerkour.com/postgresql-leader-election-advisory-lock)
- [Using PostgreSQL Advisory Locks for Leader Election](https://jeremydmiller.com/2020/05/05/using-postgresql-advisory-locks-for-leader-election/)
- [Postgres Advisory Locks for Distributed Cron: Killing Duplicate Job Runs Without a Redis Dependency](https://dev.to/mukesh_13/postgres-advisory-locks-for-distributed-cron-killing-duplicate-job-runs-without-a-redis-dependency-1bfl)
- `@nestjs/schedule` README (minimal — defers to docs.nestjs.com, which did not render for automated fetch). The `ScheduleModule.forRoot()` / `@Cron` / `SchedulerRegistry` API details are **not verified this session**; if the plan adopts `@nestjs/schedule`, verify the API against the live docs during execution.

---

## Metadata

**Confidence breakdown:**

- **Codebase facts (patterns, files, conventions, versions, test infra, migration workflow): HIGH** — every claim was read from source in this session, with verbatim quotes and line citations. Nothing here rests on training memory.
- **Standard stack (zero-new-dependency recommendation): HIGH** — the absence of a scheduler and of a date library was established by repo-wide grep returning zero matches, and `Intl`/`Temporal` capability was verified by executing Node in the repository.
- **Architecture patterns: HIGH** for the "copy these existing shapes" guidance; **MEDIUM** for the materializer design, which is sound but is new code with no in-repo precedent.
- **Date-math implementation (Example 2): MEDIUM** — the algorithm is `[ASSUMED]` (A1) and must be proven by DST unit tests. Everything around it is verified.
- **Pitfalls: HIGH** — all ten are grounded in specific file/line evidence, most of them in duplicated constants and read-path filters that were read in full.
- **Security domain: MEDIUM** — ASVS mapping is judgement applied to verified code; the unbounded-`count` DoS vector is the one genuinely new risk and has no existing mitigation to copy.

**Research date:** 2026-08-12
**Valid until:** 2026-09-11 (30 days — the stack is pinned and stable; the only volatile inputs are npm versions for the unselected alternatives)
