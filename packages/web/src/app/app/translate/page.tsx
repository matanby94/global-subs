'use client';

import Link from 'next/link';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { trackEvent } from '../../../lib/analytics';

const LANGUAGES = [
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'it', label: 'Italian' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'ru', label: 'Russian' },
    { code: 'ja', label: 'Japanese' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ko', label: 'Korean' },
    { code: 'ar', label: 'Arabic' },
    { code: 'he', label: 'Hebrew' },
    { code: 'hi', label: 'Hindi' },
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
];

const MODELS = [
    { id: 'gpt-4o', label: 'GPT-4o', description: 'Best overall quality', icon: '✨', color: 'from-green-500 to-emerald-500' },
    { id: 'gemini-pro', label: 'Gemini Pro', description: 'Fast & versatile', icon: '⚡', color: 'from-blue-500 to-indigo-500' },
    { id: 'deepl', label: 'DeepL', description: 'European languages', icon: '🌍', color: 'from-amber-500 to-orange-500' },
];

export default function TranslatePage() {
    const [file, setFile] = useState<File | null>(null);
    const [url, setUrl] = useState('');
    const [targetLang, setTargetLang] = useState('');
    const [selectedModel, setSelectedModel] = useState('gpt-4o');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.srt') || droppedFile.name.endsWith('.vtt'))) {
            setFile(droppedFile);
            setUrl('');
            trackEvent('translate_file_dropped', { fileType: droppedFile.name.split('.').pop() || '', fileSize: droppedFile.size });
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setFile(selected);
            setUrl('');
            trackEvent('translate_file_selected', { fileType: selected.name.split('.').pop() || '', fileSize: selected.size });
        }
    }, []);

    const canSubmit = (file || url.trim()) && targetLang;

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
                        <span className="text-gray-700 font-medium">Translate</span>
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
                        <span className="gradient-text">Translate</span> Subtitles
                    </h1>
                    <p className="text-gray-500 text-sm mb-8">Upload a file or paste a URL, pick your language, and let AI handle the rest</p>
                </motion.div>

                <div className="space-y-6">
                    {/* ─── File Upload ─── */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05 }}
                    >
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Subtitle Source</label>
                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${isDragging
                                ? 'border-purple-400 bg-purple-50'
                                : file
                                    ? 'border-green-300 bg-green-50/50'
                                    : 'border-gray-200 bg-white/80 hover:border-purple-300 hover:bg-purple-50/30'
                                }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".srt,.vtt"
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            <AnimatePresence mode="wait">
                                {file ? (
                                    <motion.div
                                        key="file"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="flex flex-col items-center gap-2"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900 text-sm">{file.name}</p>
                                            <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setFile(null); trackEvent('translate_file_removed'); }}
                                            className="text-xs text-red-400 hover:text-red-600 font-medium mt-1"
                                        >
                                            Remove file
                                        </button>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="flex flex-col items-center gap-2"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-500 flex items-center justify-center">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-700 text-sm">
                                                Drop your subtitle file here, or <span className="text-purple-600">browse</span>
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">Supports .srt and .vtt files</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* URL alternative */}
                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-gray-50 px-3 text-gray-400 font-medium">OR</span>
                            </div>
                        </div>

                        <div className="relative">
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => { setUrl(e.target.value); if (e.target.value) setFile(null); }}
                                onBlur={() => { if (url.trim()) trackEvent('translate_url_entered'); }}
                                placeholder="https://example.com/subtitle.srt"
                                className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                </svg>
                            </div>
                        </div>
                    </motion.div>

                    {/* ─── Target Language ─── */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                    >
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Target Language</label>
                        <div className="relative">
                            <select
                                value={targetLang}
                                onChange={(e) => { setTargetLang(e.target.value); trackEvent('translate_lang_selected', { lang: e.target.value }); }}
                                className="w-full appearance-none px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all pr-10"
                            >
                                <option value="" disabled>Select a language</option>
                                {LANGUAGES.map((lang) => (
                                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                            </div>
                        </div>
                    </motion.div>

                    {/* ─── AI Model ─── */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                    >
                        <label className="block text-sm font-semibold text-gray-700 mb-2">AI Model</label>
                        <div className="grid grid-cols-3 gap-3">
                            {MODELS.map((model) => (
                                <button
                                    key={model.id}
                                    onClick={() => { setSelectedModel(model.id); trackEvent('translate_model_selected', { model: model.id }); }}
                                    className={`relative rounded-xl p-4 text-left transition-all duration-200 border-2 ${selectedModel === model.id
                                        ? 'border-purple-400 bg-purple-50/50 shadow-sm'
                                        : 'border-gray-200 bg-white/80 hover:border-purple-200'
                                        }`}
                                >
                                    {selectedModel === model.id && (
                                        <motion.div
                                            layoutId="model-selected"
                                            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center"
                                            transition={{ duration: 0.2 }}
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        </motion.div>
                                    )}
                                    <span className="text-lg mb-1 block">{model.icon}</span>
                                    <span className="text-sm font-bold text-gray-900 block">{model.label}</span>
                                    <span className="text-xs text-gray-400">{model.description}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>

                    {/* ─── Submit ─── */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="pt-2"
                    >
                        <button
                            disabled={!canSubmit}
                            onClick={() => {
                                if (canSubmit) {
                                    trackEvent('translate_submit', { model: selectedModel, targetLang, inputType: file ? 'file' : 'url' });
                                }
                                alert('Translation feature coming soon!');
                            }}
                            className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${canSubmit
                                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:shadow-lg hover:shadow-purple-200 hover:scale-[1.01]'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                            Start Translation
                        </button>

                        <p className="text-center text-xs text-gray-400 mt-3">
                            Costs 1 credit per translation. You&apos;ll get a downloadable .vtt file.
                        </p>
                    </motion.div>

                    {/* ─── Info banner ─── */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.25 }}
                        className="bg-gradient-to-br from-purple-50/80 to-white/80 backdrop-blur-sm rounded-2xl border border-purple-100/50 p-5"
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mt-0.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-gray-800">How it works</h4>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                    Upload your .srt or .vtt file, select the target language and AI model.
                                    Our pipeline normalizes, translates, and validates subtitle timing automatically.
                                    Previously translated files are served from cache instantly.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
