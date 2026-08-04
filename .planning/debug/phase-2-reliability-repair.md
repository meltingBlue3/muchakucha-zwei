---
status: awaiting_human_verify
trigger: "$gsd-debug"
created: 2026-08-04T00:56:41.3806371+08:00
updated: 2026-08-04T02:50:00+08:00
tdd_mode: false
commit_docs: true
---

# Phase 2 Reliability Repair

## Scope

1. 恢复全仓 typecheck 和 OpenAPI 一致性。
2. 修复 migration 与 PostgreSQL 18 Compose。
3. 修复 integration fixtures，使所有测试真正执行。
4. 修复 Native 恢复、邀请会话和 accessChanged 状态机。
5. 修复 actor 权限竞态。
6. 运行完整 integration、Playwright 和 Android 验收。
7. 最后重建 Phase 2 VERIFICATION，而不是修饰现有 SUMMARY。

## Expected Behavior

- 全仓严格 TypeScript 检查通过，生成的 API client 与当前 OpenAPI 合约一致。
- 从空数据库执行的 Prisma migrations 在 PostgreSQL 18 上成功，Compose 使用 PostgreSQL 18 支持的数据目录布局。
- integration fixtures 建立真实有效的认证会话与合法数据，测试确实执行并通过，而不是被 quick suite 绕过。
- Native 重启后能恢复 current household；邀请链接复用应用全局会话并支持 Native pending invite；accessChanged 与 household switch 不会卡死或循环。
- actor 的成员身份和权限在同一事务/并发边界内重新验证，避免授权检查与写入之间的竞态。
- 完整 integration、Playwright 和 Android 验收有可追踪结果。
- 基于最终代码和真实测试结果新建 Phase 2 `VERIFICATION.md`，不修改 SUMMARY 来掩盖差异。

## Actual Behavior / Symptoms

- `pnpm --if-present --recursive typecheck` 失败：生成客户端缺少 `RegisterDto` / `RegistrationAcceptedDto` 导出，client 与 API tests 另有多处严格类型错误。
- `pnpm openapi:check` 失败并报告生成产物与当前 API 合约漂移。
- 已提交的 `0002_household_core` 使用 `(owner_membership_id, id) -> memberships(id, household_id)` 复合外键，但提交版本没有对应唯一约束；工作区已有一个未提交的唯一索引修复，需要审慎整合。
- PostgreSQL 18 Compose 仍挂载 `/var/lib/postgresql/data`；容器日志表明 PG18 要求挂载 `/var/lib/postgresql`，现有服务因此拒绝启动。
- `pnpm --filter api test:integration` 真实执行后失败：governance 37/37 失败（fixture JWT 未对应有效 AuthSession，创建 household 返回 401）；invitation fixture 缺少 email、过期数据违反检查约束、错误 envelope 断言不匹配；ASVS 参考数量漂移。
- `pnpm --if-present --recursive test:quick` 虽退出 0，但只覆盖 API 4 项与 client 149 项，并有 2 项跳过，不能证明 Phase 2 可靠。
- Native current-household adapter 定义了 `readStore` 却从未用于初始化，进程重启后同步读取恒为 null。
- invite route 自建独立 session store，调用不存在的 subscribe/错误字段，并依赖 Web storage；没有 Native pending invitation 恢复，也未在接受后刷新/切换 household context。
- household switch 在刷新后找不到目标时可能永远停在 resolving；accessChanged 未正确清理/筛选 household，choose-other 路由可能循环；lost household name 被记录但没有消费。
- owner leave 成功后只跳转，没有进入 accessChanged；deep link household 与全局 current household 可能不一致。
- 多个 household/invitation 写操作在事务外读取 actor membership/role，actor 可能在授权检查后被降级或移除；部分所谓“锁行”仅为普通 `findUnique`。
- 邀请邮件以 fire-and-forget 发送，API 可在投递失败时报告成功。
- Phase 2 没有可信的 `VERIFICATION.md`，ROADMAP/continue-here/SUMMARY 与实际状态互相矛盾。

## Reproduction Commands

```powershell
pnpm --if-present --recursive typecheck
pnpm openapi:check
pnpm --filter api exec prisma validate
pnpm --filter api test:integration
pnpm --if-present --recursive test:quick
docker compose logs postgres
```

## Worktree Safety

调查开始前工作区已有未提交改动，均视为用户或正在进行中的工作。不得批量还原、覆盖或清理；修复必须在现状上审慎整合：

