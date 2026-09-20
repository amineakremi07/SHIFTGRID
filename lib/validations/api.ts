import { z } from 'zod'

// Organization creation validation
export const createOrganizationSchema = z.object({
  company_name: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  commercial_registration_number: z.string().min(5, 'Commercial registration number is required').max(50),
  tax_identification_number: z.string().min(5, 'Tax identification number is required').max(50),
  address: z.string().min(10, 'Full address is required').max(500),
  city: z.string().min(2, 'City is required').max(100),
  governorate: z.string().min(2, 'Governorate is required').max(100),
  phone: z.string().regex(/^\+?[0-9\s-]{8,20}$/, 'Invalid phone number format'),
  email: z.string().email('Invalid email address'),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  sports_types: z.array(z.string()).min(1, 'At least one sport type is required'),
  courts_count: z.number().int().min(1, 'At least 1 court required').max(100),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

// Staff invite validation
export const inviteStaffSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['org_admin', 'staff'], {
    errorMap: () => ({ message: 'Role must be org_admin or staff' }),
  }),
  organization_id: z.string().uuid('Invalid organization ID'),
})

// Verification document validation
export const uploadVerificationSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  document_type: z.enum(['commercial_registration', 'tax_card', 'authorization_letter', 'other']),
  file: z.instanceof(File).refine(
    (file) => file.size <= 10 * 1024 * 1024, // 10MB max
    'File size must be less than 10MB'
  ).refine(
    (file) => ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type),
    'File must be PDF, JPEG, or PNG'
  ),
})

// Court creation validation
export const createCourtSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  name: z.string().min(1, 'Court name is required').max(100),
  sport_type: z.string().min(1, 'Sport type is required').max(50),
  surface_type: z.string().optional(),
  description: z.string().max(1000).optional(),
  price_per_hour: z.number().min(0, 'Price must be positive'),
  is_active: z.boolean().default(true),
  operating_hours: z.object({
    open: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    close: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  }).optional(),
})

// Booking validation
export const createBookingSchema = z.object({
  court_id: z.string().uuid('Invalid court ID'),
  player_id: z.string().uuid('Invalid player ID'),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  total_price: z.number().min(0, 'Price must be positive'),
})

// API key creation validation
export const createApiKeySchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50),
  permissions: z.array(z.enum(['read', 'write', 'admin'])).min(1, 'At least one permission required'),
  expires_at: z.string().datetime({ offset: true }).optional(),
  rate_limit: z.number().int().min(1).max(10000).default(1000),
})

// Update organization validation
export const updateOrganizationSchema = createOrganizationSchema.partial()

// Pagination validation
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
})

// Type exports
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>
export type UploadVerificationInput = z.infer<typeof uploadVerificationSchema>
export type CreateCourtInput = z.infer<typeof createCourtSchema>
export type CreateBookingInput = z.infer<typeof createBookingSchema>
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>
export type PaginationInput = z.infer<typeof paginationSchema>