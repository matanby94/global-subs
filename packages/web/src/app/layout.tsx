import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6a1b9a',
};

export const metadata: Metadata = {
  title: 'GlobalSubs - AI-Powered Subtitle Translations',
  description:
    'Professional AI-powered subtitle translations for movies and series in 100+ languages. Fast, accurate, and affordable.',
  keywords: ['subtitles', 'translation', 'ai', 'multilingual', 'stremio', 'globalsubs'],
  authors: [{ name: 'GlobalSubs' }],
  metadataBase: new URL('https://globalsubs-ai.com'),
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/apple-icon',
  },
  openGraph: {
    title: 'GlobalSubs - AI-Powered Subtitle Translations',
    description: 'Professional subtitle translations in 100+ languages',
    type: 'website',
    url: 'https://globalsubs-ai.com',
    siteName: 'GlobalSubs',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GlobalSubs - AI-Powered Subtitle Translations',
    description: 'Professional subtitle translations in 100+ languages',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'GlobalSubs',
  description:
    'Professional AI-powered subtitle translation service supporting 100+ languages',
  url: 'https://globalsubs-ai.com',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {umamiUrl && umamiWebsiteId && (
          <script
            defer
            src={`${umamiUrl}/script.js`}
            data-website-id={umamiWebsiteId}
          />
        )}
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