```text
M .planning/phases/02-household-member-collaboration/.continue-here.md
M apps/api/prisma/migrations/0002_household_core/migration.sql
M apps/api/src/app.module.ts
M apps/api/src/infrastructure/prisma/prisma.service.ts
M apps/api/src/main.ts
M apps/api/src/modules/auth/auth.module.ts
M apps/api/src/modules/households/households.module.ts
M apps/api/src/modules/users/users.module.ts
M apps/client/app/(protected)/_layout.tsx
M apps/client/app/(protected)/households/[id]/ownership/leave.tsx
M apps/client/app/(protected)/households/[id]/ownership/transfer.tsx
?? apps/client/metro.config.js
```

## Current Focus

hypothesis_final_gates: "With all 54 Playwright tests green in one run, remaining automatable regression gates (full strict typecheck, client Jest, API integration, Prisma validation/migration status) should remain green; any failure now would identify cross-gate interference rather than a known E2E root."
test_final_gates: "Run full workspace typecheck, full client Jest, Prisma validate/migrate status, and full API integration on the isolated PostgreSQL 18 database."
expecting_final_gates: "All commands pass with the previously observed totals (client 153 passed/2 skipped, API 167 passed) and no pending/broken migrations."
next_action_final_gates: "Execute aggregate non-Playwright gates, then assess OpenAPI dirty-tree check semantics and prepare Android human verification checkpoint."

reasoning_checkpoint_accessibility:
  hypothesis: "The accessibility suite's protected handoff/create failures are fixture failures: the tests navigate directly without establishing a browser session, so SessionBootstrap correctly redirects to login. The scoped real-data test also attempts to insert a second invalid OWNER membership after createHousehold already creates the owner."
  confirming_evidence:
    - "Every handoff/new accessibility test directly calls page.goto on a protected route and has no browser login or refresh mock."
    - "The earlier full run snapshots for these tests showed the login form rather than the intended household UI."
    - "createHousehold already returns ownerMembershipId and the API stores owner membership role as ADMIN plus owner pointer; accessibility then calls addMembershipViaDb with OWNER, which is neither necessary nor valid."
  falsification_test: "Authenticate a shared verified no-household account through the real Web login before each protected accessibility check, remove the duplicate owner insert, and rerun the entire accessibility file; failures should then be actual axe/layout assertions rather than login redirects or DB constraints."
  fix_rationale: "Restoring the protected-route precondition lets the suite audit the intended UI without weakening route guards, while removing the impossible duplicate owner seed aligns the scoped fixture with the real domain model."
  blind_spots: "Once routes are reachable, axe may expose genuine component violations requiring separate hypotheses; custom browser contexts need their own login because they do not share the default page's cookies."
next_action_accessibility: "Add a reusable real-browser login fixture to protected accessibility cases, remove the duplicate OWNER insert, then run the complete accessibility spec."

reasoning_checkpoint_invite_reload:
  hypothesis: "A direct/full-page /invite navigation loses authenticated state because RootLayout deliberately skips SessionBootstrap restoration for public invitation routes, while InviteRoute only reads the in-memory store and never restores a booting Web session from its HttpOnly refresh cookie."
  confirming_evidence:
    - "The same-SPA login round trip reaches authenticated matching and successfully consumes the invitation."
    - "After logging in as the stranger, a full page.goto('/invite/TOKEN') renders the unauthenticated public preview even though authenticated navigation completed and the refresh cookie exists."
    - "RootLayout sets restorationRequired=false for /invite, and InviteRoute's session effect handles authenticated/subscribe states but has no restore call for initial kind=booting."
  falsification_test: "After adding non-routing invitation-local restoration, a fresh authenticated page.goto('/invite/TOKEN') must show the mismatch state; an unauthenticated invite must still show the public preview."
  fix_rationale: "Opportunistically restoring only the session state inside the public invite route preserves unauthenticated access and prevents the global bootstrap from redirecting, while recovering authenticated direct-link behavior from the server-owned cookie."
  blind_spots: "The focused E2E covers Web refresh-cookie restoration; Native process-restart invitation restoration remains part of the existing pending-invitation unit coverage and later device checkpoint."
next_action_invite_reload: "Implement invitation-local booting-session restoration, run typecheck/unit tests, and rerun invitation accept E2E."

hypothesis_update: "The rerun reduced failures from six to four. Three are the same hidden inactive Modal duplicate selected by getByText(...).first(); the snapshots prove the intended members page is visible. The invite test reaches the documented accepted success state and fails only because it omits the documented 'enter household' action."
test_update: "Unmount HouseholdSwitcher while closed, then make the invitation E2E perform its documented enter-household action; rerun the four specs."
expecting_update: "No hidden duplicate household text remains, and invitation acceptance navigates only after the explicit enter action, matching the component/unit contract."
next_action_update: "Apply the minimal modal lifecycle and E2E contract fixes, run typecheck/unit tests, then rerun the four specs."

