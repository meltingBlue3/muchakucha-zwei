---
phase: 1
slug: safe-account-entry
status: approved
shadcn_initialized: false
preset: muchakucha-warm-v1
created: 2026-08-01
---

# Phase 1 — UI Design Contract

> Visual and interaction contract for the safe account entry phase. Generated inline under the `gsd-ui-phase` workflow because subagent delegation was not authorized for this session.

---

## Experience Intent

Authentication should feel calm, trustworthy, and domestic without becoming childish. The screen should make the next action obvious within one glance, use warm color as orientation rather than decoration, and never confuse network failure with authentication failure.

**Experience principles:**

1. **The form is the hero.** Brand expression supports the task but never competes with it.
2. **One obvious next step.** Each screen has one primary action and at most two quiet secondary actions.
3. **Explain state changes.** Verification, expiration, offline mode, and session revocation have distinct messages and recovery paths.
4. **Mobile first, Web composed.** Native screens prioritize thumb reach; Web uses the same components inside a restrained centered layout.

## Design System

| Property | Value |
|----------|-------|
| Tool | `@shopify/restyle` typed theme |
| Preset | `muchakucha-warm-v1` |
| Component library | Custom React Native primitives; no platform UI kit |
| Icon library | `lucide-react-native`, individually imported; 20px default, 2px stroke |
| Font | Noto Sans SC static local assets: 400, 500, 600; system sans fallback |
| Theme scope | Light theme for v1; semantic tokens must permit a later dark theme without component rewrites |
| Illustration | No character or household-scene illustration; abstract geometric color fields only |

### Required Shared Primitives

`Screen`, `Stack`, `Inline`, `Text`, `Heading`, `Button`, `IconButton`, `TextField`, `PasswordField`, `FormMessage`, `Banner`, `Spinner`, `BrandMark`, `AuthShell`, `LinkText` and `StatusPanel` must own visual styling. Feature screens must not use raw color, spacing, radius, or font-size literals.

## Spacing Scale

Declared values are multiples of 4:

| Token | Value | Usage |
|-------|-------|-------|
| `space.0` | 0px | Explicit reset |
| `space.1` | 4px | Icon-to-label micro gap |
| `space.2` | 8px | Inline controls, compact feedback |
| `space.3` | 12px | Label-to-field and related-control spacing |
| `space.4` | 16px | Default component and form spacing |
| `space.5` | 20px | Compact screen inset |
| `space.6` | 24px | Default mobile screen inset and section gap |
| `space.8` | 32px | Form groups and header separation |
| `space.10` | 40px | Brand-to-form separation |
| `space.12` | 48px | Major section break |
| `space.16` | 64px | Large Web canvas separation |

**Exceptions:** Safe-area insets are added at runtime; 1px borders and 2px focus rings are not spacing tokens.

## Shape and Elevation

| Token | Value | Usage |
|-------|-------|-------|
| `radius.sm` | 8px | Small status chips |
| `radius.md` | 12px | Inputs, compact panels |
| `radius.lg` | 16px | Buttons, banners, auth card |
| `radius.full` | 999px | Spinner track or decorative dots only |
| `border.default` | 1px | Input and panel boundaries |
| `shadow.soft` | `0 8px 28px rgba(45,39,37,0.08)` | Web auth card only |

Native auth screens use borders and surface contrast, not card shadows. Do not stack multiple rounded cards inside one another.

## Typography

Use static font files bundled with the application. Hold the branded splash screen until fonts and session state are resolved. Do not synthesize unsupported font weights.

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `caption` | 12px | 500 | 16px | Countdown, supporting metadata |
| `bodySm` | 14px | 400 | 20px | Help and validation details |
| `body` | 16px | 400 | 24px | Form values and normal copy |
| `label` | 14px | 600 | 20px | Field labels and compact actions |
| `button` | 16px | 600 | 20px | Button labels |
| `heading` | 24px | 600 | 32px | Screen title |
| `display` | 32px | 600 | 40px | Brand-led Web heading; avoid on narrow mobile screens |

Rules:

- Use sentence case; never use all caps for navigation or actions.
- Keep headings to two lines and body copy to approximately 60 Chinese characters per paragraph.
- Use tabular numerals for the 60-second resend countdown.
- Truncation is prohibited for errors, recovery instructions, email addresses on verification screens, and primary actions.

## Color

### Core Palette

