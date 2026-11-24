# 笔记「一页纸」：实施方案

把笔记从「阅读视图 →『编辑』→ Markdown 表单 →『保存』」改成一页：打开就能写，排版所见即所得，停笔自动保存，清单直接勾。本文写给实施者，按步骤做，每步以「完成标准」收尾。全部做完后按第 9 步收尾，并删除本文件。

这是重设计的第一步。第二步（置顶、笔记用家庭标签、按标签筛选、正文搜索、清单行显示进度）另出方案，不在本文范围内。

## 已定的决定

编辑器、存储方言和取舍记在 [ADR 0002](adr/0002-notes-editor.md)，先读它。实施中保持这些决定不变；需要推翻其中一项时，先和产品负责人确认。

试验分支 `claude/note-app-research-redesign-abe361` 只作参考，不要合并。其中的 `apps/client/src/features/notes/prototype-note-editor-dom.tsx` 有已经验证过的扩展配置，可以照搬：`Dialect`（关掉图片）、`TightTaskLists`、`PlainHardBreak`，以及组字标记。`docs/notes-editor-spike.md` 记录了真机结果和几处要注意的坑。

产品负责人认可的交互规则如下，第 8 步要把它们写进 [design.md](design.md)：

- **打开**：点清单里的笔记，看到的就是可以写的文档。没有「编辑」按钮，也没有预览切换。打开时不自动聚焦，手机上轻点文字才放光标，避免一打开就弹出键盘。
- **保存**：停笔约 1 秒、切到别的笔记、离开页面、应用转到后台时都会保存。组字期间不保存；只是打开、没有改动的笔记不写回。`Ctrl Enter` 保留，作用是立刻保存。
- **标题**：页面最上面一行大字，就是编辑器文档的第一行，回车进入正文。标题可以空着，保存时取正文第一行非空文字作标题；标题和正文都空时不保存。
- **清单**：存成 `- [ ]` / `- [x]`。点方框只切换勾选，不弹键盘；点文字才进入编辑。在清单项里回车接一个新项，在空项上再回车就退出清单。勾选立刻保存，撞上别人的修改时自动合并。
- **格式**：手机上，键盘上方有一排工具：清单、列表、标题、粗体、链接、收起。宽屏没有常驻工具栏，在行首输入 `/` 打开插入菜单。两端都可以直接打 Markdown 快捷写法，`/` 菜单也两端都能用。表格从工具栏移进 `/` 菜单。
- **页头**：显示作者、谁最后改过和保存状态，右侧是「…」菜单，里面有删除（只对有权限的人出现）和复制为 Markdown。删除仍用居中的确认窗口。
- **权限不变**：家庭成员都能改任何笔记，删除只限作者和管理员。

## 1. API：记录谁最后改过

- **迁移**：`Note` 加可空的 `updatedBy`，映射为 `updated_by`，`@db.Uuid`，关联 `User`，`onDelete: SetNull`。迁移里用 `created_by` 回填已有的行。
- **服务**（[notes.service.ts](../apps/api/src/modules/notes/notes.service.ts)）：`create` 和 `update` 都把 `updatedBy` 写成当前操作人。助手经由同一个服务读写笔记，所以不用另外改。
- **DTO**（[create-note.dto.ts](../apps/api/src/modules/notes/dto/create-note.dto.ts)）：`NoteResponseDto` 加 `updatedBy: string | null`。
- 标题仍要求 1–200 字。取正文第一行作标题由客户端完成，API 不变。

完成标准：

- `pnpm openapi:generate` 之后，`pnpm openapi:check` 没有差异；
- [notes.int.test.ts](../apps/api/test/notes/notes.int.test.ts) 覆盖两点：新建后 `updatedBy` 是作者；另一位成员修改后 `updatedBy` 是这位成员。

## 2. 客户端：Markdown 工具函数

在 [markdown.ts](../apps/client/src/features/notes/markdown.ts) 旁新增纯函数，不依赖编辑器：

- `noteTitle(title, body)`：标题非空时返回去掉首尾空白的标题；否则取正文第一个有文字的块，转成纯文本（可以复用 `markdownExcerpt` 的做法），截到 200 字；两者都空时返回 `null`。
- `setChecklistItem(markdown, { index, text, checked })`：在别人改过的最新 Markdown 上重放一次勾选。用 markdown-it 的 token 和 `map` 行号找到第 `index` 个清单项，只有文字也等于 `text` 时才改它的 `[ ]` / `[x]`。改了就返回新的 Markdown；找不到，或者文字已经变了，就返回 `null`。
- 只读渲染 [markdown-body.tsx](../apps/client/src/features/notes/markdown-body.tsx)（助手回复在用）把清单项画成不可点的方框加文字，不再显示成方括号。

