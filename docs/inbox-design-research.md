# 收件箱交互调研

调研日期：2026-09-26。范围：Material 官方列表文档、Apple HIG、React Native 和 W3C WAI。

本文记录本次收件箱调整的依据，不另建视觉规范；颜色、间距和控件尺寸继续服从 [design.md](design.md) 与现有主题。未进行用户访谈或真机可用性测试。

## 一手资料与本项目决定

| 来源事实 | 本项目决定 |
| --- | --- |
| Material 将列表定义为连续纵向排列的项目，建议项目简短、易扫描，图标、文字和动作采用一致格式；列表项可以有标题、辅助文字和尾部元素。[Material 官方列表文档](https://github.com/material-components/material-components-android/blob/master/docs/components/List.md) | 使用一列连续列表，每条消息显示“某人邀请你加入某家庭”，右侧放接受、拒绝。时间作为次要信息；完整内容在详情中展示，减少卡片和重复标题。 |
| Apple 建议通知内容简洁、动作直接有用，动作名称清楚表达结果；点击通知应展示相关内容。前台收到新消息时可安静地插入列表，避免额外打断。[Apple Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications) | 文本区域打开详情；接受、拒绝是独立动作，点击后不同时打开详情。页面统一叫“收件箱”，空态不限定为邀请。邀请只是当前一种消息类型。 |
| React Native 的 RefreshControl 在滚动列表顶部提供下拉刷新；refreshing 是受控状态，需要反映实际请求进度。[React Native RefreshControl](https://reactnative.dev/docs/refreshcontrol) | 移除常驻“刷新收件箱”按钮；进入页面、重新获得焦点或回到前台时更新，移动端提供下拉刷新。错误态可以提供“重试”，已有消息在后台更新时保留。自动更新时机是本项目选择，不能从 RefreshControl 文档推导为平台规定。 |
| WAI 模态对话框要求打开时移动焦点、限制 Tab 在窗口内循环、支持 Escape 关闭，并在关闭后将焦点归还触发控件；对话框需要名称和可见关闭按钮。[WAI Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | 详情展示完整邀请人、家庭、发送时间、有效期和当前状态；复用符合这些行为的现有弹窗。处理邀请后，详情与列表保持一致；若原行消失，焦点返回合理的剩余控件。 |
| WCAG 2.2 的最小目标尺寸标准为 24 × 24 CSS 像素，并规定间距等例外。[WAI Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | 沿用项目已有触摸目标尺寸，不为了在小屏塞入按钮缩小可点击范围。主消息、接受、拒绝为同级可聚焦控件，避免可点击整行中嵌套按钮；窄屏允许消息文本换行。 |

Apple 的该文档讨论系统通知；这里只借鉴信息层级和动作设计，不将应用内收件箱等同于推送通知，也不由此增加通知权限请求。

## 本次实现边界

- 收件箱图标放在个人信息图标左侧，这是用户明确要求，不是平台规范。
- 通用列表负责摘要、时间、状态、动作和详情入口；邀请适配负责邀请字段以及接受、拒绝。未来消息可复用这个结构，本次不虚构其他通知或提前建设推送系统。
- 在没有服务端已读状态前，不把待处理邀请数称为“未读消息数”。处理成功给予明确反馈；请求期间禁用该消息的重复操作，失败保留消息和重试机会。
- 验证重点是小屏及长名称布局、列表动作不触发详情、弹窗焦点与关闭恢复、后台刷新不抹掉内容，以及已失效邀请的反馈。

Material 设计站的列表页直接抓取要求 JavaScript；上述列表事实采用同属 Material 官方维护的 Android 组件文档，未引用第三方设计博客。
