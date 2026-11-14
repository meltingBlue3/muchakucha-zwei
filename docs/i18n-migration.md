# 日文界面：剩余工作

所有页面都已有中日两种文案。这份清单列出迁移之外没做完的任务。做完一项就从这里删掉一项；全部做完后删除本文件，并去掉 [路线图](roadmap.md#待办) 和 [客户端规程](agent/client.md#interface-text) 里指向它的链接。

## 新增或改动文案时

- 规则在 [客户端规程的 Interface text 一节](agent/client.md#interface-text)。样板是 [profile.tsx](../apps/client/app/(protected)/profile.tsx)、[profile-form.tsx](../apps/client/src/features/profile/profile-form.tsx) 和 [household-navigation.tsx](../apps/client/src/ui/household-navigation.tsx)。
- 文案目录是 [zh.ts](../apps/client/src/i18n/locales/zh.ts) 和 [ja.ts](../apps/client/src/i18n/locales/ja.ts)，两份在同一次改动里一起加。
- 注释之外不留中文字面量，无障碍名称也走目录；模块顶层带文字的常量改成键；校验的报错只记是哪一项，显示时再取文案。
- 现有测试断言的中文保持不动。测试环境的系统语言是英文，界面会回落到中文。给日文补一条断言即可，不必把每条用例复制一遍。
- 固定宽度的标签列按两三个汉字设计。日文较长的词会折行，优先换更短的说法。

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

## 不用翻译的文字

- `apps/api` 里家庭、任务、日程、重复规则的中文错误提示：客户端从不显示 API 的 `message`，各功能自己把错误码对应到文案。
- 已经存进数据库的标题。添加生日时生成的标题（「妈妈的农历生日」「お母さんの旧暦の誕生日」）按添加者当时的界面语言写一次，之后和其他标题一样由家人自己改；已有的中文标题保持原样。

## 迁移之外的任务

1. **选择行的无障碍名称用中文逗号。** [compose-rows.tsx](../apps/client/src/ui/compose-rows.tsx) 的 `SummaryRow` 把名称和当前值用「，」连起来，日文界面里读屏听到的是「誕生日の日付，日付を選択」。改它会牵动各表单的测试断言。
1. **麦克风权限说明。** `apps/client/app.json` 里 `expo-audio` 的 `microphonePermission` 是中文，由系统弹窗显示，需要按语言配置。需要新安装包。
1. **助手不知道日本的祝日和年号。** 日历已经显示它们，API 的助手工具还只引用 `packages/lunar`。要不要让助手回答「下一个祝日是哪天」之类的问题，没有定。助手工具返回给模型的农历日期、节气和节日名也仍是中文写法，日文对话里由模型自己转述。

## 待决定，定下来之前不要动

- **日文文案的用词。** 现有日文由 Claude 起草，待读日文的家人确认，尤其是「家庭」译作「家族」、「昵称」译作「表示名」。

## 只能由人验证

真机上的项目列在 [路线图的待验收](roadmap.md#待验收)「界面语言」一条里。加入 `expo-localization` 之后需要新安装包，旧的开发包加载新代码很可能在启动时报错。
