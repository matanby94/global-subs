'use client';

import Link from 'next/link';

export default function TranslatePage() {
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
                <h1 className="text-3xl font-bold mb-8 text-primary">Translate Subtitles</h1>

                <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl">
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Upload Subtitle File
                        </label>
                        <input
                            type="file"
                            accept=".srt"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <p className="text-sm text-gray-500 mt-2">
                            Supported format: .srt
                        </p>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Or Enter Subtitle URL
                        </label>
                        <input
                            type="url"
                            placeholder="https://example.com/subtitle.srt"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Target Language
                        </label>
                        <select className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent">
                            <option value="">Select a language</option>
                            <option value="es">Spanish</option>
                            <option value="fr">French</option>
                            <option value="de">German</option>
                            <option value="ja">Japanese</option>
                            <option value="zh">Chinese</option>
                            <option value="ar">Arabic</option>
                            <option value="ru">Russian</option>
                            <option value="pt">Portuguese</option>
                            <option value="it">Italian</option>
                            <option value="ko">Korean</option>
                        </select>
                    </div>

                    <button
                        className="w-full bg-gradient-to-r from-primary to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200"
                        onClick={() => alert('Translation feature coming soon!')}
                    >
                        Start Translation
                    </button>

                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-gray-700">
                            <strong>Note:</strong> This is a demo interface. Full translation functionality will be available soon.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
