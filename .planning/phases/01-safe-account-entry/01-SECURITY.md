---
phase: 01-safe-account-entry
slug: safe-account-entry
status: verified
# Blocking gate counts OPEN threats at or above workflow.security_block_on (high).
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-08-02
---

# Phase 01 — Security

> Per-phase security contract: plan-time STRIDE threats, summary threat flags, accepted residual risks, and L1 verification evidence.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Package registries → workspace | Approved third-party code enters build and runtime dependency graphs. | Executable packages and lockfile metadata |
| Mobile/Web client → `/api/v1` | Untrusted client input crosses into authenticated and unauthenticated API routes. | Credentials, opaque proofs, access tokens, profile data |
| API → PostgreSQL | Auth state relies on transactional persistence and database constraints. | Password/token hashes, identities, sessions, expiry timestamps |
| API → mail transport | Verification and reset capabilities leave the API through email. | One-time opaque links |
| Native device → SecureStore | Long-lived native session material crosses a platform storage boundary. | Refresh credentials and pending proofs |
| Browser → HttpOnly cookies | Web refresh and pending-proof capabilities remain server/browser owned. | Secure cookies; access token remains memory-only |
| Test harness → local services | Destructive reset, mailbox inspection, and throttle bypass exist only for isolated tests. | Disposable database rows and captured test messages |

## Threat Register

Threat references are prefixed with their owning plan because several original `Threat ID` values were reused by later plans.

