import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Stremio AI Subtitles - LLM-Translated Subtitles',
  description: 'Get professionally translated subtitles for your favorite movies and series using AI',
  keywords: ['stremio', 'subtitles', 'translation', 'ai', 'llm'],
  authors: [{ name: 'Stremio AI Subtitles' }],
  openGraph: {
    title: 'Stremio AI Subtitles',
    description: 'AI-powered subtitle translations for Stremio',
    type: 'website',
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
  name: 'Stremio AI Subtitles',
  description: 'AI-powered subtitle translation service for Stremio',
  url: 'http://localhost:3000',
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
