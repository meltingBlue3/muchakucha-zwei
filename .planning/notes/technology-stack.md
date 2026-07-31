---
title: Muchakucha Zwei 技术栈决策
date: 2026-07-31
context: 在 muchakucha-zwei 中从零重构旧版家庭日历与任务管理项目
---

# Muchakucha Zwei 技术栈决策

## 重构目标

- 使用现代、易维护的技术栈重建项目。
- 以手机 App 为主要产品形态，Web 作为辅助入口。
- Android、iOS 和 Web 尽可能共享业务代码与视觉系统。
- 前后端统一使用 TypeScript。
- 不迁移旧 MySQL 数据，旧项目仅作为功能与交互参考。
- 采用模块化单体，避免在第一版引入微服务复杂度。

## 总体架构

```text
Expo Client
(Android / iOS / Web)
        |
        | REST + OpenAPI
        v
NestJS API
        |
        v
Prisma ORM
        |
        v
PostgreSQL
```

仓库使用 pnpm workspace 管理：

```text
muchakucha-zwei/
├── apps/
│   ├── client/              # Expo 通用客户端
│   └── api/                 # NestJS 模块化单体 API
├── packages/
│   ├── api-client/          # 从 OpenAPI 生成的类型化客户端
│   └── shared/              # 与运行环境无关的常量和工具
└── .planning/
```

## 客户端

### 核心选择

- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query：服务端状态、缓存和请求生命周期
- React Hook Form + Zod：表单状态和客户端输入校验

采用单个 Expo 通用客户端覆盖 Android、iOS 和 Web，暂不创建独立 Next.js 应用。路由、领域逻辑、API 调用和大部分 UI 在三端共享。

平台差异只在确有必要时使用 `.native.tsx`、`.ios.tsx`、`.android.tsx` 或 `.web.tsx` 文件处理。日历属于可能需要平台专用表现的功能：手机侧优先日程和周视图，Web 可提供信息密度更高的月视图。

### 视觉系统

三端采用统一的品牌视觉，而非分别模仿 Material Design 与 iOS 系统风格。

- 使用 `@shopify/restyle` 建立类型化设计令牌。
- 基础界面基于 React Native 原生组件构建。
- 自有组件层提供 Button、Card、Input、Modal、Badge 等稳定接口。
- 颜色、字体、间距、圆角、阴影和响应式断点集中定义。
- 动画按需使用 Reanimated，不把动画库作为普通布局工具。

建议结构：

```text
apps/client/src/ui/
├── theme/
│   ├── colors.ts
│   ├── spacing.ts
│   ├── typography.ts
│   ├── breakpoints.ts
│   └── theme.ts
├── primitives/
└── components/
```

### iOS 准备

- 从项目开始即配置稳定且唯一的 iOS Bundle Identifier 和 Android Package Name。
- 使用 Expo Development Build 承载正式开发所需的原生库。
- Windows 可完成 Web、Android 和共享 TypeScript 代码开发。
- iOS 云构建使用 EAS Build；iOS Simulator 和完整 Xcode 调试仍需要 macOS。
- 发布前必须在实体 iPhone 上覆盖认证、通知、深链接、时区和后台恢复测试。
- 正式通过 App Store/TestFlight 分发时办理 Apple Developer Program。

## 后端

### 核心选择

- Node.js 当前受支持的 LTS 版本
- TypeScript 严格模式
- NestJS
- Fastify adapter
- REST API
- OpenAPI

NestJS API 按业务模块组织：

```text
apps/api/src/modules/
├── auth/
├── users/
├── households/
├── events/
├── tasks/
├── notes/
└── labels/
```

采用 `/api/v1` 作为第一版 API 边界。OpenAPI 是客户端与服务端之间的契约，并用于生成 TypeScript API Client。Prisma 数据库类型不得直接暴露给客户端。

选择 REST/OpenAPI 而非 tRPC 或紧耦合 RPC，主要原因是移动端商店版本不能强制同步升级；服务端必须能够在一段时间内兼容旧客户端。

## 数据库

- PostgreSQL
- Prisma ORM 稳定版
- Prisma Migrate 管理可审查的 SQL 迁移
- 本地开发使用 Docker Compose

数据库从零设计，不复刻旧 MySQL 中依赖应用层维持一致性的做法：

- 使用真实外键、唯一约束和检查约束。
- 关键多步操作使用事务。
- 时间字段使用 PostgreSQL `timestamptz`，服务端按 UTC 处理。
- 对外暴露的主要实体使用 UUID。
- 多对多关联表使用组合主键或组合唯一约束。
- 删除策略按实体明确选择限制删除、受控级联或软删除。

## 认证

第一版只提供邮箱和密码认证：

- 邮箱作为登录标识。
- 昵称独立保存、允许重复并可修改。
- 不在第一版引入全局唯一用户名。
- 使用短期 Access Token 和可轮换 Refresh Token。
- Refresh Token 仅以哈希形式保存在数据库中，并记录设备、过期时间和撤销状态。
- Android/iOS 将 Refresh Token 存入系统安全存储。
- Web 使用 `HttpOnly`、`Secure`、`SameSite` Cookie，不使用 localStorage 保存 Refresh Token。
- 数据模型为未来 Apple、Google 等第三方身份提供扩展位置，但第一版不实现第三方登录。

任何人都可以注册并创建家庭组，也可以通过邀请加入其他家庭组。一个用户可以属于多个家庭组。

## 工程质量

- 单元和集成测试使用 Vitest。
- API 端到端测试覆盖认证、权限和事务边界。
- 客户端关键路径使用适合 Expo/React Native 的组件或端到端测试方案。
- Web 辅助入口使用 Playwright 覆盖关键流程。
- GitHub Actions 执行类型检查、Lint、测试和构建验证。
- 依赖版本按 Expo SDK 兼容矩阵安装，避免手工混装不兼容的 React Native 原生包。

## 暂不采用

- 独立原生 Kotlin Android UI：会继续造成客户端技术栈分裂。
- Capacitor：既然移动端优先，React Native/Expo 更符合产品方向。
- Flutter：会引入 Dart，无法实现前后端 TypeScript 统一。
- 独立 Next.js Web：第一版 Web 只是辅助入口，维护第二套 UI 收益不足。
- 微服务：当前领域规模不需要额外部署和分布式一致性成本。
- tRPC/Hono RPC：移动客户端版本长期共存时，强类型直连会提高兼容性耦合。
- NativeWind v5：讨论时仍为预发布状态。
- Tamagui：能力完整，但当前项目不需要其编译器和较重的抽象层。
- Prisma Next：讨论时仍为 Early Access；项目使用稳定版 Prisma ORM。

## 待后续决定

- PostgreSQL 和 API 的生产托管平台。
- 邮件发送服务及邮箱验证、密码重置策略。
- 家庭邀请的链接、验证码和过期策略。
- 推送通知提供方与通知偏好模型。
- 离线读写范围以及同步冲突策略。
- 日历重复规则、提醒与系统日历集成边界。

