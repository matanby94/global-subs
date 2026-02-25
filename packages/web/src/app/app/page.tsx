'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Image from 'next/image';
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
  { code: 'en', label: 'English (en)' },
  { code: 'he', label: 'Hebrew (he)' },
  { code: 'es', label: 'Spanish (es)' },
  { code: 'fr', label: 'French (fr)' },
  { code: 'de', label: 'German (de)' },
  { code: 'it', label: 'Italian (it)' },
  { code: 'pt', label: 'Portuguese (pt)' },
  { code: 'ru', label: 'Russian (ru)' },
  { code: 'ar', label: 'Arabic (ar)' },
  { code: 'zh', label: 'Chinese (zh)' },
  { code: 'ja', label: 'Japanese (ja)' },
  { code: 'ko', label: 'Korean (ko)' },
  { code: 'tr', label: 'Turkish (tr)' },
  { code: 'pl', label: 'Polish (pl)' },
  { code: 'nl', label: 'Dutch (nl)' },
  { code: 'sv', label: 'Swedish (sv)' },
  { code: 'da', label: 'Danish (da)' },
  { code: 'fi', label: 'Finnish (fi)' },
  { code: 'no', label: 'Norwegian (no)' },
  { code: 'cs', label: 'Czech (cs)' },
  { code: 'el', label: 'Greek (el)' },
  { code: 'ro', label: 'Romanian (ro)' },
  { code: 'hu', label: 'Hungarian (hu)' },
  { code: 'uk', label: 'Ukrainian (uk)' },
  { code: 'hi', label: 'Hindi (hi)' },
];

export default function AppPage() {
  const { user, accessToken, loading, signInWithGoogle, signOut, refreshUser } = useAuth();
  const [authError, setAuthError] = useState('');
  const [dstLang, setDstLang] = useState<string>('');
  const [personalizedManifestUrl, setPersonalizedManifestUrl] = useState<string>(ADDON_MANIFEST_URL);
  const [personalizedStremioInstallUrl, setPersonalizedStremioInstallUrl] = useState<string>(STREMIO_INSTALL_URL);

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
    if (!accessToken) return;

    try {
      await axios.post(
        `${API_URL}/api/credits/topup`,
        {
          amount: 10,
          paymentMethodId: 'sandbox_test',
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      await refreshUser();
      alert('Credits added successfully!');
    } catch {
      alert('Failed to add credits');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold mb-2 text-center text-gray-900">Welcome to GlobalSubs</h1>
          <p className="text-gray-500 text-center mb-6">Sign in to access AI-powered subtitle translations</p>

          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {authError}
            </div>
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

            {/* Apple Sign-In placeholder - requires additional Apple Developer setup */}
            {/* <button className="w-full bg-black text-white py-3 rounded-lg font-semibold">
              Sign in with Apple
            </button> */}
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-primary hover:underline text-sm">
              &larr; Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <div className="flex items-center gap-4">
            {user.avatar_url && (
              <Image src={user.avatar_url} alt="" width={32} height={32} className="w-8 h-8 rounded-full" />
            )}
            <span className="text-gray-600">{user.name || user.email}</span>
            <button
              onClick={() => {
                signOut();
              }}
              className="text-primary hover:underline"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Credits Balance */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-primary">Credits Balance</h2>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-4xl font-bold text-primary">
                {Number(user.balance_credits || 0).toFixed(2)}
              </p>
              <p className="text-gray-600">Available Credits</p>
            </div>
            <button
              onClick={handleTopUp}
              className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-secondary"
            >
              Add 10 Credits (Sandbox)
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-3 text-primary">🎬 Translate Subtitle</h3>
            <p className="text-gray-600 mb-4">
              Upload a subtitle file or provide a URL to translate.
            </p>
            <Link
              href="/app/translate"
              className="inline-block bg-primary text-white px-6 py-2 rounded-lg hover:bg-secondary"
            >
              Start Translation
            </Link>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-3 text-primary">📚 My Library</h3>
            <p className="text-gray-600 mb-4">
              View your previously translated subtitles.
            </p>
            <Link
              href="/app/library"
              className="inline-block bg-primary text-white px-6 py-2 rounded-lg hover:bg-secondary"
            >
              View Library
            </Link>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-2 text-primary">🎯 Using with Stremio</h3>
          <p className="text-gray-700 mb-2">
            Install your personalized addon in Stremio to access AI-translated subtitles directly:
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end mb-3">
            <div className="w-full sm:w-auto">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Preferred subtitle language
              </label>
              <select
                value={dstLang}
                onChange={(e) => {
                  const next = e.target.value.toLowerCase();
                  setDstLang(next);
                  if (/^[a-z]{2}$/.test(next)) localStorage.setItem('preferredDstLang', next);
                }}
                className="w-64 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="" disabled>
                  Select a language
                </option>
                {DST_LANG_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <a
              href={personalizedStremioInstallUrl}
              className="inline-block bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-secondary"
            >
              Add Personalized Addon to Stremio
            </a>
          </div>
          <code className="block bg-white px-4 py-2 rounded border text-sm text-primary">
            {personalizedManifestUrl}
          </code>
        </div>
      </main>
    </div>
  );
}
