# Walking Skeleton — Muchakucha Zwei

**Phase:** 1
**Generated:** 2026-08-01

## Capability Proven End-to-End

> A user can submit the branded Expo registration form through the generated `/api/v1` client, create a real PostgreSQL account record, and reach the email-verification waiting state in Android or auxiliary Web.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Client framework | Expo SDK 57, React Native, TypeScript, Expo Router | One mobile-first client supports Android/iOS and the auxiliary Web entry without a second UI implementation. |
| API framework | NestJS 11 modular monolith with Fastify | Keeps authentication and later household domains explicit while retaining one deployable service. |
| API contract | REST under `/api/v1`, Nest OpenAPI DTOs, generated `packages/api-client` | Published mobile clients need versioned contracts; persistence types never cross the API boundary. |
| Data layer | PostgreSQL 18, Prisma 7 with `@prisma/adapter-pg`, committed Prisma Migrate history | Real constraints, UTC `timestamptz`, and transactions enforce account/session integrity. |
| Auth | Argon2id passwords, 15-minute access JWTs, per-device rotating opaque refresh-token families | Meets the locked short-access, hash-at-rest, revoke, and replay-detection contract. |
| Credential transport | Native SecureStore; Web scoped HttpOnly cookie; access token memory-only | Enforces SAFE-03 without exposing Web refresh material to JavaScript. |
| Email | `MailPort` with Nodemailer SMTP adapter, Mailpit locally, capture adapter in tests | Keeps provider choice outside the auth domain while making verification/reset locally testable. |
| UI system | Typed `@shopify/restyle` theme and owned React Native primitives | Establishes the approved warm, consistent, accessible visual language across all clients. |
| Local deployment | Docker Compose PostgreSQL 18 + Mailpit; pnpm scripts run API and Expo Web/Android | Gives Windows development a deterministic full-stack path; iOS uses EAS/real-device validation. |
| Directory layout | `apps/client`, `apps/api`, `packages/api-client`, `packages/config`, `packages/test-support` | Separates runtime and generated-contract boundaries inside one pnpm workspace. |

## Stack Touched in Phase 1

- [ ] Project scaffold: pinned pnpm workspace, strict TypeScript, lint/build/test scripts.
- [ ] Routing: Expo auth/link/protected route groups and Nest `/api/v1` routes.
- [ ] Database: a migrated PostgreSQL 18 schema with a real canonical-email read and account write.
- [ ] UI: registration interaction reaches the API through generated client code and renders the verification-pending result.
- [ ] Deployment: `docker compose up -d --wait` plus documented non-watch local full-stack and test commands.

## Out of Scope (Deferred to Later Slices)

- Household creation, invitation, membership, switching, and authorization are owned by Phase 2; Phase 1 exposes only the approved no-household handoff boundary.
- Calendar, tasks, notes, labels, Today data, realtime sync, offline business writes, third-party login, and device-session management are later phases or v2.
- Production SMTP vendor/domain, public origins, app-store domains, and iOS association verification remain deployment configuration; local behavior is proven with Mailpit.
- No legacy MySQL data or Vue/FastAPI/Kotlin implementation is migrated or reused.

## Subsequent Slice Plan

- Phase 2: users create, join, switch, and safely manage household membership.
- Phase 3: household members share timed and all-day calendar events.
- Phase 4: household members manage tasks and a Today view.
- Phase 5: household members share notes and organize work with labels.
- Phase 6: Android/iOS release readiness and the consistent auxiliary Web entry are verified.