hypothesis: "The six remaining non-accessibility E2E failures are caused by a nested interactive HouseholdCard intercepting member-navigation clicks, post-login navigation racing session bootstrap, invite login losing its intended route, and one stale-role test asserting conflict instead of the API's idempotent ROLE_UNCHANGED response."
test: "Run client typecheck and targeted unit tests, then rerun exactly the six previously failing Playwright specs."
expecting: "Typecheck/unit tests remain green; collaboration/rename/roster navigation reaches member settings; context/invite authentication reaches the intended route; role-governance accepts ROLE_UNCHANGED as the truthful stale-input result."
next_action: "Run pnpm --filter client typecheck and targeted session/invitation tests before the six-spec Playwright rerun."

reasoning_checkpoint:
  hypothesis: "Playwright 的 32 项失败由三类可区分的测试契约漂移扇出：mailbox 查询仍固定 18025、过期邀请 fixture 未同步 created_at 检查约束、家庭 Web fixtures 沿用旧登录标签/未将 API 登录会话带入浏览器。"
  confirming_evidence:
    - "4 项邮件场景明确连接 127.0.0.1:18025，而实际隔离 mailbox 在 18027。"
    - "invitation-lifecycle 的 SQL 未提供 created_at，过期 expires_at 直接违反 `Invitation_expiry_after_creation_check`。"
    - "治理场景页面快照显示登录表单真实 aria-label 为 `邮箱`，测试仍等待 `邮箱地址`；另一些场景只做 Node API 登录后直接访问受保护 Web 路由，浏览器没有该 cookie。"
  falsification_test: "修复三个 fixture 契约后分组重跑：邮件/生命周期不再环境或约束失败，单一治理 Web 场景可真实登录并到达设置页；若仍失败则读取其独立页面快照形成下一假设。"
  fix_rationale: "让测试消费配置端口、建立约束合法数据并通过浏览器真实登录，恢复测试前置条件而不弱化产品路由保护或数据库约束。"
  blind_spots: "部分 accessibility 用例把受保护 household 页面当公开页，需决定是为每项建立认证 fixture，还是只在真正公开的邀请页做匿名检查。"

next_action: "运行除 accessibility 外的全部 household Playwright specs，利用已修复深链/登录/mailbox/请求 data 契约收集剩余独立失败。"

## Timeline

- 2026-08-04: Aggregate API integration first rerun produced 6 auth failures because the command incorrectly carried Playwright-only WEB_ORIGIN/EMAIL_LINK_ORIGIN=18081 into auth integration fixtures that intentionally assert their isolated 8081 origin. This is a confounded runner invocation, not a product regression: 161/167 still passed and all failures match the overridden origin/link. Rerun with only DATABASE_URL.
- 2026-08-04: Complete accessibility Playwright spec is green: 18/18 in 36.8s across 320/390/768/1440 widths, roster/settings axe checks, keyboard order, 200% zoom, reduced motion, forced colors, live regions, and invitation terminal state. The fixture now authenticates protected routes through real Web login and no longer inserts an impossible duplicate OWNER membership.
- 2026-08-04: All previously failing non-accessibility household Playwright specs are now green in focused reruns. Invitation accept finished 1/1 after Web deep-link session restoration and explicit mismatch accept; collaboration/roster finished 2/2 and rename 1/1 after route-visible assertion repairs. Accessibility is the remaining Playwright group.
- 2026-08-04: Invitation-local restore is confirmed: the fresh authenticated deep link now renders the matching/accept state instead of the public preview. The remaining mismatch assertion runs before any accept request; because public preview intentionally does not reveal recipient identity, the server can disclose mismatch only after the authenticated user explicitly attempts acceptance. The E2E must press Accept before asserting the generic mismatch boundary.
- 2026-08-04: Landmark-scoped roster assertions made collaboration and roster fully green (2/4 passed). Rename now fails only because the settings page intentionally renders the same destination note for rename and invitation forms; assert one visible occurrence. Invitation mismatch reaches a public preview because its second login is not awaited before invite navigation; await authenticated navigation as done by the other repaired specs.
- 2026-08-04: The four-spec rerun disproved inactive HouseholdSwitcher as the duplicate source: Expo Router retains prior route screens hidden in the DOM. Accessible snapshots show the destination page is correct, so assertions must be scoped to the currently exposed main landmark. Invitation acceptance now reaches the household; its later account-mismatch section incorrectly navigates to public login while still authenticated and must perform the real logout/switch-account flow first.
- 2026-08-04: After regenerating from the corrected template, client typecheck passed and targeted SessionBootstrap/invitation tests passed (11 passed, 2 intentionally skipped). The six failing non-accessibility Playwright specs are now the active falsification test.
- 2026-08-04: Client typecheck falsified the assumption that the generated list-households model already included OWNER: the DTO was updated, but the hand-authored OpenAPI client template still emitted ADMIN|MEMBER. Updated the generator template; regeneration and verification are next.

