# Muchakucha Zwei（ムチャクチャ 2号）

Muchakucha Zwei 是一款移动优先的家庭协作应用，帮助家人共同管理日程、任务、笔记和标签。Android 与 iOS 为主要平台，Web 提供宽屏工作空间。

## 功能

- **共享日历**：全天与定时日程、标签筛选，以及每天、每周、每月和每年的重复安排。
- **任务协作**：任务状态、优先级、多负责人和重复任务，在「今日」集中查看待办与安排。
- **家庭笔记与标签**：共同记录信息，用标签组织日程和任务。
- **家庭管理**：用户名账户、家庭邀请、成员角色与所有权管理。
- **本机草稿**：按账户和家庭保存编辑内容，支持重启恢复与编辑冲突提示。
- **AI 助手**：接入自有模型，通过文字或语音整理家庭事务；查询沿用当前用户权限，写入前逐项确认。模型配置可在家庭内共享，对话保持私人。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 移动端与 Web | Expo、React Native、Expo Router |
| 界面 | Shopify Restyle、共享 UI 组件 |
| API | NestJS、Fastify |
| 数据库 | PostgreSQL、Prisma |
| API 契约 | OpenAPI、生成的 TypeScript 客户端 |
| 测试 | Vitest、Jest、Playwright |
| 工程 | TypeScript、pnpm workspace |

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `apps/client/` | 移动端与 Web 客户端 |
| `apps/api/` | API 服务与数据库模型 |
| `packages/api-client/` | 生成的 API 契约与客户端 |
| `e2e/` | Web 端到端测试 |
| `docs/` | 开发、部署、设计与产品文档 |
| `scripts/` | 契约检查与工程辅助脚本 |

## 文档

- [开发指南](docs/development.md)：本地环境、联调、助手配置与检查入口。
- [部署文档](docs/deployment.md)：生产服务器、证书、反向代理、备份与移动端分发。
- [设计规范](docs/design.md)：界面语言、组件选择与视觉验收。
- [产品路线图](docs/roadmap.md)：产品意图、尚未实现的能力与验收目标。
- [AGENTS.md](AGENTS.md)：编码代理入口，按任务读取对应操作手册。
