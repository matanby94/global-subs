import { FastifyInstance } from 'fastify';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET_NAME, s3PresignClient } from '../storage';
import { authenticateUser } from '../middleware/auth';

export async function signRoutes(fastify: FastifyInstance) {
  // Generate signed URL for artifact
  fastify.get('/artifact/:hash', { preHandler: authenticateUser }, async (request, reply) => {
    try {
      const { hash } = request.params as { hash: string };

      // Verify artifact exists
      const result = await fastify.db.query('SELECT storage_key FROM artifacts WHERE hash = $1', [
        hash,
      ]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Artifact not found' });
      }

      const artifact = result.rows[0];

      // Generate signed URL
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: artifact.storage_key,
        ResponseContentType: 'text/vtt; charset=utf-8',
      });

      const signedUrl = await getSignedUrl(s3PresignClient, command, { expiresIn: 3600 });

      return reply.send({ signedUrl });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to generate signed URL' });
    }
  });
}
