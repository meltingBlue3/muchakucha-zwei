---
phase: 7
slug: recurring-events-tasks
status: draft
shadcn_initialized: false
preset: muchakucha-warm-v1
created: 2026-08-12
updated: 2026-08-12
addendum: D-11…D-20（生成时机 / 周期筛选 / 规则管理 / 生成窗口空态改造）
---

# Phase 7 — 周期性重复事件与任务 UI Design Contract

> 周期性重复事件与任务阶段的视觉和交互契约。由 `gsd-ui-researcher` 生成，供 `gsd-ui-checker` 六维验证、`gsd-planner` 拆解任务、`gsd-executor` 作为视觉唯一事实源。

> **🆕 2026-08-12 追加（D-11 … D-20）：** 07-01..07-08 已执行、审查、修复完毕。D-01 … D-10 对应的契约 —— `RecurrencePicker`（含星期几 chip）、`SeriesScopeSheet`、`RecurrenceBadge`、已取消状态的三重表达、"仅此一次 / 此后所有"范围弹层 —— **全部锁定，不在本次更新范围内，不得改动**。本次更新只追加四块新界面：D-15「仅看周期性」筛选、D-16 周期规则管理列表与详情（含 D-14「结束此重复」）、D-19 生成窗口空态改造、以及规则管理的家庭首页入口卡片。带 🆕 标记的小节与表行为本次新增或**替换**既有内容。

---

## Experience Intent

**D-01 … D-10（已发布）：** 不新增页面族。它在已有的事件表单、任务表单、事件/任务详情、日历与今日视图上，增加三件事：设置重复规则、看出"这条会重复"、以及在改动或删除一个重复实例时**先明确影响范围**。

**🆕 D-11 … D-20（追加）：** 新增**一个**页面族 —— 周期规则管理（列表 + 详情）。原因是"我一共设了哪些重复""怎么让某一条停下来"这两个问题在实例视图里无处可问：用户只能先找到某一次发生、再从它的删除路径里选「此后所有」，这既不可发现，语义上也读作"删除"。同时在任务与日历的筛选区增加「仅看周期性」，并把"超出生成窗口"这个空态从"90 天窗口"改写为"临近日期才生成"。

**体验原则：**

1. **重复是可选的、默认关闭的。** 表单打开时永远是"不重复"。不设置重复的用户，其表单视觉与操作路径必须与 Phase 3/4 完全一致，不得增加一次点击或一屏滚动。
2. **实例就是普通条目。** 生成的每个实例是一条真实 Event/Task（D-02）。卡片、日历格子、今日视图**不得**为"是否重复"引入第二套渲染路径；重复只表现为一个小徽标和详情页的一行说明。
3. **范围选择先于动作。** 对属于系列的实例执行保存或删除时，必须先回答"仅此一次 / 此后所有"，**不得**用默认值替用户决定，也不得在选择前发出任何写请求（D-07/D-08）。
4. **规则用中文说人话。** 界面永远显示"每周二、四、六重复"这类摘要，不暴露 `FREQ`、`BYDAY`、`RRULE`、`interval` 等技术词，也不暴露 IANA 时区标识以外的内部字段名。
5. **移动优先、Web 同源、令牌唯一。** 沿用 Phase 1 的 Restyle 主题与自有 primitives；本阶段**不得**引入任何新 UI 依赖、新样式机制或裸样式值。
6. **🆕 结束不是删除。** 规则级的停止操作一律用"结束 / 停止"表达，界面上**不得**出现"删除""移除""清空"字样（D-14）。已经发生过的安排一条不动 —— 这一点必须写在用户看得到的确认文案里，不能只写在文档里。
7. **🆕 生成是服务端的事，界面只说"什么时候会出现"。** 不承诺固定天数的窗口，不暴露水位线、提前量、调度周期等内部概念。提前量按频率不同（每日 0 天、其余 6 天），因此文案里写死**任何一个**天数都会对另外几种频率说谎；空态只回答"这一天现在没有安排"和"接下来会怎样"（D-19）。

---

## Design System

| Property | Value |
|----------|-------|
| Tool | `@shopify/restyle` 类型化主题（沿用 Phase 1，`apps/client/src/ui/theme.ts`） |
| Preset | `muchakucha-warm-v1` |
| Component library | 自有 React Native primitives（`apps/client/src/ui/primitives.tsx`）；禁止 shadcn、平台 UI kit、第三方 sheet/dialog/picker 包 |
| Icon library | `lucide-react-native` 精确子路径导入；`size={theme.controlSizes.icon}`（20px）、`strokeWidth={theme.controlSizes.iconStroke}`（2px）；卡片内联徽标可用 14px |
| Font | 本地 Noto Sans SC；本阶段仅使用 400 与 600 |
| Theme scope | v1 仅浅色。本阶段**不新增任何 theme token** —— 现有 `colors` / `spacing` / `borderRadii` / `textVariants` / `controlSizes` 已完全覆盖需求 |
| Platform | Expo / React Native（Android + iOS 主）+ react-native-web 辅助入口 |

### Existing Primitives to Reuse (强制)

`Screen`、`Stack`、`Inline`、`Text`、`Heading`、`Button`、`IconButton`、`FormMessage`、`Banner`、`Spinner`、`StatusPanel`、`AppShell`、`DateField`。

新增 feature 文件**不得**出现裸色值、裸间距、裸圆角、裸字号或裸阴影；一律走 `useTheme<Theme>()`。唯一允许的例外是与现有代码一致的徽标微内边距（`task-card.tsx` 已有的 `BADGE_PADDING_V = 2`）。

### Phase 7 Owned Components

新增目录 `apps/client/src/features/recurrence/`：

| Component | 文件 | Contract |
|-----------|------|----------|
| `RecurrencePicker` | `recurrence-picker.tsx` | 频率单选 + 星期几多选 + 结束条件；受控组件，形状为一个可空的 `RecurrenceInput`；`null` 表示不重复 |
| `RecurrenceSummary` | `recurrence-summary.tsx` | 由规则**格式化**出中文摘要字符串的纯函数 + 展示组件。**禁止**在客户端推算任何未来发生日期（D-01 反模式） |
| `RecurrenceBadge` | `recurrence-badge.tsx` | `Repeat` 图标 + 可访问名称的内联徽标，供 `EventCard` / `TaskCard` / 详情页复用 |
| `SeriesScopeSheet` | `series-scope-sheet.tsx` | "仅此一次 / 此后所有"范围选择弹层；`mode: 'edit' \| 'delete' \| 'rule-change'` |

`RecurrencePicker` 与 `SeriesScopeSheet` 必须各自只有一份实现，由 `EventForm` 与 `TaskForm`、事件编辑页与任务编辑页共同复用；**不得**在事件侧和任务侧复制两套样式或两套文案。

### 🆕 Addendum Owned Components (D-14 … D-16)

新增文件仍落在 `apps/client/src/features/recurrence/`，**不新增第二个 feature 目录**：

| Component | 文件 | Contract |
|-----------|------|----------|
| `RecurrenceKindBadge` | `recurrence-kind-badge.tsx` | `kind: 'task' \| 'event'` 的内联类型徽标（D-20 合并列表用）。图标 + 文字，二者均为 `inkMuted`，**语义由文字承载，不靠颜色区分** |
| `RecurrenceRuleRow` | `recurrence-rule-row.tsx` | 规则列表单行的纯展示组件：类型徽标 + 模板标题 + 中文频率摘要 + 下一次发生日期 + 结束状态。只接收已格式化好的字符串，自身不发请求、不推算日期 |
| `formatRuleRow` | `recurrence-rule-row.tsx` | 由规则列表项生成上述字符串的纯函数。**必须**先经 `recurrenceInputFromResponse()` 归一化，再调既有的 `formatRecurrenceSummary()` |

**为什么必须是组件而不是写在屏幕里：** 客户端 Jest 的 `testMatch` 只覆盖 `src/**/__tests__/**`，`app/**` 下的屏幕不可测。列表行的格式化与状态判断一律下沉到 `src/features/recurrence/`，`app/` 下两个新屏幕保持"取数 + 编排"的薄层。

**`formatRecurrenceSummary` 的空值陷阱（强制）：** 该函数入参是**请求**形状（缺省字段为 `undefined`），而规则接口返回的是**响应**形状（缺省字段为 `null`）。把响应对象直接传进去会渲染出 `，到 null 为止`。所有新界面**必须**经 `recurrenceInputFromResponse()`（由 `recurrence-picker.tsx` 导出，不在 `recurrence-summary.tsx`）归一化后再格式化。

**本次新增使用的图标**（全部走既有的精确子路径导入约定，Jest moduleNameMapper 依赖该形式）：`lucide-react-native/icons/repeat`（家庭首页入口卡片，与已锁定的 `RecurrenceBadge` 同一图标）、`lucide-react-native/icons/list-todo`（任务类型徽标）、`lucide-react-native/icons/calendar`（事件类型徽标）。**不得**新增任何图标包或图标以外的新依赖。

---

## Spacing Scale

沿用 Phase 1 的 4px 基线（`theme.spacing`）：

| Token | Value | Usage（本阶段） |
|-------|-------|-----------------|
| `space.1` | 4px | 卡片内重复徽标与日期文字的间距；星期 chip 内图标微距 |
| `space.2` | 8px | chip 之间的横纵间距（沿用 `task-form.tsx` 的 `chipStyle`）、徽标水平内边距 |
| `space.3` | 12px | chip 水平内边距、弹层内按钮之间的间距、按钮垂直内边距 |
| `space.4` | 16px | 重复区块与相邻表单区块的间距；弹层内容内边距 |
| `space.5` | 20px | 详情页各信息块间距（沿用事件详情页 `Stack gap={5}`） |
| `space.6` | 24px | 弹层标题区上下留白、移动端页边距 |
| `space.8` | 32px | 弹层与安全区之间的底部留白基准 |

