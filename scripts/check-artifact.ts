import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import '../packages/workers/src/env';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'eu-central-003',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

const bucket = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET || 'GlobalSubs';

const hashes = [
  { ep: 'S1E9-new', hash: '30bff0dd2bf68ac17a884b1175d0d1b0ea142f15012c7b70c2904bcbaa9eb4aa' },
];

async function main() {
  for (const { ep, hash } of hashes) {
    const key = `artifacts/${hash}/${hash}.vtt`;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const text = await (obj.Body as any).transformToString();
      console.log(`\n=== ${ep} (${hash.slice(0,12)}...) size=${head.ContentLength} ===`);
      console.log(text.slice(0, 400));
      console.log('...');
      console.log(`Last 200 chars: ${text.slice(-200)}`);
    } catch (e: any) {
      console.log(`${ep}: NOT FOUND - ${e.name}`);
    }
  }
}

main();
