import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    s3: S3Client;
  }
}

// Ensure this file is treated as a module.
export type _FastifyDecoratorsLoaded = FastifyInstance;
