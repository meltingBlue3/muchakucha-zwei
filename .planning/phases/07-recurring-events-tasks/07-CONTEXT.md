# Phase 7: 周期性重复事件与任务 - Context

**Gathered:** 2026-08-12 (conversational design pass, ahead of formal `/gsd-discuss-phase`)
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段让家庭成员为一个事件或任务设置重复规则（每日 / 每周固定几天 / 每周 / 每月 / 每年），系统按规则自动生成后续发生的实例，用户不用手动重复创建同一件事。范围覆盖：创建/编辑重复规则、后台生成未来实例、单次实例的独立编辑/完成/删除、"此后所有"级别的规则变更与拆分。**不包含**完整 RRULE 语义（如"每月第二个周三"这类序数规则）、跨家庭共享重复规则、重复规则模板库。依赖 Phase 3（共享家庭日历，Event 模型与日历视图）与 Phase 4（任务与今日视图，Task 模型与今日视图），与 Phase 6（跨平台发布准备）并行，不受其阻塞。

</domain>

<decisions>
## Implementation Decisions

### 存储与生成策略

- **D-01:** 采用预生成实例行（materialized instances），不做虚拟展开。新增共享的 `RecurrenceRule` 表（字段：`householdId`、`freq`、`interval`、`byWeekday`、`startsOn`、`endsOn`、`count`、`timezone`、`materializedThrough`）。`Task` 与 `Event` 各加 `recurrenceRuleId`（可空外键，`onDelete: SetNull`）与 `occurrenceDate`（Date，去重键）。`recurrenceRuleId` 为空即普通一次性任务/事件，完全不受影响。
- **D-02:** 每个实例是一条真实的 Task/Event 行，可独立编辑、指派、标记完成、删除；必须天然兼容现有查询、筛选、索引（如 `Task_household_status_idx`），不得为"是否重复"引入专门的展开层或额外的前端渲染路径。
- **D-03:** 后台 worker 定时滚动生成未来窗口（建议未来 90 天）内缺失的实例，用 `(recurrenceRuleId, occurrenceDate)` 判重，`materializedThrough` 做水位线避免漏跑重复生成。规则创建/编辑时必须立即触发一次生成，不等下一次定时任务。

### 任务重复语义

- **D-04:** 任务按固定日历排期生成下一次，不看上一次是否按时完成——即使上一次逾期未完成，下一次仍按规则准时出现在列表里。这是家务型重复任务（倒垃圾、打扫）的预期语义。

### 规则表达力

- **D-05:** 只做预设频率：每日 / 每周（可多选星期几，如"周二四六"）/ 每月（固定"同一天"重复）/ 每年（固定"同一月同一天"重复）。不支持完整 RRULE 的序数规则（"每月第二个周三"）。`interval` 字段预留"每 N 个周期一次"的扩展空间，但本阶段 UI 只需支持 `interval=1`。
- **D-06:** 重复结束条件二选一：`endsOn`（到某天为止）或 `count`（重复 N 次后结束），两者互斥；均为空表示永不结束。

### 单次编辑 vs 系列编辑

- **D-07:** "仅此一次"的编辑/删除直接操作该实例行本身（改字段，或将 Task 的 `status` 置为 `cancelled`／给 Event 加 `cancelledAt`）。因为该行已经是真实数据，生成器判重时会跳过这天，不需要额外的例外表。
- **D-08:** "此后所有"的编辑/删除走拆系列：旧 `RecurrenceRule.endsOn` 设为这一次的前一天；新建一条规则从这一次的日期开始，带上新字段值；删除旧规则下这一次及以后尚未发生的已生成实例，交给新规则重新生成。已经过去的历史实例不受影响。

### 边界情况（必须显式处理，不能默默丢失）

- **D-09:** 月末钳位——`startsOn` 为每月 31 日、`freq=MONTHLY` 时，遇到没有 31 日的月份钳到当月最后一天（2 月钳到 28/29），不得跳过该月不生成。
- **D-10:** 时区与夏令时——`RecurrenceRule.timezone` 必须存 IANA 时区标识，日期推算按本地日期做，不能直接对 UTC 时间戳做天数加法，否则夏令时切换日会错位一小时或错位一天。

### the agent's Discretion

- 确定 worker 的具体调度实现方式（cron/queue/定时任务框架）与执行窗口长度的精确默认值（建议 90 天，可调整），但必须保证水位线机制、幂等生成和创建时立即触发这三点不被弱化。
- 确定 API 路由、DTO 形状、OpenAPI 契约，以及"仅此一次 / 此后所有"在前端交互上的具体呈现（弹窗/选项/文案），但拆系列的原子性（D-08）不能弱化——不能出现旧规则已终止、新规则未建成的中间态。
- 确定重复设置 UI 的具体组件形态（星期选择器、结束条件切换等），但必须保持移动优先与现有可访问性标准。
- 确定 `Task.status`/`Event.cancelledAt` 之外是否需要额外索引支持"按规则查所有未来实例"这类生成器内部查询，不影响对外行为。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and locked project decisions

- `.planning/PROJECT.md` — 产品定位与全局约束。
- `.planning/ROADMAP.md` — Phase 7 目标、Depends on（Phase 3 + Phase 4）、与 Phase 6 的并行关系。
- `apps/api/prisma/schema.prisma` — 现有 `Event`、`Task`、`Household` 等模型的确切字段与索引，新增字段/表必须与现有命名和 `@map` 约定一致（snake_case 列名、UUID 主键、Timestamptz(3)）。

### Architecture and implementation guidance

- 现有 `Event` 模型（`apps/api/prisma/schema.prisma`）：`startTime`/`endTime`/`allDay`/`location`，重复实例的这些字段按 `occurrenceDate` 展开时需要保持相对时长不变。
- 现有 `Task` 模型：`status`（default `pending`）、`priority`、`dueDate`；D-07 的单次取消建议复用 `status` 字段加 `cancelled` 取值，避免新增列。
- `TaskAssignee`、`TaskLabel`、`EventLabel` 关联表：规则生成实例时需要决定这些关联是否从"模板"字段复制到每个新实例（建议复制，保持每个实例独立可再指派）。

</canonical_refs>