- 2026-08-04: 全仓 typecheck 可重复失败于生成 client：缺失 RegisterDto/RegistrationAcceptedDto 导入并存在未使用 InvitationListItemDto。
- 2026-08-04: 已确认生成模板 clientSource 自身漏导入 RegisterDto/RegistrationAcceptedDto 且错误导入未直接使用的 InvitationListItemDto；重新生成不会自行修复。
- 2026-08-04: 修复并重新生成后 api-client typecheck 通过；全仓 gate 前进到 API integration 测试类型错误，集中于 MemberFixture 缺 email、未检查数组元素与废弃变量。
- 2026-08-04: API typecheck 已通过；client typecheck 直接确认 native store 未 hydrate、invite 使用独立 session store、accessChanged 名称未消费、refresh 返回值契约冲突等状态机根因。
- 2026-08-04: 已统一会话 store、加入 Native/Web pending invite 存储、为 Native current household 增加 hydrate、修复 accessChanged/retry/ownership flow；全仓 typecheck 通过。
- 2026-08-04: Compose 挂载已改为 /var/lib/postgresql；独立新 volume 的 PostgreSQL 18.4 健康启动，prisma validate 与 0001-0003 migrate deploy 全部通过。
- 2026-08-04: 完整 integration 真实执行并失败 54 项；37 项 governance 同源于 fixture 使用过时 ACCESS_TOKEN_SECRET，其他主要为旧 error envelope 断言、expired fixture 违反约束及 ASVS 重复行。
- 2026-08-04: 修复 fixture/envelope/ASVS 后失败降至 11；进一步为四类治理写操作加入 household+actor/target 行锁和事务内权限重验，移除 invitation 并发接受的事务外幂等旁路；目标 68 测试现为 67 通过，仅剩 ASVS assertion 名称重复。
- 2026-08-04: 治理测试中的 stale-owner assertion 已消歧：文档引用的 `stale owner pointer rollback on concurrent transfer` 仅出现一次，另一个 owner-leave 场景使用独立名称。
- 2026-08-04: 隔离 PostgreSQL 18 空库上的完整 API integration 全绿：12 个测试文件、165 项测试全部通过（29.92 秒），剩余失败数为 0；actor 治理事务内重验与 stale-owner/并发邀请覆盖均包含在该结果中。
- 2026-08-04: 邮件路径直接证据：邀请创建与重发均在 DB commit 后使用 `void` 丢弃 MailPort Promise；在未运行 Mailpit 时 integration 仍成功，确认接口不会观察 SMTP 失败。
- 2026-08-04: 新增的确定性 SMTP reject 回归测试按预期为 RED：创建邀请返回 201、重发返回 200，而两者均应为非成功 500；29 项中仅这 2 项失败，直接确认 fire-and-forget 根因。
- 2026-08-04: 两处邮件调用改为事务提交后 `await`；同一邀请 integration 文件现 29/29 全绿，SMTP reject 时创建与重发均不再返回成功。
- 2026-08-04: 新客户端回归验证 native current-household hydrate 与 session subscribe 已通过；pending invitation 在 SecureStore set 失败时直接 reject（1 项真实缺陷），household-context 测试另因 RTL v14 的异步 render 未 await 而失败（测试夹具问题）。
- 2026-08-04: Native pending invitation 的 set/clear 现与其他存储 adapter 一样优雅降级；hydrate、pending token 跨实例恢复、session subscribe、switch-target 消失进入 accessChanged 的目标回归共 23/23 通过。
- 2026-08-04: 完整客户端 Jest 17/17 suites 通过（153 passed, 2 skipped），全仓严格 typecheck（api、api-client、client）全部通过。
- 2026-08-04: 包含两个 SMTP reject 回归的完整 API integration 再次全绿：12/12 文件、167/167 测试通过（29.87 秒）。
- 2026-08-04: 首次 Playwright 未进入测试即因 11025 端口占用退出；占用者是用户安装的持久 Mailpit（PID 50944，HTTP 18026），3000 也有既存 API。未终止这些进程，改用完整隔离端口重试。
- 2026-08-04: 第二次 Playwright 仍在启动阶段退出：`API_ORIGIN=...:3100` 未改变 Nest 监听，服务仍尝试 3000；需同时显式传 `PORT=3100`，这是环境配置问题而非产品测试失败。
- 2026-08-04: 设置 `PORT=3100` 后 Playwright 越过全部 webServer 启动并持续执行，但外层 300 秒预算耗尽且输出被子进程缓冲，没有测试汇总；该次结果为 inconclusive，需以更长预算重跑。
- 2026-08-04: 12 分钟预算得到完整结果：54 项中 22 通过、32 失败。直接失败证据聚为 mailbox 18025 配置漂移、expired invitation fixture 约束失败、旧登录 locator/浏览器未认证导致 protected route 重定向；不是 32 个独立产品缺陷。
- 2026-08-04: 修复端口/过期 fixture 后 verify-email 4/4 全绿；治理登录 locator 进一步需对 `密码` 使用 exact。目标复跑显示真实共享产品根因：Web 全页访问 `/households/...` 时 SessionBootstrap 将合法深链判为不安全并强制改到 `/household-handoff`，因此登录成功后仍看不到设置页。
- 2026-08-04: 深链 allowlist 与 invite public bootstrap 修复通过 10 项 SessionBootstrap 单测和 client typecheck；目标 E2E 已能稳定进入 settings，member-removal 全绿。继续发现 settings route 未传 `onRevokeNavigate`（按钮无动作）及 invitation-send 仍按真实 Mailpit `/api/v1/*` 解析仓库内简化 mailbox（协议不匹配）。
- 2026-08-04: settings revoke 导航已接通且 client typecheck 通过；目标 invitation specs 已进入更深业务断言，但仍各有 1 项测试断言/fixture 失败。依照时间边界停止重复完整 Playwright，当前不得标记 Web E2E 全绿。
- 2026-08-04: Android 自动化前置通过：Expo SDK 57 public config 正确解析，Android Hermes bundle 1511 modules 成功导出到工作区外临时目录。Java 与 adb 可用，但无 emulator、无连接设备、未配置 ANDROID_HOME/ANDROID_SDK_ROOT；真机交互仍是后续 human/device checkpoint，不能声称已验收。
- 2026-08-04: invitation lifecycle 与 invitation send 的目标 E2E 均已转绿；另修复 Playwright `request.fetch` 错用 Node `body`（应使用 `data`）造成的伪 400，member-removal 也已全绿。

