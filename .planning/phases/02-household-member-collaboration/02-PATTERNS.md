# Phase 2: 家庭组与成员协作 - Pattern Map

**Mapped:** 2026-08-02
**Inputs:** `02-CONTEXT.md`, `02-UI-SPEC.md`（本轮明确跳过 research）
**Files/families analyzed:** 29
**Primary analogs:** 5（另含原位扩展文件）

## Scope-derived File Manifest

上游没有给出完整实现文件清单；下表是根据 D-01..D-12、UI screen inventory 和现有仓库边界推导出的规划目标。路由文件保持薄壳，业务实现集中在 `src/features/households`；生成客户端文件只能由 OpenAPI 脚本更新。

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/prisma/schema.prisma` | model/config | CRUD | 同文件 `User`/token relations | exact extension |
| `apps/api/prisma/migrations/0002_household_core/migration.sql` | core household/membership migration | batch | `0001_auth_foundation/migration.sql` | exact |
| `apps/api/prisma/migrations/0003_household_invitations/migration.sql` | invitation lifecycle migration | batch | `0002_household_core/migration.sql` | exact vertical continuation |
| `apps/api/src/modules/households/households.module.ts` | module/config | request-response | `modules/auth/auth.module.ts` | role-match |
| `apps/api/src/modules/households/households.controller.ts` | controller | request-response | `modules/auth/auth.controller.ts` | exact |
| `apps/api/src/modules/households/households.service.ts` | service | CRUD/transactional | `modules/auth/auth.service.ts` | exact |
| `apps/api/src/modules/households/household-policy.ts` | utility/policy | transform | `modules/auth/password-policy.ts` | role-match |
| `apps/api/src/modules/households/dto/create-household.dto.ts` | DTO/model | request-response | `modules/auth/dto/register.dto.ts` | exact |
| `apps/api/src/modules/households/dto/update-household.dto.ts` | DTO/model | request-response | `modules/users/dto/update-me.dto.ts` | exact |
| `apps/api/src/modules/households/dto/invitation.dto.ts` | DTO/model | request-response | `modules/auth/dto/register.dto.ts` | role-match |
| `apps/api/src/modules/households/dto/membership.dto.ts` | DTO/model | request-response | `modules/auth/dto/register.dto.ts` | role-match |
| `apps/api/src/app.module.ts` | config | request-response | existing `UsersModule.register` registration | exact extension |
| `apps/api/src/infrastructure/mail/mail.port.ts` | provider/port | event-driven | existing verification/reset methods | exact extension |
| `apps/api/src/infrastructure/mail/smtp-mail.adapter.ts` | provider/adapter | event-driven | existing verification/reset sender | exact extension |
| `apps/api/src/infrastructure/mail/smtp-mail.adapter.test.ts` | test | event-driven | same file | exact extension |
| `apps/api/src/openapi/generate-openapi.ts` | config/generator | batch | existing auth/users assertions | exact extension |
| `packages/api-client/openapi.json` + `src/generated/{models,client,index}.ts` | generated model/client | request-response | existing generated auth/users contract | generated exact |
| `apps/api/test/households/{households,invitations,governance}.int.test.ts` | integration test | request-response/CRUD | `test/users/me.int.test.ts` | exact |
| `apps/client/src/ui/theme.ts` | config | transform | existing semantic token map | exact extension |
| `apps/client/src/ui/household-components.tsx` | component | event-driven/request-response | `ui/primitives.tsx` | role-match |
| `apps/client/src/features/households/household-context.tsx` | provider/store | event-driven | `features/auth/session-bootstrap.tsx` + `session-state.ts` | role-match |
| `apps/client/src/features/households/household-api.ts` | service/hook | request-response | `src/api/api-client.ts` | role-match |
| `apps/client/src/features/households/household-entry.tsx` | component/screen | request-response | `features/profile/profile-form.tsx` | role-match |
| `apps/client/src/features/households/household-settings.tsx` | component/screen | CRUD | `features/profile/profile-form.tsx` | role-match |
| `apps/client/src/features/households/invitation-flow.tsx` | component/screen | request-response | `features/auth/verification-flow.tsx` | role-match |
| `apps/client/src/features/households/member-governance.tsx` | component/screen | CRUD/transactional | `features/profile/profile-form.tsx` | partial |
| `apps/client/src/platform/household/current-household.{ts,native.ts,web.ts}` | provider/storage | file-I/O | `platform/session/session-transport.{ts,native.ts,web.ts}` | role-match |
| `apps/client/app/(protected)/household-handoff.tsx`, `households/index.tsx`, `households/new.tsx`, `households/[id]/index.tsx`, `households/[id]/settings.tsx` | route | request-response | existing `household-handoff.tsx` and `profile.tsx` | exact shell |
| `apps/client/app/invite/[token].tsx` and protected confirmation/governance route shells | route | request-response | `app/auth/verify-email.tsx` | role-match |
| client component tests + `e2e/households/collaboration.spec.ts` | test | request-response/event-driven | existing profile/session tests + auth Playwright specs | role-match |

## Pattern Assignments

### API module, controller and DTO files

**Apply to:** `households.module.ts`, `households.controller.ts`, all `dto/*.ts`, and `app.module.ts`.

**Primary analog:** `apps/api/src/modules/auth/auth.controller.ts`

**Controller imports, version-stable operation ID and response DTO** (`auth.controller.ts:60-70`):

```typescript
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ operationId: 'login' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Login input or transport is invalid.' })
```

For every protected household endpoint, reuse `AccessTokenGuard`; derive the actor from guard claims and never accept a user ID as authority. The existing protected pattern is concrete (`auth.controller.ts:130-155`):

```typescript
@Post('logout')
@HttpCode(204)
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
async logout(@Req() request: LogoutRequest): Promise<void> {
  if (request.auth === undefined) {
    throw new Error('AccessTokenGuard did not attach verified session claims.');
  }
  await this.authService.logout(request.auth.sub, request.auth.sid);
}
```

**DTO validation pattern** (`apps/api/src/modules/auth/dto/register.dto.ts:1-17`):

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Member', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
}
```

Use explicit response DTOs for household, membership and invitation states. Do not export Prisma models. Stable error bodies follow `{ code, message, details? }`; controllers document each status with Swagger decorators.

**Module registration pattern** (`apps/api/src/modules/auth/auth.module.ts:21-45`, `apps/api/src/app.module.ts:13-28`):

```typescript
@Module({})
export class AuthModule {
  static register(environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    return {
      module: AuthModule,
      providers: [AuthService, AccessTokenGuard],
      controllers: [AuthController],
      exports: [AccessTokenGuard],
    };
  }
}

// AppModule.register(...)
imports: [PrismaModule, /* ... */, UsersModule.register(environment)]
```

`HouseholdsModule.register(environment)` should be added beside `UsersModule`; use the exported `AccessTokenGuard` and mail port instead of constructing auth/mail infrastructure again.

---

### `households.service.ts` and governance transactions

**Primary analog:** `apps/api/src/modules/auth/auth.service.ts`

Invitation tokens use the existing opaque-token convention (`auth.service.ts:51-57`): generate random bytes, send only the raw token, store only its SHA-256 hash. Canonicalize invitation emails with `trim().normalize('NFC').toLowerCase()` as used at `auth.service.ts:110-112`.

**Serializable, claim-once transaction pattern** (`auth.service.ts:377-418`):

```typescript
const outcome = await this.prisma.$transaction(async (transaction) => {
  const now = new Date();
  const current = await transaction.passwordResetToken.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { user: true },
  });
  if (current === null || current.consumedAt !== null || current.expiresAt <= now) {
    return { kind: 'invalid' } as const;
  }

  const claimed = await transaction.passwordResetToken.updateMany({
    where: { id: current.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) return { kind: 'invalid' } as const;

  // all related writes happen on `transaction`
  return { kind: 'completed' } as const;
}, { isolationLevel: 'Serializable' });

