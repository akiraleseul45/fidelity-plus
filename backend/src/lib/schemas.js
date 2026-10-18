const { z } = require('zod');

/**
 * Centralised input validation schemas.
 * Strict bounds prevent oversized payloads (DoS) and weird Unicode injection.
 */

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'email trop court')
  .max(254, 'email trop long')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'email invalide');

const Pseudonym = z.string().trim().min(2, 'pseudonyme trop court').max(40, 'pseudonyme trop long');

const ClientCode = z.string().trim().regex(/^\d{5}$/, 'code à 5 chiffres requis');

const PartnerCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{8}$/, 'code à 8 caractères requis');

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
  consent: z.boolean().refine((v) => v === true, 'consentement RGPD requis'),
});

const partnerLoginSchema = z.object({
  code: PartnerCode,
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
const updateRewardSchema = z.object({
  rewardThreshold: z.number().int().min(1).max(1000),
  rewardType: z.enum(['free_meal', 'discount']),
  rewardValue: z.number().int().min(1).max(100).optional(),
});

module.exports = {
  clientSignupSchema,
  clientLoginSchema,
  partnerSignupSchema,
  partnerLoginSchema,
  refreshSchema,
  scanQrSchema,
  redeemSchema,
  updateRewardSchema,
};
