# Project Research Summary

**Project:** Muchakucha Zwei  
**Domain:** Mobile-first family calendar and task collaboration  
**Researched:** 2026-07-31  
**Confidence:** HIGH

## Executive Summary

Muchakucha Zwei should be built as a mobile-first collaboration product, not as a desktop CRUD system wrapped for phones. The recommended implementation is one Expo SDK 57 universal client backed by a NestJS modular monolith, a versioned REST/OpenAPI contract, Prisma and PostgreSQL. Android, iOS and Web share navigation, business behavior and a brand design system; only interaction patterns with genuine platform differences should split.

The product's first validation loop is: create an account, create or join a household, then coordinate events and assigned tasks with a trustworthy view of shared state. Notes and labels complete the useful household workspace, but realtime delivery, recurrence, system-calendar sync and full offline writes should not delay this loop.

The main risks are authorization leakage between households, calendar time semantics, unsafe cross-platform token storage, non-atomic ownership changes and API contract drift. These are architectural requirements for the earliest phases rather than cleanup work.

## Key Findings

### Recommended Stack

- Node.js 24 LTS and a pnpm workspace provide one supported TypeScript toolchain.
- Expo SDK 57 provides React Native 0.86, React 19.2.3 and Web support from one client.
- NestJS with Fastify supplies explicit domain boundaries and OpenAPI generation.
- Stable Prisma 7.x plus PostgreSQL 18 supplies type-safe data access, migrations, constraints and transactions.
- Restyle plus owned components implements a consistent design language without locking the project to platform-specific visual kits.

Details: [STACK.md](./STACK.md)

### Expected Features

**Must have:**

- Complete email/password account lifecycle.
- Household creation, invitations, switching and role management.
- Shared non-recurring calendar events.
- Shared tasks with one responsible assignee.
- Shared notes, labels and filters.
- Mobile-first Today/calendar/task experiences with auxiliary Web access.

**Add after validation:**

- Push reminders, activity/comments, recurring events and stronger offline behavior.

**Defer:**

- Third-party login, system-calendar sync, widgets, attachments and full offline conflict resolution.

Details: [FEATURES.md](./FEATURES.md)

### Architecture Approach

Use a modular monolith with domain modules for auth, users, households, events, tasks, notes and labels. Every household use case must authorize membership and constrain the persistence query by household. The Expo client consumes only a generated OpenAPI client; Prisma types remain private to the API. External email, push and calendar services are adapters so vendors can be chosen later.

Details: [ARCHITECTURE.md](./ARCHITECTURE.md)

### Critical Pitfalls

1. **Cross-household data leakage** — enforce tenancy in application services and persistence queries, then test a denial matrix.
2. **Incorrect calendar time modeling** — distinguish dates, instants and time-zone-dependent intent before implementing event UI.
3. **Unsafe token persistence** — use native SecureStore and Web HttpOnly cookies behind a platform adapter.
4. **Broken ownership invariants** — use constraints and transactions for role/member changes.
5. **Mobile/server contract drift** — generate the client and fail CI when it is stale.
6. **Premature recurrence/realtime/offline complexity** — validate the core online collaboration loop first.

Details: [PITFALLS.md](./PITFALLS.md)

## Implications for Roadmap

### Phase 1: Walking Skeleton and Design System

**Rationale:** Every later vertical slice depends on a reproducible monorepo, client/API connectivity, contract generation, PostgreSQL migrations and shared UI primitives.

**Delivers:** Running Expo client on Android/Web, Nest API health path, database connection, OpenAPI generation, CI, environment setup and branded navigation shell.

**Avoids:** Version incompatibility, contract drift and unstructured cross-package imports.

### Phase 2: Account Lifecycle

**Rationale:** Household data cannot exist safely before identity and session behavior work across native and Web.

**Delivers:** Registration, email verification, login, refresh rotation, logout and password reset.

**Avoids:** Unsafe password hashing and token storage.

### Phase 3: Household Onboarding and Membership

**Rationale:** Household scope and authorization are prerequisites for every collaborative resource.

**Delivers:** Create/switch household, invite/accept member, roles, membership management and ownership invariants.

**Avoids:** Tenant leakage and non-atomic ownership changes.

### Phase 4: Shared Planning MVP

**Rationale:** Events and tasks together prove the core product value.

**Delivers:** Mobile-first Today view, non-recurring events, tasks with one assignee, status and priority.

**Avoids:** Desktop-first calendar UI, ambiguous ownership and unbounded date queries.

### Phase 5: Notes, Labels and Auxiliary Web

**Rationale:** Completes the household workspace after the central planning loop is usable.

**Delivers:** Shared notes, labels/filters, richer Web layouts and cross-platform workflow parity.

**Avoids:** Splitting into a second Web application.

### Phase 6: Hardening and Release Readiness

**Rationale:** Store-distributed clients require compatibility, real-device validation and operational recovery.

**Delivers:** Security/access matrix, performance/index review, EAS profiles, Android/iOS device verification, observability and release documentation.

**Avoids:** “Build succeeds” being mistaken for production readiness.

### Phase Ordering Rationale

- Build infrastructure as a thin walking skeleton, then deliver vertical user capabilities.
- Identity precedes tenancy; tenancy precedes all household resources.
- Events and tasks form one user-visible planning loop, while notes/labels enrich it afterward.
- Release hardening validates the assembled system rather than being scattered as untracked cleanup.

### Research Flags

- **Calendar phase:** Deep research on temporal modeling, all-day events and DST fixtures.
- **Authentication phase:** Confirm final email provider, cookie topology and Argon2id parameters.
- **Release phase:** Re-check current Apple/Google store requirements and Expo build images.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against current official Expo, Node, Nest, Prisma and PostgreSQL documentation |
| Features | HIGH | Core patterns corroborated by established calendar/task products and the old project's proven scope |
| Architecture | HIGH | Standard modular monolith, contract and relational integrity patterns |
| Pitfalls | HIGH | Grounded in standards and official security/platform guidance |

**Overall confidence:** HIGH

### Gaps to Address

- Email delivery vendor and local email testing approach.
- Exact deployment provider for PostgreSQL/API.
- Final calendar time-zone product semantics.
- Whether push reminders enter v1.x or the initial store release.
- Final bundle identifiers and public domain/deep-link host.

## Sources

### Primary

- https://docs.expo.dev/versions/latest/
- https://docs.expo.dev/router/introduction/
- https://docs.expo.dev/guides/authentication/
- https://nodejs.org/en/about/previous-releases
- https://docs.nestjs.com/openapi/introduction
- https://www.prisma.io/docs/orm
- https://www.postgresql.org/docs/18/ddl-constraints.html
- https://datatracker.ietf.org/doc/html/rfc9700
- https://www.rfc-editor.org/info/rfc5545/

### Product Documentation

- https://support.google.com/calendar/answer/37082
- https://www.todoist.com/help/articles/collaborate-with-friends-or-family-in-todoist-tzkGUy
- https://www.todoist.com/help/articles/customize-views-in-todoist-AoHhBxFdZ

---
*Research completed: 2026-07-31*
*Ready for roadmap: yes*