**Exceptions（几何/可访问性约束，不是间距令牌）：** 边框 1px、焦点环 2px；所有可点击元素触控目标 ≥48×48px（`controlSizes.touchTarget`）；输入框与主按钮 52px（`controlSizes.field` / `controlSizes.primary`）；星期几 chip 因需在 320px 内一行放 7 个，宽度可降至 44px，但**高度必须保持 48px**，并用 `hitSlop={space.1}` 补足横向可点区。安全区 inset 运行时叠加。

---

## Shape and Elevation

| Token | Value | Usage |
|-------|-------|-------|
| `radius.sm` | 8px | 重复摘要提示块、"已取消"徽标、表单内按钮 |
| `radius.md` | 12px | 重复区块容器、详情页信息块 |
| `radius.lg` | 16px | `SeriesScopeSheet` 面板（移动端仅顶部两角） |
| `radius.full` | 999px | 频率 chip、星期几 chip、结束条件 chip（沿用现有 `chipStyle`） |
| `border.default` | 1px | 重复区块边界、次要按钮 |
| `overlay` | `rgba(45,39,37,0.60)` | `SeriesScopeSheet` scrim（复用现有 `colors.overlay`） |
| `shadow.soft` | `0 8px 28px rgba(45,39,37,0.08)` | 仅 Web 弹层；原生不使用阴影 |

禁止三层嵌套圆角：重复区块内的 chip 直接落在表单背景上，**不得**再包一层卡片。

---

## Typography

本阶段只使用 4 个字号、2 个字重，全部来自 `theme.textVariants`：

| Role | Variant | Size | Weight | Line Height | Usage |
|------|---------|------|--------|-------------|-------|
| Caption | `caption` | 12px | 500 | 16px | 重复摘要、月末钳位说明、时区注记、"已取消"徽标、卡片内重复说明 |
| Body small / Label | `bodySm` / `label` | 14px | 400 / 600 | 20px | chip 文字（`bodySm`）、字段标签"重复""结束"（`label`）、弹层选项说明 |
| Body / Button | `body` / `button` | 16px | 400 / 600 | 24px / 20px | 次数输入值、弹层选项主文案、弹层动作按钮 |
| Heading | `heading` | 24px | 600 | 32px | `SeriesScopeSheet` 标题；🆕 规则列表屏标题 `周期规则`、规则详情屏的模板标题 |

规则：

- `display`（32px）与 500 weight 在本阶段**不用于任何新元素**（`caption` 变体自带 500，属既有令牌，不算新增）。
- 重复摘要最多两行；超出以省略号截断，但 `accessibilityLabel` 必须保留完整摘要。
- 弹层的选项主文案、后果说明、错误文案**不得**截断。
- 支持系统文字放大至 200%：放大后星期几 chip 允许换成两行 4+3 布局，弹层内容纵向滚动，动作按钮仍全部可达。
- 文案一律 sentence case 中文；不出现 `RRULE` / `FREQ` / `BYDAY` / `interval` / `occurrenceDate` 等技术词。

---

## Color

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Dominant (60%) | `color.canvas` | `#FFF8F2` | 页面画布、弹层外背景、表单留白 |
| Secondary (30%) | `color.surface` / `color.surfaceMuted` | `#FFFFFF` / `#F5E9E1` | 卡片、输入框、弹层面板、未选中 chip 背景 |
| Accent (≤10%) | `color.coral` | `#B94736` | 已选中的频率/星期/结束条件 chip、重复区块的选中态、弹层内唯一主要动作、键盘焦点环 |
| Success / Info | `color.teal` / `color.tealSoft` | `#277A72` / `#DCEEEA` | 重复摘要提示块背景与文字（信息性，非成功庆祝）；🆕 家庭首页「周期规则」入口卡片的图标 |
| Destructive | `color.destructive` / `color.destructiveSoft` | `#B42318` / `#FDE4E1` | 删除范围弹层的两个删除动作、拆系列失败 `Banner`；🆕「结束此重复」动作与其两步确认、规则列表/详情的错误块 |
| Muted | `color.inkMuted` / `color.disabled` | `#6F625D` / `#B7AAA4` | "已取消"徽标、月末钳位说明、时区注记、禁用态；🆕 类型徽标（图标 + 文字）、规则摘要行、生成窗口状态 B 注记、已结束规则的说明与禁用动作 |

**Accent reserved for（穷举）：**

1. 重复区块内已选中的 chip 填充（频率、星期几、结束条件）；
2. `SeriesScopeSheet` 中**每次仅一个**主要动作的填充（`mode='edit'` 时为"仅此一次"；`mode='rule-change'` 时为"此后所有"）；
3. Web 键盘焦点环（`colors.focusRing`，与 coral 同族）；
4. 卡片重复徽标的图标描边**不使用** coral —— 徽标为 `inkMuted`，避免每张重复卡片都拉出一块强调色。
5. 🆕 「仅看周期性」筛选 chip 的**选中态描边与文字**（背景保持 `transparent`，不是填充）—— 与已发布的优先级筛选 chip 同一处理，不额外消耗填充配额；
6. 🆕 家庭首页「周期规则」入口卡片尾部的 `进入 ›`（锁定模板，六张既有卡片已在用）。

**禁止：** coral 不得用于重复徽标、不得用于日历中重复实例的日期格子、不得用于"已取消"状态、不得同时填充弹层里两个以上按钮。🆕 coral 也不得用于规则列表的类型徽标（那会让整屏规则都拉出强调色）、不得用于「结束此重复」及其确认（那是 `destructive` 的语义）、不得用于家庭首页入口卡片的图标（首页已有三张 coral 图标卡片）。

**不依赖颜色的强制项：**

- 重复徽标 = `Repeat` 图标 + 可访问名称"重复"（详情页另有文字摘要），不得只靠颜色。
- "已取消"状态 = `Ban` 图标 + 文字"已取消" + 标题删除线，三重表达。
- 星期几 chip 的选中态 = 填充色 + `accessibilityState={{ checked }}`，屏幕阅读器可独立判断。
- `mode='delete'` 的弹层中，两个删除动作靠**文字**区分范围，不靠深浅色区分危险度。

---

## Information Architecture and Screen Inventory

**D-01 … D-10（已发布）不新增路由。** 改动落在以下既有位置：

| 位置 | 新增内容 | 约束 |
|------|----------|------|
| `src/features/events/event-form.tsx` | 在"结束"与"地点"之间插入 `<RecurrencePicker>` 区块 | 默认"不重复"；不改变现有字段顺序 |
| `src/features/tasks/task-form.tsx` | 在"截止日期"与"描述"之间插入 `<RecurrencePicker>` 区块 | 默认"不重复"；不改变现有字段顺序 |
| `src/features/events/event-card.tsx` | 时间行右侧追加 `<RecurrenceBadge>` | 仅当 `recurrenceRuleId !== null`；卡片布局与高度不变 |
| `src/features/tasks/task-card.tsx` | 顶部徽标行追加 `<RecurrenceBadge>`；新增"已取消"徽标分支 | 徽标行超宽时换行，不挤压状态切换按钮 |
| `app/(protected)/households/[id]/events/[eventId]/index.tsx` | 新增"重复"信息块（标签 + 摘要 + 时区注记） | 位置在"结束"之后、"地点"之前 |
| `app/(protected)/households/[id]/tasks/[taskId]/index.tsx` | 同上，位置在"截止日期"之后 | 同上 |
| `app/(protected)/households/[id]/events/[eventId]/edit.tsx` | 保存与删除动作前接入 `<SeriesScopeSheet>` | 仅当该实例属于系列 |
| `app/(protected)/households/[id]/tasks/[taskId]/edit.tsx` | 同上 | 同上 |
| `app/(protected)/households/[id]/today.tsx` | `status === 'cancelled'` 的任务排除出"今日待办"分区 | 不新增分区，不新增筛选入口 |
| `src/features/events/calendar-month.tsx` | **无改动** | 月历格子**不得**新增重复标记；重复实例与普通事件共用同一个圆点 |

### 🆕 追加位置（D-14 … D-20）

⚠ **替换声明：** 原契约中「`tasks/index.tsx` 的筛选区**不新增**"只看重复"筛选项（超出本阶段范围，属 Deferred）」一句**作废** —— D-15 已把该能力纳入范围。原契约「本阶段不新增路由」的范围收窄为 D-01 … D-10；D-16 新增**一个**路由族，其余位置仍不新增路由。

| 位置 | 新增内容 | 约束 |
|------|----------|------|
| `app/(protected)/households/[id]/recurrence-rules/index.tsx` | **新路由** —— 周期规则列表 | 骨架照抄 `labels/index.tsx`；任务规则与事件规则合并一个列表（D-20） |
| `app/(protected)/households/[id]/recurrence-rules/[ruleId]/index.tsx` | **新路由** —— 规则详情（编辑频率/星期/结束条件 + 结束此重复） | 复用 `RecurrencePicker`；**不**复用 `SeriesScopeSheet`（见下文理由） |
| `app/(protected)/households/[id]/index.tsx` | 第 7 张快捷卡片「周期规则」，紧跟「标签管理」之后 | 逐项沿用「标签管理」卡片的视觉模板，不新增卡片样式 |
| `app/(protected)/households/[id]/tasks/index.tsx` | 折叠筛选面板内新增第 5 组「重复」筛选 chip；`activeFilterCount` 相应 +1 | 复用既有次要 chip 令牌；客户端筛选，不引入第二套取数机制 |
| `app/(protected)/households/[id]/events/index.tsx` | 月历与"选中日期"之间新增一行「重复」筛选 chip，位于既有标签筛选行上方 | 与标签筛选是两个互相独立的 radiogroup |
| `app/(protected)/households/[id]/tasks/index.tsx`（空态） | 生成窗口空态**换文案**，判定条件不变 | 见「Generation Window States」 |
| `app/(protected)/households/[id]/events/index.tsx`（空态） | 生成窗口空态**换文案且改判定** —— 原 `StatusPanel` 降级为一行 caption，面板让位给新的"生成落后"判定 | 见「Generation Window States」 |
| `src/features/events/calendar-month.tsx` | **仍无改动** | 月历格子**不得**因周期筛选或规则管理新增任何标记 |

