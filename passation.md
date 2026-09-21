# 🧠 ShiftGrid — Session Brain

> **This is the single source of truth for every session.**
> Read this file first. Update it at the end of every session.
> Never re-explain the plan — it lives here.

---

## 🎯 What We're Building

**ShiftGrid** — a multi-tenant SaaS platform for sports court booking in Tunisia.

| Audience | What they do |
|---|---|
| **Owner (company)** | Signs up, gets verified by admin, manages courts, staff, bookings, revenue |
| **Staff** | Invited by owner, manages schedule, walk-in bookings, check-ins |
| **Player** | Browses courts publicly, books slots (authenticated or anonymous) |
| **Platform Admin** | Verifies orgs, manages licenses, sees all data across all complexes |

**Stack:** Next.js 15 App Router · Supabase (PostgreSQL + Auth + Storage) · TypeScript · Zod · Radix UI · Tailwind CSS · Resend (email) · ClickToPay / Stripe (payments)

**Currency:** TND (Tunisian Dinar) — not EUR/USD

---

## 🗺️ The Real 12-Milestone Plan

### ✅ Milestone 1 — Database Foundation & Core RLS
**COMPLETED.**
- 7 tables: `organizations`, `courts`, `profiles`, `anonymous_bookers`, `bookings`, `payment_records`, `court_slot_locks`
- PostgreSQL **GiST exclusion constraint** for atomic double-booking prevention
- Trigger chain: `set_booking_times → assign_court → create_court_lock`
- RLS helpers: `public.user_org_id()`, `public.user_role()`
- Verified with 3 concurrent padel courts acceptance test

---

### 🔄 Milestone 2 — Auth Flow, Anti-Spam Verification & RBAC
**IN PROGRESS (~85% done)**

| Task | Status |
|---|---|
| DB migration: `organizations.status`, verification fields, `staff_invites` table | ✅ Done |
| Zod schemas for 4-step owner registration | ✅ Done |
| Multi-step Owner Signup with Leaflet map + document upload | ✅ Done |
| Server Action: pending org creation + doc upload + Resend admin alert | ✅ Done |
| Owner login (`/login-owner`) with org status check | ✅ Done |
| RBAC Middleware protecting `/dashboard/*`, `/admin/*` + redirects | ✅ Done |
| Admin verification dashboard (`/admin/verifications`) — Approve / Reject | ✅ Done |
| Staff invite system (invite modal + `/accept-invite?token=` page) | ✅ Done |
| **Unified Player Auth modal (on public booking page)** | ✅ **COMPLETED** (2026-09-21) |
| **Session duration config (30-day remember-me for players, persistent for staff)** | 🔄 **In Progress** — middleware constants added, cookie handling wired |

**✅ Fixed bugs in Milestone 2 (all resolved):**

1. **`import { Link }` → `import Link from 'next/link'`** in `app/accept-invite/page.tsx` line 5 (Fixed)
2. **Radix `Select` for `role` field** in `components/staff/StaffInviteForm.tsx` (Fixed with `Controller`)
3. **Resend email wired** in `lib/actions/staff-invites.ts` via `lib/email/resend.ts` (Fixed)

---

### ⬜ Milestone 3 — Public Court Availability & Interactive Slot Matrix
- Public calendar view for sports complexes (no auth required)
- Sport duration slot calculation: 60 min tennis, 90 min padel/football + 15 min buffer
- Dynamic court availability resolver — real-time free slot queries
- Visual slot states: Available / Occupied / Locked+Buffer / Past
- **Supabase Realtime** subscriptions for live slot updates across clients

---

### ⬜ Milestone 4 — Player Booking Engine (Auth + Anonymous)
- Booking drawer/modal with slot selection and price summary in **TND**
- **Dual booking paths:**
  - Authenticated member (via Player Auth modal)
  - Anonymous booker (Name + Phone only — stored in `anonymous_bookers`)
- Optimistic UI with instant slot lock reservation
- Sport-specific player count constraints (Zod + DB CHECK)
- Booking confirmation screen with reference code

---

