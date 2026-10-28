const { z } = require('zod');
const { CATEGORY_VALUES, SERVICE_MODE_VALUES } = require('./business');

/**
 * Centralised input validation schemas.
 * Strict bounds prevent oversized payloads (DoS) and weird Unicode injection.
 */

const Category = z.enum(CATEGORY_VALUES);
const ServiceMode = z.enum(SERVICE_MODE_VALUES);

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'email trop court')
  .max(254, 'email trop long')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'email invalide');

const Pseudonym = z.string().trim().min(2, 'pseudonyme trop court').max(40, 'pseudonyme trop long');

// Accept the new 8-char code (A-HJ-NP-Z2-9) AND the legacy 5-digit code so
// existing accounts keep working (audit FP-03). Uppercased before matching.
const ClientCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(\d{5}|[A-HJ-NP-Z2-9]{8})$/, 'code de connexion invalide');

const PartnerCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{8}$/, 'code à 8 caractères requis');

const AdminCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{12}$/, 'code admin à 12 caractères requis');

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);

const Phone = z
  .string()
  .trim()
  .max(20, 'téléphone trop long')
  .regex(/^[0-9 +.()/-]{6,}$/, 'téléphone invalide')
  .optional()
  .or(z.literal(''));

// ---------- Auth ----------
const clientSignupSchema = z.object({
  pseudonym: Pseudonym,
  email: Email.optional().or(z.literal('')),
  consent: z.boolean().refine((v) => v === true, 'consentement RGPD requis'),
});

const clientLoginSchema = z.object({
  code: ClientCode,
});

// Recovery: email only; the server rotates the code and emails a new one
// (audit FP-03). Always answered 200 to avoid account enumeration.
const clientRecoverSchema = z.object({
  email: Email,
});

const partnerSignupSchema = z.object({
  ownerName: z.string().trim().min(2).max(80),
  companyName: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  lat: Lat.optional(),
  lng: Lng.optional(),
  email: Email,
  phoneFixed: Phone,
  phoneMobile: Phone,
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((u) => /^https:\/\//i.test(u), 'URL image : seul https est autorisé')
    .optional()
    .or(z.literal('')),
  // Business domain + how they serve customers (audit: client filters).
  // Optional for backward-compat with older clients; defaulted server-side.
  category: Category.optional(),
  serviceMode: ServiceMode.optional(),
  consent: z.boolean().refine((v) => v === true, 'consentement RGPD requis'),
});

const partnerLoginSchema = z.object({
  code: PartnerCode,
});

const adminLoginSchema = z.object({
  code: AdminCode,
});

const refreshSchema = z.object({
  sessionId: z.string().uuid(),
  refreshToken: z.string().min(20).max(200),
});

// ---------- Loyalty ----------
const scanQrSchema = z.object({
  qrToken: z.string().min(20).max(1000),
});

// Redeem is gated by the client's live QR (audit FP-08): same token shape
// as a scan, not a raw clientId.
const redeemSchema = z.object({
  qrToken: z.string().min(20).max(1000),
});

// ---------- Partner ----------
// Partner self-service settings: rewards + (optionally) their category and
// service mode. category/serviceMode are optional so the reward-only form
// keeps working unchanged.
// A discount needs its percentage (audit A-14).
const updateRewardSchema = z
  .object({
    rewardThreshold: z.number().int().min(1).max(1000),
    rewardType: z.enum(['free_meal', 'discount']),
    rewardValue: z.number().int().min(1).max(100).optional(),
    category: Category.optional(),
    serviceMode: ServiceMode.optional(),
  })
  .refine((o) => o.rewardType !== 'discount' || o.rewardValue != null, {
    message: 'pourcentage de réduction requis',
    path: ['rewardValue'],
  });

// ---------- Admin ----------
const PhoneOpt = z
  .string()
  .trim()
  .max(20)
  .regex(/^[0-9 +.()/-]{6,}$/, 'téléphone invalide')
  .optional()
  .or(z.literal(''));

// Admin edit of a partner — every field optional; only provided fields change.
const adminPartnerUpdateSchema = z
  .object({
    ownerName: z.string().trim().min(2).max(80).optional(),
    companyName: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().min(5).max(300).optional(),
    lat: Lat.optional(),
    lng: Lng.optional(),
    phoneFixed: PhoneOpt,
    phoneMobile: PhoneOpt,
    imageUrl: z
      .string()
      .trim()
      .max(500)
      .url()
      .refine((u) => /^https:\/\//i.test(u), 'URL image : seul https est autorisé')
      .optional()
      .or(z.literal('')),
    category: Category.optional(),
    serviceMode: ServiceMode.optional(),
    rewardThreshold: z.number().int().min(1).max(1000).optional(),
    rewardType: z.enum(['free_meal', 'discount']).optional(),
    rewardValue: z.number().int().min(1).max(100).nullable().optional(),
    status: z.enum(['pending', 'approved', 'suspended']).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'aucun champ à modifier')
  .refine((o) => !(o.rewardType === 'discount' && o.rewardValue === null), {
    message: 'pourcentage de réduction requis',
    path: ['rewardValue'],
  });

const adminClientUpdateSchema = z
  .object({
    pseudonym: Pseudonym.optional(),
    email: Email.nullable().optional().or(z.literal('')),
  })
  .refine((o) => Object.keys(o).length > 0, 'aucun champ à modifier');

const adminSuspendSchema = z.object({
  suspended: z.boolean(),
});

const adminStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'suspended']),
});