| Threat Ref | Category | Component | Severity | Disposition | Mitigation / Evidence | Status |
|------------|----------|-----------|----------|-------------|-----------------------|--------|
| 01-01/T-01-SC | Tampering | npm dependency set | high | mitigate | Human provenance approval, exact pins, and committed frozen `pnpm-lock.yaml`. | closed |
| 01-01/T-01-01 | Spoofing | similarly named package | high | mitigate | Approved package inventory was checked against official package/source provenance before install. | closed |
| 01-01/T-01-02 | Denial of Service | incompatible patches | medium | mitigate | Expo, Nest, Prisma, and Node compatibility groups were approved and pinned. | closed |
| 01-02/T-02-SC | Tampering | package graph | high | mitigate | Frozen lockfile and approved workspace build-script allowlist. | closed |
| 01-02/T-02-01 | Information Disclosure | test environment | high | mitigate | `.env.test.example` contains example-only values; origin/secret configuration fails fast. | closed |
| 01-03/T-03-01 | Repudiation | RED evidence | high | mitigate | `scripts/assert-red.ps1` requires discovery and expected markers and rejects infrastructure-only failures. | closed |
| 01-03/T-03-SC | Tampering | dependencies | high | mitigate | API dependencies are exact and resolved by the approved frozen lockfile. | closed |
| 01-04/T-04-01 | Repudiation | client test evidence | medium | mitigate | One-shot Jest discovery, deterministic mocks, and required-test audits prevent false green runs. | closed |
| 01-04/T-04-SC | Tampering | dependencies | high | mitigate | Client dependencies use the approved frozen lockfile. | closed |
| 01-05/T-04-01 | Spoofing | common passwords | high | mitigate | Registration/reset integration tests enforce the licensed top-3000 denylist. | closed |
| 01-05/T-04-02 | Repudiation | ASVS claims | high | mitigate | Stable control IDs and executable completeness mapping in `docs/security/asvs-v5.0.0-l1.md`. | closed |
| 01-06/T-06-01 | Tampering | password denylist | high | mitigate | Pinned source metadata, checksums, deterministic derivation, and runtime/test identity checks. | closed |
| 01-06/T-06-02 | Repudiation | ASVS evidence | high | mitigate | Named security tests and a fail-closed mapping audit passed. | closed |
| 01-07/T-05-01 | Repudiation | UI acceptance | medium | mitigate | Named component/E2E matrix files and exact required-test inventory. | closed |
| 01-07/T-05-SC | Tampering | dependencies | high | mitigate | Test dependencies remain exact and frozen. | closed |
| 01-08/T-08-01 | Denial of Service | inaccessible UI contract | medium | mitigate | Computed contrast, focus/state, target-size, and scaling assertions. | closed |
| 01-09/T-09-01 | Repudiation | E2E RED evidence | high | mitigate | Discovery-first activation and expected-marker checks exist for Playwright suites. | closed |
| 01-10/T-06-01 | Tampering | auth rows | high | mitigate | PostgreSQL FK/unique/CHECK constraints, transactions, migrations, and migrated DB tests. | closed |
| 01-10/T-06-02 | Information Disclosure | token columns | high | mitigate | Schema stores only credential hashes; integration tests assert persistence directly. | closed |
| 01-11/T-11-01 | Information Disclosure | logs/mail | high | mitigate | Structured redaction and hardened mail rendering; capture tests assert secret confinement. | closed |
| 01-11/T-11-02 | Spoofing | browser origin | high | mitigate | Exact-origin credentialed CORS and POST-only mutation routes. | closed |
| 01-12/T-12-01 | Information Disclosure | client secrets | high | mitigate | Native SecureStore only; Web has no secret API and keeps access tokens in memory. | closed |
| 01-12/T-12-02 | Tampering | partial session acceptance | high | mitigate | Native refresh persistence precedes authenticated state publication with rollback on failure. | closed |
| 01-13/T-07-01 | Spoofing | registration | high | mitigate | Canonical identity, Argon2id, denylist, unique database key, and throttling. | closed |
| 01-13/T-07-02 | Information Disclosure | pending proof | high | mitigate | Proof hashes at rest, HttpOnly Web cookie, native-only response, and redaction tests. | closed |
| 01-14/T-14-01 | Denial of Service | inaccessible controls | medium | mitigate | Measured contrast, touch geometry, focus, semantics, and preference tests. | closed |
| 01-15/T-08-01 | Information Disclosure | Web proof | high | mitigate | Browser client exposes no cookie getter/setter and uses credentialed generated requests. | closed |
| 01-15/T-08-02 | Denial of Service | inaccessible UI | medium | mitigate | Registration UI passes contrast, state, target, and responsive tests. | closed |
| 01-16/T-09-01 | Spoofing | same-device continuation | high | mitigate | Independent proof hash plus atomic proof match and session issuance. | closed |
| 01-16/T-09-02 | Tampering | one-time links | high | mitigate | POST-only conditional consume with expiry/use/supersede classification. | closed |
| 01-17/T-10-01 | Information Disclosure | verification link route | high | mitigate | Immediate URL replacement plus history, render, and log assertions. | closed |
| 01-17/T-10-02 | Information Disclosure | Web pending proof | high | mitigate | Server-owned HttpOnly cookie with no JavaScript access path. | closed |
| 01-18/T-11-01 | Spoofing | login/JWT | high | mitigate | Argon2id, verified-only sessions, allowlisted JWT algorithm/key/claim checks, and durable session binding. | closed |
| 01-18/T-11-02 | Spoofing | refresh | high | mitigate | Serializable atomic rotation, retained hash, replay revocation, concurrency tests, and device isolation. | closed |
| 01-18/T-11-03 | Tampering | Web cookie | high | mitigate | Exact Origin/CORS, POST-only refresh, secure attributes, and unambiguous credential source. | closed |
| 01-19/T-12-01 | Elevation of Privilege | `users/me` | high | mitigate | Guard-derived subject, whitelisted DTO, explicit projection, and cross-account/mass-assignment tests. | closed |
| 01-20/T-13-01 | Information Disclosure | client storage | high | mitigate | SecureStore/HttpOnly platform split and forbidden-storage assertions. | closed |
| 01-20/T-13-02 | Spoofing | bootstrap | high | mitigate | Typed auth-versus-network outcomes followed by generated `users/me` validation. | closed |
| 01-21/T-21-01 | Spoofing | bootstrap routing | high | mitigate | Accepted access is validated through `users/me` before authenticated routing. | closed |
| 01-21/T-21-02 | Elevation of Privilege | intended route | high | mitigate | Internal destination allowlist and authenticated state publication before navigation. | closed |
| 01-22/T-14-01 | Information Disclosure | reset request | high | mitigate | Equivalent public responses and throttling tests prevent account enumeration. | closed |
| 01-22/T-14-02 | Tampering | reset transaction | high | mitigate | Conditional consume, password hash update, global revoke, and fault rollback in one transaction. | closed |
| 01-23/T-15-01 | Information Disclosure | reset link | high | mitigate | Immediate and mount-lifetime URL/history sanitization with log assertions. | closed |
| 01-24/T-16-01 | Elevation of Privilege | logout | high | mitigate | Verified signed `sid`, bodyless endpoint, no caller-selected target, and two-device tests. | closed |
| 01-25/T-17-01 | Information Disclosure | client session | high | mitigate | Server-first logout and platform-specific local credential clearing tests. | closed |
| 01-26/T-18-01 | Repudiation | security evidence | high | mitigate | Stable ASVS IDs, named tests, executable mapping audit, and final green evidence. | closed |
| 01-26/T-18-02 | Denial of Service | inaccessible UI | medium | mitigate + accept residual | Automated accessibility/preference/responsive matrix passed; manual Android checks were explicitly waived as R-01. | closed |
| 01-27/T-19-01 | Information Disclosure | native storage/deep links | high | mitigate | Real Android SecureStore restoration and sanitized deep-link behavior were observed. | closed |
| 01-27/T-19-02 | Spoofing | native restore | high | mitigate + accept residual | Restart, logout, reset, and multi-device boundaries passed on Android; device-offline observation was explicitly waived as R-02. | closed |
| 01-03/TF-local-database-reset | Tampering | test database reset | high | mitigate | Destructive SQL requires loopback host and a test database name and preserves migration history. | closed |
| 01-26/TF-local-test-endpoint | Information Disclosure | E2E mailbox endpoint | high | mitigate | Narrow unauthenticated message API binds to loopback and exists only for the Playwright-owned test process. | closed |
| 01-26/TF-test-security-bypass | Elevation of Privilege | rate-limit bypass | high | mitigate | Bypass requires both `NODE_ENV=test` and the explicit E2E flag; release configuration must omit the flag. | closed |

*Status: open · closed · open — below `high` threshold (non-blocking). Only open threats at or above `high` count toward `threats_open`.*

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-01 | 01-26/T-18-02 | Manual Android 200% text, keyboard, TalkBack, and touch-target observation was waived; unit and Playwright accessibility evidence remains green. | User, Phase 01 verification approval | 2026-08-02 |
| R-02 | 01-27/T-19-02 | Manual device-offline restoration was impractical in Expo Go; automated client tests cover credential retention and retry state. | User, Phase 01 verification approval | 2026-08-02 |

Accepted residual risks remain release-verification debt and do not count as open threats in this audit.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-02 | 52 | 52 | 0 | Codex (`gsd-secure-phase`, ASVS L1) |

## Security Audit 2026-08-02

| Metric | Count |
|--------|-------|
| Threats found | 52 |
| Closed | 52 |
| Open | 0 |

The plan-time register was present in all 27 plan files. Because grep-depth classification found evidence for every threat and `asvs_level: 1`, the secure-phase L1 short-circuit applied and no deeper boundary-placement auditor was required.

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted residual risks are documented in the Accepted Risks Log
- [x] `threats_open: 0` confirmed at the configured `high` blocking threshold
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-02
