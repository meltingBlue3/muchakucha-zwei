---
phase: 2
slug: household-member-collaboration
status: draft
shadcn_initialized: false
preset: muchakucha-warm-v1
created: 2026-08-02
---

# Phase 2 — 家庭组与成员协作 UI Design Contract

> 家庭组与成员协作阶段的视觉和交互契约。由 `gsd-ui-researcher` 生成，等待 `gsd-ui-checker` 验证。

---

## Experience Intent

本阶段必须让“我正在操作哪个家庭”始终一眼可见，并让邀请、角色和所有权等治理操作显得清楚、可预期、可恢复。体验延续 Phase 1 的温暖、现代、克制，不把家庭协作做成儿童化界面，也不以颜色代替权限和状态说明。

**体验原则：**

1. **上下文先于操作。** 所有受保护页面先显示当前家庭；所有家庭数据表单在标题下再次显示“保存到：{家庭名称}”。
2. **权限必须可解释。** 操作入口只在当前角色有权执行时出现；权限变化或拒绝用具体原因和下一步说明，不显示无效按钮制造猜测。
3. **治理操作逐级慎重。** 邀请与普通保存直接提交；角色降级和移除进入确认页；所有权转移及 owner 离开再增加最终确认。
4. **移动优先、Web 同源。** Android/iOS 以拇指可达的列表、底部弹层和全屏确认页为主；辅助 Web 使用同一组件和信息层级，不另建桌面产品。

## Design System

| Property | Value |
|----------|-------|
| Tool | `@shopify/restyle` 类型化主题（沿用 Phase 1） |
| Preset | `muchakucha-warm-v1` |
| Component library | 自有 React Native primitives；不得直接引入平台 UI kit 或 shadcn |
| Icon library | `lucide-react-native` 精确子路径导入；20px、2px stroke |
| Font | 本地 Noto Sans SC；本阶段仅使用 400 与 600，system sans fallback |
| Theme scope | v1 仅浅色；所有新增视觉值必须先进入 `apps/client/src/ui/theme.ts` 的语义令牌 |

### Existing Primitives to Reuse

必须复用 `Screen`、`Stack`、`Inline`、`Text`、`Heading`、`Button`、`IconButton`、`TextField`、`FormMessage`、`Banner`、`Spinner`、`LinkText` 与 `StatusPanel`。功能页面不得出现裸色值、间距、圆角、字号或阴影。

### Phase 2 Owned Components

| Component | Contract |
|-----------|----------|
| `AppShell` | 受保护页面外壳；安全区、可滚动内容、顶部家庭上下文和 Web 最大内容宽度由它统一负责 |
| `HouseholdHeader` | 顶部持续显示当前家庭名称和“切换家庭”可访问名称；名称最多两行，不能只显示图标 |
| `HouseholdSwitcher` | 移动端底部弹层，Web 为与触发器对齐的 popover；单选家庭列表、当前项标记、创建家庭入口 |
| `HouseholdContextNote` | 表单标题下固定格式“保存到：{家庭名称}”；使用文字与 home 图标，不能仅靠珊瑚色提示 |
| `HouseholdCard` | 无家庭入口与家庭选择页使用；标题、成员角色/数量元数据和明确动作 |
| `MemberRow` | 头像占位/首字、显示昵称、邮箱、角色徽标、本人标识与授权操作菜单；整行不默认可点击 |
| `RoleBadge` | 文案固定为“所有者 / 管理员 / 成员”；颜色仅辅助，必须保留可读角色文字 |
| `InvitationRow` | 受邀邮箱、状态、失效时间及授权操作；不得显示该邮箱是否有账号 |
| `ConfirmationPage` | 角色降级、成员移除、撤销邀请的全屏确认；明确成员、家庭和后果 |
| `FinalConfirmation` | 所有权转移与 owner 离开的第二层最终确认；移动端 modal、Web dialog，焦点受控 |

`HouseholdSwitcher`、`RoleBadge`、`MemberRow` 与确认组件必须进入自有组件层，不得在多个 feature 页面复制样式。

## Spacing Scale

沿用 Phase 1 的 4px 基线：

