# Phase 7 Addendum (D-11 … D-16): 生成时机 / 结束入口 / 周期筛选与规则管理 — Research

**Researched:** 2026-08-12
**Domain:** Recurrence materialization scheduling (per-timezone), NestJS/Prisma rule-scoped API surface, Expo Router list+detail screens
**Confidence:** HIGH for codebase facts (every file read in full this session, line-cited); MEDIUM for the two design forks flagged in Open Questions
**Scope:** ONLY the 2026-08-12 addendum decisions D-11 … D-16. D-01/D-02/D-04..D-10 and the executed 07-01..07-08 work are settled and out of scope.
**Requirements:** RECR-01, RECR-02 (unchanged — scope refinement, no new requirement IDs)

---

<user_constraints>
## User Constraints (from 07-CONTEXT.md)

### Locked Decisions (追加决策，2026-08-12，用户验收后追加 — verbatim)

> **D-11：** 用固定"提前量窗口"取代固定 90 天滚动窗口。生成器的判断标准改为"当前时间点是否已进入某次发生的提前量窗口"，而不是"是否在未来 90 天内"：
>   - `freq=DAILY`：提前量 = 0 天，即当天 0 点后才生成"今天"这一条。
>   - `freq=WEEKLY`：提前量 = 6 天（例：每周二的任务，在前一个周三 0 点生成——周三到下周二正好 6 天）。
>   - `freq=MONTHLY`/`YEARLY`：本阶段先复用 6 天提前量作为默认值（用户未明确指定），标记为可调，不是强约束；后续如有真实使用反馈再调整。
>   - 判定必须落在规则自己的 `timezone`（D-10）本地时间的"0点"边界上，不能用服务器 UTC 0 点代替——否则非 UTC 时区的用户会在错误的本地时刻看到新实例出现。这对现有的全局单一调度进程是个新要求，需要研究/规划阶段确定具体实现方式（例如：每小时 tick 一次，每次检查每条规则的本地时间是否刚跨过午夜）。
>   - `RecurrenceRule.materializedThrough` 水位线语义相应改变：不再是"覆盖到这一天为止"，而是"最近一次成功生成检查覆盖到的（提前量窗口内的）日期"，具体字段是否需要改名/新增由规划阶段决定，但对外行为（生成器不重复生成、不漏生成）不能弱化。
>
> **D-12：** 创建规则时不再特殊对待"立刻生成今天/未来90天"，而是把"创建"当成"立刻执行一次标准的生成检查"：用当前时间跑一遍 D-11 的提前量判断，凡是此刻已进入提前量窗口的发生就生成，不在窗口内的不生成。这样每日任务天然会在创建时看到"今天"这一条（因为提前量=0，"今天"总是在窗口内），每周任务则取决于创建时今天是否落在下一次发生的 6 天提前窗口内——不强制"至少生成一条"。
>
> **D-13（不追溯）：** 已经在旧策略下生成的未来实例（Phase 7 首次上线期间创建的规则，可能已有多达90天的已生成行）**不做清理/回滚**，保留原样；新策略只影响此后的生成行为。不得为了"整齐"删除用户可能已经手动调整过的未来实例。
>
> **D-14：** 复用已有的 `deleteSeriesFromOccurrence(scope='this_and_following')` 语义（设置 `endsOn`、清空 `count`、删除该日期及以后的已生成实例），但新增一个不依赖"先选中某次发生"的直接入口：在规则级别（不指定具体某次实例）提供"结束此重复"操作，效果等同于以"今天/下一次未发生的实例"为锚点调用同一逻辑。具体是新增一个规则级 API（如 `POST .../recurrence-rules/:ruleId/end`）还是在管理界面里服务端自动解析锚点实例后复用现有 `/series` 端点，由规划阶段决定，但对用户呈现的操作必须是"结束"而不是"删除"语义（文案不用"删除"，避免和 D-07 的单次删除混淆）。
>
> **D-15：** `GET .../tasks` 和 `GET .../events` 列表接口新增一个筛选参数（如 `recurring=true`），只返回 `recurrenceRuleId` 不为空的实例；对应客户端在现有筛选区（状态/优先级/负责人/标签）里加一个"仅看周期性"筛选项，满足"筛选出我设置的周期任务"里"筛选"这半个需求。
>
> **D-16：** 新增一个"周期规则管理"入口（列表 + 详情），与筛选是分开的能力：列表按当前家庭列出所有 `RecurrenceRule`（不是实例），每行显示规则的模板标题、频率摘要（复用 `recurrence-summary.tsx` 的格式化逻辑）、下一次发生日期、结束条件；点进详情可以编辑频率/星期/结束条件（编辑效果复用 D-08 的拆系列逻辑，从"今天"或"下一次未发生实例"为锚点），也可以执行 D-14 的"结束此重复"。列表的可见范围（全家庭 vs 仅自己创建）由规划阶段决定，但必须遵守 SAFE-01 的家庭隔离边界。

### the agent's Discretion (追加 — verbatim)

> - 判定"规则本地时间是否跨过午夜"的具体调度粒度（每小时/每 15 分钟等）与实现方式（复用现有 `recurrence-scheduler.ts` 的 `setInterval` 机制还是引入新依赖——除非有充分理由，优先复用现有零依赖方案）。
> - `materializedThrough` 是否改名、是否需要拆成"每条规则独立的提前量水位线"字段，由规划阶段基于 D-11 的判定逻辑决定。
> - D-16 管理列表的具体排序、空状态、以及是否分 Task/Event 两个 tab 还是合并展示。

### Deferred / OUT OF SCOPE

- Full RRULE ordinal semantics ("每月第二个周三"), cross-household shared rules, rule template libraries (原 domain boundary).
- D-01/D-02/D-07/D-08 core model — explicitly **not changed** by this addendum ("不改变 D-01/D-02/D-07/D-08 的核心模型").
- Re-litigating the lookahead day values, the no-retroactive-cleanup rule, or the reuse-existing-delete-logic instruction.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RECR-01 | 用户可以创建符合明确重复规则的周期事件和周期任务。 | D-11/D-12 change *when* instances appear, not whether rules can be created. §2 gives the exact horizon-computation diff; §4 confirms `EventsService.create`/`TasksService.create` need no logic change under the recommended path. |
| RECR-02 | 用户可以编辑或删除单次发生项、当前及未来发生项或整个系列。 | D-14/D-16 add a rule-anchored path to the same `this_and_following` semantics. §6 gives the exact shared-core extraction from `RecurrenceService.deleteSeriesFromOccurrence`; §8 gives the rule-scoped edit path. |

`[VERIFIED: .planning/REQUIREMENTS.md:79-80]` — verbatim: `- [x] **RECR-01**: 用户可以创建符合明确重复规则的周期事件和周期任务。` / `- [x] **RECR-02**: 用户可以编辑或删除单次发生项、当前及未来发生项或整个系列。` Both are marked `Complete` against Phase 7 in the traceability table `[VERIFIED: .planning/REQUIREMENTS.md:173-174]` — verbatim: `| RECR-01 | Phase 7 | Complete |` / `| RECR-02 | Phase 7 | Complete |`. This addendum refines them; it does not reopen them.
</phase_requirements>

---

## Summary

The addendum is **almost entirely additive and, on the recommended path, requires zero Prisma schema changes.** The CR-02 fix already rebuilt `walkOccurrences` around a `from` bound and the materializer around a watermark anchor, which is exactly the shape D-11 needs: swapping the horizon from `today + 90` to `todayInRuleTimezone + lookahead(freq)` is a ~15-line change inside one method, plus one new pure date helper.

The single biggest finding is that **D-11's "per-rule local midnight detection" does not need to be implemented as detection at all.** If the horizon is computed *per rule, in that rule's own timezone*, on every tick, then a rule automatically becomes eligible on the first tick after its own local midnight — the behaviour is emergent from the horizon formula, needs no new column, no per-rule "last checked" state, and degrades gracefully across process downtime and DST. The only remaining knob is tick frequency (currently 6 h, which is too coarse for a 0-day daily lookahead) `[VERIFIED: apps/api/src/modules/recurrence/recurrence-scheduler.ts:4]`.

The second biggest finding is a **hard dependency the literal reading of D-12 would break**: `materializeRule` discovers whether a rule is a task-rule or an event-rule — and where to copy assignees/labels from — by reading the rule's earliest surviving instance row. If create stops seeding a first occurrence, a weekly rule created outside its 6-day window has zero instances and can *never* generate anything. It also breaks `POST /tasks`'s response contract, which the client uses to attach labels. §4 and Open Questions Q1 lay out the two paths; the recommended one keeps the single seed row and confines D-11's lookahead to everything after it — which still eliminates ~95% of the noise the user complained about (1 row instead of 13), at zero schema cost.

Third: shrinking the horizon from 90 days to ~6 days silently breaks two shipped UI states. `beyondGenerationWindow` on the calendar screen fires for *any* date more than 6 days out `[VERIFIED: apps/client/app/(protected)/households/[id]/events/index.tsx:144-148]`, and both empty-state strings hard-code "90 天". This is not optional cleanup; without it the calendar shows "更远的重复还没生成" on nearly every future date.

**Primary recommendation:** One new pure helper `currentCalendarDateIn(timeZone)` in `recurrence-date.ts` unlocks D-11, D-14's anchor, and D-16's next-occurrence computation simultaneously. Keep `materializedThrough` in place (semantics reinterpret, no migration), add a **monotonic-max guard** so it can never move backwards (this is the D-13 guard), tighten the tick to 1 hour, keep the create-time seed row, and add one new controller (`households/:householdId/recurrence-rules`) that serves D-14 and D-16 from the same list endpoint.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| D-11 lookahead horizon computation | API / Backend (`RecurrenceMaterializerService`) | — | Generation is server-owned; the client never computes what exists. |
| D-11 per-rule local-midnight timing | API / Backend (`RecurrenceScheduler` tick + per-rule horizon) | — | Timezone-correct calendar arithmetic already lives in `recurrence-date.ts`; adding a client role would fork the source of truth. |
| D-12 create-time generation pass | API / Backend (existing post-commit `materializeRule` call) | — | Already server-side; §4 shows no new code path is needed. |
| D-13 no-retroactive-cleanup guard | Database / Storage semantics (watermark monotonicity) | API | The guard is a property of the write, not of any UI. |
| D-14 "结束此重复" action | API / Backend (new rule-scoped endpoint) | Browser/Client (confirm dialog + copy) | The transaction must be atomic (D-08 non-weakening); only the confirm UX is client-side. |
| D-15 recurring-only filter | API / Backend (`where` clause) | Browser/Client (filter chip) | D-15 explicitly asks for a query param; the client chip mirrors 4 existing chips. |
| D-16 rule list + detail | API / Backend (list DTO + next-occurrence compute) | Browser/Client (2 Expo Router screens) | `nextOccurrenceDate` must be computed from the rule, not from materialized rows (§8) — server-side. |

---

## Current-State Inventory (all files read in full this session)

