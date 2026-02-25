import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT || 'https://s3.eu-central-003.backblazeb2.com';
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

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'GlobalSubs';