if (outcome.kind === 'invalid') {
  throw new BadRequestException({
    code: 'INVALID_PASSWORD_RESET_TOKEN',
    message: 'The credential is invalid or expired.',
  });
}
```

Apply this directly to invitation acceptance, member removal, ownership transfer, and owner-leave handoff. Resolve the household and actor membership inside the transaction; conditional `updateMany`/`deleteMany` count checks prevent stale-role races. Return a discriminated outcome, then map it to stable HTTP errors outside the transaction. Do not optimistically send invite email before the database commit; after commit, call the mail port fire-and-forget as at `auth.service.ts:420-424`.

---

### Prisma schema and migration

**Analog:** current `apps/api/prisma/schema.prisma` and `0001_auth_foundation/migration.sql`.

**Schema naming, mapped columns, real relations and indexes** (`schema.prisma:12-24`, `26-38`):

```prisma
model User {
  id        String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  createdAt DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  sessions  AuthSession[]
}

model AuthSession {
  userId String @map("user_id") @db.Uuid
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, revokedAt], map: "AuthSession_user_id_revoked_at_idx")
}
```

Create `Household`, `Membership`, and `Invitation` with explicit role/status enums or constrained values, real FKs, `timestamptz(3)`, and named indexes. The migration must add SQL constraints Prisma cannot express, following `0001_auth_foundation/migration.sql:13-21` and `78-91`: nonblank 1–40-character household names; owner/membership integrity; token hash format; expiry after creation; mutually exclusive terminal invitation states; unique household membership; and at most one pending invitation per household + canonical email according to the resend/rotation rule.

---

### Client household forms and screens

**Primary analog:** `apps/client/src/features/profile/profile-form.tsx`

**Imports and typed dependency boundary** (`profile-form.tsx:1-25`):

```typescript
import type { ApiClient, CurrentUserDto } from '@muchakucha/api-client';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Banner, Button, Heading, Spinner, Stack, Text, TextField } from '../../ui/primitives';