以下已发布位置在本次更新中**一律不动**：`recurrence-picker.tsx`、`series-scope-sheet.tsx`、`recurrence-badge.tsx`、`event-card.tsx`、`task-card.tsx`、事件/任务详情页与编辑页、`today.tsx` 的已取消过滤。

---

## RecurrencePicker Contract

### 结构

```
Stack gap={1}
├─ Text variant="label"  →  "重复"
├─ 频率 chips（单选，横向 wrap）
│    不重复 · 每天 · 每周 · 每月 · 每年
├─ [freq === '每周'] 星期几 chips（多选，一行 7 个）
│    日 一 二 三 四 五 六
├─ [freq !== '不重复'] Text variant="label" → "结束"
├─ [freq !== '不重复'] 结束条件 chips（单选）
│    永不结束 · 截止日期 · 重复次数
├─ [end === '截止日期'] <DateField mode="date" />
├─ [end === '重复次数'] 数字输入 + 后缀"次"
└─ [freq !== '不重复'] <RecurrenceSummary />（teal 信息块）
```

选择"不重复"时，星期几、结束条件、摘要**全部卸载**，表单回到 Phase 3/4 的原始形态。

### 频率控件

- 5 个 chip，复用 `task-form.tsx` 现有 `chipStyle` / `chipTextColor`。
- **可访问性高于现有优先级 chip 的实现：** 必须使用 `accessibilityRole="radio"` + `accessibilityState={{ checked }}`，外层容器 `accessibilityRole="radiogroup"`、`accessibilityLabel="重复频率"`。现有状态/优先级 chip 只带 `accessibilityLabel` 的做法是较弱先例，**不得**照抄。
- 默认值：新建时 `不重复`；编辑既有实例时映射服务端规则。
- 本阶段只支持"每 1 个周期一次"，界面**不提供** interval 输入框（D-05）。

### 星期几多选

- 7 个 chip，标签 `日 一 二 三 四 五 六`，`accessibilityLabel` 为 `星期日 … 星期六`。
- `accessibilityRole="checkbox"` + `accessibilityState={{ checked }}`，沿用负责人多选先例（`task-form.tsx:213-239`）。
- 切到"每周"时，默认勾选**开始日期所在的星期几**，永不出现空选。
- **至少保留一天：** 取消最后一个已选项为 no-op（chip 保持选中），并通过 `accessibilityLiveRegion="polite"` 播报 `至少需要选择一天。`。不得允许提交空 `byWeekday`。
- 排序固定为周日→周六，与 `getDayNames()` 的日历表头一致。

### 结束条件

- 3 个 chip，单选，`accessibilityRole="radio"`，容器 `accessibilityLabel="重复结束条件"`。默认 `永不结束`（`endsOn` 与 `count` 均为空，D-06）。
- `截止日期` → 展开 `<DateField mode="date" label="截止日期" placeholder="YYYY-MM-DD" />`。留空即阻止提交（见 Copywriting）。截止日期早于开始日期同样阻止提交。
- `重复次数` → `TextInput keyboardType="number-pad"`，复用 `inputStyle`，默认值 `10`，允许范围 **1–1000**，右侧静态后缀 `次`。超范围阻止提交。
- 两者**互斥**：切换 chip 时清空另一个字段的值，界面上任一时刻只有一个输入可见（D-06）。

### RecurrenceSummary（信息块）

- 容器：`backgroundColor="tealSoft"`、`borderRadius="sm"`、`padding={space.3}`；文字 `variant="caption"`、`color="teal"`。
- 内容为**纯格式化**结果，禁止客户端推算发生日期。规范文案：

| 规则 | 摘要 |
|------|------|
| 每天 | `每天重复` |
| 每周，单日 | `每周三重复` |
| 每周，多日 | `每周二、四、六重复`（顿号分隔，周日→周六排序） |
| 每月 | `每月 12 日重复` |
| 每年 | `每年 8 月 12 日重复` |
| 追加 `endsOn` | `…，到 2027-08-12 为止` |
| 追加 `count` | `…，共 10 次` |

- **月末钳位提示（D-09）：** 频率为"每月"且开始日期的日 ≥ 29 时，摘要下方追加一行 `caption` / `inkMuted`：`有些月份没有这一天，会自动改到当月最后一天。`
- **时区注记（D-10）：** 规则的时区取自设备（`Intl.DateTimeFormat().resolvedOptions().timeZone`），本阶段**不提供时区选择控件**。仅当规则时区与当前设备时区不同时，追加一行 `caption` / `inkMuted`：`按 {IANA 时区} 的日期重复。`

---

## SeriesScopeSheet Contract

### 触发条件

当且仅当目标实例 `recurrenceRuleId !== null` 时，以下动作必须先经过本弹层，**在用户选择之前不得发出任何写请求**：

| 动作 | `mode` | 提供的范围 |
|------|--------|-----------|
| 编辑页保存（未改动重复规则本身） | `edit` | 仅此一次 / 此后所有 |
| 编辑页删除 | `delete` | 仅此一次 / 此后所有 |
| 编辑页保存（**改动了重复规则本身**） | `rule-change` | 仅"此后所有"；"仅此一次"以 disabled 呈现并说明原因 |

`recurrenceRuleId === null` 的普通一次性事件/任务，保存与删除路径**完全不变**（沿用现有内联删除确认），不得弹出本弹层。

### 关于"整个系列"

D-07/D-08 只定义两种范围，因此界面**只提供两个选项**。RECR-02 中的"整个系列"由"在系列的第一个实例上选择『此后所有』"覆盖 —— 弹层内以一行 `caption` / `inkMuted` 说明：`「此后所有」只影响这一次和之后的重复，已经过去的不受影响。`

### 呈现

复用 `HouseholdSwitcher`（`src/ui/household-components.tsx:423-467`）已验证的平台分支，**不得**引入第三方 sheet 库：

- **原生：** `Modal animationType="slide" transparent`，面板自底部升起，顶部两角 `radius.lg`，上方 scrim `colors.overlay` 可点击关闭；底部内边距 `space.4 + insets.bottom`。
- **Web：** `Modal animationType="fade" transparent`，居中面板，宽 `min(360px, 100% - 2×space.6)`，`shadow.soft`，scrim 可点击关闭，`Esc` 关闭。
- 面板最大高度为可视区域 75%，内容超出时内部滚动，三个动作始终可达。
- 关闭时必须**卸载** `Modal` 子树 —— react-native-web 会把已关闭的 `Modal` 留在 DOM 中（`household-components.tsx:331` 已记录此坑）。

### 内容与顺序

```
Heading         → 依 mode 取标题（见 Copywriting）
Text bodySm     → 后果说明（含"已经过去的不受影响"）
[动作 1] 仅此一次
[动作 2] 此后所有
[动作 3] 取消
```

按钮规格：全宽、`minHeight = controlSizes.primary`（52px）、纵向排列、间距 `space.3`。

| mode | 仅此一次 | 此后所有 | 取消 | 默认焦点 |
|------|----------|----------|------|----------|
| `edit` | coral 填充（唯一主要动作） | 描边 `border` + `ink` 文字 | 描边 `border` + `ink` 文字 | 仅此一次 |
| `delete` | 描边 `destructive` + `destructive` 文字 | `destructive` 填充 + `surface` 文字 | 描边 `border` + `ink` 文字 | **取消** |
| `rule-change` | disabled（`colors.disabled`）+ 下方 `caption` 说明原因 | coral 填充 | 描边 `border` + `ink` 文字 | 此后所有 |

安全动作在前、影响面更大的动作在后，视觉顺序与 DOM 顺序一致，**不得**颠倒。

### 交互与可访问性

- 打开后焦点移入上表指定的默认动作；关闭后焦点回到触发按钮。
- Web 必须 focus trap + `Esc` 关闭；不得降级为浏览器原生 `confirm()`。
- 提交中：三个按钮全部 `disabled`，被按下的那个显示 `Spinner` 并保持稳定标签宽度；弹层**不自动关闭**，直到服务端返回。
- 成功后关闭弹层并回到列表/详情，重新拉取权威状态；**不得**乐观更新任何实例。
- 失败时弹层保持打开，顶部插入 `Banner`，按钮恢复可用（见 Copywriting）。

---

## Recurring Instance Presentation

### RecurrenceBadge

- `Repeat`（`lucide-react-native/icons/repeat`），14px、`strokeWidth={2}`、`color = colors.inkMuted`。
- 卡片内：紧跟时间/截止日期文字之后，`Inline gap={1}`。无可见文字，`accessibilityLabel="重复"`。
- 宿主卡片的 `accessibilityLabel` 必须相应扩展为 `事件：{标题}，重复` / `任务：{标题}，重复`，让屏幕阅读器一次读到。
- 卡片高度、内边距、圆角、边框**均不得**因徽标而改变。

### 详情页"重复"信息块

