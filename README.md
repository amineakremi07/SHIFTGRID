# ShiftGrid

A production-ready, multi-tenant SaaS platform for dynamic shift scheduling and sports court booking. Built for sports facilities (padel, tennis, football) in Tunisia.

## Tech Stack

- **Framework:** Next.js 15+ (App Router, Server Actions, React Server Components)
- **Language:** TypeScript (Strict mode)
- **Styling:** Tailwind CSS + Shadcn UI + Framer Motion
- **Database & Auth:** Supabase (PostgreSQL, Row-Level Security, Auth)
- **State & Forms:** React Hook Form + Zod
- **Deployment:** Vercel

## Project Status

### ✅ Milestone 1: Supabase Foundation + RLS (COMPLETED)

**Deliverables:**
- ✅ Complete database schema with 7 core tables
- ✅ Row-Level Security (RLS) policies for multi-tenant isolation
- ✅ PostgreSQL exclusion constraint for double-booking prevention
- ✅ Automated triggers (court assignment, time calculation, slot locking)
- ✅ Seed data script

**Key Features:**
- **Multi-tenancy:** Org-level isolation via RLS
- **Race-condition safety:** `court_slot_locks` table with GIST exclusion constraint
- **Automatic court assignment:** Triggers find next available court per sport
- **Time slot automation:** Booking duration + 15min buffer calculated automatically
- **Cancellation logic:** 24-hour deadline enforced at DB level

## Database Schema Overview

```
organizations (multi-tenant anchor)
  └── courts (padel/tennis/football)
  └── profiles (platform_admin | org_admin | staff | member)
  └── bookings
       ├── linked to: court, profile OR anonymous_booker
       └── payment_record
  └── court_slot_locks (atomic concurrency control)
```

### Sport-Specific Rules (Hardcoded)

| Sport    | Duration | Max Players | Buffer |
|----------|----------|-------------|--------|
| Padel    | 90 min   | 4           | 15 min |
| Tennis   | 60 min   | 2 or 4      | 15 min |
| Football | 90 min   | 12 or 14    | 15 min |

## Local Development Setup

### Prerequisites

- Node.js 18+ and npm
- Docker Desktop (for Supabase local development)
- Supabase CLI: `npm install -g supabase`

### Initial Setup

1. **Clone and install dependencies:**
   ```bash
   cd shiftgrid
   npm install
   ```

2. **Start Supabase local instance:**
   ```bash
   supabase start
   ```
   This will:
   - Start PostgreSQL, Auth, and Studio in Docker
   - Output connection details (save these!)
   - Open Supabase Studio at http://localhost:54323

3. **Run database migrations:**
   ```bash
   supabase db reset
   ```
   This applies the schema migration and runs seed data.

4. **Create test users in Supabase Studio:**
   - Open http://localhost:54323
   - Go to Authentication → Users → Add User
   - Create accounts for:
     - Platform Admin: `admin@shiftgrid.tn`
     - Org Admin: `owner@sportcity.tn`
     - Staff: `staff1@sportcity.tn`
     - Member: `member1@sportcity.tn`
   - Copy their UUIDs

5. **Seed user profiles:**
   - In Studio, go to SQL Editor
   - Open `supabase/seed.sql`
   - Uncomment profile INSERT statements
   - Replace placeholder UUIDs with actual user IDs
   - Run the SQL

6. **Set up environment variables:**
   ```bash
   cp .env.local.example .env.local
   ```
   Add Supabase credentials from `supabase start` output:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

7. **Start Next.js dev server:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Database Testing

### Test Double-Booking Prevention

```sql
-- Create two concurrent bookings for the same time
-- Only one should succeed; the other will fail with exclusion constraint violation

-- Booking 1 (should succeed)
INSERT INTO bookings (org_id, sport, booker_profile_id, starts_at, player_count, payment_method)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'padel',
  'YOUR_MEMBER_USER_ID',
  '2026-09-08 10:00:00+01'::timestamptz,
  4,
  'cash'
);

-- Booking 2 (should fail - overlaps with booking 1)
INSERT INTO bookings (org_id, sport, booker_profile_id, starts_at, player_count, payment_method)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'padel',
  'YOUR_MEMBER_USER_ID',
  '2026-09-08 10:30:00+01'::timestamptz, -- Overlaps with booking 1's buffer
  4,
  'cash'
);
-- Expected: ERROR - exclusion constraint "no_overlap_slots" violated
```

### Test RLS Policies

```sql
-- As a member, try to view another org's bookings
-- Should return 0 rows (RLS blocks cross-org access)

SET request.jwt.claims.sub = 'YOUR_MEMBER_USER_ID';
SELECT * FROM bookings WHERE org_id != '00000000-0000-0000-0000-000000000001';
-- Expected: 0 rows
```

## Project Structure

```
shiftgrid/
├── app/                    # Next.js App Router (Milestone 2+)
├── supabase/
│   ├── migrations/
│   │   └── 20260907000000_initial_schema.sql
│   ├── seed.sql
│   └── config.toml
├── components/             # React components (Milestone 3+)
├── lib/                    # Utilities, Supabase client (Milestone 2+)
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Next Milestones

- **Milestone 2:** Auth Flow + RBAC Middleware
- **Milestone 3:** Platform Admin Onboarding Form
- **Milestone 4:** Booking Engine (Member Flow)
- **Milestone 5:** Anonymous Booking Flow
- **Milestone 6:** Cancellation + Refund Logic
- **Milestone 7:** Staff Mobile Panel
- **Milestone 8:** Org Admin Dashboard
- **Milestone 9:** Stripe + Payment Abstraction
- **Milestone 10:** Notifications + Reminders
- **Milestone 11:** UI Polish + Framer Motion
- **Milestone 12:** Deployment + CI/CD

## License Model

- **Lifetime license** per organization (one-time payment)
- Manual onboarding by platform admin
- No self-signup for organizations

## Currency

All prices in **TND (Tunisian Dinar)**. Payment providers:
- Stripe (MVP, for learning)
- Cash on arrival
- ClickToPay (future swap)

---

Built with ❤️ for Tunisian sports facilities
   