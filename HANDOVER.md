<!--
[GateGuard Facts]
1. Callers / References: passation.md:1, next session AI agents, human developers.
2. Existing Files: passation.md is the 12-milestone persistent roadmap; HANDOVER.md is the concrete session handover and execution state file.
3. Data format: Markdown document summarizing architecture, file inventory, UnifiedBooker schemas, edge cases, and CLI test commands.
4. User instruction verbatim: "Write detailed HANDOVER.md in project root summarizing: 1. Completed features & architecture decisions. 2. Modified/created files. 3. Current task in progress and exact next steps. 4. Any edge cases, known bugs, or test commands."
-->

# ShiftGrid — Project Handover & State Documentation

**Project Name:** ShiftGrid  
**Domain:** Multi-tenant Sports Court Booking SaaS (Padel, Football, Tennis)  
**Target Market:** Tunisia (Currency: `TND` / Tunisian Dinar)  
**Date:** September 20, 2026  
**Status:** Milestone 1 (100% Completed) | Milestone 2 (~85% Completed — Player Auth Modal + Session Wiring DONE; cookie expiry wired in middleware)

---

## 1. Completed Features & Architecture Decisions

### 1.1 Core Architecture & Stack
- **Framework:** Next.js 15 App Router (React 19, Server Components, Server Actions with `'use server'`).
- **Database & Backend:** Supabase (PostgreSQL 15+) with Row-Level Security (RLS) policies using helper functions `public.user_org_id()` and `public.user_role()`.
- **Client Tiering Strategy:**
  - `lib/supabase/client.ts`: Browser client via `createBrowserClient` from `@supabase/ssr`.
  - `lib/supabase/server.ts`: Server client with async `await cookies()` for Server Components and Server Actions.
  - `lib/supabase/optimized-client.ts`: Admin Service Role client (`createAdminClient` / `getSupabaseAdmin`) bypassing RLS for background and system tasks.
- **UI & State Management:** Tailwind CSS, Radix UI primitives, `lucide-react`, `react-hook-form` paired with `@hookform/resolvers/zod`.
- **Email Delivery:** Resend SDK integration for transactional emails (staff invitations, booking confirmations).

### 1.2 Multi-Tenant Organization & RBAC Model
- **Organizations (`organizations`):** Multi-tenant partitioning by `org_id` with support for custom subdomains and branding.
- **Roles Hierarchy:**
  - `platform_admin`: Super-administrator managing platform-wide settings and tenant organizations.
  - `org_admin`: Club owner/manager with full permissions over courts, pricing, staff, and bookings.
  - `staff`: Club employees with operational rights (court schedule management, on-site check-in).
  - `player`: Registered platform members booking slots across clubs.