沿用既有 `Stack gap={1}` + `Text variant="label" color="inkMuted"` 标签 + `Text variant="body"` 值的结构：

```
重复
每周二、四、六重复，共 10 次
[有些月份没有这一天，会自动改到当月最后一天。]   ← 仅每月且日 ≥ 29
[按 Asia/Shanghai 的日期重复。]                  ← 仅时区不同
```

### 已取消的单次实例（D-07）

- **任务** `status === 'cancelled'`：
  - 卡片顶部徽标行显示 `Ban` 图标（14px、`inkMuted`）+ `caption` 文字 `已取消`，背景 `surfaceMuted`、`radius.sm`；
  - 标题加删除线，卡片整体 `opacity: 0.6`（与 `completed` 一致）；
  - 状态切换圆圈 `disabled`，`accessibilityState={{ disabled: true }}`，可访问名称 `这次重复已取消`；
  - **排除出今日视图的"今日待办"分区**，也不计入逾期；
  - 编辑表单中，状态区额外渲染一个选中态的只读 `已取消` chip，并在其后提供文本动作 `恢复这一次`（点击后 status 回到 `pending`）；点击三个正常状态 chip 中的任意一个同样视为恢复。正常任务的状态区**保持现有三个 chip 不变**。
- **事件** `cancelledAt !== null`：从日历与今日视图的列表中消失（列表查询过滤），但深链详情页仍可解析并显示 `已取消` 徽标 + `caption` 说明 `这次重复已取消。`

### 🆕 日历与生成窗口（D-19 替换原 D-03 契约）

⚠ **替换声明：** 原「日历与生成窗口（D-03）」小节 —— 包括"后台按 90 天窗口滚动生成实例"这一前提、以及"查看日期晚于水位线即改用生成窗口专用文案"这一判定 —— **整体作废**。D-11 已把生成窗口从"未来 90 天滚动"改成"按频率的提前量"（每日 0 天，每周/每月/每年 6 天）。若沿用原判定，6 天水位线会让日历上**几乎每个未来日期**都弹出"更远的重复还没生成"面板 —— 一个正常状态被渲染成故障。

保留不变的前提：事件/任务列表响应带家庭级生成水位线（`materializedThrough`，可为 `null`），界面**不得**自行推算任何未来发生日期。

#### 两个状态，必须分开

| 状态 | 何时出现 | 呈现 | 为什么不能合并 |
|------|----------|------|----------------|
| **A. 生成落后**（服务端这一轮还没跑完） | 水位线**早于今天**（`materializedThrough < 今天`），且当前无任何筛选生效 | `StatusPanel kind="offline"`，标题 + 正文见 Copywriting | 真正的异常：今天的安排本该已经存在。值得占一整块面板。 |
| **B. 更远的日期还没轮到**（正常，仅日历屏） | 水位线不为 `null`，且**查看的日期晚于水位线** | 正常空态文案 **+ 其下一行 `caption` / `inkMuted` 注记** | 这是**正常**状态而非错误。6 天提前量下几乎每个未来日期都命中它，用面板呈现会淹没日历。 |

**对已发布行为的实质改动：**

- **日历屏**：原判定 `selectedDateIso > materializedThrough` → 整块 `StatusPanel`。改造后**同一个条件降级为一行 caption**（状态 B），`StatusPanel` 让位给新的状态 A 判定（`todayIso > materializedThrough`）。呈现降级、条件不丢 —— 信息一条不少，噪音全部消失。
- **任务屏**：原判定已经是 `todayIso > materializedThrough`，即状态 A。因此**只换文案，不改条件**；任务列表不按日期导航，**不引入**状态 B。

#### 强制项

- 状态 A 与状态 B **不得同时出现**。
- 水位线为 `null`（家庭没有任何重复规则）时，A 与 B **都不出现**，一律使用普通空态文案。
- 任何筛选生效时（任务屏 `activeFilterCount > 0`；日历屏标签筛选或重复筛选非「全部」），A 与 B **都不出现** —— 筛选后的空结果必须说"没有符合筛选条件的…"，不得把空结果甩锅给生成。
- 界面**不得**提供"立即生成"按钮，**不得**显示天数、水位线日期、提前量或调度周期（沿用原契约：生成由服务端拥有，界面不暴露手动触发入口）。
- 文案**不得**再出现任何固定天数（"90 天""6 天""7 天"等）。提前量按频率不同，写死任何一个数字都会对另外几种频率说谎。

---

## 🆕 Recurring-Only Filter Contract (D-15)

### 共同规格（任务侧与日历侧逐项一致）

两块屏幕使用**同一组** chip，视觉与语义完全一致，**不得**在任务侧和事件侧写两套：

| 项 | 值 |
|---|---|
| 选项 | `全部` / `仅看周期性`（二选一，默认 `全部`） |
| 容器 | `accessibilityRole="radiogroup"`、`accessibilityLabel="重复筛选"` |
| 每个 chip | `accessibilityRole="radio"` + `accessibilityState={{ selected }}` |
| 几何 | 沿用已锁定的次要 chip 令牌：水平内边距 `space.3`、垂直内边距 `space.1`、`borderRadius="full"`、`border.default` 1px、`hitSlop={space.3}` |
| 颜色 | 选中：`borderColor = coral` + 文字 `coral`，背景保持 `transparent`；未选中：`borderColor = border` + 文字 `inkMuted` |
| 文字 | `caption`（12px / 500） |
| 可访问名称 | `重复筛选：全部` / `重复筛选：仅看周期性` |

**不新增任何令牌** —— 上述值与已发布的优先级筛选 chip 逐项相同。选中态用 coral **描边**而非 coral 填充，因此不占用 accent 的填充配额（accent 穷举表无需修改）。

⚠ 与已锁定的星期几 chip 不同，这里**不是** `checkbox`：它是"全部 / 仅看周期性"的单选，不是多选开关。照抄 checkbox 语义会让屏幕阅读器把它读成可同时成立的两项。

### 任务列表（`tasks/index.tsx`）

- 位置：折叠筛选面板内，作为**第 5 组**，排在现有四组（状态 / 优先级 / 负责人 / 标签）之后。
- 带组标签：`Stack gap={1}` + `Text variant="caption" color="inkMuted"` 的 `重复` + chip 行。沿用负责人筛选组已有的"caption 组标签 + chip 行"结构 —— 面板里已经有一个无标签的"全部"（状态组），再放一个裸的"全部"会指代不明。
- **必须计入 `activeFilterCount`**（筛选按钮上的 coral 计数徽标）。漏计会让用户在折叠面板下看不出还有一层筛选生效，只看到一个"空"列表。
- 筛选在客户端完成（判据：实例的 `recurrenceRuleId` 非空）。**不得**为这一个 chip 引入"改筛选就重新取数"的第二套机制 —— 面板里四个既有 chip 全是客户端筛选，混用两种范式会让 `activeFilterCount` 与空态判定不一致。服务端的 `recurring` 查询参数是给其他消费方用的，界面不依赖它。

### 日历 / 事件列表（`events/index.tsx`）

- 该屏幕没有折叠筛选面板。chip 行作为**独立一行**渲染在月历与"选中日期"标题之间，位于既有标签筛选行**上方**。
- **始终渲染** —— 不像标签筛选行那样依赖"家庭里已有标签"。"这个家庭有没有周期性安排"用户无法预先知道，条件渲染会让入口时有时无。
- 与标签筛选是**两个互相独立的 radiogroup**，**不得**并入同一行或同一个 group：两者语义不同，合并会让屏幕阅读器把标签和重复读成一组互斥选项。
- `beyondGenerationWindow` 的抑制条件必须同时包含这个 chip，否则筛选后的空结果会被误报成"生成还没跟上"。

---

## 🆕 Recurrence Rule Management Contract (D-16 / D-14)

### 路由与骨架

| 路由 | 屏幕 |
|------|------|
| `app/(protected)/households/[id]/recurrence-rules/index.tsx` | 规则列表 |
| `app/(protected)/households/[id]/recurrence-rules/[ruleId]/index.tsx` | 规则详情（编辑 + 结束） |

沿用 `notes/index.tsx` + `notes/[noteId]/index.tsx` 的目录形状。屏幕骨架**逐项**照抄 `labels/index.tsx`：`AppShell`（含 `refreshing` / `onRefresh` / `title` / `showProfile`）+ `HouseholdHeader` + `HouseholdSwitcher` 三件套、`useFocusEffect` 重新取数，以及三个守卫分支的**固定顺序**：

1. `viewState === 'accessChanged'` → `AccessChangedPanel`
2. `householdId` 为空 → `这个页面暂时无法访问。`
3. token 为 `null` → `登录已过期。`

顺序不得调换：Phase 2 的访问态边界已在 `labels/index.tsx` 里验证过，重排会让"被移出家庭"退化成"页面无法访问"。

### 家庭首页入口卡片

在家庭首页现有 6 张快捷卡片之后新增**第 7 张**，紧跟「标签管理」之后、「家庭笔记」之前 —— 两张"管理"类卡片相邻。

- 视觉模板**逐项**沿用「标签管理」卡片：`Pressable`、横向排列、`gap = space.3`、`backgroundColor = surface`、`radius.md`、`padding = space.4`、`border.default` 1px `borderColor = border`、按下 `opacity: 0.8`。**不新增卡片样式**。
- 图标：`Repeat`（`lucide-react-native/icons/repeat`），24px、`strokeWidth={1.5}`、`color = colors.teal`。
  - 选 `Repeat` 而非 `RefreshCw`：`Repeat` 已经是 `RecurrenceBadge` 的图标，入口与徽标同形能让用户把两处联系起来；`RefreshCw` 在本产品语境里读作"刷新"。
  - 选 `teal` 而非 `coral`：首页已有三张 coral 图标卡片（今日 / 日历 / 标签），再加一张会把 accent 预算推过 10%。