export type ProfileApi = Pick<ApiClient, 'getMe' | 'updateMe'>;
```

Each feature should accept the smallest `Pick<ApiClient, ...>` surface so tests can inject fakes. Household-name Zod validation must trim and enforce 1–40 Unicode characters; invitation form has email only and no role field.

**Abortable loading, retained error state and mutation handling** (`profile-form.tsx:58-74`, `86-115`):

```typescript
useEffect(() => {
  const controller = new AbortController();
  void apiClient.getMe(accessToken, controller.signal)
    .then((user) => reset({ displayName: user.displayName }))
    .catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) setLoadError(GENERIC_ERROR);
    })
    .finally(() => setLoading(false));
  return () => controller.abort();
}, [apiClient, reset]);

const submit = handleSubmit(async (values) => {
  setSuccess(undefined);
  clearErrors();
  try {
    const result = await apiClient.updateMe(/* ... */);
    reset(/* authoritative result */);
    setSuccess('昵称已更新。');
  } catch (error) {
    setError('root.server', { message: GENERIC_ERROR });
  }
});
```

For governance mutations, do not update owner/member UI optimistically. Disable all competing actions while pending, then refetch the authoritative household state. Classify 401 as session failure, 403 as stale membership/permission (freeze actions and route to access-changed), and network/5xx as recoverable while retaining the verified household.

**Accessible feedback and stable button label** (`profile-form.tsx:125-167`):

```tsx
{errors.root?.server?.message ? <Banner title="暂时无法保存">...</Banner> : null}
{success ? (
  <Stack accessibilityLiveRegion="polite" accessibilityRole={'status' as never} gap={1}>
    <Text>{success}</Text>
  </Stack>
) : null}
<Button disabled={isSubmitting} label="保存昵称" loading={isSubmitting} onPress={() => void submit()} />
```

---

### Household context provider and route resolution

**Primary analog:** `apps/client/src/features/auth/session-bootstrap.tsx`

**Explicit state machine and controlled routing** (`session-bootstrap.tsx:8-25`, `49-72`):

```typescript
export const SAFE_INTENDED_ROUTES = ['/household-handoff', '/profile'] as const;
type ViewState = 'booting' | 'offline' | 'resolved';

