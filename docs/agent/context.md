# Module Ownership

Read this index only when the owning module or entry point of a request is unclear. It maps responsibilities to files; the files themselves stay authoritative for behavior.

## Entry points

- Client bootstrap and route tree: `apps/client/app/_layout.tsx`, `apps/client/app/index.tsx`, `apps/client/app/(protected)/_layout.tsx`.
- API bootstrap, global prefix `/api/v1`, CORS, validation pipe, and the error envelope: `apps/api/src/main.ts`. Module wiring and the global throttler: `apps/api/src/app.module.ts`.
- Generated contract: `packages/api-client/openapi.json` and `packages/api-client/src/generated/`, produced by `apps/api/src/openapi/generate-openapi.ts`.

## Client

| Responsibility | Files |
| --- | --- |
| Session tokens, refresh, login/logout | `src/features/auth/`, `src/api/api-client.ts`, `src/api/refresh-coordinator.ts` |
| Current household, switching, access-changed state | `src/features/households/household-context.tsx`, `household-api.ts` |
| Household settings, invitations, member governance | `src/features/households/household-settings.tsx`, `invitation-flow.tsx`, `member-governance.tsx` |
| Calendar month view and event forms | `src/features/events/` |
| Tasks, filters, status transitions | `src/features/tasks/` |
| Recurrence pickers, summaries, series scope | `src/features/recurrence/` |
| Lunar dates in calendars, the per-device 显示农历 choice, lunar repeat anchors | `src/features/lunar/`, `src/platform/preferences/`; conversion in `packages/lunar/` |
| Holidays in Japan and era years in calendars, and the per-device choice to show them | `src/features/wareki/`, `src/platform/preferences/`; rules in `packages/wareki/` |
| 家人生日 list and the add-birthday form | `src/features/birthdays/` |
| 设置: this device's language and calendar display | `app/(protected)/settings.tsx`; the language itself in `src/i18n/` |
| Notes and labels | `src/features/notes/`, `src/features/labels/` |
| Assistant conversations, model settings, action previews | `src/features/assistant/`; routes under `app/(protected)/households/[id]/assistant/` |
| Shared UI, theme tokens, dialogs | `src/ui/` — see [../design.md](../design.md) |
| Native/Web differences | `src/platform/` — one file per platform suffix (`.native.ts`, `.web.ts`) behind a shared type |

## API

| Responsibility | Files |
| --- | --- |
| Registration, login, refresh rotation, token guard | `src/modules/auth/` |
| Current user and profile | `src/modules/users/` |
| Households, invitations, roles, ownership | `src/modules/households/`; pure governance decisions in `household-policy.ts` |
| Events, tasks, notes, labels | `src/modules/events/`, `tasks/`, `notes/`, `labels/` |
| Assistant providers, encrypted credentials, tool registry, confirmation loop | `src/modules/assistant/`; boundaries and extension points in [api.md](api.md#assistant) |
| Personal reminder settings and upcoming plan | `src/modules/reminders/`; contracts in [api.md](api.md#personal-reminders), device reconciliation in [client.md](client.md#local-reminders) |
| Recurrence rules, materialization, scheduling | `src/modules/recurrence/`; lunar anchors and birthday marks in `series-marks.ts` |
| Prisma client lifecycle | `src/infrastructure/prisma/` |

## Tests

- API unit: `src/**/*.test.ts` and `test/**/*.unit.test.ts`.
- API integration: `test/**/*.int.test.ts`, one directory per module, plus `test/security/asvs-v5-l1.test.ts`.
- Client: `apps/client/src/**/__tests__/*-test.ts(x)`.
- Browser: `e2e/`, one directory per feature area, with shared login in `e2e/support/auth.ts`.

## Reference documents

- [README.md](../../README.md) — project overview, feature summary, stack, and documentation index.
- [development.md](../development.md) — local setup, device debugging, assistant configuration, and development constraints.
- [deployment.md](../deployment.md) — production server, deployment, TLS certificates, reverse proxy, backups, and mobile builds.
- [design.md](../design.md) — the current design language and its acceptance checklist.
- [security/asvs-v5.0.0-l1.md](../security/asvs-v5.0.0-l1.md) — OWASP ASVS L1 control-to-test mapping.
- [roadmap.md](../roadmap.md) — outstanding product work, device/model validation, and non-goals. Read it when a request reaches one of those areas.