完成标准：Jest 覆盖这两个函数，包括正常、文字已变、项已删除、嵌套清单和清单在引用里这几种情况；`MarkdownBody` 渲染清单的测试也要有。

## 3. 客户端：编辑器组件

新建 `apps/client/src/features/notes/note-editor-dom.tsx`，文件顶部写 `'use dom'`。依赖固定到发布满两周的同一版本：`@tiptap/core`、`@tiptap/pm`、`@tiptap/react`、`@tiptap/starter-kit`、`@tiptap/extension-list`、`@tiptap/extension-table`、`@tiptap/extension-hard-break`、`@tiptap/suggestion`，以及 `tiptap-markdown@0.9.0`。

- **扩展**：
  - StarterKit，关掉 `underline`（Markdown 没有下划线）和自带的 `hardBreak`；
  - 试验里的 `PlainHardBreak`、`TightTaskLists`、`Dialect`；
  - TaskList，TaskItem 打开 `nested`；
  - TableKit，关掉 `resizable`；
  - Markdown 扩展：`html: false`、`breaks: true`、`tightLists: true`、`bulletListMarker: '-'`、`linkify: false`；
  - Link：`openOnClick: false`、`autolink: false`、`linkOnPaste: true`，只接受 `http:`、`https:`、`mailto:`（同 `safeLink`）。
- **标题行**：自定义 Document，内容为 `title block+`。Title 节点画成大字，占位文字由 props 传入。在标题里按回车，把光标移到正文开头，正文空着就新建一个段落。`getContent()` 返回 `{ title, body }`：`title` 是标题行的纯文本，`body` 是去掉标题行之后整篇文档序列化出的 Markdown。
- **已知差距**：
  - 表格对齐：给单元格加 `align` 属性，从 `style="text-align"` 解析，再自定义表格的 Markdown 输出，写出 `:--`、`:-:`、`--:`。
  - 混合列表：同一列表里既有普通项又有清单项时，读进来不能多出空方框，第二次往返的输出要和第一次相同。可以在解析阶段只把「所有项都是清单项」的列表当清单，其余列表里的 `[ ]` 原样保留为文字。
- **变化上报**：
  - 只在内容真的变了时，回调 `onChange({ title, body, kind })`，组字期间不回调。组字状态用自己的标记，在 `compositionstart` 时置上，在 `compositionend` 时清掉。
  - `kind` 是 `'tick'` 或 `'edit'`。勾选时另外带上 `{ index, text, checked }`，供第 4 步自动合并。
  - 防抖放在调用方（第 4 步），编辑器只负责及时、准确地上报。
- **命令**（`useDOMImperativeHandle`，参数都是 JSON）：
  - `load(markdown, title)`：换内容，不触发 `onChange`；
  - `toggleTaskList`、`toggleBulletList`、`toggleOrderedList`、`setHeading(level)`、`toggleBold`；
  - `setLink(href, label)`、`insertTable(columns, rows)`；
  - `focus(where)`、`blur`。
  - 光标所在处的格式状态用 `onActive` 回报，工具栏据此显示按下状态。
- **`/` 菜单**：用 `@tiptap/suggestion`，只在行首或空格后触发。菜单项依次是：待办清单、列表、编号列表、小标题、引用、分隔线、表格、代码块、链接。每项右侧用浅色写出对应的 Markdown 写法，比如 `- [ ]`。支持 ↑↓、Enter、Esc。「表格」和「链接」交给调用方，打开现有的表格和链接步骤，也就是现在 [markdown-editor.tsx](../apps/client/src/features/notes/markdown-editor.tsx) 里那两组输入框。
- **样式**：颜色和尺寸都从 [theme.ts](../apps/client/src/ui/theme.ts) 经 props 传入，因为 WebView 的代码里引不进 `theme.ts`（它依赖 Restyle），而 [token-static-test.ts](../apps/client/src/ui/__tests__/token-static-test.ts) 也会检查 `src/features` 下的 CSS 字符串。宽屏用 `readingTitle` 和 `readingBody`，手机用 `heading` 和 `body`。清单方框用 `controlSizes.checkbox` 大小的小圆角方形，勾上后填墨色；已勾的项文字划线、颜色变淡。
- **无障碍和文案**：WebView 里不加载 i18n。占位文字、方框的读屏名称（「已勾选：{文字}」）、编辑区名称「笔记内容」、`/` 菜单文字都由调用方传入。
- **卸载**：调用方卸载后，不能再调用这个组件的命令。

完成标准：

