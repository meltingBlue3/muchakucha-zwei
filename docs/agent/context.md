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
| Notes and labels | `src/features/notes/`, `src/features/labels/` |
| Shared UI, theme tokens, dialogs | `src/ui/` — see [../design.md](../design.md) |
| Native/Web differences | `src/platform/` — one file per platform suffix (`.native.ts`, `.web.ts`) behind a shared type |

## API

| Responsibility | Files |
| --- | --- |
| Registration, login, refresh rotation, password reset, token guard | `src/modules/auth/` |
| Current user and profile | `src/modules/users/` |
| Households, invitations, roles, ownership | `src/modules/households/`; pure governance decisions in `household-policy.ts` |
| Events, tasks, notes, labels | `src/modules/events/`, `tasks/`, `notes/`, `labels/` |
| Recurrence rules, materialization, scheduling | `src/modules/recurrence/` |
| Prisma client lifecycle | `src/infrastructure/prisma/` |
| Outbound mail, with console and disabled adapters | `src/infrastructure/mail/` |

## Tests

- API unit: `src/**/*.test.ts` and `test/**/*.unit.test.ts`.
- API integration: `test/**/*.int.test.ts`, one directory per module, plus `test/security/asvs-v5-l1.test.ts`.
- Client: `apps/client/src/**/__tests__/*-test.tsx`.
- Browser: `e2e/`, one directory per feature area, with shared login in `e2e/support/auth.ts`.

## Reference documents

- [README.md](../../README.md) — stack, local setup, commands, feature inventory, known gaps, deployment.
- [design.md](../design.md) — the current design language and its acceptance checklist.
- [security/asvs-v5.0.0-l1.md](../security/asvs-v5.0.0-l1.md) — OWASP ASVS L1 control-to-test mapping.
- [roadmap.md](../roadmap.md) — product intent that is not built yet, the non-goals, and the acceptance targets. Read it when a request reaches one of those areas; it is not a description of current behavior.
- [apple-inspired-design-research.md](../apple-inspired-design-research.md) — the primary sources behind `design.md`. Read it when a design rule needs its rationale, not for values, which live in `theme.ts`.