| Token | Value | Usage |
|-------|-------|-------|
| `space.1` | 4px | 图标与短标签的微间距 |
| `space.2` | 8px | 紧凑元数据、徽标内间距 |
| `space.3` | 12px | 标签到字段、列表行内部次级间距 |
| `space.4` | 16px | 默认组件间距、列表行水平与垂直内边距 |
| `space.5` | 20px | `<360px` 紧凑屏幕边距 |
| `space.6` | 24px | 默认移动端页边距、段落间距 |
| `space.8` | 32px | 页面标题与主要内容分隔、Web panel padding |
| `space.12` | 48px | 大段落分隔，不用于列表行 |
| `space.16` | 64px | Web 大画布留白 |

**Exceptions:** 安全区 inset 运行时叠加；边框 1px、焦点环 2px；触控目标最小 48px、主按钮与输入框 52px。这些是几何/可访问性约束，不是间距令牌。

## Shape and Elevation

| Token | Value | Usage |
|-------|-------|-------|
| `radius.sm` | 8px | 角色与状态徽标 |
| `radius.md` | 12px | 输入框、菜单项、紧凑提示 |
| `radius.lg` | 16px | 按钮、家庭卡片、弹层和确认面板 |
| `border.default` | 1px | 卡片、行分隔与输入边界 |
| `shadow.soft` | `0 8px 28px rgba(45,39,37,0.08)` | Web popover/dialog；原生列表和卡片不使用阴影 |

新增 `overlay.scrim` 语义令牌为 `rgba(45,39,37,0.60)`，仅用于 modal 背景。禁止嵌套三层圆角卡片；成员列表优先用单一 surface 和分隔线。

## Typography

本阶段只允许 4 个字号与 2 个字重；Phase 1 已存在的 `display` 与 500 weight 不用于家庭功能页。

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `caption` | 12px | 400 | 16px | 邀请失效时间、列表辅助元数据 |
| `bodySm` / `label` | 14px | 400 / 600 | 20px | 说明文案、字段标签、徽标和紧凑操作 |
| `body` / `button` | 16px | 400 / 600 | 24px / 20px | 正文、家庭名称、主要操作 |
| `heading` | 24px | 600 | 32px | 页面与确认标题 |

规则：

- 页面标题最多两行；家庭名称在顶部最多两行，列表内单行省略并提供完整可访问名称。
- 错误、确认后果、邮箱地址、家庭名称和主操作不得截断。
- 文案使用 sentence case；角色名称使用中文，不向普通用户暴露 `owner/admin/member` 技术值。
- 支持系统文字放大至 200%；放大后列表行增高并换行，操作不得覆盖正文。

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `color.canvas` `#FFF8F2` | 页面画布、弹层外背景和主要留白 |
| Secondary (30%) | `color.surface` `#FFFFFF`、`color.surfaceMuted` `#F5E9E1` | 列表、家庭卡片、上下文提示和底部弹层 |
| Accent (≤10%) | `color.coral` `#B94736` | 单一主 CTA、当前家庭选中标记、键盘焦点、活动文本链接 |
| Success | `color.teal` `#277A72` | 邀请已接受、创建/保存完成等成功状态，必须配文字与图标 |
| Destructive | `color.destructive` `#B42318` | 移除成员、撤销邀请、owner 离开及错误状态 |

**Accent reserved for:** 每屏唯一主要操作、当前家庭的 check 标记、当前选中项左侧标识、Web 焦点环、活动文本链接和小型品牌标记。珊瑚色不得用于所有卡片、角色徽标或大面积导航背景。

角色徽标使用 `surfaceMuted + ink` 的中性组合；owner 可增加 crown 图标，admin 可增加 shield 图标，但三种角色不得只靠颜色区分。破坏性颜色不得作为普通权限状态色。

## Layout Contract

### Mobile: Android and iOS

