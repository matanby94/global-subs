import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'GlobalSubs - AI-Powered Subtitle Translations',
  description: 'Professional AI-powered subtitle translations for movies and series in 100+ languages. Fast, accurate, and affordable.',
  keywords: ['subtitles', 'translation', 'ai', 'multilingual', 'stremio', 'globalsubs'],
  authors: [{ name: 'GlobalSubs' }],
  openGraph: {
    title: 'GlobalSubs - AI-Powered Subtitle Translations',
    description: 'Professional subtitle translations in 100+ languages',
    type: 'website',
    url: 'https://globalsubs.net',
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: 'google-site-verification-token',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'GlobalSubs',
  description: 'Professional AI-powered subtitle translation service supporting 100+ languages',
  url: 'https://globalsubs.net',
  applicationCategory: 'MultimediaApplication',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