- 文案：可访问名称 `管理周期规则`、标题 `周期规则`（`label`）、副标题 `查看和管理所有重复的任务和事件`（`bodySm` / `inkMuted`）、尾部 `进入 ›`（`caption` / `coral`，锁定模板）。

### 列表屏

`Stack gap={4}`，`Heading` 为 `周期规则`。每条规则一张卡片，几何沿用 `labels/index.tsx` 的行卡片：`surface` 背景、`radius.md`、`padding = space.4`、`border.default` 1px。整张卡片可点击进入详情（`accessibilityRole="button"`，触控目标 ≥48px 高）。

行内结构（`Stack gap={1}`）：

```
[类型徽标] 倒垃圾                        ← RecurrenceKindBadge + Text variant="body"
每周二、四、六重复，共 10 次              ← caption / inkMuted（格式化摘要）
下一次 2026-08-18                       ← caption / ink
```

| 元素 | 规格 |
|------|------|
| 类型徽标 | `RecurrenceKindBadge`：`ListTodo` / `Calendar` 图标 14px `inkMuted` + `caption` 文字 `任务` / `事件`，背景 `surfaceMuted`、`radius.sm`、水平内边距 `space.2`。**文字承载语义，不靠颜色区分** —— 这是 D-20 合并列表的可访问性底线 |
| 标题 | 规则的**模板标题**，**不是**任何一条实例的标题。实例可被单独改名，拿实例标题当规则名会说谎 |
| 频率摘要 | 复用已锁定的 `formatRecurrenceSummary` 输出，与详情页"重复"信息块**逐字一致**。结束条件（`，到 … 为止` / `，共 N 次`）已包含在摘要里，**不得**再单开一行重复展示 |
| 永不结束 | 仅当规则既无截止日期也无次数时，在摘要行尾追加 `，永不结束`；有结束条件时该词**不出现** |
| 下一次发生 | `下一次 {YYYY-MM-DD}`。该日期由**服务端按规则推算**，不是"已生成实例里最早的一条"（6 天提前量下健康的周规则经常没有未来实例行），也**不得**由客户端推算 —— 沿用 D-01 的反模式禁令 |
| 已结束 | 服务端返回的下一次发生为空时，该行改为 `caption` / `inkMuted` 的 `这个重复已经结束`，卡片整体 `opacity: 0.6`（与已取消实例一致） |

**排序：** 未结束的规则在前，按下一次发生日期升序；已结束的规则在后，按模板标题升序。

**已结束的规则保留在列表里，不隐藏。** "结束"不是"删除"，让它凭空消失会让用户以为数据被清掉了（D-14）。

**D-20：** 任务规则与事件规则**合并成一个列表**，不分 tab，类型由行内徽标区分。

### 详情屏

```
HouseholdHeader
Heading                          → 模板标题
[类型徽标]  [下一次 2026-08-18 / 这个重复已经结束]

重复                              ← label / inkMuted
每周二、四、六重复，共 10 次         ← body
[有些月份没有这一天，会自动改到当月最后一天。]   ← 仅每月且开始日 ≥ 29
[按 Asia/Shanghai 的日期重复。]                ← 仅规则时区与设备时区不同

—— 间距 space.5 ——

<RecurrencePicker />              ← 复用，实现锁定
更改会从明天开始生效，今天和之前的安排都保留。    ← caption / inkMuted，常驻可见
[保存更改]                         ← 主按钮

—— 间距 space.6 ——

结束此重复                         ← 文本动作，destructive
```

"重复"信息块的标签 + 值 + 两条注记，其结构与文案与已发布的实例详情页**逐字一致**，不得另起一套。

**`RecurrencePicker` 的 `startDate` 契约（易错，强制）：** 必须传**拆分锚点**（规则时区的"明天"），**不得**传规则原始的开始日期。该组件内有一个把 `value.startsOn` 强制同步到 `startDate` 的 effect；传错会让选择器与表单互相打架、每次渲染都改写用户刚做的选择。

**范围说明常驻，不弹范围弹层。** 规则级编辑的范围**由构造决定**只能是"此后所有"，没有"仅此一次"可选。因此这里**不得**复用 `SeriesScopeSheet` —— 弹出一个只有一个可选项、另一个恒为 disabled 的弹层是纯噪音。体验原则 3（"范围选择先于动作，不得用默认值替用户决定"）在这里通过**写入前常驻可见的范围说明 + 一次内联确认**满足，而不是通过弹层。已发布的 `SeriesScopeSheet` 三种 mode 保持原样，本屏不新增第四种 mode。

**保存的两步内联确认：** 点「保存更改」**不直接写入**，就地展开一行确认（沿用 `labels/index.tsx` 的两步内联确认形状，但用中性色而非 destructive）：

```
这会影响明天起的每一次。   [确认保存]  [取消]
```

进行中：`确认保存` → `保存中…`；两个动作与 `RecurrencePicker` 全部 `disabled`；确认行**不自动收起**，直到服务端返回。

### 结束此重复（D-14）

- 触发：屏幕最下方的文本动作 `结束此重复`，`bodySm` / `destructive`，触控目标 ≥48×48px。
- 两步内联确认，形状同上，但用 `destructive` 色：

```
确定结束？明天起不再重复，今天和之前的安排都保留。   [确认结束]  [取消]
```

- 进行中：`确认结束` → `结束中…`，两个动作 `disabled`。
- **锚点是"明天"，不是"今天"。** 今天这一次可能已经被完成了，按今天为锚会把它一并删掉 —— 那是"删除"语义，与本操作的名字矛盾。文案里的"明天起"必须与服务端锚点一致。
- **文案禁令（强制）：** 这条路径上的标题、说明、按钮、可访问名称、成功与失败文案里**不得**出现"删除""移除""清空"字样。用户在"仅此一次删除"（已发布）与"结束整条规则"之间必须能只凭文案分辨。"已发生过的安排全部保留"这一点必须写在确认文案里。
- 成功：返回列表并重新拉取权威状态。该规则**仍在列表中**，标为 `这个重复已经结束`。**不得**乐观更新，**不得**让它从列表消失。
- 已经结束的规则：`结束此重复` 以 `disabled`（`colors.disabled`）呈现，其下一行 `caption` 说明 `这个重复已经结束了。`；`RecurrencePicker` 与「保存更改」同样 `disabled`。

**权限：** 服务端对"非创建者的普通成员"返回拒绝。界面**不得**预先隐藏动作（客户端不复制权限判断，规则列表也不下发创建者身份），而是在失败后用 `Banner` 呈现原因文案（见 Copywriting）。

---

## Copywriting Contract

语气温暖、直接、非评判；先说事实，再说下一步。不出现技术词与内部字段名。

| Element | Copy |
|---------|------|
| 重复区块标签 | `重复` |
| 频率选项 | `不重复` / `每天` / `每周` / `每月` / `每年` |
| 星期几可访问名称 | `星期日` / `星期一` / … / `星期六` |
| 星期几空选拦截 | `至少需要选择一天。` |
| 结束条件标签 | `结束` |
| 结束条件选项 | `永不结束` / `截止日期` / `重复次数` |
| 次数字段标签 | `重复次数` |
| 次数字段后缀 | `次` |
| 月末钳位说明 | `有些月份没有这一天，会自动改到当月最后一天。` |
| 时区注记 | `按 {IANA 时区} 的日期重复。` |
| **Primary CTA（表单）** | `保存`（沿用现有 `submitLabel`，本阶段不改） |
| 保存中 | `保存中…`（沿用现有） |
| 重复徽标可访问名称 | `重复` |
| 详情页重复标签 | `重复` |
| 已取消徽标 | `已取消` |
| 已取消任务的状态切换可访问名称 | `这次重复已取消` |
| 已取消事件详情说明 | `这次重复已取消。` |
| 恢复动作 | `恢复这一次` |
| **Scope sheet 标题（edit）** | `保存这次改动？` |
| Scope sheet 说明（edit） | `这是一个重复安排。选择这次改动的影响范围。` |
| **Scope sheet 标题（delete）** | `删除这次重复？` |
| Scope sheet 说明（delete） | `这是一个重复安排。选择要删除的范围，此操作不可撤销。` |
| **Scope sheet 标题（rule-change）** | `更改重复规则？` |
| Scope sheet 说明（rule-change） | `重复规则的更改会影响之后的每一次，不能只改这一次。` |
| Scope 选项 1 | `仅此一次` |
| Scope 选项 2 | `此后所有` |
| Scope 取消 | `取消` |
| Scope 范围注记 | `「此后所有」只影响这一次和之后的重复，已经过去的不受影响。` |
| Scope 进行中 | `保存中…` / `删除中…` |
| 🆕 **Empty state heading（生成落后 = 状态 A）** | `重复安排还在补齐` |
| 🆕 **Empty state body（生成落后 = 状态 A）** | `周期性安排会在临近日期时自动生成，这一轮还没跑完。稍后下拉刷新就能看到。` |
| 🆕 **更远日期注记（状态 B，仅日历屏，接在普通空态之后）** | `周期性安排会在临近日期时才生成，更远的重复还没出现在这里。` |
| Empty state（普通，沿用现有） | `还没有事件。` / `还没有任务。点击上方按钮创建第一个任务。` |
| **Error：截止日期未填** | `请选择重复的截止日期。` |
| Error：截止日期早于开始 | `截止日期必须晚于开始日期。` |
| Error：次数超范围 | `重复次数需要在 1 到 1000 之间。` |
| **Error：保存重复规则失败** | `重复规则没有保存成功。请检查网络后重试。` |
| **Error：系列拆分失败（D-08）** | `没有完成。这个重复安排没有发生任何改变，请重试。` |
| Error：实例已不存在 | `这一次重复已经被其他人删除了。返回后可以看到最新的安排。` |
| Error：时区无法识别 | `无法识别当前设备的时区。请检查系统时区设置后重试。` |
| **Destructive confirmation（删除单次）** | `删除这次重复？` → `仅此一次`：只删除这一天的安排，其余重复保留。 |
| **Destructive confirmation（删除此后所有）** | `删除这次重复？` → `此后所有`：删除这一天及之后的全部重复，已经过去的保留。 |