- `pnpm --recursive typecheck` 通过；
- 在 Web 上，打开一篇样例笔记不触发 `onChange`；
- 试验里的 10 篇样例往返后，用 markdown-it 渲染出的 HTML 与原文一致，包括表格对齐和混合列表；
- 第二次往返的输出与第一次相同。

这些可以放进第 7 步的 Playwright 检查。

## 4. 客户端：自动保存

新建 `apps/client/src/features/notes/use-note-autosave.ts`，把保存流程集中在一处：

- **草稿**：每次 `onChange` 都把 `{ title, body }` 写进 `useWorkspaceState`，键沿用 `draft:<householdId>:notes:<noteId|new>:`。保存成功后清掉；离线或失败时留着，下次打开先恢复。只要有恢复出来的草稿，状态就显示「未保存」。
- **何时保存**：编辑停下 1 秒后、立刻保存（`Ctrl Enter`）、窗口关闭或切到别的笔记之前、`AppState` 转到后台时。勾选不等防抖，立刻保存。同一时间只发一个请求，请求期间又有改动时，等它返回后再发一次。
- **新建**：`noteId` 为 `new` 时，第一次保存用 `createNote`，标题取自 `noteTitle()`，`noteTitle()` 返回 `null` 时不保存。创建成功后：
  - 用 `router.setParams({ noteId })` 换成新笔记的地址，组件不重新挂载，编辑器不重载；
  - 把草稿从 `new` 的键移到新 id 的键下；
  - 之后的保存都用 `updateNote`。
- **版本**：每次保存都带上最近一次服务端返回的 `updatedAt` 作为 `expectedUpdatedAt`，返回后更新它。沿用 [edit-conflict.tsx](../apps/client/src/ui/edit-conflict.tsx) 的 `baseVersion` 记录，让恢复出来的草稿仍能检测冲突。
- **冲突（409 `EDIT_CONFLICT`）**：
  - 上次保存以来只有勾选时，先取最新的笔记，用 `setChecklistItem` 依次重放每个勾选。全部成功就把结果载入编辑器，再带最新的 `updatedAt` 保存，界面上不出现提示。有任何一个重放失败，按下一种情况处理。
  - 有文字改动时，暂停自动保存，在正文上方显示提示条：「{名字}在你写的时候也改了这篇。自动保存先停下，你的内容还在。」提示条上有两个按钮：
    - 「对照最新内容」：展开最新内容，写法沿用 `summarizeLatest`；展开后另有「改用最新内容」，选它就放弃自己的改动；
    - 「用我的版本保存」：带最新的 `updatedAt` 覆盖保存。
- **其他失败**：
  - 网络错误时显示「已存在这台设备，联网后自动保存」，在应用回到前台和每隔 30 秒时重试；
  - 404 时显示「这篇笔记已被删除」，并提供「另存为新笔记」；
  - 会话过期时沿用现有的处理。

完成标准：Jest 用假计时器和模拟的 API 客户端覆盖下列情况：

- 停笔 1 秒保存一次；
- 连续打字只保存最后一版；
- 打开不保存；
- 勾选立刻保存；
- 只有勾选的冲突自动合并，有文字改动的冲突出现提示条；
- 离线后保留草稿、恢复后重试；
- 新建先 POST、之后 PUT；
- 标题和正文都空时不保存；
- 请求期间的新改动在返回后补发。

## 5. 客户端：笔记页

- **合并路由**：
  - `app/(protected)/households/[id]/notes/[noteId]/index.tsx` 改成文档页，`noteId` 为 `new` 时就是新建；
  - 删掉 `notes/new.tsx`，`/notes/new` 由 `[noteId]` 接住；
  - `[noteId]/edit.tsx` 改成重定向到文档页，旧链接仍能打开；
  - 更新 [app/(protected)/_layout.tsx](<../apps/client/app/(protected)/_layout.tsx>) 里的路由名单。
- **从总览新建**：顶部保留 `HouseholdTargetField`（保存到），一个家庭时保留 `HouseholdContextNote`。换家庭后草稿跟着走，和现在一样。
- **窗口**：
  - 继续用 `NoteWindow` 和 `RouteWindow`。宽屏在笔记清单旁占完整的阅读区，从今日页或其他页面打开时在右侧详情栏，和现在一样。
  - 关闭和切换前先保存，不弹「修改还没有保存」：草稿本来就留在本机，切换时如果保存失败，草稿也会留着。
  - `NoteWindow` 不再传 `draftPrefix` 给 `RouteWindow` 的切换询问，改由第 4 步在离开前保存。