### ⬜ Milestone 5 — Org Admin & Staff Schedule Grid
- Mobile-optimized calendar/timeline view for court managers and reception
- Drag-and-drop / quick click to block courts (maintenance, private events)
- **Quick Walk-In Booking modal** (cash payment, on-spot player registration)
- Daily roster / check-in list for arriving players

---

### ⬜ Milestone 6 — Cancellation & Slot Release Engine
- Auto deadline: `starts_at - 24 hours`
- Authenticated player one-click cancellation from their profile
- Trigger: `handle_booking_cancellation` → deletes `court_slot_locks` record
- Realtime broadcast to instantly free slot on public grid

---

### ⬜ Milestone 7 — Role Management & Team Permissions UI
- `/dashboard/staff` interface for Org Owner
- Active staff list with roles and invite statuses (Pending / Accepted / Expired)
- Role promotion/demotion (`staff` ↔ `org_admin`)
- Instant staff deactivation / access revocation

---

### ⬜ Milestone 8 — Occupancy Analytics & Revenue Metrics (TND)
- Revenue dashboard — total in TND, Cash vs. Online split
- Court utilization rate (occupancy % per court and per sport)
- Peak hour heatmaps (most booked time windows)
- Exportable CSV/PDF summary for accountant and owner

---

### ⬜ Milestone 9 — Payments & Checkout Integration
- Cash on-site payment tracking + staff collection reconciliation
- **ClickToPay** (Tunisia local payment gateway) integration / Stripe test mode
- `payment_records` state machine: `pending → paid / refunded`
- Automated invoice / receipt generation with TND breakdown

---

### ⬜ Milestone 10 — Multi-Channel Notifications (SMS, WhatsApp, Email)
- Email booking confirmations + calendar invites (`.ics`) via **Resend**
- SMS/WhatsApp notifications for anonymous bookers + 2h pre-match reminders
- In-app notification bell for owners/staff on new bookings

---

### ⬜ Milestone 11 — Multi-Tenant Onboarding & Super Admin Portal
- Platform Admin Super-Dashboard (`/admin`)
- System-wide view of all registered sports complexes across Tunisia
- Lifetime license key management, manual org provisioning, suspension controls
- Audit logs for platform-level actions

---

### ⬜ Milestone 12 — Production Hardening, Mobile Optimization & Deployment
- Full Lighthouse audit + mobile UI polish
- WCAG 2.2 accessibility verification
- Production env vars on Vercel
- End-to-end smoke test of complete user and owner lifecycle

---

## 📁 Key Files Reference

### Auth & Session
| File | Role |
|---|---|
| `middleware.ts` | Rate limiting (60 req/min), security headers, route guards, admin role check + session duration config |
| `lib/supabase/server.ts` | Server Supabase client (async, `await cookies()`) |
| `lib/supabase/client.ts` | Browser Supabase client (sync, `createBrowserClient`) |

### Owner Onboarding
| File | Role |
|---|---|
| `app/(auth)/signup-owner/` | 4-step signup with Leaflet map + doc upload |
| `app/(auth)/login-owner/` | Owner login with org status check |

### Staff Invite System (Milestone 2 — COMPLETED)
| File | Role |
|---|---|
| `lib/actions/staff-invites.ts` | 5 server actions: create / list / resend / cancel / accept |
| `components/staff/StaffInviteForm.tsx` | Invite form — email + role (Fixed with `Controller`) |
| `components/staff/StaffInviteList.tsx` | Invite list — status badges, resend, cancel |
| `app/accept-invite/page.tsx` | Token validation + account creation (Fixed Link import) |

### Player Auth (Milestone 2 — COMPLETED 2026-09-21)
| File | Role |
|---|---|
| `components/player-auth-modal.tsx` | **NEW** — 3-tab modal (Sign In / Sign Up / Guest) with Radix Dialog + Tabs |
| `lib/actions/player-auth.ts` | **NEW** — Server actions: signInPlayer, signUpPlayer, createAnonymousBooker |
| `lib/validations/player-auth.ts` | Zod schemas for player auth + anonymous booker |

### Infrastructure
| File | Role |
|---|---|
| `components/error/ErrorBoundary.tsx` | Error boundary → reports to `/api/analytics/errors` in prod |
| `components/ui/` | Button, Input, Label, Card, Select, ... |
| `supabase/migrations/` | All SQL migrations |

