# Stack Research

**Domain:** Mobile-first family calendar and task collaboration  
**Researched:** 2026-07-31  
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24 LTS | Shared JavaScript runtime and toolchain | Node 24 is the current LTS line; production projects should prefer LTS over Node 26 Current |
| TypeScript | Current stable 5.x | Client and API language | One strict type system across the monorepo reduces context switching |
| Expo SDK | 57 | Android, iOS and auxiliary Web client | SDK 57 targets React Native 0.86, React 19.2.3 and React Native Web 0.21 |
| Expo Router | SDK 57 compatible | Universal file-based navigation | One route model supports native navigation, Web links and deep links |
| NestJS | 11.x stable | Modular API application framework | Modules, services, guards and dependency injection fit the existing domain breadth |
| Fastify | Nest-supported stable major | HTTP adapter | Schema-oriented, efficient request handling without changing Nest module boundaries |
| PostgreSQL | 18.x stable | Relational system of record | Strong constraints, transactions, time-zone-aware types and indexing |
| Prisma ORM | 7.x stable | Type-safe data access and migrations | Generated query client plus reviewable SQL migrations; use stable releases only |

### Supporting Libraries

| Library | Version Policy | Purpose | When to Use |
|---------|----------------|---------|-------------|
| `@shopify/restyle` | Pin current stable | Typed design tokens and themes | All shared UI primitives and responsive styling |
| TanStack Query | Pin current stable major | Server-state cache | All authenticated API queries and mutations |
| React Hook Form | Pin current stable major | Form state | Registration, event, task and household forms |
| Zod | Pin current stable major | Client-side runtime validation | Form schemas and environment/config validation |
| `expo-secure-store` | Install via `expo install` | Encrypted native secret storage | Refresh/session material on Android and iOS |
| Argon2id implementation | Pin audited current stable | Password hashing | API credential storage; tune work factor in deployment |
| OpenAPI client generator | Pin chosen stable tool | Generated API client | Generate `packages/api-client` from the versioned contract |
| Vitest | Pin current stable major | Unit/integration tests | Shared packages and API service logic |
| Playwright | Pin current stable major | Browser flows | Auxiliary Web registration and core collaboration checks |

Expo-managed native dependencies must be installed with `npx expo install`; this keeps versions aligned with the SDK compatibility matrix.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm workspace | Monorepo dependency management | One lockfile; enforce package boundaries |
| Docker Compose | Local PostgreSQL and supporting services | App processes may run natively for fast reload |
| Prisma Migrate | Schema history | Commit migrations and review generated SQL |
| OpenAPI | API contract | Generate client types; do not share Prisma types |
| GitHub Actions | CI | Typecheck, lint, tests, migration validation and builds |
| EAS Build | Android/iOS cloud builds | Enables iOS builds from Windows; retain real-device validation |

## Installation Strategy

Bootstrap exact dependency versions during the foundation phase rather than copying arbitrary latest versions into this document:

```bash
pnpm create expo-app apps/client --template default@sdk-57
pnpm --dir apps/client exec expo install --check
pnpm --dir apps/client exec expo-doctor
```

Use Node 24 LTS in `.nvmrc`/`.node-version`, CI and containers. Pin all resolved package versions in `pnpm-lock.yaml`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Expo universal client | Separate Next.js + Expo apps | Web becomes a full product with SEO/SSR or desktop-only workflows |
| NestJS modular monolith | Hono/Fastify routes directly | The API remains very small and the team accepts defining its own architecture rules |
| REST/OpenAPI | tRPC/Hono RPC | All clients can update atomically with the server |
| Prisma | Drizzle | SQL control becomes more important than Prisma's migration and relation ergonomics |
| Restyle/custom components | Tamagui | A larger ready-made universal component system justifies added abstraction |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Node 26 Current for production | It has not entered LTS as of the research date | Node 24 LTS |
| Expo canary/beta | Pre-releases explicitly carry compatibility risk | Stable Expo SDK 57 |
| Prisma Next/Early Access features | Preview behavior can change during the project | Stable Prisma 7.x APIs |
| NativeWind v5 pre-release | Styling is foundational and should not depend on a preview compiler | Restyle plus React Native primitives |
| Prisma models as client DTOs | Leaks persistence structure and couples app releases to schema changes | OpenAPI-generated client models |
| Refresh tokens in AsyncStorage/localStorage | These stores are unsuitable for long-lived secrets | SecureStore on native and HttpOnly cookie on Web |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Expo SDK 57 | React Native 0.86, React 19.2.3, RN Web 0.21 | Minimum Node 22.13; project standardizes on Node 24 LTS |
| Expo SDK packages | Expo SDK 57 | Install with `npx expo install`, verify with `expo-doctor` |
| NestJS 11 | Node 24 LTS | Confirm adapter/plugin compatibility in the foundation phase |
| Prisma 7 stable | Node 24 LTS + PostgreSQL 18 | Pin CLI and client to the same version |

## Sources

- https://docs.expo.dev/versions/latest/ — SDK 57 compatibility matrix
- https://docs.expo.dev/router/introduction/ — universal routing
- https://nodejs.org/en/about/previous-releases — LTS status
- https://docs.nestjs.com/openapi/introduction — REST/OpenAPI generation
- https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/ — schema validation and serialization
- https://www.prisma.io/docs/orm — ORM and migration capabilities
- https://www.postgresql.org/docs/18/ddl-constraints.html — relational constraints
- https://shopify.github.io/restyle/ — type-enforced design systems

---
*Stack research for: Muchakucha Zwei*
*Researched: 2026-07-31*