| File | Lines | What it currently does that this addendum touches |
|---|---|---|
| `apps/api/src/modules/recurrence/recurrence-materializer.service.ts` | 223 | Owns `RECURRENCE_HORIZON_DAYS`, `materializeAllDue`, `materializeRule`, the advisory lock, the watermark write, and the template/association fan-out. **Primary D-11/D-12/D-13 target.** |
| `apps/api/src/modules/recurrence/recurrence-date.ts` | 253 | Pure calendar math + `Intl`-based `offsetMinutesAt` / `localDateTimeToInstant`. **Where the new `currentCalendarDateIn` helper belongs.** |
| `apps/api/src/modules/recurrence/recurrence-scheduler.ts` | 28 | Single global `setInterval`, `RECURRENCE_TICK_MS`, `NODE_ENV === 'test'` opt-out, `.unref()`. **D-11 tick-frequency target.** |
| `apps/api/src/modules/recurrence/recurrence.service.ts` | 303 | `resolveActorRole`, `canMutate`, `resolveRuleForOccurrence`, `cancelOccurrence`, `updateSeriesFromOccurrence`, `deleteSeriesFromOccurrence`. **D-14/D-16 extraction target.** |
| `apps/api/src/modules/recurrence/recurrence.controller.ts` | 95 | Two controllers (`EventSeriesController`, `TaskSeriesController`), per-param `ParseUUIDPipe`. **D-14/D-16 new-controller pattern source.** |
| `apps/api/src/modules/recurrence/dto/recurrence.dto.ts` | 170 | `RecurrenceDto`, `RecurrenceResponseDto`, `UpdateSeriesDto`, `DeleteSeriesQueryDto`, `SeriesMutationResponseDto`, `IsIanaTimeZone`. **D-16 DTO home.** |
| `apps/api/src/modules/tasks/tasks.service.ts` | 472 | `create` (recurrence branch), `list` (+`ListFilters`), `delete` (recurrence-aware), `toResponse`. **D-15 target.** |
| `apps/api/src/modules/events/events.service.ts` | 436 | Same shape; `list` takes positional `startDate`/`endDate` instead of a filters object. **D-15 target.** |
| `apps/api/src/openapi/generate-openapi.ts` | 1390 | **The "generated" client is a hand-maintained template literal here.** See "Don't Hand-Roll" §. |
| `apps/api/prisma/schema.prisma` | 300 | `RecurrenceRule` at 186-219 incl. the CR-01 `template_*` columns. |
| `apps/client/src/features/recurrence/recurrence-summary.tsx` | 111 | `formatRecurrenceSummary` + `RecurrenceSummary`. **D-16 reuse target — with a null-vs-undefined trap, see §8.** |
| `apps/client/src/features/recurrence/recurrence-picker.tsx` | 471 | `RecurrencePicker`, `recurrenceInputFromResponse`, `recurrenceErrorsFromApi`. **D-16 edit reuse.** |
| `apps/client/src/features/recurrence/series-scope-sheet.tsx` | 316 | `SeriesScopeSheet` with `MODE_COPY` for `edit`/`delete`/`rule-change`. **D-14 copy precedent.** |
| `apps/client/app/(protected)/households/[id]/tasks/index.tsx` | 560 | Collapsible filter panel, 4 filter chips, all filtering **client-side**. **D-15 UI analog.** |
| `apps/client/app/(protected)/households/[id]/labels/index.tsx` | 431 | Household-scoped list+inline-edit management screen. **D-16 screen analog.** |
| `apps/client/app/(protected)/households/[id]/index.tsx` | 295 | Household hub with 6 `Pressable` quick-access cards. **D-16 entry-point target.** |

---

## §1 — D-11: What the horizon computation becomes

### Current code (verbatim, `recurrence-materializer.service.ts`)

`[VERIFIED: apps/api/src/modules/recurrence/recurrence-materializer.service.ts:14]`
```ts
export const RECURRENCE_HORIZON_DAYS = 90;
```

`[VERIFIED: apps/api/src/modules/recurrence/recurrence-materializer.service.ts:92-108]`
```ts
      const today = parseIsoDate(new Date().toISOString().slice(0, 10));
      const horizon = addDays(today, RECURRENCE_HORIZON_DAYS);
      // Resume at the watermark instead of re-walking the whole history: the
      // per-run cap truncates the tail of what is emitted, so starting at
      // `startsOn` every time meant the cap always kept the OLDEST occurrences
      // and the series silently stopped extending once it grew past the cap.
      const walkStart = rule.materializedThrough === null
        ? calendarDate(rule.startsOn)
        : addDays(calendarDate(rule.materializedThrough), 1);
      const occurrences = walkOccurrences({
        freq: rule.freq,
        interval: rule.interval,
        byWeekday: rule.byWeekday,
        startsOn: calendarDate(rule.startsOn),
        endsOn: rule.endsOn === null ? null : calendarDate(rule.endsOn),
        count: rule.count,
      }, { horizon, from: walkStart });
```

### The minimal, consistent change

Only the two lines computing `today`/`horizon` change. `walkStart`, `walkOccurrences`, and the whole emission path are already correct.

```ts
// recurrence-materializer.service.ts
export const RECURRENCE_LOOKAHEAD_DAYS: Record<string, number> = {
  daily: 0,     // D-11: 当天 0 点后才生成"今天"这一条
  weekly: 6,    // D-11: 前一个周三 0 点生成下周二
  monthly: 6,   // D-11: 复用 6 天默认值，标记为可调
  yearly: 6,
};
export const RECURRENCE_MAX_LOOKAHEAD_DAYS = 6;

function lookaheadFor(freq: string): number {
  return RECURRENCE_LOOKAHEAD_DAYS[freq] ?? RECURRENCE_MAX_LOOKAHEAD_DAYS;
}

// inside materializeRule, replacing lines 92-93:
const today = currentCalendarDateIn(rule.timezone);   // NEW — see §2
const horizon = addDays(today, lookaheadFor(rule.freq));
```

**Why the timezone part is mandatory rather than cosmetic** `[ASSUMED — reasoned from the code, not executed]`: with `freq: 'daily'` the lookahead is 0, so `horizon === today`. If `today` stays `new Date().toISOString().slice(0, 10)` (UTC), then at 2026-08-12 07:00 in `Asia/Shanghai` the UTC date is still `2026-08-11`, so the horizon is `2026-08-11`, `walkStart` is `2026-08-12`, `compareDates(walkStart, horizon) > 0` and `walkOccurrences` emits nothing — today's occurrence would not appear until 08:00 local. Symmetrically a `America/New_York` user would see tomorrow's row appear at 20:00 today. Computing `today` in the rule's zone is what makes the 0-day lookahead mean what D-11 says it means.

### Do `RECURRENCE_MAX_WALK_STEPS` / `RECURRENCE_MAX_INSTANCES_PER_RUN` still make sense?

`[VERIFIED: apps/api/src/modules/recurrence/recurrence-date.ts:17]` — verbatim: `export const RECURRENCE_MAX_INSTANCES_PER_RUN = 400;`
`[VERIFIED: apps/api/src/modules/recurrence/recurrence-date.ts:19-25]` — verbatim:
```ts
/**
 * Safety net for the candidate enumeration itself. The walk visits every
 * occurrence from `startsOn` so `count` keeps its absolute series index, while
 * `options.from` decides which of those are emitted — the enumeration is
 * therefore longer than the emitted slice for an old rule.
 */
export const RECURRENCE_MAX_WALK_STEPS = 20_000;
```

**Recommendation: change neither.** They now govern different things than they did at 90 days, and both remain correct:

- `RECURRENCE_MAX_INSTANCES_PER_RUN = 400` caps *emitted* rows. At a 6-day horizon a healthy rule emits ≤ 7 rows per run, so the cap is effectively dormant — but it is still the only thing bounding a rule whose watermark is far behind (a rule created before this change and then rewound, or a rule whose process was down for months). Lowering it would slow catch-up; raising it would enlarge the worst-case transaction. Leave it.
- `RECURRENCE_MAX_WALK_STEPS = 20_000` caps *enumeration*, which is unchanged by the horizon: the walk still starts at `startsOn` so `count` keeps its absolute index (that is the whole point of the CR-02 `from` design). A daily rule started 20 000 days (≈55 years) ago would still be the binding case. Leave it.
- The truncation detector `[VERIFIED: apps/api/src/modules/recurrence/recurrence-materializer.service.ts:116]` — verbatim: `const truncated = occurrences.length === RECURRENCE_MAX_INSTANCES_PER_RUN;` — stays valid and simply stops firing in normal operation.