| Token | Value | Contrast / Usage |
|-------|-------|------------------|
| `color.canvas` | `#FFF8F2` | Dominant cream canvas |
| `color.surface` | `#FFFFFF` | Form surfaces and Web auth card |
| `color.surfaceMuted` | `#F5E9E1` | Secondary panels and decorative fields |
| `color.ink` | `#2D2725` | Primary text; 13.97:1 on canvas |
| `color.inkMuted` | `#6F625D` | Secondary text; 5.57:1 on canvas |
| `color.border` | `#9C877E` | Input and panel boundaries; 3.40:1 against white |
| `color.coral` | `#B94736` | Primary CTA and active focus; 5.23:1 with white |
| `color.coralPressed` | `#963A2D` | Pressed primary action |
| `color.coralSoft` | `#F7DDD5` | Decorative field and selected subtle background |
| `color.teal` | `#277A72` | Success and verified state; 5.11:1 with white |
| `color.tealSoft` | `#DCEEEA` | Success panel background |
| `color.destructive` | `#B42318` | Destructive/error emphasis; 6.57:1 with white |
| `color.destructiveSoft` | `#FDE4E1` | Error banner background |
| `color.focusRing` | `#7B2F25` | 2px keyboard/Web focus indicator |
| `color.disabled` | `#B7AAA4` | Disabled fill; disabled controls also expose semantic state |

### Distribution and Restrictions

| Role | Target | Usage |
|------|--------|-------|
| Dominant | 60% | Cream canvas and breathing room |
| Secondary | 30% | White surfaces and muted panels |
| Accent | 10% maximum | Primary CTA, focus, active link, small abstract shapes |
| Destructive | Exception only | Errors and destructive confirmations |

Coral is reserved for the single primary action, active focus/selection, text links, and small brand accents. Teal is reserved for verified/success states. Neither color may be the only way a state is communicated. White text on coral, teal, and destructive fills meets WCAG 2.2 AA for normal text.

## Layout Contract

### Mobile: Android and iOS

- Full-screen `AuthShell` uses safe-area padding plus 24px horizontal inset; compact devices may reduce to 20px.
- Content width is fluid. The form begins below a compact BrandMark and screen heading, not below a full-screen hero.
- Primary action is full width and at least 52px high. Inputs are 52px high; multiline content is not used in this phase.
- On keyboard open, the active field and its validation message remain visible. The screen scrolls; the primary action is not permanently fixed above the keyboard.
- Secondary actions sit below the primary button. “创建账户” is visually stronger than “忘记密码” on the login screen but neither competes with “登录”.

### Web Auxiliary Entry

- Use a centered auth card, maximum width 440px, with 32px internal padding at widths ≥768px and 24px below that.
- Canvas may contain two cropped coral/teal abstract shapes. They must be `aria-hidden`, non-interactive, and absent when reduced motion or forced colors make them distracting.
- Do not introduce a separate desktop navigation shell for authentication.
- Keyboard tab order follows visual order. Pressing Enter submits only when the form is valid and not pending.

### Responsive Breakpoints

| Range | Contract |
|-------|----------|
| `< 360px` | 20px inset, compact brand spacing, no display typography |
| `360–767px` | 24px inset, full-width form |
| `≥ 768px` | Centered 440px auth card on canvas |

## Screen and Route Inventory

| Route / State | Required Content | Primary Action |
|---------------|------------------|----------------|
| Session bootstrap | BrandMark, accessible progress label | None |
| Login | Email, password, forgot-password link, registration link | 登录 |
| Register | Email, nickname, password, terms placeholder only if legally required later | 创建账户 |
| Verify pending | Target email, open-email guidance, countdown, resend action | 打开邮箱 |
| Verify result: success | Verified status, next-step explanation | 继续 |
| Verify result: expired | Expiry explanation, resend path | 重新发送验证邮件 |
| Verify result: used | Already-verified explanation | 前往登录 |
| Verify result: invalid | Safe generic explanation | 重新发起验证 |
| Forgot password | Email input and privacy-safe confirmation | 发送重置链接 |
| Reset password | New password and strength guidance | 更新密码 |
| Reset success | Success status and session-revocation explanation | 返回登录 |
| Offline startup | Offline explanation and retained-session reassurance | 重试连接 |
| Session expired | Expiration banner on login and preserved intended route | 重新登录 |
| Profile nickname | Current nickname and editable field | 保存昵称 |
| No-household handoff | Account-ready confirmation; Phase 2 owns household choices | 继续设置家庭 |

## Form and Component States

### TextField and PasswordField

| State | Visual and behavior |
|-------|---------------------|
| Rest | White surface, ink text, border token |
| Focus | Coral border plus 2px focus ring; label remains visible |
| Filled | Same structure as rest; value never replaces the label |
| Invalid | Destructive border, inline icon, and specific text directly below field |
| Disabled | Disabled fill and semantic disabled state; text remains readable |
| Password revealed | Eye icon changes and accessible label becomes “隐藏密码” |

Validate on blur after first interaction and on submit. Do not show errors before the user has interacted. Server errors appear in a top form banner and, when safely attributable, next to the relevant field. Never reveal whether an unregistered email exists in forgot-password responses.

### Button

| State | Visual and behavior |
|-------|---------------------|
| Rest | Coral fill, white text |
| Pressed | `coralPressed`; native opacity must not reduce contrast below AA |
| Focused Web | 2px focus ring with 2px offset |
| Loading | Label remains stable, spinner appears without changing button width; interaction disabled |
| Disabled | Disabled token, semantic disabled state, no shadow |

