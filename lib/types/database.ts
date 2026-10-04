/**
 * ShiftGrid database types.
 *
 * SOURCE OF TRUTH: supabase/migrations/*.sql
 *
 * These are derived from the committed migrations rather than generated from a
 * live database, because the hosted project currently has no schema applied
 * (0 tables, 0 migrations). Once the migrations are pushed, regenerate with:
 *
 *   supabase gen types typescript --project-id <ref> > lib/types/database.ts
 *
 * Keep the two in sync — every Supabase client in lib/supabase/ is parameterized
 * with this type, so drift here silently mistypes the whole data layer.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Sport = 'padel' | 'tennis' | 'football'
export type UserRole = 'platform_admin' | 'org_admin' | 'staff' | 'player'
export type OrgStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type CourtStatus = 'active' | 'maintenance'
/** Where a booking came from: the public flow, or staff at the desk / on the phone. */
export type BookingSource = 'online' | 'manual' | 'phone'

export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
export type PaymentMethod = 'online' | 'cash'
export type PaymentProvider = 'stripe' | 'cash' | 'clicktopay' | 'test'
export type PaymentStatus = 'pending' | 'paid' | 'refunded'
export type NotificationKind = 'booking_confirmation' | 'split_invite' | 'cancellation' | 'reminder_2h'
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped'
export type InviteRole = 'org_admin' | 'staff'

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          address: string | null
          city: string | null
          latitude: number | null
          longitude: number | null
          /** The club's bio, shown on its public page (max 1000 characters). */
          description: string | null
          /** Public URLs of the club's photos in the `club-assets` bucket, in display order (max 12). */
          gallery_urls: string[]
          /** Per-weekday hours (lib/operating-hours.ts). Null = use each court's own hours. */
          weekly_hours: Json | null
          sport_types: Sport[]
          timezone: string
          status: OrgStatus
          verification_documents: Json | null
          registry_number: string | null
          verified_at: string | null
          verified_by: string | null
          /** Shown to the owner when status is 'rejected'. Private (not granted to anon). */
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          address?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          description?: string | null
          gallery_urls?: string[]
          weekly_hours?: Json | null
          sport_types?: Sport[]
          timezone?: string
          status?: OrgStatus
          verification_documents?: Json | null
          registry_number?: string | null
          verified_at?: string | null
          verified_by?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
        Relationships: []
      }

      courts: {
        Row: {
          id: string
          org_id: string
          sport: Sport
          name: string
          status: CourtStatus
          open_time: string
          close_time: string
          /** Hourly rate in TND. */
          price_per_hour: number
          night_surcharge_per_hour: number
          night_starts_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          sport: Sport
          name: string
          status?: CourtStatus
          price_per_hour?: number
          night_surcharge_per_hour?: number
          night_starts_at?: string
          open_time?: string
          close_time?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['courts']['Insert']>
        Relationships: []
      }

      profiles: {
        Row: {
          id: string
          /** NOTE: `org_id` — NOT `organization_id`. `api_keys` uses the long form. */
          org_id: string
          role: UserRole
          /** NOTE: `display_name` — there is no `full_name` column. */
          display_name: string
          phone: string | null
          avatar_url: string | null
          /** Starts at 100; -30 per no-show (floor 0). Written only by mark_booking_no_show(). */
          trust_score: number
          no_show_count: number
          /** Three no-shows suspend the account for 30 days; create_booking() refuses it meanwhile. */
          is_suspended: boolean
          suspended_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          org_id: string
          role: UserRole
          display_name: string
          phone?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'profiles_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }

      anonymous_bookers: {
        Row: {
          id: string
          org_id: string
          name: string
          /** Null for a desk customer who gave a name only (staff bookings). */
          phone: string | null
          email: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          phone?: string | null
          email?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['anonymous_bookers']['Insert']>
        Relationships: []
      }

      /**
       * Explicit organization memberships. The ONLY way an account gets a second club: there is no
       * global admin access. Users read their own rows; writes are service-role only (and a trigger
       * on `profiles` keeps the profile's own organization listed). `profiles.(org_id, role)` is the
       * ACTIVE context, moved by switch_active_organization().
       */
      organization_members: {
        Row: { user_id: string; org_id: string; role: 'org_admin' | 'staff' | 'platform_admin'; created_at: string }
        Insert: { user_id: string; org_id: string; role: 'org_admin' | 'staff' | 'platform_admin'; created_at?: string }
        Update: Partial<{ user_id: string; org_id: string; role: 'org_admin' | 'staff' | 'platform_admin'; created_at: string }>
        Relationships: []
      }

      /** Staff-only notes on a booking. No client grant: read and written with the service role. */
      booking_notes: {
        Row: { booking_id: string; org_id: string; note: string; created_at: string }
        Insert: { booking_id: string; org_id: string; note: string; created_at?: string }
        Update: Partial<{ booking_id: string; org_id: string; note: string; created_at: string }>
        Relationships: []
      }

      bookings: {
        Row: {
          id: string
          org_id: string
          court_id: string | null
          sport: Sport
          booker_profile_id: string | null
          booker_anon_id: string | null
          starts_at: string
          ends_at: string
          buffer_ends_at: string
          player_count: number
          status: BookingStatus
          payment_method: PaymentMethod
          cancellation_deadline: string
          cancellation_reason: string | null
          /** SHA-256 of the guest's cancel token (never the token itself). Guests only. */
          guest_cancel_token_hash: string | null
          /** 6 digits shown to the player; staff type it (or scan its QR) at reception. */
          check_in_code: string | null
          checked_in_at: string | null
          source: BookingSource
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          court_id?: string | null
          sport: Sport
          booker_profile_id?: string | null
          booker_anon_id?: string | null
          /** Trigger-computed; only starts_at is supplied by callers. */
          starts_at: string
          ends_at?: string
          buffer_ends_at?: string
          player_count: number
          status?: BookingStatus
          payment_method: PaymentMethod
          cancellation_deadline?: string
          cancellation_reason?: string | null
          guest_cancel_token_hash?: string | null
          check_in_code?: string | null
          checked_in_at?: string | null
          source?: BookingSource
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>
        Relationships: []
      }

      payment_records: {
        Row: {
          id: string
          booking_id: string
          amount: number
          currency: string
          provider: PaymentProvider
          status: PaymentStatus
          paid_at: string | null
          stripe_intent_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          amount: number
          currency?: string
          provider: PaymentProvider
          status?: PaymentStatus
          paid_at?: string | null
          stripe_intent_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['payment_records']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'payment_records_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
        ]
      }

      booking_shares: {
        Row: {
          id: string
          booking_id: string
          share_no: number
          amount: number
          status: PaymentStatus
          is_organizer: boolean
          invite_token_hash: string | null
          payer_name: string | null
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        /** Written only by the server (service role); clients can read, never write. */
        Insert: {
          id?: string
          booking_id: string
          share_no: number
          amount: number
          status?: PaymentStatus
          is_organizer?: boolean
          invite_token_hash?: string | null
          payer_name?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_shares']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'booking_shares_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
        ]
      }

      notifications: {
        Row: {
          id: string
          kind: NotificationKind
          booking_id: string | null
          recipient: string
          subject: string
          status: NotificationStatus
          attempts: number
          last_error: string | null
          provider_id: string | null
          payload: Json | null
          dedupe_key: string | null
          created_at: string
          sent_at: string | null
        }
        /** Written only by the server (service role). */
        Insert: {
          id?: string
          kind: NotificationKind
          booking_id?: string | null
          recipient: string
          subject: string
          status?: NotificationStatus
          attempts?: number
          last_error?: string | null
          provider_id?: string | null
          payload?: Json | null
          dedupe_key?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'notifications_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
        ]
      }

      court_slot_locks: {
        Row: {
          court_id: string
          occupied_from: string
          occupied_until: string
          booking_id: string
        }
        Insert: {
          court_id: string
          occupied_from: string
          occupied_until: string
          booking_id: string
        }
        Update: Partial<Database['public']['Tables']['court_slot_locks']['Insert']>
        Relationships: []
      }

      staff_invites: {
        Row: {
          id: string
          org_id: string
          email: string
          role: InviteRole
          invited_by: string
          token: string
          expires_at: string
          accepted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          email: string
          role: InviteRole
          invited_by: string
          token: string
          expires_at: string
          accepted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['staff_invites']['Insert']>
        Relationships: []
      }

      api_keys: {
        Row: {
          id: string
          /** NOTE: `organization_id` here, unlike `profiles.org_id`. */
          organization_id: string
          name: string
          key_hash: string
          prefix: string
          permissions: string[]
          rate_limit: number
          expires_at: string | null
          last_used_at: string | null
          is_active: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          key_hash: string
          prefix: string
          permissions?: string[]
          rate_limit?: number
          expires_at?: string | null
          last_used_at?: string | null
          is_active?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['api_keys']['Insert']>
        Relationships: []
      }
    }

    Views: Record<never, never>

    Functions: {
      create_booking: {
        Args: {
          p_amount: number
          p_court_id: string
          p_guest_name?: string
          p_guest_phone?: string
          p_org_id: string
          p_player_count: number
          p_profile_id?: string
          p_sport: string
          p_starts_at: string
          p_status?: 'pending_payment' | 'confirmed'
          p_source?: BookingSource
          /** Staff-only note, stored in booking_notes (never readable by the player). */
          p_notes?: string
          /** Cash already taken at the desk: the payment record is created as paid. */
          p_paid?: boolean
        }
        Returns: Json
      }
      settle_booking_online: {
        Args: { p_booking_id: string; p_provider: string }
        Returns: Json
      }
      create_booking_shares: {
        Args: { p_booking_id: string; p_provider: string; p_share_count: number }
        Returns: Json
      }
      pay_booking_share: {
        Args: { p_token_hash: string; p_provider: string; p_payer_name?: string }
        Returns: Json
      }
      mark_cash_paid: {
        Args: { p_booking_id: string; p_org_id: string }
        Returns: Json
      }
      check_in_booking: {
        Args: { p_org_id: string; p_code?: string; p_booking_id?: string }
        Returns: Json
      }
      switch_active_organization: {
        Args: { p_user_id: string; p_org_id: string }
        Returns: Json
      }
      mark_booking_no_show: {
        Args: { p_org_id: string; p_booking_id: string }
        Returns: Json
      }
      user_org_id: {
        Args: Record<string, never>
        Returns: string
      }
      user_role: {
        Args: Record<string, never>
        Returns: string
      }
      get_sport_duration: {
        Args: { sport_type: string }
        Returns: unknown
      }
      generate_invite_token: {
        Args: Record<string, never>
        Returns: string
      }
      generate_api_key: {
        Args: {
          p_organization_id: string
          p_name: string
          p_permissions: string[]
          p_rate_limit: number
          p_expires_at?: string | null
        }
        Returns: {
          id: string
          name: string
          key: string
          prefix: string
          permissions: string[]
          created_at: string
        }[]
      }
      verify_api_key: {
        Args: { input_key: string }
        Returns: {
          valid: boolean
          organization_id: string | null
          permissions: string[]
          rate_limit: number
          error: string | null
        }[]
      }
      revoke_api_key: {
        Args: { p_key_id: string }
        Returns: undefined
      }
    }

    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

/** Convenience row aliases. */
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Court = Database['public']['Tables']['courts']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type AnonymousBooker = Database['public']['Tables']['anonymous_bookers']['Row']
export type Booking = Database['public']['Tables']['bookings']['Row']
export type PaymentRecord = Database['public']['Tables']['payment_records']['Row']
export type CourtSlotLock = Database['public']['Tables']['court_slot_locks']['Row']
export type StaffInviteRow = Database['public']['Tables']['staff_invites']['Row']
export type ApiKey = Database['public']['Tables']['api_keys']['Row']
