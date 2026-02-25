'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../providers/auth-provider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011';
const ADDON_MANIFEST_URL =
  process.env.NEXT_PUBLIC_ADDON_MANIFEST_URL || 'http://127.0.0.1:3012/manifest.json';

const STREMIO_INSTALL_URL = (() => {
  try {
    const url = new URL(ADDON_MANIFEST_URL);
    return `stremio://${url.host}/manifest.json`;
  } catch {
    return 'stremio://127.0.0.1:3012/manifest.json';
  }
})();

const DST_LANG_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'Hebrew' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'tr', label: 'Turkish' },
  { code: 'pl', label: 'Polish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'cs', label: 'Czech' },
  { code: 'el', label: 'Greek' },
  { code: 'ro', label: 'Romanian' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'hi', label: 'Hindi' },
];

/* ─── Icons ─── */
function CreditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

function TranslateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
    </svg>
  );
}

function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function StremioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export default function AppPage() {
  const { user, accessToken, loading, signInWithGoogle, signOut, refreshUser } = useAuth();
  const [authError, setAuthError] = useState('');
  const [dstLang, setDstLang] = useState<string>('');
  const [personalizedManifestUrl, setPersonalizedManifestUrl] = useState<string>(ADDON_MANIFEST_URL);
  const [personalizedStremioInstallUrl, setPersonalizedStremioInstallUrl] = useState<string>(STREMIO_INSTALL_URL);
  const [copied, setCopied] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);

  useEffect(() => {
    const storedLang = localStorage.getItem('preferredDstLang');
    if (storedLang && /^[a-z]{2}$/i.test(storedLang)) {
      setDstLang(storedLang.toLowerCase());
      return;
    }
    const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();
    if (/^[a-z]{2}$/.test(browserLang)) {
      setDstLang(browserLang);
    }
  }, []);

  useEffect(() => {
    async function ensureAddonInstallation(userToken: string, lang: string) {
      if (!/^[a-z]{2}$/.test(lang)) return;
      try {
        const res = await axios.post(
          `${API_URL}/api/addon/installations`,
          { dstLang: lang },
          { headers: { Authorization: `Bearer ${userToken}` } }
        );
        const manifestUrl = res.data?.manifestUrl;
        const stremioInstallUrl = res.data?.stremioInstallUrl;
        if (typeof manifestUrl === 'string') setPersonalizedManifestUrl(manifestUrl);
        if (typeof stremioInstallUrl === 'string') setPersonalizedStremioInstallUrl(stremioInstallUrl);
      } catch {
        setPersonalizedManifestUrl(ADDON_MANIFEST_URL);
        setPersonalizedStremioInstallUrl(STREMIO_INSTALL_URL);
      }
    }
    if (accessToken && dstLang) {
      ensureAddonInstallation(accessToken, dstLang.toLowerCase());
    }
  }, [accessToken, dstLang]);

  async function handleGoogleSuccess(response: CredentialResponse) {
    setAuthError('');
    if (!response.credential) {
      setAuthError('Google sign-in failed: no credential returned');
      return;
    }
    try {
      await signInWithGoogle(response.credential);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      setAuthError(error.response?.data?.error?.message || 'Sign-in failed. Please try again.');
    }
  }

  async function handleTopUp() {
    if (!accessToken || topUpLoading) return;
    setTopUpLoading(true);
    try {
      await axios.post(
        `${API_URL}/api/credits/topup`,
        { amount: 10, paymentMethodId: 'sandbox_test' },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      await refreshUser();
    } catch {
      // silently fail
    } finally {
      setTopUpLoading(false);
    }
  }

  function handleCopyManifest() {
    navigator.clipboard.writeText(personalizedManifestUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="min-h-screen mesh-gradient flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-lg animate-pulse">
            <SparkleIcon className="w-6 h-6 text-white" />
          </div>
          <p className="text-gray-500 font-medium">Loading...</p>
        </motion.div>
      </div>
    );
  }

  /* ─── Sign-in page ─── */
  if (!user) {
    return (
      <div className="min-h-screen mesh-gradient grid-pattern flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-100/80 p-8">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-lg">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="10" r="7" stroke="white" strokeWidth="1.5" opacity="0.9" />
                  <ellipse cx="12" cy="10" rx="7" ry="2.5" stroke="white" strokeWidth="1" opacity="0.4" />
                  <ellipse cx="12" cy="10" rx="2.5" ry="7" stroke="white" strokeWidth="1" opacity="0.4" />
                  <rect x="6" y="19" width="12" height="1.5" rx="0.75" fill="white" opacity="0.9" />
                  <rect x="8" y="21.5" width="8" height="1.5" rx="0.75" fill="white" opacity="0.5" />
                </svg>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-center text-gray-900 mb-1">Welcome to GlobalSubs</h1>
            <p className="text-gray-500 text-center text-sm mb-8">Sign in to access AI-powered subtitle translations</p>

            {authError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-6 text-sm"
              >
                {authError}
              </motion.div>
            )}

            <div className="flex flex-col items-center gap-4">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setAuthError('Google sign-in failed')}
                theme="outline"
                size="large"
                width="320"
                text="signin_with"
              />
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <Link href="/" className="text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Home
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ─── Dashboard ─── */
  const creditBalance = Number(user.balance_credits || 0);

  return (
    <div className="min-h-screen bg-white">
      {/* ─── Dashboard Header ─── */}
      <header className="glass sticky top-0 z-50 border-b border-purple-100/50">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="10" r="7" stroke="white" strokeWidth="1.5" opacity="0.9" />
                <rect x="6" y="19" width="12" height="1.5" rx="0.75" fill="white" opacity="0.9" />
                <rect x="8" y="21.5" width="8" height="1.5" rx="0.75" fill="white" opacity="0.5" />
              </svg>
            </div>
            <span className="text-lg font-bold gradient-text hidden sm:block">GlobalSubs</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Credits pill */}
            <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-100 text-purple-700 px-3 py-1.5 rounded-xl text-sm font-semibold">
              <CreditIcon className="w-4 h-4" />
              {creditBalance.toFixed(0)} credits
            </div>

            {/* User menu */}
            <div className="flex items-center gap-2.5">
              {user.avatar_url ? (
                <Image src={user.avatar_url} alt="" width={32} height={32} className="w-8 h-8 rounded-full ring-2 ring-purple-100" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                  {(user.name || user.email || '?')[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 hidden sm:block">{user.name || user.email}</span>
              <button
                onClick={signOut}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
                title="Sign out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ─── Welcome Section ─── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Welcome back, <span className="gradient-text">{(user.name || user.email || '').split(' ')[0]}</span>
          </h1>
          <p className="text-gray-500 mt-1">Manage your translations and credits</p>
        </motion.div>

        {/* ─── Stats Cards ─── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
        >
          {/* Credits card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-6 text-white shadow-lg shadow-purple-200">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -mr-10 -mt-10" />
            <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/5 -ml-6 -mb-6" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <CreditIcon className="w-5 h-5 text-purple-200" />
                <span className="text-purple-200 text-sm font-medium">Available Credits</span>
              </div>
              <div className="text-4xl font-extrabold tracking-tight mb-4">
                {creditBalance.toFixed(0)}
              </div>
              <button
                onClick={handleTopUp}
                disabled={topUpLoading}
                className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
              >
                <PlusIcon className="w-4 h-4" />
                {topUpLoading ? 'Adding...' : 'Add Credits'}
              </button>
            </div>
          </div>

          {/* Quick translate card */}
          <Link href="/app/translate" className="group">
            <div className="h-full bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-100/80 shadow-sm hover:shadow-lg hover:border-purple-200 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white">
                  <TranslateIcon className="w-5 h-5" />
                </div>
                <span className="text-gray-500 text-sm font-medium">Translate</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-purple-700 transition-colors">
                New Translation
              </h3>
              <p className="text-gray-400 text-sm">Upload or paste subtitle files</p>
              <div className="mt-4 flex items-center gap-1 text-purple-600 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                Get started <ArrowRightIcon className="w-4 h-4" />
              </div>
            </div>
          </Link>

          {/* Library card */}
          <Link href="/app/library" className="group">
            <div className="h-full bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-100/80 shadow-sm hover:shadow-lg hover:border-purple-200 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                  <LibraryIcon className="w-5 h-5" />
                </div>
                <span className="text-gray-500 text-sm font-medium">Library</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-purple-700 transition-colors">
                My Translations
              </h3>
              <p className="text-gray-400 text-sm">View & manage past translations</p>
              <div className="mt-4 flex items-center gap-1 text-purple-600 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                View library <ArrowRightIcon className="w-4 h-4" />
              </div>
            </div>
          </Link>
        </motion.div>

        {/* ─── Stremio Addon Card ─── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/80 shadow-sm overflow-hidden mb-8"
        >
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-sm flex-shrink-0">
                <StremioIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Stremio Add-on</h2>
                <p className="text-gray-500 text-sm mt-0.5">
                  Get AI-translated subtitles directly in Stremio
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              {/* Language selector */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Preferred subtitle language
                </label>
                <select
                  value={dstLang}
                  onChange={(e) => {
                    const next = e.target.value.toLowerCase();
                    setDstLang(next);
                    if (/^[a-z]{2}$/.test(next)) localStorage.setItem('preferredDstLang', next);
                  }}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="" disabled>Select a language</option>
                  {DST_LANG_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Install button */}
              <div className="flex flex-col justify-end">
                <a
                  href={personalizedStremioInstallUrl}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-purple-200 hover:scale-[1.02] transition-all duration-200"
                >
                  <StremioIcon className="w-4 h-4" />
                  Install in Stremio
                </a>
              </div>
            </div>

            {/* Manifest URL */}
            <div className="mt-6">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Manifest URL</label>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 block bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-xs text-purple-700 font-mono overflow-x-auto whitespace-nowrap">
                  {personalizedManifestUrl}
                </code>
                <button
                  onClick={handleCopyManifest}
                  className="flex-shrink-0 px-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                  title="Copy to clipboard"
                >
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.div key="check" initial={{ scale: 0.5 }} animate={{ scale: 1 }} exit={{ scale: 0.5 }}>
                        <CheckIcon className="w-4 h-4 text-green-500" />
                      </motion.div>
                    ) : (
                      <motion.div key="copy" initial={{ scale: 0.5 }} animate={{ scale: 1 }} exit={{ scale: 0.5 }}>
                        <CopyIcon className="w-4 h-4 text-gray-400" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── Quick Tips ─── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-gradient-to-br from-purple-50/80 to-white/80 backdrop-blur-sm rounded-2xl border border-purple-100/50 p-6 sm:p-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <SparkleIcon className="w-5 h-5 text-purple-500" />
            <h3 className="font-bold text-gray-900">Quick Tips</h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                title: 'Upload & Translate',
                description: 'Drop a .srt file and pick your target language to get started.',
                icon: <TranslateIcon className="w-4 h-4" />,
              },
              {
                title: 'Stremio Integration',
                description: 'Set your preferred language above, then install the add-on.',
                icon: <StremioIcon className="w-4 h-4" />,
              },
              {
                title: 'Multiple AI Models',
                description: 'Choose GPT-4o, Gemini, or DeepL for best results per language.',
                icon: <SparkleIcon className="w-4 h-4" />,
              },
            ].map((tip) => (
              <div key={tip.title} className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                  {tip.icon}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">{tip.title}</h4>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tip.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