### 🆕 Addendum Copy (D-14 … D-20)

**周期筛选（D-15）**

| Element | Copy |
|---------|------|
| 筛选组标签（任务面板内） | `重复` |
| 筛选选项 | `全部` / `仅看周期性` |
| 筛选可访问名称 | `重复筛选：全部` / `重复筛选：仅看周期性` |
| 空结果（任务，仅看周期性生效） | `还没有周期性任务。创建任务时打开"重复"，它就会出现在这里。` |
| 空结果（日历，仅看周期性生效） | `这一天没有周期性安排。` |

**家庭首页入口（D-16）**

| Element | Copy |
|---------|------|
| 卡片可访问名称 | `管理周期规则` |
| 卡片标题 | `周期规则` |
| 卡片副标题 | `查看和管理所有重复的任务和事件` |
| 卡片尾部 | `进入 ›`（锁定模板） |

**规则列表（D-16 / D-20）**

| Element | Copy |
|---------|------|
| 屏幕标题 | `周期规则` |
| 类型徽标 | `任务` / `事件` |
| 下一次发生 | `下一次 {YYYY-MM-DD}` |
| 永不结束后缀 | `，永不结束`（仅当既无截止日期也无次数时追加在摘要行尾） |
| 已结束的规则 | `这个重复已经结束` |
| 行可访问名称 | `{任务或事件}周期规则：{标题}，{频率摘要}` |
| **Empty state（一条规则都没有）** | `还没有周期规则。创建任务或事件时打开"重复"，规则就会出现在这里。` |
| Loading | 居中 `ActivityIndicator`（沿用 `labels/index.tsx`），不配文字 |
| **Error：列表加载失败** | `无法加载周期规则，请检查网络连接后重试。` + `重试` 动作 |

**规则详情（D-16）**

| Element | Copy |
|---------|------|
| 详情"重复"标签与摘要 | 与实例详情页**逐字一致**，不另起一套 |
| 生效范围说明（常驻） | `更改会从明天开始生效，今天和之前的安排都保留。` |
| **Primary CTA** | `保存更改` |
| 保存确认提示 | `这会影响明天起的每一次。` |
| 保存确认动作 | `确认保存` / `取消` |
| 保存中 | `保存中…` |
| **Error：详情加载失败** | `无法加载这条周期规则，请检查网络连接后重试。` |
| **Error：规则不存在** | `这条周期规则不存在，或者已经被移除了。` |
| **Error：保存失败（原子性对用户可见）** | `更改没有保存成功。这条重复规则没有发生任何改变，请重试。` |
| **Error：无权限修改** | `只有创建者、管理员或所有者可以修改这条重复规则。` |

**结束此重复（D-14 —— 文案里不得出现"删除"）**

| Element | Copy |
|---------|------|
| **动作标签** | `结束此重复` |
| **确认提示** | `确定结束？明天起不再重复，今天和之前的安排都保留。` |
| **确认动作** | `确认结束` / `取消` |
| 进行中 | `结束中…` |
| 成功后该规则在列表中的状态 | `这个重复已经结束` |
| 已结束时动作的禁用说明 | `这个重复已经结束了。` |
| **Error：结束失败** | `没有结束成功。这个重复安排没有发生任何改变，请重试。` |
| **Error：无权限结束** | `只有创建者、管理员或所有者可以结束这条重复规则。` |
| **禁用词（强制）** | 本路径全部文案中不得出现 `删除` / `移除` / `清空` |

**生成窗口（D-19）** —— 见上方主表中三行 🆕 文案。禁止在任何生成相关文案中出现固定天数。

---

## Loading, Empty, Success, and Error Behavior

- **表单加载：** 编辑既有实例时，重复区块与其余字段同批渲染，**不得**先渲染"不重复"再跳成实际规则（会让用户误以为规则丢失）。数据到达前整个表单沿用现有 `ActivityIndicator` 全屏加载。
- **提交中：** 重复区块内所有 chip 与输入 `disabled`，已输入值保留；主按钮内 `Spinner` + 稳定标签。禁止重复提交。
- **Scope sheet 提交中：** 三个按钮 `disabled`，被按下的显示 `Spinner`；弹层不自动关闭。
- **成功：** 关闭弹层 / 返回上一页并重新拉取权威状态。不使用彩纸、弹跳或自动轮播。生成的实例数量**不做数字播报**（后台可能仍在补齐，报数会误导）。
- **可恢复失败：** 使用 `Banner` 保留用户输入与当前上下文，提供重试；不清空重复区块的任何已填值。
- **系列拆分失败：** 必须显式告知"没有发生任何改变"（D-08 的原子性对用户可见），并重新拉取权威状态；**不得**显示部分成功，也不得让界面停留在"旧规则已终止"的假象上。
- **🆕 生成窗口：** 按状态 A / 状态 B 分别呈现（见「日历与生成窗口」）。两者都不提供"立即生成"按钮 —— 生成由服务端拥有，界面不暴露手动触发入口。
- **离线：** 沿用 Phase 2 契约，重复相关的所有写入入口 `disabled` 并说明原因；已加载的重复摘要保持只读可见。

### 🆕 Addendum 行为（D-14 … D-16）

- **规则列表加载：** 居中 `ActivityIndicator`（沿用 `labels/index.tsx`），失败时渲染 `destructiveSoft` 错误块 + `重试` 动作，**不**清空已加载的旧列表。返回本屏时用 `useFocusEffect` 重新取数 —— 从详情页结束或编辑规则后，列表必须立刻反映新状态。
- **筛选切换：** 纯客户端过滤，**不**触发取数，**不**显示加载态。切换后的空结果必须使用筛选专用空态文案，不得落回生成窗口状态。
- **规则详情保存 / 结束：** 两步内联确认；确认前**零写请求**（沿用体验原则 3）。提交中确认行不自动收起，`RecurrencePicker` 与两个动作全部 `disabled`。
- **成功：** 关闭确认行、返回列表并重新拉取权威状态。**不得**乐观更新任何规则或实例；生成的实例数量**不做数字播报**（后台仍在按提前量补齐，报数会误导）。
- **失败：** `Banner` 保留在屏幕顶部，用户已做的选择器改动**全部保留**，确认行恢复可用。规则级失败必须显式告知"没有发生任何改变"（沿用 D-08 的原子性对用户可见），**不得**显示部分成功。
- **已结束的规则：** 详情页所有写入入口 `disabled` 并给出原因；摘要与历史信息保持只读可见，不隐藏、不跳转。

---

## Accessibility Contract

- 延续 Phase 1/2：WCAG 2.2 AA；普通文字对比 ≥4.5:1，大字与非文字状态/焦点 ≥3:1。
- 所有 chip、按钮、弹层动作触控目标 ≥48×48px；星期几 chip 宽度可为 44px 但需 `hitSlop` 补足，高度不得低于 48px。
- 频率与结束条件用 `radiogroup` / `radio` 语义；星期几用 `checkbox` 语义；三者均带 `accessibilityState`，不依赖颜色。
- `SeriesScopeSheet` 打开后焦点按上表进入指定动作；Web 必须 focus trap 且支持 `Esc`；关闭后焦点回到触发按钮。
- 星期几空选拦截、保存/删除结果、拆分失败均通过 live region 宣告：拦截与成功用 `polite`，失败用 `assertive`（`Banner` 已内置）。
- 重复状态、已取消状态、生成窗口提示均以图标 + 文字 + 语义共同表达。
- 200% 文字缩放下：星期几 chip 允许折行为 4+3；弹层纵向滚动；摘要与后果说明完整可读。横屏 320px 等效宽度不得出现水平滚动。
- 减少动态效果（`prefers-reduced-motion`）：弹层去掉位移，仅保留 ≤80ms opacity（`motion.reducedTransitionMs`）；正常过渡 180ms（`motion.transitionMs`）。`forced-colors` 下保留系统边框与选中标记。
- Phase 3（日历/事件）此前缺少无障碍 E2E 审计（见 STATE.md Open Concerns）。本阶段对事件表单/详情/编辑的改动必须补上对应的 axe/键盘断言，**不得**把这块空白继续往后推。

### 🆕 Addendum 无障碍要求（D-14 … D-16）

- 重复筛选 chip：`radiogroup` / `radio` 语义 + `accessibilityState`，选中态不只靠 coral 描边表达；触控目标经 `hitSlop={space.3}` 补足至 ≥48×48px。
- 类型徽标：图标 **+ 文字**（`任务` / `事件`）双重表达，**不得**只用图标或只用颜色区分任务与事件规则。
- 已结束的规则：`opacity: 0.6` **不是**唯一信号 —— 必须同时有 `这个重复已经结束` 文字，且被禁用的动作带 `accessibilityState={{ disabled: true }}`。
- 两步内联确认（保存 / 结束）：确认提示以 `accessibilityLiveRegion="polite"` 播报；确认与取消在 DOM 顺序上紧随触发动作，键盘 Tab 可直接到达，**不得**让确认动作出现在触发点之外的位置。
- 规则列表每行的 `accessibilityLabel` 一次读出类型、标题与频率摘要，屏幕阅读器用户不必逐元素扫描。
- 生成窗口状态 B 的 caption 与其上的空态文案同属一个可访问文本块，**不得**成为孤立的装饰性文字。
- 规则列表与详情屏在 200% 字体、320px 等效宽度下不得出现水平滚动：列表行的徽标 + 标题允许折行，摘要与"下一次"各自独占一行。
- 长模板标题：列表行标题最多两行、超出省略，但 `accessibilityLabel` 必须保留完整标题；详情页 `Heading` **不得**截断。

