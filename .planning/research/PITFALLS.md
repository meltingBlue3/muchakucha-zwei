# Pitfalls Research

**Domain:** Family calendar and task collaboration across mobile/Web  
**Researched:** 2026-07-31  
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Tenant Isolation Is Treated as a UI Concern

**What goes wrong:** A user can read or mutate another household's records by changing a resource or household ID.

**Why it happens:** Queries fetch by resource ID first and assume the client's selected household proves membership.

**How to avoid:** Require authenticated user plus household scope in every application use case; constrain database queries by both resource ID and household ID; test cross-household denial.

**Warning signs:** Controllers contain ad hoc role checks, or repository methods accept only a resource ID.

**Phase to address:** Foundation and household vertical slice.

---

### Pitfall 2: Calendar Time Semantics Are Underspecified

**What goes wrong:** All-day events move dates, daylight-saving transitions shift times, or users in different zones see inconsistent events.

**Why it happens:** Developers store every temporal value as a naive timestamp and treat “date”, “local wall time” and “instant” as the same concept.

**How to avoid:** Define separate semantics for all-day dates and timed instants; persist time-zone identity when user intent depends on local time; test DST boundaries and cross-zone viewers.

**Warning signs:** One `start: DateTime` model handles every event, or tests only use UTC/Shanghai dates with no DST transition.

**Phase to address:** Calendar model and API phase.

---

### Pitfall 3: Recurrence Is Added as a Boolean

**What goes wrong:** Editing or deleting one occurrence corrupts the entire series; generated occurrences become unbounded.

**Why it happens:** A “repeat weekly” flag is implemented without series identity, exceptions or standards-compatible rule semantics.

**How to avoid:** Defer recurrence from the first calendar slice; when added, model series, recurrence rules, occurrence exceptions and bounded expansion using RFC 5545 semantics.

**Warning signs:** Every recurring occurrence is permanently materialized, or there is no answer for “this event vs this and future events.”

**Phase to address:** Dedicated recurrence phase after core calendar validation.

---

### Pitfall 4: Mobile and Web Authentication Use the Same Unsafe Storage

**What goes wrong:** Refresh tokens are exposed to XSS on Web or stored unencrypted on native.

**Why it happens:** A single AsyncStorage/localStorage implementation is shared for convenience.

**How to avoid:** Use SecureStore on Android/iOS and HttpOnly cookies on Web behind a platform adapter; rotate refresh tokens and store only hashes server-side.

**Warning signs:** Token values are readable from browser JavaScript or AsyncStorage inspection.

**Phase to address:** Authentication foundation.

---

### Pitfall 5: Ownership Rules Are Non-Atomic

**What goes wrong:** A household temporarily or permanently has no owner, two transfer operations race, or removing a member leaves assigned work inconsistent.

**Why it happens:** Role changes and membership deletion are independent queries.

**How to avoid:** Express ownership invariants in constraints where possible and use transactions for transfer/removal workflows.

**Warning signs:** Ownership transfer is implemented as two unrelated API calls.

**Phase to address:** Household membership phase.

---

### Pitfall 6: Generated Contract Drifts

**What goes wrong:** The mobile app compiles against stale API types and fails only at runtime after deployment.

**Why it happens:** OpenAPI generation and client regeneration are manual.

**How to avoid:** Generate the contract/client in CI, compare the working tree, and require explicit compatibility review for breaking `/api/v1` changes.

**Warning signs:** Handwritten duplicate DTO interfaces or uncommitted generated output after API changes.

**Phase to address:** Foundation.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| No database foreign keys | Faster initial schema edits | Orphans and complex cleanup | Never for core relationships |
| One giant shared package | Easy imports | Platform/runtime coupling and cycles | Never; keep package responsibilities narrow |
| Controller-to-Prisma access | Fewer files | Authorization and transaction rules scatter | Only throwaway prototypes |
| Full generic CRUD generator | Fast endpoints | Hides business invariants | Read-only reference data |
| Store all timestamps as naive values | Simple schema | Cross-zone and DST failures | Never for calendar instants |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| EAS/iOS | Assuming cloud compilation replaces device testing | Use EAS builds plus real iPhone validation; retain access to macOS/Xcode for hard failures |
| Email | Sending inline inside a database transaction | Commit state first; use retryable delivery/outbox when reliability matters |
| Push notifications | Treating delivery acceptance as user receipt | Track provider responses, expired device tokens and user preferences |
| Deep links | Adding them after invitations are built | Establish stable route and app scheme during foundation |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded event range | Slow queries and huge client payloads | Require date window and index `(household_id, start_at)` | Large histories or busy households |
| N+1 member/label loading | Latency grows per result | Explicit relation loading and query inspection | Tens/hundreds of list items |
| Cache invalidation by “refetch everything” | Battery/network waste | Household/resource query keys and targeted invalidation | Normal mobile usage |
| Materializing infinite recurrence | Database and job growth | Store rule + exceptions, expand bounded windows | Immediately for endless rules |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passwords hashed with fast hash/bcrypt defaults copied from legacy | Offline cracking | Argon2id with deployment-tuned memory/work parameters |
| Refresh tokens stored in plaintext | Database breach becomes account takeover | Hash at rest, rotate, detect replay and revoke token family |
| Role accepted from request body | Privilege escalation | Resolve membership and role from database |
| Email enumeration | Account discovery | Consistent registration/reset responses and rate limits |
| Missing auth rate limits | Credential stuffing | Per-IP/account throttles and audit signals |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Desktop calendar squeezed onto phone | Tiny targets and overwhelming density | Mobile Today/agenda and focused day/week interactions |
| Household context is invisible | Users edit the wrong family's data | Persistent household indicator and explicit switcher |
| Too many required fields | Quick capture becomes slow | Require title and essential date/status; progressively disclose detail |
| Silent concurrent overwrite | Family members lose each other's edits | Version/updated-at conflict detection for sensitive edits |
| Ambiguous task ownership | Nobody knows who should act | One responsible assignee plus optional watchers later |

## "Looks Done But Isn't" Checklist

- [ ] **Authentication:** verification, reset, rotation, revocation and cross-platform storage are tested.
- [ ] **Households:** cross-tenant requests fail for every resource type.
- [ ] **Ownership:** last-owner removal and concurrent transfer cannot violate invariants.
- [ ] **Calendar:** all-day, DST, time-zone display and bounded date queries are verified.
- [ ] **API contract:** generated client is current and breaking changes are detected.
- [ ] **iOS readiness:** real-device build, deep links, secure storage and keyboard/safe-area behavior are tested.

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Tenant isolation | Foundation + household slice | Automated cross-household access matrix |
| Unsafe token storage | Auth slice | Native SecureStore and Web cookie tests |
| Calendar time semantics | Calendar slice | All-day/DST/cross-zone test cases |
| Non-atomic ownership | Household slice | Transaction/concurrency integration tests |
| Contract drift | Foundation | CI regeneration produces clean tree |
| Recurrence complexity | Deferred dedicated phase | RFC rule and exception fixtures |

## Sources

- https://www.postgresql.org/docs/18/ddl-constraints.html
- https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- https://docs.expo.dev/guides/authentication/
- https://docs.expo.dev/versions/v55.0.0/sdk/securestore/
- https://datatracker.ietf.org/doc/html/rfc9700
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://www.rfc-editor.org/info/rfc5545/

---
*Pitfalls research for: Muchakucha Zwei*
*Researched: 2026-07-31*

