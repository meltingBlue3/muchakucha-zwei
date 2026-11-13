# 日文界面：剩余工作

多语言框架已经就位，这份清单列出还没迁移的页面和迁移之外没做完的任务。做完一项就从这里删掉一项；全部做完后删除本文件，并去掉 [路线图](roadmap.md#待办) 里指向它的链接。

行数指「注释之外还含中文的代码行」，2026-11-13 清点，是近似值，不等于文案条数。

## 开始之前

- 规则在 [客户端规程的 Interface text 一节](agent/client.md#interface-text)。样板是 [profile.tsx](../apps/client/app/(protected)/profile.tsx)、[profile-form.tsx](../apps/client/src/features/profile/profile-form.tsx) 和 [household-navigation.tsx](../apps/client/src/ui/household-navigation.tsx)。
- 文案目录是 [zh.ts](../apps/client/src/i18n/locales/zh.ts) 和 [ja.ts](../apps/client/src/i18n/locales/ja.ts)，两份在同一次改动里一起加。
- 迁移在 `feat/i18n-migration` 分支上做，这份清单也在这个分支上。每个批次一个提交，写法见 [git 规程](agent/git.md)。提交、推送、开 PR 之前先问人。
- 一个文件迁完的标准：注释之外不再有中文字面量，无障碍名称也走目录；模块顶层带文字的常量改成键；zod 的报错信息改成键，显示时再取文案。
- 现有测试断言的中文保持不动。测试环境的系统语言是英文，界面会回落到中文。每个批次给日文补一条断言即可，不必把每条用例复制一遍。
- 固定宽度的标签列按两三个汉字设计。日文较长的词会折行，迁到表单页时逐个看，优先换更短的说法。

## 检查

```sh
pnpm --recursive typecheck
pnpm --filter client test
```

改到共享组件或页面布局时，再跑模拟 API 的浏览器测试，见 [testing.md](agent/testing.md)。

导出静态包前必须隔离 Metro 缓存。这台机器上直接 `expo export` 得到的包嵌入过线上服务器地址，即使设置了 `EXPO_PUBLIC_API_ORIGIN` 也一样，因为 Metro 沿用了缓存里的旧值。把临时目录指到别处，再核对包里的地址，确认之后才运行测试：

```sh
TEMP=<空目录> TMP=<空目录> EXPO_PUBLIC_API_ORIGIN=http://127.0.0.1:3999 \
  pnpm --filter client exec expo export --platform web --output-dir <输出目录>
grep -c "47.117.148.16" <输出目录>/_expo/static/js/web/entry-*.js   # 必须是 0
```

## 还没迁移的页面

共享组件、登录注册、家庭与账户、任务、日历与今日、笔记、重复安排、标签、提醒、助手、搜索和「更多」已迁移。

| 批次 | 位置 | 文件 | 行 | 备注 |
| --- | --- | --- | --- | --- |
| 生日 | `src/features/birthdays`、`households/[id]/birthdays/new.tsx`、`src/features/lunar/lunar-calendar.ts` | 6 | 约 61 | 先等「待决定」里的前两项 |

`apps/api` 里家庭、任务、日程、重复规则的中文错误提示不用翻译：客户端从不显示 API 的 `message`，各功能自己把错误码对应到文案。

## 迁移之外的任务

1. **Android 闹铃模块。** `apps/client/modules/reminder-alarm` 的 5 个 Kotlin 文件里有 8 行中文，改成 Android 字符串资源并加日文。需要新安装包。
2. **麦克风权限说明。** `apps/client/app.json` 里 `expo-audio` 的 `microphonePermission` 是中文，由系统弹窗显示，需要按语言配置。需要新安装包。
3. **和历的计算包。** 新建 `packages/wareki`：年号表（明治到令和），以及按规则推算的日本祝日（固定日、快乐星期一、振替休日、国民の休日，春分和秋分按日本时间取日）。沿用 [packages/lunar](../packages/lunar/src/index.ts) 的约定：单个 TypeScript 文件，只用可擦除的语法，带测试。太阳黄经的算法可以参考 lunar 包里的 VSOP87 级数。这一项不依赖界面设计，可以先做；界面部分见下面。

## 待决定，定下来之前不要动

- **生日的默认标题。** [birthday-form.tsx](../apps/client/src/features/birthdays/birthday-form.tsx) 把「农历生日 / 公历生日」当标题存进数据库，之后一直是创建者的语言。倾向于不存这段文字、显示时按类型取名；已存的旧数据怎么处理没有定。
- **农历名称在日文界面怎么显示。** `packages/lunar` 里有 23 行中文：月日名、节气、节日。节气的日文汉字写法不同，例如惊蛰是「啓蟄」、处暑是「処暑」。要定是保留中文原样，还是给日文一套写法。这个包同时被 API 的助手使用。
- **和历与祝日的界面。** 月历格子里农历和祝日谁优先，祝日标成红日子时朱色怎么用（[design.md](design.md) 把朱色留给强调）。先出手机稿，定稿后再实现。
- **日文文案的用词。** 现有日文由 Claude 起草，待读日文的家人确认，尤其是「家庭」译作「家族」、「昵称」译作「表示名」。

## 只能由人验证

真机上的项目列在 [路线图的待验收](roadmap.md#待验收)「界面语言」一条里。加入 `expo-localization` 之后需要新安装包，旧的开发包加载新代码很可能在启动时报错。