---

## Motion and Feedback

- `SeriesScopeSheet` 原生自底部 180ms 滑入 + scrim 淡入；Web 180ms 淡入。减少动态效果时无位移、仅 80ms opacity。
- 频率切换导致的星期几/结束条件区块展开收起：不使用高度动画，直接挂载/卸载 —— 避免在滚动表单中产生跳动。
- 任何写操作超过 400ms 显示按钮内 `Spinner`；不得用全屏 spinner 遮住当前家庭上下文或已填表单。

---

## UI Considerations

Applicable state considerations resolved: **20 covered, 4 backstop, 0 unresolved**

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | 星期几多选（list-collection） | ✅ covered | "每周"频率下 `byWeekday` 永不为空：切换时默认勾选开始日期的星期几；取消最后一个为 no-op 并 polite 播报 `至少需要选择一天。` |
| empty | 🆕 生成落后（状态 A，list-collection） | ✅ covered | 水位线早于今天且无筛选生效时，渲染 `重复安排还在补齐` 的 `StatusPanel`；水位线为 `null` 或有筛选生效时不出现。**替换**原"超出生成窗口"行 |
| empty | 🆕 更远日期尚未轮到（状态 B，仅日历屏，list-collection） | ✅ covered | 查看日期晚于水位线时，普通空态之后追加一行 `caption` 注记；由面板降级为注记，正是消除"每个未来日期都报故障"回归的手段 |
| empty | 结束条件=截止日期但未填（form-field） | ✅ covered | 阻止提交，`DateField` 下方渲染 `FormMessage`：`请选择重复的截止日期。`，焦点移到该字段 |
| loading | 重复表单提交（form） | ✅ covered | 重复区块所有 chip/输入 `disabled` 且保留已输入值；主按钮内 `Spinner` + 稳定标签 `保存中…` |
| loading | `SeriesScopeSheet` 提交（dialog） | ✅ covered | 三个动作全部 `disabled`，被按下的显示 `Spinner`；弹层在服务端返回前不关闭、不乐观更新 |
| error | 系列拆分失败（dialog） | ✅ covered | 弹层保持打开并插入 `Banner`：`没有完成。这个重复安排没有发生任何改变，请重试。`；重新拉取权威状态 |
| error | 重复字段校验失败（form-field） | ✅ covered | 服务端 `VALIDATION_FAILED` 的 `details.field` 映射到重复区块内联 `FormMessage`，焦点移到首个出错字段 |
| populated | 重复实例卡片（list-item） | ✅ covered | `Repeat` 徽标 14px `inkMuted` + 卡片 `accessibilityLabel` 扩展为 `事件：{标题}，重复`；卡片几何不变，无第二渲染路径 |
| partial | 已取消的单次实例（list-item） | ✅ covered | 任务：`Ban` 图标 + `已取消` 文字 + 标题删除线 + 状态切换禁用 + 排除出今日待办；事件：从列表消失但深链详情仍可解析并标注 `这次重复已取消。` |
| overflow | 星期几 7 个 chip @ 320px（list-collection） | ✅ covered | 一行 7 列等分，chip 宽 ≥44px、高 48px、`hitSlop={space.1}`；200% 字体时折为 4+3 两行，不产生水平滚动 |
| zero-one-many | 重复摘要（static-content） | ✅ covered | 0 天不可达（见上）；1 天 → `每周三重复`；多天 → `每周二、四、六重复`，顿号分隔、周日→周六排序 |
| long-text | 重复摘要 + 月末钳位 + 时区注记三行叠加（static-content） | 🧪 backstop | 摘要最多两行、超出省略但 `accessibilityLabel` 保留全文；最长组合（每年 + 截止日期 + 长 IANA 时区名）需视觉回归确认不挤压相邻字段 |
| overflow | `SeriesScopeSheet` @ 320px + 200% 字体（dialog） | 🧪 backstop | 面板最大高 75% 视口、内部滚动、三个动作始终可达且不被安全区遮挡；需在真机与 Web 双端做 UI 状态回归 |
| empty | 🆕 周期规则列表零规则（list-collection） | ✅ covered | 渲染 `还没有周期规则。创建任务或事件时打开"重复"，规则就会出现在这里。` —— 指出创建入口，不只说"空" |
| empty | 🆕 仅看周期性筛选无结果（list-collection） | ✅ covered | 任务：`还没有周期性任务。创建任务时打开"重复"，它就会出现在这里。`；日历：`这一天没有周期性安排。`。筛选生效时生成窗口状态 A/B 一律抑制 |
| loading | 🆕 规则列表首次加载与聚焦重取（list-collection） | ✅ covered | 居中 `ActivityIndicator`（沿用 `labels/index.tsx`）；`useFocusEffect` 重取时保留旧列表，不闪空态 |
| loading | 🆕 规则保存 / 结束提交中（form） | ✅ covered | 确认行不自动收起；`RecurrencePicker` 与两个动作全部 `disabled`；被按下的动作显示 `保存中…` / `结束中…` |
| error | 🆕 规则不存在或无权限修改（form） | ✅ covered | 404 → `这条周期规则不存在，或者已经被移除了。`；拒绝 → `只有创建者、管理员或所有者可以修改这条重复规则。`（结束路径同义但用"结束"措辞）。动作不预先隐藏，失败后用 `Banner` 说明 |
| populated | 🆕 规则列表行（list-item） | ✅ covered | 类型徽标（图标 + `任务`/`事件` 文字，均 `inkMuted`）+ 模板标题 + 格式化摘要 + `下一次 {日期}`；下一次由服务端推算，客户端不算日期 |
| partial | 🆕 已结束的规则（list-item） | ✅ covered | 保留在列表中（结束 ≠ 删除），排在未结束规则之后；`这个重复已经结束` 文字 + `opacity: 0.6`；详情页写入入口 `disabled` 并说明原因 |
| zero-one-many | 🆕 下一次发生日期为空（static-content） | ✅ covered | 服务端返回空即规则已走完 → 该行改为 `这个重复已经结束`，**不得**渲染空白、`null` 或占位横线 |
| long-text | 🆕 长模板标题 + 长摘要 + 长 IANA 时区名叠加（list-item） | 🧪 backstop | 列表行标题最多两行、超出省略但 `accessibilityLabel` 保留全文；最长组合（每年 + 截止日期 + 长时区名 + 30 字标题）需视觉回归确认不挤压"下一次"行 |
| overflow | 🆕 任务筛选面板第 5 组 @320px + 200% 字体（list-collection） | 🧪 backstop | 新增筛选组后面板高度增长，需确认折叠面板内纵向滚动可达、`activeFilterCount` 徽标不被挤出、chip 不产生水平滚动 |

