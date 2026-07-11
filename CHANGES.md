# Changes

## 2026-07-11 — "View dismissed" panel on Schedule page; stale events purged after 2 weeks

`ScheduleWidget`'s dismiss state (`sw-dismissed`) is now exposed via exported `isDismissed`/`dismissEvent`/`restoreEvent`/`subscribeDismissed` functions instead of being fully module-private, so other components can read and mutate it in sync. The Schedule page header gained a "Dismissed" button (with a live count) opening a panel of every dismissed event across all `ScheduleWidget` instances — each entry opens the universal `EventPopup` or can be "Restore"d back into view via `restoreEvent`, which notifies all mounted `ScheduleWidget`s through the new subscriber list so they immediately show it again. Server-side, `api/schedule.js`'s `pending-events` GET now opportunistically (5% of calls, to avoid a delete query on every 15s poll from four different widgets) purges `declined`/`rescheduled` rows older than 2 weeks via `purgeStaleEvents`, along with their linked AI conversations — these are exactly the events dismiss buttons hide and that never reached `accepted`. Potential bugs: the purge is keyed off event status/age only, not the dismiss action itself, so an old declined/rescheduled event is deleted from the DB even if a user never dismissed it (and conversely a dismissed-but-still-`pending` event is never auto-purged, intentionally — it may still be live for other invitees); the 5% sampling means deletion timing is fuzzy, not exactly "2 weeks".

## 2026-07-11 — Pending-event tiles capped at 6 with "See more"; delete + hover-dismiss added

`PendingEventsWidget` now shows at most 6 tiles at a time (sorted by soonest), with a "See more (N)" / "Show less" toggle for the rest, and each tile gets a hover-only ✕ that dismisses it locally (`pe-dismissed` in localStorage, same pattern as `sw-dismissed` — hides the tile from this widget only, doesn't touch the event). `EventPopup` gained a "Delete event" button (creator/organizer only) with an inline confirm step; confirming calls the new creator-only `delete-event` op in `api/schedule.js` for Loop events (cancels any already-confirmed Google copy with `sendUpdates=all`, deletes linked AI conversations, then removes the row) or the new `deleteCalendarEvent` util (`DELETE …?sendUpdates=all`) for Google-sourced events. Potential bugs: a dismissed pending tile stays hidden forever even if the event's status later changes (e.g. reschedule creates fresh activity) since dismissal is keyed by event id with no expiry or pruning; deleting a Loop event doesn't currently notify invitees beyond the row disappearing (no explicit cancellation notice is pushed to their notification center, unlike Google's email).

## 2026-07-11 — Universal event popup everywhere; dashboard assistant replaced by "In the Works" tiles

All event interaction now goes through a new universal `EventPopup` (event name + date/time header, participants color-coded blue host / green accepted / yellow pending / grey declined, extra details, nested Scheduling Assistant popup, and click-any-field editing where confirming sends updated invites — Loop events via the new creator-only `update-event` op that wipes acceptances/declines back to `pending` and cancels any confirmed Google copy, Google events via `PATCH …?sendUpdates=all`), opened from Today's Schedule, the calendar week view, the notification center, the Schedule page's Upcoming Events, and the dashboard's new `PendingEventsWidget` tile-cards of pending/rescheduling events, which replaces the AISummary widget on the dashboard (the assistant now lives only in popups). Potential bugs: an invitee who ✕-dismissed an invite card won't see the re-issued invite after an edit because `sw-dismissed` localStorage keys by event id; editing a Google event you don't organize is blocked client-side only (`organizer.self`), and the app-copy of a confirmed Loop event opened from Google surfaces edits Google-side without touching the Loop row.

## 2026-07-11 — Equal dashboard thirds, "This doesn't work for me" invite flow, frozen rescheduling invites

The dashboard grid is now always three equal columns stretched to end at the same point (Calendar/Friends fill their column via `flex:1; height:0` so their lists scroll instead of driving row height); an invite's Decline/Reschedule buttons are merged into "This doesn't work for me.", which expands to "Reschedule?"/"Decline." — Reschedule opens a chat-style popup asking "Are there any other constraints or preferred times for this event?" and the reply is sent as a `note` on the reschedule request, which lands in the creator's Scheduling Assistant seed message. Rescheduling events now stay visible to all invitees as grayed-out cards reading "Pending: Event is being rescheduled." with no actions, and `api/schedule respond` returns 409 for any response to a `rescheduled` event. Potential bugs: below-768px-wide viewports above the mobile breakpoint squeeze three columns hard (no 2-column fallback anymore), the grayed card never auto-dismisses (manual ✕ only) and lingers until the creator books a replacement, and the constraint note is only persisted inside the creator's AI conversation (capped at 500 chars), not on the event row.

## 2026-07-10 — Group "Schedule" opens an in-place AI chat popup

A group card's "Schedule" now opens a popup (reusing the `gw-modal-backdrop` pattern) containing the Scheduling Assistant in a new group mode: `AISummary` accepts `group`/`onClose` props, opens straight into a chat headed by a banner showing the group name with the member names beneath it in smaller type, greets with "What type of event would you like me to schedule?", and sends `groupId` with every message; `api/ai.js op:'chat'` resolves that group's accepted members server-side (membership-guarded, ambiguous-FK-safe batch resolve), injects them into the system prompt as mandatory participants, and widens availability-lookup/plan validation to group members even when they aren't the requester's friends — the old sessionStorage `ais-group-seed`/`ais-seed`-event handoff and the event-name field were removed. Potential bugs: the group context lives only in the per-turn `groupId` (not persisted on the conversation), so reopening a group-started chat later from the dashboard assistant list degrades it to a normal friends-roster chat, and the greeting bubble is client-side only so it won't reappear in reopened history.

