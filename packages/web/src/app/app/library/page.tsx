'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '../../providers/auth-provider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011';

type LibraryItem = {
    src_registry: string;
    src_id: string;
    dst_lang: string;
    src_lang: string | null;
    model: string | null;
    artifact_hash: string | null;
    status: string;
    source: 'addon' | 'web';
    created_at: string;
};

function langName(code: string): string {
    try {
        const dn = new Intl.DisplayNames(['en'], { type: 'language' });
        const name = dn.of(code);
        if (name && name.toLowerCase() !== code.toLowerCase()) return name;
    } catch { /* fallback */ }
    return code.toUpperCase();
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    } catch {
        return iso;
    }
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'completed') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200/50">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Ready
            </span>
        );
    }
    if (status === 'processing' || status === 'pending') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/50">
                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Processing
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200/50">
            Failed
        </span>
    );
}

function SourceBadge({ source }: { source: 'addon' | 'web' }) {
    if (source === 'addon') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-600 border border-purple-200/50">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                </svg>
                Stremio
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200/50">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
            Web
        </span>
    );
}

function formatImdbId(srcId: string): string {
    // For series: "tt1234567:1:3" → "tt1234567 S01E03"
    const parts = srcId.split(':');
    if (parts.length === 3) {
        const s = parts[1].padStart(2, '0');
        const e = parts[2].padStart(2, '0');
        return `${parts[0]} S${s}E${e}`;
    }
    return srcId;
}

export default function LibraryPage() {
    const { user, accessToken, loading } = useAuth();
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && !user) {
            window.location.href = '/app';
        }
    }, [loading, user]);

    useEffect(() => {
        if (!accessToken) return;
        setFetching(true);
        axios.get(`${API_URL}/api/translations/library`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
            .then((res) => {
                setItems(res.data.library || []);
            })
            .catch((err) => {
                console.error('Failed to fetch library:', err);
                setError('Failed to load your library');
            })
            .finally(() => setFetching(false));
    }, [accessToken]);

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <header className="glass sticky top-0 z-50 border-b border-purple-100/50">
                <div className="container mx-auto px-4 py-3 flex items-center gap-4">
                    <Link href="/app" className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-sm">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="10" r="7" stroke="white" strokeWidth="1.5" opacity="0.9" />
                                <rect x="6" y="19" width="12" height="1.5" rx="0.75" fill="white" opacity="0.9" />
                                <rect x="8" y="21.5" width="8" height="1.5" rx="0.75" fill="white" opacity="0.5" />
                            </svg>
                        </div>
                        <span className="text-lg font-bold gradient-text hidden sm:block">GlobalSubs</span>
                    </Link>
                    <div className="h-5 w-px bg-gray-200" />
                    <nav className="flex items-center gap-1 text-sm">
                        <Link href="/app" className="text-gray-400 hover:text-gray-600 transition-colors">Dashboard</Link>
                        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                        <span className="text-gray-700 font-medium">Library</span>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 max-w-3xl">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                        My <span className="gradient-text">Library</span>
                    </h1>
                    <p className="text-gray-500 text-sm mb-8">Your translated subtitles, ready to use</p>
                </motion.div>

                {/* Loading state */}
                {fetching && (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                    </div>
                )}

                {/* Error state */}
                {error && !fetching && (
                    <div className="bg-red-50 border border-red-200/50 rounded-xl p-4 text-sm text-red-600">
                        {error}
                    </div>
                )}

                {/* Empty state */}
                {!fetching && !error && items.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05 }}
                        className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 p-10 text-center"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-400 flex items-center justify-center mx-auto mb-5">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1.5">No Translations Yet</h3>
                        <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
                            Translations from Stremio and the web app will appear here automatically.
                        </p>
                        <Link
                            href="/app"
                            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-purple-200 hover:scale-[1.02] transition-all duration-200"
                        >
                            Back to Dashboard
                        </Link>
                    </motion.div>
                )}

                {/* Library list */}
                {!fetching && !error && items.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05 }}
                        className="space-y-3"
                    >
                        <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-4">
                            {items.length} translation{items.length !== 1 ? 's' : ''}
                        </div>

                        {items.map((item, idx) => (
                            <motion.div
                                key={`${item.src_id}-${item.dst_lang}-${idx}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: idx * 0.03 }}
                                className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/50 p-4 hover:border-purple-200/50 hover:shadow-sm transition-all duration-200"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-sm font-semibold text-gray-800 font-mono truncate">
                                                {formatImdbId(item.src_id)}
                                            </span>
                                            <StatusBadge status={item.status} />
                                            <SourceBadge source={item.source} />
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-gray-400">
                                            <span className="flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                                                </svg>
                                                {item.src_lang ? `${langName(item.src_lang)} → ` : ''}{langName(item.dst_lang)}
                                            </span>
                                            {item.model && (
                                                <span className="flex items-center gap-1">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                                    </svg>
                                                    {item.model}
                                                </span>
                                            )}
                                            {item.created_at && (
                                                <span>{formatDate(item.created_at)}</span>
                                            )}
                                        </div>
                                    </div>
                                    {item.artifact_hash && item.status === 'completed' && (
                                        <a
                                            href={`${API_URL}/api/sign/artifact/${item.artifact_hash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-shrink-0 p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors"
                                            title="Download subtitle"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                        </a>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </main>
        </div>
    );
}
