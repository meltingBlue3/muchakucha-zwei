# Web 通知：实施方案

让普通提醒推送到浏览器，体验与手机推送一致：到点弹出通知，点击打开对应事项。本文写给实施者，按步骤做，每步以「完成标准」收尾。全部做完后按第 6 步收尾，并删除本文件。

## 已定的决定

方案、取舍和理由记在 [ADR 0001](adr/0001-web-push-reminders.md)，先读它。实施中保持这些决定不变；需要推翻其中一项时，先和产品负责人确认。

## 1. API：登记 Web 订阅

- **迁移**：`ReminderPushDevice` 加可空的 `p256dh`、`auth` 两列，`token` 放宽到 `VarChar(1024)`（Web 用订阅的 endpoint 作 `token`，Edge 的地址较长）。`provider` 列取值增加 `web`。
- **DTO**（[reminder-push.dto.ts](../apps/api/src/modules/reminders/dto/reminder-push.dto.ts)）：`PUSH_PROVIDERS` 加 `web`；新增嵌套的 `keys: { p256dh, auth }`，`provider` 为 `web` 时必填，两者都是 base64url，解码后分别为 65 和 16 字节。
- **endpoint 白名单**：只接受 `https:`、不带用户信息和端口，主机为以下之一：`fcm.googleapis.com`（Chrome）、`*.notify.windows.com`（Edge）、`web.push.apple.com`（Safari）、`updates.push.services.mozilla.com`（Firefox，顺带支持）。服务端会向这个地址发请求，白名单就是 SSRF 防线。白名单写成一个函数，登记时校验，发送前再用它校验一次。不合格时沿用现有的 `invalid_push_token` 错误码（字段 `token`）。
- **未配置时**：服务端没有 Web 推送配置却收到 `web` 登记时，与 FCM 未配置相同：删除该会话的登记并返回 `active: false`。

完成标准：`pnpm openapi:generate` 后契约包含 `web` 与 `keys`，`pnpm openapi:check` 无差异。

## 2. API：投递

- **复用现有投递**：Web 接入 [reminder-push.service.ts](../apps/api/src/modules/reminders/reminder-push.service.ts) 的到期计算、按会话登记和「每台设备每次提醒认领一次」，不另起一套。
- **加密与发送**：`web-push` 库（连同 `@types/web-push`）只用来调用 `generateRequestDetails`，生成请求头和密文；发送用 `fetch`，与 [expo-reminder-push.ts](../apps/api/src/modules/reminders/expo-reminder-push.ts)、[fcm-reminder-push.ts](../apps/api/src/modules/reminders/fcm-reminder-push.ts) 一样带 `redirect: 'error'` 和 5 秒超时。
- **新文件 `web-reminder-push.ts`**：从环境变量 `REMINDER_WEB_PUSH_PUBLIC_KEY`、`REMINDER_WEB_PUSH_PRIVATE_KEY`、`REMINDER_WEB_PUSH_SUBJECT`（`mailto:` 或 `https:` 地址，Apple 要求有效）构造。三项只设了一部分或格式不对时启动即失败，参照 `FcmReminderPush.fromFile`。在 [reminders.module.ts](../apps/api/src/modules/reminders/reminders.module.ts) 中仅当 `REMINDER_PUSH_ENABLED=true` 且三项齐全时创建，并在 `apps/api/.env.example` 补上三项的注释。
- **载荷**：`{ title, body, url }`，取自 `reminderPushMessage` 的 `title`、`body` 和 `data.url`。请求头设 `TTL` 为距 `expiresAt` 的剩余秒数（不大于 0 时直接返回 `failed`），`Urgency: high`，`contentEncoding: 'aes128gcm'`。
- **结果映射**：2xx 视为 `accepted`；404、410 视为 `invalid`（退役该设备）；429、5xx 视为 `retry`；其余视为 `failed`。403 一般说明 VAPID 密钥与订阅不匹配，按 `failed` 记日志。
- **服务里的分派**：`send()` 按 `device.provider` 选渠道，Web 渠道还需要设备行上的 `p256dh` 和 `auth`。

完成标准：在 [reminders.int.test.ts](../apps/api/test/reminders/reminders.int.test.ts) 的 `server reminder push` 中按现有的 `vi.stubGlobal('fetch', …)` 写法覆盖：

