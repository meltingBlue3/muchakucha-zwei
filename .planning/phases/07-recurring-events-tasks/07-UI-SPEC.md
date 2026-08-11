---
phase: 7
slug: recurring-events-tasks
status: draft
shadcn_initialized: false
preset: muchakucha-warm-v1
created: 2026-08-12
---

# Phase 7 — 周期性重复事件与任务 UI Design Contract

> 周期性重复事件与任务阶段的视觉和交互契约。由 `gsd-ui-researcher` 生成，供 `gsd-ui-checker` 六维验证、`gsd-planner` 拆解任务、`gsd-executor` 作为视觉唯一事实源。

---

## Experience Intent

本阶段**不新增页面族**。它在已有的事件表单、任务表单、事件/任务详情、日历与今日视图上，增加三件事：设置重复规则、看出"这条会重复"、以及在改动或删除一个重复实例时**先明确影响范围**。

**体验原则：**

1. **重复是可选的、默认关闭的。** 表单打开时永远是"不重复"。不设置重复的用户，其表单视觉与操作路径必须与 Phase 3/4 完全一致，不得增加一次点击或一屏滚动。
2. **实例就是普通条目。** 生成的每个实例是一条真实 Event/Task（D-02）。卡片、日历格子、今日视图**不得**为"是否重复"引入第二套渲染路径；重复只表现为一个小徽标和详情页的一行说明。
3. **范围选择先于动作。** 对属于系列的实例执行保存或删除时，必须先回答"仅此一次 / 此后所有"，**不得**用默认值替用户决定，也不得在选择前发出任何写请求（D-07/D-08）。
4. **规则用中文说人话。** 界面永远显示"每周二、四、六重复"这类摘要，不暴露 `FREQ`、`BYDAY`、`RRULE`、`interval` 等技术词，也不暴露 IANA 时区标识以外的内部字段名。
5. **移动优先、Web 同源、令牌唯一。** 沿用 Phase 1 的 Restyle 主题与自有 primitives；本阶段**不得**引入任何新 UI 依赖、新样式机制或裸样式值。

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
| Heading | `heading` | 24px | 600 | 32px | `SeriesScopeSheet` 标题 |

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
| Success / Info | `color.teal` / `color.tealSoft` | `#277A72` / `#DCEEEA` | 重复摘要提示块背景与文字（信息性，非成功庆祝） |
| Destructive | `color.destructive` / `color.destructiveSoft` | `#B42318` / `#FDE4E1` | 删除范围弹层的两个删除动作、拆系列失败 `Banner` |
| Muted | `color.inkMuted` / `color.disabled` | `#6F625D` / `#B7AAA4` | "已取消"徽标、月末钳位说明、时区注记、禁用态 |

**Accent reserved for（穷举）：**

1. 重复区块内已选中的 chip 填充（频率、星期几、结束条件）；
2. `SeriesScopeSheet` 中**每次仅一个**主要动作的填充（`mode='edit'` 时为"仅此一次"；`mode='rule-change'` 时为"此后所有"）；
3. Web 键盘焦点环（`colors.focusRing`，与 coral 同族）；
4. 卡片重复徽标的图标描边**不使用** coral —— 徽标为 `inkMuted`，避免每张重复卡片都拉出一块强调色。

**禁止：** coral 不得用于重复徽标、不得用于日历中重复实例的日期格子、不得用于"已取消"状态、不得同时填充弹层里两个以上按钮。

**不依赖颜色的强制项：**

- 重复徽标 = `Repeat` 图标 + 可访问名称"重复"（详情页另有文字摘要），不得只靠颜色。
- "已取消"状态 = `Ban` 图标 + 文字"已取消" + 标题删除线，三重表达。
- 星期几 chip 的选中态 = 填充色 + `accessibilityState={{ checked }}`，屏幕阅读器可独立判断。
- `mode='delete'` 的弹层中，两个删除动作靠**文字**区分范围，不靠深浅色区分危险度。

---

## Information Architecture and Screen Inventory

本阶段**不新增路由**。改动落在以下既有位置：

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

`app/(protected)/households/[id]/tasks/index.tsx` 的筛选区**不新增**"只看重复"筛选项（超出本阶段范围，属 Deferred）。

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

### 日历与生成窗口（D-03）

后台按 90 天窗口滚动生成实例。界面必须能区分"这一天真的没安排"和"这一天超出了生成窗口"：