const applyOutcome = useCallback(async (outcome: RestoreOutcome): Promise<void> => {
  if (outcome.kind === 'authenticated') {
    sessionStateStore.enterAuthenticated(outcome.session);
    onRoute(safeIntendedRoute ?? '/household-handoff');
    setViewState('resolved');
    return;
  }
  if (outcome.kind === 'offline') {
    sessionStateStore.enterOfflineWaiting();
    setViewState('offline');
    return;
  }
  // reauthentication remains distinct
}, [/* stable dependencies */]);
```

Create a separate household state machine such as `resolving | ready | noHousehold | offlineRetained | accessChanged`. Keep the branded bootstrap visible until membership list + device selection + membership validation resolve. Extend the intended-route whitelist for `/invite/[token]` without accepting arbitrary external URLs. Query keys must begin with household ID (for example `['household', id, 'members']`); on switch, withhold old content until the new membership and first query succeed.

Device-local persistence should copy the existing platform file split (`session-transport.ts`, `.native.ts`, `.web.ts`) but remain a non-secret preference store, separate from session transport. Persist `currentHouseholdId` plus `successfulAccessAtByHousehold`; update a timestamp only after membership validation and the first authoritative household query succeed, prune entries for households no longer joined, and order the switcher by descending successful-access time with household-name tie-breaks. This metadata survives restart on that device and never synchronizes across devices.

---

### Owned UI components and theme

**Analog:** `apps/client/src/ui/primitives.tsx` with tokens from `theme.ts`.

**Typed primitives and accessibility basics** (`primitives.tsx:25-103`):

```tsx
const Box = createBox<Theme>();
const RestyleText = createText<Theme>();

export const Stack = ({ children, gap = 4, style, ...props }: LayoutProps) => {
  const activeTheme = useTheme<Theme>();
  return <View {...props} style={[{ gap: activeTheme.spacing[gap] }, style]}>{children}</View>;
};

export const Text = ({ variant = 'body', ...props }: OwnedTextProps) => (
  <RestyleText allowFontScaling maxFontSizeMultiplier={2} variant={variant} {...props} />
);
```

Implement `AppShell`, `HouseholdHeader`, `HouseholdSwitcher`, `HouseholdContextNote`, `HouseholdCard`, `MemberRow`, `RoleBadge`, `InvitationRow`, `ConfirmationPage`, and `FinalConfirmation` in the owned UI layer. Reuse `Button`'s busy/disabled state (`primitives.tsx:131-169`), `Banner`'s assertive alert (`342-359`), and `StatusPanel`'s focus-on-heading pattern (`490-514`). Add semantic values first to `theme.ts`; specifically the UI contract requires `overlay.scrim`, household max width 960, switcher widths/heights, and 280px settings navigation. Note that `theme.ts:57,73-79` currently uses 500-weight caption; Phase 2 components must use the approved 400/600 typography and should correct/extend the token rather than hardcode it locally.

---

### API integration tests

**Primary analog:** `apps/api/test/users/me.int.test.ts`

**Real booted Fastify app, real PostgreSQL reset and HTTP injection** (`me.int.test.ts:18-25`, `55-68`, `71-99`):

```typescript
async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

return app.getHttpAdapter().getInstance().inject({
  method,
  url: '/api/v1/users/me',
  headers: { authorization: `Bearer ${accessToken}` },
  ...(body === undefined ? {} : { payload: body }),
});

