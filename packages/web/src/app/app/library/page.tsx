'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function LibraryPage() {
    const [user, setUser] = useState<{ email: string } | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/app';
        }
    }, []);

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow">
                <div className="container mx-auto px-4 py-4">
                    <Link href="/app" className="text-primary hover:underline">
                        ← Back to Dashboard
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold mb-8">My Library</h1>

                <div className="bg-white rounded-lg shadow-lg p-8">
                    <div className="text-center py-12">
                        <div className="text-6xl mb-4">📚</div>
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">
                            No Translations Yet
                        </h3>
                        <p className="text-gray-500 mb-6">
                            Your translated subtitles will appear here once you start translating.
                        </p>
                        <Link
                            href="/app/translate"
                            className="inline-block bg-gradient-to-r from-primary to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200"
                        >
                            Start Your First Translation
                        </Link>
                    </div>
                </div>

                <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="text-lg font-bold mb-2">💡 Coming Soon</h3>
                    <ul className="space-y-2 text-gray-700">
                        <li>• View all your translated subtitles</li>
                        <li>• Download translations in various formats</li>
                        <li>• Manage and organize your library</li>
                        <li>• Re-download previous translations</li>
                        <li>• Share translations with others</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}
