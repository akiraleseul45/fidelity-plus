/**
 * Zod-backed body validator.
 *
 * Usage:
 *   router.post('/foo', validate(MyZodSchema), handler);
 *
 * On invalid body, replies 400 with the first field error message — so
 * the UI can surface a precise message without leaking the full schema.
 */
function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path.join('.') || 'body';
      return res.status(400).json({
        success: false,
        error: `${field}: ${issue.message}`,
      });
    }
    // Replace req.body with the typed/coerced result.
    req.body = parsed.data;
    next();
  };
}

module.exports = { validate };