- `AppShell` 使用安全区加 24px 水平边距；宽度小于 360px 时为 20px。
- `HouseholdHeader` 是页面滚动内容前的固定上下文栏，高度至少 56px；左侧显示“当前家庭”小标签与家庭名，右侧是带文字或 chevron 的 48px 触控目标。
- 家庭切换器自底部出现，最大高度为可视区域 75%；标题、关闭按钮与当前项保持可见，家庭列表独立滚动。键盘不参与该弹层。
- 成员与邀请列表为单列；每行最小高度 72px。主要信息在左，角色/状态在右；授权操作放入 48px 的“更多操作”按钮。
- 普通表单主按钮位于表单流末尾、全宽 52px；不永久固定在键盘上方。确认页的取消与确认保持可见顺序：取消在前，破坏性确认在后。
- 所有权转移候选使用单选列表；当前 owner 不可选；继续按钮在选择有效继任者前禁用并声明 disabled 状态。

### Auxiliary Web

- 受保护内容宽度上限 960px、居中；顶部家庭上下文与内容同宽。`<768px` 使用移动布局。
- `≥768px` 时家庭设置采用 280px section navigation + 剩余内容的双栏结构；成员列表仍保持单列，不使用密集数据表格。
- 家庭切换器为触发器下方 popover，宽 360px、最大高 480px；Esc 关闭，焦点回到触发器，外部点击关闭。
- 确认流程仍为独立确认页；只有 D-10 要求的“最终确认”使用居中 dialog。不得将危险确认降级为浏览器原生 `confirm()`。

### Responsive Breakpoints

| Range | Contract |
|-------|----------|
| `<360px` | 20px inset；标题和操作允许换行；不使用并排按钮 |
| `360–767px` | 24px inset；单列列表与表单；底部家庭切换器 |
| `≥768px` | 32px 页面 gutter；最大 960px 内容；设置页双栏；popover 家庭切换器 |

## Information Architecture and Screen Inventory

| Route / State | Required Content | Primary Action |
|---------------|------------------|----------------|
| 无家庭入口 `/household-handoff` | 标题“开始设置你的家庭”、创建与接受邀请两个等权卡片、个人资料入口 | 卡片动作“创建家庭”与“接受邀请”并列，不预选其一 |
| 家庭选择 `/households` | 所属家庭列表、当前项、本设备恢复说明、创建入口 | “创建家庭” |
| 创建家庭 `/households/new` | 家庭名称、名称规则说明 | “创建家庭” |
| 家庭首页空壳 `/households/[id]` | `HouseholdHeader`、成员概览、Phase 3 内容不在此伪造 | “查看成员” |
| 家庭设置 `/households/[id]/settings` | 家庭信息、成员、待处理邀请、当前用户角色 | 依当前 section 为“邀请成员”或“保存家庭名称” |
| 邀请成员 | 当前家庭注记、邮箱字段、不泄露注册状态的说明 | “发送邀请” |
| 邀请预览 `/invite/[token]` | 未认证时只显示目标家庭名、邀请人、登录/创建账户入口 | “登录并继续”或“创建账户并继续” |
| 已认证邀请确认 | 家庭名、邀请人、当前账号邮箱、加入后角色“成员” | “接受邀请” |
| 邮箱不匹配 | 不再展示更多邀请详情；当前账号与切换说明 | “切换账户” |
| 成员列表 | owner、admin、member 分组/排序，本人标记、授权操作 | “邀请成员”仅 owner/admin 可见 |
| 角色变更 | 成员、当前角色、新角色与影响 | 提升为 admin 可直接“确认变更”；降级进入确认页 |
| 移除成员确认 | 成员、家庭、将立即失去访问权的后果 | “移除成员” |
| 转移所有权 | 家庭、当前 owner、继任者单选、权限后果 | “继续”后进入最终确认 |
| owner 离开家庭 | 继任者单选、所有权与离开原子完成说明 | “继续”后进入最终确认 |
| 访问权已变化 | 明确说明当前家庭访问权已变化；不得显示登录过期 | “选择其他家庭”或“设置家庭” |

## Household Lists and Ordering

