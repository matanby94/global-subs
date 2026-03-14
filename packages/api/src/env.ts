import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const candidates = [
  path.resolve(__dirname, '../../../.env'), // repo root
  path.resolve(process.cwd(), '.env'),
];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.enum(['true', 'false']).default('false'),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),

  // S3 Storage
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Stripe (optional - sandbox mode when not set)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PACK50: z.string().optional(),
  STRIPE_PRICE_PACK100: z.string().optional(),
  STRIPE_PRICE_UNLIMITED: z.string().optional(),
  STRIPE_STATEMENT_DESCRIPTOR: z.string().min(5).max(22).optional(),
  STRIPE_SHORTENED_DESCRIPTOR: z.string().min(2).max(10).optional(),
  STRIPE_SUPPORT_PHONE: z.string().optional(),
  STRIPE_SUPPORT_URL: z.string().url().optional(),

  // PayPal (optional - disabled when not set)
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_PLAN_UNLIMITED: z.string().optional(),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),

  // Internal
  INTERNAL_API_TOKEN: z
    .string()
    .min(16, 'INTERNAL_API_TOKEN must be at least 16 characters')
    .optional(),

  // Analytics Agent (all optional)
  UMAMI_API_URL: z.string().url().optional(),
  UMAMI_API_TOKEN: z.string().optional(),
  ANALYTICS_LLM_MODEL: z.string().default('gpt-4o'),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
