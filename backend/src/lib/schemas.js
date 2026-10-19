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
const updateRewardSchema = z.object({
  rewardThreshold: z.number().int().min(1).max(1000),
  rewardType: z.enum(['free_meal', 'discount']),
  rewardValue: z.number().int().min(1).max(100).optional(),
  category: Category.optional(),
  serviceMode: ServiceMode.optional(),
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
  .refine((o) => Object.keys(o).length > 0, 'aucun champ à modifier');

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
};