- 家庭选择器按“当前家庭在首位，其余按最近成功访问时间倒序”排列；时间相同时按家庭名称排序。
- 成员列表按 owner、admin、member 排序；同角色内当前用户置顶，其余按显示昵称排序，昵称相同时按邮箱排序。
- 家庭名称规则：去除首尾空白后 1–40 个 Unicode 字符；允许重复家庭名，不用名称暗示唯一身份。错误文案为“请输入 1–40 个字符的家庭名称。”
- 空成员列表不可能出现；合法家庭至少显示 owner。若 API 返回无 owner/空列表，视为一致性错误，停止治理操作并显示错误面板。

## Household Switcher Interaction

1. 点击顶部当前家庭，打开选择器并把焦点移到当前家庭项。
2. 选择另一个家庭后，立即关闭选择器并显示页面级加载状态；在新家庭成员资格与首个查询成功前，不渲染旧家庭内容到新标题下。
3. 切换失败时恢复原家庭标题和数据，显示“暂时无法切换家庭。当前仍在「{家庭名称}」。”，提供“重试”。
4. 切换成功后只持久化到当前设备；不显示“已同步到其他设备”之类暗示。
5. 若原家庭资格失效，先清空该家庭查询缓存并禁用操作，再显示访问权变化页；不得静默跳到另一个家庭。

## Invitation Interaction and States

- 邀请表单只包含邮箱。新邀请角色固定为“成员”，不提供角色下拉框。
- 有效期固定为 7 天；邀请预览显示具体失效日期，不显示模糊“很快过期”。
- 同一家庭对同一规范化邮箱重复发送待处理邀请时，服务端轮换原邀请并刷新 7 天有效期；界面始终反馈“邀请已发送”，不透露账户存在性。
- 提交期间锁定重复提交并保持按钮宽度。成功后清空邮箱字段，显示可访问成功状态；不回显“该用户已注册/未注册”。
- 只有邮箱已属于当前家庭时可显示“这个邮箱已经是该家庭的成员。”
- 邀请状态文案固定为“待接受”“已接受”“已过期”“已撤销”。已接受/已过期/已撤销链接不再建立成员关系。
- owner/admin 可对待接受或已过期邀请执行“重新发送”，对待接受邀请执行“撤销邀请”；撤销走确认页。
- 接受邀请必须由用户明确点击；认证完成返回原邀请页，不自动加入。接受成功后进入目标家庭并将其设为当前设备的当前家庭。
- 若当前账户邮箱不匹配，页面仅保留“此邀请发给了另一个邮箱。请切换到受邀账户。”与“切换账户”，并隐藏家庭名、邀请人、受邀邮箱的进一步细节。

## Role and Destructive Interaction

### Permission Presentation

- owner 可邀请、管理所有非 owner 成员、转移所有权，并通过指定继任者离开。
- admin 可邀请，并可提升、降级、移除任意非 owner 成员，包括其他 admin；不得看到 owner 的角色变更、移除或所有权转移动作。
- member 只能查看成员和角色；不显示邀请及治理操作入口。
- 服务端返回 403 时不得仅 toast；关闭相关菜单，刷新成员资格，并显示“你的权限已变化。刷新后可继续查看当前家庭。”

### Confirmation Levels

| Action | Confirmation contract |
|--------|-----------------------|
| 提升 member 为 admin | 详情页直接确认，说明新增管理权限；不使用破坏性色 |
| 降级 admin 为 member | 独立确认页；显示成员、家庭、将失去的管理权限 |
| 移除非 owner 成员 | 独立确认页；显示成员、家庭、立即失去访问权与内容不可见后果 |
| 撤销邀请 | 独立确认页；显示邮箱、家庭、链接将失效 |
| 转移所有权 | 选择继任者页 → 后果确认页 → `FinalConfirmation`；最终按钮“确认转移所有权” |
| owner 离开 | 选择继任者页 → 后果确认页 → `FinalConfirmation`；最终按钮“转移所有权并离开” |

所有确认页默认焦点在标题；最终 dialog 默认焦点在“取消”。破坏性按钮和取消按钮不得颠倒视觉/DOM 顺序。操作 pending 后两个按钮均禁用；成功前不乐观移除成员或改变 owner 标识。

## Copywriting Contract

