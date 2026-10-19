const express = require('express');
const authService = require('../services/auth');
const usersRepo = require('../repositories/users');
const clientsRepo = require('../repositories/clients');
const partnersRepo = require('../repositories/partners');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, signupLimiter, recoverLimiter } = require('../middleware/rateLimit');
const {
  clientSignupSchema,
  clientLoginSchema,
  clientRecoverSchema,
  partnerSignupSchema,
  partnerLoginSchema,
} = require('../lib/schemas');
const {
  sendAdminMail,
  sendProMail,
  sendClientWelcomeMail,
  sendClientRecoveryMail,
} = require('../../mailer');
const logger = require('../lib/logger');
const {
  setRefreshCookies,
  clearRefreshCookies,
  readRefreshCreds,
  tokenPayloadFor,
} = require('../lib/authCookies');
const { clientIp } = require('../lib/clientIp');

const router = express.Router();

// =====================================================================
// CLIENT
// =====================================================================

router.post(
  '/client/signup',
  signupLimiter,
  validate(clientSignupSchema),
  async (req, res, next) => {
    try {
      const { pseudonym, email, consent } = req.body;
      const { userId, loginCode } = await authService.signupClient({
        pseudonym,
        email: email || null,
        consent,
      });

      const tokens = await authService.issueTokens({
        userId,
        role: 'client',
        userAgent: req.get('user-agent'),
        ip: clientIp(req),
      });

      if (email) {
        sendClientWelcomeMail({ pseudonym, email, code: loginCode }).catch((err) =>
          logger.warn({ err: err.message }, '[auth] client welcome email failed'),
        );
      }

      setRefreshCookies(req, res, tokens);
      res.json({
        success: true,
        user: { id: userId, role: 'client', pseudonym, email: email || null },
        loginCode,
        ...tokenPayloadFor(req, tokens),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/client/login',
  authLimiter,
  validate(clientLoginSchema),
  async (req, res, next) => {
    try {
      const result = await authService.loginByCode({ code: req.body.code, role: 'client' });
      if (!result) {
        return res.status(401).json({ success: false, error: 'Code inconnu.' });
      }
      const profile = await clientsRepo.full(result.userId);
      const tokens = await authService.issueTokens({
        userId: result.userId,
        role: 'client',
        userAgent: req.get('user-agent'),
        ip: clientIp(req),
      });
      setRefreshCookies(req, res, tokens);
      res.json({
        success: true,
        user: { id: profile.id, role: 'client', pseudonym: profile.pseudonym, email: profile.email },
        ...tokenPayloadFor(req, tokens),
      });
    } catch (err) {
      next(err);
    }
  },
);

// Recover a lost client code: rotate it and email the new one. Always 200,
// whether or not an account matches, to avoid enumeration (audit FP-03).
router.post(
  '/client/recover',
  recoverLimiter,
  validate(clientRecoverSchema),
  async (req, res, next) => {
    try {
      const result = await authService.rotateClientCodeByEmail({ email: req.body.email });
      if (result && result.loginCode) {
        sendClientRecoveryMail({
          pseudonym: result.pseudonym,
          email: result.email,
          code: result.loginCode,
        }).catch((err) => logger.warn({ err: err.message }, '[auth] recovery email failed'));
      }
      res.json({
        success: true,
        message: 'Si un compte est associé à cet email, un nouveau code vient d’être envoyé.',
      });
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// PARTNER
// =====================================================================

router.post(
  '/partner/signup',
  signupLimiter,
  validate(partnerSignupSchema),
  async (req, res, next) => {
    try {
      const recent = await partnersRepo.lastSignupByEmail(req.body.email);
      if (recent && Date.now() - recent.created_at < 24 * 60 * 60 * 1000) {
        return res.status(429).json({
          success: false,
          error: 'Une demande a déjà été envoyée pour cet email dans les dernières 24h.',
        });
      }

      const { userId, loginCode } = await authService.signupPartner(req.body);

      // The admin notification never carries the login code (audit FP-11):
      // the code goes only to the partner.
      Promise.all([
        sendAdminMail({
          ownerName: req.body.ownerName,
          companyName: req.body.companyName,
          address: req.body.address,
          email: req.body.email,
          phoneFixed: req.body.phoneFixed,
          phoneMobile: req.body.phoneMobile,
          imageUrl: req.body.imageUrl,
          createdAt: Date.now(),
        }),
        sendProMail({
          ownerName: req.body.ownerName,
          companyName: req.body.companyName,
          email: req.body.email,
          code: loginCode,
        }),
      ]).catch((err) => logger.warn({ err: err.message }, '[auth] partner emails failed'));

      res.json({
        success: true,
        userId,
        loginCode,
        message: 'Compte créé. Le code de connexion a été envoyé par email.',
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/partner/login',
  authLimiter,
  validate(partnerLoginSchema),
  async (req, res, next) => {
    try {
      const result = await authService.loginByCode({ code: req.body.code, role: 'partner' });
      if (!result) {
        return res.status(401).json({ success: false, error: 'Code inconnu.' });
      }
      const profile = await partnersRepo.byId(result.userId);
      const tokens = await authService.issueTokens({
        userId: result.userId,
        role: 'partner',
        userAgent: req.get('user-agent'),
        ip: clientIp(req),
      });
      setRefreshCookies(req, res, tokens);
      res.json({
        success: true,
        user: { ...profile, role: 'partner' },
        ...tokenPayloadFor(req, tokens),
      });
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// SHARED
// =====================================================================

router.post('/refresh', async (req, res, next) => {
  try {
    const { sessionId, refreshToken } = readRefreshCreds(req);
    if (!sessionId || !refreshToken || typeof sessionId !== 'string' || typeof refreshToken !== 'string') {
      return res.status(400).json({ success: false, error: 'Identifiants de session manquants.' });
    }
    const result = await authService.refresh({
      sessionId,
      refreshToken,
      userAgent: req.get('user-agent'),
      ip: clientIp(req),
    });
    if (!result) {
      clearRefreshCookies(req, res);
      return res.status(401).json({ success: false, error: 'Session expirée.' });
    }
    setRefreshCookies(req, res, result);
    res.json({ success: true, ...tokenPayloadFor(req, result) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = readRefreshCreds(req);
    await authService.logout(sessionId || req.body?.sessionId);
    clearRefreshCookies(req, res);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await usersRepo.byId(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'Compte introuvable.' });

    if (user.role === 'client') {
      const profile = await clientsRepo.full(user.id);
      return res.json({ success: true, user: { ...profile, role: 'client' } });
    }
    const profile = await partnersRepo.byId(user.id);
    return res.json({ success: true, user: { ...profile, role: 'partner' } });
  } catch (err) {
    next(err);
  }
});

router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    await usersRepo.remove(req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
