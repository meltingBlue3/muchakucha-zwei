# Client Implementation

Read this playbook for client routing, data loading, session handling, draft state, or platform adapters. Visual and layout decisions live in [../design.md](../design.md); Web accessibility contracts live in [web-accessibility.md](web-accessibility.md). Take either one only when the change reaches it.

## Routes

Expo Router maps `apps/client/app/` to the route tree. `(auth)` and `(protected)` are layout groups and do not appear in URLs; `[id]`, `[taskId]`, and siblings are path parameters. A route file owns orchestration — parameters, fetching, navigation, and page composition — and delegates domain rendering to `src/features/` and appearance to `src/ui/`.

Confirmation flows are routes, not inline branches: `members/[membershipId]/remove.tsx`, `ownership/transfer.tsx`, and `invitations/[invitationId]/revoke.tsx` follow this shape. A new destructive confirmation joins them rather than growing a parent screen.

## Loading data

Every authenticated call takes the access token as its first argument:

```ts
const token = await sessionTransport.getAccessToken();
if (token === null) { setError('登录已过期，请重新登录。'); return; }
const result = await sessionApiClient.listNotes(token, householdId);
```

Both come from `src/features/auth/session-runtime.ts`. Routes hold `loading`, `refreshing`, and `error` in local state and refetch through `useFocusEffect` so returning from a child route shows current data. `@tanstack/react-query` is installed but unused — follow the local-state pattern above instead of introducing a second data layer for one screen.

Failures reach the user as Chinese copy describing the next action, never a raw status or code. `src/api/api-client.ts` shows the shape of a rejected call (`status` plus a body carrying `error.code`) and how `SessionRestoreError` classifies authentication failures into `unauthenticated`, `reauthRequired`, and `offline`.

## Session and household

`sessionTransport` keeps the access token in memory and holds the refresh credential in SecureStore on native and an HttpOnly cookie on Web. `src/api/refresh-coordinator.ts` collapses concurrent refreshes into one. Neither the token nor the refresh credential is logged, persisted to component state, or passed through navigation parameters.

`useHouseholdContext()` owns the current household. Its `viewState` — `resolving`, `ready`, `noHousehold`, `offlineRetained`, `accessChanged` — drives what a protected screen renders; a screen that only checks for an empty list will show a blank page during resolution and after access loss. Use `AccessChangedPanel` for the `accessChanged` state and `switchHousehold`/`refreshHouseholds` for transitions rather than re-fetching households directly.

## Drafts

`useWorkspaceState(draftKey, initial)` keeps unsaved form input for the login session. A form passing a `draftKey` keeps input across cancel and clears it on successful save; `NoteForm` is the reference implementation.

Updates omit unchanged fields, so clearing an optional value requires sending it explicitly. `note-form.tsx` sends `body: ''` when editing an existing note and omits `body` when creating — the analogous case in any edit form needs the same explicit empty value plus a unit test on the submitted payload.

## Platform adapters

`src/platform/<area>/` holds one base file declaring the shared type and `.native.ts` / `.web.ts` / `.android.ts` implementations that Metro selects by extension. Platform branching belongs there, not in features or routes. `Platform.OS` checks inside a shared component are for rendering differences a type cannot express, such as the Web dialog naming in `src/ui/app-dialog.tsx`.

## Focused checks

Client unit tests are Jest, run from the client package:

```sh
pnpm --filter client test          # jest --runInBand
```

A direct `jest` invocation skips the runner setup and fails on `clearMocksOnScope`. Test files must be named `src/**/__tests__/*-test.tsx`; any other name matches no pattern and silently runs zero tests. Add `pnpm --recursive typecheck` for type-level changes, and see [testing.md](testing.md) when a change needs browser evidence.
