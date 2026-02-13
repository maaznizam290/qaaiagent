const { z } = require('zod');

const emailComSchema = z
  .string()
  .trim()
  .email('Enter a valid email')
  .max(255)
  .regex(/^[^\s@]+@[^\s@]+\.com$/i, "Email must include '@' and end with '.com'");

const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must include at least 1 uppercase letter')
  .regex(/[a-z]/, 'Password must include at least 1 lowercase letter')
  .regex(/[0-9]/, 'Password must include at least 1 number')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least 1 special character');

function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      res.status(400).json({
        error: 'Validation failed',
        fields: flattened.fieldErrors,
        formErrors: flattened.formErrors,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
      return;
    }

    req.validatedBody = parsed.data;
    next();
  };
}

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: emailComSchema,
  password: strongPasswordSchema,
});

const loginSchema = z.object({
  email: emailComSchema,
  password: strongPasswordSchema,
});

const waitlistSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(255),
  fullName: z.string().trim().max(120).optional().or(z.literal('')),
  company: z.string().trim().max(120).optional().or(z.literal('')),
  role: z.string().trim().max(120).optional().or(z.literal('')),
});

module.exports = {
  validateBody,
  registerSchema,
  loginSchema,
  waitlistSchema,
};
