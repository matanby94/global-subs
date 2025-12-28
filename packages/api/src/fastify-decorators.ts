import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyTypeProvider,
  FastifyTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
} from 'fastify';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';

declare module 'fastify' {
  interface FastifyInstance<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends
      RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    Logger extends FastifyBaseLogger = FastifyBaseLogger,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
  > {
    db: Pool;
    s3: S3Client;
  }
}

// Ensure this file is treated as a module.
export type _FastifyDecoratorsLoaded = FastifyInstance;