beforeEach(async () => {
  await resetDatabase();
  // create explicit fixtures
});
```

Tests must use at least two households and owner/admin/member actors. Assert cross-household IDs never authorize access, admin cannot govern owner, duplicate invitation responses do not reveal account existence, invite acceptance is single-use under concurrency, and failed owner transfer/leave leaves both ownership and membership unchanged. Query the database after transaction failures, as `me.int.test.ts:132-138` does for cross-actor isolation.

## Shared Patterns

### Authentication and household authorization

**Source:** `auth.controller.ts:130-155`; **apply to:** all non-preview household routes.

- `AccessTokenGuard` authenticates; household authorization is a second server-side lookup using `request.auth.sub` and the route household ID.
- Never accept actor role, current-household ID, or user ID from a DTO as proof of authority.
- Public invitation preview may resolve only the UI-contract-approved fields; mismatch/invalid responses must suppress household and inviter details.

### Error contract

**Source:** `auth.service.ts:59-65`, `414-418`; **apply to:** controller/service/client mappings.

```typescript
throw new BadRequestException({
  code: 'VALIDATION_FAILED',
  message: 'Request validation failed.',
  details: [{ field, codes: ['...'] }],
});
```

Use stable codes for not-member, insufficient-role, stale-membership, invalid/expired/used/revoked invite, email mismatch, last-owner/integrity failure, and transaction conflict. The client must distinguish 403 household changes from 401 reauthentication.

### OpenAPI generation

**Source:** `apps/api/src/openapi/generate-openapi.ts:255-308`; **apply to:** all household endpoints and `packages/api-client`.

Add explicit assertions for every household operation ID and DTO schema before the existing `Promise.all` writes. Run the generator; never hand-edit the four generated outputs.

### Mail boundary

**Source:** `apps/api/src/infrastructure/mail/mail.port.ts:1-25`, `auth.service.ts:420-424`; **apply to:** invitation creation/resend.

Extend `MailPort` with a typed household invitation message containing recipient, inviter display name, household name, invitation URL, and expiry. Persist/rotate first, then send after commit. Keep response copy identical regardless of whether the email maps to a registered account.

### Token-only and platform-safe UI

**Source:** `theme.ts:3-148`, `primitives.tsx:37-63`, `376-412`; **apply to:** every Phase 2 component.

- No raw colors, spacing, radii, typography or shadows in feature files.
- Maintain 48px touch targets, 200% font scaling, reduced-motion and forced-colors behavior.
- Import Lucide icons by exact subpath.
- Mobile bottom sheet and Web popover/dialog share content/state but have platform-specific presentation and focus restoration.

## No Direct Analog Found

| File/family | Role | Data Flow | Planner Guidance |
|---|---|---|---|
| `ui/household-components.tsx` switcher/popover/dialog portions | component | event-driven | No overlay, focus trap, bottom sheet or responsive popover exists. Implement with React Native primitives and UI-SPEC contracts; do not add a UI package without separate approval. |
| `features/households/household-context.tsx` | provider/store | event-driven | Session bootstrap is only a state-machine analog; membership validation, query-cache isolation and 403 invalidation are new. Use TanStack Query and household-prefixed keys. |
| ownership transfer / owner-leave transaction | service | transactional CRUD | Existing serializable token transaction supplies mechanics, but no role graph/owner invariant exists. Define and integration-test the invariant explicitly in SQL and service logic. |

## Metadata

**Analog search scope:** `apps/api/src`, `apps/api/test`, `apps/api/prisma`, `apps/client/app`, `apps/client/src`, `packages/api-client`, `e2e`
**Repository source files scanned:** 95
**Strong primary analogs:** `auth.controller.ts`, `auth.service.ts`, `profile-form.tsx`, `session-bootstrap.tsx`, `me.int.test.ts`
**Pattern extraction date:** 2026-08-02