## 2026-07-10 — Dashboard: widgets no longer stretch, no login auto-scroll

The dashboard grid was stretching every column to the height of the tallest (the Schedule + 840px Assistant stack), so "Today's Schedule" and "Friends" ballooned; `.dashboard-grid` now sets `align-items: start` and both widgets carry `min-height: 400px; max-height: calc(100vh - 140px)` with `min-height: 0` on their inner scroll lists (`.events-list`, `.fw-list`), so each widget is bounded and scrolls internally instead of expanding. Login no longer jumps down the page: `Dashboard` resets `window.scrollTo(0, 0)` and sets `history.scrollRestoration = 'manual'` on mount, and the Scheduling Assistant's chat auto-scroll now moves its own message list (`bodyRef.scrollTop = scrollHeight`) instead of `scrollIntoView`, which previously scrolled the whole window. Potential bugs: `calc(100vh - 140px)` assumes the current header/padding footprint (a much taller header would clip), and the global `scrollRestoration = 'manual'` set from the dashboard persists for other routes in the session (intended, but it disables browser scroll-restore app-wide).

## 2026-07-10 — Group scheduling: hand off to the assistant + "With a group" widget option

A group card's "Schedule" now hands off to the Scheduling Assistant instead of driving the Schedule! widget: `GroupsWidget.handleSchedule` writes an `ais-group-seed` (group name + member display names) to sessionStorage, navigates to `/dashboard`, and dispatches a window `ais-seed` event; `AISummary` consumes the seed (on mount for cross-page navigation, or via the event when already mounted), opening a fresh chat with the composer pre-loaded with the member list and a new event-name field, whose first send composes `Schedule "<name>" with <members>. Please find times…`. Separately, the Schedule! widget's start screen gains a fourth "With a group" option that lists the user's groups (`/api/groups?op=list`) and, on pick, preselects that group's accepted members (minus self) and drops into the normal "With a friend" friend-select → timing flow; the now-obsolete `sw-group-preset` sessionStorage handoff and its widget effect were removed. Potential bugs: the seed carries member *names* (the chat resolves participants by name against the friend roster), so a group member who isn't in the user's friend list won't be resolved to an invite; and the "With a group" friend screen only renders friends, so a group member who isn't a current friend stays selected but invisible/uncheckable there.

## 2026-07-10 — Dashboard widget UX: clickable Today's Schedule, merged Find-a-time, group quick-schedule

`CalendarComponent` ("Today's Schedule") header is now a clickable link to `/calendar` (refresh button stops propagation), and `.event-description` is clamped to 2 lines (`-webkit-line-clamp`) so a long event description can no longer stretch the widget. In `ScheduleWidget` the timing step's separate "Find a time" (calendar free/busy search) and "Ask AI" buttons are merged into one "Find a time" button that opens the AI scheduling flow (`ai-ask`); the now-unused `FindTimeScreen`/`ProposedScreen`/`NoTimeScreen` and the `search`/`hours`/`times` state were removed (the `/api/schedule` `find-times` op and its `findFreeSlots` unit tests remain but have no UI caller now). A group's "Schedule" action now lands directly on that AI find-a-time screen with all accepted members pre-invited (group-preset effect switched from `timing` to `ai-ask`). Potential bugs: the `find-times` API op is now dead UI-wise (safe to prune later); the clamp uses the WebKit line-clamp box model (universally supported in evergreen browsers but ignored by very old ones, degrading to full text).

## 2026-07-10 — Event-driven profile refresh, partial declines, AI-assisted reschedule

Invitees now get Accept / Decline / Reschedule: a decline only cancels the event when the decliner was the last invitee — otherwise they're removed from the event (and its participant list) while everyone else carries on, with the creator still notified via the declines array; a reschedule request parks the event as `status:'rescheduled'` (run `db/migrations/008_reschedule_requests.sql`), notifies the creator in the widget + notification center, and reopens (or creates) the creator's Scheduling Assistant conversation with a context note so the AI can propose replacement times. Haiku profile refresh is now event-driven instead of time-driven: the profile pipeline moved to a shared `api/_profiles.js` module (with `callModel`/`extractJson` lifted into `api/_lib.js`), a profile is built once on first login (`op:'build-profile'` now only creates when missing, never rewrites on later logins), and `create-event` calls `refreshProfileIfStale` for every participant — a no-op unless that user's profile is over a week old, so at most one Haiku rebuild happens per user per week no matter how many events are scheduled. The Sonnet scheduler still reads live calendars separately for conflict avoidance. Potential bugs: WeekView/lists now key visibility solely on status (partial declines keep events visible by design); the reschedule note lands in the creator's chat but the AI only acts when the creator next sends a message; a participant refresh runs synchronously inside create-event, adding one Haiku round-trip on the (weekly) occasions a profile is stale.

## 2026-07-06 — Scheduling Assistant: persistent chats, per-participant calendar inference

The AI assistant is now conversation-based: chats persist server-side in a new `ai_conversations` table (run `db/migrations/007_ai_conversations.sql`), one per pending event — the widget lists open chats, lets you resume or delete them, and the server auto-deletes a chat once its booked event is confirmed or declined; the Sonnet chat can now request any named friends' real free/busy + full profiles mid-turn (`check_availability` action loop, ≤2 lookups) so proposals rest on every participant's calendar, and both scheduler prompts share explicit rules about sleep hours, unlisted weekday work/school commitments, and offering distinct time/location pairs, while the Haiku profiler gains `awake_hours`/`weekday_pattern` keys (profile refresh cadence was reworked on 2026-07-10 — see the entry above). AI plan titles/locations now persist onto `pending_events` and flow into the confirmed Google Calendar event. Potential bugs: availability lookups are not persisted so a resumed chat may propose from stale knowledge until the model re-requests; on an unmigrated DB `op:'chat'` fails with a migration hint (the rest degrades gracefully); booked-card matching after reload keys on exact plan `start` strings.

## 2026-07-06 — Calendar dedupe, uniform event cards, decline/confirm lifecycle

`api/schedule.js` now saves the Google Calendar event id on confirmation (run `db/migrations/006_pending_events_google_event_id.sql`) so `WeekView` can hide the Google copy of a confirmed event instead of showing it twice (legacy rows without an id fall back to matching start time + "Hangout!" summary), and a decline now sets the whole event to `status: 'declined'`, removing it from every participant's calendar, upcoming list, and invites while keeping the creator's decline notification. WeekView renders all sources as one uniform brand-styled card sorted chronologically — pending events are marked with a dashed edge and yellow "Pending" badge, and newly confirmed events get a one-session accent-ring highlight plus "Just confirmed" badge (seen ids in localStorage `wv-confirmed-seen`); week navigation also now fetches the viewed week instead of always the current one. Potential bugs: the legacy time+summary dedupe could hide a genuinely different Google event titled "… Hangout!" at the exact same start time, `wv-confirmed-seen` is never pruned so it grows slowly, and the "newly confirmed" highlight is per-browser.

## 2026-07-06 — Cross-device sync for notification seen/deleted state

New `notification_state` table (run `db/migrations/005_notification_state.sql`) stores each user's seen and dismissed notification ids. `api/user.js` gains `GET op=notification-state` (returns `{ seen[], dismissed[] }`, empty arrays if unmigrated — graceful degrade) and `POST op=notification-state` (full-state upsert, last write wins). `NotificationCenter` pulls server state on mount and union-merges with localStorage, then pushes the full merged state on every change (debounced 800 ms, fire-and-forget), gated so a pre-merge subset can never overwrite another device's state. Pruning still converges both sides to live notification ids. Potential bug: two devices open simultaneously use last-write-wins on the whole array — a delete on device A within the same debounce window as activity on device B can be resurrected until the next poll re-converges.

## 2026-07-06 — Notification center: delete, unseen-count badge, color semantics

`NotificationCenter.js/css` reworked. Every notification now has a stable id and a hover ✕ to delete it (persisted in localStorage `nc-dismissed`, so deletions survive reloads and re-polls). The bell badge now counts **unseen** notifications — opening the panel marks visible items as seen (localStorage `nc-seen`) — instead of only counting invites. Colors corrected: green = confirmed ("X confirmed" / "All confirmed", was pink for the latter), yellow (`#EAB308`) = pending event and group invites (was orange), red = declined (unchanged). Seen/dismissed sets are pruned to live notification ids after each successful fetch, gated by a first-fetch flag so an empty pre-fetch state can't wipe them. Potential bug: seen/dismissed state is per-browser (localStorage), so the badge count and deletions don't sync across a user's devices.

## 2026-07-06 — Codebase refactor: consistency, dedupe, tests, docs, bug fixes

**Bug fixes found during review:**
- `sendDm()` (`messageCrypto.js`) was calling `op=get-key` with `{googleId, toUserId}` but `api/messages.js` implements `op=public-key` and expects `{senderGoogleId, receiverId}` — every group-invite DM silently failed. Fixed both, added sender public-key upload (recipients couldn't decrypt if the sender had never opened Messages), and made send failures throw.
- `extractJson()` (`api/ai.js`) terminated brace-matching on `}`/`]` inside JSON string values, returning null for AI replies containing braces in text. Now string/escape-aware; caught by the new unit tests.
- `api/groups.js` `update`/`remove-member`/`touch`/`invite` never verified the requester belonged to the group — any known groupId could be mutated. All four now require accepted membership (`isAcceptedMember`).

**Deduplication:**
- New `api/_lib.js`: shared `db()` (was copied in 6 routers), `safeDecrypt` (2 copies), `resolveUser`.
- New `src/utils/googleAuth.js`: single GIS sign-in flow (`initGisClient` + `completeGoogleSignIn`) replacing near-identical code in `Login.js`, `SignInModal.js`, and `AuthContext.js`; the OAuth scope string now exists once.
- New `src/utils/format.js`: shared `formatEventTime`/`formatDuration` (were duplicated in ScheduleWidget + SchedulePage) and `formatMsgTime`/`hasGapBefore`/`isGroupedMsg` (were duplicated in MessagesPanel + GroupChatPanel).

**Consistency:**
- `ProfilePage` now reads via new `GET /api/user?op=profile` instead of querying Supabase directly with the anon key; `src/utils/supabaseClient.js` deleted — all data access goes through `/api/`, and `REACT_APP_SUPABASE_ANON_KEY` is no longer needed.
- Removed unused `op=get-profile` from `api/ai.js` (no caller).

**Project management:**
- Added `.gitignore` (repo previously had none — `.env` was committable) and removed `.DS_Store` files.
- New `db/migrations/` with numbered idempotent SQL (`001_groups`, `002_pending_events`, `003_user_profiles`, `004_messages_edited_at`) + `db/README.md` documenting the full schema; root `supabase_groups_migration.sql` moved to `001`.
- `src/components/CHANGES_NOTES.md` and `src/pages/CHANGES_NOTES.md` merged into this file and deleted.
- `package.json`: renamed `react-hello-world` → `loop`, added description and `test:ci` script.
- README rewritten to match reality (Supabase/AI/messaging/groups, full env-var table, testing, accurate limitations); CLAUDE.md expanded with commands, repo map, conventions, and gotchas for onboarding.

**Testing:** new `src/__tests__/` — 35 tests covering `_crypto` round-trip/tamper-detection, `extractJson`, `findFreeSlots` (overlap/spacing/daytime/window invariants), and the shared formatters. `findFreeSlots` and `extractJson` are now exported for tests. Verified: `CI=true npm run build` clean, `npm run test:ci` 35/35 green, `node --check` on all api files.

Potential bugs to watch: groups ops now 403 for non-members — if any future UI lets a *pending* member edit a group, the membership check must be relaxed; `sendDm` now throws on failure, so callers relying on silent failure (both wrapped in `Promise.allSettled`, so safe today) would need try/catch if called directly.

## 2026-06-27 — AI chatbox restored as standalone multi-turn scheduling assistant

`AISummary.js` and `AISummary.css` recreated as a proper conversational interface, now living under the calendar in Dashboard column 1. New `op:'chat'` added to `api/ai.js`: loads the user's Haiku profile, full friend list (name → UUID mapping), and user's own busy windows into the system context, then calls Sonnet with the full conversation history on every turn for multi-turn continuity. Sonnet returns `{ reply, plans? }` where each plan carries `participantIds` (Supabase UUIDs resolved from the friend list). Plan cards inside chat bubbles are clickable and call `POST /api/schedule op:create-event` directly — same path as the Schedule! widget — then confirm inline in the chat thread. The conversation remains live after booking for follow-up feedback. Potential bug: if a friend list is large (50+ friends), the system context may push token usage high; consider lazy-loading availability per friend if this becomes an issue.

## 2026-06-27 — AI scheduling merged into Schedule! widget

`AISummary.js` and `AISummary.css` deleted. AI scheduling is now a third path inside `ScheduleWidget.js`: after selecting friends, the timing screen offers "Ask AI" which takes a natural-language request, calls `POST /api/ai op:schedule` with the selected friends as `participantIds` (Supabase UUIDs), and renders Sonnet's returned plans as clickable `sw-time-opt` cards identical to calendar-based suggestions. Clicking a plan calls the existing `choose()` → `POST /api/schedule op:create-event` → invites sent + added to Google Calendar. `api/ai.js` updated: `schedule` op now accepts `participantIds` (Supabase UUIDs) via new `resolveUsersByIds()` helper, replacing the previous `participantGoogleIds`. `Dashboard.js` simplified — column 2 is ScheduleWidget alone. Potential bug: if Sonnet returns `clarification_needed`, it surfaces as an error banner and returns to the AI ask screen rather than a true conversational reply.

## 2026-06-27 — Two-model scheduling apparatus (replaces AI summary chat)

Replaced the single Haiku chat in `api/ai.js` with a two-model framework. **Stage 1 (Haiku, `op:'build-profile'`)** distills a user's calendar history + stated notes into a structured, persisted scheduling profile (`{ tags, hard_constraints, soft_constraints, inferred_rhythm }`). **Stage 2 (Sonnet, `op:'schedule'`)** combines every participant's profile + real free/busy windows + the natural-language request into candidate event plans. Shared plumbing (model calls, JSON extraction, profile persistence, signal/availability gathering) lives in `api/_ai.js`. The actual prompts are left blank — search `INSERT PROMPT HERE`. `AISummary.js` is now the "Scheduling Assistant": invisible profile refresh on mount, requests render plan cards. Potential bugs: (1) requires a new `user_profiles` table — run the migration in the `api/ai.js` header before use; (2) until the two prompts are authored, `schedule` returns empty `plans`; (3) multi-participant scheduling needs a UI picker — API supports `participantGoogleIds` but the front end currently passes `[]` (self only).

## 2026-06-27 — Groups widget visibility fix + invite-in-widget

**`api/groups.js` `list` op:** Groups were never appearing in the widget because the PostgREST embed `group_members(... users(...))` is ambiguous when `group_members` has two FKs to `users` (`user_id` + `invited_by`) — the same silent-null bug fixed earlier in `pending-invites`. Fixed by fetching `group_members(user_id, status)` without the users embed, then resolving all member names/pics in a separate batch query via `.in('id', allMemberIds)`. The `list` op now also includes pending-invite groups (not just accepted), so invited users see the group immediately.

**`GroupsWidget.js`:** Pending invites render inline with an amber "Invited" badge and Join/Decline buttons. Accepting/declining via `respondToInvite()` calls `/api/groups?op=respond` and reloads. Potential bug: `loadGroups` catches errors silently — if the API returns a non-OK status, no error is surfaced to the user.


## 2026-06-25 — Global notification bell, Groups feature, WeekView pending events

**Notification center removed from SchedulePage, moved to global bell:** `NotificationCenter` component (fixed top-right, `z-index: 900`) polls every 60 s for schedule activity AND pending group invites. Badge shows total actionable count. Group invites show Join/Decline buttons inline. CSS: `NotificationCenter.css`.

**Groups feature:** Full CRUD for social groups. Run `supabase_groups_migration.sql` in the Supabase SQL editor to create `groups`, `group_members`, `group_messages` tables. API: `api/groups.js` with ops: list, create, respond, invite, remove-member, update, delete, touch, send-message, messages, pending-invites. Widget on SchedulePage col 2: create form with color picker + icon upload, member avatar cluster, click to expand Schedule/Message/Edit actions, edit modal with rename/description/add-remove members/delete. Inviting members auto-sends an encrypted DM via `sendDm()` utility in `messageCrypto.js`.

**Group chat:** `GroupChatPanel` (fixed bottom-right, offset from MessagesPanel), `GroupChatContext` tracks open chat. Messages server-side AES-256-GCM encrypted (not E2E — group key distribution is unsupported). Wired into App.js via `GroupChatProvider`. Caveat: group icons are stored as base64 data URLs in `groups.icon_url` — large images will exceed Supabase row size limits; migrate to Supabase Storage before production.

**ScheduleWidget group preset:** Clicking "Schedule" in GroupsWidget stores member IDs in `sessionStorage['sw-group-preset']`, navigates to `/schedule`. ScheduleWidget reads and clears it on mount, skipping to the timing screen with group members pre-selected.

**WeekView pending events:** Fetches `/api/schedule?op=pending-events` alongside Google Calendar events. Pending events render with a dashed amber border; confirmed Loop events with a solid green border. Neither blocks Google Calendar events from showing.

**SchedulePage layout:** 3-column grid now: ScheduleWidget | GroupsWidget | UpcomingEvents (condensed to 2 items + "View events log" expand button). Old NotificationLog removed.



## 2026-06-25 — Home button, message toast, sign-out closes messages, notification log cap

**Home button:** Added a `<Link to="/dashboard">` with a `Home` icon (lucide-react) to the top-left of every page header (CalendarPage, TodosPage, FriendsPage, ProfilePage, SchedulePage). Styles live in `PageLayout.css` as `.home-btn`.

**Message toast:** New `MessageToast` component polls `/api/messages?op=conversations` every 15 s in the background. When a conversation's `lastMessageAt` advances and that conversation is not currently open in the panel, a 20-second slide-up toast appears bottom-right. Clicking the toast opens the panel to that conversation. Rendered globally in `App.js`.

**Sign-out closes messages:** `MessagesPanel` now watches `isAuthenticated` from `AuthContext`; if it becomes `false` while the panel is open, `closeMessages()` is called automatically.

**Notification log cap:** `SchedulePage` notification log now shows at most 20 entries (most recent first). Extra entries are silently omitted.



## 2026-06-23 — Email encryption at rest

Emails are now encrypted before being written to `users.email` using the existing AES-256-GCM scheme (`TOKEN_ENCRYPTION_KEY`). Every read path decrypts before returning: GCal attendee list (`api/schedule.js`), and the friends/requests payloads (`api/friends.js`). A `safeDecrypt` fallback handles any rows written before this change — if the value doesn't match the encrypted format it is returned as-is, so existing users are unaffected until their next login re-encrypts the column.

## 2026-06-23 — Fix: messages not loading (edited_at column missing)

Adding `edited_at` to the `conversation` SELECT broke all message loading for databases where the migration `ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ` had not been run. The SELECT returned a Supabase error; `fetchMessages` hit `if (!res.ok) return` and silently bailed every poll, so no messages ever appeared. Reverted the SELECT to `id, sender_id, ciphertext, iv, created_at`. The "· edited" label still works for messages edited in the current session via `local_edited` state.

Note on [encrypted] messages: if either user's `ecdhKeyPair` is cleared from localStorage (browser data wipe, new device), a fresh ECDH keypair is generated and uploaded to Supabase, rotating the shared key. All prior messages become permanently unreadable — this is an inherent limitation of client-side E2E encryption with localStorage key storage. Do not clear browser data to preserve message history.

## 2026-06-23 — Unauthenticated home screen + sign-in prompt

`/dashboard` (and `/`) is now publicly accessible without signing in. Unauthenticated visitors see the full dashboard layout with three greyed placeholder cards. A "Sign in" button is shown in the header. After 30 seconds, a modal with the Google OAuth button auto-appears. Signing in via the modal calls `login()` in AuthContext and the dashboard re-renders immediately with full content — no page reload or redirect needed. All other protected routes (`/calendar`, `/schedule`, etc.) still redirect to `/login` as before.

## 2026-06-23 — Notification dismiss fix (module-level singleton)

Replaced per-instance React state for dismissed notifications with a module-level `_dismissed` Set initialized from `sessionStorage` once at module load. All `ScheduleWidget` instances share the same Set — dismissals on the dashboard are immediately reflected on the Schedule page and vice versa, and they survive component re-mounts (navigation) without any synchronization logic. A version counter (`setDismissVersion`) forces re-renders when the Set changes.

## 2026-06-23 — Auto-clearing dismissible widget notifications (updated)

All notification types (invite, decline, confirmed-green) auto-clear after 60 s and can be manually dismissed via a hover-reveal ✕ button. Dismissed IDs are now written to `sessionStorage` under the key `sw-dismissed` so they survive navigation and component re-mounts — both the dashboard widget and the Schedule page widget read from and write to the same key, keeping them in sync. Notifications dismissed in either place stay gone for the rest of the browser session.

## 2026-06-23 — Schedule page, widget improvements, footer

**Schedule page (`/schedule`):** New page with 3 panels — the full Schedule! widget, an Upcoming Events list (future events sorted by time, showing duration and confirmed/pending status), and a Notification Log (activity feed: declines, acceptances, confirmations, invites received). Accessible via sidebar "Schedule" nav item (CalendarCheck icon) and by clicking the "Schedule!" title on the dashboard widget.

**Widget title navigation:** Clicking "Schedule!" in the widget header navigates to `/schedule` when on the dashboard. Title is not clickable when already on the schedule page.

**Future-only events:** `PickTimeScreen` now validates that the selected datetime is in the future. Selecting today restricts the time input minimum to the current hour:minute. Submitting a past time shows an inline error rather than silently sending to the API.

**Duration in all notifications:** `formatDuration` added. Duration is shown in `NotifCard` (invite cards), decline notifications, and all-confirmed banners, and throughout the Schedule page panels.

**Footer:** Global `<Footer>` rendered at the app level on every page. Shows "Copyright 2026 Danish Pastry House is a Front." and a "Privacy Policy" link to `/privacy`, which is currently a blank page.

## 2026-06-23 — Enter key, shared GCal events, decline notifications

**Enter key on all text inputs:** `FindTimeScreen` (hours), `PickTimeScreen` (date + time), and `ProfilePage` (display name, phone) now submit on Enter. `FriendsPage` friend-code input already had this.

**Shared Google Calendar event:** `createGCalEvent` now accepts an `attendeeEmails` array and creates a single event with all participants as attendees. The event is created on the organizer's calendar when **all** invited users accept; Google delivers invitations to each attendee automatically. Previously, separate events were created on each user's calendar individually.

**Decline notifications:** Declining an event no longer sets `status: 'declined'` on the whole row. Instead a `declines UUID[]` column tracks which users declined. The organizer sees an amber notification card in the widget: "[Name] declined · [time]". The invited user who declined no longer sees the event in their invite list. The event stays open for other invitees.

**Required Supabase migration:**
```sql
ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS declines UUID[] NOT NULL DEFAULT '{}';
```

## 2026-06-23 — Messages popup fixed-height + ScheduleWidget error handling + notif polling

**Messages popup:** `.mp-panel` now uses `height: min(520px, calc(100vh - 32px))` instead of only `max-height`, so the panel renders at full size immediately on open rather than starting small and expanding as content loads.

**ScheduleWidget — error surfacing:** `choose()` no longer silently resets to `start` on API failure. It now captures the server error message and displays it as an inline error banner above the widget body. The user stays on the current screen and can retry or dismiss the banner. `reset()` and the back button both clear the error.

**ScheduleWidget — invite polling:** Added a 15-second `setInterval` on `loadNotifs` so invited users see incoming event invites in their widget without needing to reload the page. Previously, the invited user's notif list was only fetched once on mount.

## 2026-06-23 — Schedule! widget

Replaced the To-do list widget on the Dashboard with a new **Schedule!** widget (`ScheduleWidget.js/css`). The widget has a multi-screen flow:

- **Start:** three options — Event / With a friend / Other. Event and Other show a "not yet" stub.
- **With a friend:** multi-select friend list; arrow button (bottom-right) appears once ≥1 friend is selected.
- **Timing:** "Pick a time" (date + time inputs → creates event immediately) or "Find a time" (enter hours → calls `/api/schedule` to compare calendars).
- **Find a time:** queries Google Calendar FreeBusy API for all selected users via server-side token decryption; proposes 3 daytime slots (9 AM–6 PM preferred, any hour if needed), spaced ≥6 hours apart. If none found, offers to extend to the following week.
- **Proposed times:** user selects one → event is written to `pending_events` table.
- **Pending:** confirmation screen; invited users see the event as a notification in their own Schedule! widget with Accept / Decline.
- **All accepted:** Google Calendar events are created on every participant's primary calendar; event name is `{creatorName} Hangout!`

New `api/schedule.js` router (counts as 1 Vercel function):
- `GET ?op=pending-events` — events where user is creator or invitee, status pending/accepted
- `POST op:create-event` — write pending_event row
- `POST op:respond` — accept/decline; triggers GCal creation when all have accepted
- `POST op:find-times` — server-side FreeBusy query across all participants

**Required Supabase migration:**
```sql
CREATE TABLE pending_events (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id       UUID REFERENCES users(id),
  invited_user_ids UUID[]     NOT NULL DEFAULT '{}',
  event_time       TIMESTAMPTZ NOT NULL,
  duration_hours   FLOAT      NOT NULL DEFAULT 1,
  status           TEXT       NOT NULL DEFAULT 'pending',
  acceptances      UUID[]     NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  google_event_created BOOLEAN DEFAULT false
);
```

Potential bugs: Google Calendar tokens may be expired at find-time; expired tokens are silently skipped (that user's busy times are ignored, so proposed slots might conflict). Server-side clock drift could affect window calculations. The `pending_events` table must exist before the widget is functional.

## 2026-06-23 — Panel height, gradient removal, FriendsPage header

**Messages panel height:** `MessagesPanel.css` updated from `max-height: 500px` to `max-height: min(1500px, calc(100vh - 32px))` — roughly 3× taller while staying within the viewport.

**Gradients removed:** All `linear-gradient` declarations replaced with flat equivalents across `App.css`, `WeekView.css`, `FriendsWidget.css`, `AISummary.css`, `Sidebar.css`, `Dashboard.css`, `PageLayout.css`, and `Login.css`. Text gradient on page `h1` headings replaced with `color: #E8607A`; background gradients replaced with `#FDF5F7`; accent button gradients replaced with `#E8607A`. Potential bug: Login page background is now a flat `#E8607A` instead of a gradient — may look different on large viewports.

**FriendsPage header restyled:** Font size increased to `2rem`, weight to `700`, color set to `#E8607A`, gap updated to `20px`, and menu button now has white background + box shadow — matching the Dashboard and PageLayout header style.

## 2026-06-23 — Messages popup panel + undo send + edit + color scheme

**Messages redesign:** Removed full-page `MessagesPage` and replaced with a fixed bottom-right floating panel (`MessagesPanel`) always rendered above all pages via `App.js`. Panel is ~340×500px (≈1/8 screen) with minimize/close controls; `/messages` route now redirects to dashboard. Added `MessagesContext` so any component can call `openMessages(friend)` — used by `FriendsWidget` and `FriendsPage` popup instead of `navigate('/messages')`.

**Timestamps:** Time labels appear only at 30-second gaps between messages. Rapid messages are visually grouped with tighter spacing and no individual timestamps. First message in a conversation always shows a label.

**Undo send (30s):** Right-click any own message within 30 seconds to delete it from both ends. Server enforces the window — returns 403 after expiry. Message is hard-deleted from DB.

**Edit message (60s):** Right-click any own message within 60 seconds to edit inline. Re-encrypted with the same ECDH shared key; server stores new `payload` and sets `edited_at`. Message shows italic "· edited" note on both ends after save.

**Condensed storage:** `messageCrypto.js` now produces a single `payload` column (`ivB64.ctB64`) instead of separate `ciphertext` and `iv` columns. `decryptMessage` handles both formats for backwards compatibility.

**Required Supabase migration:**
```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payload TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
UPDATE messages SET payload = iv || '.' || ciphertext WHERE payload IS NULL;
```

**Color scheme:** Replaced indigo/purple (`#4f46e5`) brand palette with rose/pink palette across all CSS files and the favicon. New accent: `#E8607A` → hover `#C94D65` → strong `#B5365A`. Surface colors: `#FDF5F7` / `#F9EAF0`. Border: `#F3D8E4`. Text: `#1A1A1A` / `#4A4A52` / `#6B7280`. Danger: `#C0392B`.

Potential bugs: The 30s/60s windows are enforced server-side using `created_at`; clock skew between client and server could cause premature expiry errors. Existing messages in DB with legacy `ciphertext`/`iv` columns need the migration SQL above before `payload` reads will work.

## 2026-06-23 — Merge Contacts into Friends; add message shortcut on dashboard

Removed the placeholder Contacts widget and its localStorage-backed data. The dashboard now shows a single `FriendsWidget` in that slot: each friend card displays their avatar, name, and (if shared) email and phone number, with a message icon that appears on hover and navigates directly to the DM conversation. `ContactList.js/css` and `ContactsPage.js` deleted; `/contacts` route redirects to `/friends`; "Contacts" removed from sidebar. The old small `FriendsWidget` (count-only) was replaced by this expanded card list.

Potential bugs: The message icon calls `navigate('/messages', { state: { friend } })` — MessagesPage must still handle `location.state?.friend` on mount (it does), but if the friend has not yet uploaded a public key the conversation view will show the "hasn't set up messaging" error.

## 2026-06-23 — Consolidate serverless functions (14 → 5) for Vercel Hobby plan

Merged 14 individual `/api/*.js` serverless functions into 4 router files — `api/friends.js`, `api/messages.js`, `api/user.js`, `api/ai.js` — plus the existing `api/_crypto.js` utility (not a Vercel function). Each router uses `req.query.op` for GET and `req.body.op` for POST to dispatch to the appropriate handler. Updated all client-side callers in 7 files (`Login.js`, `googleCalendar.js`, `MessagesPage.js`, `FriendsPage.js`, `AISummary.js`, `FriendsWidget.js`, `ProfilePage.js`); deleted all 14 old individual files.

Potential bugs: `generate-summary.js` was deleted as dead code — if any code path still references `/api/generate-summary` it will 404. Verify Vercel re-detects the function count after next deploy (should show 4 functions, well under the 12 Hobby cap).

## 2026-05-01 — Messaging, AI chat, favicon, friends widget

E2E encrypted DMs: `messageCrypto.js` (ECDH P-256 key agreement + AES-256-GCM) — keypair generated once per browser, public key stored in Supabase. `MessagesPage` polls every 3s for new messages, decrypts locally, groups bubbles with a visual gap when >1 min between messages. `api/{send-message,get-conversation,get-conversations,get-my-id,store-public-key,get-public-key}.js` all use service role key. Navigate from friend popup passes friend via router state so the correct conversation opens directly.

Replaced AISummary with an AI chat interface (`api/ai-chat.js`) — user types any message, calendar events are lazily fetched once as system context so schedule-aware questions work. `FriendsWidget` added to dashboard showing friends list and pending request badge. Phone number input auto-formats to (XXX)XXX-XXXX as the user types. Tab favicon updated to a curvy loopy SVG "L" on brand purple; page title changed to "Loop".

Potential bugs: ECDH private key is stored unencrypted in localStorage — if the user clears localStorage they lose decryption ability for old messages. Messages page polls unconditionally; should pause polling when the tab is hidden (`document.visibilityState`).

## 2026-05-01 — Profile page + friends page enhancements

Added `display_name`, `show_email`, `phone_number` columns to `users`. New `ProfilePage` (accessible by clicking user info in sidebar) lets users set display name, toggle email visibility, and add phone number — saved via `api/update-profile.js` (service role key). New `MessagesPage` placeholder wired to `/messages`. `FriendsPage` now shows outgoing requests with "Pending" label, friend cards open a popup with display name, conditionally shown email/phone, and Tag (no-op), Message (→ /messages), and Unfriend (two-step confirm, calls `api/unfriend.js` which deletes both friendship rows) buttons. `api/get-friends-data.js` updated to run three parallel queries and return `sentRequests` plus full profile fields on friends.

Potential bugs: Profile page reads from Supabase using the anon key (read-all RLS policy) — phone numbers are visible to anyone with the anon key who queries the table directly. Consider column-level security or a dedicated read endpoint scoped to friends-only before phone becomes sensitive data.

## 2026-05-01 — Friends system

Added `friend_code` (unique 15-char string, auto-generated on INSERT via trigger, backfilled for existing users) to the `users` table; added `friend_requests` (pending/accepted/rejected lifecycle) and `friendships` (both directions stored for symmetric lookup) tables. Three serverless endpoints: `send-friend-request` (looks up user by code, creates request), `get-friends-data` (returns friend code, pending requests, confirmed friends), `respond-friend-request` (accept writes both friendship rows, reject updates status). `FriendsPage` has two sections — Requests (with Add Friend input) and Friends (with copyable friend code) — wired into sidebar and App.js routing.

Potential bugs: friend code input is normalized to uppercase client-side but codes are stored as mixed-case in the DB — the API uses `.toUpperCase()` on lookup, so codes generated with lowercase chars in `generate_friend_code` would never match. Recommend updating the charset to uppercase-only (already done: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).

## 2026-05-01 — AES-256-GCM encryption for stored access tokens

Added `api/_crypto.js` with `encrypt`/`decrypt` helpers using Node.js built-in `crypto` (AES-256-GCM, 96-bit IV, auth tag). Created `api/sync-user.js` serverless endpoint that receives user data from the client, encrypts the token server-side using `TOKEN_ENCRYPTION_KEY`, and upserts to Supabase — so the plaintext token never touches the DB and the key is server-only. Updated `Login.js` and `googleCalendar.js` to POST to `/api/sync-user` instead of writing to Supabase directly.

Potential bugs: `TOKEN_ENCRYPTION_KEY` must be added to Vercel environment variables before deploying — missing or wrong-length key throws at encrypt time and returns 500. Existing rows in the `users` table have plaintext tokens and will need a one-time re-encryption pass once users sign in again.

## 2026-05-01 — Supabase users table + login upsert

Replaced the `test` table with a `users` table that persists one row per distinct Google account: stores `google_id`, `email`, `name`, `picture_url`, `access_token`, `token_expiry`, `timezone`, and `last_seen_at` (auto-updated via trigger). Login flow in `Login.js` upserts on `google_id` so returning users refresh their token rather than create a new row; `initGoogleCalendar` in `googleCalendar.js` syncs refreshed tokens back to Supabase so the AI agent always has a current token per user. `googleUserId` is stored in localStorage on login and cleared on logout.

Potential bugs: `access_token` is stored in plaintext — should be encrypted at rest before the AI agent feature ships. The Supabase upsert in `Login.js` fires without awaiting the result in `initGoogleCalendar` (fire-and-forget), so token sync failures are silent.

## 2026-04-11 — Automatic Google token refresh

Added proactive silent token refresh to `googleCalendar.js`: tokens are now stored with an expiry timestamp, a background timer fires 5 minutes before expiry to silently re-request a new token via GIS (`requestAccessToken({ prompt: '' })`), and all API calls go through `getValidToken()` which triggers an on-demand refresh if the token is near expiry.
`AuthContext.js` re-initializes the GIS token client on page reload so the refresh mechanism survives navigation, and `clearTokenRefresh()` is called on logout to cancel any pending timer.

Potential bugs: If the user's Google session has itself expired (signed out of Google), the silent refresh will fail silently and fall back to the stale token, causing 401 errors on the next API call — a re-login prompt should be surfaced in that case.

## 2026-04-11 — AI Day Summary serverless function

Updated `api/generate-summary.js` to use `claude-sonnet-4-6`, added a cached system prompt (prompt caching via `anthropic-beta: prompt-caching-2024-07-31`) to reduce token spend on repeated calls, and improved the user message to include the current date. Updated `AISummary.js` to pass event descriptions (truncated to 120 chars) and the formatted date string to the API for richer, time-aware summaries.

Potential bugs: `REACT_APP_ANTHROPIC_API_KEY` is bundled into the frontend by CRA — the API key should be moved to a non-`REACT_APP_` env var (e.g. `ANTHROPIC_API_KEY`) so it is only accessible server-side in the Vercel function.

## 2026-04-11 — Supabase database editor page

Added `src/utils/supabaseClient.js` (returns null when env vars are absent), `src/pages/DatabasePage.js` with inline row editing/creation/deletion via the Supabase JS client, and installed `@supabase/supabase-js`. Wired `/database` route into `App.js` and added a Database nav item to `Sidebar.js`.
Potential bugs: edit/delete operations assume an `id` column as the primary key — tables with composite or differently named PKs will need the `.eq('id', ...)` calls updated; row values are always cast to strings on input, so number/boolean columns may need type coercion before insert/update.

## 2026-04-11 — Fix re-login prompt and 401 on Generate Summary

Fixed `getValidToken()` in `googleCalendar.js`: added an `if (expiry === 0) return token` guard so sessions without a stored expiry timestamp no longer fall into the silent-refresh path (which was triggering the Google sign-in dialog on every button click). Also changed the silent-refresh failure branch to resolve with the existing token instead of rejecting, so a GIS error degrades gracefully.
Updated `.env.example` to document `ANTHROPIC_API_KEY` (no `REACT_APP_` prefix) matching what `api/generate-summary.js` actually reads; the 401 from Anthropic on the deployed project requires adding `ANTHROPIC_API_KEY` to Vercel dashboard Environment Variables.