Loading actions must be idempotent from the user's perspective. Disable repeat submission while a request is pending.

### Banner and StatusPanel

- `Banner` is for recoverable inline conditions such as session expiry or API failure.
- `StatusPanel` is for page-level verified, expired, reset-success, or offline states.
- Every status uses icon, heading, explanatory copy, and action; color alone is insufficient.

## Interaction and Navigation

- Auth routes use fade-through transitions of 160–200ms. Respect reduced-motion preferences by removing translation and shortening opacity transitions.
- Back navigation from registration, forgot password, and reset flows returns to login without clearing a valid email value on the current device.
- Deep links are parsed before auth routing. Verification and reset tokens must never appear in screen copy, logs, analytics, or post-navigation URLs.
- Same-device verification success continues into authenticated routing. Cross-device verification success ends with login guidance.
- Session restoration owns the splash screen until it resolves to authenticated, unauthenticated, or offline-waiting state.
- When reauthentication is required, preserve only a safe internal intended route; never persist form secrets or external redirects.

## Copywriting Contract

Tone is warm, direct, and non-judgmental. Use “你” sparingly; avoid blame, security jargon, and vague “出错了”. Explain what happened and the next safe action.

| Element | Copy |
|---------|------|
| Login heading | 欢迎回来 |
| Login supporting copy | 登录后继续查看家里的安排。 |
| Login primary CTA | 登录 |
| Register heading | 创建你的账户 |
| Register primary CTA | 创建账户 |
| Verify pending heading | 去邮箱完成验证 |
| Verify pending body | 我们已向 `{email}` 发送验证链接。打开邮件后即可继续。 |
| Resend ready | 没收到邮件？重新发送 |
| Resend countdown | `{seconds}` 秒后可重新发送 |
| Forgot-password confirmation | 如果该邮箱已注册，我们会发送一封重置邮件。 |
| Reset success heading | 密码已更新 |
| Reset success body | 为保护账户安全，所有设备都需要重新登录。 |
| Session expired | 登录已过期，请重新登录。完成后我们会带你回到刚才的位置。 |
| Offline heading | 暂时无法连接 |
| Offline body | 你的登录状态仍保留。连接网络后重试即可。 |
| Generic API error | 这次没有完成。请检查网络后重试。 |
| Invalid credentials | 邮箱或密码不正确，请重新输入。 |
| Nickname saved | 昵称已更新。 |

Destructive/session confirmation: ordinary current-device logout uses “退出这台设备？” with “退出登录” and “取消”. Password reset does not ask whether to retain sessions; all sessions are revoked by contract.

## Loading, Empty, and Error Behavior

- **Initial load:** branded splash, no skeleton auth form.
- **Submit:** button-local spinner plus stable label; fields remain visible but cannot resubmit.
- **Offline before auth resolution:** dedicated offline waiting state, not login.
- **Unexpected API failure:** retain all non-secret form values, focus the error summary on Web, and announce it to screen readers.
- **Rate limit:** display a retry time if supplied; keep resend button disabled until both local countdown and server eligibility permit.
- **Email privacy:** login and password-recovery errors must not disclose account existence beyond what the successful flow necessarily reveals.

## Accessibility Contract

- Meet WCAG 2.2 AA: normal text contrast ≥4.5:1; large text ≥3:1; non-text controls and focus indicators ≥3:1.
- Touch targets are at least 48×48px. Icon-only controls require visible or screen-reader labels.
- Every input has a persistent programmatic label, input purpose/autocomplete metadata, error association, and correct keyboard type.
- Errors and successes are announced through platform live-region/accessibility APIs and never rely on color alone.
- Web focus indicators are always visible for keyboard users. Focus moves to the first invalid field after submit and to the status heading after deep-link resolution.
- Support text scaling to 200% without clipping primary actions, error copy, or email addresses.
- Password reveal does not move focus and announces its new action label.
- Respect reduced motion and forced colors. Abstract color fields are decorative and hidden from assistive technology.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable |
| Third-party registries | None | No registry code may be introduced in this phase |

All UI is built from React Native primitives, Restyle-owned theme tokens, and individually imported Lucide icons. Do not use dynamic wildcard icon imports because they increase bundle size.

## Verification Matrix

| Contract | Verification |
|----------|--------------|
| Token-only styling | Static search rejects raw hex, spacing, radius, and font-size literals outside theme files |
| Cross-platform states | Component tests cover rest, focus, invalid, disabled, loading and success states |
| Responsive auth shell | Visual checks at 320px, 390px, 768px and 1440px widths |
| Keyboard and safe area | Android/iOS device checks with keyboard open and text scaling enabled |
| Deep-link outcomes | Automated flows cover success, expired, used and invalid links |
| Session distinctions | Tests distinguish offline, expired, revoked and authenticated restoration |
| Accessibility | Automated Web checks plus manual screen-reader and keyboard smoke test |
| Contrast | Palette tokens checked against WCAG AA thresholds in design-system tests |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-08-01
