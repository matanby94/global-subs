import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
const region = process.env.S3_REGION || 'us-east-1';
const accessKeyId = process.env.S3_ACCESS_KEY_ID || 'minioadmin';
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || 'minioadmin';

export const s3Client = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true, // Required for MinIO
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'stremio-ai-subs';
