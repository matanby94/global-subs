'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';

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

interface User {
  id: string;
  email: string;
  name?: string;
  balance_credits: number;
}

export default function AppPage() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [dstLang, setDstLang] = useState<string>('');
  const [personalizedManifestUrl, setPersonalizedManifestUrl] = useState<string>(ADDON_MANIFEST_URL);
  const [personalizedStremioInstallUrl, setPersonalizedStremioInstallUrl] = useState<string>(STREMIO_INSTALL_URL);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      loadUser(storedToken);
    }

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

    if (token && dstLang) {
      ensureAddonInstallation(token, dstLang.toLowerCase());
    }
  }, [token, dstLang]);

  async function loadUser(token: string) {
    try {
      const response = await axios.get(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data);
    } catch {
      localStorage.removeItem('token');
    }
  }

  async function handleSignIn() {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/signin`, { email });
      localStorage.setItem('token', response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
    } catch (error) {
      const err = error as { response?: { status: number } };
      if (err.response?.status === 404) {
        // Try signup
        const response = await axios.post(`${API_URL}/api/auth/signup`, { email });
        localStorage.setItem('token', response.data.token);
        setToken(response.data.token);
        setUser(response.data.user);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleTopUp() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      await axios.post(
        `${API_URL}/api/credits/topup`,
        {
          amount: 10,
          paymentMethodId: 'sandbox_test',
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      // Reload user
      loadUser(token);
      alert('Credits added successfully!');
    } catch {
      alert('Failed to add credits');
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold mb-6 text-center text-gray-900">Sign In</h1>
          <input
            type="email"
            placeholder="Enter your email"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-secondary disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Loading...' : 'Sign In / Sign Up'}
          </button>
          <div className="mt-4 text-center">
            <Link href="/" className="text-primary hover:underline">
              ← Back to Home
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
            <span className="text-gray-600">{user.email}</span>
            <button
              onClick={() => {
                localStorage.removeItem('token');
                setToken(null);
                setUser(null);
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
                Preferred subtitle language (ISO 639-1)
              </label>
              <input
                value={dstLang}
                onChange={(e) => {
                  const next = e.target.value.toLowerCase();
                  setDstLang(next);
                  if (/^[a-z]{2}$/.test(next)) {
                    localStorage.setItem('preferredDstLang', next);
                  }
                }}
                placeholder="es"
                maxLength={2}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
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
