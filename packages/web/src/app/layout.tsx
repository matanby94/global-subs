import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
