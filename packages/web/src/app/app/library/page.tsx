'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../providers/auth-provider';

export default function LibraryPage() {
    const { user, loading } = useAuth();

    useEffect(() => {
        if (!loading && !user) {
            window.location.href = '/app';
        }
    }, [loading, user]);

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

                {/* Empty state */}
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
                        Once you translate your first subtitle, it will appear here for easy access and re-download.
                    </p>
                    <Link
                        href="/app/translate"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-purple-200 hover:scale-[1.02] transition-all duration-200"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        Start Your First Translation
                    </Link>
                </motion.div>

                {/* Coming soon features */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="mt-6 bg-gradient-to-br from-purple-50/80 to-white/80 backdrop-blur-sm rounded-2xl border border-purple-100/50 p-6"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                        </div>
                        <h3 className="text-sm font-bold text-gray-800">Coming Soon</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                            { label: 'View all translated subtitles', icon: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
                            { label: 'Download in SRT, VTT, ASS formats', icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3' },
                            { label: 'Organize & bookmark favorites', icon: 'M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z' },
                            { label: 'Share translations with others', icon: 'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z' },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center gap-2.5 text-xs text-gray-500">
                                <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                </svg>
                                {item.label}
                            </div>
                        ))}
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