- 事件/任务列表响应需带家庭级生成水位线（如 `materializedThrough`，可为 `null`）。这是本契约对 API 形状的一条要求，由 planner 落到 DTO 上。
- 当前查看月份/日期**晚于**水位线且该家庭存在至少一条有效重复规则时，空态文案改用生成窗口专用文案（见 Copywriting），**不得**沿用普通"还没有事件"。
- 水位线为 `null`（家庭无任何重复规则）时，一律使用现有普通空态文案。

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
| **Empty state heading（超出生成窗口）** | `更远的重复还没生成` |
| **Empty state body（超出生成窗口）** | `重复安排会按 90 天窗口自动补齐。稍后再看这里，或先查看更近的日期。` |
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

---

## Loading, Empty, Success, and Error Behavior

- **表单加载：** 编辑既有实例时，重复区块与其余字段同批渲染，**不得**先渲染"不重复"再跳成实际规则（会让用户误以为规则丢失）。数据到达前整个表单沿用现有 `ActivityIndicator` 全屏加载。
- **提交中：** 重复区块内所有 chip 与输入 `disabled`，已输入值保留；主按钮内 `Spinner` + 稳定标签。禁止重复提交。
- **Scope sheet 提交中：** 三个按钮 `disabled`，被按下的显示 `Spinner`；弹层不自动关闭。
- **成功：** 关闭弹层 / 返回上一页并重新拉取权威状态。不使用彩纸、弹跳或自动轮播。生成的实例数量**不做数字播报**（后台可能仍在补齐，报数会误导）。
- **可恢复失败：** 使用 `Banner` 保留用户输入与当前上下文，提供重试；不清空重复区块的任何已填值。
- **系列拆分失败：** 必须显式告知"没有发生任何改变"（D-08 的原子性对用户可见），并重新拉取权威状态；**不得**显示部分成功，也不得让界面停留在"旧规则已终止"的假象上。
- **超出生成窗口：** 使用专用空态文案（见上表），不提供"立即生成"按钮 —— 生成由服务端拥有，界面不暴露手动触发入口。
- **离线：** 沿用 Phase 2 契约，重复相关的所有写入入口 `disabled` 并说明原因；已加载的重复摘要保持只读可见。

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

---

## Motion and Feedback

- `SeriesScopeSheet` 原生自底部 180ms 滑入 + scrim 淡入；Web 180ms 淡入。减少动态效果时无位移、仅 80ms opacity。
- 频率切换导致的星期几/结束条件区块展开收起：不使用高度动画，直接挂载/卸载 —— 避免在滚动表单中产生跳动。
- 任何写操作超过 400ms 显示按钮内 `Spinner`；不得用全屏 spinner 遮住当前家庭上下文或已填表单。

---

## UI Considerations

Applicable state considerations resolved: **11 covered, 2 backstop, 0 unresolved**

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | 星期几多选（list-collection） | ✅ covered | "每周"频率下 `byWeekday` 永不为空：切换时默认勾选开始日期的星期几；取消最后一个为 no-op 并 polite 播报 `至少需要选择一天。` |
| empty | 生成窗口之外的日历/任务列表（list-collection） | ✅ covered | 晚于家庭生成水位线且存在有效规则时，渲染 `更远的重复还没生成` 专用空态，而非普通"还没有事件" |
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
| 生成窗口空态 | 组件测试：水位线之后的月份渲染 `更远的重复还没生成`；水位线为 `null` 时渲染普通空态 |
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
| `07-CONTEXT.md` | D-01/D-02（实例即普通条目，无第二渲染路径）、D-05（4 种预设频率、无 interval UI）、D-06（结束条件互斥）、D-07（仅此一次 + 已取消呈现）、D-08（此后所有 + 原子性对用户可见）、D-09（月末钳位提示）、D-10（时区注记）；"the agent's Discretion" 中"仅此一次/此后所有的前端呈现"与"重复设置 UI 的组件形态"由本契约行使 |
| `07-RESEARCH.md` | Pattern 7（chip 多选 + `useState` 表单，不引入 RHF）、Pattern 8（`HouseholdSwitcher` 的 Modal 平台分支与 RNW 卸载坑）、Pitfall 2（`cancelled` 六处 fan-out 的客户端消费点）、Pitfall 3（事件列表需过滤 `cancelledAt`）、Anti-Patterns（禁止客户端推算发生日期、禁止第二渲染路径）、A3（90 天窗口） |
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
