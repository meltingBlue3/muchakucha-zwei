# Web Accessibility Contracts

Read this playbook when a change touches accessible names, roles, states, focus order, or keyboard behavior on Web — including any change that an `e2e/**/accessibility.spec.ts` or a role-based Playwright locator can observe. Visual design rules stay in [../design.md](../design.md).

React Native Web decides what reaches the DOM. Props that work on native are frequently dropped on Web, so a control that reads correctly on a device can be invisible to axe, to a screen reader, and to `getByRole`. The rules below are the ones this codebase has already paid for.

## Expose the role

An interactive `Pressable` reaches the DOM as a plain element. Without `accessibilityRole="button"` it has no role, no accessible name, and no `getByRole('button')` match — the control looks fine and is unreachable. Every pressable that acts on something carries the role, an `accessibilityLabel` when its visible text is not the whole name, and `accessibilityState` for `disabled`, `busy`, or `selected`.

Prefer the shared components in `src/ui/primitives.tsx` — `Button`, `IconButton`, `FormActions`, `LinkText` — which already carry role, name, state, and touch target. A raw `Pressable` is for a composition the shared set has no role for, and then it declares the same contract itself.

## Use ARIA where state must render

`accessibilityState.checked` does not reach the DOM on Web. A radio or toggle sets `aria-checked` directly, as the label color swatches in `app/(protected)/households/[id]/labels/index.tsx` do. Verify a state prop actually renders before writing an assertion against it; a prop that silently vanishes produces a test that fails for a reason the source does not show.

## One named dialog

`Modal` on Web always renders a full-screen `role="dialog" aria-modal` node and forwards unrecognized props to it. Naming the inner panel as well produces two nested dialogs and an axe `aria-dialog-name` violation on the unnamed outer one.

`src/ui/app-dialog.tsx` resolves this: the `Modal` carries `aria-label={title}` on Web, and the panel stays an unnamed container identified by `testID="app-dialog-panel"`. Browser checks therefore address a dialog by name and reach into the panel by test id:

```ts
page.getByRole('dialog', { name: '编辑家庭名称' }).getByTestId('app-dialog-panel')
```

Changing the dialog shell means re-running the account and household settings journeys, which cover the profile, logout, rename, invite, and revoke dialogs together.

## Established roles

- `Screen` renders `role="main"` on Web and takes `accessibilityLabel` as its name. Scope a locator to `getByRole('main', { name: '笔记详情' })` when a list stays mounted behind a detail view; an unscoped text locator hits Playwright strict mode.
- `Spinner` is `role="progressbar"` with its label as the name. Wait on `getByRole('progressbar', { name: '正在恢复登录状态' })` rather than on the text, which can match more than one node during a transition.
- Collection items expose a prefixed name — `笔记：暑假计划`, `标签：学习` — so a list assertion can match `/^笔记：/` and stay readable.

## Focus

- Validation raised on blur leaves focus where the user sent it. Only a submit moves focus to the first invalid field: `TextField` takes `submitAttempt={submitCount}` from `react-hook-form`, and `src/ui/primitives.tsx` tracks whether the last interaction was a Tab press. A form that pulls focus back on blur traps the user in the first empty field.
- `AppDialog` owns initial focus, Tab cycling, Escape and outside-click close, close suppression while busy, and focus restoration to the trigger. A dialog consumer passes the trigger ref and adds no focus handling of its own.
- Tab order follows document order, so a page header button precedes form fields. A tab-order assertion states the whole expected sequence rather than a single hop.

## Focused checks

Run the accessibility specs for the touched area plus any journey covering a changed shared component:

```sh
pnpm exec playwright test e2e/households/accessibility.spec.ts
```

[testing.md](testing.md) covers ports, database setup, and how to run these without disturbing a running dev server. axe runs against the page and against each open dialog; a dialog reached only by opening it needs its own `analyze()` call, since a closed dialog renders nothing to scan.
