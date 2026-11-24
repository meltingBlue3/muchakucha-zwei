# 笔记「找得到」：实施方案

笔记重设计的第二步。第一步「一页纸」已经上线，见 [ADR 0002](adr/0002-notes-editor.md) 和 [design.md 的笔记一节](design.md#笔记)。这一步解决「找东西只靠时间」：笔记可以置顶，可以贴家庭标签并按标签筛选，搜索也找正文，清单页每行写出清单进度和作者。

本文写给实施者，按步骤做，每步以「完成标准」收尾。全部做完后按第 8 步收尾，并删除本文件。

## 已定的决定

产品负责人 2026-11-25 定了这些：

- **置顶全家共用**：一篇笔记要么对全家置顶，要么不置顶，没有「我自己的置顶」。家庭成员谁都能置顶和取消，和「谁都能改任何笔记」一致。
- **置顶只在笔记页**：置顶的笔记排在笔记清单最上面一组。今日页不显示置顶笔记，常用信息入口以后再评估。
- **笔记用家庭标签**：复用任务和日程已有的标签和标签选择，不另建一套。谁都能给任何笔记加减标签；新建、改名和删除标签仍只限管理员。

下面几条是实施方为保持一致定的，需要推翻时先和产品负责人确认：

- **置顶和标签不算修改正文**：改置顶或标签不改 `updatedAt` 和 `updatedBy`，所以不会让正在写这篇的人遇到冲突提示，清单顺序也不跳。两个人同时改同一篇的标签，后保存的为准。
- **搜索在客户端做**：`listNotes` 已经返回每篇笔记的全文，所以搜索和筛选都在本地完成，不加新接口。一个家庭几十篇笔记的规模下没有问题；以后笔记多到要分页时，再把搜索移到服务端。
- **范围之外**：今日页的常用信息入口、按标签浏览的独立页面、总览里的笔记、搜索标签名，都不在这一步。

交互规则如下，第 7 步把它们写进 design.md：

- **清单分组**：有置顶时，第一组是「置顶」。宽屏其余照旧分「最近 7 天」「更早」；手机其余放在「其他」一组。没有置顶时与现在一样。每组内都按修改时间排列。
- **清单行**：标题一行，标签照任务行的样子写在标题旁（最多一枚）。第二行依次是：修改时间、清单进度（有清单时写成 `3/8`）、作者（不在家庭里的人写作「已离开的成员」），然后是正文开头。有清单的笔记不写正文开头，因为进度已经说明它是什么。行的「…」里加「置顶」或「取消置顶」，放在删除之前。行里不另画图钉，分组标题已经说明。
- **标签筛选**：清单上方一排标签，第一个是「全部」，单选，选中后只显示带这个标签的笔记。这一排只列出至少有一篇笔记在用的标签，没有笔记带标签时整排不出现。手机上横向滚动，宽屏上折行。筛选记在本机，和搜索词一样按家庭保存。
- **搜索**：搜索框占位文字改成「搜索标题和正文」。规则和别处的搜索框一样（全角半角、大小写、平片假名都算相同，多个词都要出现）。命中在正文里时，这一行的第二行换成命中处的一小段：前后各带一些字，截断处写「…」，命中的词用 `ink` 半粗体，其余用 `inkMuted`，不用朱色或底色。只在标题命中时，行和平常一样。搜索和标签筛选可以同时用。
- **笔记页头**：保存状态之后，「…」之前，加两个图标按钮：置顶（按下状态表示已置顶，读屏名称「置顶」「取消置顶」）和标签（读屏名称「标签」）。笔记的标签写成一行，放在标题上方：手机在作者那一行下面，宽屏在正文栏的最上面。点这一行也打开标签选择；没有标签时这一行不出现。标题是编辑器文档的第一行，原生的标签行插不进标题和正文之间，所以放在上方。标签选择宽屏是锚定弹层，手机是窗口步骤，用「完成」确认，与任务表单里的标签选择一样。
- **新笔记**：还没保存过的新笔记不显示置顶和标签按钮；第一次自动保存之后出现。
- **保存方式**：置顶和标签点了就保存，不经过正文的自动保存。保存失败时恢复原样，并在正文上方用现有的小字提示说明。
- **标签管理页**：用量里加上笔记，如「3 个日程、2 篇笔记」。删除标签的提示同样写出笔记数，并说明笔记本身会保留。

## 1. API：置顶和标签

- **迁移**：
  - `Note` 加可空的 `pinnedAt`（`pinned_at`，`Timestamptz(3)`）。只存时间，不记是谁置顶的。
  - 新表 `NoteLabel`（`note_labels`），结构照 `TaskLabel`：`noteId`、`labelId`，联合主键，两边都 `onDelete: Cascade`。`Label` 加 `noteLabels` 关系。
  - 迁移目录的时间戳接在现有最后一个之后。
- **DTO**（[create-note.dto.ts](../apps/api/src/modules/notes/dto/create-note.dto.ts)）：
  - `NoteResponseDto` 加 `pinnedAt: string | null` 和 `labels: LabelResponseDto[]`，标签的形状和排序与任务相同（`labelsByName`、`labelResponse`）。
  - `CreateNoteDto` 加可选的 `labelIds` 和 `pinned`，新建时一起写入。
  - `UpdateNoteDto` 不变：正文的保存不碰置顶和标签。
- **接口**（[notes.controller.ts](../apps/api/src/modules/notes/notes.controller.ts)）：
  - `PUT /households/:householdId/notes/:noteId/pin` 置顶，`DELETE` 同一路径取消。重复调用结果一样，都返回 `NoteResponseDto`。
  - `PUT /households/:householdId/notes/:noteId/labels`，请求体 `{ labelIds }`，整体替换，返回 `NoteResponseDto`。
  - 这三个接口都不需要 `expectedUpdatedAt`，家庭成员都能调用。笔记不存在或不属于这个家庭时返回 `NOTE_NOT_FOUND`。
- **服务**（[notes.service.ts](../apps/api/src/modules/notes/notes.service.ts)）：
  - 置顶和标签都不改 `updatedAt` 和 `updatedBy`。`updatedAt` 带有 Prisma 的 `@updatedAt`，任何 `note.update` 都会自动刷新它，所以写 `pinnedAt` 时要在 `data` 里显式写回原来的 `updatedAt`，并在这里留一句注释说明原因。标签只写 `note_labels`，不更新 `notes` 这一行。
  - 校验标签属于这个家庭，做法同 [edit-version.ts](../apps/api/src/modules/shared/edit-version.ts) 里的 `replaceLabels`。把 `replaceLabels` 扩展成也接受 `'note'`，不要另写一份。
  - `list`、`getById`、`create`、`update` 的返回都带上标签。
- **标签用量**（[labels.service.ts](../apps/api/src/modules/labels/labels.service.ts)）：`usage` 加 `notes`，查询里再并一段 `note_labels`。`LabelListItemDto` 的 `usage` 相应加字段。

完成标准：

- `pnpm openapi:generate` 之后，`pnpm openapi:check` 没有差异；
- [notes.int.test.ts](../apps/api/test/notes/notes.int.test.ts) 覆盖：
  - 普通成员能置顶、取消置顶别人写的笔记，也能给它换标签；
  - 置顶和换标签之后，`updatedAt` 和 `updatedBy` 不变，用原来的 `expectedUpdatedAt` 保存正文仍然成功；
  - 别的家庭的标签返回 `VALIDATION_FAILED`；
  - 新建时带 `labelIds` 和 `pinned` 能一起写入；
  - 删除标签后，笔记还在，只是不再带这个标签；
  - 非成员调用这三个接口得到 `HOUSEHOLD_NOT_FOUND`。
- 标签的集成测试覆盖用量里的笔记数。

## 2. 助手：读写置顶和标签

- `list_notes` 和 `get_note` 的结果带上 `pinned` 和标签名。
- `create_note` 加 `labelIds` 和 `pinned`；`update_note` 也加这两项，说明里写明 `labelIds` 是整体替换、空数组清空标签，并提示通过 `list_labels` 找到标签 id，和 `create_task` 的写法一致。`update_note` 只改置顶或标签时，仍然要求 `expectedUpdatedAt`，与其他更新工具一致。
- 执行时，正文的修改走 `update`，置顶和标签走第 1 步的新方法，放在同一个事务里，或者先改正文再改其他。
- 确认卡片（[action-preview.tsx](../apps/client/src/features/assistant/action-preview.tsx)）在笔记上显示标签和置顶两行，修改前后的写法和任务的标签一样。

完成标准：[assistant-tools.service.test.ts](../apps/api/src/modules/assistant/assistant-tools.service.test.ts) 覆盖带标签新建、改标签、置顶，以及别的家庭的标签被拒；客户端助手测试覆盖确认卡片里的这两行。

## 3. 客户端：工具函数

都是纯函数，放在 `features/notes` 和 `features/search`，Jest 覆盖。

- **清单进度** `checklistProgress(body)`：返回 `{ done, total }`，没有清单项时返回 `null`。用 [checklists.ts](../apps/client/src/features/notes/checklists.ts) 已有的解析，嵌套项和引用里的清单项也算。
- **命中位置**：[search-query.ts](../apps/client/src/features/search/search-query.ts) 的 `SearchQuery` 加 `locate(text)`，返回第一个命中的词在原文里的位置 `{ start, end }`，没有命中时返回 `null`。难点是 `fold` 会改变长度（NFKC 会展开或合并字符），匹配时还去掉了空格，所以要逐字折叠并记下每个折叠后字符对应的原文位置，再把命中范围映射回原文。现有的 `matches` 行为不变。
- **搜索**：用 `searchNotes(notes, query)` 取代 [note-search.ts](../apps/client/src/features/notes/note-search.ts) 里的 `searchNotesByTitle`。每篇返回笔记本身，以及正文命中时的片段 `{ before, match, after }`。正文先用 `markdownExcerpt` 转成纯文本再找。片段在命中处前面留约 12 个字，后面填到约 40 个字，截断处加「…」。文件顶部那段「正文不在范围内」的说明改掉。

完成标准：Jest 覆盖：

- 进度：没有清单、全没勾、部分勾、全勾、嵌套和引用里的清单；
- `locate`：全角半角、平片假名、去掉空格后的命中（`買い物 リスト` 找到 `買い物リスト`）、NFKC 改变长度的字符（如 `㍿`）；
- 片段：命中在开头、在结尾、在中间，以及只在标题命中时没有片段。

## 4. 客户端：笔记清单

- [note-list-screen.tsx](../apps/client/src/features/notes/note-list-screen.tsx) 按上面的规则分组、加标签筛选和新的搜索。分组、筛选和搜索的组合逻辑写成一个纯函数，放在 `features/notes`，用 Jest 测，界面只负责画。
- 标签那一排用已有的 `LabelChip`，它有选中状态；「全部」用同样外观的一枚。筛选记在 `useWorkspaceState`，键名照搜索词的写法：`view:${id}:notes:labelFilter`。选中的标签已经不在任何笔记上时，回到「全部」。
- 筛选或搜索没有结果时，沿用现在的空状态：说明找不到什么，按钮清掉搜索和筛选。
- [note-card.tsx](../apps/client/src/features/notes/note-card.tsx) 按清单行规则画第二行，作者名需要家人名单，用笔记页已经在用的同一个来源。行的读屏名称加上置顶、清单进度和标签，比如「周末采购，已置顶，清单 3/8，采购」。「…」里加「置顶」「取消置顶」，调用第 1 步的接口，成功后刷新清单。
- 宽屏进入笔记页时打开最近修改的那篇，规则不变，不因置顶改变。

完成标准：Jest 覆盖分组、筛选和搜索的组合；`pnpm --recursive typecheck` 通过；390 和 1440 两种宽度的截图里，置顶组、标签一排和搜索片段都看得清楚。

## 5. 客户端：笔记页

- [note-document.tsx](../apps/client/src/features/notes/note-document.tsx) 的页头按上面的规则加置顶和标签两个按钮，编辑器上方加标签那一行。这一行用原生组件画，和标签选择一起都在 DOM 编辑器之外，编辑器本身不用改。
- 标签选择复用 [label-picker.tsx](../apps/client/src/features/labels/label-picker.tsx)，弹出方式照任务表单。管理员在里面仍能「新建标签」，成员看不到这一项。
- 置顶和标签的保存不经过 [use-note-autosave.ts](../apps/client/src/features/notes/use-note-autosave.ts)。保存成功后用返回的笔记更新页面上的置顶和标签，并通知清单刷新（`content-changes`）；失败时恢复原样并显示小字提示。因为第 1 步不改 `updatedAt`，自动保存的冲突基准不受影响。
- 页头按钮的读屏名称和按下状态要准确；手机上点它们不弹键盘。

完成标准：

- 真实 API 的 e2e（`e2e/notes/notes.spec.ts`）覆盖：
  - 一位成员在页头置顶别人的笔记，另一位成员的清单里它出现在「置顶」组；
  - 正在写的时候另一位成员给这篇换了标签，写的人继续保存不出现冲突提示；
  - 加标签后用标签一排筛选，只剩这一篇；
  - 搜索正文里的词，行里显示命中的片段；
  - 新笔记在第一次保存前看不到置顶和标签按钮。
- 模拟界面的用例（`ux-regressions.spec.ts` 或 `desktop-redesign.spec.ts` 里笔记相关的部分）跟上新的页头和清单行。

## 6. 客户端：标签管理页

[labels/index.tsx](../apps/client/app/(protected)/households/[id]/labels/index.tsx) 的用量和删除提示加上笔记。新文案：用量「{count} 篇笔记」；删除提示改成笔记、日程和任务本身都会保留。中日两种文案都要加，日文用词照 [客户端规程](agent/client.md#interface-text)。旧服务端返回的 `usage` 没有 `notes` 时按 0 处理。

完成标准：真实 API 的 `e2e/labels` 覆盖一个只用在笔记上的标签，用量写着笔记数，删除后笔记还在。

## 7. 文档与验收

- [design.md](design.md) 的笔记一节补上清单分组、清单行、标签筛选、搜索片段、页头的两个按钮，以及「置顶和标签不算修改正文」。「笔记清单按『最近 7 天』『更早』分组」那一条一起改。
- [roadmap.md](roadmap.md)：待办里删掉「笔记「找得到」」；「待验收」里笔记那一条补上手机上要看的几件事：标签一排横向滚动、标签选择窗口、置顶按钮的读屏名称、搜索片段在大字体下的换行。

完成标准：文档和实现一致；本文件里的交互规则都已经写进 design.md。

## 8. 收尾

- 分支 `feat/notes-findable`，按 API、客户端、文档分成几个提交。
- 跑过：`pnpm --recursive typecheck`、客户端 Jest、API 单元和笔记、标签的集成测试、`pnpm openapi:check`、真实 API 的 `e2e/notes` 和 `e2e/labels`、模拟界面的全部用例。集成和 e2e 只用名字里带 `test` 的一次性本机数据库。
- 删除本文件。
- 部署时先上 API，再发客户端：新客户端会调用新接口，读新字段。
