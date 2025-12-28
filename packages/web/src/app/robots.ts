import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || process.env.WEB_URL || 'http://localhost:3010';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/api/'],
    },
    sitemap: new URL('/sitemap.xml', webUrl).toString(),
  };
}