语气温暖、直接、非评判；优先说明事实和下一步。避免“非法”“无权”“系统错误”等内部术语，也不把权限变化误写为登录问题。

| Element | Copy |
|---------|------|
| 无家庭 heading | 开始设置你的家庭 |
| 无家庭 body | 创建一个新家庭，或接受家人发来的邀请。 |
| 创建 CTA | 创建家庭 |
| 接受入口 CTA | 接受邀请 |
| 创建成功 | 家庭已创建。你现在是这个家庭的所有者。 |
| 邀请 CTA | 发送邀请 |
| 邀请成功 | 邀请已发送。 |
| 邀请隐私说明 | 对方可通过邮件登录或创建账户后接受邀请。 |
| 家庭列表 empty heading | 还没有家庭 |
| 家庭列表 empty body | 创建一个家庭，或打开邀请链接加入家人的家庭。 |
| 成员列表 empty/inconsistent | 暂时无法显示成员。请刷新；如果问题持续，请稍后再试。 |
| 邀请列表 empty | 还没有待处理的邀请。 |
| Generic error | 这次没有完成。请检查网络后重试。 |
| Switch error | 暂时无法切换家庭。当前仍在「{家庭名称}」。 |
| Access changed heading | 家庭访问权已变化 |
| Access changed body | 你已不能继续访问「{家庭名称}」。请选择其他家庭继续。 |
| Email mismatch | 此邀请发给了另一个邮箱。请切换到受邀账户。 |
| Invitation expired | 这个邀请已过期。请联系家庭管理员重新发送。 |
| Invitation used | 这个邀请已经接受过，不能再次使用。 |
| Remove confirmation | 从「{家庭名称}」移除 {成员名}？移除后，对方会立即失去这个家庭的访问权。 |
| Demote confirmation | 将 {成员名} 改为成员？对方将不能再邀请或管理成员。 |
| Revoke confirmation | 撤销发给 {邮箱} 的邀请？撤销后，原链接将不能使用。 |
| Transfer final | 将「{家庭名称}」的所有权转移给 {成员名}？你将不再是所有者。 |
| Owner leave final | 将所有权转移给 {成员名} 并离开「{家庭名称}」？完成后你将立即失去访问权。 |

## Loading, Empty, Success, and Error Behavior

- **Session → household resolution:** 保持现有品牌启动状态，直到家庭列表、持久化选择与资格校验完成；不得闪现无家庭页或旧家庭内容。
- **Page load:** 家庭标题使用已验证的当前家庭状态；主体显示 3 个中性 skeleton 行。skeleton 不模拟成员姓名、角色或邀请状态。
- **Mutation:** 按钮内 spinner 与稳定标签；禁止重复提交。非秘密字段保留；邀请邮箱成功后清空。
- **Success:** 使用 teal 图标 + 文案的 inline status，自动消失不得早于 5 秒；屏幕阅读器以 polite live region 宣告。
- **Recoverable failure:** `Banner` 保留已验证数据和当前家庭，提供重试。网络失败不清除当前家庭持久化值。
- **403 / membership stale:** 立即冻结当前家庭动作、清缓存、重新获取家庭列表并进入访问权变化页；不得复用“登录已过期”。
- **404 deep link:** 使用通用“这个邀请无效或已失效”，不显示 token、内部 ID 或更多家庭信息。
- **Transaction failure:** 所有权、移除、接受邀请均保持操作前 UI；提示“没有完成，当前家庭状态未改变。请重试。”并重新拉取权威状态。
- **Offline:** 本阶段不承诺离线写入。保留已验证只读内容时显示“当前为离线内容，管理操作需要联网”；所有 mutation 入口 disabled 并解释原因。

## Accessibility Contract