- **Routing & Middleware (`middleware.ts`):**
  - Protected route gatekeeping: `/dashboard/*` restricted to authenticated `org_admin` and `staff`; `/admin/*` restricted to `platform_admin`.
  - Sliding-window in-memory rate limiting (60 requests/minute on `/api/*`).
  - Strict security headers (`HSTS`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`).

### 1.3 Concurrency & GiST Slot Locking Engine
- **Double-Booking Prevention:** PostgreSQL GiST exclusion constraint on `court_slot_locks` (`tstzrange`) preventing overlapping reservations at the database engine level.
- **Dual Booker Architecture (`bookings`):**
  - Constraint: `(booker_profile_id IS NOT NULL AND booker_anon_id IS NULL) OR (booker_profile_id IS NULL AND booker_anon_id IS NOT NULL)`.
  - Member bookers link to `profiles.id`.
  - Guest/walk-in bookers link to `anonymous_bookers.id` (storing `org_id`, `name`, `phone`).

### 1.4 Staff Management & Invitation Engine (Milestone 2 - Completed)
- **Tokenized Invites:** Cryptographic token generation via RPC (`generate_invite_token`), 48-hour expiration window.
- **Transactional Emails:** HTML email dispatch via Resend with dynamic acceptance links (`/accept-invite?token=...`).
- **Management UI:** `StaffInviteForm` and `StaffInvitesTable` supporting invite creation, resending with cooldown, and revocation.
- **Bug Fixes Completed:**
  - Fixed Next.js 15 named export error (`import Link from 'next/link'`) in `app/accept-invite/page.tsx`.
  - Controlled Radix UI `Select` integration using `react-hook-form` `<Controller />` in `components/staff/StaffInviteForm.tsx`.
  - Centralized and exported `getSupabaseAdmin = createAdminClient` in `lib/supabase/optimized-client.ts`.

---

## 2. Modified & Created Files Inventory

| File Path | Status | Role & Purpose |
| :--- | :--- | :--- |
| `passation.md` | Active | Persistent single source of truth across sessions tracking the 12-milestone roadmap. |
| `HANDOVER.md` | Active | Comprehensive architectural handover and execution guide. |
| `middleware.ts` | Active | Subdomain tenant routing, RBAC protection (`/dashboard`, `/admin`), rate limiting, security headers. |
| `lib/supabase/server.ts` | Active | Next.js 15 Server Supabase client using asynchronous cookie store. |
| `lib/supabase/client.ts` | Active | Client-side Supabase browser client. |
| `lib/supabase/optimized-client.ts` | Active | Admin client factory exporting `createAdminClient` and `getSupabaseAdmin`. |
| `lib/validations/player-auth.ts` | Active | Zod schemas for player sign-in, registration, and anonymous booker with Tunisian phone regex. |
| `lib/validations/api.ts` | Active | Form and API request validation schemas (`inviteStaffSchema`, etc.). |
| `lib/actions/staff-invites.ts` | Active | Server actions for staff invitation lifecycle (create, resend, cancel, accept). |
| `lib/actions/player-auth.ts` | **ACTIVE** | Server actions: signInPlayer, signUpPlayer, createAnonymousBooker — COMPLETED 2026-09-21 |
| `components/staff/StaffInviteForm.tsx` | Active | Controlled Radix modal form for staff invitation dispatch. |
| `components/staff/StaffInvitesTable.tsx` | Active | Table showing invite list, statuses, and action controls. |
| `components/auth/PlayerAuthModal.tsx` | Target | 3-tab modal component (Connexion, Inscription, Réservation Express) returning a unified booker. |
| `app/accept-invite/page.tsx` | Active | Public token consumption and account setup page for invited staff. |

---

## 3. Current Task in Progress & Exact Next Steps

### Current Milestone: Milestone 2 — Staff & Player Authentication (75% Done)

### Next Execution Steps:

#### Step 1: Implement `lib/actions/player-auth.ts`
Implement Server Actions for player authentication and anonymous guest booker creation:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import {
  playerSignInSchema,
  playerSignUpSchema,
  anonymousBookerSchema,
  PlayerSignInInput,
  PlayerSignUpInput,
  AnonymousBookerInput,
} from '@/lib/validations/player-auth'

export type UnifiedBooker = {
  type: 'member' | 'anonymous'
  id: string
  name: string
  phone: string
  email?: string
}

// 1. signInPlayer: Authenticate existing player via Supabase Auth
// 2. signUpPlayer: Register player, create profile record with phone and role 'player'
// 3. createAnonymousBooker: Upsert anonymous_bookers record by (org_id, phone), returning booker ID
```

#### Step 2: Implement `components/auth/PlayerAuthModal.tsx`
Create the player authentication and guest checkout modal:
- Radix UI `Dialog` with a 3-tab navigation:
  1. **Tab 1: Connexion (Sign In)** — Email and password inputs with "Se souvenir de moi".
  2. **Tab 2: Inscription (Sign Up)** — Full name, email, Tunisian phone number (`+216`), password.
  3. **Tab 3: Réservation Express (Guest Checkout)** — Full name and Tunisian phone number (zero password friction).
- Prop callback: `onSuccess: (booker: UnifiedBooker) => void`.

#### Step 3: Session Duration & Cookie Management
- Ensure 30-day cookie retention for "Remember Me" sessions on player login.
- Preserve session state across booking flow transitions.

#### Step 4: Validate Milestone 2 & Advance to Milestone 3
- Verify complete flow from public court view to booking identity capture.
- Update `passation.md` marking Milestone 2 at 100% and initiate **Milestone 3: Interactive Court Matrix & Real-time Slot Reservation Grid**.

---

## 4. Edge Cases, Known Constraints & Test Commands

### 4.1 Edge Cases & Defensive Patterns
1. **Tunisian Phone Format Variations:**
   - Handled via regex `/^(\+?216\s?|00216\s?)?[234579]\d{1}[\s.-]?\d{3}[\s.-]?\d{3}$/`.
   - Normalizes inputs like `98123456`, `+216 98 123 456`, and `0021698123456`.
2. **Anonymous Booker Deduplication:**
   - Upsert logic based on `(org_id, phone)` prevents duplicate guest rows while maintaining referential integrity across recurring guest bookings.
3. **Database Concurrency & Race Conditions:**
   - GiST exclusion locks return Postgres error code `23P01` (`exclusion_violation`). Catch this in server actions and return human-readable error: `"Ce créneau vient d'être réservé par un autre joueur."`
4. **Next.js 15 Cookie Store in Server Actions:**
   - Always access `await cookies()` inside Server Actions rather than calling synchronous store methods.

### 4.2 Test & Build Verification Commands
```bash
# Type check and production build
npm run build

# Run linting check
npm run lint

# Execute unit and validation tests
npm test
```