- 2026-08-04: 独立审计发现 Phase 2 的 SUMMARY/GREEN 结论与实际门禁结果不一致。
- 2026-08-04: 用户启动 `$gsd-debug`，明确以上七项可靠性修复与最终重建 VERIFICATION 的范围。

## Resolution

root_cause: "Phase 2 reliability was undermined by multiple confirmed boundary defects: generated OpenAPI imports/template drift; invalid PG18 volume/migration assumptions; integration fixtures that bypassed real auth or violated constraints; client household/invitation/session state split across non-hydrated stores; authorization reads outside governance transactions; post-commit mail promises discarded; and Playwright fixtures asserting protected or environment-specific behavior without establishing their prerequisites."
fix: "Repaired generation and regenerated the client; validated clean PG18 migration execution; made integration fixtures exercise real sessions/data; unified and hydrated household/invitation session state; revalidated actor/target permissions under transactional locks; awaited mail delivery failures; repaired deep-link, invite, ownership/accessChanged and settings navigation; and made E2E fixtures use isolated ports, legal rows, real browser auth, and stable accessible locators."
verification: "Self-verified: workspace strict typecheck passed; Prisma validate and migrate status passed on PostgreSQL 18 with 3 migrations; client Jest 17/17 suites (153 passed, 2 skipped); API integration 12/12 files (167/167); accessibility Playwright 18/18; full Playwright 54/54 in 2.1m; Android Expo config and Hermes export (1511 modules) passed; OpenAPI generation was byte-for-byte idempotent. Awaiting the four real-device Android acceptance groups from 02-13-PLAN.md."
files_changed: ["API household/auth infrastructure and integration fixtures", "generated OpenAPI client", "client household/session/invitation routes and state", "Playwright household/auth fixtures", "compose.yaml and migration SQL", "Phase 2 security/debug evidence"]
