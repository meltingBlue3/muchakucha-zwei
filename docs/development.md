# 开发指南

路径与命令以仓库根目录为基准；含行内环境变量的示例使用 Bash 语法。模块入口按需查 [context.md](agent/context.md)，界面改动查 [设计规范](design.md)。

## 本地开发

### 1. 安装依赖

安装满足 [package.json](../package.json) 中 `engines` 的 Node.js，使用 `packageManager` 指定的 pnpm：

```bash
corepack enable
pnpm install --frozen-lockfile
```

### 2. 准备开发数据库

在本机 PostgreSQL 或自行管理的开发实例中创建独立开发库：

```sql
CREATE USER muchakucha_dev WITH PASSWORD 'muchakucha_dev_only';
CREATE DATABASE muchakucha_dev OWNER muchakucha_dev;
```

仓库的 [Compose](../compose.yaml) 提供可清空的测试库，测试服务配置见 [environment.md](agent/environment.md#test-services)。需要保留的数据使用独立开发库。

### 3. 配置环境

首次将 [apps/api/.env.example](../apps/api/.env.example) 复制为同目录的 `.env`，按实际实例填写 `DATABASE_URL`；已有文件只补缺少的配置。API 与 Prisma CLI 都读取它，也支持导出的环境变量。显式指定开发库，避免落入默认测试库。

客户端用 `EXPO_PUBLIC_API_ORIGIN` 指定 API 地址，默认 `http://localhost:3000`；其他变量及生成助手密钥的方法以模板为准。

### 4. 生成客户端并迁移

```bash
pnpm --filter api prisma:generate
pnpm --filter api exec prisma migrate deploy
```

拉取到新迁移后再次运行 `migrate deploy`。

### 5. 启动

分别启动所需服务：

```bash
# API：http://127.0.0.1:3000
pnpm --filter api dev

# Web：http://127.0.0.1:8081
pnpm --filter client exec expo start --web --port 8081

# 原生客户端开发服务器
pnpm --filter client start
```

API 的 `dev` 先编译再运行，改代码后需重启。`pnpm dev` 可并行启动 API 与 Expo；客户端的 `web` 脚本另用 18025 端口。OpenAPI 位于 API 的 `/api/v1/openapi.json`，没有 Swagger UI。

已有服务运行时，按 [environment.md](agent/environment.md#servers) 选择空闲端口，只停止自己启动的进程。

## 局域网联调

手机上的 `localhost` 指向手机自身，需让 API 监听局域网，并让客户端连接开发机地址：

```bash
HOST=0.0.0.0 PORT=3100 pnpm --filter api dev
EXPO_PUBLIC_API_ORIGIN=http://<开发机局域网 IP>:3100 pnpm --filter client exec expo start --lan
```

命令行环境变量优先于客户端的 `.env`。连接失败时检查电脑防火墙和对应端口。只有 Android 开发版（`APP_VARIANT=development`，见 [app.config.js](../apps/client/app.config.js)）允许明文 HTTP，预览版和正式版只走 HTTPS；iOS 未配置 ATS 例外，需使用 HTTPS，或改用 Android / Web 联调。

## AI 助手

首次启用时按 [环境模板](../apps/api/.env.example) 生成并填写 `ASSISTANT_ENCRYPTION_KEY`，再重启 API。它是独立于 JWT 密钥的 32 字节标准 Base64 主密钥，用于加密模型凭证；未配置时其他功能仍可使用。

主密钥只保存在服务端，与数据库备份配套保管。已有密钥不能直接替换，当前没有自动轮换流程；丢失后无法解密已有凭证。生产环境使用现有运维配置，见 [部署文档](deployment.md#环境变量)。

在助手的模型配置中添加协议、API 基础地址、模型 ID、密钥与使用范围，保存前运行「测试连接」，再选择配置开始对话。对话模型需支持工具调用；连接测试验证一次工具往返，不代表所有模型行为均已验证。

| 用途 | API 基础地址示例 |
| --- | --- |
| OpenAI 兼容对话 | `https://api.openai.com/v1` |
| Anthropic 对话 | `https://api.anthropic.com/v1` |
| 百炼 Qwen-ASR 转写 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

地址填写 API 目录，由应用追加请求路径。支持 API 服务器能直接访问的公网 HTTP 和 HTTPS 地址。地址不能带凭证、查询参数或片段。服务端拒绝私网地址，也不跟随重定向。使用 HTTP 时，API 密钥和请求内容以明文传输。

使用时注意：

- 共享配置授予模型调用权，费用由配置者承担；完整密钥不回传，对话彼此不可见。对话及所需家庭数据会发送到配置的服务地址，业务权限始终按实际使用者检查。
- 所有写入先预览再确认；中断后先检查实际结果，避免盲目重试。更换服务地址或协议后需新开对话，历史不会自动发往新地址。
- 语音输入使用独立的「语音转写」配置，默认使用百炼 Qwen-ASR。采用云端转写是为了避开部分国产 Android 缺少可用系统识别服务的问题，代价是没有逐字预览；单次最长 60 秒，文字追加到草稿后手动发送。Web 麦克风需要 HTTPS 或 localhost。
- 助手对重复安排的编辑、删除只作用于单次实例，系列操作使用重复安排界面。查询日程只覆盖已生成实例；重复安排的下一次日期和生日岁数按规则算出。农历日期、节日和节气由工具换算，不让模型自己推算。共享模型目前没有用量上限；真实模型兼容性需逐个验证，扩展约束见 [API 手册](agent/api.md#assistant)。

## 提醒与闹铃

提醒设置按个人保存，同一账户跨设备同步。iOS 通过 Expo Push 转交 APNs。启用直连 FCM 的 Google Play Android 由 API 直接投递，允许 Google Play 服务在应用进程结束时显示通知。Web 经浏览器的 Web Push 服务接收普通提醒。服务端到期时按最新内容计算，家人改期、取消或修改分配后，收件人无需打开 App。未启用推送的手机继续在本机排程，厂商通道后续适配。

- 任务提醒负责人，没有负责人时提醒创建者；日程提醒全体家庭成员。无截止日期、已完成的任务和已取消的日程均不提醒。
- 「默认」跟随个人设置；重复内容的单独提醒作用于整个重复安排。只改提醒不修改内容版本，也不弹出内容修改范围选择。
- 本机排程覆盖未来 7 天、最多 60 条。Android 的响铃闹铃继续使用本机排程，其他设备上的改动会在本机下次同步后生效。
- Web 需要 HTTPS 或 localhost。退出浏览器后能否收到提醒取决于浏览器和系统。iPhone 和 iPad 须在 Safari 添加到主屏幕，并从主屏幕打开后开启通知。
- 推送按每台设备最后登记的时区和语言发送，15 秒扫描一次，只处理最近两分钟到期的提醒。设备离线或平台投递失败时可能错过。通知包含标题、时间和打开事项所需的路径。
- 锁屏显示、后台弹出和厂商省电限制需在系统设置中确认，应用无法完整读取这些开关。普通通知、闹铃、重启与冷启动的待验收项见 [路线图](roadmap.md#待验收)。

### 启用 APNs 和 FCM

1. 在 EAS 项目配置 iOS App ID 的 Push Notifications capability 和 APNs 推送密钥。Firebase Android 应用的包名应与构建一致，正式版和预览版为 `app.muchakucha.zwei`，开发版为 `app.muchakucha.zwei.dev`。将匹配的 `google-services.json` 作为 EAS 文件变量 `GOOGLE_SERVICES_JSON` 提供。本地构建可用同名环境变量指向文件。已有本地 `android/` 的项目需先重新运行 Expo prebuild，使原生工程应用 Firebase 配置。[Expo 推送凭证配置](https://docs.expo.dev/push-notifications/push-notifications-setup/) · [EAS 文件变量](https://docs.expo.dev/eas/environment-variables/manage/#secrets-and-file-variables)
2. API 应用数据库迁移并设置 `REMINDER_PUSH_ENABLED=true`。Android 直连需要启用 Firebase Cloud Messaging API，并把 `REMINDER_FCM_CREDENTIALS_FILE` 指向仓库外的同一 Firebase 项目服务账号 JSON 文件。账号需要 Cloud Messaging 发送权限。API 需要访问 `oauth2.googleapis.com` 与 `fcm.googleapis.com`，设备上的 Google Play 服务需要连接 FCM。[FCM 服务端授权](https://firebase.google.com/docs/cloud-messaging/auth-server) · [通知委托显示](https://firebase.google.com/docs/cloud-messaging/android-message-priority#notification_delegation_with_google_play_services)
3. 在目标 EAS 构建环境设置 `EXPO_PUBLIC_REMINDER_PUSH_ENABLED=true`，Google Play 版同时设置 `EXPO_PUBLIC_REMINDER_FCM_ENABLED=true` 后构建新包。连接本地 Metro 的开发包也需要在运行 Metro 时设置相应变量。安装后登录并开启通知权限，App 会自动登记。
4. Expo 路径需要服务端和设备访问 `exp.host`。启用了 Expo 增强推送安全的服务端设置 `EXPO_PUSH_ACCESS_TOKEN`。使用旧版 Expo 路径的 Android 包需要在 EAS 保留 FCM v1 凭证。

### 启用 Web Push

1. 用 `pnpm --filter api exec web-push generate-vapid-keys` 生成一对 VAPID 密钥，并将私钥保存在仓库外。
2. API 应用数据库迁移，设置 `REMINDER_PUSH_ENABLED=true` 以及 `REMINDER_WEB_PUSH_PUBLIC_KEY`、`REMINDER_WEB_PUSH_PRIVATE_KEY` 和 `REMINDER_WEB_PUSH_SUBJECT`。主题填有效的 `mailto:` 或 `https:` 联系地址。开启服务端推送时，三项 Web Push 变量须一起配置，且公私钥必须匹配。
3. 导出 Web 时传入环境变量 `EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY`，值取 API 使用的公钥。用配置了公钥的静态产物登录并在「提醒」开启通知。

测试现场生成密钥。本地运行或构建时从命令行传入环境变量。跑 mocked Playwright 的 Web Push 用例时，导出和跑测试的命令都传入 `EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY`。

服务端规则见 [API 手册](agent/api.md#personal-reminders)，本机对账与平台约束见 [客户端手册](agent/client.md#local-reminders)。

## 检查与开发约定

- 按 [testing.md](agent/testing.md#pick-the-smallest-sufficient-check) 选择检查，命令统一见其 [Commands](agent/testing.md#commands)。集成测试和 E2E 会清空数据库，只能使用回环地址、库名含独立 `test` 片段的可丢弃数据库；连接与迁移步骤见 [environment.md](agent/environment.md#test-services)。
- 每个指向 `main` 的 PR 由 [CI](../.github/workflows/ci.yml) 运行类型检查、`pnpm test:quick`、`pnpm openapi:check` 与 API 集成测试；Playwright 尚未接入。
- API 契约通过 `pnpm openapi:generate` 生成，并用 `pnpm openapi:check` 检查；`packages/api-client` 仅存生成产物。
- `packages/lunar` 是客户端与 API 共用的农历模块，以 TypeScript 源码发布：Metro 和 Vitest 直接编译，API 运行时由 Node 24 的类型剥离加载，所以 API 构建不需要先构建它。它只能是单个文件、只用可擦除的语法（`erasableSyntaxOnly`），不能有相对导入。年份表按 GB/T 33661 的规则由朔日和中气算出，覆盖农历 1900–2100 年；`index.test.ts` 逐日对照 Node 自带的 ICU，并列出 ICU 因朔日或中气贴近午夜而算错的年份。名称有中文和日文两套写法，由调用方传入语言；节气的日期始终按中国时间取，与日本历书偶尔相差一天。
- `packages/wareki` 以同样的方式提供和历年号与日本的祝日，约束相同。祝日按《国民の祝日に関する法律》各个时期的规则推算，从 1948 年起；春分の日、秋分の日取太阳到达黄经 0°、180° 时的日本日期，黄经由 `packages/lunar` 计算。明治从 1873 年改用公历起算，更早的日期没有对应的和历年。未来年份的祝日是按现行规则算出的，法律修改后要跟着改表。
- 协作编辑提交原始 `expectedUpdatedAt`，重复实例另带 `expectedRuleUpdatedAt`。冲突时整次修改不写入，保留草稿及原始版本，查看最新内容后再整理保存；刷新或重试不能自动接受新版本。删除也在查询参数里带上确认时读到的版本（标签用名称和颜色），编辑标签则在请求体里带上读到的名称和颜色；过期则返回 409，客户端重新读取并请用户再确认。不带版本的删除和标签编辑照旧执行，给尚未更新的旧版 App 留着。草稿实现见 [client.md](agent/client.md#drafts)。
- 成员离开家庭保留共享内容，清理其任务负责人关系及后续重复分配；所有者需先交接所有权。所有者是最后一位成员时，离开即删除家庭及其全部内容和未处理的邀请。角色与权限入口见 [context.md](agent/context.md#api)。
- 日历按请求起止日期补齐重复实例，范围最多 366 天，不推进后台连续生成进度，也不补齐中间未查询的日期。
- 当前账户仅支持用户名，尚无密码找回或人工重置。原生行为需设备验收，Web 测试不能替代真机检查。
