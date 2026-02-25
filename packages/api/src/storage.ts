import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT || 'https://s3.eu-central-003.backblazeb2.com';
const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || endpoint;
const region = process.env.S3_REGION || 'eu-central-003';
const accessKeyId = process.env.S3_ACCESS_KEY_ID!;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY!;
// B2/AWS use virtual-hosted style (false), MinIO requires path-style (true)
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

export const s3Client = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle,
});

// Use this for presigned URLs served to clients. This lets you sign URLs with a host
// that the client can actually reach (e.g. 127.0.0.1) even if the server uses a different
// internal endpoint.
export const s3PresignClient =
  publicEndpoint === endpoint
    ? s3Client
    : new S3Client({
        endpoint: publicEndpoint,
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle,
      });

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'GlobalSubs';
