# 前端设计调研

调研日期：2026-09-14。范围：Apple HIG、Things、Cozi 的官方资料。

本文只保存 [前端设计规范](design.md) 各项决定的**来源与理由**。具体数值以 [theme.ts](../apps/client/src/ui/theme.ts) 为唯一实现来源，规范条款以 design.md 为准；本文不重复它们，也不构成另一套尺寸标准。

这些数值是本项目的设计决策，不代表 Apple 对跨平台应用的强制规范。调研没有进行家庭用户访谈，也没有原生设备可用性测试。

## 设计方向

保留暖白底色 `#FFF8F2`、珊瑚红 `#B94736`、青绿 `#277A72`，以清晰的信息层级、舒展的排版和精简的控件呈现家庭日常。页面先帮助用户看到今天的安排、待办与分工，再提供管理入口。

## 一手资料及其启示

| 来源事实 | 对本项目的设计启示 |
| --- | --- |
| Apple Typography 建议通过字号、字重、颜色区分层级，减少字体种类，适应用户字体大小设置；iOS 默认字号为 17 pt。 | 通过少量明确字号建立层级。实现时发现原主题的 Noto Sans SC 未加载，改用平台系统字体栈。让文字换行与容器增高，而不是全局限制文字缩放。 |
| Apple Layout 要求适应屏幕、方向、系统安全区域、文字大小及本地化变化。 | 手机单栏；宽屏增加有意义的列布局与侧栏。统一页面边距，避免只把手机卡片无限拉宽。 |
| Apple Tab Bars 将标签栏定义为顶层区域切换；建议保留文字标签、避免隐藏或禁用空模块、避免溢出入口。 | 稳定保留今日、日历、任务、笔记、家庭五个入口。空列表显示解释和创建动作。创建按钮属于页面动作，不占一个导航标签。 |
| Apple Materials 明确区分内容层和控制层；Liquid Glass 用于导航和控件，不应铺满内容层，并应节制使用。 | 白色分组与暖底色构成主要层次；可用轻量悬浮导航产生深度，正文卡片保持不透明。跨平台实现不依赖模仿玻璃折射。 |
| Apple Buttons 建议常规按钮至少具有 44 × 44 pt 命中区域。 | 现有 48 的 `controlSizes.touchTarget` 覆盖该基线，继续沿用；视觉图标尺寸与可点击区域分开处理。 |
| Things 官方展示 Today 将日程与任务集中，Upcoming 管理未来内容；附加字段按需出现。 | 今日页以实际日程和待办为主，未来项目折叠；快捷创建突出一个主动作。表单标题与主要内容先出现，次要信息按组组织。 |
| Cozi 官方介绍家庭日历支持成员颜色和成员筛选；成员名称与色点共同呈现。 | 分工必须有文字名称，色点只辅助识别。家庭概览展示真实成员，不用假头像暗示不存在的成员。 |
| W3C WCAG 2.2 要求普通文字至少 4.5:1、大字至少 3:1 的对比度，且颜色不能是表达信息的唯一方式。 | design.md 的「状态不能仅靠颜色表达」与 [对比度检查](../apps/client/src/ui/__tests__/contrast-test.ts) 由此而来。保留状态文字、选中标记和可见键盘焦点，错误给出可读的原因。 |

来源：[Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography)、[Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout)、[Apple Tab Bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)、[Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)、[Things 产品介绍](https://culturedcode.com/things/features/)、[Things 日期列表说明](https://culturedcode.com/things/support/articles/4001304/)、[Cozi Calendar](https://www.cozi.com/calendar/)、[Cozi FAQ](https://www.cozi.com/faq/)、[W3C Contrast Minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum)、[W3C Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)。上述 Apple 页面正文通过官方页面搜索索引读取；直接网页抓取返回 JavaScript 提示。
