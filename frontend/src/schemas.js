import { z } from 'zod';

const emailComSchema = z
  .string()
  .trim()
  .email('Enter a valid email')
  .regex(/^[^\s@]+@[^\s@]+\.com$/i, "Email must include '@' and end with '.com'");

const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must include at least 1 uppercase letter')
  .regex(/[a-z]/, 'Must include at least 1 lowercase letter')
  .regex(/[0-9]/, 'Must include at least 1 number')
  .regex(/[^A-Za-z0-9]/, 'Must include at least 1 special character');

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  email: emailComSchema,
  password: strongPasswordSchema,
});

export const loginSchema = z.object({
  email: emailComSchema,
  password: strongPasswordSchema,
});

export const waitlistSchema = z.object({
  email: z.string().email('Enter a valid email'),
  fullName: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
});

export const autoFlowSchema = z.object({
  url: z
    .string({ required_error: 'URL is required' })
    .trim()
    .min(1, 'URL is required')
    .url('Enter a valid URL'),
  instruction: z
    .string({ required_error: 'Instructions are required' })
    .trim()
    .min(1, 'Instructions are required')
    .max(1000, 'Instructions must be 1000 characters or less'),
});