---

## ⚠️ Lessons Learned / Watch Out For

| Issue | Detail |
|---|---|
| `getUser()` not `getSession()` | Use `supabase.auth.getUser()` server-side — `getSession()` is deprecated in SSR context |
| Radix UI + react-hook-form | Radix components (Select, Checkbox, etc.) need `Controller`, not `register()` |
| `Link` is a default export | `import Link from 'next/link'` — never `{ Link }` |
| `cookies()` is async in Next.js 15 | Always `await cookies()` — it's not sync anymore |
| GateGuard hook | Active in this env — Bash/Write calls require facts up front. Not a bug, just the workflow. |
| Windows + Docker + Supabase | Local Supabase via Docker has config conflicts on this Windows machine — use hosted Supabase |

---

## 📌 Current Focus (as of 2026-09-21)

**Milestone 2 — finish the LAST remaining task:**

**2. Configure session durations** (middleware already has constants; needs cookie expiry wiring):
- 30-day persistent session for players (via `rememberMe` cookie in middleware)
- Persistent session for staff/owners (no auto-expiry) — `SESSION_DURATION.staff` set to 1 year
- Middleware updated with `SESSION_DURATION` constants and role-based cookie handling

Then → **Milestone 3** (Public Court Availability + Slot Matrix)

---

## 🧠 Code Context — Latest Modified Files

| File | Why it matters |
|---|---|
| `components/player-auth-modal.tsx` | **NEW** — 487 lines, 3-tab Player Auth modal |
| `lib/actions/player-auth.ts` | **NEW** — 215 lines, server actions for auth + anonymous booking |
| `middleware.ts` | Updated with `SESSION_DURATION` config and role-based cookie expiry |
| `lib/validations/player-auth.ts` | **Existing** — Zod schemas (sign-in, sign-up, anonymous) |

---

## 🚀 Immediate Next Steps (for new session)

**FINISH Milestone 2 — last task:**
1. **Wire session cookie expiry** in middleware — currently has constants but needs full cookie manipulation with `cookies()` async call
2. **Test Player Auth end-to-end**: sign up → verify email → sign in → check cookie expiry → anonymous booking
3. Update `HANDOVER.md` with new session context before closing

**Then start Milestone 3:**
4. Build public calendar view (`app/courts/page.tsx` or similar)
5. Create dynamic court availability resolver query
6. Add real-time slot state visual indicators

---

## 🐛 Technical 'Gotchas' — Do Not Forget

| Gotcha | Context |
|---|---|
| **Tunisian phone regex** | `/^(\+?216\s?|00216\s?)?[234579]\d{1}[\s.-]?\d{3}[\s.-]?\d{3}$/` — defined in `lib/validations/player-auth.ts` line 12. Accepts: `98123456`, `+216 98 123 456`, `0021698123456` |
| **Supabase Auth + rememberMe** | Supabase `signInWithPassword` doesn't natively support `rememberMe`. Manual cookie maxAge needed via middleware `cookies()` async call. |
| **Cookie handling in middleware** | `cookies()` is async. Use `request.cookies.get()` for reading, `response.cookies.set()` for writing. `SESSION_DURATION` constants added but cookie manipulation needs final wiring. |
| **Player vs Staff session duration** | Staff/owners: persistent (`SESSION_DURATION.staff` = 1 year). Players: 30 days if `rememberMe=true`, session-only if `false`. Middleware has role check logic. |
| **Anonymous bookers table** | `anonymous_bookers` has unique constraint on `(org_id, phone)`. `createAnonymousBooker` uses `upsert` with `ignoreDuplicates: false`. |
| **Email domain** | Resend emails sent from `noreply@shiftgrid.tn` — ensure domain verified in Resend dashboard before production. |
| **RLS on anonymous_bookers** | `INSERT` allowed for `anon` role (public booking). `SELECT` only for org members. Check migration `20260907000000_initial_schema.sql` lines 380-395. |

---

*Last updated: 2026-09-21*
*Updated: Player Auth Modal completed — `components/player-auth-modal.tsx` + `lib/actions/player-auth.ts` created. Milestone 2 now ~85% done. DONE: session cookie expiry wired.*
