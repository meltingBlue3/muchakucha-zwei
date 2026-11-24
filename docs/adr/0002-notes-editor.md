---
status: accepted
---

# 笔记用 DOM 组件里的 TipTap 编辑，仍存 Markdown

2026-11-24 决定。笔记改成「一页纸」：阅读和编辑合成一页，所见即所得，停笔自动保存，清单在阅读时就能勾。编辑器用 TipTap 3（基于 ProseMirror），放在 Expo DOM 组件里：Web 上是普通的网页组件，Android 和 iOS 上运行在 `@expo/dom-webview` 里。

笔记仍存成 Markdown，方言不变：markdown-it，`breaks: true`（单个换行就是换行），`html: false`，图片语法原样显示。清单用 GFM 的 `- [ ]` / `- [x]`。编辑器文档与 Markdown 之间用 tiptap-markdown 转换，它同样基于 markdown-it。助手读写笔记、列表摘要和搜索都继续读这份 Markdown。

依据是 2026-11-24 的真机试验，记录在分支 `claude/note-app-research-redesign-abe361` 的 `docs/notes-editor-spike.md`：

- Chromium 和 Redmi K40（Android 13）上，10 篇样例里 8 篇往返后渲染一致；
- 组字期间不保存；
- TalkBack 能读出清单项并勾选；
- Android 开发版再次打开，从挂载起 565 ms。

键盘相关的两项失败出在试验页的写法上，那份记录里有分析。

## 考虑过的方案

- **Software Mansion 的 enriched-markdown**：Expo 指南首推的原生编辑器。它的输入框不支持清单、引用、代码块和表格；Web 输入框不能新建链接，也没有 Markdown 快捷写法。清单是家庭笔记最常用的格式，所以不选。
- **Expensify 的 live-markdown**：只有一级标题，没有列表；自带的解析器是 ExpensiMark 方言。
- **系统输入框编辑 Markdown 源文，另做可勾选的阅读视图**：最稳，也不加依赖，但写的时候看得到 `**`、`- [ ]` 这些符号，与「一页纸」的目标不符。它留作退路：DOM 组件在某个平台上出现绕不过去的问题时改用它，交互规则不变。
- **官方的 `@tiptap/markdown`**：用 marked 解析，和阅读渲染用的 markdown-it 方言不一致，单个换行这类细节要另外对齐。
- **Milkdown**：基于 remark，方言同样要另外对齐，没有进入试验。

## 后果

- 富文本只在 WebView 里编辑，编辑器内部不能放原生组件。手机上的格式工具栏是原生的，放在 `KeyboardArea` 里保持在软键盘之上，通过 `useDOMImperativeHandle` 向编辑器发命令。
- 标题是编辑器文档的第一行，不另放原生输入框。在标题里按回车进入正文，由编辑器自己处理。试验里，原生输入框和 WebView 之间交接焦点在 Android 上失败了。
- 跨桥调用都是异步的，参数必须能序列化。离开页面后不能再调用已经关闭的 WebView。
- 往返会统一写法：项目符号写成 `-`，单个换行仍写成单个换行。只打开、没有修改的笔记不写回服务端。表格对齐和同一列表里混用普通项与清单项这两处，tiptap-markdown 处理不了，由我们自己的扩展补上。
- 判断是否在组字，用编辑器自己记录的 `compositionstart` 和 `compositionend`，组字期间不保存。只看 ProseMirror 的 `view.composing` 不够，在 Chromium 上会漏掉。
- 编辑权限不变：家庭成员都能修改任何笔记，删除仍只限作者和管理员。所以「每个人都能勾清单」不需要新接口。
- 新增依赖：TipTap 3 的几个包和 tiptap-markdown。tiptap-markdown 最近一次发布在 2025 年 9 月，更新已经放缓；它只有几百行，需要时可以把它的代码搬进 `features/notes`。
- 助手回复里的 Markdown 继续用原生的只读渲染（`MarkdownBody`），不进 WebView。