- 延续 Phase 1：WCAG 2.2 AA；普通文字对比 ≥4.5:1，大字与非文字状态/焦点 ≥3:1。
- 所有触控目标至少 48×48px；主要按钮/输入 52px。icon-only 更多菜单必须有“管理 {成员名}”可访问名称。
- `HouseholdHeader` 的可访问名称必须包含“当前家庭：{家庭名称}，切换家庭”。选择器用单选语义并宣告当前项。
- 弹层打开后焦点进入标题或当前项；关闭后回到触发器。Web popover/dialog 必须支持 Esc；最终 dialog 必须 focus trap。
- 角色、邀请状态、当前家庭和危险操作均以图标/文字/语义共同表达，不依赖颜色。
- 成员变化、邀请成功、切换成功和权限变化通过 live region 宣告；批量刷新不得逐行播报。
- 提交失败时 Web 焦点移动到错误摘要；字段错误关联到输入。确认页加载后焦点移动到标题，最终 dialog 默认焦点为取消。
- 200% 文字缩放时家庭名称、邮箱、角色和后果说明完整可读；横屏 320px 等效宽度不得出现水平滚动。
- 减少动态效果时，弹层取消位移动画，仅保留 ≤80ms opacity；正常过渡沿用 180ms。forced-colors 下保留系统边框与选中标记。

## Motion and Feedback

- 普通页面切换沿用 Phase 1 的 180ms fade-through；减少动态效果为 80ms opacity。
- 家庭切换器移动端使用 180ms 自底部进入 + scrim 淡入；减少动态效果时无平移。
- 不使用庆祝彩纸、头像弹跳或自动轮播。成功反馈以稳定状态文案为主。
- 任何 mutation 超过 400ms 显示按钮 spinner；不得用全屏 spinner 遮住当前家庭上下文。

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable — Expo/React Native + Restyle 自有组件层 |
| Third-party registries | None | No registry code may be introduced in this phase |

不得为 bottom sheet、popover、dialog、avatar 或角色徽标新增未审计 UI 包。优先使用 React Native primitives、Expo Router、自有 Restyle 组件与精确子路径 Lucide 图标；如实现计划确需新包，必须另行完成依赖审批，不视为本契约授权。

## Verification Matrix

| Contract | Verification |
|----------|--------------|
| 当前家庭持续可见 | 所有家庭路由的组件测试断言 `HouseholdHeader`；表单断言“保存到：{家庭名称}” |
| 无上下文串线 | 切换测试断言新资格确认前不展示旧家庭数据；query key 包含 household ID |
| 双入口平等 | 320px/390px/768px 视觉检查；“创建家庭”“接受邀请”同层级且均可键盘访问 |
| 权限矩阵 | owner/admin/member 三角色组件测试覆盖可见动作及 403 刷新路径 |
| 邀请隐私 | 已注册/未注册/重复邀请响应使用相同成功文案；邮箱不匹配隐藏进一步详情 |
| 邀请状态 | 有效、过期、已接受、已撤销、无效与邮箱不匹配逐态测试 |
| 分级确认 | 降级/移除一层确认；转移/owner 离开额外最终确认；取消无副作用 |
| 事务失败 UI | 接受、移除、转移失败均恢复权威状态且不显示部分成功 |
| 成员资格失效 | 立即禁用操作、清除当前家庭缓存并进入访问权变化页，不跳登录 |
| Responsive | 320px、390px、768px、1440px 截图/布局断言；Web 设置双栏不变成数据表 |
| Accessibility | axe Web、键盘、焦点回归、dialog focus trap、live region、200% 字体与屏幕阅读器 smoke test |
| Token-only styling | 静态检查禁止 feature 文件中的裸色、间距、圆角、字号和阴影 |

## Source Traceability

| Source | Decisions Applied |
|--------|-------------------|
| `02-CONTEXT.md` | D-01..D-12 全部视觉/交互约束；双入口、持续家庭上下文、邀请回流、权限矩阵、分级确认与访问权变化 |
| `REQUIREMENTS.md` | HHLD-01..09、EXPR-02、SAFE-01、SAFE-02 的页面、状态和反馈要求 |
| `ROADMAP.md` | Phase 2 边界；不伪造日历、任务、笔记或标签功能 |
| Phase 1 `01-UI-SPEC.md` | 品牌、颜色、字体、间距、触控、焦点、动效、可访问性与 registry 决策 |
| Live code | `theme.ts`、`primitives.tsx`、`session-bootstrap.tsx`、protected route 与 auth/profile feature 模式 |

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