**What DOES need to change is the due-rule prefilter.** `[VERIFIED: apps/api/src/modules/recurrence/recurrence-materializer.service.ts:50-62]` — verbatim:
```ts
  async materializeAllDue(): Promise<number> {
    const today = parseIsoDate(new Date().toISOString().slice(0, 10));
    const horizon = databaseDate(addDays(today, RECURRENCE_HORIZON_DAYS));
    const dueRules = await this.prisma.recurrenceRule.findMany({
      where: {
        OR: [
          { materializedThrough: null },
          { materializedThrough: { lt: horizon } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
```
A single SQL-side horizon can no longer be exact (it depends on each rule's `freq` and `timezone`). Use a **conservative superset** and let `materializeRule` make the exact per-rule decision:

```ts
const utcToday = parseIsoDate(new Date().toISOString().slice(0, 10));
// Superset: max lookahead is 6 days, and a rule's local calendar date is at
// most 1 day ahead of the UTC date. Anything past this cannot be due.
const prefilter = databaseDate(addDays(utcToday, RECURRENCE_MAX_LOOKAHEAD_DAYS + 1));
```
This keeps `RecurrenceRule_materialized_through_idx` `[VERIFIED: apps/api/prisma/schema.prisma:217]` — verbatim: `@@index([materializedThrough], map: "RecurrenceRule_materialized_through_idx")` — index-useful.

**Also add the ended-rule predicate** (this was Info finding IN-04 in the review, left unfixed, and it becomes load-bearing once the tick gets faster): `OR: [{ endsOn: null }, { endsOn: { gte: databaseDate(utcToday) } }]`. Without it every rule that ever existed is re-locked and re-walked on every tick — currently 4×/day, but 24×/day after the tick change. **⚠ See §3's watermark-staleness interaction before adopting it blindly.**

---

## §2 — D-11: Per-rule local-midnight detection (the key technical risk)

### The reusable machinery that already exists

`[VERIFIED: apps/api/src/modules/recurrence/recurrence-date.ts:206-224]` — verbatim:
```ts
function offsetMinutesAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const zone = parts.find((part) => part.type === 'timeZoneName')?.value;
  // Intl renders a zero offset as the bare string "GMT" (or "UTC" in some ICU
  // builds), which the offset pattern below deliberately does not match.
  if (zone === 'GMT' || zone === 'UTC') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zone ?? '');
  // Anything else is unparsed, not UTC. Silently treating it as UTC would
  // reinterpret every occurrence in that zone by whole hours with no log line.
  if (match === null) {
    throw new Error(`unresolvable UTC offset for time zone ${timeZone} (got ${String(zone)})`);
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}
```

Note this is `function`, **not** `export function` — it is module-private. The new helper belongs in the same module so it does not need to be exported.

There is also an `Intl.DateTimeFormat('en-CA', …)` wall-clock extraction precedent in the events create path `[VERIFIED: apps/api/src/modules/events/events.service.ts:160-168]` — verbatim:
```ts
      const timeParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: recurrence.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(start);
```

### Recommended approach: don't detect midnight — derive the calendar date

**Proposed new export in `apps/api/src/modules/recurrence/recurrence-date.ts`** (place it next to `offsetMinutesAt`, ~line 205, so it can reuse the private helper if desired):

```ts
/**
 * The current calendar date in `timeZone`. D-11 anchors the generation window
 * on the RULE's local midnight, not the server's — a 0-day daily lookahead in
 * Asia/Shanghai must produce today's row at 00:00 CST, not at 08:00 CST when
 * the UTC date finally rolls over.
 *
 * `en-CA` renders as YYYY-MM-DD, which `parseIsoDate` already validates.
 */
export function currentCalendarDateIn(timeZone: string, now: Date = new Date()): CalendarDate {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parseIsoDate(iso);
}
```

**Why this removes the need for midnight detection entirely** `[ASSUMED — design reasoning; verify with the integration test in §Validation]`:

1. Generation is already **idempotent** — `(recurrenceRuleId, occurrenceDate)` is a unique key `[VERIFIED: apps/api/prisma/schema.prisma:182]` — verbatim: `@@unique([recurrenceRuleId, occurrenceDate], map: "Task_rule_occurrence_key")`; and `[VERIFIED: apps/api/prisma/schema.prisma:157]` — verbatim: `@@unique([recurrenceRuleId, occurrenceDate], map: "Event_rule_occurrence_key")` — and both writes use `skipDuplicates: true` `[VERIFIED: apps/api/src/modules/recurrence/recurrence-materializer.service.ts:153]` and `[VERIFIED: …:189]`.
2. Generation is **watermark-anchored**, so a tick that finds nothing new does nothing.
3. Therefore: recompute the horizon from the rule's own timezone on *every* tick. Before local midnight the horizon has not advanced → 0 rows. On the first tick after local midnight the horizon advances by one day → exactly the newly-eligible occurrences are written. The "detection" is the horizon formula's own output.

**Consequences of this design — all favourable:**

| Concern | Outcome |
|---|---|
| No new column | ✔ No `lastCheckedLocalDate`, no migration. The watermark itself is the state. |
| Process down across a midnight boundary | ✔ Catches up on the next tick; the horizon is absolute, not incremental. |
| Rules in different timezones cross midnight at different real instants | ✔ Each rule computes its own `today` independently on the same tick. |
| DST transitions | ✔ `Intl` resolves the local calendar date directly; no day arithmetic on UTC timestamps is involved. |
| Rule's `timezone` changed by an edit | ✔ Horizon recomputes from the new zone on the next tick. |

**The one real cost: tick granularity.** `[VERIFIED: apps/api/src/modules/recurrence/recurrence-scheduler.ts:4]` — verbatim: `export const RECURRENCE_TICK_MS = 6 * 60 * 60 * 1000;`. With a 6-hour tick, a `daily` rule's "today" row can appear up to ~6 hours after local midnight — which visibly violates D-11's "当天 0 点后才生成'今天'这一条".

**Recommendation: `RECURRENCE_TICK_MS = 60 * 60 * 1000` (1 hour).** Rationale:
- Worst-case lag becomes ≤ 60 min, acceptable for a household task that is due sometime today.
- Every IANA offset in current use is a whole number of 15-minute increments, and every DST transition happens on the hour or half-hour, so an hourly tick never lands *mid-transition* in a way that matters here — the helper reads a calendar date, not a wall time.
- 15 minutes would tighten it further but multiplies `materializeAllDue`'s table scan by 4× again; combined with the ended-rule predicate it is defensible, but 1 hour is the better default. **This is a discretion item D-11 explicitly delegates.**
- The existing `.unref()` and `NODE_ENV === 'test'` guard `[VERIFIED: apps/api/src/modules/recurrence/recurrence-scheduler.ts:14]` — verbatim: `if (process.env.NODE_ENV === 'test') return;` — mean tests are unaffected by the frequency change.

### Pitfalls to encode as verification steps

| # | Pitfall | Guard |
|---|---|---|
| P1 | Using UTC `today` anywhere in `materializeRule` after the change. There are currently **two** call sites of `new Date().toISOString().slice(0, 10)` in that file (lines 51 and 92); only line 92 must become timezone-aware — line 51's prefilter must stay UTC-based with a `+1` safety margin (§1). | Assert a `daily` rule in `Asia/Shanghai` materializes "today" when the process clock is 16:30 UTC of the previous day. |
| P2 | `currentCalendarDateIn` throwing on an invalid timezone. `RecurrenceRule.timezone` is `VARCHAR(64)` `[VERIFIED: apps/api/prisma/schema.prisma:195]` and is validated on input by `IsIanaTimeZone` `[VERIFIED: apps/api/src/modules/recurrence/dto/recurrence.dto.ts:31-54]`, but an ICU data change could later invalidate a stored zone. `materializeAllDue` iterates rules in a bare `for` loop with no per-rule try/catch `[VERIFIED: …materializer.service.ts:64-66]` — verbatim: `for (const rule of dueRules) created += (await this.materializeRule(rule.id)).created;` — so one bad zone aborts the whole tick. | Wrap the per-rule call in try/catch + `this.logger.error`, mirroring `RecurrenceScheduler`'s existing convention. |
| P3 | Tick frequency vs. `pg_try_advisory_xact_lock`. A faster tick raises the chance a create-time `materializeRule` collides with a tick. This is already handled — WR-04 made the skip observable `[VERIFIED: …materializer.service.ts:74-77]` — verbatim includes `this.logger.warn(\`materialization skipped: rule ${ruleId} is locked by another writer\`);` — and the skipping caller just retries next tick. No change needed, but expect more of these warnings in logs. |

---

## §3 — D-13: No retroactive cleanup (and the one guard that IS needed)

### Confirmed: no cleanup or backfill job exists

Exhaustive grep of `apps/api/src` for row deletion of instances (excluding generated Prisma client docs) returns exactly five call sites `[VERIFIED: grep over apps/api/src, this session]`:

| Call site | User-initiated? |
|---|---|
| `apps/api/src/modules/events/events.service.ts:391` (`event.delete` — one-time rows only) | yes |
| `apps/api/src/modules/tasks/tasks.service.ts:428` (`task.delete` — one-time rows only) | yes |
| `apps/api/src/modules/recurrence/recurrence.service.ts:203` (`task.deleteMany`, inside `updateSeriesFromOccurrence`) | yes |
| `apps/api/src/modules/recurrence/recurrence.service.ts:236` (`event.deleteMany`, same) | yes |
| `apps/api/src/modules/recurrence/recurrence.service.ts:292,296` (`deleteSeriesFromOccurrence`) | yes |

**The generate path contains no delete of any kind.** `materializeRule` only calls `createManyAndReturn`, `createMany`, `findMany`, `findFirst`, `findUnique`, and one `recurrenceRule.update`. There is likewise exactly one scheduler in the whole API `[VERIFIED: grep for `setInterval|@Cron|ScheduleModule` over apps/api/src → only `recurrence-scheduler.ts`]`. **Nothing needs to be suppressed for D-13.**

### ⚠ The guard that IS required: watermark monotonicity

`[VERIFIED: apps/api/src/modules/recurrence/recurrence-materializer.service.ts:114-124]` — verbatim:
```ts
      // Never claim coverage past what this run actually wrote — a truncated
      // run must leave the remainder due so the next tick picks it up.
      const truncated = occurrences.length === RECURRENCE_MAX_INSTANCES_PER_RUN;
      await tx.recurrenceRule.update({
        where: { id: ruleId },
        data: {
          materializedThrough: databaseDate(
            truncated ? occurrences[occurrences.length - 1]! : horizon,
          ),
        },
      });
```

This write is **unconditional**. Under D-11 the new `horizon` (≈ today+6) is *smaller* than every legacy rule's existing `materializedThrough` (≈ today+90). So on the first tick after deploy, every pre-existing rule's watermark would be **rewound by ~84 days**.

**Does that delete rows? No.** `walkStart = materializedThrough + 1` ≈ today+91 > horizon ≈ today+6, so `walkOccurrences` emits nothing (`mayInclude` fails at `compareDates(date, horizon) <= 0`), `created === 0`, and the association fan-out is skipped by the `created.length > 0` / `created.length === 0` guards `[VERIFIED: …materializer.service.ts:158]` and `[VERIFIED: …:193]`. **D-13's "不做清理/回滚" is satisfied by the horizon change alone — the generate path is structurally additive.** ✔

**But the rewind still causes two real problems:**

1. **The household watermark shrinks.** Both list endpoints surface `_min(materializedThrough)` across all rules `[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:256-259]` — verbatim:
   ```ts
      this.prisma.recurrenceRule.aggregate({
        _min: { materializedThrough: true },
        where: { householdId },
      }),
   ```
   (identical at `[VERIFIED: apps/api/src/modules/events/events.service.ts:287-290]`). A legacy rule that genuinely has rows out to today+90 would start reporting today+6, making the client's `beyondGenerationWindow` state lie about data that exists.
2. **It discards true information for free.** The rule really *is* materialized through today+90; the watermark's contract per D-11 is "最近一次成功生成检查覆盖到的日期", and coverage through today+90 is a superset of coverage through today+6.

**Recommended guard (add to the update at lines 117-124):**
```ts
      const runWatermark = truncated ? occurrences[occurrences.length - 1]! : horizon;
      const existing = rule.materializedThrough === null ? null : calendarDate(rule.materializedThrough);
      // D-13: the watermark is forward-only. Shrinking it when the horizon
      // narrows would make the household's generation window under-report rows
      // that genuinely exist, and would re-open dates the generator already
      // settled. Generation never deletes; the watermark must not pretend it did.
      const nextWatermark = existing !== null && compareDates(existing, runWatermark) > 0
        ? existing
        : runWatermark;
      await tx.recurrenceRule.update({
        where: { id: ruleId },
        data: { materializedThrough: databaseDate(nextWatermark) },
      });
```
`compareDates` is already exported `[VERIFIED: apps/api/src/modules/recurrence/recurrence-date.ts:63-65]` — verbatim: `export function compareDates(left: CalendarDate, right: CalendarDate): number {`.

Monotonicity is compatible with the truncation branch: a truncated run's `occurrences[last]` is by construction ≥ `walkStart` = `existing + 1` > `existing`, so `max()` picks it. ✔

### ⚠ Interaction warning: monotonic watermark + ended-rule prefilter

If the planner adopts **both** the monotonic guard (§3) and the ended-rule predicate (§1, ex-IN-04), a rule whose `endsOn` has passed freezes its watermark permanently at whatever past date it stopped. `_min(materializedThrough)` across the household then goes permanently stale, and `todayIso > materializedThrough` `[VERIFIED: apps/client/app/(protected)/households/[id]/tasks/index.tsx:202-205]` becomes permanently true → the tasks screen shows "更远的重复还没生成" forever.

**Mitigation (required if both are adopted):** scope the aggregate to live rules —
```ts
this.prisma.recurrenceRule.aggregate({
  _min: { materializedThrough: true },
  where: { householdId, OR: [{ endsOn: null }, { endsOn: { gte: todayDate } }] },
})
```
in **both** `tasks.service.ts:256-259` and `events.service.ts:287-290`.

---

## §4 — D-12: Does create already satisfy it? (Answer: yes for the generation pass, no for the seed row)

### The generation pass: already correct, no change needed ✔

`[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:211-220]` — verbatim:
```ts
      // See EventsService.create: the series is already committed, so a
      // transient materialization failure must not surface as a 500.
      try {
        const materialization = await this.materializer.materializeRule(created.ruleId);
        if (materialization.skipped) {
          this.logger.warn(`rule ${created.ruleId} was locked at create time; the scheduler will generate it`);
        }
      } catch (error: unknown) {
        this.logger.error(`immediate materialization failed for rule ${created.ruleId}`, error);
      }
```
(structurally identical at `[VERIFIED: apps/api/src/modules/events/events.service.ts:210-221]`).

`materializeRule` recomputes `today` and `horizon` from scratch on every invocation (§1, lines 92-93) — it carries no notion of "this is a create". So **once D-11's horizon logic lands, the existing post-commit call becomes exactly D-12's "立刻执行一次标准的生成检查", with zero edits to either create method.** This is the "no code change needed" finding the brief anticipated — for the generation pass.

### ⚠ The seed row: the literal reading of D-12 breaks three things

Both create paths **unconditionally write a first occurrence row inside the transaction, before `materializeRule` runs** `[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:195-209]` — verbatim excerpt:
```ts
        const task = await tx.task.create({
          data: {
            householdId,
            title: trimmedTitle,
            …
            recurrenceRuleId: rule.id,
            occurrenceDate: new Date(`${firstOccurrenceIso}T00:00:00.000Z`),
            assignees: { create: assigneeIds.map((userId) => ({ userId })) },
          },
        });
```
D-12's "不强制'至少生成一条'" implies removing this. That would break:

**(a) The materializer cannot identify a rule with no instances.**
`[VERIFIED: apps/api/src/modules/recurrence/recurrence-materializer.service.ts:82-90]` — verbatim:
```ts
      const taskTemplate = await tx.task.findFirst({
        where: { recurrenceRuleId: ruleId },
        orderBy: { occurrenceDate: 'asc' },
      });
      const eventTemplate = await tx.event.findFirst({
        where: { recurrenceRuleId: ruleId },
        orderBy: { occurrenceDate: 'asc' },
      });
      if (taskTemplate === null && eventTemplate === null) return { skipped: false, created: 0 };
```
CR-01 moved *field values* onto the rule, but **kind discrimination still comes from which relation has a row** — see the dispatch at `[VERIFIED: …materializer.service.ts:110-112]` — verbatim:
```ts
      const created = taskTemplate !== null
        ? await this.materializeTaskOccurrences(tx, rule, taskTemplate, occurrences)
        : await this.materializeEventOccurrences(tx, rule, eventTemplate!, occurrences);
```
A weekly rule created outside its 6-day window would have zero instances → `return { skipped: false, created: 0 }` on every tick, **forever**. A permanently dead rule.

**(b) Assignees and labels still live on the template *instance*, not on the rule.**
`[VERIFIED: …materializer.service.ts:204-208]` — verbatim:
```ts
  private async materializeTaskAssociations(tx: TransactionClient, templateTaskId: string, newTaskIds: string[]): Promise<void> {
    const [assignees, labels] = await Promise.all([
      tx.taskAssignee.findMany({ where: { taskId: templateTaskId }, select: { userId: true } }),
      tx.taskLabel.findMany({ where: { taskId: templateTaskId }, select: { labelId: true } }),
    ]);
```
and `[VERIFIED: …materializer.service.ts:194]` — verbatim: `const labels = await tx.eventLabel.findMany({ where: { eventId: template.id }, select: { labelId: true } });`. With no seed row there is nothing to copy from — the user's chosen assignees would silently vanish.

**(c) The `POST /tasks` response contract and the client's label attachment.**
`TasksService.create` returns `TaskResponseDto` and re-reads the created row `[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:221-225]` — verbatim:
```ts
      const task = await this.prisma.task.findUniqueOrThrow({
        where: { id: created.taskId },
        include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
      });
      return this.toResponse(task);
```
and the client uses `task.id` to attach labels `[VERIFIED: apps/client/app/(protected)/households/[id]/tasks/new.tsx:73-77]` — verbatim:
```ts
      const task = await sessionApiClient.createTask(token, householdId, data);
      // Tag the new task with selected labels
      if (selectedLabelIds.length > 0) {
        await sessionApiClient.tagTask(token, householdId, task.id, { labelIds: selectedLabelIds });
      }
```
With no instance there is no `id` to return, no row to tag, and both create screens would need reworking plus an OpenAPI/generated-client change.

### The two paths — see Open Questions Q1

| | **Path A — literal D-12** (no seed row) | **Path B — seed-preserving** (RECOMMENDED) |
|---|---|---|
| Schema | New `RecurrenceRule.kind` column + rule-level assignee/label template (`String[] @db.Uuid` arrays, mirroring the existing `byWeekday Int[]`, or two join tables) → **2 hand-authored migrations with backfill** | **None** |
| `POST /tasks` / `POST /events` contract | Response must become nullable/synthetic; client create screens + label attachment reworked; OpenAPI + generated client regenerated | Unchanged |
| Client churn | tasks/new.tsx, events/new.tsx, models.ts, client.ts, openapi.json | None |
| Delivers the user's complaint fix? | Fully (0 rows) | Substantially — **1 row instead of ~13** for a new daily/weekly task; the one row is the occurrence the user just deliberately created |
| Risk | HIGH — touches the create contract, adds migrations with backfill, and the "dead rule" failure mode is silent | LOW |

**Recommendation: Path B**, with a one-line doc comment on the seed row recording that it is the deliberate exception to D-11's lookahead. **This softens D-12's literal "不强制至少生成一条" and therefore needs explicit user confirmation before the plan locks it** — see Assumptions Log A1 / Open Questions Q1.

---

## §5 — D-15: Recurring-only filter

### Current state: task list filters are entirely client-side

`ListFilters` and the server `where` builder exist `[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:56-60]` — verbatim:
```ts
interface ListFilters {
  status?: string | undefined;
  priority?: string | undefined;
  assigneeId?: string | undefined;
}
```
`[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:244-247]` — verbatim:
```ts
    const where: Record<string, unknown> = { householdId };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assignees = { some: { userId: filters.assigneeId } };
```
The controller wires them with `@ApiQuery` `[VERIFIED: apps/api/src/modules/tasks/tasks.controller.ts:55-65]` — verbatim:
```ts
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'assigneeId', required: false })
  async list(
    @Req() request: AuthenticatedRequest,
    @Param('householdId') householdId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
  ): Promise<TaskListResponseDto> {
    return this.tasksService.list(request.auth.sub, householdId, { status, priority, assigneeId });
  }
```

**But the client never uses them.** It calls `sessionApiClient.listTasks(token, householdId)` with no filter args `[VERIFIED: apps/client/app/(protected)/households/[id]/tasks/index.tsx:134]` — verbatim: `sessionApiClient.listTasks(token, householdId),` — and filters in a `useMemo` `[VERIFIED: …tasks/index.tsx:91-106]`. This matters: the D-15 client chip should follow the *existing* client-side pattern, not introduce a second, refetching mechanism into the same panel.

**IN-03 (`as any`) is still unfixed** `[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:251,255]` — verbatim: `where: where as any,` and `this.prisma.task.count({ where: where as any }),`; same at `[VERIFIED: apps/api/src/modules/events/events.service.ts:282,286]`. Adding a field to the `Record<string, unknown>` therefore typechecks trivially — which is exactly the risk IN-03 named. Recommend typing the accumulator as `Prisma.TaskWhereInput` / `Prisma.EventWhereInput` while touching these lines.

### Minimal diff

**API (tasks):**
```ts
interface ListFilters {
  status?: string | undefined;
  priority?: string | undefined;
  assigneeId?: string | undefined;
  recurring?: string | undefined;   // 'true' | 'false'
}
// in list():
if (filters.recurring === 'true') where.recurrenceRuleId = { not: null };
else if (filters.recurring === 'false') where.recurrenceRuleId = null;
```
plus `@ApiQuery({ name: 'recurring', required: false })` and `@Query('recurring') recurring?: string` on `TasksController.list`, following the `assigneeId` line exactly.

**API (events):** `EventsService.list` takes positional params `[VERIFIED: apps/api/src/modules/events/events.service.ts:246-251]` — verbatim:
```ts
  async list(
    actorId: string,
    householdId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<EventListResponseDto> {
```
Adding a 5th positional is the smallest diff but worsens an already-awkward signature. **Recommend refactoring to a `ListFilters` object** to match `TasksService`, updating the one caller `[VERIFIED: apps/api/src/modules/events/events.controller.ts:67]` — verbatim: `return this.eventsService.list(request.auth.sub, params.householdId, startDate, endDate);`.

⚠ Note `EventsController` still uses the intersection param DTO that WR-01 removed from the recurrence controller `[VERIFIED: apps/api/src/modules/events/events.controller.ts:33-36, 61-67]` — verbatim:
```ts
class HouseholdIdParam {
  @IsUUID('4')
  householdId!: string;
}
```
with `@Param() params: HouseholdIdParam`. The WR-01 fix note says design:paramtypes emits `Object` for intersection types so validators never run — that applies to `HouseholdIdParam & { eventId: string }` at lines 75/85/97. It is out of this addendum's scope, but the planner should know the pattern to copy is `recurrence.controller.ts`'s per-param pipe `[VERIFIED: apps/api/src/modules/recurrence/recurrence.controller.ts:20]` — verbatim: `const uuidParam = new ParseUUIDPipe({ version: '4' });`.

**Generated client:** `listTasks(accessToken, householdId, status?, priority?, assigneeId?, signal?)` `[VERIFIED: apps/api/src/openapi/generate-openapi.ts:874-894]`. Adding `recurring?: boolean` before `signal` is source-compatible (all current callers pass ≤ 2 args). **This is an edit to the template literal in `generate-openapi.ts`, not to `packages/api-client/src/generated/client.ts`** — see "Don't Hand-Roll".

**Client UI (tasks):** add a 5th chip group inside the existing collapsible panel, following the priority-filter chip exactly `[VERIFIED: apps/client/app/(protected)/households/[id]/tasks/index.tsx:346-370]` — the chip uses `accessibilityRole="radio"`, `accessibilityState={{ selected: … }}`, `hitSlop={activeTheme.spacing[3]}`, `borderRadius: activeTheme.borderRadii.full`, and `accessibilityLabel={`优先级筛选：${p.label}`}`. Add `recurringFilter` to the `activeFilterCount` array `[VERIFIED: …tasks/index.tsx:108-109]` — verbatim:
```ts
  const activeFilterCount = [filter !== 'all', priorityFilter !== 'all', assigneeFilter !== 'all', labelFilter !== 'all']
    .filter(Boolean).length;
```
⚠ `activeFilterCount === 0` also gates the `beyondGenerationWindow` empty state `[VERIFIED: …tasks/index.tsx:202-205]`, so adding a filter automatically keeps that state suppressed when the new chip is active — correct behaviour, no extra work.

**Client UI (events):** the calendar screen has only a label filter and no collapsible panel; `selectedDateEvents` filters by date + label in one `useMemo` `[VERIFIED: apps/client/app/(protected)/households/[id]/events/index.tsx:133-142]`. Adding a recurring chip there means a small new row next to the label chips, and extending the `labelFilter === 'all'` guard on `beyondGenerationWindow` `[VERIFIED: …events/index.tsx:144-148]`.

---

## §6 — D-14: Rule-anchored "结束此重复"

### The logic to reuse (verbatim)

`[VERIFIED: apps/api/src/modules/recurrence/recurrence.service.ts:278-300]`:
```ts
    await this.prisma.$transaction(async (tx) => {
      const occurrence = await this.resolveRuleForOccurrence(tx, kind, householdId, occurrenceId);
      if (!this.canMutate(role, occurrence.createdBy, actorId)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the creator, admin, or owner can delete this series.' });
      }
      const splitCalendarDate = parseIsoDate(occurrence.occurrenceDate.toISOString().slice(0, 10));
      await tx.recurrenceRule.update({
        where: { id: occurrence.rule.id },
        data: {
          endsOn: new Date(`${formatIsoDate(addDays(splitCalendarDate, -1))}T00:00:00.000Z`),
          count: null,
        },
      });
      if (kind === 'task') {
        await tx.task.deleteMany({
          where: { recurrenceRuleId: occurrence.rule.id, occurrenceDate: { gte: occurrence.occurrenceDate } },
        });
      } else {
        await tx.event.deleteMany({
          where: { recurrenceRuleId: occurrence.rule.id, occurrenceDate: { gte: occurrence.occurrenceDate } },
        });
      }
    });
```
Everything after `resolveRuleForOccurrence` depends only on `(ruleId, anchorDate, kind)`. **Extract it as `private async endSeriesAt(tx, kind, ruleId, anchor: Date): Promise<void>` and have both callers use it.**

### Recommendation: option (a) — a new rule-scoped endpoint

Prefer **(a) `POST /households/:householdId/recurrence-rules/:ruleId/end`** over **(b) client resolves the next occurrence and calls `/series`**, because:

1. Under D-11 there may be **no materialized future occurrence at all** (a weekly rule outside its 6-day window). Option (b) then has nothing to point at and is structurally broken by the very change this addendum makes.
2. Option (b) needs an extra client round-trip and a race window between resolution and mutation.
3. Option (a) needs no `kind` discrimination if you simply issue **both** `deleteMany` calls — a rule only ever owns one relation's rows, so the other is a zero-row no-op. That eliminates the only reason (a) would need a schema change.
4. D-14's copy requirement ("文案不用'删除'") is a client concern either way.

**Anchor recommendation: `addDays(currentCalendarDateIn(rule.timezone), 1)`** — i.e. end *after today*, setting `endsOn = today`. Rationale: D-14 mandates "结束" not "删除" semantics; anchoring at today itself would delete a task the user may have already completed this morning. Anchoring at tomorrow means "从明天起不再重复", which is what "结束" reads as. **This is a discretion call the plan should state explicitly in its copy.** Note the D-11 helper serves this directly — no new date machinery.

### Exact files

| File | Change |
|---|---|
| `apps/api/src/modules/recurrence/recurrence.controller.ts` | New `@Controller('households/:householdId/recurrence-rules')` class (`RecurrenceRulesController`), reusing the module-level `uuidParam` pipe at line 20. `@Post(':ruleId/end')` + `@HttpCode(204)` + `@ApiNoContentResponse()` — mirror `EventSeriesController.delete` at lines 43-56. |
| `apps/api/src/modules/recurrence/recurrence.service.ts` | New `endRule(actorId, householdId, ruleId)`; extract `endSeriesAt`. Reuse `resolveActorRole` (lines 25-33) and `canMutate` (35-38) against `rule.createdBy`. 404 with `{ code: 'RECURRENCE_RULE_NOT_FOUND', message: 'Recurrence rule not found.' }` — the exact literal already at line 62 — when `rule === null || rule.householdId !== householdId` (SAFE-01). |
| `apps/api/src/modules/recurrence/recurrence.module.ts` | Add the controller to the `controllers` array `[VERIFIED: apps/api/src/modules/recurrence/recurrence.module.ts:8]` — verbatim: `controllers: [EventSeriesController, TaskSeriesController],`. |
| `apps/api/src/openapi/generate-openapi.ts` | Add `endRecurrenceRule` to `clientSource`; add an assertion to the guard block near lines 1366-1375. |

**Is there already a `GET` returning `RecurrenceRule` rows directly? No.** The only exposure of rule data is the nested `recurrence` object on task/event responses `[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:445-457]` and `[VERIFIED: apps/api/src/modules/events/events.service.ts:409-421]`, plus the `_min(materializedThrough)` aggregate. **One new list endpoint serves both D-14's anchor-free access and D-16's list** — see §8.

---

## §7 — D-11's UI fallout (must be planned, not discovered later)

Two shipped screens hard-code the 90-day window in copy and semantics.

`[VERIFIED: apps/client/app/(protected)/households/[id]/tasks/index.tsx:520-533]` — verbatim:
```tsx
        {!loading && error === null && filteredTasks.length === 0 && (
          beyondGenerationWindow ? (
            <StatusPanel
              action={null}
              body="重复安排会按 90 天窗口自动补齐。稍后再看这里，或先查看更近的日期。"
              heading="更远的重复还没生成"
              kind="offline"
            />
```
`[VERIFIED: apps/client/app/(protected)/households/[id]/events/index.tsx:352]` — verbatim: `body="重复安排会按 90 天窗口自动补齐。稍后再看这里，或先查看更近的日期。"`

**Severity differs by screen:**

- **Tasks (low):** the predicate is `todayIso > materializedThrough` `[VERIFIED: …tasks/index.tsx:202-205]` — it compares *today* against the watermark, so under D-11 (watermark ≥ today for every live rule) it stays false. Only the copy string needs updating.
- **Calendar (HIGH):** the predicate is `selectedDateIso > materializedThrough` `[VERIFIED: apps/client/app/(protected)/households/[id]/events/index.tsx:144-148]` — verbatim:
  ```ts
    const beyondGenerationWindow =
      labelFilter === 'all' &&
      materializedThrough !== null &&
      selectedDateIso !== null &&
      selectedDateIso > materializedThrough;
  ```
  With a ~6-day watermark, **every date more than 6 days in the future shows "更远的重复还没生成"** — including dates with no recurring content at all. This is a visible regression on the main calendar.

**Recommendation:** keep the state but rewrite it as informational, and reword both strings to describe the lookahead rather than a window length (e.g. 重复安排会在临近日期时自动生成). Also note that under the monotonic-watermark guard, *legacy* rules keep a ~today+90 watermark for months, so the household `_min` may stay large for a while and mask the regression during testing — **test with a household containing only newly-created rules.** Also note the UI-SPEC lock: 07-UI-SPEC.md line 226 is cited in the review-fix as pinning the monthly clamp note's copy byte-for-byte `[CITED: .planning/phases/07-recurring-events-tasks/07-REVIEW-FIX.md:125]`; check whether the generation-window copy is similarly locked before rewording.

---

## §8 — D-16: Rule management list + detail

### The list endpoint (shared with D-14)

`GET /households/:householdId/recurrence-rules` → `RecurrenceRuleListResponseDto { rules: RecurrenceRuleListItemDto[]; total: number }`, following the `LabelListResponseDto { labels; total }` shape `[VERIFIED: apps/api/src/openapi/generate-openapi.ts:389-392]`.

**Fields to expose** (all sourced from columns confirmed at `[VERIFIED: apps/api/prisma/schema.prisma:186-219]` — verbatim field list):
```prisma
model RecurrenceRule {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  householdId         String    @map("household_id") @db.Uuid
  freq                String    @db.VarChar(10)
  interval            Int       @default(1)
  byWeekday           Int[]     @map("by_weekday")
  startsOn            DateTime  @map("starts_on") @db.Date
  endsOn              DateTime? @map("ends_on") @db.Date
  count               Int?
  timezone            String    @db.VarChar(64)
  materializedThrough DateTime? @map("materialized_through") @db.Date
  startTimeLocal      String?   @map("start_time_local") @db.VarChar(5)
  durationMinutes     Int?      @map("duration_minutes")
  templateTitle       String    @map("template_title") @db.VarChar(200)
  templateDescription String?   @map("template_description") @db.Text
  templatePriority    String    @default("medium") @map("template_priority") @db.VarChar(10)
  templateLocation    String?   @map("template_location") @db.VarChar(255)
  templateAllDay      Boolean   @default(false) @map("template_all_day")
  createdBy           String    @map("created_by") @db.Uuid
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt           DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)
```

| DTO field | Source |
|---|---|
| `id`, `freq`, `interval`, `byWeekday`, `startsOn`, `endsOn`, `count`, `timezone`, `startTimeLocal`, `durationMinutes`, `materializedThrough` | direct columns; format dates as `YYYY-MM-DD` per the existing `RecurrenceResponseDto` convention `[VERIFIED: apps/api/src/modules/recurrence/dto/recurrence.dto.ts:95-107]` |
| `title` ← `templateTitle`, `description` ← `templateDescription` | CR-01 columns. **These exist precisely because the earliest instance is not a trustworthy template** — D-16's "模板标题" maps to `templateTitle`, not to any instance's `title`. |
| `kind: 'task' \| 'event'` | **No column exists.** Derive without a migration via `include: { _count: { select: { tasks: true, events: true } } }` (`events Event[]` / `tasks Task[]` relations exist `[VERIFIED: apps/api/prisma/schema.prisma:213-214]` — verbatim: `events    Event[]` / `tasks     Task[]`). ⚠ Under Path B a rule always has ≥ 1 instance, so this is always resolvable. Under Path A it is not — another argument for Path B. |
| `nextOccurrenceDate` | **Compute from the rule, not from rows** — see below. |

**`nextOccurrenceDate` — compute, don't query.** Querying `MIN(occurrenceDate) WHERE occurrenceDate >= today` only sees *materialized* rows; under a 6-day horizon a weekly rule frequently has no future row, which would render "下一次发生日期" as empty on a perfectly healthy rule. Use the pure walker instead — this is exactly what CR-02's `from` option enables:
```ts
const today = currentCalendarDateIn(rule.timezone);
const next = walkOccurrences({
  freq: rule.freq, interval: rule.interval, byWeekday: rule.byWeekday,
  startsOn: calendarDate(rule.startsOn),
  endsOn: rule.endsOn === null ? null : calendarDate(rule.endsOn),
  count: rule.count,
}, { horizon: addDays(today, 400), from: today })[0] ?? null;
```
400 days covers `yearly`. Enumeration cost is bounded by `RECURRENCE_MAX_WALK_STEPS = 20_000` and `count` stays correctly anchored because the walk still starts at `startsOn` (that is the documented contract at `recurrence-date.ts:19-25`). `[ASSUMED — the walker's `from` semantics are documented and tested, but this specific call shape is not exercised anywhere today; the plan should add a unit test.]`

**Visibility (D-16 leaves it to planning):** recommend **household-wide read**, matching every other household resource — labels, notes, events and tasks all list by `householdId` with only `resolveActorRole` gating `[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:241-247]`. Keep **mutation** gated by `canMutate(role, rule.createdBy, actorId)` so a MEMBER can only end/edit their own rules — identical to the existing series paths. SAFE-01 is satisfied by the `resolveActorRole → 404 HOUSEHOLD_NOT_FOUND` prologue every service method already uses `[VERIFIED: apps/api/src/modules/recurrence/recurrence.service.ts:73-76]` — verbatim:
```ts
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }
```

### ⚠ `formatRecurrenceSummary` null-vs-undefined trap (concrete bug the plan must avoid)

`[VERIFIED: apps/client/src/features/recurrence/recurrence-summary.tsx:48-59]` — verbatim:
```tsx
export function formatRecurrenceSummary(
  rule: RecurrenceDto,
  deviceTimeZone: string,
): FormattedRecurrenceSummary {
  const { month, day } = dateParts(rule.startsOn);
  let summary = frequencySummary(rule);

  if (rule.endsOn !== undefined) {
    summary += `，到 ${rule.endsOn} 为止`;
  } else if (rule.count !== undefined) {
    summary += `，共 ${rule.count} 次`;
  }
```
It takes **`RecurrenceDto`** (the *request* shape, where absent fields are `undefined`) and tests `!== undefined`. A response DTO carries `endsOn: string | null` `[VERIFIED: apps/api/src/openapi/generate-openapi.ts:247]` — verbatim: `  endsOn?: string | null;`. Passing a response object directly yields `null !== undefined === true` → the summary renders **"，到 null 为止"**.

**The correct bridge already exists:** `recurrenceInputFromResponse` strips nulls `[VERIFIED: apps/client/src/features/recurrence/recurrence-picker.tsx:37-58]` — verbatim excerpt:
```ts
    ...(response.endsOn === null || response.endsOn === undefined
      ? {}
      : { endsOn: response.endsOn }),
    ...(response.count === null || response.count === undefined ? {} : { count: response.count }),
```
D-16's list rows **must** call `recurrenceInputFromResponse(rule)` before `formatRecurrenceSummary(...)`. Note it is exported from `recurrence-picker.tsx`, not from `recurrence-summary.tsx`.

### Client screens

**Routes** (Expo Router, file-based under `apps/client/app/(protected)/households/[id]/`):
- `recurrence-rules/index.tsx` — list
- `recurrence-rules/[ruleId]/index.tsx` — detail

This matches the existing `notes/index.tsx` + `notes/[noteId]/index.tsx` + `notes/[noteId]/edit.tsx` shape `[VERIFIED: file listing of apps/client/app, this session]`.

**Closest screen analog: `labels/index.tsx`** — it is the household-scoped management screen and already carries every convention D-16 needs `[VERIFIED: apps/client/app/(protected)/households/[id]/labels/index.tsx]`:
- `useLocalSearchParams<{ id: string }>()` + `const householdId = id ?? currentHouseholdId;` (line 56)
- `useFocusEffect(useCallback(() => { void fetchLabels(); }, [fetchLabels]))` for refetch-on-focus (lines 81-85) — with the comment explaining why (lines 78-80)
- `AppShell` with `accessibilityLabel` / `title` / `showProfile` / `refreshing` / `onRefresh` (line 204)
- The three guard branches in order: `viewState === 'accessChanged'` → `AccessChangedPanel` (166-177), then `householdId === undefined || householdId === ''` → "这个页面暂时无法访问。" (179-187)
- `HouseholdHeader` + `HouseholdSwitcher` pair with `handleSwitch` doing `router.replace` to the same route (93-103)
- `sessionApiClient` / `sessionTransport.getAccessToken()` with a `token === null` → "登录已过期。" branch (64-68)
- Inline two-step delete confirmation (`confirmDeleteId`) at 385-409 — **the pattern D-14's "结束此重复" confirm should follow**, but with 结束 copy, not 删除.

**Entry point:** add a 7th quick-access `Pressable` card to the household hub `[VERIFIED: apps/client/app/(protected)/households/[id]/index.tsx:200-226]` — the `handleOpenLabels` card is the exact template (`Tag` icon from `lucide-react-native/icons/tag`, `accessibilityLabel`, `Text variant="label"` + `variant="bodySm" color="inkMuted"` + `进入 ›`). A `Repeat` or `RefreshCw` Lucide icon fits; imports must use the explicit subpath form `[VERIFIED: apps/client/app/(protected)/households/[id]/index.tsx:5-9]` — verbatim: `import Tag from 'lucide-react-native/icons/tag';` — because the Jest moduleNameMapper depends on it `[VERIFIED: apps/client/jest.config.js]` — verbatim: `'^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',`.

### Editing a rule from the detail screen

D-16 scopes editing to **频率 / 星期 / 结束条件** — exactly the fields `RecurrencePicker` owns. It is reusable as-is: its props are `value: RecurrenceInput | null`, `onChange`, `startDate: string`, `disabled?`, `errors?`, `onValidityChange?` `[VERIFIED: apps/client/src/features/recurrence/recurrence-picker.tsx:139-146]`. ⚠ It contains an effect that force-syncs `startsOn` to the `startDate` prop `[VERIFIED: …recurrence-picker.tsx:170-177]` — verbatim:
```ts
  useEffect(() => {
    if (value === null || value.startsOn === startDate) return;
    const next = { ...value, startsOn: startDate };
    if (next.freq === 'weekly' && (next.byWeekday?.length ?? 0) === 0) {
      next.byWeekday = [weekdayFor(startDate)];
    }
    onChange(next);
  }, [onChange, startDate, value]);
```
so the detail screen must pass `startDate` = the split anchor (today or tomorrow in the rule's timezone), **not** the rule's original `startsOn`, or the picker will fight the form.

**Can `updateSeriesFromOccurrence` be reused directly? Not without an occurrence id.** `[VERIFIED: apps/api/src/modules/recurrence/recurrence.service.ts:90-96]` — its signature takes `occurrenceId: string` and it does `tx.task.findUniqueOrThrow({ where: { id: occurrenceId }, include: { assignees: true, labels: true } })` at lines 137-148 to resolve the successor's template, assignees and labels. From a rule detail screen there may be no future occurrence at all (§4a).

**Recommended: a rule-scoped sibling, `updateRuleFromAnchor(actorId, householdId, ruleId, recurrence)`**, structurally a near-clone of `updateSeriesFromOccurrence`'s transaction with three substitutions:
1. anchor = `addDays(currentCalendarDateIn(rule.timezone), 1)` instead of `occurrence.occurrenceDate`;
2. successor template fields come from `rule.template*` (CR-01) instead of from the occurrence row — **this is strictly more correct** and is the payoff of CR-01;
3. assignees/labels are read from the rule's nearest instance (prefer the earliest with `occurrenceDate >= anchor`, else the latest before it) — a documented pragmatic fallback under Path B, where at least one instance always exists.

Everything else carries over verbatim: the old rule gets `endsOn = anchor - 1, count: null` (lines 110-116), `inheritedCount` arithmetic (127-132), the `endsOn`/`count` XOR check (119-125), `materializedThrough: null` on the successor (line 197), and the post-commit `await this.materializer.materializeRule(newRuleId)` **outside** the transaction (line 258) — that ordering is a locked Phase 7 decision `[VERIFIED: .planning/STATE.md:195]` — verbatim: `- [Phase 07]: Successor recurrence materialization begins only after the split transaction commits.`

**Non-negotiable:** D-08's atomicity ("不能出现旧规则已终止、新规则未建成的中间态") must not weaken — keep the whole split in one `this.prisma.$transaction`.

---

## §9 — Migrations: convention and whether any are needed

**Convention confirmed.** `apps/api/prisma/migrations/` contains 10 directories `[VERIFIED: directory listing, this session]`: `0001_auth_foundation`, `0002_household_core`, `0003_household_invitations`, `0004_events`, `0005_tasks`, `20260805075417_add_notes_labels`, `20260812000000_task_multiple_assignees`, `20260813000000_recurrence_rules`, `20260814000000_recurrence_template_fields`, `migration_lock.toml`. The most recent is hand-authored SQL with an explanatory header, an `ALTER TABLE … ADD COLUMN`, a backfill `UPDATE`, a `SET NOT NULL`, and a `CHECK` constraint `[VERIFIED: apps/api/prisma/migrations/20260814000000_recurrence_template_fields/migration.sql:1-45]` — the header verbatim:
```sql
-- Series-level template fields.
--
-- Generated occurrences used to copy their field values from the earliest
-- surviving instance row, which the user is explicitly allowed to edit on its
-- own (D-02/D-07). That leaked single-occurrence edits — and completed or
-- cancelled state — into every occurrence generated afterwards. The template
-- now lives on the rule, where no per-instance edit can reach it.
```
And the fix report confirms the mechanism `[CITED: .planning/phases/07-recurring-events-tasks/07-REVIEW-FIX.md:138]` — verbatim: `**Migration:** \`20260814000000_recurrence_template_fields\` is hand-authored SQL per the phase's convention and was applied by the integration harness (\`prisma migrate deploy\`) during every run above.`

### Does `materializedThrough` need a shape change? **No.**

Its semantics reinterpret **in place**. The column stays `DATE`, nullable, indexed. Under D-11 it means "the last calendar date this rule's generation has been decided through", which is `max(previous watermark, localToday + lookahead(freq))` under the monotonic guard. Renaming would cost:
- one migration + `schema.prisma` edit,
- `RecurrenceResponseDto` `[VERIFIED: apps/api/src/modules/recurrence/dto/recurrence.dto.ts:104]`,
- both `toResponse` mappers `[VERIFIED: apps/api/src/modules/tasks/tasks.service.ts:454]`, `[VERIFIED: apps/api/src/modules/events/events.service.ts:418]`,
- both list aggregates + both `*ListResponseDto` fields `[VERIFIED: apps/api/src/modules/tasks/dto/create-task.dto.ts:83]`, `[VERIFIED: apps/api/src/modules/events/dto/create-event.dto.ts:103]`,
- three `models.ts` interfaces in the generate-openapi template `[VERIFIED: apps/api/src/openapi/generate-openapi.ts:250,298,342]`,
- both client screens' state + `openapi.json` regeneration,
- 11 test assertions across two integration test files.

**Recommendation: keep the name. Update its doc comment in `schema.prisma` and the JSDoc in the materializer instead.** Splitting into a separate "lookahead watermark" column would be pure duplication — the horizon is a pure function of `(freq, timezone, now)` and needs no persistence.

### So: does this addendum need a migration at all?

| Path | Migration needed |
|---|---|
| **Path B (recommended)** | **None.** D-11/D-12/D-13/D-14/D-15 need zero schema change; D-16's `kind` is derivable via `_count`. |
| Path A (literal D-12) | Yes — `RecurrenceRule.kind` + rule-level assignee/label template, both with backfill from the earliest surviving instance (mirroring the `20260814000000` backfill's `COALESCE(… ORDER BY occurrence_date ASC LIMIT 1 …)` pattern). Next timestamp must sort after `20260814000000`, e.g. `20260815000000_recurrence_rule_kind`. |

---

## Architecture Patterns

### System data flow (post-addendum)

```
                    ┌──────────────────────────────────────────────┐
   hourly tick ────▶│ RecurrenceScheduler.setInterval              │
   (RECURRENCE_     │  → materializer.materializeAllDue()          │
    TICK_MS = 1h)   └──────────────────┬───────────────────────────┘
                                       │ UTC-based superset prefilter
                                       │ (materializedThrough < utcToday+7,
                                       │  endsOn null or >= utcToday)
                                       ▼
POST /tasks|/events ──┐    ┌──────────────────────────────────────┐
 (rule + seed row)    ├───▶│ materializeRule(ruleId)              │
PUT  .../series ──────┤    │  1 pg_try_advisory_xact_lock         │
POST .../rules/:id/end┘    │  2 load rule (template_* per CR-01)  │
                           │  3 today = currentCalendarDateIn(    │  ◀── NEW (§2)
                           │       rule.timezone)                 │
                           │  4 horizon = today + lookahead(freq) │  ◀── NEW (§1)
                           │  5 walkStart = watermark + 1         │
                           │  6 walkOccurrences({from: walkStart, │
                           │       horizon})                      │
                           │  7 createManyAndReturn(skipDuplicates)│
                           │  8 fan out assignees/labels to NEW    │
                           │     rows only                        │
                           │  9 watermark = MAX(old, run)         │  ◀── NEW (§3)
                           └──────────────────┬───────────────────┘
                                              ▼
                                    tasks / events rows
                                              │
        ┌─────────────────────────────────────┼──────────────────────────┐
        ▼                                     ▼                          ▼
GET .../tasks?recurring=true      GET .../events?recurring=true   GET .../recurrence-rules
 (where.recurrenceRuleId          (same)                           (rules, not instances;
  = { not: null })                                                  nextOccurrenceDate
        │                                     │                     computed via
        ▼                                     ▼                     walkOccurrences)  ◀── NEW
 tasks/index.tsx chip            events/index.tsx chip                     │
                                                                           ▼
                                                    recurrence-rules/index.tsx  ◀── NEW
                                                    recurrence-rules/[ruleId]   ◀── NEW
                                                       ├─ RecurrencePicker (reused)
                                                       ├─ formatRecurrenceSummary (reused,
                                                       │   via recurrenceInputFromResponse)
                                                       ├─ PUT  .../rules/:id   ◀── NEW
                                                       └─ POST .../rules/:id/end ◀── NEW
```

### Pattern: horizon is per-rule and recomputed, never persisted
**What:** Every generation decision derives from `(rule.freq, rule.timezone, now)`; only *what has already been written* is persisted.
**When:** Any scheduled generator whose eligibility depends on per-entity local time.
**Why here:** It is what removes the need for per-rule midnight-detection state, and it makes the generator correct across restarts, timezone edits and DST without any of them being special cases.

### Pattern: extract the anchored core, vary the anchor
**What:** `deleteSeriesFromOccurrence` and `endRule` differ only in how the anchor date is obtained. Extract `endSeriesAt(tx, ruleId, anchor)`; the same applies to `updateSeriesFromOccurrence` vs. `updateRuleFromAnchor`.
**Why here:** D-14 mandates "复用已有的 `deleteSeriesFromOccurrence(scope='this_and_following')` 语义". Duplicating the transaction would let the two drift, which is precisely how CR-05's duplicated `recurrenceChanged` became a bug.

### Anti-patterns to avoid
- **Adding a `lastCheckedLocalDate` column for D-11.** The watermark plus a timezone-aware horizon already carry the information; a second clock is a second thing to get out of sync.
- **Passing a `RecurrenceResponseDto` straight into `formatRecurrenceSummary`.** Renders "，到 null 为止" (§8).
- **Editing `packages/api-client/src/generated/client.ts` or `models.ts` directly.** They are overwritten (see below).
- **Letting the horizon change silently rewind the watermark.** Not a data loss, but an information loss the client's empty states depend on (§3).
- **Anchoring D-14's "结束" at today.** Deletes an occurrence the user may have completed hours ago, under a label that says 结束 not 删除.
- **A second refetch-driven filter mechanism in the tasks filter panel.** The existing four chips all filter client-side (§5); mixing paradigms in one panel makes `activeFilterCount` and the empty-state gating inconsistent.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| "What is today in IANA zone X?" | `Date` + manual offset arithmetic | `Intl.DateTimeFormat('en-CA', { timeZone })` → `parseIsoDate` (§2), living beside the existing `offsetMinutesAt` | The file already documents why manual offset math is wrong; WR-05/WR-06 were both fixes in this exact area. Zero new dependencies, per the discretion note "优先复用现有零依赖方案". |
| "When is this rule's next occurrence?" | A bespoke next-date function per frequency | `walkOccurrences(rule, { horizon, from: today })[0]` | Month-end clamping (D-09), weekly `byWeekday`, `count` anchoring and `endsOn` are all already handled and tested there. A second implementation would re-earn D-09's bugs. |
| "End the series from a date" | A new endsOn/delete transaction | Extract and share `deleteSeriesFromOccurrence`'s transaction body (§6) | D-14 explicitly says reuse; divergence risk is the CR-05 lesson. |
| "Regenerate the typed API client" | Hand-editing `packages/api-client/src/generated/*.ts` | Edit the `modelsSource` / `clientSource` template literals in `apps/api/src/openapi/generate-openapi.ts`, then `pnpm openapi:generate`, then `pnpm openapi:check` | ⚠ **Non-obvious:** despite the `// Generated from openapi.json. Do not edit.` banner, these files are produced by `writeFile(resolve(generatedRoot, 'models.ts'), modelsSource, 'utf8')` `[VERIFIED: apps/api/src/openapi/generate-openapi.ts:1380-1381]` where `modelsSource`/`clientSource` are **hand-maintained template literals** in the same file (lines 9-397 and 399-1219). Direct edits to the generated files are silently overwritten and `openapi:check` fails. |
| "Assert the new endpoint is in the contract" | Nothing | Add a guard to the `generate()` assertion block, e.g. beside `[VERIFIED: apps/api/src/openapi/generate-openapi.ts:1366-1375]` — the series-path guard verbatim ends `throw new Error('OpenAPI series mutation operations or schemas are missing or unstable.');` | The file's established convention: every operation has a stable-`operationId` assertion. |
| Household-scoped list screen scaffolding | A new screen from scratch | Copy `labels/index.tsx`'s guard order, `useFocusEffect` refetch, `AppShell`/`HouseholdHeader`/`HouseholdSwitcher` triple, and inline confirm pattern (§8) | Every Phase-2 access-state edge case (accessChanged, missing household, expired token) is already correct there. |

**Key insight:** the CR-01/CR-02 fixes moved this module very close to what the addendum needs — the template is on the rule, and the walker takes a `from` bound. The work is mostly *deleting* the 90-day assumption, not adding machinery.

---

## Common Pitfalls

### Pitfall 1: The generated-client illusion
**What goes wrong:** an agent edits `packages/api-client/src/generated/client.ts` to add `listRecurrenceRules`, the client compiles, then `pnpm openapi:generate` reverts it and `pnpm openapi:check` fails in CI.
**Why:** the "generated" files are string constants in `generate-openapi.ts` (see above).
**Avoid:** every API surface change edits `generate-openapi.ts` in three places — `modelsSource`, `clientSource`, and the assertion block — then regenerates.
**Warning sign:** a diff that touches `packages/api-client/src/generated/*` without touching `apps/api/src/openapi/generate-openapi.ts`.

### Pitfall 2: UTC `today` surviving in `materializeRule`
**What goes wrong:** daily rules materialize hours late (or early) for non-UTC households; nobody notices in tests because the CI box is UTC.
**Why:** there are two `new Date().toISOString().slice(0, 10)` sites in the file (lines 51 and 92) and only one must change.
**Avoid:** an integration test that stubs the clock (or picks a zone with a large offset such as `Pacific/Kiritimati`, UTC+14) and asserts the row exists.
**Warning sign:** `parseIsoDate(new Date().toISOString()…)` still present inside `materializeRule`.

### Pitfall 3: The calendar's "更远的重复还没生成" panel taking over
**What goes wrong:** after deploy, every calendar date >6 days out shows the offline-style panel.
**Why:** `selectedDateIso > materializedThrough` with a 6-day watermark (§7).
**Avoid:** rework the predicate and the copy in the same plan as D-11; test on a household whose rules were all created after the change (legacy rules' ~today+90 watermark masks it).

### Pitfall 4: Stale `_min(materializedThrough)` from ended rules
**What goes wrong:** the tasks list permanently shows the generation-window empty state.
**Why:** the interaction between the monotonic watermark guard and the ended-rule prefilter (§3).
**Avoid:** scope the aggregate to live rules in both services.

### Pitfall 5: `null` leaking into `formatRecurrenceSummary`
**What goes wrong:** the rule list renders "每周二重复，到 null 为止".
**Why:** `RecurrenceDto` (request, `undefined`) vs `RecurrenceResponseDto` (response, `null`) (§8).
**Avoid:** always route through `recurrenceInputFromResponse`.
**Warning sign:** `formatRecurrenceSummary(rule, …)` where `rule` came straight from a fetch.

### Pitfall 6: A rule with zero instances becoming permanently inert
**What goes wrong:** a weekly rule created outside its window never generates anything, ever, with no error.
**Why:** the `taskTemplate === null && eventTemplate === null` early return (§4a).
**Avoid:** Path B, or a `kind` column. **This is the single highest-severity risk in the addendum.**
**Warning sign:** any change that makes the create path's `tx.task.create` / `tx.event.create` conditional.

### Pitfall 7: The client Jest suite cannot reach screens under `app/`
**What goes wrong:** a plan promises a test for the new rule-management screen that cannot run.
**Why:** `[VERIFIED: apps/client/jest.config.js]` — verbatim: `testMatch: ['<rootDir>/src/**/__tests__/**/*-test.[jt]s?(x)'],`. This is exactly why CR-05 tested an extracted classifier instead of a screen `[CITED: .planning/phases/07-recurring-events-tasks/07-REVIEW-FIX.md:79]`.
**Avoid:** put testable logic in `apps/client/src/features/recurrence/*` and keep `app/**` screens thin; cover the screens with Playwright under `e2e/` instead.

---

## Code Examples

### The complete D-11 diff to `materializeRule` (lines 92-93 and 114-124)
```ts
// BEFORE
const today = parseIsoDate(new Date().toISOString().slice(0, 10));
const horizon = addDays(today, RECURRENCE_HORIZON_DAYS);
…
const truncated = occurrences.length === RECURRENCE_MAX_INSTANCES_PER_RUN;
await tx.recurrenceRule.update({
  where: { id: ruleId },
  data: {
    materializedThrough: databaseDate(truncated ? occurrences[occurrences.length - 1]! : horizon),
  },
});

// AFTER
// D-11: the window is a per-frequency lookahead measured from the RULE's own
// local calendar date, not a fixed 90-day roll measured from server UTC. A
// daily rule's occurrence appears only once its own local midnight has passed.
const today = currentCalendarDateIn(rule.timezone);
const horizon = addDays(today, lookaheadFor(rule.freq));
…
const truncated = occurrences.length === RECURRENCE_MAX_INSTANCES_PER_RUN;
const runWatermark = truncated ? occurrences[occurrences.length - 1]! : horizon;
const existing = rule.materializedThrough === null ? null : calendarDate(rule.materializedThrough);
// D-13: forward-only. Narrowing the horizon must never make the rule claim
// less coverage than it already has — generation deletes nothing, and the
// watermark must not imply otherwise.
const nextWatermark = existing !== null && compareDates(existing, runWatermark) > 0 ? existing : runWatermark;
await tx.recurrenceRule.update({
  where: { id: ruleId },
  data: { materializedThrough: databaseDate(nextWatermark) },
});
```
`calendarDate` and `databaseDate` are the file's existing private helpers `[VERIFIED: apps/api/src/modules/recurrence/recurrence-materializer.service.ts:31-37]` — verbatim:
```ts
function calendarDate(value: Date): CalendarDate {
  return parseIsoDate(value.toISOString().slice(0, 10));
}

function databaseDate(value: CalendarDate): Date {
  return new Date(`${formatIsoDate(value)}T00:00:00.000Z`);
}
```

### D-14 service method shape
```ts
  async endRule(actorId: string, householdId: string, ruleId: string): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }
    await this.prisma.$transaction(async (tx) => {
      const rule = await tx.recurrenceRule.findUnique({ where: { id: ruleId } });
      if (rule === null || rule.householdId !== householdId) {
        throw new NotFoundException({ code: 'RECURRENCE_RULE_NOT_FOUND', message: 'Recurrence rule not found.' });
      }
      if (!this.canMutate(role, rule.createdBy, actorId)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the creator, admin, or owner can end this series.' });
      }
      // "结束" not "删除": today's occurrence may already be done, so the
      // series ends AFTER today rather than swallowing it.
      const anchor = addDays(currentCalendarDateIn(rule.timezone), 1);
      await this.endSeriesAt(tx, rule.id, anchor);
    });
  }
```

---

## Runtime State Inventory

Not a rename/refactor/migration phase in the state-carrying sense, but two runtime-state facts materially affect this addendum:

| Category | Items found | Action required |
|---|---|---|
| Stored data | **Pre-existing `recurrence_rules` rows with `materialized_through ≈ today + 90` and up to ~90 days of already-generated `tasks`/`events` instances.** D-13 forbids cleaning these. | None (data). Code: the monotonic watermark guard (§3) so the horizon change does not rewind their watermark. |
| Live service config | None — the scheduler is in-process `setInterval`; no external cron, queue or workflow engine `[VERIFIED: grep for `setInterval\|@Cron\|ScheduleModule` over `apps/api/src` → single hit, `recurrence-scheduler.ts`]`. | None. |
| OS-registered state | None. | None. |
| Secrets / env vars | None new. The scheduler reads only `process.env.NODE_ENV` `[VERIFIED: apps/api/src/modules/recurrence/recurrence-scheduler.ts:14]`. | None. |
| Build artifacts | `packages/api-client/src/generated/{client,models,index}.ts` + `packages/api-client/openapi.json` are regenerated outputs and **will drift** the moment an endpoint is added. | Run `pnpm openapi:generate` then `pnpm openapi:check` in the same commit as any API surface change. |

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| PostgreSQL (integration test DB) | `pnpm --filter api test:integration` | assumed ✓ | the review-fix pass ran against "the local PostgreSQL 17 test database" `[CITED: 07-REVIEW-FIX.md:25]` | none — required |
| Node `Intl` with full ICU | `currentCalendarDateIn`, `offsetMinutesAt` | ✓ | already load-bearing in shipped code | none needed |
| New npm packages | — | **none required** | — | — |

**No external packages are introduced by this addendum**, so no Package Legitimacy Audit is applicable. Every capability reuses existing in-repo code, `Intl`, Prisma and Nest.

---

## Validation Architecture

### Test framework

| Property | Value |
|---|---|
| API framework | Vitest, split into named `unit` / `integration` projects |
| API quick run | `pnpm --filter api test:quick` → `vitest run --project unit` `[VERIFIED: apps/api/package.json scripts]` |
| API full | `pnpm --filter api test:integration` → `vitest run --project integration` |
| Client framework | Jest + `jest-expo` preset, `--runInBand` |
| Client run | `cd apps/client && pnpm test` |
| Client testMatch | `['<rootDir>/src/**/__tests__/**/*-test.[jt]s?(x)']` — **screens under `app/` are unreachable** |
| Contract gate | `pnpm openapi:generate` then `pnpm openapi:check` |
| Typecheck | `pnpm --filter api typecheck`; `cd apps/client && pnpm typecheck` |
| E2E | Playwright, `pnpm test:e2e:web`; recurrence specs live at `e2e/events/recurrence.spec.ts` and `e2e/tasks/` |

Existing recurrence test files: `apps/api/test/recurrence/materializer.int.test.ts` (241 lines, 3 tests) and `apps/api/test/recurrence/recurrence-rules.int.test.ts` `[VERIFIED: directory listing]`.

### Requirement → test map

| Decision | Behaviour | Type | Command | Exists? |
|---|---|---|---|---|
| D-11 | A `daily` rule in `Asia/Shanghai` materializes today's occurrence when UTC is still yesterday | integration | `pnpm --filter api test:integration` | ❌ new |
| D-11 | A `weekly` rule 10 days from its next occurrence materializes **nothing**; at 6 days it materializes exactly one | integration | same | ❌ new |
| D-11 | Watermark advances by exactly one day per local-midnight crossing; a second run same-day is a no-op | integration | same | ⚠ adapt `materializer.int.test.ts:114-158` (`advances a rewound watermark…`) — it currently asserts `expect(watermark).toBe(formatIsoDate(horizon))` against a 90-day horizon at line 156 |
| D-11 | `currentCalendarDateIn` returns the right date across a DST boundary and for UTC+14 / UTC−11 | unit | `pnpm --filter api test:quick` | ❌ new — add to `recurrence-date.test.ts` |
| D-12 | Creating a weekly rule outside the window yields exactly the seed row and nothing else | integration | same | ❌ new |
| D-13 | A rule with `materialized_through = today+90` and 90 days of rows keeps **every** row and its watermark after a run under the new horizon | integration | same | ❌ new — **this is D-13's regression test** |
| D-13 | Watermark never decreases across runs | integration | same | ❌ new |
| D-14 | `POST .../recurrence-rules/:id/end` sets `endsOn`, nulls `count`, deletes rows from the anchor, keeps history; 404 cross-household; 403 for a MEMBER on another's rule | integration | same | ❌ new |
| D-15 | `?recurring=true` returns only `recurrenceRuleId != null`; `?recurring=false` the complement; absent = unchanged | integration | same | ❌ new |
| D-16 | List returns template title + a correct `nextOccurrenceDate` for a rule with **no** materialized future rows | integration | same | ❌ new |
| D-16 | `nextOccurrenceDate` respects `count` and `endsOn` and returns null past the end | unit | `pnpm --filter api test:quick` | ❌ new |
| D-16 | `formatRecurrenceSummary(recurrenceInputFromResponse(response))` renders no "null" | client unit | `cd apps/client && pnpm test` | ⚠ extend `apps/client/src/features/recurrence/__tests__/recurrence-summary-test.tsx` |
| D-11/D-16 | Existing `materializer.int.test.ts` count-1000 test still passes | integration | same | ⚠ **will break** — see below |

### ⚠ Tests that will break and must be updated

`materializer.int.test.ts` imports `RECURRENCE_HORIZON_DAYS` `[VERIFIED: apps/api/test/recurrence/materializer.int.test.ts:9]` and uses it at lines 126, 208, and in the comment at 171 ("A single run is bounded by both the 90-day horizon and the per-run cap"). Line 156 asserts `expect(watermark).toBe(formatIsoDate(horizon))` with `horizon = addDays(today, RECURRENCE_HORIZON_DAYS)`. All three tests build expectations against a 90-day window:
- line 114 `advances a rewound watermark without duplicating weekly occurrences` — the `expected` array at 127-132 walks to `today+90`;
- line 160 `reaches every occurrence of a count-1000 daily rule across successive runs` — relies on 90 days of horizon on top of 950 days of history;
- line 224 `persists exactly one clamped February occurrence for a monthly 31st rule` — creates a `count: 12` monthly rule and asserts February's clamped date is present, which under a 6-day horizon **will not be materialized in one run**.

The plan must budget for rewriting all three, and for keeping `RECURRENCE_HORIZON_DAYS` exported (or replacing the export with `RECURRENCE_LOOKAHEAD_DAYS`) so the imports resolve.

### Sampling rate
- **Per task commit:** `pnpm --filter api test:quick` + `cd apps/client && pnpm typecheck`
- **Per wave merge:** `pnpm --filter api test:integration` + `cd apps/client && pnpm test` + `pnpm openapi:check`
- **Phase gate:** all of the above green, plus `pnpm test:e2e:web` for the recurring journeys, before `/gsd-verify-work`

### Wave 0 gaps
- [ ] Clock-injection seam for the materializer. `materializeRule` reads `new Date()` directly; testing D-11's timezone behaviour deterministically needs either an injectable clock or an explicit non-UTC `TZ`/zone fixture. **Recommend the `now: Date = new Date()` default parameter on `currentCalendarDateIn` (already in the §2 sketch) plus a rule fixture in `Pacific/Kiritimati` (UTC+14) and `Pacific/Midway` (UTC−11)** — no DI change, no new dependency.
- [ ] No test file exists for the new `RecurrenceRulesController`; add `apps/api/test/recurrence/recurrence-rules-api.int.test.ts` following the fixture helpers in `materializer.int.test.ts:29-91` (`withDatabase`, `insertActor`, `createHousehold`, `createRecurringTask`).
- [ ] No client test can reach the new screens (Pitfall 7) — extract any list-row formatting into `apps/client/src/features/recurrence/` so it is testable.

---

## Security Domain

### Applicable ASVS categories

| Category | Applies | Standard control in this codebase |
|---|---|---|
| V2 Authentication | yes (inherited) | `@UseGuards(AccessTokenGuard)` + `@ApiBearerAuth()` on every new controller, exactly as `recurrence.controller.ts:22-25` |
| V3 Session Management | no new surface | — |
| V4 Access Control | **yes — the primary concern** | `resolveActorRole` → 404 `HOUSEHOLD_NOT_FOUND` for non-members, then `canMutate(role, createdBy, actorId)` for MEMBER-scoped mutation. SAFE-01 household isolation. |
| V5 Input Validation | yes | `ParseUUIDPipe({ version: '4' })` per path param (never an intersection param DTO — WR-01); class-validator DTOs for bodies under the app's `forbidNonWhitelisted` validation pipe |
| V6 Cryptography | no | — |

### Threat patterns for this change

| Pattern | STRIDE | Mitigation |
|---|---|---|
| Cross-household rule access via a guessed `ruleId` | Information disclosure / Tampering | Every rule lookup must assert `rule.householdId === householdId` and 404 otherwise — the exact pattern at `recurrence.service.ts:61-63`. **This is the single most important check in the new endpoints**, because unlike `/series` routes the ruleId is now client-supplied without an occurrence to cross-check. Locked precedent: `[VERIFIED: .planning/STATE.md:193]` — verbatim: `- [Phase 07]: Series mutations resolve ownership from the stored occurrence and return 404 for cross-household identifiers before role authorization.` |
| A MEMBER ending another member's rule | Elevation of privilege | `canMutate` against `rule.createdBy` before any write |
| Malformed UUID reaching Prisma → 500 | DoS / information disclosure | Per-param `ParseUUIDPipe` (WR-01's fix) |
| `recurring` query param injection | Tampering | Treat as a string enum (`'true'`/`'false'`) and map to a fixed `where` fragment; never interpolate |
| Unbounded rule list for a large household | DoS | The list returns rules (few per household), not instances; still, order deterministically (`createdAt desc` or `templateTitle asc`) and consider a cap |

---

## State of the Art (within this codebase)

| Old approach | Current approach | Changed at | Impact on this addendum |
|---|---|---|---|
| Occurrences copied field values from the earliest instance row | Field values live on `RecurrenceRule.template_*` | CR-01, migration `20260814000000` | D-16's list can show a trustworthy "模板标题"; a rule-scoped edit can build the successor's template without an occurrence |
| `walkOccurrences` restarted at `startsOn` every run and the cap kept the oldest 400 | `walkOccurrences(rule, { horizon, from })`; materializer anchors `from` at `watermark + 1` | CR-02 | D-11 becomes a two-line horizon change; D-16's `nextOccurrenceDate` gets `from: today` for free |
| `materializeRule` returned a bare number, silently 0 on lock contention | `MaterializationResult { skipped, created }` + a warn log | WR-04 | A faster tick raises contention; the observability is already in place |
| A post-commit materialization failure surfaced as a 500 | try/catch + `Logger` in both create paths | WR-03 | D-12's create-time pass is already failure-tolerant; no change needed |
| Spring-forward gap times silently shifted back one hour | RFC 5545 §3.3.5 fixed-point resolution in `localDateTimeToInstant` | WR-05 | Establishes the `Intl` idiom `currentCalendarDateIn` should follow |
| `offsetMinutesAt` fell back to UTC on an unparsed zone | Throws with zone + unparsed value | WR-06 | New per-rule timezone code must expect throws → per-rule try/catch in `materializeAllDue` (Pitfall P2) |

**Still outstanding from the review (Info tier, unfixed):** IN-02 (`RECURRENCE_LOCK_NAMESPACE = 1_907_070_1` misgrouped separators), IN-03 (`where as any` on both list queries — directly in D-15's path), IN-04 (`materializeAllDue` re-selects every rule forever — becomes 6× more expensive with an hourly tick), IN-05, IN-06 `[VERIFIED: .planning/phases/07-recurring-events-tasks/07-REVIEW.md:346-375]`. IN-03 and IN-04 are both in this addendum's blast radius and are cheap to fix while there.

---

## Project Constraints

**No `./CLAUDE.md` exists** `[VERIFIED: file listing, this session]`. Constraints are therefore taken from `.planning/config.json` and locked Phase 7 decisions:

- `.planning/config.json` `[VERIFIED: this session]` — verbatim: `"nyquist_validation": true`, `"plan_check": true`, `"verifier": true`, `"commit_docs": true`, `"source_grounding": true`, `"branching_strategy": "none"`. Validation Architecture is therefore mandatory in the plan.
- Locked Phase 7 decisions that constrain this addendum `[VERIFIED: .planning/STATE.md:188-203]`, notably — verbatim:
  - `- [Phase 07]: Household list watermarks use the minimum materializedThrough across all rules. — A lagging series must keep the household watermark conservative.` (interacts with §3)
  - `- [Phase 07]: Successor recurrence materialization begins only after the split transaction commits.` (constrains §8's rule edit)
  - `- [Phase 07]: Count-based source rules clear count atomically when a split date-bounds them, preserving the endsOn/count XOR constraint.` (constrains D-14's `count: null`)
  - `- [Phase 07]: Recurrence remains a single rendering path: cards only decorate the existing time or badge row with a muted icon.` (D-16's list is a *new screen*, not a change to card rendering — stays compatible)
  - `- [Phase 07]: Generation-window empty states compare the viewed date with the household materialization watermark.` (**this is the decision §7 forces a revisit of**)
- Schema conventions: snake_case `@map`, UUID PKs via `gen_random_uuid()`, `Timestamptz(3)` everywhere **except** the deliberate `@db.Date` on `occurrenceDate`/`startsOn`/`endsOn`/`materializedThrough` `[CITED: .planning/phases/07-recurring-events-tasks/07-01-PLAN.md:197]`.
- Migrations are hand-authored SQL applied via `prisma migrate deploy` (§9).

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | **Path B (keeping the create-time seed row) is acceptable to the user despite D-12's literal "不强制'至少生成一条'".** | §4 | If the user insists on the literal reading, the addendum grows two migrations, a create-response contract change and client rework. **Must be confirmed before planning locks.** |
| A2 | Recomputing the horizon per-rule per-tick fully substitutes for explicit midnight detection. | §2 | If wrong, D-11's timing is off by up to one tick; mitigated by the 1-hour tick and provable by the integration test in §Validation. |
| A3 | `RECURRENCE_TICK_MS = 1 hour` is the right granularity. | §2 | Too slow → visible lag for daily tasks; too fast → 24× the current `materializeAllDue` scan. A discretion item D-11 explicitly delegates. |
| A4 | Anchoring D-14 at *tomorrow* (keeping today's occurrence) matches "结束" semantics. | §6 | If the user expects today's occurrence to disappear, flip the anchor by one day — a one-line change, but it changes user-visible behaviour and copy. |
| A5 | `MONTHLY`/`YEARLY` keep the 6-day default. | §1 | D-11 marks this "可调，不是强约束" — safe, but the constant should be a named, obviously-tunable map. |
| A6 | `nextOccurrenceDate` computed via `walkOccurrences({ from: today, horizon: today+400 })` is correct and fast enough for a household-sized rule list. | §8 | A yearly rule started decades ago could enumerate many steps; bounded by `RECURRENCE_MAX_WALK_STEPS`. Needs a unit test. |
| A7 | Rule-list visibility is household-wide (read), creator-scoped (mutate). | §8 | D-16 leaves this to planning; the choice is reversible but affects the list DTO's `where`. |
| A8 | The `beyondGenerationWindow` copy is not byte-locked by 07-UI-SPEC.md the way the clamp note is. | §7 | If it is locked, rewording needs a UI-SPEC amendment first. **Verify against 07-UI-SPEC.md before planning the copy change.** |
| A9 | Deriving `kind` via Prisma `_count` on the `tasks`/`events` relations works without a schema change. | §8 | If the planner prefers a `kind` column, that is one small migration — but only Path A *requires* it. |

---

## Open Questions

1. **D-12 literal vs. seed-preserving — needs a user decision (blocks planning).**
   - What we know: the literal reading breaks kind discrimination, assignee/label inheritance, and the `POST /tasks` response contract the client depends on for label attachment (§4, all three verified in source).
   - What's unclear: whether the user's complaint ("所有近期实例瞬间涌入 Today 视图") is satisfied by "one row instead of thirteen", or whether zero rows is required.
   - Recommendation: **Path B.** Surface it to the user as a one-line confirmation during `/gsd-discuss-phase`: 「新建每日/每周重复时，是否可以保留'你刚创建的这一次'这一条实例？（保留可以避免两次数据库迁移和创建接口的改动）」

2. **Tick frequency: 1 hour vs. 15 minutes.**
   - What we know: 6 h is too coarse for a 0-day daily lookahead; `materializeAllDue`'s cost scales linearly with tick rate and currently re-selects every rule ever created (IN-04).
   - Recommendation: 1 hour, **and** fix IN-04's predicate in the same plan (with the §3 aggregate-scoping mitigation).

3. **The generation-window empty state's future.**
   - What we know: under a 6-day horizon the calendar predicate fires for almost every future date (§7, verified).
   - What's unclear: whether the state should be reworded, re-scoped (only when the watermark is behind *today*), or removed.
   - Recommendation: re-scope the calendar predicate to `selectedDateIso < today || watermarkIsBehindToday` semantics and reword both strings; check 07-UI-SPEC.md for a byte-lock first (A8).

4. **Should D-16's list merge task-rules and event-rules or use two tabs?**
   - D-16 explicitly delegates this. With `kind` derivable, either works. Recommendation: one merged list with a per-row kind badge (fewer screens, and a household typically has few rules) — matches how `labels/index.tsx` and `notes/index.tsx` stay single-list.

5. **Does the addendum warrant its own plan numbering (07-09 … 07-1x) or a Phase 8?**
   - Not a technical question, but the phase directory already contains 07-01..07-08 plans plus REVIEW/REVIEW-FIX `[VERIFIED: directory listing]`. Continuing at 07-09 keeps RECR-01/02 traceability in one place.

---

## Sources

### Primary (HIGH confidence) — read in full this session
- `apps/api/src/modules/recurrence/recurrence-materializer.service.ts` (223 lines)
- `apps/api/src/modules/recurrence/recurrence-date.ts` (253 lines)
- `apps/api/src/modules/recurrence/recurrence-scheduler.ts` (28 lines)
- `apps/api/src/modules/recurrence/recurrence.service.ts` (303 lines)
- `apps/api/src/modules/recurrence/recurrence.controller.ts` (95 lines)
- `apps/api/src/modules/recurrence/recurrence.module.ts` (13 lines)
- `apps/api/src/modules/recurrence/dto/recurrence.dto.ts` (170 lines)
- `apps/api/src/modules/tasks/tasks.service.ts` (472 lines), `tasks.controller.ts` (103 lines)
- `apps/api/src/modules/events/events.service.ts` (436 lines), `events.controller.ts` (102 lines)
- `apps/api/src/openapi/generate-openapi.ts` (1390 lines)
- `apps/api/prisma/schema.prisma` lines 125-300; `apps/api/prisma/migrations/20260814000000_recurrence_template_fields/migration.sql` (45 lines)
- `apps/api/test/recurrence/materializer.int.test.ts` (241 lines)
- `apps/client/src/features/recurrence/{recurrence-summary,recurrence-picker,series-scope-sheet}.tsx`
- `apps/client/app/(protected)/households/[id]/{index,tasks/index,tasks/new,labels/index}.tsx`; `events/index.tsx` lines 120-240
- `apps/client/jest.config.js`; `package.json` scripts (root, api, client)
- Grep sweeps this session: instance-deletion call sites; `setInterval|@Cron|ScheduleModule`; `RecurrenceModule` registrations; `90 天|RECURRENCE_HORIZON_DAYS|materializedThrough`

### Secondary (MEDIUM confidence) — planning artifacts
- `.planning/phases/07-recurring-events-tasks/07-CONTEXT.md` (D-11 … D-16 verbatim)
- `.planning/phases/07-recurring-events-tasks/07-REVIEW-FIX.md` (CR-01, CR-02, WR-03, WR-04 rationale; migration convention)
- `.planning/phases/07-recurring-events-tasks/07-REVIEW.md` lines 340-375 (unfixed IN-01..IN-06)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json`

### Tertiary (LOW confidence)
- None. No external documentation, package registry, or web source was needed — this addendum introduces no new dependency.

---

## Metadata

**Confidence breakdown:**
- Current-state facts (file/line/behaviour): **HIGH** — every claim is line-cited with a verbatim quote from a file opened this session.
- D-11 horizon + timezone design: **HIGH** — the change is small and the surrounding invariants (unique key, `skipDuplicates`, watermark anchor) are verified in source.
- D-12 path recommendation: **MEDIUM** — the three breakages are verified facts, but choosing Path B softens D-12's literal wording and needs user confirmation (A1).
- D-14/D-16 endpoint design: **MEDIUM-HIGH** — file targets and reusable code are verified; anchor choice and visibility scope are recommendations within delegated discretion.
- Downstream UI fallout (§7): **HIGH** — both predicates and both copy strings are line-cited.
- Test-breakage predictions: **MEDIUM** — inferred from reading the assertions, not from executing the suite.

**Research date:** 2026-08-12
**Valid until:** ~2026-09-11 for the codebase facts (invalidated by any commit touching `apps/api/src/modules/recurrence/**`, the two list services, or `generate-openapi.ts`). Re-verify §1/§3 line numbers before planning if further fixes land.