// ---------- Reports (problem reports) ----------
const reportCreateSchema = z.object({
  message: z.string().trim().min(5, 'message trop court').max(2000, 'message trop long'),
  context: z.string().trim().max(80).optional().or(z.literal('')),
});

const reportStatusSchema = z.object({
  status: z.enum(['open', 'resolved']),
});

// ---------- Reservation engine ----------
const { BOOKING_MODE_VALUES } = require('./business');

const Minutes = z.number().int().min(0).max(1440);
const Weekday = z.number().int().min(1).max(7);
const DateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'date invalide (AAAA-MM-JJ)');
const ImageUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https:\/\//i.test(u), 'URL image : seul https est autorisé')
  .optional()
  .or(z.literal(''));

// Partner self-service: the 3 module toggles + vitrine text + booking flavour
// + cover image. Every field optional; at least one must be provided.
const partnerSelfUpdateSchema = z
  .object({
    modLoyalty: z.boolean().optional(),
    modBooking: z.boolean().optional(),
    modVitrine: z.boolean().optional(),
    description: z.string().trim().max(2000).optional().or(z.literal('')),
    bookingMode: z.enum(BOOKING_MODE_VALUES).optional(),
    imageUrl: ImageUrl,
    category: Category.optional(),
    serviceMode: ServiceMode.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'aucun champ à modifier');

// Booking engine parameters (all optional patch).
const bookingSettingsSchema = z
  .object({
    slotIntervalMin: z.number().int().min(5).max(240).optional(),
    bufferMin: z.number().int().min(0).max(240).optional(),
    minNoticeMin: z.number().int().min(0).max(43200).optional(),
    maxAdvanceDays: z.number().int().min(1).max(365).optional(),
    maxPerDay: z.number().int().min(1).max(1000).nullable().optional(),
    defaultCapacity: z.number().int().min(1).max(1000).optional(),
    // Must be an IANA zone Intl understands, e.g. Europe/Paris (audit A-06).
    timezone: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'fuseau horaire invalide (ex. Europe/Paris)')
      .optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'aucun champ à modifier');

const serviceCreateSchema = z.object({
  name: z.string().trim().min(1, 'nom requis').max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  category: z.string().trim().max(60).optional().or(z.literal('')),
  priceCents: z.number().int().min(0).max(100000000).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  durationMin: z.number().int().min(5).max(1440).optional(),
  capacity: z.number().int().min(1).max(1000).optional(),
  imageUrl: ImageUrl,
  isActive: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const serviceUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional().or(z.literal('')),
    category: z.string().trim().max(60).optional().or(z.literal('')),
    priceCents: z.number().int().min(0).max(100000000).nullable().optional(),
    currency: z.string().trim().length(3).optional(),
    durationMin: z.number().int().min(5).max(1440).optional(),
    capacity: z.number().int().min(1).max(1000).optional(),
    imageUrl: ImageUrl,
    isActive: z.boolean().optional(),
    isPrivate: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'aucun champ à modifier');

// Replace the whole weekly grid. endMin must be strictly after startMin.
const availabilityRulesSchema = z.object({
  rules: z
    .array(
      z
        .object({ weekday: Weekday, startMin: Minutes, endMin: Minutes })
        .refine((r) => r.endMin > r.startMin, 'fin avant début'),
    )
    .max(100),
});

const availabilityExceptionSchema = z
  .object({
    date: DateStr,
    isClosed: z.boolean().optional(),
    startMin: Minutes.optional(),
    endMin: Minutes.optional(),
    reason: z.string().trim().max(120).optional().or(z.literal('')),
  })
  .refine(
    (o) => o.isClosed !== false || (o.startMin != null && o.endMin != null && o.endMin > o.startMin),
    'créneau exceptionnel invalide',
  );

// Public booking creation (guest or signed-in client).
const bookingCreateSchema = z.object({
  serviceId: z.string().trim().min(1).max(64).optional(),
  date: DateStr,
  startMin: Minutes,
  partySize: z.number().int().min(1).max(1000).optional(),
  customerName: z.string().trim().min(2, 'nom requis').max(80),
  customerEmail: Email,
  customerPhone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9 +.()/-]{6,}$/, 'téléphone invalide')
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  acceptTerms: z.boolean().refine((v) => v === true, 'conditions de réservation à accepter'),
});

const bookingStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'done', 'no_show']),
});

module.exports = {
  clientSignupSchema,
  clientLoginSchema,
  clientRecoverSchema,
  partnerSignupSchema,
  partnerLoginSchema,
  adminLoginSchema,
  refreshSchema,
  scanQrSchema,
  redeemSchema,
  updateRewardSchema,
  adminPartnerUpdateSchema,
  adminClientUpdateSchema,
  adminSuspendSchema,
  adminStatusSchema,
  reportCreateSchema,
  reportStatusSchema,
  partnerSelfUpdateSchema,
  bookingSettingsSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
  availabilityRulesSchema,
  availabilityExceptionSchema,
  bookingCreateSchema,
  bookingStatusSchema,
};
