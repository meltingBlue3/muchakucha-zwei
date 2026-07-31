# Architecture Research

**Domain:** Mobile-first multi-tenant household collaboration  
**Researched:** 2026-07-31  
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
Expo Universal Client
  Android | iOS | Web
        |
        | HTTPS / REST / OpenAPI
        v
NestJS Modular Monolith
  Auth | Users | Households | Events | Tasks | Notes | Labels
        |
        | Prisma Client / transactions
        v
PostgreSQL

Deferred adapters:
  Email | Push Notifications | Object Storage | Calendar Providers
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Client shell | Navigation, auth bootstrap, household selection, theme | Expo Router layouts and providers |
| Feature modules | Screens, forms, queries and mutations per capability | `features/auth`, `features/events`, etc. |
| Generated API client | Typed transport boundary | Generated from `/api/v1` OpenAPI |
| Nest modules | Controllers, application services and authorization | One module per domain boundary |
| Prisma repository boundary | Queries, transactions and persistence mapping | Kept inside API; never imported by client |
| PostgreSQL | Referential integrity and durable state | Foreign keys, unique/check constraints, indexes |
| External adapters | Email/push integrations | Interfaces injected into application services |

## Recommended Project Structure

```text
apps/
├── client/
│   ├── app/                    # Expo Router routes/layouts
│   └── src/
│       ├── features/           # auth, households, events, tasks, notes
│       ├── ui/                 # tokens, primitives, components
│       ├── api/                # generated client adapter/query keys
│       └── platform/           # secure storage and platform adapters
└── api/
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    └── src/
        ├── modules/            # bounded business modules
        ├── common/             # errors, guards, observability
        └── infrastructure/     # Prisma, mail and other adapters
packages/
├── api-client/                 # generated from OpenAPI
└── shared/                     # environment-neutral constants/utilities only
```

### Structure Rationale

- `apps/client/app` contains routing only; feature behavior lives under `src/features`.
- API modules own their controllers, services and DTOs so authorization rules remain close to use cases.
- `packages/api-client` is generated, which prevents hand-maintained duplicate response types.
- `packages/shared` must not become a dumping ground or import Node/native-specific code.

## Architectural Patterns

### Modular Monolith

Each business capability is a Nest module with explicit imports. Modules communicate through service interfaces rather than reaching into each other's Prisma queries.

**Trade-off:** More structure than bare Fastify, but far less operational complexity than microservices.

### Tenant-Scoped Service Boundary

Every household resource use case receives the authenticated user and household ID, verifies membership/role, then performs a query constrained by that household.

```typescript
await authorization.requireMember(userId, householdId);
return prisma.task.findMany({ where: { householdId } });
```

Client-provided IDs alone never establish authorization.

### Contract-Generated Client

Nest controllers and DTOs generate OpenAPI. CI regenerates the TypeScript client and fails if committed output is stale. API versioning preserves compatibility with mobile versions already in stores.

### Platform Adapter

Token persistence has one application-facing interface:

```typescript
interface SessionStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(value: string): Promise<void>;
  clear(): Promise<void>;
}
```

Native uses SecureStore; Web relies on HttpOnly cookies and therefore implements different transport behavior behind the adapter.

## Data Flow

### Authenticated Request

```text
User action
  -> TanStack Query mutation
  -> generated API client
  -> Nest controller validation
  -> auth guard
  -> household authorization
  -> application service
  -> Prisma transaction/query
  -> PostgreSQL constraints
  -> DTO response
  -> cache update/invalidation
```

### Household Creation

```text
Create household request
  -> transaction:
       insert household
       insert owner membership
  -> both commit or both roll back
```

### Session Refresh

```text
Expired access token
  -> refresh endpoint
  -> verify stored token hash/family/status
  -> revoke prior token
  -> issue next refresh token
  -> persist token securely per platform
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–10k users | Single API deployment and PostgreSQL are sufficient |
| 10k–100k users | Connection pooling, query/index review, background jobs and targeted cache |
| 100k+ users | Split only measured hot paths; retain domain ownership and contract boundaries |

### Scaling Priorities

1. Index household/date/status query paths and prevent unbounded calendar ranges.
2. Move email/push delivery to background jobs once synchronous delivery becomes unreliable.
3. Add realtime only for flows where polling/invalidation fails user expectations.

## Anti-Patterns

### Prisma Types as Public Contract

Persistence types change for database reasons and frequently contain internal fields. Generate API contracts instead.

### Authorization Only in Controllers

Background jobs and internal calls can bypass controllers. Enforce permissions in application services/guards with reusable policies.

### Generic CRUD Service

Household ownership transfer, invitation acceptance and event semantics are business operations, not generic table CRUD. Model named use cases.

### Premature Event-Driven Microservices

Distributed events introduce ordering, retries and observability problems before the project has scale. Use in-process modules and database transactions first.

## Integration Points

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Transactional email | Injected mail provider interface | Outbox/background delivery later; never couple domain to vendor SDK |
| EAS Build | CI build profiles | Separate development, preview and production profiles |
| Push service (deferred) | Device token registry + background sender | Expo can bridge FCM/APNs; handle revoked tokens |
| System calendar (deferred) | Provider adapter | Requires explicit source identity and conflict rules |

## Sources

- https://docs.expo.dev/router/introduction/ — universal navigation and deep linking
- https://docs.expo.dev/guides/authentication/ — platform-aware secure token storage
- https://docs.nestjs.com/openapi/introduction — OpenAPI generation
- https://www.prisma.io/docs/orm/prisma-client/queries/transactions — atomic and dependent writes
- https://www.postgresql.org/docs/18/ddl-constraints.html — relational integrity
- https://datatracker.ietf.org/doc/html/rfc9700 — refresh-token rotation/replay guidance

---
*Architecture research for: Muchakucha Zwei*
*Researched: 2026-07-31*