- **手机工具栏**：放进 `RouteWindow` 的 `footer`。`AppDialog` 把 `footer` 放在 `KeyboardArea` 里，所以 Android 上也会留在软键盘之上；试验里工具栏被键盘挡住，就是因为没这样放。键盘收起后工具栏也跟着隐藏。
- **页头**：宽屏用 `headerNote`，写「{作者}写 · {谁} {时间}改过」，后面是保存状态；手机把保存状态放在标题栏右侧。名字来自 `getHousehold`，取法和任务清单一样。不在家庭里的人显示「已离开的成员」。保存状态只用文字和小图标，不用朱色。「…」菜单里是删除（沿用 `useContentDelete` 的权限）和复制为 Markdown。
- **清单页**：
  - 宽屏没有打开笔记时，不再在右侧显示最近一篇的只读预览加「编辑最近的笔记」，改为用 `router.replace` 打开最近一篇。没有笔记时显示现有的空状态。
  - 卡片菜单里的「编辑」去掉，因为点开就能编辑。「删除」保留。
- **删除不再用的代码**：`note-form.tsx`、`markdown-editor.tsx` 和 `note-editor-chrome.ts`；表格和链接步骤的输入框搬到新的工具栏和 `/` 菜单处理中。还要删掉它们的测试，以及笔记里不再用到的文案。
- **新文案**：中文和日文同时加，见 [客户端规程](agent/client.md#interface-text)。包括：标题和正文的占位文字、保存状态、工具栏和 `/` 菜单、冲突提示、已删除提示、方框的读屏名称、「已离开的成员」。

完成标准：`pnpm --recursive typecheck` 通过；客户端 Jest 全部通过。

## 6. 只读渲染与助手

- 助手对话里的 `MarkdownBody` 按第 2 步显示清单。
- 搜一下 `/notes/` 和 `/edit` 的拼接，确认没有别的地方还在打开笔记的 `/edit`。

完成标准：助手回复里的清单显示成方框，不是 `[ ]`。

## 7. 端到端与界面检查

- **真实 API**：更新 [e2e/notes/notes.spec.ts](../e2e/notes/notes.spec.ts) 的三个用例。
  - 新建：在文档里写标题和正文，等到「已保存」；
  - 成员修改别人的笔记，仍然不能删除；
  - 新增：勾选清单后，另一位成员刷新能看到；
  - 新增：两位成员一个改文字、一个勾选时，勾选自动合并，改文字的一方看到冲突提示。
  - 同样走真实 API 的 `edit-conflicts.spec.ts` 和 `drafts-persistence.spec.ts`，里面的笔记用例也要改成新的写法。
- **模拟数据的界面检查**：更新 `desktop-redesign.spec.ts`（笔记清单和阅读区各自滚动、宽屏打开最近一篇）。
- **Web 行为**：在 Chromium 里用 DevTools 协议模拟输入法，覆盖试验里检查过的行为。写法可以参照试验分支的 `scripts/prototype-note-editor-check.cjs`，但要写成正式的 Playwright 用例：组字期间不保存、回车接清单项、标题回车进正文、`/` 菜单、撤销。

完成标准：

- `pnpm --filter client test`、`pnpm --recursive typecheck`、API 集成测试、模拟界面测试和真实 API 端到端测试全部通过。数据库的安全要求见 [环境规程](agent/environment.md)。
- 在 390 和 1440 宽度下截图核对新建、编辑、勾选、冲突、离线这几种状态，选择方法见 [测试规程](agent/testing.md)。

## 8. 真机验收与文档

在 Android 真机上确认以下几点（有 iPhone 时 iOS 也确认）：

- 工具栏留在软键盘之上；
- 标题回车进入正文；
- 用 Gboard 拼音组字期间不保存，选词后保存一次；搜狗和微信输入法不丢字；
- 软键盘弹起时当前行可见；
- TalkBack 能读出并勾选清单；
- 离线时改动保留，联网后自动保存。

人工步骤请产品负责人配合。

然后更新文档：

- [design.md](design.md)：把上面的交互规则写进去。替换「笔记清单……阅读区栏头写更新时间，右侧是带文字的『编辑』按钮」这一条。「清单里的条目先以阅读状态打开」这一条注明笔记例外。弹窗类型表里笔记那一格，改成「文档在阅读区或详情栏直接编辑」。
- [roadmap.md](roadmap.md)：在「待验收」里加上第 8 步没能在设备上确认的项。

完成标准：真机各项有记录；`design.md` 与实现一致。

## 9. 收尾

- 分支用 `feat/notes-one-page`，从 `main` 切出，按 [git 规程](agent/git.md) 开 PR。
- 删除本文件。ADR 0002 保留。
- 第二步的方案另写。
