---
status: resolved
trigger: "Console Error: Cannot update BaseNavigationContainer while rendering ResetPasswordLanding; reset-password.tsx points to router.setParams during render."
created: 2026-08-02T00:00:00+08:00
updated: 2026-08-02T03:30:00+08:00
---

## Symptoms

- Expected: opening a password-reset deep link sanitizes the token without React warnings.
- Actual: React 19 reports a navigation-container update while `ResetPasswordLanding` is rendering.
- Reproduction: open the native reset-password deep link in Expo Go.

## Current Focus

hypothesis: "Confirmed: ResetPasswordLanding called replaceTokenBearingLocation during render, and the native implementation synchronously called router.setParams."
test: "Moved sanitization into an effect and added a regression test that updates a navigation-like parent state."
expecting: "Confirmed: no render-phase update warning; token sanitization still runs after mount and cleans up on unmount."
next_action: "Have the user reload the reset-password route on Android and confirm the console remains clean."

## Evidence

- timestamp: 2026-08-02T00:00:00+08:00
  observation: "password-reset-flow.tsx invokes replaceTokenBearingLocation inside the component body before commit."
- timestamp: 2026-08-02T00:00:00+08:00
  observation: "The native route callback calls router.setParams, which updates BaseNavigationContainer synchronously."

## Eliminated

- hypothesis: "The warning is caused by password-reset form submission."
  reason: "The stack points to initial token sanitization at reset-password.tsx:21, before form submission."

## Resolution

root_cause: "ResetPasswordLanding invoked a callback that calls router.setParams from its render body, causing React 19 to update BaseNavigationContainer while another component was rendering."
fix: "Run token-bearing URL sanitization in useEffect after commit and retain the returned cleanup callback; add a regression harness that updates parent state from the sanitizer."
verification: "Focused password-reset tests 10/10; full client tests 89/89; client TypeScript check passed."
files_changed:
  - apps/client/src/features/auth/password-reset-flow.tsx
  - apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx
