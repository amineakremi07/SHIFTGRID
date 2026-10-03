@AGENTS.md

# 🧠 ShiftGrid — Single Source of Truth

> Consolidated from the former `passation.md` (roadmap) and `HANDOVER.md` (architecture),
> both removed 2026-09-28. Read this file first; update it at the end of every session.

---

## 🎯 What We're Building

**ShiftGrid** — a multi-tenant SaaS platform for sports court booking in Tunisia.

| Audience | What they do |
|---|---|
| **Owner (company)** | Signs up, gets verified by admin, manages courts, staff, bookings, revenue |
| **Staff** | Invited by owner, manages schedule, walk-in bookings, check-ins |
| **Player** | Browses courts publicly, books slots (authenticated or anonymous) |
| **Platform Admin** | Verifies orgs, manages licenses, sees all data across all complexes |

**Stack:** Next.js 16 App Router · React 19 · Supabase (PostgreSQL + Auth + Storage) · TypeScript (strict) · Zod · Radix UI · Tailwind CSS v4 · Resend · ClickToPay / Stripe

**Currency:** TND (Tunisian Dinar) — never EUR/USD.

---

## ⚙️ Next.js 16 — Non-Negotiables

This project runs **Next.js 16.3.4**. Several conventions differ from Next 15 and earlier:

| Rule | Detail |
|---|---|
| **`proxy.ts`, not `middleware.ts`** | The `middleware` file convention is deprecated. The root file is `proxy.ts` exporting `export async function proxy(request: NextRequest)`. Config flags renamed too (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`). |
| **Proxy is Node.js runtime only** | Not configurable, and the `edge` runtime is **not** supported in `proxy`. |
| **`NextRequest.ip` was removed** | Derive the client IP from `x-forwarded-for` / `x-real-ip`. See `getClientIp()` in `proxy.ts`. |
| **Turbopack is the default bundler** | `next build` fails outright if a `webpack` config exists without a `turbopack` config. We ship `turbopack: {}` and have **no** webpack config. Do not reintroduce one. |
| **`turbopack` is top-level** | Not `experimental.turbopack`. It moved out of `experimental` in 15.3. |
| **`cookies()` is async** | Always `await cookies()`. |
| **Read the bundled docs** | `node_modules/next/dist/docs/` is the authority for this exact version — not training data. See `AGENTS.md`. |

---

## 🏗️ Architecture Decisions

### Supabase client tiering
| File | Role |
|---|---|
| `lib/supabase/client.ts` | Browser client (`createBrowserClient`, sync) |
| `lib/supabase/server.ts` | Server client for RSC + Server Actions (`await cookies()`) |
| `lib/supabase/middleware.ts` | Proxy-layer client (`createProxyClient`) returning `{ supabase, getResponse }` |
| `lib/supabase/optimized-client.ts` | Admin **service-role** client — **bypasses RLS**, authorize manually |
| `lib/types/database.ts` | **Curated** `Database` types the clients import — literal unions for CHECK columns + trigger-derived `bookings` columns optional on Insert. Verified identical (9 tables, every column) to the generated file. |
| `lib/types/database.types.ts` | **Generated** from the live schema. Do not hand-edit; regenerate after every migration and diff against `database.ts`. |

> **Always use `supabase.auth.getUser()` server-side.** `getSession()` is deprecated in the SSR context and does not revalidate against the auth server.

### RBAC model
Roles: `platform_admin` › `org_admin` › `staff` › `player`.
Enforced in `proxy.ts`: `/dashboard/*` requires auth; `/admin/*` requires `platform_admin`.
Multi-tenant isolation via RLS helpers `public.user_org_id()` and `public.user_role()`.

### Concurrency & slot locking
- PostgreSQL **GiST exclusion constraint** on `court_slot_locks` (`tstzrange`) prevents double-booking at the engine level.
- Trigger chain: `set_booking_times → assign_court → create_court_lock`.
- A violation raises Postgres `23P01` (`exclusion_violation`) — catch it in Server Actions and surface: *"Ce créneau vient d'être réservé par un autre joueur."*

### Dual booker architecture
`bookings` enforces exactly one booker:
`(booker_profile_id IS NOT NULL AND booker_anon_id IS NULL) OR (booker_profile_id IS NULL AND booker_anon_id IS NOT NULL)`

### Sport rules (hardcoded — `lib/slot-duration.ts`)
| Sport | Duration | Max Players | Buffer |
|---|---|---|---|
| Padel | 90 min | 4 | 15 min |
| Tennis | 60 min | 2 or 4 | 15 min |
| Football | 90 min | 12 or 14 | 15 min |

---

## 🗺️ The 12-Milestone Plan

### ✅ Milestone 1 — Database Foundation & Core RLS — **COMPLETE**
7 tables (`organizations`, `courts`, `profiles`, `anonymous_bookers`, `bookings`, `payment_records`, `court_slot_locks`), GiST exclusion constraint, trigger chain, RLS helpers. Verified with a 3-concurrent-padel-court acceptance test.

### ✅ Milestone 2 — Auth Flow, Anti-Spam Verification & RBAC — **100% COMPLETE (2026-09-22)**
4-step owner signup with Leaflet map + doc upload · owner login with org status check · RBAC guards · admin verification dashboard · staff invite system (tokenized, 48h expiry, Resend email) · unified 3-tab Player Auth modal · session duration config.

### 🔄 Milestone 3 — Public Court Availability & Interactive Slot Matrix — **IN PROGRESS** (Tasks 1-7 + 9 done; Task 8 partial)

| # | Task | Status | Key File(s) |
|---|---|---|---|
| 1 | Public calendar view (no auth) | ✅ | `app/courts/page.tsx` |
| 2 | Sport duration slot calculation | ✅ | `lib/slot-duration.ts` |
| 3 | Dynamic availability resolver | ✅ | `lib/slot-resolver.ts` |
| 4 | Visual slot states (4-state) | ✅ | `components/ui/slot-state.tsx` |
| 5 | Supabase Realtime subscriptions | ✅ | `components/courts/slot-realtime.tsx` |
| 6 | Court detail page | ✅ | `app/courts/[orgId]/page.tsx` |
| 7 | Slot matrix component | ✅ | `components/courts/court-slot-grid.tsx` |
| 8 | Date navigation (week/month, keyboard, URL state) | 🔄 **Partial** — component exists, not wired | `components/courts/date-navigator.tsx` |
| 9 | Booking integration point | ✅ | `onSlotSelect` → `components/booking/player-auth-modal.tsx` |

### 🔄 Milestone 4 — Player Booking Engine (Auth + Anonymous) — **IN PROGRESS**
✅ `/courts/[orgId]` = day picker + `CourtSlotMatrix` + `BookingDrawer` (`components/booking/booking-drawer.tsx`, wired by `components/courts/club-booking-view.tsx`) · ✅ dual path: member (signed-in player of *that* club) or guest (name + Tunisian mobile) · ✅ TND price card (court fee + night lighting surcharge) · ✅ atomic `create_booking()` RPC via `lib/actions/booking.ts`; `23P01` → toast *"This slot was just taken by another player. Please select another time."* · ✅ confirmation with reference code.
⬜ Cash only (no online payment, Milestone 9) · ⬜ no realtime refresh (`slot-realtime.tsx` is an unused stub) · ⬜ no rate limiting on guest bookings · ⬜ no cancellation UI (Milestone 6) · ⬜ not yet exercised in a browser or against real club data.

### 🔄 Milestone 5 — Org Admin & Staff Portal — **IN PROGRESS (2026-09-30)**
✅ `/dashboard/org` (layout guard in `app/dashboard/org/layout.tsx`, `lib/org-access.ts`) · ✅ `/courts` court list + add/edit modal + Active/Maintenance switch (org_admin only) · ✅ `/settings` weekly hours Mon–Sun (org_admin only) · ✅ `/bookings` daily grid per court, walk-in booking (status `confirmed`), cancel (trigger frees the lock) for org_admin + staff · ✅ `/logout` POST route.
⬜ Drag-and-drop court blocking · ⬜ check-in roster · ⬜ court delete (deliberately absent: `bookings.court_id` is `ON DELETE SET NULL` and locks cascade, so use Maintenance) · ⬜ not exercised in a browser (service-role key is still a placeholder) · ⬜ no realtime (board refreshes every 30 s).

### 🔄 Milestone 6 — Platform Admin Verification Portal — **IN PROGRESS (2026-09-30)**
✅ `/admin/verification` (`app/admin/layout.tsx` guard, `lib/admin/*`) · ✅ Pending / Approved / Rejected tabs with counts · ✅ owner, contact, city, address, coordinates, registered time, sports per club · ✅ review dialog: signed-URL document viewer, approve, reject with mandatory reason · ✅ decision email to owner (Resend) · ✅ approve revalidates `/` and `/courts` · ✅ owner sees the rejection reason on their dashboard. `/admin/verifications` redirects to the new path; the old page, components and 3 `/api/*-organization` routes were removed.
⬜ not exercised in a browser (service-role key placeholder) · ✅ the old "Cancellation & Slot Release Engine" scope was delivered in the session after this one (see the Milestone 7 block) · ⬜ an approved club is only listed publicly once it has an active court.

### ✅ Milestone 7 — Cancellation, Realtime, Guest Cancel & Team Management — **COMPLETE (2026-10-02)**
- **Cancellation:** `cancelBookingAction({bookingId, reason, guestToken?})` in `lib/actions/bookings.ts`. Player: own booking until `cancellation_deadline` (start − 24 h). Staff/owner of the booking's org: any open, unfinished booking. Guest: with the secret link (below). Cancelling is `UPDATE status='cancelled'`; the `handle_booking_cancellation` trigger deletes the lock. Revalidates `/courts/[orgId]`, `/dashboard/org/bookings`, `/reservations`.
- **Realtime:** `hooks/use-realtime-bookings.ts` (bookings by `org_id` for staff; `court_slot_locks` for everyone). `CourtSlotMatrix` takes a `realtime` prop, wired in `ClubBookingView`; the staff board is live. Verified: INSERT then DELETE reach an anonymous subscriber.
- **`/reservations`:** a player's upcoming and past bookings with a cancel dialog. The navbar (`hooks/use-auth-nav.ts`) shows the role's main link (`My reservations` / `Dashboard` / `Admin`) plus Sign out when signed in, and Login/Register when signed out (nothing drawn while the session is unknown, so no flash).
- **Guest cancel:** `create_booking()` mints a 192-bit token for every guest booking, returns it once, stores only its SHA-256 (`bookings.guest_cancel_token_hash`). The booking drawer shows the link (`/reservations/cancel-guest?token=…`); that page (`lib/guest-cancel.ts`) validates it and calls `cancelBookingAction` with the token. Same 24 h window; any mismatch gives the same "not valid" message. Page is `noindex`, `referrer: no-referrer`. Guests who typed an email also get the links by email (Milestone 10); otherwise the link on screen is their only copy.
- **Team (`/dashboard/org/staff`, owner only):** invite by email (role is always `staff`), resend (new token), revoke, remove (deletes the login, so access ends at once). The link is also shown to the owner because `noreply@shiftgrid.tn` is unverified in Resend. Invitees accept at `/accept-invite`: the emailed token proves the address, the server creates the confirmed account + `staff` profile, claiming the invite atomically (one link, one account). Emails that already have an account are refused (no silent moves between clubs). Tokens are never listed.
- **Staff privileges:** staff get Bookings only (walk-ins, cancel); courts, hours and team are `org_admin`-only in the nav, the pages (redirect) and the actions (`requireOrgAction(['org_admin'])`). Verified at the DB level as a `staff` user: courts, organization, payments and invites are all read-only/blocked.
- **Security fix found while testing:** any signed-in user could `UPDATE profiles SET role='org_admin'` (or change `org_id`) on themselves. `20261002000001` restricts client UPDATE to `display_name, phone, avatar_url`; role/org changes are server-only.
- Also fixed: React "setState while rendering" in `CourtSlotMatrix.handleSelect`; the drawer closing after your own booking (the realtime "slot taken" check now ignores it); `lib/email/resend.ts` built `new Resend` at import; the old invite flow could never accept anyone (it called `auth.getUser()` on the service client).
- Lint is at 0 errors (31 old unused-variable warnings remain).
⬜ Not done: guest links by SMS/email (M10); a staff member who already has a ShiftGrid account cannot be invited with that email; plain "owner promotes staff to owner" does not exist.

### ✅ Milestone 8 — Occupancy Analytics & Revenue Metrics (TND) — **COMPLETE (2026-10-02)**
`/dashboard/org/analytics` (owner only; nav item hidden for staff, page + loader redirect them). Pure aggregation in `lib/analytics.ts` (`resolveRange`, `computeAnalytics`), data in `lib/analytics-loader.ts`, UI in `components/analytics/{charts,range-filter}.tsx` (Recharts) and `app/dashboard/org/analytics/page.tsx`.
- **Shows:** revenue today / week / month / YTD (always to date, independent of the filter) · for the chosen range: revenue, average per booking, average occupancy (peak vs off-peak), cancellation rate and revenue lost · bookings-over-time chart (Bookings/Revenue toggle; day, week or month buckets by range length) · payments by status (paid online, paid cash, cash due, online awaiting, refunded; collected vs still to collect) · members vs guests/walk-ins and returning players (2+ bookings; guests matched by phone) · occupancy by hour (peak = 17:00–04:59) · top courts by revenue with occupancy. A "How these numbers are counted" panel states the definitions.
- **Range:** presets 7d / 30d / month / YTD (default 30d) + custom calendar range, all in the URL (`?range=&from=&to=`). `resolveRange` validates real dates, clamps the end to venue today and the span to 366 days.
- **Security:** org comes from `getOrgAccess()` (the caller's own `profiles.org_id`), never input; only `org_admin` of an approved club passes (staff/players/platform admins are refused before any query); queries run as the user (RLS second lock) with explicit `org_id` filters. Verified in a browser with two clubs: club B's booking never appeared in club A's totals, and a staff login was redirected to Bookings with no Analytics link.
- **Verified numbers:** seeded club (8 bookings incl. 1 cancelled, 1 online, 1 other club) matched hand-computed revenue, collected/outstanding, cancellation, member/guest and returning figures; aggregator also unit-checked offline. Test data removed.
- **Limits / notes:** Revenue = non-cancelled, non-refunded booking value (cash due counts, shown separately as "still to collect"). All payments are cash `pending` until Milestone 9, so "Paid online" is 0 and "Collected" only moves once reconciliation exists. Occupancy ignores the 15-min buffer so full days read < 100%. A platform admin has no club, so they are not given this page (a per-club admin view would need an org picker + service role). Bookings are fetched in pages of 1000 (cap 30k, with a visible notice). `payment_records` Relationships added to curated `lib/types/database.ts` for the embedded select. No CSV/PDF export yet. `recharts` added as a dependency.

### ✅ Milestone 9 — Interactive Booking & Payment Flow — **COMPLETE, sandbox gateway (2026-10-03)**
Built on the M4 booking engine (nothing was rebuilt): `components/booking/slot-picker.tsx` (day picker + court matrix + legend; used by `ClubBookingView`), `checkout.tsx` (payment-method choice, confirmation, invite links), the drawer (`booking-drawer.tsx`) as the checkout modal, `/reservations/[id]` pass page, `/reservations/join` invite-payment page.
- **Slot grid:** available = Peacock Teal tint, selected = Lime Pulse, booked/past muted; **Peak** tag on slots that carry the night-lighting surcharge (`slotIsPeak`), others are off-peak; legend explains it. Duration is **fixed per sport** (padel 90 / tennis 60 / football 90 + 15 buffer), not a free choice.
- **Pay methods** (`lib/payments.ts`): `online_full` (pay all now, booking `confirmed`), `split` (up to 4 players; organizer pays their equal share now, a one-use link per other player, last share confirms; organizer absorbs cent rounding), `cash` (pay at venue: booking `pending_payment`; staff **Mark paid** on the board → payment paid + booking confirmed).
- **Gateway = sandbox.** No ClickToPay/Stripe account is connected, so online/split use provider `test` that records `paid` without moving money (UI says "Test mode"). `onlinePaymentMode()`: on in dev, **off in production** unless `PAYMENTS_TEST_MODE=1`; when off, online/split are disabled in the UI and refused by the server. A real provider replaces `onlineProvider()`.
- **DB** (`20261003000000_payments_and_shares.sql`, applied to hosted): provider CHECK adds `test`; `booking_shares` (hashed invite tokens, read-only for clients via RLS: booker, club staff, platform admin); service-role-only RPCs `settle_booking_online`, `create_booking_shares`, `pay_booking_share`, `mark_cash_paid` (each locks the booking row first); cancelling now marks paid payments/shares `refunded` (recording only; the money is returned manually) and still frees the slot lock. Server action `createBooking` takes `payment`, refuses unavailable methods *before* holding the slot, and releases the slot if the payment step fails.
- **Double-booking:** GiST + `(court_id, occupied_from)` PK already guarantee it; verified 3 simultaneous identical bookings → exactly one wins (`23505`), an overlapping start → `23P01`. Statuses are the existing `pending_payment` / `confirmed` / `cancelled` / `completed` (UI says "Awaiting payment").
- **Pass** (`lib/pass.ts` `resolveViewer`): visible to the booker (session), a guest holding the booking's secret link (`?token=`, the guest cancel token), or the club's staff / platform admin; anyone else gets a 404. Shows club, court, date, time, reference, **QR** (`qrcode`, payload `shiftgrid:booking:<reference>`), payment state, shares; the organizer can mint a replacement link for an unpaid share (`regenerateShareInviteAction`; only hashes are stored, so links cannot be shown again).
- **Verified:** `node scripts/verify-payments.mjs` (27 DB checks: race, full, split, cancel/refund, cash, RLS/privileges) and a headless-Chrome run (17 checks: guest full pay → pass + QR, split with 3 friends via links incl. "already paid", stranger/wrong token = 404, guest cash → owner Mark paid). Both left no data behind.
- **Test suites:** `npx playwright test tests/booking-flow.spec.ts` (`npm run test:e2e`; 4 tests: slot picker legend/peak/duration+price by sport, payment choices, full booking → pass at `/reservations/[id]?token=`, split links + friend pays; seeds the 4 accounts first and removes `E2E %` guests before/after; uses the dev server and the hosted DB; browser = Playwright's, else the newest cached Chromium or `PLAYWRIGHT_CHROMIUM_PATH`). `node scripts/verify-booking-concurrency.mjs` (16 checks: 10 parallel identical bookings → 1 wins, overlaps → `23P01`, REST-insert vs RPC race, RLS on player inserts); `npm run verify:db` runs both DB scripts.
- **Known gap:** RLS lets a player insert their own `pending_payment` booking straight through the REST API (M4 policy), which holds a slot with no payment record and a court/sport of their choosing; the race tests show it still cannot double-book, but it can hold slots unpaid. Tighten by dropping that policy and booking only through the server action.
- **Not done / limits:** no real gateway or webhooks; **an unpaid split holds the slot until someone cancels** (no payment deadline/auto-release yet; needs a cron); split only for ≤ 4 players (football is cash or full); refunds are recorded, not executed; staff cannot scan the QR (no check-in screen, M5 leftover); no emails/SMS with the links (M10).

### ✅ Milestone 10 — Notifications: Email, Reminders & Live Staff Alerts — **COMPLETE, email delivery untested against a real provider (2026-10-03)**
- **Emails** (`lib/notifications/`): `templates.ts` (pure: confirmation, split invitation, cancellation + refund notice, 2 h reminder; every user-supplied string is HTML-escaped, links must be http(s)), `mailer.ts` (the only Resend caller; never throws, 10 s timeout), `service.ts` (builds context, writes the outbox, sends), `origin.ts` (public origin for links). Triggered from `createBooking` (confirmation + invites) and `cancelBookingAction`/guest cancel (cancellation) **inside Next's `after()`**, so they never delay or fail the user's action (measured: with a 5 s provider the booking confirmed in 1.1 s; the email finished ~7.7 s in).
- **Outbox pattern** (`notifications`, migration `20261004000000`, service-role only): a row is written *before* sending (`pending`) and finished after (`sent` / `skipped` / `failed`, attempts, error). `dedupe_key` is unique (`reminder_2h:<booking>`, `cancellation:<booking>`, `booking_confirmation:<booking>`, `split_invite:<booking>:<n>`), so "once" is a database guarantee. **Secrets are never stored**: guest pass/cancel links and invite links exist only in memory at send time, so confirmation/invite rows keep no payload and are not retried; cancellation/reminder rows keep non-secret template data (`payload`) and are retried (max 3 attempts, within 24 h) by the cron run.
- **Guest email:** optional field on the guest booking form → `anonymous_bookers.email` (latest address wins per club+phone). Without it a guest gets no email (pass/cancel links stay on screen). Members use their account email. Split: optional email box per other player; bad addresses are rejected client-side.
- **Env:** `RESEND_API_KEY`; `EMAIL_FROM` (default `ShiftGrid <noreply@shiftgrid.tn>`: the domain must be verified in Resend); **`EMAIL_DRY_RUN=1`** renders + records but never sends (status `skipped`; also what you get with no key); `EMAIL_DRY_RUN_DELAY_MS` (testing: make a dry run slow); `CRON_SECRET` (16+ chars). `.env` currently holds a 14-char placeholder `RESEND_API_KEY`, which Resend rejects: the outbox shows `failed` and the booking is unaffected. Playwright's web server runs with `EMAIL_DRY_RUN=1`.
- **Reminders / cron:** `GET|POST /api/cron/notifications` (`Authorization: Bearer $CRON_SECRET`; 503 if the secret is unset or short, 401 if wrong, constant-time compare). One run sends due 2 h reminders (booking starts in 15 min – 2 h, was booked more than 2 h ahead, status pending/confirmed, has an email) and retries failed rows; idempotent, safe to call every 5–15 min. **Nothing schedules it yet**: no `vercel.json` was added (Vercel Hobby rejects sub-daily crons and would fail the deploy). Options: Vercel Cron on Pro (`crons: [{ path: '/api/cron/notifications', schedule: '*/10 * * * *' }]`, Vercel sends the bearer header from `CRON_SECRET`), Supabase `pg_cron` + `pg_net` calling the deployed URL, or any external scheduler. Guest reminders carry the reference only (their pass link needs a secret that is not stored).
- **Live staff alerts:** `components/dashboard/notifications.tsx` (bell + toasts in the dashboard header, approved clubs only): new booking, booking confirmed/paid, booking cancelled, with who/court/time. Session-only list (refresh clears it). Own actions also alert.
- **`lib/realtime/bookings-feed.ts`** is the single per-club `bookings` Realtime subscription shared by the bell and `useRealtimeBookings` (the board). Two real bugs behind the earlier "no alerts": (1) **the browser client joined the channel before its access token reached the Realtime socket, so it subscribed as `anon`; RLS then hides every `bookings` row, while public `court_slot_locks` still arrive** (looks like a flaky channel; fixed by `supabase.realtime.setAuth(session token)` before `channel().subscribe()`); (2) teardown is delayed 1.5 s so React's dev double-mount reuses the live channel instead of leave+rejoin. A status callback can fire synchronously on subscribe, so state it touches must be declared first (a TDZ crash in the hook).
- **Verified:** `npx playwright test` = 14/14 (`tests/notifications.spec.ts` 10: template escaping/content, confirmation + cancellation rows with refund, address remembered, no 48-hex secret in any stored column, split invites to 2 of 3 boxes, typo caught, cron 401/503, reminders once and not for last-minute/far-off bookings, retry of a failed row, bell + toast + board refresh live; `booking-flow.spec.ts` 4). `npx tsc --noEmit`, `npm run lint` (0 problems; the 30 old warnings were cleaned up), `npm run build` clean.
- **Not done:** SMS/WhatsApp, `.ics` invites; real-provider delivery (needs a verified domain + key); friends who pay a share are not emailed (no address); emails use `PaymentOptions` copy in English only; the staff-invite and org-decision emails still use their own `from` instead of `EMAIL_FROM`.

### ✅ Milestone 11 — Production Readiness, PWA, Security Audit & Performance — **COMPLETE (2026-10-03)**
- **RLS audit** (hosted DB, policies + grants + advisors read directly): all 11 public tables have RLS on; `notifications` has none by design (service role only). Found and fixed in `20261005000000_production_hardening.sql`: (1) `org_admin` could `UPDATE organizations` including `verified_at`, `verified_by`, `rejection_reason`, `registry_number`, `verification_documents` (only `status` was guarded) → client INSERT/UPDATE revoked, all writes already use the service role; (2) `authenticated` held INSERT/UPDATE on `payment_records` and `court_slot_locks` (blocked only by missing policies) → revoked; (3) `anon` SELECT on `bookings` revoked; (4) the **known M9 gap closed**: policy "Players can insert their own pending bookings" dropped, so players book only through `create_booking()` and cannot hold slots unpaid via REST.
- **Open redirects:** every `?redirect=`/`?next=`/`?callbackUrl=` goes through `safeRedirectPath()` (`login-form` → `postLoginPath`, `/register`); the proxy only builds `redirect` from its own `pathname`; `/logout` redirects to a fixed `/`. No other `redirect`/`router.push` takes user input.
- **`node scripts/test-rls-security.mjs`** (`npm run verify:security`; 62 checks, exit 0): anon reads nothing private; cross-tenant read/update/delete/insert on bookings, courts, organizations, payments, locks for org_admin/staff/player; staff cannot edit courts; verification fields and `status` unchangeable by owners; self-promotion on `profiles`; no client INSERT on `profiles`; API-key RPCs; platform_admin sees all but not the outbox. It creates a second approved club "RLS Probe Club" and removes it afterwards. `npm run verify:db` now runs payments + concurrency + security.
- **Concurrency:** `scripts/verify-booking-concurrency.mjs` 17/17 (10 parallel identical bookings → exactly 1 wins, losers `23505`; overlaps `23P01`; direct REST inserts by a player now refused `42501`).
- **PWA:** `public/manifest.json` (standalone, theme `#50C878`, background slate `#1e293b`, 192/512/maskable icons, shortcuts to Find a court / My reservations), icons in `public/icons/` generated by `npm run pwa:icons` (`scripts/generate-pwa-icons.mjs`, sharp). `app/layout.tsx` exports `metadata` (manifest, icons, apple-touch-icon, `appleWebApp`) and `viewport` (themeColor). The proxy matcher skips `manifest.json`. Verified on a production server: manifest 200 `application/json`, all icons 200, tags present. **No service worker on purpose**: installability does not need one and caching authenticated dynamic pages would serve stale bookings; there is no offline mode.
- **Performance:** static header links already `prefetch`; dashboard nav and the signed-in link keep default prefetch on purpose (see "Navigation speed"). The only `next/image` is the logo (`priority`, `sizes`, SVG `unoptimized`); the one `<img>` is the admin's signed-URL document viewer. Server pages already fetch in parallel; the sequential awaits left are data-dependent.
- **Quality:** `tsc --noEmit` clean · `npm run lint` 0 problems · `npm run build` clean · Playwright 14/14.
- **Launch checklist (not done, needs you):** paste the real `SUPABASE_SERVICE_ROLE_KEY`; enable leaked-password protection (Supabase dashboard); verify `shiftgrid.tn` in Resend + real `RESEND_API_KEY`, `EMAIL_FROM`; set `CRON_SECRET` and schedule `/api/cron/notifications` (Vercel Pro cron or pg_cron); real payment gateway (sandbox `test` provider is off in production unless `PAYMENTS_TEST_MODE=1`); replace the in-memory API rate limit in `proxy.ts` (per instance) with a shared store; PostHog consent gate (done 2026-10-04, see Observability); Vercel env vars; unpaid-split auto-release; remove test accounts (`*@shiftgrid.local`) from the production project. Remaining advisor items are intentional (`user_org_id`/`user_role`/`org_is_approved` are called by RLS as the caller).

### ✅ Milestone 11b — HTTP Hardening, Rate Limiting & Strict Validation — **COMPLETE (2026-10-03)**
- **Headers:** one list in `lib/security-headers.ts`, used by `next.config.ts` (all responses) and `proxy.ts` (redirects/429s). CSP (`default-src 'self'`, Supabase https+wss, OSM tiles, `frame-ancestors 'none'`, `object-src 'none'`, `upgrade-insecure-requests` in prod, `unsafe-eval` only in dev), HSTS `max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, Permissions-Policy (camera/mic/payment/usb off; **geolocation=(self) stays: "Nearest to me" needs it**), COOP same-origin. **`script-src` keeps `'unsafe-inline'`**: a nonce would force every page dynamic and break the prerendered home page. The config file is `next.config.ts` (not `.js`). PostHog origin is added to the CSP only when `NEXT_PUBLIC_POSTHOG_KEY` is set; a new third-party origin must be added in `lib/security-headers.ts` or the browser blocks it.
- **Rate limiting** (`lib/rate-limit.ts`, `@upstash/ratelimit` sliding window): rules `auth` 5/min per IP · `booking` 10/min per user (else IP) · `cron` 10/min per IP (counted before the secret is checked) · `lookup` 20/min · `api` 60/min per IP+path. The proxy applies them to `/api/auth/*`, `/api/cron/*`, other `/api/*` and answers **429 + `Retry-After` + `X-RateLimit-*`** (with security headers). Server Actions call `actionRateLimit(rule, userId?)`: `signInPlayer`, `signUpPlayer`, `registerPlayer`, `submitOwnerSignup`, `previewStaffInvite` (also guards `acceptStaffInvite`, which calls it) → `auth`; `createBooking` (member by account, guest by IP), `createWalkInBooking`, `payShareAction`, guest `cancelBookingAction`, `createAnonymousBooker` → `booking`; `geocodeAddress`, `checkRegistryNumber` → `lookup`. Actions return `code: 'rate_limited'` / a "please wait N seconds" message. The cron route keeps its `CRON_SECRET` bearer check (constant time).
- **Env:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (both → shared Redis limiter). Missing → per-process in-memory limiter with the same limits (dev/dry-run; logs a warning once in production). Upstash errors → that request uses memory. `RATE_LIMIT_DISABLED=1` switches it off (ignored in production; Playwright's web server sets it).
- **Gap to know:** the login forms sign in with the browser Supabase client, straight to Supabase Auth, so ShiftGrid cannot count those attempts; Supabase Auth's own limits apply. The `auth` rule covers the Server-Action sign-in/sign-up paths and any future `/api/auth/*` route. Routing login through a server route is the fix if needed.
- **Validation** (`lib/validations/booking.ts`): `createBookingSchema` is `.strict()` (forged `amount`/`sport`/`endsAt`/`profileId` are rejected, not ignored; the end time is always derived from the sport, so there is no client duration to check); `calendarDaySchema` (real dates), `bookingInstantSchema` (ISO with offset, not older than 1 day, within 180 days), `playerCount` int 1-30 (sport limits in `checkBookableSlot`), `inviteEmails` each blank or a real email, only with `split`, never more than the other players; `walkInBookingSchema` shares `slotFields`. Guest phone/email unchanged (`+216` canonical). Every Server Action already parsed its input with Zod before touching the database.
- **Tests:** `node scripts/test-rate-limit.mjs` (`npm run verify:ratelimit`, needs a running server: `npm run build && npx next start -p 3111`, then `BASE_URL=http://localhost:3111`; 18 checks: headers, auth 5/min, cron 10/min, api 60/min, Retry-After, other IPs unaffected) · `tests/validation.spec.ts` (10 pure schema tests). Playwright total 24/24, `tsc`, `lint`, `build` clean. Not exercised against a real Upstash database.

### ✅ Milestone 11c — Connection Pooling, Realtime Resilience & Sentry — **COMPLETE (2026-10-03)**
- **Pooling: nothing to switch, by design.** The app has no Postgres driver (no `pg`/Prisma/Drizzle, no `DATABASE_URL`, no `:5432` anywhere); every query is `supabase-js` over HTTPS to PostgREST, which Supabase already pools, and the service-role client is built per call. A port-6543 string would be dead config. `.env.local.example` documents the rule for the day a driver is added: **app code → Transaction pooler (6543, `?pgbouncer=true`, no prepared statements); migrations/admin scripts → direct or session connection (5432)**. Today migrations go through the Supabase MCP/CLI and `scripts/*.mjs` use supabase-js with the service role (HTTPS), so none depends on a connection string.
- **Realtime fallback** (`lib/realtime/bookings-feed.ts`): a channel that is not `SUBSCRIBED` is torn down and re-created with exponential backoff + jitter (1 s → 30 s, `backoffDelay()`), re-reading the session token each time. Consumers can pass `onSync`, which fires on re-subscribe, `online`, tab-visible, a **~10 s poll while the socket is down**, and a **~90 s heartbeat while up** (catches events lost silently under load); polls pause while the tab is hidden. The board (`useRealtimeBookings`) refreshes on every sync; its own public `court_slot_locks` channel polls every 10 s while unsubscribed; the board's old 120 s refresh stays. The bell (`components/dashboard/notifications.tsx`) syncs by querying `bookings` with `updated_at > cursor` (cursor = newest server `updated_at` at mount, never the browser clock), feeds the rows through the same `handle()`, and dedupes with a `raised` set so a late realtime event never toasts twice. The bell shows "Reconnecting · checking every 10 s" while degraded. Channel problems log `console.warn` (the fallback is the handling). Verified: `tests/notifications.spec.ts` blocks the Realtime WebSocket (`page.routeWebSocket`) and the toast + board row still arrive (~19 s).
- **Sentry** (`@sentry/nextjs` 11.4): **off unless a DSN is set** (`SENTRY_DSN` server, `NEXT_PUBLIC_SENTRY_DSN` browser; the browser DSN origin is added to the CSP only when set). Files: `instrumentation-client.ts` (browser; **not** `sentry.client.config.ts`, which Turbopack/Next 16 does not load), `sentry.server.config.ts` + `instrumentation.ts` (`register()` and `onRequestError` for RSC/Server Actions/route handlers), `lib/sentry-options.ts` (shared options, traces 5 % via `SENTRY_TRACES_SAMPLE_RATE`, no replay), `app/error.tsx` + `app/global-error.tsx` (capture + friendly retry), `components/error/ErrorBoundary.tsx` (now reports to Sentry instead of a nonexistent endpoint), `lib/observability.ts` `reportServerError(area, error, extra)` (used for unexpected `create_booking` and payment-step failures). `next.config.ts` is wrapped with `withSentryConfig` from `@sentry/nextjs/config` (v11 moved it there).
- **Privacy:** `lib/sentry-scrub.ts` runs in `beforeSend`/`beforeSendTransaction`/`beforeBreadcrumb`: drops `user`, `server_name`, request cookies and body; filters sensitive keys (authorization, cookie, token/*_token, password, email, phone, names, IPs); pattern-scrubs every string (JWTs, Bearer, `sb_secret_/sb_publishable_`, emails, Tunisian phones, 32+ hex link tokens, secret query values); console breadcrumbs lose their data. Sentry's own `event_id`/`trace_id`/`span_id` are exempt (a first version scrubbed them as hex tokens; the test through the real SDK caught it). Booking uuids stay readable. Note Sentry attaches source lines around stack frames, so never hard-code secrets in source.
- **Source maps:** uploaded (then deleted from the build) only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are set at build time; without them the build is unchanged and **no maps are produced or uploaded (not exercised here: no Sentry account)**.
- **Tests:** `tests/observability.spec.ts` (8: scrubbing, a real captured error through the SDK with a capturing transport, DSN-off, backoff/poll timings). Playwright 33 total; `tsc`, `lint`, `build` clean.

### 🔥 Load testing (k6) — run before every major deployment

`scripts/k6-booking-stress.js` drives a production build: public reads (`/courts`, `/courts/<orgId>`), real guest bookings through the `createBooking` **Server Action**, and a rate-limit burst. Ramp 0→20 VUs (30 s) → 50 (30 s) → hold 50 (1 min) → 0, plus one burst VU.

```bash
npm run build && npx next start -p 3111              # production build (dev mode is not representative)
BASE_URL=http://localhost:3111 k6 run scripts/k6-booking-stress.js     # = npm run test:load with BASE_URL set
npm run cleanup:load                                  # ALWAYS afterwards: deletes the "K6 LOAD ..." guests + bookings
```
No local k6 (this machine): use the image, which needs the host mapping or the DNS lookup fails:
```bash
MSYS_NO_PATHCONV=1 docker run --rm --add-host host.docker.internal:host-gateway -v "$(pwd -W):/work" -w /work   -e BASE_URL=http://host.docker.internal:3111 grafana/k6 run --quiet --no-color scripts/k6-booking-stress.js
```
- **Pass criteria (thresholds):** `http_req_failed` < 1 % (429/401/403 on the burst are declared expected), booking and read p95 < 800 ms, **0 server errors**, connection resets < 1 %, hot-slot winners ≤ 1, ≥ 1 HTTP 429 with `Retry-After` on `/api`, ≥ 1 `rate_limited` on bookings.
- **How the booking call works:** POST to `/courts/<orgId>` with `Next-Action: <id>`, `Content-Type: text/plain`, body = JSON array of the action's arguments. The id is read from `.next/server/server-reference-manifest.json` (`exportedName: createBooking`) and **changes every build**; for a deployed target pass `ACTION_ID`. The action answers HTTP 200 even when refusing, so the script reads `"ok"`/`"code"` from the flight body (`slot_taken`, `rate_limited`, ...). The booking limiter is *per IP* and answers `rate_limited` in the body, not HTTP 429; only `/api/*` returns a real 429. Each VU sends its own `X-Forwarded-For` (trusted locally; behind a real proxy the platform sets it) to get its own allowance.
- **Gotchas found:** bookings are accepted only **2–60 days ahead** (`MAX_DAYS_AHEAD`, else `invalid_slot`); every k6 VU is its own JS runtime, so run-wide random values (seed, hot slot) must come from `setup()`; the script writes **real bookings** (~400 per run) into whatever database the server points at (the hosted project from `.env.local`), on the seeded "ShiftGrid Test Club" only. Never point it at a real club (`ORG_ID`/`COURT_IDS` override).
- **Pooling:** the app has no Postgres driver (everything is supabase-js over HTTPS to PostgREST, already pooled), so there is no 6543 connection to switch or to test. The run proves what matters: 50 concurrent writers produced no `unknown`/5xx answers from Supabase.
- **Result 2026-10-03 (local prod build → hosted Supabase, 50 VUs, in-memory limiter):** ~1.9k requests, 397 bookings created, 74 `slot_taken`, 10 VUs racing one hot slot → exactly 1 winner, 0 server errors, 20 HTTP 429 + 4 booking `rate_limited`, reads p95 ≈ 0.6 s. **Booking p95 ≈ 1.2 s fails the 800 ms target**: an unloaded booking already takes 0.3–0.7 s because `createBooking` makes several sequential round trips to the hosted DB from this machine; under load it roughly doubles. Treat it as a known gap (candidates: fewer sequential calls in `checkBookableSlot`/`createBooking`, run the test from the same region as Supabase) and re-measure from the deployed region before trusting the number. Rare `EOF` on a reused connection (~0.2 %) is Next's 5 s keep-alive closing an idle socket; not an app error. One unexplained 5xx-class answer appeared in one earlier run and did not reproduce with logging on. Not tested: Upstash limiter, the deployed URL, Realtime under load.

### ✅ Milestone 13 (Phase 3) — Legal compliance (Law 2004-63 / INPDP), consent & launch readiness — **CODE COMPLETE; legal review + INPDP filing are yours (2026-10-03)**
- **Pages:** `/terms` and `/privacy` (static server pages, `app/terms|privacy/page.tsx`, shell in `components/legal/legal-document.tsx`, footer links on the home page). Privacy: controller, data collected (players, guests, bookings, split shares, owners/staff + verification document, technical data, notification records), purposes, recipients (club + processors Supabase, Vercel, Resend, Upstash, Sentry/PostHog when enabled), transfers abroad, retention, rights (access, correction, deletion, objection, no marketing), security, cookies (strictly necessary only), minors (18+), contact + INPDP complaint. Terms: platform vs club contract, 60-day horizon, slots (padel 90 / tennis 60 / football 90 + 15 min buffer), TND pricing + night surcharge, pay-at-venue, split payments (organiser liable for unpaid shares), **24 h online cancellation window**, manual refunds, club obligations, liability, Tunisian law. Written from what the app does today; **they say unpaid bookings are not auto-released yet**, so change the text the day that ships.
- **Not invented:** operating company, address and privacy mailbox come from env (`NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_ENTITY_DETAILS`, `NEXT_PUBLIC_LEGAL_EMAIL`, default privacy@shiftgrid.tn; `lib/legal.ts`). Unset → the pages show only "ShiftGrid"; the readiness script fails until they are set. The 30-day answer time and "up to" retention wording are commitments to confirm with counsel. Article numbers of Law 2004-63 are deliberately not cited.
- **Consent (enforced server-side in Zod, not only by the checkbox):** `termsConsentSchema`/`acceptTerms` on `playerRegisterSchema`, `playerSignUpSchema` and `ownerAccountSchema`; `consent` on the guest variant of `createBookingSchema` (still `.strict()`) via `guestConsentSchema`; the guest form uses `guestBookingFormSchema`. UI: `components/legal/consent-checkbox.tsx` (`#player-terms` on `/register`, `#signup-terms` in the sign-up tab of the booking modal, `#owner-terms` on the owner wizard's last step, `#guest-consent` in the booking drawer, whose text covers email/phone/SMS contact about the booking). **Evidence:** accounts store `terms_accepted_at` + `terms_version` (`LEGAL_VERSION` in `lib/legal.ts`, bump it when the texts change) in auth user metadata via `consentMetadata()`. **Guests: consent is validated per request but not stored** (no column; would need a migration + `create_booking()` change). Staff walk-ins and staff-invite acceptance have no consent box yet.
- **Launch script:** `npm run verify:launch` = `node scripts/verify-launch-readiness.mjs [--env-file .env.production.local] [--url <origin>] [--full] [--skip-live] [--skip-data] [--strict]`. Read-only. Checks: production env guards (real Supabase/service key, https app URL, real Resend key, no `EMAIL_DRY_RUN`, `CRON_SECRET`, no `PAYMENTS_TEST_MODE`, no `RATE_LIMIT_DISABLED`, Upstash, legal identity; Sentry/PostHog as warnings); source scan (no tracked .env, no keys/service-role JWTs, no dev password or `@shiftgrid.local` in app code, cron schedule present); **data** (no `@shiftgrid.local`/example/e2e users, no test clubs, no load-test guests, a platform_admin exists); **live** (CSP, HSTS ≥ 1 y, X-Frame-Options, nosniff, Referrer/Permissions-Policy, no X-Powered-By, `/terms`, `/privacy`, manifest, protected `/dashboard` + `/admin`, cron refuses without secret); **build** (fresh `.next`; `--full` runs tsc + lint); then MANUAL reminders (they fail only with `--strict`). Exit 1 on any FAIL. It reads `.env.local` only if you pass it, because that file holds dev values.
- **Result against this dev setup (`--env-file .env.local`, local prod build, hosted DB): 43 pass, 9 FAIL, 3 warn → NOT READY, as it should be:** app URL is localhost, Resend key unset, `EMAIL_FROM` unset, no Upstash, legal env unset, and the hosted project still holds `*@shiftgrid.local` users and "ShiftGrid Test Club". Everything about headers, pages, source and build passed.
- **Tests:** `tests/legal.spec.ts` (4: pages render with Law 2004-63/INPDP/rights and booking rules, footer links, register form blocks without the box) + consent cases in `tests/validation.spec.ts`; booking/notification specs tick `#guest-consent`. Playwright 42/42, tsc, lint, build clean. Playwright reuses a server already on :3000: start it with `EMAIL_DRY_RUN=1 RATE_LIMIT_DISABLED=1` or kill it, else emails really send and the outbox test sees `failed`.

### 🚀 Deployment steps (in order)
1. **Legal first:** have a Tunisian lawyer review `/terms` and `/privacy` (consider French + Arabic: the pages are English only); declare the processing to the INPDP and get any authorisation for transfers abroad; create the privacy mailbox.
2. **Production Supabase project:** apply every file in `supabase/migrations` (re-align the `20261005000000` history row); enable leaked-password protection; confirm backups; do **not** reuse the dev project, which holds test accounts. Create the real admin: `node scripts/seed-platform-admin.mjs <real address>`.
3. **Vercel env (Production):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret), `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM` (verified domain), `CRON_SECRET` (32+ chars), `UPSTASH_REDIS_REST_URL/TOKEN`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN/ORG/PROJECT` for source maps), `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_ENTITY_DETAILS`, `NEXT_PUBLIC_LEGAL_EMAIL`. Leave unset: `EMAIL_DRY_RUN`, `PAYMENTS_TEST_MODE`, `RATE_LIMIT_DISABLED`, (PostHog key/host may now be set: the consent gate is in place).
4. **Gate:** `vercel env pull .env.production.local --environment=production`, `npm run build`, `npx next start -p 3111`, then `npm run verify:launch -- --env-file .env.production.local --url http://localhost:3111 --full`: must end "Automated checks passed".
5. **Deploy**, then `npm run verify:launch -- --env-file .env.production.local --url https://<your domain> --skip-data`, schedule `/api/cron/notifications` (Vercel Pro cron or pg_cron), send a real test email, make one real booking and cancel it.
6. **Load test from the deployed region** (see "Load testing"), then `npm run cleanup:load`; remove any test rows from production.
7. **Not yet built, decide before real money:** payment gateway, pay-at-venue auto-release (update Terms when it ships), self-service data export/deletion, guest-consent storage.

### 📈 Observability, consent & traffic guardrails (PostHog + Sentry) — updated 2026-10-04
Everything is **off unless configured**: no key/DSN means nothing is downloaded, initialised or sent.
- **Consent gate (added 2026-10-04)** — `lib/consent.ts` (store + pure helpers), `components/consent/consent-banner.tsx` (`ConsentBanner` mounted in `app/layout.tsx`, `CookieSettingsButton` in the home footer, the legal footer and `/privacy#cookies`). Two purposes: **Usage analytics** and **Session recordings** (needs analytics). Stored in `localStorage['sg-consent']` as `{v, analytics, replay, at}`; bump `CONSENT_VERSION` to ask everyone again. The banner renders client-only (`useSyncExternalStore`, server snapshot null: no hydration mismatch, `/` stays static) and only when PostHog is configured in the build; Accept all / Reject all are equal weight, Customize opens a Dialog. **Before consent `posthog-js` is not even imported** (no request, no `ph_*` storage); PostHog's own defaults are off too (`opt_out_capturing_by_default`, `opt_out_persistence_by_default`) and it is opted in explicitly. **Revoking** stops recording, opts out, `reset()`s and deletes every `ph_*`/`__ph*` localStorage, sessionStorage and cookie key. `/privacy` §9 describes all of it (`LEGAL_VERSION` 2026-10-03.2).
- **PostHog** (`components/providers/posthog-provider.tsx`, `PostHogProvider` wraps `app/layout.tsx`): needs **both** `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`, lazy `import()` after consent. Guardrails: `person_profiles: 'identified_only'`, `capture_pageview: false` + one manual `$pageview` per path, `autocapture`/`capture_pageleave`/`capture_performance` off, `debug` only with `NEXT_PUBLIC_POSTHOG_DEBUG=1` outside production. **`before_send` → `lib/analytics-sanitize.ts`** strips query strings and fragments from every URL property and from recording Meta events (`$snapshot_data[].data.href`): secret links carry `?token=`. The CSP allows the host and its `<region>-assets.i.posthog.com` sibling. posthog-js drops events from automation (bot UA / `navigator.webdriver`), so headless checks must override both.
- **Session recordings** (only with recording consent): `disable_session_recording: true` at init, started with `startSessionRecording()` (project sampling still applies) only on allowed routes. `session_recording`: `maskAllInputs: true`, **`maskTextSelector: '*'` (all text masked)**, `blockSelector: '.ph-no-capture, [data-ph-block], input[type="file"], canvas'`, no headers/bodies, network URLs stripped; `enable_recording_console_log: false`. **Never recorded** (`replayAllowed()`): `/dashboard*`, `/admin*`, `/reservations*`, `/accept-invite`, `/login*`, `/register`, `/signup-owner`, `/logout`. **Client-side navigation INTO those pages is stopped before it starts** by `lib/replay-guard.ts`, called from `onRouterTransitionStart` in `instrumentation-client.ts`: a React effect is too late (the recorder had already captured the new URL and DOM: found and fixed in a headless run). **Class conventions:** `ph-no-capture` removes an element from recordings (secret-link inputs in `checkout.tsx`/`pass-shares.tsx`/`staff-manager.tsx`, the guest tab of the booking drawer, the owner's document dropzone); `ph-mask` marks personal text (redundant with `'*'` today, keeps intent if masking is ever narrowed). Add `ph-no-capture` to any new element that shows a secret link, a document or a QR code.
- **Sentry** (`@sentry/nextjs`): one DSN, `NEXT_PUBLIC_SENTRY_DSN`, used by browser and server (a server-only `SENTRY_DSN` overrides it). **Client config is `instrumentation-client.ts`; there is deliberately no `sentry.client.config.ts`** (Next 16/Turbopack never loads it). `sentry.server.config.ts` + new `sentry.edge.config.ts` are loaded from `instrumentation.ts` by `NEXT_RUNTIME` (the edge one is unused today: proxy and routes are Node). Shared options in `lib/sentry-options.ts`.
- **Sentry releases & source maps (2026-10-04):** `next.config.ts` computes `sentryUpload` (token + org + project all set) and sets **`productionBrowserSourceMaps: sentryUpload`**: a hard-coded `false` (as before) stops @sentry/nextjs from enabling browser maps under Turbopack, so browser traces would stay minified. Maps are uploaded then deleted (`deleteSourcemapsAfterUpload`, v11's replacement for `hideSourceMaps`); `widenClientFileUpload` on. **Release** = `SENTRY_RELEASE` || `VERCEL_GIT_COMMIT_SHA` || `git rev-parse HEAD`, injected by the SDK into browser, server and edge bundles (verified: the commit SHA appears in both client and server output), so `lib/sentry-options.ts` no longer sets `release`. With a token the build also creates/finalizes the release, `setCommits: { auto, ignoreMissing, ignoreEmpty }` (needs Sentry's GitHub integration) and marks a deploy for `VERCEL_ENV`. **Never set `release.create: false`**: the SDK then stops injecting the release name. The readiness script FAILs if any `.map` is left in `.next/static` and WARNs when the upload vars are missing.
- **Sample rates:** `tracesSampleRate` **0.1** by default (`DEFAULT_TRACES_SAMPLE_RATE`, override `SENTRY_TRACES_SAMPLE_RATE`, clamped 0-1, garbage falls back to 0.1); **`replaysSessionSampleRate: 0.0`, `replaysOnErrorSampleRate: 1.0`** (`REPLAY_SAMPLE_RATES`), browser only. Replay masks **all** text, inputs and media (`maskAllText/maskAllInputs/blockAllMedia`) because pages show names and phone numbers; the Privacy Policy mentions it. Replays bypass `lib/sentry-scrub.ts`, so never loosen the masking. **`traceLifecycle: 'static'` is required**: with the SDK default (`'stream'`) `beforeSendTransaction`, i.e. the scrubber, is ignored for traces.
- **Env** (`.env.local.example`; real values only in `.env.local` / Vercel, which `.gitignore` already excludes; there is no separate `.env.example`): `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (the last three only for source-map upload at build; never `NEXT_PUBLIC_`). `NEXT_PUBLIC_*` values are **inlined at build time**: change them and rebuild.
- **Verified:** tsc, lint, build clean; `tests/observability.spec.ts` pins the rates; a production build with fake key/host/DSN in headless Chrome: no console errors or hydration/CSP issues, PostHog config loads and a `/e/` pageview is posted, a thrown error posts a Sentry envelope. Not verified: a real PostHog project or Sentry account (no keys), a real replay upload, source-map upload.
- **Consent verified (2026-10-04):** `tests/consent.spec.ts` (consent record, route exclusions, recording-URL sanitising) and **`npm run verify:consent`** (`scripts/verify-consent.mjs`, 21 browser checks against a production build made with fake `NEXT_PUBLIC_POSTHOG_KEY/HOST`, PostHog servers mocked except the real recorder script): no request/storage before a choice, Reject remembered, analytics-only never records, Accept all records with text masked and no secret token in any payload, excluded pages (full load and client-side move) not recorded, recording resumes on allowed pages, revoke deletes storage and stops requests, no console/CSP/hydration errors. Rebuild without the fake keys afterwards (`NEXT_PUBLIC_*` is baked in). Not verified: a real PostHog project (replay must also be enabled there) or a real Sentry upload/commit link (no account).

### ⬜ Milestone 12 — Multi-Tenant Onboarding & Super Admin Portal
Platform admin super-dashboard · system-wide view · lifetime license keys · suspension controls · audit logs. Then Lighthouse audit · WCAG 2.2 · end-to-end smoke test on the deployed URL.

---

## 📁 Directory Conventions

```
lib/
  actions/      Server Actions ('use server')
  supabase/     client · server · middleware · optimized-client
  types/        database.ts (generated) + app types
  validations/  Zod schemas
  email/        Resend wrappers
components/
  ui/           Radix/Shadcn atomic primitives (lowercase filenames)
  courts/       Court + slot domain components (court-slot-matrix, slot-realtime, date-navigator)
  home/         Public landing: hero-section, club-discovery, how-it-works
  nav/          navbar (public site navigation)
  booking/      Booking flow components
  dashboard/    Owner/staff dashboard components
  staff/        Staff invite management
```

> **Filenames in `components/ui/` are lowercase.** A `Card.tsx` / `card.tsx` collision silently works on Windows but **breaks the build on Linux/Vercel**. Keep imports lowercase.

---

## ⚠️ Gotchas — Do Not Forget

| Gotcha | Context |
|---|---|
| **Service-role clients bypass RLS** | `admin-verification.ts` and `owner-signup.ts` use `SUPABASE_SERVICE_ROLE_KEY`. The database will **not** protect you — assert the caller's role in the action body. |
| **Zod `.default()` splits input/output types** | `z.boolean().default(true)` makes the field optional on input, required on output. Type forms as `useForm<z.input<S>, unknown, z.output<S>>`. |
| **Checkboxes need `checked`, not `value`** | Spreading react-hook-form's `field` onto `<input type="checkbox">` binds `value={boolean}` and the box never reflects state. Bind `checked` + `onChange={e => field.onChange(e.target.checked)}`. |
| **Radix `Select`/`Tabs` need `Controller`** | Not `register()`. `onValueChange` emits `string` — narrow it to your union. |
| **Supabase auth cookies must NOT be `httpOnly`** | The browser client reads them from `document.cookie`. Marking them httpOnly breaks client-side auth state and Realtime. |
| **No module-level singletons for request-scoped clients** | Modules are shared across requests on a warm server — a cached authenticated client leaks between users. |
| **`import Link from 'next/link'`** | Default export, never `{ Link }`. |
| **Column names differ between tables** | `profiles.org_id` but `api_keys.organization_id`. `profiles` has `display_name` (no `full_name`) and **no `email` column** — email lives on `auth.users`. |
| **`court_slot_locks` columns** | `occupied_from` / `occupied_until`, **not** `starts_at` / `ends_at` (those are on `bookings`). |
| **Org status is `approved`** | The enum is `pending \| approved \| rejected \| suspended`. There is no `verified` — filtering on it silently matches nothing. |
| **Courts have `status`, not `is_active`** | `status IN ('active','maintenance')`. |
| **`useSearchParams()` needs `<Suspense>`** | Otherwise the production build fails at prerender. `/accept-invite` and `/login-owner` are wrapped. |
| **react-leaflet must be `ssr: false`** | It touches `window` at module scope. Loaded via `next/dynamic` in `components/auth/location-picker-map.tsx`. |
| **Tunisian phone regex** | `/^(\+?216\s?\|00216\s?)?[234579]\d{1}[\s.-]?\d{3}[\s.-]?\d{3}$/` in `lib/validations/player-auth.ts`. Accepts `98123456`, `+216 98 123 456`, `0021698123456`. |
| **Landing is organization-first** | `app/page.tsx` loads approved orgs + active courts via `createPublicClient()`, `buildClubs()` (`lib/clubs.ts`, pure and unit-testable) aggregates them, `ClubDiscovery` filters client-side. Cards link to `/courts/[orgId]`. `revalidate = 60`. Clubs with no active court are hidden; `price_per_hour = 0` means "not set" (shown as *Price on request*), never free. |
| **`.env.local` targets the hosted project** | `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` point at `jxzzbnuuvueslieagcvp` (verified over HTTP). **`SUPABASE_SERVICE_ROLE_KEY` is NOT the secret key yet (2026-10-01: it holds a publishable `sb_publishable_…` key, which makes admin endpoints answer "This endpoint requires a valid Bearer token"; `serviceRoleKeyProblem()` in `lib/supabase/optimized-client.ts` detects this and owner signup now fails with a clear server log)** — paste the hosted key from Dashboard > Project Settings > API, or booking, owner signup and staff invites (everything using the admin client) will fail. Local dev now reads and writes the *hosted* database. The old local URL is kept as a comment. Server-side `console.error` must log `error.message`/`details`, not the error object (it can print as `{}`). |
| **Signup used to drop structured location** | `owner-signup.ts` folded `city` into `address` and only emailed lat/lng. It now saves `city`, `latitude`, `longitude`. Clubs registered earlier have none and sort last under "Nearest to me". |
| **`formatTND` lives in `lib/payments.ts`** | Not in a client component: a `'use client'` module's exports cannot be called from a server page (it broke `/reservations/join` until the headless run caught it). A `'use server'` file may only export async functions: no helper re-exports. |
| **Booking = `create_booking()` only** | One transaction: guest upsert + booking (triggers derive times and create the `court_slot_locks` row) + `payment_records`. `EXECUTE` is `service_role` only; the server action derives sport, price and member id from the DB and the verified session, never from the browser. Status starts `pending_payment` (cash at the club). Reference code = first 8 hex chars of the booking id, uppercased. |
| **`assign_court` honours a chosen court** | It used to overwrite `court_id` with the first free court. With a court supplied it now validates org/sport/active and keeps it; the GiST constraint is the atomic conflict check (`23P01`). Without one it auto-assigns. |
| **Slot grid cadence** | Slots repeat every duration + 15 min buffer (padel 08:00, 09:45, 11:30 ...), generated by `lib/court-slots.ts` and re-checked server-side. A close at/before the open time means past midnight. |
| **Venue time, not browser time** | Slots are real instants. Always format with `lib/court-time.ts` (`Africa/Tunis`, UTC+1, no DST); `toLocaleTimeString()` shifts for visitors abroad. "Today" is the venue's date. `formatVenueDate` is hand-built because `Intl` varies by ICU version. |
| **One price function** | `lib/pricing.ts` `computePrice()` is used by the matrix, the drawer and the server action. Night surcharge is prorated by the minutes at/after `night_starts_at` (through midnight); a court with `night_surcharge_per_hour = 0` never shows one. |
| **One Tunisian mobile rule** | `guestPhoneSchema` in `lib/validations/booking.ts`: 8 digits, first digit 2/4/5/9, optional +216/00216, stored canonical `+216XXXXXXXX`. Used by guest booking, the player registration form, the sign-in modal's signup and the guest-booker schema. Landline prefixes (3x, 7x) are rejected everywhere. |
| **Membership is per club** | A player profile has one `org_id`, so a signed-in player can book as a member only at their own club (staff and other-club players see "book as a guest"). Multi-club membership would need a schema change. |
| **Identical-slot race is `23505`, not `23P01`** | Two bookings with the exact same start collide on the `court_slot_locks (court_id, occupied_from)` primary key first; only *overlapping but different* starts hit the GiST `23P01`. Both player and walk-in actions map both to "slot taken". |
| **Weekly hours** | `organizations.weekly_hours` (jsonb, nullable, anon-readable) — `lib/operating-hours.ts`. When set, a weekday's hours replace every court's `open_time/close_time` and a closed day has no slots; null = courts use their own. Applied in `app/courts/[orgId]/page.tsx`, the dashboard board and `lib/booking-core.ts`. Written only by `saveWeeklyHours` with the service role, because `org_admin` has **no UPDATE policy on `organizations`** (status/verification live there). |
| **One booking check** | `lib/booking-core.ts` `checkBookableSlot()` (court active, org approved, slot on that day's grid, player count, price) is shared by the player drawer and staff walk-in. `create_booking()` now takes `p_status` (`pending_payment` default, or `confirmed`); still service_role only. |
| **Dashboard auth** | `getOrgAccess()` / `requireOrgAction(roles)` in `lib/org-access.ts` derive org + role from the verified session, never from input. Court writes and cancellation run as the caller (RLS is a second lock); hours and walk-ins use the service role after the role check. |
| **Verification docs are private** | Bucket `verification-docs` (private, 5 MB, pdf/jpg/png, no storage policies: service role only). `organizations.verification_documents` holds `{path, name}`; admins get a 5-minute signed URL from `getVerificationDocument`. Legacy `{proof: url}` is still read. Status values are `pending \| approved \| rejected` and the role is `platform_admin`; `pending_verification` / `super_admin` do not exist. `organizations.rejection_reason` is private (not granted to anon). |
| **`service_role` needs GRANTs, not just the key** | `BYPASSRLS` skips row security only. The hosted project's `service_role` had no table privileges at all, so every service-role action failed with `permission denied for table ...` (looks like RLS, isn't). `20261001000000_service_role_grants.sql` grants ALL on public tables/sequences/functions plus default privileges. If that error ever returns, check `has_table_privilege('service_role', ...)` before touching code. |
| **Owner signup rolls back** | `submitOwnerSignup` tracks what it created (auth user, stored proof, organization) and undoes all of it on any failure, including courts and thrown errors; deleting the org cascades to courts and profile. |
| **Cancelling = `UPDATE status='cancelled'`** | `handle_booking_cancellation` is a no-argument trigger function, not callable as `handle_booking_cancellation(id)`; the update fires it and it deletes the `court_slot_locks` row. The column is `booker_profile_id`, not `player_id`. Reason goes in `bookings.cancellation_reason`. |
| **Realtime needs the publication** | `supabase_realtime` was empty until `20261001000001`; it now publishes `bookings` and `court_slot_locks`. Public visitors cannot read `bookings` (RLS), so the public matrix listens to `court_slot_locks` (readable by anon + authenticated for public courts, no `org_id` column, so it is narrowed client-side by court ids). Replica identity is default: UPDATE/DELETE `old` carries only primary-key columns. |
| **Navigation speed** | Production only (Next prefetches nothing in dev). Header links Home/Clubs/Facilities/Login/Register/logo use `prefetch`; the signed-in link ("My reservations" / Dashboard) stays on the default **on purpose**: `prefetch={true}` caches a dynamic page's data ~5 min, so a booking made just before the click would be missing. Default prefetch loads the route down to its `loading.tsx`, so the click shows a skeleton instantly. `loading.tsx` exists for `/reservations` (+ `[id]`, `join`, `cancel-guest`), `/courts`, `/courts/[orgId]`, `/dashboard/org`, `/admin`, built from `components/skeletons.tsx`. Page reads that were serial now go out together (`/courts`, `/courts/[orgId]`, `/reservations`, analytics). Measured on a production build against the hosted DB: clicking My reservations paints the new route (skeleton) in ~55 ms and its data in ~0.9 s; Login/Register show in ~60-110 ms. **The remaining fixed cost is the proxy**: `getUser()` + a profile read, two sequential hosted round trips (~150-300 ms each from the dev machine), on every request, so even static pages take ~220-500 ms server-side when signed in. Options if it matters: read the role only for `/admin`, `/dashboard`, auth pages and `/reservations` (changes how the role-based session lifetime slides), or start the profile read from the cookie's user id in parallel with `getUser()`. Not done: it alters session behaviour. **Side effect of `loading.tsx`:** a page's `redirect()` inside a loading boundary (e.g. staff opening `/dashboard/org/analytics`) now arrives as HTTP 200 with a streamed `NEXT_REDIRECT` / meta refresh instead of a 307; the guard still runs before any data is read (checked: no revenue text in the body), and `scripts/verify-roles.mjs` accepts both forms. |
| **Login architecture** | Two portals share one form, `components/auth/login-form.tsx` (`portal="general" | "business"`): **`/login`** accepts every role; **`/login-owner`** ("ShiftGrid Business — Club Management Login") is for owners/staff (+ platform admins) and, for a `player`, signs them out and shows *"This portal is reserved for club management. Please log in via the main login page"* with a link to `/login`. Both sign in with the browser Supabase client, read the caller's own profile, and go to `postLoginPath(role, ?redirect)` (`lib/auth-landing.ts`): admin → `/admin/verification`, org_admin → `/dashboard/org` (→ bookings), staff → `/dashboard/org/bookings`, player → `/` (the home page; "My reservations" is a header link to `/reservations`, not their landing); a `?redirect=`/`?next=` is honoured only if it is a safe same-site path in that role's area (admin→`/admin*`, club roles→`/dashboard*`, players→public), so no more "Access denied" loops. Club roles with a pending/rejected/other non-approved club are still signed out with a clear message. The proxy sends a signed-in visitor on `/login`, `/login-owner`, `/signup-owner` to `landingPathFor(role)`; unauthenticated `/dashboard` and `/admin` still redirect to `/login-owner?redirect=`. Header "Login" → `/login`; the signed-in header link comes from `homeLinkFor` (same landing table). The booking-drawer sign-in modal (`PlayerAuthModal`) is unchanged and player-only. Verified in headless Chrome: all 4 roles × both portals, redirect handling, and the player-on-business-portal message (player left signed out); `node scripts/verify-roles.mjs` also covers portals + signed-in bounce. |
| **Dev accounts for all 4 roles** | `node scripts/seed-all-roles.mjs` (idempotent; resets passwords every run) provisions `admin@` / `owner@` / `staff@` / `player@shiftgrid.local` (password `ShiftGrid-Dev-1!`, or `SEED_PASSWORD`) plus an approved "ShiftGrid Test Club" (2 courts) the owner, staff and player belong to; the admin sits in the hidden platform org. `node scripts/verify-roles.mjs` (dev server running) signs each in, tries self-promotion, and probes the role pages with real session cookies: 22 checks, all pass. Landing: admin → `/admin/verification`; owner → `/dashboard/org` (→ bookings); staff → `/dashboard/org/bookings` (Team/Courts/Hours/Analytics redirect back); player → `/login` → `/` (home), then "My reservations" in the header. `/login` is the general portal (all roles); `/login-owner` refuses players with a pointer to `/login`. Targets the hosted project (no local Supabase). |
| **No `auth.users` → `profiles` trigger (on purpose)** | `profiles.org_id` is NOT NULL, so a trigger cannot create a default `player` profile (no club to give it), and it would collide with the profile inserts that owner signup, `registerPlayer`, invite acceptance and the seeds already do. Profiles are created only by those server paths (service role). Role/club escalation is blocked by column grants (`authenticated` may update only `display_name, phone, avatar_url`), verified for player, staff and owner (incl. an owner promoting staff). A trigger would need `org_id` nullable plus RLS and `create_booking()` changes (global player accounts). |
| **Platform admin account** | `node scripts/seed-platform-admin.mjs [email]` creates/promotes `admin@shiftgrid.local` (idempotent, random password printed once; `ADMIN_SEED_PASSWORD` to choose; `--reset-password` to change). SQL alternative for an existing user: `supabase/promote_platform_admin.sql`. `profiles.org_id` is NOT NULL, so admins belong to a hidden org \"ShiftGrid Platform\" with status `suspended` (never `approved`, or it would appear in the player club dropdown). Platform admins log in at `/login-owner` and land on `/admin/verification`. The login page honours `?redirect=` (validated with `safeRedirectPath`). |
| **Never `setState` from a state updater** | `setX(prev => { parentCallback(); return … })` runs the callback during render and updates the parent mid-render (React error). Compute the next value from current state, then call both. |
| **profiles is not client-writable** | `authenticated` can update only `display_name, phone, avatar_url`. Change `role`/`org_id` only from a Server Action using the service role after an `org_admin`/platform check. |
| **Toasts** | `sonner` via `components/ui/sonner.tsx`; `<Toaster />` is mounted in `app/layout.tsx`. |
| **Registration lives at `/register`** | Role choice first (`Book & Play` / `Register Your Club`), then only that role's form; `?role=`, `?club=` and `?next=` are honoured and the role is kept in the URL. `/signup-owner` just redirects to `/register?role=owner`. Owner path = the existing 4-step wizard. Player path = `registerPlayer()` in `lib/actions/player-auth.ts`: creates the auth user **already confirmed** (no email verification, same as owner signup; there is no `/auth/callback` route yet), inserts the `player` profile, deletes the auth user if that insert fails, then signs in via `signInPlayer`. Signed-in visitors are redirected away. |
| **A player is tied to ONE club** | `profiles.org_id` is NOT NULL, so the player form has a required "Your club" select (preselected from `?club=`). With no approved clubs the form is disabled and says why. Global player accounts (book anywhere as a member) would need `org_id` nullable plus changes to the bookings RLS policies and `create_booking()`. |
| **Never trust `?next=`** | Always pass it through `safeRedirectPath()` (`lib/safe-redirect.ts`): same-site single-slash paths only (blocks `//host`, backslashes, schemes). |
| **No client construction at module scope** | `lib/actions/owner-signup.ts` used to build `new Resend(...)` and the service-role client at import, so a missing `RESEND_API_KEY` or service key crashed anything that merely imported it (including `/register`). Build such clients inside the action. |
| **PostHog analytics (consent-gated, lazy)** | `components/providers/posthog-provider.tsx` (`PostHogProvider`, wraps `app/layout.tsx`; the old `app/providers.tsx`/`PHProvider` is gone). `posthog-js` is a dynamic `import()` that runs **only after the visitor accepts analytics** (`lib/consent.ts`, `components/consent/consent-banner.tsx`), so its chunk is never in the initial bundle and nothing is fetched or stored before consent or without `NEXT_PUBLIC_POSTHOG_KEY` + `_HOST`. **Do not import `posthog-js/react`**: it imports `posthog-js` statically. Details (guardrails, recordings, exclusions, class conventions) in the Observability section. |
| **Public pages use `createPublicClient()`** | `/courts` and `/courts/[orgId]` read as `anon` with an explicit column list. `anon` has column-level SELECT on `organizations` — `select('*')` will fail with `permission denied`. Pages using it need `export const dynamic = 'force-dynamic'`. |
| **BEFORE triggers fire alphabetically** | Name them with numeric prefixes (`trg_10_…`, `trg_20_…`) when order matters. |
| **`anonymous_bookers` unique on `(org_id, phone)`** | This constraint did **not** exist until `20260929000004` (earlier notes wrongly said it did, so `createAnonymousBooker`'s upsert would have errored). `anon` has no insert grant; guests are created only inside `create_booking()`. Phones are stored canonical `+216XXXXXXXX`. |
| **Realtime channels must be authenticated before they join** | In the browser, set the token on the Realtime socket first (`await supabase.realtime.setAuth(session.access_token)`), or the channel joins as `anon` and RLS-protected tables (`bookings`) deliver nothing while public ones (`court_slot_locks`) do. Subscribe through `lib/realtime/bookings-feed.ts` for `bookings`; do not open a second channel for the same table. |
| **Resend domain** | Sends from `noreply@shiftgrid.tn` — verify the domain in Resend before production. |
| **Windows + Docker + Supabase** | Local Supabase via Docker has config conflicts on this machine — use the hosted project. |
| **`Permissions-Policy` gates browser APIs** | Set in BOTH `next.config.ts` and `proxy.ts`. `geolocation=()` silently blocks `navigator.geolocation` site-wide (console: "Permissions policy violation") — it is now `geolocation=(self)`. Camera/mic stay `()`. Change both files together. |
| **One `layoutId` per visible group** | `activeSportTab` is owned by the landing `DiscoveryHub`. `CourtSlotMatrix` also uses it for its own tabs but hides them when given a `sport` prop (controlled mode). Never render two bars with the same id at once; wrap in `LayoutGroup id` as `DiscoveryHub` does. |
| **Static pages must not bake in "today"** | `/` prerenders at build time. Anything date-dependent is deferred behind `useSyncExternalStore` (`useHydrated`) with a Skeleton fallback — see `discovery-hub.tsx`. |
| **Supabase project pauses when idle** | Free-tier projects go `INACTIVE`. Type generation and queries fail until restored. |

---

## 🎨 Design System — Phase 2 Frontend Stack

Source of truth: **`DESIGN.md`** ("Craft" style reference). Tokens live in `app/globals.css`.
Stack: **Next.js App Router · Tailwind CSS v4 · shadcn UI · Framer Motion · lucide-react**.

### Design tokens

Two-tone flat surfaces. Hierarchy comes from the surface step, type scale, and whitespace — **never** from shadow.

| Token | Value | Role |
|---|---|---|
| `--background` | `#f7f5f2` Bone Linen | Page canvas — carries almost every section |
| `--card` / `--secondary` / `--muted` | `#eae6df` Oat Milk | Card surfaces, elevated panels |
| `--primary` / `--ring` | `#26d862` Lime Pulse | Primary action, links, focus, active nav |
| `--primary-foreground` | `#2a1a1d` Obsidian Plum | Text on the green fill |
| `--foreground` | `#2a1a1d` Obsidian Plum | Body copy, headings — 15.3:1 on canvas |
| `--muted-foreground` | `#645757` Ash Mauve | Captions, secondary labels |
| `--border` / `--input` | `#d7d2cc` Driftwood | Hairlines — reads as line work, not colour |
| `--success` | `#0e634f` Peacock Teal | Status badges, data emphasis |
| dark `--background` | `#1d3023` Forest Depths | Dark surface / hero |

**Rules:**
- **Lime Pulse is action-only.** Never body text, borders, or decorative fill; one primary action per viewport. Status/success uses **Peacock Teal** — hence `Badge`'s custom `success` variant.
- **Card separation via the `#f7f5f2` → `#eae6df` step**, not `box-shadow`.
- `--radius: 0.5rem` → **`rounded-lg` is the 8px system default** for cards and buttons. Nav and tags use `rounded-sm` (4px).
- Spacing base unit 8px; section gap 56–64px; card padding 16–24px; page max-width 1200px.

### Animation layer

**Framer Motion spring physics — `stiffness: 400`, `damping: 25`** — across all interactive cards, drawers, tabs, and slots.

- The canonical spring is exported as `SPRING` from `components/ui/motion-button.tsx`. **Import it; do not re-declare per component**, or the feel drifts.
- Compose via `Button asChild` + `motion.*` so the physics layer adds no style duplication — `motion-button.tsx` is the reference pattern.
- Type motion props with **`HTMLMotionProps<'button'>`, not `React.ComponentProps<'button'>`** — React's `onDrag`/`onAnimationStart` collide with Motion's same-named props.
- **Always gate on `useReducedMotion()`**; springs collapse to no-ops rather than shortened animations (WCAG 2.2, Milestone 12).

### Component standard

- **shadcn primitives are local source** in `components/ui/` — edit them directly, they are ours. Initialised with the `radix-nova` style (`components.json`).
- Installed: `button · card · dialog · sheet · tabs · badge · tooltip · skeleton · select · calendar · popover`, plus project-owned `input · label · textarea · scroll-area · slot-state · motion-button`.
- `radix-nova` imports `cn` from the **`cn` package** and primitives from the unified **`radix-ui`** package (not `@radix-ui/react-*`). `lib/utils.ts` is now just `export { cn } from "cn"`.
- Icons: **`lucide-react`** throughout.
- `tooltip` requires a `TooltipProvider` in `app/layout.tsx` — **not yet added**, do it before first tooltip use.

### Landing page (`app/page.tsx`)

`HeroSection` (Forest Depths container, all-Bone-Linen text per DESIGN.md, one Lime Pulse CTA) → `DiscoveryHub` (sport bar + Nearest / Best price / date-time filters + `CourtSlotMatrix`) → `HowItWorks` (4 cards, step 4 = Forest Depths callout).

**Placeholder content to replace with real data:** the "25k+ Active Players" stat, the "Tunis Padel Open" featured-match card, and all court data (`buildMockCourts`). "Nearest to me" runs real geolocation + haversine, but court coordinates are mocked in `MOCK_COURT_COORDS` because `organizations` has no lat/lng columns yet. Nav links `Facilities` / `Pricing` are in-page anchors until those pages exist.

> ⚠️ **Fonts are a known gap.** `DESIGN.md` specifies *ABC Arizona Flare* / *Condensed* (proprietary, not licensed here). Geist carries the system meanwhile, so the editorial serif character is not yet represented. Licensing or substituting those faces is unfinished design work.

> ⚠️ **Dark mode is partly derived.** `DESIGN.md` specifies only the Forest Depths canvas + Bone Linen ink pair; intermediate surface steps (`--card`, `--muted`, lifted `--success`) are derived and marked inline in `globals.css`. Needs a design review before being relied on.

---

## 🗄️ Migrations

**All 5 are applied to the hosted project `jxzzbnuuvueslieagcvp` (2026-09-29).**

| File | Contents |
|---|---|
| `20260907000000_initial_schema.sql` | 7 core tables, GiST exclusion, trigger chain, RLS helpers. Enables `uuid-ossp` (schema `extensions`), `pgcrypto`, `btree_gist`. |
| `20260914000001_verification_and_invites.sql` | org verification fields + `staff_invites` |
| `20260918000002_api_keys_and_security.sql` | `api_keys` + RPCs. **Repaired:** `STARTS WITH` → `starts_with()`, removed a grant on a nonexistent sequence. |
| `20260918000003_performance_indexes.sql` | **Rewritten:** the original referenced 14 nonexistent columns/tables and could never apply. |
| `20260928000004_court_pricing_and_city.sql` | `courts.price_per_hour` (TND), `organizations.city` |
| `20260929000000_backend_remediation.sql` | Fixes the 8 defects found by verification (see below) |
| `20260929000001_lock_down_trigger_functions.sql` | Revokes API-role EXECUTE on the 3 SECURITY DEFINER trigger functions; moves `btree_gist` to `extensions` |
| `20260929000004_booking_engine.sql` | `courts.night_surcharge_per_hour` / `night_starts_at`; **unique `(org_id, phone)` on `anonymous_bookers`** (never existed); `assign_court` now honours a chosen court; `create_booking()` RPC (service_role only) |
| `20260929000003_organization_coordinates.sql` | `organizations.latitude/longitude` (nullable, range + both-or-neither CHECKs), readable by `anon`. Signup now saves them, plus `city`. |
| `20260930000000_org_dashboard.sql` | `organizations.weekly_hours` (+ anon column grant); `create_booking()` gains `p_status`. Applied to hosted 2026-09-30, version re-aligned. |
| `20260930000001_admin_verification.sql` | `organizations.rejection_reason`; private `verification-docs` bucket. Applied to hosted, version re-aligned. |
| `20261001000000_service_role_grants.sql` | Grants `service_role` ALL on public tables/sequences/functions (+ default privileges). Applied to hosted 2026-10-01, version re-aligned. |
| `20261002000000_guest_cancel_token.sql` | `bookings.guest_cancel_token_hash` (unique, partial); `create_booking()` returns `cancel_token` for guest bookings. |
| `20261003000000_payments_and_shares.sql` | Sandbox `test` provider, `booking_shares`, payment RPCs (service_role only), refund-on-cancel. Applied to hosted, version re-aligned. |
| `20261004000000_notifications.sql` | `anonymous_bookers.email`; `notifications` outbox (service-role only, unique `dedupe_key`). Applied to hosted, version re-aligned. |
| `20261005000000_production_hardening.sql` | Revokes client writes on `organizations`, `payment_records`, `court_slot_locks`, anon SELECT on `bookings`; drops the player REST-insert policy on `bookings`. **Applied to hosted via MCP on 2026-10-03; its history row still carries the MCP timestamp, not `20261005000000` (re-alignment was denied in-session, do it with `supabase migration repair` or an UPDATE on `supabase_migrations.schema_migrations`).** |
| `20261002000001_lock_profile_columns.sql` | Clients may update only `display_name, phone, avatar_url` on `profiles` (closes self-promotion). |
| `20261001000001_cancellation_and_realtime.sql` | `bookings.cancellation_reason`; adds `bookings` + `court_slot_locks` to the realtime publication. Applied to hosted 2026-10-01, version re-aligned. |
| `20260929000002_bookings_policy_polish.sql` | `platform_admin` reads all bookings; INSERT split: players may only insert their own `pending_payment` booking, `org_admin`/`staff` keep org-scoped insert (walk-ins) |

> ✅ **Local and remote migration history are aligned** (7 versions, identical names). Done by editing `supabase_migrations.schema_migrations` — what `supabase migration repair` does — because the MCP `apply_migration` stamps its own timestamps. If you ever apply a migration via MCP again, re-align the version afterwards.

### Verified 2026-09-29 — 60/60 (rolled-back transactions, real `anon`/`authenticated` roles, 0 rows left behind)

Trigger chain + GiST (9/9) · RLS/security suite (51/51, one test re-run after I mis-specified its persona) · post-lockdown re-check (7/7).

### ✅ Defects found earlier — all fixed and re-verified

| # | Fix |
|---|---|
| 1 | Triggers renamed `trg_10_set_booking_times` → `trg_20_assign_court` (BEFORE triggers fire alphabetically); `assign_court` also derives the buffer end itself, so it no longer depends on order |
| 2 | `create_court_lock`, `handle_booking_cancellation`, `assign_court` are `SECURITY DEFINER` (players can now book **and cancel**). API roles have no EXECUTE on them — trigger functions need it only at `CREATE TRIGGER` time |
| 3 | `USING (true)` policy dropped. Invites are visible to the recipient (JWT email), to that org's `org_admin`, and to `platform_admin`. `staff` no longer sees invites. Token validation stays server-side (service role) |
| 4 | `staff_invites.updated_at` added |
| 5 | `generate_api_key` requires `platform_admin`, or `org_admin` **of the target org**; `anon` has no EXECUTE on any API-key RPC |
| 6 | `anon` can read approved orgs and active courts, **with column-level grants on `organizations`** so `verification_documents` (a public storage URL to the registration proof), `registry_number` and `verified_by` stay private. Public pages use `createPublicClient()` (`lib/supabase/public.ts`, anon role, no cookies) so logged-in and logged-out visitors see the same data |
| 7 | `DELETE` granted on `courts`/`bookings`, gated by RLS (`org_admin` own org, `platform_admin`) |
| 8 | `search_path = public, extensions` pinned on every custom function (advisor `function_search_path_mutable`: 12 → 0); `btree_gist` moved out of `public`. `anon` also lost `TRUNCATE/REFERENCES/TRIGGER` and SELECT on `profiles`, `payment_records`, `anonymous_bookers`, `staff_invites` |

### ✅ Also fixed (17/17 verified)

`platform_admin` now reads bookings across all orgs. Players can insert only `booker_profile_id = auth.uid()`, `booker_anon_id IS NULL`, `status = 'pending_payment'` (there is no `pending` value in the CHECK). A player also cannot flip their own booking to `confirmed` (the existing cancel policy's `WITH CHECK` covers it).

### 🟡 Still open

- Remaining advisor warnings are intentional: `user_org_id`/`user_role`/`org_is_approved` must stay callable (RLS policies invoke them as the caller); the API-key RPCs are `authenticated`-only and check role internally. **Leaked-password protection** is a dashboard setting.
- `listStaffInvites` still allows `staff` in its app-side role check, but RLS now returns nothing for them.

---

## 🧪 Verification Commands

```bash
npx tsc --noEmit     # type check (must be clean)
npm run lint         # eslint
npm run build        # Turbopack production build
```

---

*Last updated: 2026-09-28.*

*Phase 1 (refactor): docs consolidated into this file, Next 16 `proxy.ts` migration, Turbopack config, generated DB types, `tsc --noEmit` clean, production build green.*

*Phase 2 (frontend foundation): shadcn `radix-nova` primitives installed locally in `components/ui/`, DESIGN.md token system wired into `app/globals.css` (verified present in the production CSS bundle), Framer Motion spring layer established.*

*Milestone 2 is 100% complete. Milestone 3 is IN PROGRESS — next up is Task 8, wiring `components/courts/date-navigator.tsx` into real date navigation (week/month toggle, keyboard, URL state).*


---

# Plugin & MCP Management

Goal: keep tool/skill definitions loaded every turn minimal and relevant to **Next.js 16 · Supabase · Vercel · Playwright**. Audited 2026-10-03. Plugins are enabled globally in `~/.claude/settings.json`; this project narrows them with the checked-in **`.claude/settings.json`** (`enabledPlugins`). No project `.mcp.json` exists. Do not edit the global file for project-specific choices.

### Active (keep)
| Plugin | Why it stays |
|---|---|
| `supabase` | Migrations, advisors, SQL, logs on the hosted project `jxzzbnuuvueslieagcvp` |
| `vercel` | Deploy/env/logs; production target (large MCP, but its tools are deferred, so only names cost context) |
| `playwright` | Browser verification; complements `tests/*.spec.ts` |
| `typescript-lsp` | Strict TS codebase |
| `context7` | Library docs lookup (Next 16 docs themselves live in `node_modules/next/dist/docs/`) |
| `superpowers` | Process skills (brainstorming, debugging, verification) |
| `code-review`, `code-simplifier`, `security-guidance` | Review/quality/security, relevant to the RLS and rate-limit work |
| `claude-md-management` | Keeps this file current |
| `frontend-design` | UI work against `DESIGN.md` |

### Disabled for this project (`.claude/settings.json`)
| Plugin | Reason |
|---|---|
| `pyright-lsp` | No Python in the repo |
| `linkedin-agent` | 11 unrelated skills listed every turn |
| `github` | Fails to connect ("Authorization header is badly formatted"); fix the token before re-enabling, use `git`/`gh` meanwhile |
| `claude-mem` | Many MCP tools + hooks + a ~23k-token memory injection at session start; this file is the source of truth. Re-enable by deleting its line if cross-session recall is wanted |

### Not controllable from the project
- claude.ai connectors (Gmail, Google Drive, Notion, Claude Docs) and the `anthropic-skills:*` set are account-level. Turn them off in claude.ai → Settings → Connectors if the tokens matter.
- Unused marketplaces in `~/.claude/settings.json` (`ecc`, `21st-dev`, `ui-ux-pro-max-skill`) load nothing until a plugin is installed from them.

### Rules
- Add a plugin only for a concrete need in this stack; record it in the tables above in the same change.
- Prefer a project-level `enabledPlugins` override over editing the global file.
- Never put API keys in settings files that are committed. `~/.claude/settings.json` currently holds a plaintext `anthropicApiKey`; move it to an environment variable.