- Web 登记成功并返回 `active: true`；
- 白名单外的主机、`http:`、缺少 `keys` 都返回 400 和 `invalid_push_token`；
- 到期时向 endpoint 发出 POST，请求头带 `Content-Encoding: aes128gcm`、`TTL` 和 `Authorization: vapid t=…, k=…`；
- 410 响应退役该设备；
- 未配置 Web 推送时登记返回 `active: false`。

## 3. 客户端：平台适配层

平台差异只放在 `apps/client/src/platform/reminders/`，规则见 [客户端规程](agent/client.md#local-reminders)。

- **`reminder-notifications.web.ts`**：
  - `remindersSupported`：存在 `window`、`navigator.serviceWorker`、`PushManager`、`Notification`，且构建带公钥 `EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY`。没有公钥时，Web 按「不支持推送」处理。
  - `localAlarmsSupported`：`false`。
  - 权限映射：`default` 对应 `undetermined`，`granted` 对应 `granted`，`denied` 对应 `blocked`（浏览器不会再次询问）。
  - `requestNotificationPermission()`：在函数开头立即调用 `Notification.requestPermission()`，前面不要有任何 `await`，因为 Safari 只认用户点击直接触发的请求。授权后在同一调用里完成订阅。
  - 排程类函数保持空实现。
  - `cancelAllReminders()`：退订当前订阅（退出登录时调用）。
  - `onReminderOpened()`：监听 service worker 发来的 `{ type: 'reminder-open', url }`。
  - `takeLaunchReminderUrl()`：返回 `null`。新窗口直接打开事项地址，[session-bootstrap.tsx](../apps/client/src/features/auth/session-bootstrap.tsx) 已经接受家庭内的事项路径。
- **`reminder-push.web.ts`**：注册 `/sw.js`（作用域 `/`）。已有订阅且其 `applicationServerKey` 等于构建里的公钥时直接复用，否则先退订再重新订阅。这样换密钥后，下次同步会自动修复订阅。
- **共享类型**：`getReminderPushToken` 改为返回 `{ token, keys? } | null`，`.ts`、`.native.ts`、`.web.ts` 三处一致；[reminder-sync.ts](../apps/client/src/features/reminders/reminder-sync.ts) 把 `keys` 一并登记，`provider` 为 `web`。
- **权限被拦截时**：网页无法打开浏览器设置。`permission` 为 `blocked` 时，Web 显示指引文字（见第 5 步），不显示「去设置」按钮。

完成标准：Jest 覆盖以下情形，`pnpm --recursive typecheck` 通过：

- 首次订阅；
- 复用已有订阅；
- 公钥不同时重新订阅；
- 三种权限映射；
- `cancelAllReminders` 退订；
- `reminder-sync-test` 断言 Web 登记的请求体包含 `provider: 'web'` 和 `keys`。

## 4. Service worker 与 manifest

- **`apps/client/public/sw.js`**：手写的普通 JS，不经 Metro 打包。
  - `push` 事件：每次都调用 `showNotification(title, { body, icon, data: { url } })`。Safari 会撤销收到推送却不弹通知的订阅。
  - `notificationclick` 事件：关闭通知；只接受以 `/households/` 开头的 `url`。已有同源窗口时聚焦它并 `postMessage({ type: 'reminder-open', url })`，没有时用 `clients.openWindow(url)` 打开。
- **`apps/client/public/manifest.json`**：
  - `name`、`short_name`；
  - `start_url: '/'`、`display: 'standalone'`（iOS 主屏应用收推送的前提）；
  - 背景色和主题色取 [theme.ts](../apps/client/src/ui/theme.ts) 的纸色；
  - 192 与 512 两种图标由 `assets/images/icon.png`（1024²）缩出，另备 180 的 `apple-touch-icon`。
- **在 `index.html` 里引用 manifest 和 `apple-touch-icon`**：`app.json` 没有设置 `web.output`，按单页应用导出，模板是 `public/index.html`。以导出产物为准核对。
- **Caddy 不用改**：`try_files {path}` 会直接返回存在的文件；浏览器检查 service worker 更新时默认绕过 HTTP 缓存。

完成标准：

- 运行 `pnpm --filter client exec expo export --platform web` 后，`apps/client/dist/` 里有 `sw.js` 和 `manifest.json`，`dist/index.html` 含 `<link rel="manifest"`；
- 在本机托管的静态构建上，`navigator.serviceWorker.ready` 能解析。

## 5. 设置页与文案

[reminders.tsx](../apps/client/app/(protected)/reminders.tsx) 在 `remindersSupported` 为真时已经显示「这台设备」分组和开启按钮，Web 会自然沿用。需要改的是页脚说明和被拦截时的指引。文案规则见 [客户端规程](agent/client.md#interface-text)，中日两份在同一次改动里一起加。以下是建议稿：

| 情形 | 中文 | 日文 |
| --- | --- | --- |
| Web 支持推送（替换原 `webInfo` 的用途） | 提醒会推送到这个浏览器；浏览器完全退出时收不到。 | リマインダーはこのブラウザに届きます。ブラウザを完全に終了していると届きません。 |
| 浏览器不支持推送 | 这个浏览器不支持推送提醒，这里的设置在其他设备上生效。 | このブラウザはプッシュ通知に対応していません。ここでの設定はほかの端末で有効になります。 |
| iOS Safari 标签页（`navigator.standalone === false`） | 在 iPhone 或 iPad 上，用 Safari 的「添加到主屏幕」，再从主屏幕打开，才能收到提醒。 | iPhone・iPad では、Safari の「ホーム画面に追加」から開くとリマインダーを受け取れます。 |
| 权限被拦截 | 通知已被浏览器拦截，请在浏览器的网站设置里允许通知。 | 通知がブラウザでブロックされています。サイトの設定で通知を許可してください。 |

`navigator.standalone` 只有 iOS 和 iPadOS 的 Safari 才定义，可以用来区分「iOS 标签页」和「其他不支持的浏览器」。

完成标准：在 [e2e/reminders.spec.ts](../e2e/reminders.spec.ts) 里用 `addInitScript` 模拟 `Notification` 和 `PushManager`，表中四种情形各断言一次文案，并在 mocked API 配置下对静态构建通过。PR 附 390 和 1440 宽的截图。

## 6. 文档收尾

- [development.md 的提醒与闹铃](development.md#提醒与闹铃)：
  - 加 Web Push 渠道及其限制（浏览器完全退出收不到，iOS 需主屏应用）；
  - 启用步骤：用 `pnpm --filter api exec web-push generate-vapid-keys` 生成密钥对，配置 API 的三项环境变量，Web 构建带上公钥；
  - 删去「Web 仅管理设置」。
- [deployment.md](deployment.md)：Web 构建命令加 `EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY`；写明先部署 API（迁移和环境变量），再上传 Web。生产服务器的 `/etc/muchakucha/api.env` 由维护者本人修改。
- [api.md 的 Personal reminders](agent/api.md#personal-reminders)：登记可选 Expo、FCM 或 Web Push；404 和 410 退役订阅；endpoint 白名单。附上指向 ADR 0001 的链接。
- [client.md 的 Local reminders](agent/client.md#local-reminders)：Web 适配层、`public/sw.js` 的位置，以及权限请求必须由点击直接触发。附上指向 ADR 0001 的链接。
- [roadmap.md](roadmap.md)：删掉待办里的「Web 通知」，在待验收里加一条：在真实的 Chrome、Edge、Safari（macOS）和 iOS 主屏应用上，验证到点弹出，以及页面开着、关着两种情况下点击打开事项。
- 删除本文件，ADR 0001 保留。如果实施中改变了其中的决定，另写一篇 ADR，并把 0001 的状态改为 `superseded by ADR-NNNN`。

完成标准：`grep -rn "web-push.md" docs` 无结果，待验收里有 Web 通知一条。

## 约束与陷阱

- **真实推送只能人工验收**：Playwright 的浏览器收不到真实推送，自动化只覆盖订阅、登记和界面状态，真实送达留给待验收。
- **部署顺序**：旧 API 会以 400 拒绝 `provider: 'web'`，同步失败时客户端已有兜底，不需要额外处理；按先 API 后 Web 部署即可。
- **订阅和权限都绑定站点来源**：迁到正式域名后，用户要在新地址重新允许通知，同步会自动登记新订阅。迁移时一并删掉 `provider = 'web'` 的旧登记，免得旧地址的 service worker 继续弹通知、点进失效的页面。
- **不做**：Web 闹铃、浏览器未运行时的补发、本机定时通知（Notification Triggers 已被浏览器放弃）、通知上的操作按钮。

## 检查

命令见 [testing.md](agent/testing.md#commands)。本方案涉及：

- `pnpm --recursive typecheck`；
- `pnpm test:quick`；
- API 集成测试；
- `pnpm openapi:check`；
- Web 静态导出加 mocked Playwright 的 `e2e/reminders.spec.ts`。

按 [AGENTS.md](../AGENTS.md) 报告实际跑过的检查和没有验证到的部分。
