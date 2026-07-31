# Feature Research

**Domain:** Family calendar, task and note collaboration  
**Researched:** 2026-07-31  
**Confidence:** HIGH for table stakes; MEDIUM for differentiation

## Feature Landscape

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Account lifecycle | Users need signup, verification, login, reset and logout | MEDIUM | Email/password is sufficient for v1 |
| Shared household | Collaboration requires a stable shared scope | MEDIUM | A user may belong to multiple households |
| Invitations and roles | Families need controlled membership | MEDIUM | Owner/admin/member with transactional ownership rules |
| Shared calendar CRUD | The primary shared planning surface | HIGH | Date ranges, all-day events, time zones and mobile views |
| Shared task CRUD | Household work needs clear responsibility | MEDIUM | Status, priority, due date and a single assignee |
| Shared notes | Low-friction household context | LOW | Plain text/Markdown can precede rich text |
| Labels and filters | Users need lightweight organization | LOW | Household-scoped and reusable across events/tasks |
| Permission enforcement | Private household data must remain isolated | HIGH | Every server query is scoped by household and membership |
| Responsive mobile UX | Phone-first product must support quick capture | MEDIUM | Add/edit actions should be reachable with one hand |

Google Calendar exposes explicit sharing permission levels, while Todoist family collaboration centers on invitations, a single responsible assignee, comments/context and completion. These support role-aware sharing and single-assignee tasks as familiar defaults.

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Unified family “Today” view | Events and assigned/overdue tasks appear in one glance | MEDIUM | Strong alignment with the core value |
| Frictionless quick add | Add event/task with minimal fields, enrich later | MEDIUM | Measure time-to-capture |
| Family workload view | Makes responsibility visible without enterprise complexity | MEDIUM | Defer until basic assignment behavior is validated |
| Contextual notes | Attach household context to events/tasks without full chat | MEDIUM | Avoid turning notes into a messaging system |
| Cross-platform deep links | Invitations and shared items open directly in app or Web | MEDIUM | Plan route scheme early |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time updates everywhere | Feels modern | WebSocket lifecycle, conflict handling and battery cost before value is proven | Query invalidation plus targeted refresh; add realtime to proven flows |
| Multi-assignee tasks | Appears collaborative | Responsibility becomes ambiguous | One responsible assignee; split work into subtasks later |
| Full chat | Keeps family context together | Creates a second product with search, moderation and notification complexity | Comments or contextual notes after core validation |
| Rich recurring rules in initial slice | Calendars are expected to repeat | Editing one occurrence vs series and time zones are deceptively complex | Deliver non-recurring events first, add RFC-aligned recurrence deliberately |
| Deep system-calendar sync | Avoids duplicate calendars | Two-way sync, permission, identity and conflict semantics are high risk | Export/share or one-way integration after v1 |

## Feature Dependencies

```text
Account lifecycle
  -> household creation/invitations
     -> membership and roles
        -> household-scoped events/tasks/notes/labels

Versioned API + generated client
  -> all client feature slices

Design system + navigation shell
  -> consistent mobile feature screens

Core event model
  -> recurrence
  -> reminders/notifications
  -> external calendar integration
```

### Dependency Notes

- Household resources require authentication plus membership authorization.
- Invitations require verified email and stable deep-link routing.
- Notifications require stable event/task semantics and device registration.
- Recurrence must be modeled before notifications depend on occurrence instances.

## MVP Definition

### Launch With (v1)

- [ ] Email/password account lifecycle.
- [ ] Create, switch and manage households.
- [ ] Invite and manage members with owner/admin/member roles.
- [ ] Shared non-recurring events with date range and all-day support.
- [ ] Shared tasks with status, priority, due date and one assignee.
- [ ] Shared notes.
- [ ] Household labels and filters.
- [ ] Mobile-first Today, calendar, task and household screens.
- [ ] Auxiliary Web coverage for the same core workflows.

### Add After Validation (v1.x)

- [ ] Push notifications — add when event/task reminders are specified.
- [ ] Comments/activity history — add when families need accountability/context.
- [ ] Recurring events/tasks — add with explicit series-edit semantics.
- [ ] Offline read cache — add when field usage demonstrates unstable connectivity.

### Future Consideration (v2+)

- [ ] Apple/Google login.
- [ ] System calendar synchronization.
- [ ] Home-screen widgets.
- [ ] Full offline writes with conflict resolution.
- [ ] Attachments and rich notes.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Account + household onboarding | HIGH | MEDIUM | P1 |
| Shared calendar | HIGH | HIGH | P1 |
| Shared tasks | HIGH | MEDIUM | P1 |
| Notes and labels | MEDIUM | LOW | P1 |
| Today view | HIGH | MEDIUM | P1 |
| Push notifications | HIGH | HIGH | P2 |
| Recurrence | HIGH | HIGH | P2 |
| Activity/comments | MEDIUM | MEDIUM | P2 |
| System calendar sync | MEDIUM | HIGH | P3 |

## Competitor Pattern Analysis

| Pattern | Google Calendar | Todoist | Muchakucha Zwei Approach |
|---------|-----------------|---------|--------------------------|
| Sharing | Permission levels per shared calendar | Invite collaborators to shared projects | Household roles plus server-enforced isolation |
| Responsibility | Event organizers/attendees | Single task assignee | Single responsible task assignee |
| Views | Calendar-centric | List/board/calendar; mobile view is denser over fewer days | Mobile Today/agenda first, richer Web month view |
| Reminders | Calendar notifications | Per-task and assigned reminders | Defer until core dates and assignment are stable |

## Sources

- https://support.google.com/calendar/answer/37082 — calendar sharing and permission patterns
- https://www.todoist.com/help/articles/collaborate-with-friends-or-family-in-todoist-tzkGUy — family task collaboration
- https://www.todoist.com/help/articles/customize-views-in-todoist-AoHhBxFdZ — mobile versus desktop calendar views
- https://www.todoist.com/help/articles/introduction-to-reminders-9PezfU — reminders and collaborator assignment
- https://www.rfc-editor.org/info/rfc5545/ — recurrence semantics

---
*Feature research for: Muchakucha Zwei*
*Researched: 2026-07-31*

