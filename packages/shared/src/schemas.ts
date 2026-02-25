import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const TranslationRequestSchema = z.object({
  sourceSubtitle: z.string().url(),
  sourceLang: z.string().length(2),
  targetLang: z.string().length(2),
  model: z.enum(['gpt-4', 'gemini-pro', 'deepl']),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export const TopUpCreditsSchema = z.object({
  amount: z.number().positive(),
  paymentMethodId: z.string(),
});

export const PurchaseBundleSchema = z.object({
  bundle: z.enum(['starter', 'pro']),
});

export const TranslateSubtitleSchema = z.object({
  sourceSubtitle: z.string().url().or(z.string()),
  sourceLang: z.string().length(2),
  targetLang: z.string().length(2),
  model: z.enum(['gpt-4', 'gemini-pro', 'deepl']).default('gpt-4'),
});

export const SignUrlSchema = z.object({
  artifactHash: z.string(),
  expiresIn: z.number().default(3600),
});

export const ScrapeJobSchema = z.object({
  srcRegistry: z.string().min(1),
  srcId: z.string().min(1),
  lang: z.string().length(2),
});
