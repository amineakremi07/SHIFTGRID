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
export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'completed'
export type PaymentMethod = 'online' | 'cash'
export type PaymentProvider = 'stripe' | 'cash' | 'clicktopay'
export type PaymentStatus = 'pending' | 'paid' | 'refunded'
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
          sport_types: Sport[]
          timezone: string
          status: OrgStatus
          verification_documents: Json | null
          registry_number: string | null
          verified_at: string | null
          verified_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          address?: string | null
          city?: string | null
          sport_types?: Sport[]
          timezone?: string
          status?: OrgStatus
          verification_documents?: Json | null
          registry_number?: string | null
          verified_at?: string | null
          verified_by?: string | null
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
        Relationships: []
      }

      anonymous_bookers: {
        Row: {
          id: string
          org_id: string
          name: string
          phone: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          phone: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['anonymous_bookers']['Insert']>
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
        Relationships: []
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