<!-- Status vocabulary (locked by probe-core projectTruths):
     ✅ covered   → a plain truth string lifted into must_haves.truths
     🧪 backstop  → a flat scalar { statement, verification: backstop }; at verify time, no explicit
                    evidence → insufficient_spec → human_needed (never a silent pass, #1154)
     ⚠ unresolved → an explicit planner assumption (surfaced, never silently dropped)
     Rows are REPLACED (not appended) on a probe re-run — idempotent. -->

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable — Expo / React Native + Restyle 自有组件层（Phase 1 决策） |
| Third-party registries | None | 本阶段不得引入任何 registry 代码 |

**shadcn gate 结论：** 仓库无 `components.json`、无 Tailwind/PostCSS 配置；技术栈为 Expo / React Native（非 React web / Next.js / Vite），且 Phase 1 已锁定"自有可访问 primitives + 类型化 Restyle 主题"为唯一视觉边界。因此 shadcn 初始化门禁**判定为不适用**，未向用户提问。

**🆕 追加范围同样适用：** 周期筛选 chip、规则列表与详情屏、类型徽标、两步内联确认 —— 全部用既有 primitives 与 React Native 原语实现。**不得**为列表屏引入 list/table 库、为规则详情引入表单库、为两步确认引入 dialog/alert 库，也**不得**新增图标包（三个新图标均来自已在用的 `lucide-react-native`，走精确子路径导入）。本次更新对 `apps/client/package.json` 的预期 diff 为空。

**新依赖禁令：** 本阶段的所有控件 —— 星期几多选、频率单选、结束条件切换、底部弹层 —— 必须用 React Native 的 `Pressable`、`View`、`TextInput`、`Modal` 与既有 `DateField` / primitives 实现。**不得**为 recurrence picker、segmented control、bottom sheet、dialog、日期库或 RRULE 解析引入任何新包。若实现计划确认必须新增依赖，需另行走供应链审批（Phase 1 先例：`.planning/STATE.md:111`），本契约不构成授权。

---

## Verification Matrix

| Contract | Verification |
|----------|--------------|
| 默认不重复 | 组件测试：新建事件/任务表单渲染后 `不重复` chip `checked`，星期几/结束条件/摘要均未挂载 |
| 无第二渲染路径（D-02） | 组件测试：`recurrenceRuleId` 有无仅影响徽标存在与否，卡片其余 props/样式快照一致 |
| 星期几永不为空 | `recurrence-picker-test.tsx`：切到"每周"默认勾选开始日星期几；取消最后一项后仍 `checked` 且触发播报 |
| 结束条件互斥（D-06） | `recurrence-picker-test.tsx`：切换 chip 后另一字段值被清空且不可见 |
| 摘要格式化正确 | `recurrence-summary` 纯函数单测：每天/单周/多周/每月/每年 × 无结束/截止/次数 的全组合 |
| 月末钳位提示（D-09） | 组件测试：每月 + 开始日 29/30/31 渲染钳位说明；每月 + 开始日 12 不渲染 |
| 时区注记（D-10） | 组件测试：设备时区与规则时区相同时不渲染；不同时渲染并含 IANA 标识 |
| 范围选择前零写请求 | `series-scope-dialog-test.tsx`：对重复实例点保存/删除后断言 API client mock 调用次数为 0，直到选择范围 |
| 普通条目路径不变 | 组件测试：`recurrenceRuleId === null` 的实例保存/删除不弹出 `SeriesScopeSheet`，沿用现有内联删除确认 |
| rule-change 只允许此后所有 | 组件测试：改动重复规则后打开的弹层中 `仅此一次` 为 `disabled` 且渲染原因说明 |
| 默认焦点契约 | 组件测试：`edit` → 仅此一次；`delete` → 取消；`rule-change` → 此后所有 |
| 拆分失败无部分成功 | 集成 + 组件测试：强制服务端失败后弹层保持打开、显示 `没有完成…` 文案、无任何实例状态变化 |
| 已取消任务不进今日待办 | `task-status-test.tsx`：`status='cancelled'` 的任务不出现在今日待办分区、不计逾期、状态切换 `disabled` |
| 已取消事件仍可深链 | 集成测试：列表过滤掉 `cancelledAt !== null`，`getById` 仍返回并渲染 `这次重复已取消。` |
| 🆕 生成落后空态（状态 A） | 组件测试：水位线早于今天时渲染 `重复安排还在补齐`；水位线为 `null` 或有筛选生效时不渲染 |
| 🆕 更远日期注记（状态 B） | 组件测试：日历选中日期晚于水位线时，渲染普通空态 **+** caption 注记，且**不**渲染 `StatusPanel`；这是防"每个未来日期都报故障"回归的断言 |
| 🆕 生成文案无固定天数 | 静态检查：`app/**` 与 `src/features/recurrence/**` 的生成相关文案不含 `90 天` / `6 天` / `7 天` 等固定天数字样 |
| 🆕 仅看周期性筛选 | 提取的纯函数单测：`recurrenceRuleId` 为空的实例被过滤掉；chip 计入 `activeFilterCount`；筛选生效时生成窗口状态 A/B 均被抑制 |
| 🆕 筛选 chip 语义 | 组件测试：容器 `radiogroup` + 两个 `radio` + `accessibilityState`；日历屏的重复筛选与标签筛选是两个独立 group |
| 🆕 规则行格式化 | `recurrence-rule-row` 纯函数单测：响应形状经 `recurrenceInputFromResponse` 归一化后不渲染 `null`（含 `endsOn`/`count` 为 `null` 的组合）；无结束条件时追加 `，永不结束` |
| 🆕 下一次发生为空 | 组件测试：服务端返回空 → 渲染 `这个重复已经结束` 且卡片 `opacity: 0.6`；不渲染空白或占位符 |
| 🆕 结束文案不含"删除" | 静态检查：`recurrence-rules/**` 与结束路径的全部文案（含可访问名称）不出现 `删除` / `移除` / `清空` |
| 🆕 结束锚点与文案一致 | 集成测试：结束操作后今天的实例仍在、明天起的实例消失，与 `明天起不再重复，今天和之前的安排都保留。` 一致 |
| 🆕 确认前零写请求 | 组件测试：点「保存更改」/「结束此重复」后断言 API client mock 调用次数为 0，直到点「确认保存」/「确认结束」 |
| 🆕 不复用 SeriesScopeSheet | 组件测试：规则详情屏渲染输出中不含 `SeriesScopeSheet`；已发布的三种 mode 快照保持不变 |
| 🆕 规则失败无部分成功 | 集成 + 组件测试：强制服务端失败后规则状态不变，`Banner` 显示 `…没有发生任何改变…`，用户已做的选择器改动保留 |
| 🆕 已发布契约未回归 | 快照测试：`recurrence-picker.tsx`、`series-scope-sheet.tsx`、`recurrence-badge.tsx`、`event-card.tsx`、`task-card.tsx` 渲染输出与本次更新前逐字一致 |
| 🆕 新屏幕可测性 | 静态检查：列表行格式化与状态判断位于 `src/features/recurrence/**`（Jest 可达），`app/**` 下两个新屏幕不含格式化逻辑 |
| 月历无重复标记 | 快照测试：`calendar-month.tsx` 渲染输出在引入重复后保持不变 |
| Token-only styling | 静态检查：`features/recurrence/**` 无裸色值、裸间距、裸圆角、裸字号、裸阴影 |
| 触控目标 | 布局断言：所有新增可点击元素 ≥48px 高；星期几 chip ≥44×48px 且带 `hitSlop` |
| Responsive | 320px / 390px / 768px / 1440px 布局断言；星期几一行 7 列不溢出 |
| Accessibility | axe（Web）、键盘遍历、弹层 focus trap + `Esc`、live region、200% 字体、`forced-colors`；并补上 Phase 3 遗留的事件侧无障碍断言 |
| 无新依赖 | `pnpm --filter client` 的 `package.json` diff 为空 |

---

## Source Traceability

| Source | Decisions Applied |
|--------|-------------------|
| 🆕 `07-CONTEXT.md`（追加决策段） | D-11（提前量取代 90 天窗口 → 生成文案不得写死天数）、D-14（规则级"结束此重复"，文案必须用"结束"不用"删除"）、D-15（"仅看周期性"筛选项）、D-16（周期规则管理列表 + 详情，复用摘要格式化与拆系列语义）、D-19（生成窗口空态必须连带改造，UI-SPEC 两处 90 天文案必须更新）、D-20（Task/Event 规则合并一个列表，每行用类型徽标区分）；"the agent's Discretion（追加）"中"管理列表的排序、空状态、是否分 tab"由本契约行使 |
| 🆕 `07-RESEARCH-ADDENDUM.md` | §5（筛选 chip 照抄优先级 chip 的 `radio` + `hitSlop` + `full` 圆角形态；必须计入 `activeFilterCount`；不得引入第二套取数机制）、§6（结束锚点取"明天"，避免吞掉今天可能已完成的一次）、§7（90 天文案与日历判定的双重回归，面板必须让位）、§8（`labels/index.tsx` 为屏幕原型：守卫顺序 / `useFocusEffect` / `AppShell`+`HouseholdHeader`+`HouseholdSwitcher` 三件套 / 两步内联确认；`Repeat` 图标与精确子路径导入；`RecurrencePicker` 的 `startDate` 必须传拆分锚点；`formatRecurrenceSummary` 的 null-vs-undefined 陷阱；`templateTitle` 而非实例标题）、Pitfall 7（`app/**` 屏幕不可测 → 格式化逻辑下沉 `src/features/recurrence/`） |
| `07-CONTEXT.md` | D-01/D-02（实例即普通条目，无第二渲染路径）、D-05（4 种预设频率、无 interval UI）、D-06（结束条件互斥）、D-07（仅此一次 + 已取消呈现）、D-08（此后所有 + 原子性对用户可见）、D-09（月末钳位提示）、D-10（时区注记）；"the agent's Discretion" 中"仅此一次/此后所有的前端呈现"与"重复设置 UI 的组件形态"由本契约行使 |
| `07-RESEARCH.md` | Pattern 7（chip 多选 + `useState` 表单，不引入 RHF）、Pattern 8（`HouseholdSwitcher` 的 Modal 平台分支与 RNW 卸载坑）、Pitfall 2（`cancelled` 六处 fan-out 的客户端消费点）、Pitfall 3（事件列表需过滤 `cancelledAt`）、Anti-Patterns（禁止客户端推算发生日期、禁止第二渲染路径）、~~A3（90 天窗口）~~ —— **A3 已被 D-11 的按频率提前量取代，见上方 `07-RESEARCH-ADDENDUM.md` 行** |
| `REQUIREMENTS.md` | RECR-01（创建重复规则的表单契约）、RECR-02（单次/此后所有的范围选择契约，含"整个系列"的等价说明） |
| `ROADMAP.md` | Phase 7 边界；依赖 Phase 3/4 的既有组件，不伪造提醒、同步、离线等 v2 能力 |
| `STATE.md` | Phase 1 决策：Restyle 主题 + 自有 primitives 为唯一视觉边界；48px 触控 / 52px 主控件；仅审计过的官方依赖；Phase 3 无障碍审计缺口 |
| `02-UI-SPEC.md` | 品牌色 60/30/10 分配、accent 穷举原则、分级确认与安全动作优先、live region、动效与 forced-colors 契约 |
| Live code | `ui/theme.ts`、`ui/primitives.tsx`、`ui/date-field.tsx`、`ui/household-components.tsx`、`features/events/{event-form,event-card,calendar-month}.tsx`、`features/tasks/{task-form,task-card}.tsx`、`features/labels/label-chip.tsx`、`app/(protected)/households/[id]/**` |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

> **🆕 本次复核范围：** D-01 … D-10 的契约已随 07-01..07-08 发布并通过审查，不重新验证。checker 只需针对本次带 🆕 标记的内容复核六个维度：D-15 筛选 chip、D-16 规则列表/详情 + 家庭首页入口卡片、D-14「结束此重复」文案与确认、D-19 生成窗口两状态改造，以及被替换的两处"90 天"文案。
