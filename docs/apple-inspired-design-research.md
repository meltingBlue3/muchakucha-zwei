# Muchakucha Zwei 前端设计调研与重构规范

调研日期：2026-09-14。范围：Apple HIG、Things、Cozi 的官方资料，以及当前 `apps/client/src/ui/theme.ts` 与 `docs/product-experience-redesign.md`。本文是设计研究与实施建议，数值为本项目的设计决策，不代表 Apple 对跨平台应用的强制规范。没有进行家庭用户访谈或原生设备可用性测试。

## 设计方向

保留现有珊瑚红 `#B94736`、青绿 `#277A72`、暖白底色 `#FFF8F2`，以清晰的信息层级、舒展的排版和精简的控件呈现家庭日常。页面应首先帮助用户看到今天的安排、待办与分工，再提供管理入口。重构的重点是导航、内容结构、组件状态与跨尺寸适配。

## 一手资料及其启示

| 来源事实 | 对本项目的设计启示 |
| --- | --- |
| Apple Typography 建议通过字号、字重、颜色区分层级，减少字体种类，适应用户字体大小设置；iOS 默认字号为 17 pt。 | 中文保留现有 Noto Sans SC，通过少量明确字号建立层级；正文采用 16–17，标题 32–34。让文字换行与容器增高，而不是全局限制文字缩放。 |
| Apple Layout 要求适应屏幕、方向、系统安全区域、文字大小及本地化变化。 | 手机单栏；宽屏增加有意义的列布局与侧栏。统一页面边距，避免只把手机卡片无限拉宽。 |
| Apple Tab Bars 将标签栏定义为顶层区域切换；建议保留文字标签、避免隐藏/禁用空模块、避免溢出入口。 | 稳定保留今日、日历、任务、笔记、家庭五个入口。空列表显示解释和创建动作。创建按钮属于页面动作，不占一个导航标签。 |
| Apple Materials 明确区分内容层和控制层；Liquid Glass 用于导航/控件，不应铺满内容层，并应节制使用。 | 白色分组与暖底色构成主要层次；可用轻量悬浮导航产生深度，正文卡片保持不透明。跨平台实现不依赖模仿玻璃折射。 |
| Things 官方展示 Today 将日程与任务集中，Upcoming 管理未来内容；附加字段按需出现。 | 今日页以实际日程/待办为主，未来项目折叠；快捷创建突出一个主动作。表单标题与主要内容先出现，次要信息按组组织。 |
| Cozi 官方介绍家庭日历支持成员颜色和成员筛选；成员名称与色点共同呈现。 | 分工必须有文字名称，色点只辅助识别。家庭概览可以展示真实成员，不能用假头像暗示不存在的成员。 |

来源：[Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography)、[Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout)、[Apple Tab Bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)、[Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Things 产品介绍](https://culturedcode.com/things/features/)、[Things 日期列表说明](https://culturedcode.com/things/support/articles/4001304/)、[Cozi Calendar](https://www.cozi.com/calendar/)、[Cozi FAQ](https://www.cozi.com/faq/)。上述 Apple 页面正文通过官方页面搜索索引读取；直接网页抓取返回 JavaScript 提示。

## 可直接实施的视觉规范

以下尺寸均为本项目建议的 React Native 逻辑尺寸；最终以真实字体缩放和小屏验证为准。

| 元素 | 建议 |
| --- | --- |
| 页面标题 | 32–34 / 40，Semibold；一屏只保留一个主要标题。避免每张卡片都使用超大字。 |
| 分组标题 | 20 / 28，Semibold；副标题 14 / 20，使用 `inkMuted`。 |
| 主内容 | 16–17 / 24–26；任务标题和日程标题优先保证可读性。 |
| 辅助元数据 | 13–14 / 18–20；12 仅供紧凑标记，不能承担主要内容。 |
| 页面边距 | 手机 20–24；紧凑屏优先 20；大屏 32。 |
| 组间距 | 24–32；组内 12–16；相关文字 4–8。 |
| 内容面板 | 20–24 圆角，白底；靠间距与极浅分隔线分组。不要所有面板都套深色描边。 |
| 输入与按钮 | 48–52 最小触控高度；字段使用明确标签，不能只靠 placeholder。控件边界和焦点环保持可辨识。 |
| 主次操作 | 珊瑚实心用于主要动作；次要动作用低对比背景或文字按钮；危险操作独立使用 destructive。 |
| 图标 | 统一图标体系与笔画；20–24 图形放进至少 48 的点击区域。避免不同平台 emoji 导致风格和尺寸漂移。 |
| 阴影 | 轻微阴影只强调悬浮层、弹层或少量关键面板。长列表优先平整、整齐的分组行。 |
| 动效 | 按压颜色、轻微淡入即可；遵循系统减少动态效果偏好，不以动画阻塞核心操作。 |

当前 `border` 颜色较深。应区分装饰分隔线与交互边界：新增浅色装饰 token，保留输入边界、焦点与高对比状态的语义 token。不能为了柔和效果统一降低全部边框对比。色彩调整集中在主题，业务页面只引用语义 token。

## 页面重构落点

- **今日**：紧凑的日期和家庭上下文、清晰标题、真实摘要、快捷创建，再进入逾期/日程/任务内容。留白服务于扫描，避免首屏只有欢迎语。数据未加载完成时不把计数显示为零。
- **日历**：日期导航与选中日期视觉分离，提供回到今天；日程卡片首先展示时间与标题，其次成员和标签。小屏可按现有功能使用单栏，宽屏使用日历和选中日期详情并排。
- **任务**：将常用筛选整合为一组清晰控件，列表减少卡片重复装饰。状态操作必须延续现有语义；如改为直接完成，需要同步更新行为和回归测试。
- **笔记**：用标题、有限行正文预览、更新时间区分内容；空态给出真实可用的创建动作。不能画出尚未实现的置顶、搜索或附件交互。
- **家庭**：成员与家庭身份优先，标签、重复规则与设置组织为统一管理列表。危险操作保持现有权限和后果说明。
- **登录、账户、详情与编辑**：采用同一排版、按钮和面板体系。标题、返回、主要操作位置一致；提交中禁止重复提交，失败保留用户输入。
- **宽屏**：稳定的侧栏/导航与有限宽内容区域；概览可以双栏，但表单保持适合阅读的宽度。移动导航留足安全区及底部内容间距。

这些页面落点是结合本仓库结构的设计推导；相关启发见 [Things Today](https://culturedcode.com/things/support/articles/4001304/) 和 [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout)。不在视觉重构中更改日期、权限或重复规则含义。

## 可访问性与验收

Apple Buttons 建议常规按钮至少具有 44 × 44 pt 命中区域；本项目已有 48 的触控 token，可以继续使用。[Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)

Web 普通文字以至少 4.5:1、大字至少 3:1 对比为验证基线；颜色不能是表达状态的唯一方式。保留状态文字、选中标记和可见键盘焦点，错误需要可读的原因。[W3C Contrast Minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum)、[W3C Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)

验证至少覆盖紧凑手机、常规手机和宽屏；检查长中文标题、多成员、空态、加载、错误、弹层以及键盘操作。字体放大时允许标题、表单标签和操作区重排。Apple 特别要求布局适应字体尺寸并减少重要内容截断。[Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography)

本轮应先落地统一主题和共享组件，再核对所有路由：视觉样式一致不等于页面流程已验证。Web 截图只能验证 Web 渲染，不能据此宣称已通过 Android/iOS 真机验证。
