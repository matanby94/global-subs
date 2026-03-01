import Link from 'next/link';
import ScrollReveal from './components/ScrollReveal';
import GlobeNetwork from './components/GlobeNetwork';
import TranslationPipeline from './components/TranslationPipeline';
import ParticleField from './components/ParticleField';
import LanguageOrbit from './components/LanguageOrbit';
import SubtitleWaveform from './components/SubtitleWaveform';
import StatsCounter from './components/StatsCounter';

/* ── Feature data ── */
const FEATURES = [
    {
        title: '100+ Languages',
        description: 'Translate subtitles to and from over 100 languages with contextual AI accuracy.',
        color: 'from-blue-500 to-indigo-500',
        iconPath: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
    },
    {
        title: 'Lightning Fast',
        description: 'Optimized pipeline delivers translations in seconds, not minutes.',
        color: 'from-amber-500 to-orange-500',
        iconPath: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
    },
    {
        title: 'Multi-Model AI',
        description: 'Choose from GPT-4o, Gemini Pro, or DeepL for best results per language pair.',
        color: 'from-purple-500 to-pink-500',
        iconPath: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z',
    },
    {
        title: 'Stremio Integration',
        description: 'Stream translated subtitles directly in Stremio with our one-click add-on.',
        color: 'from-green-500 to-emerald-500',
        iconPaths: [
            'M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
            'M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z',
        ],
    },
    {
        title: 'Smart Caching',
        description: 'Global deduplication means popular translations are served instantly from cache.',
        color: 'from-indigo-500 to-blue-500',
        iconPath: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125',
    },
    {
        title: 'Flexible Pricing',
        description: 'Buy credit packs or go unlimited monthly. No hidden fees, no expiration on credits.',
        color: 'from-rose-500 to-red-500',
        iconPath: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
    },
];

const STEPS = [
    { step: '01', title: 'Sign Up & Get Free Credits', description: 'Create your account in seconds and receive 10 free translation credits instantly.', color: 'from-blue-500 to-indigo-500' },
    { step: '02', title: 'Choose & Translate', description: 'Upload subtitles or pick from OpenSubtitles. Select your target language and AI model.', color: 'from-purple-500 to-pink-500' },
    { step: '03', title: 'Download or Stream', description: 'Get translated VTT files, or install our Stremio add-on to stream subtitles live.', color: 'from-amber-500 to-orange-500' },
];

const TESTIMONIALS = [
    { name: 'Sarah Chen', role: 'Content Creator', avatar: 'SC', quote: 'GlobalSubs has been a game-changer for my international audience. The translations are incredibly accurate and fast!', color: 'from-blue-500 to-indigo-500' },
    { name: 'Marco Rodriguez', role: 'Film Distributor', avatar: 'MR', quote: "We've translated thousands of subtitles with GlobalSubs. The quality matches professional translators at a fraction of the cost.", color: 'from-purple-500 to-pink-500' },
    { name: 'Yuki Tanaka', role: 'Streaming Platform', avatar: 'YT', quote: 'The Stremio integration was seamless. Now we offer subtitles in 100+ languages automatically.', color: 'from-amber-500 to-orange-500' },
];

const PRICING = [
    { name: '50 Pack', price: '$9', period: 'one-time', credits: '50 Translations', description: 'Great for casual viewers', features: ['50 subtitle translations', '100+ languages', 'GPT-4o, Gemini & DeepL', 'Standard processing', 'Never expires'], popular: false, gradient: 'from-blue-500 to-indigo-500', cta: 'Buy Now', href: '/app?checkout=pack50' },
    { name: '100 Pack', price: '$15', period: 'one-time', credits: '100 Translations', description: 'Best value for enthusiasts', features: ['100 subtitle translations', '100+ languages', 'GPT-4o, Gemini & DeepL', 'Priority processing', 'Priority support', 'Never expires'], popular: true, gradient: 'from-purple-500 to-pink-500', cta: 'Buy Now', href: '/app?checkout=pack100' },
    { name: 'Unlimited', price: '$12', period: '/month', credits: 'Unlimited Translations', description: 'For power users & binge watchers', features: ['Unlimited subtitle translations', '100+ languages', 'GPT-4o, Gemini & DeepL', 'Fastest processing', 'Premium support', 'API access', 'Cancel anytime'], popular: false, gradient: 'from-amber-500 to-orange-500', cta: 'Subscribe', href: '/app?checkout=unlimited' },
];

/* ── Inline SVG icon component ── */
function FeatureIcon({ feature }: { feature: (typeof FEATURES)[number] }) {
    if ('iconPaths' in feature && feature.iconPaths) {
        return (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
                {feature.iconPaths.map((d: string) => (
                    <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
                ))}
            </svg>
        );
    }
    return (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={feature.iconPath} />
        </svg>
    );
}

/* ══════════════════════════════════════════════════════════════
   SERVER COMPONENT — All HTML is SSR'd for maximum Lighthouse
   ══════════════════════════════════════════════════════════════ */
export default function HomePage() {
    return (
        <div className="min-h-screen bg-white">
            {/* Skip to main content — accessibility */}
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-purple-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
                Skip to main content
            </a>

            {/* ─── Header ─── */}
            <header className="glass sticky top-0 z-50 border-b border-purple-100/50">
                <nav className="container mx-auto px-4 py-4 flex justify-between items-center" aria-label="Main navigation">
                    <div className="flex items-center gap-3 animate-fade-in-left">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-md" role="img" aria-label="GlobalSubs logo">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <circle cx="12" cy="10" r="7" stroke="white" strokeWidth="1.5" opacity="0.9" />
                                <ellipse cx="12" cy="10" rx="7" ry="2.5" stroke="white" strokeWidth="1" opacity="0.4" />
                                <ellipse cx="12" cy="10" rx="2.5" ry="7" stroke="white" strokeWidth="1" opacity="0.4" />
                                <rect x="6" y="19" width="12" height="1.5" rx="0.75" fill="white" opacity="0.9" />
                                <rect x="8" y="21.5" width="8" height="1.5" rx="0.75" fill="white" opacity="0.5" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold gradient-text">GlobalSubs</span>
                    </div>
                    <div className="flex items-center gap-6 animate-fade-in-right">
                        <Link href="#features" className="hidden sm:block text-gray-600 hover:text-purple-700 transition-colors text-sm font-medium">
                            Features
                        </Link>
                        <Link href="#demo" className="hidden sm:block text-gray-600 hover:text-purple-700 transition-colors text-sm font-medium">
                            Demo
                        </Link>
                        <Link href="#pricing" className="hidden sm:block text-gray-600 hover:text-purple-700 transition-colors text-sm font-medium">
                            Pricing
                        </Link>
                        <Link
                            href="/app"
                            className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-purple-200 hover:scale-105 transition-all duration-200"
                        >
                            Sign In
                        </Link>
                    </div>
                </nav>
            </header>

            {/* ─── Hero ─── */}
            <main id="main-content">
                <section className="relative overflow-hidden mesh-gradient grid-pattern">
                    <ParticleField count={25} />
                    <div className="container mx-auto px-4 py-20 lg:py-28">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            <div className="animate-fade-in-up">
                                <div className="inline-flex items-center gap-2 bg-purple-100/60 text-purple-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border border-purple-200/50">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
                                    Powered by GPT-4o, Gemini &amp; DeepL
                                </div>

                                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
                                    <span className="gradient-text">AI-Powered</span>
                                    <br />
                                    Subtitle Translations
                                </h1>

                                <p className="text-lg text-gray-600 mb-8 max-w-lg leading-relaxed">
                                    Translate subtitles into <span className="font-semibold text-purple-700">100+ languages</span> with
                                    production-grade accuracy. Upload, translate, and stream &mdash; all in seconds.
                                </p>

                                <div className="flex flex-col sm:flex-row gap-4">
                                    <Link
                                        href="/app"
                                        className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-8 py-4 rounded-2xl text-lg font-semibold hover:shadow-xl hover:shadow-purple-200 hover:scale-[1.03] transition-all duration-200"
                                    >
                                        Get Started Free
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                    </Link>
                                    <Link
                                        href="#demo"
                                        className="inline-flex items-center justify-center gap-2 border-2 border-purple-200 text-purple-700 px-8 py-4 rounded-2xl text-lg font-semibold hover:bg-purple-50 transition-all duration-200"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        See Demo
                                    </Link>
                                </div>

                                <div className="mt-10 flex flex-wrap gap-6 text-sm text-gray-500">
                                    {['No credit card required', '10 free translations', 'Stremio integration'].map((badge) => (
                                        <span key={badge} className="flex items-center gap-1.5">
                                            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            {badge}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="hidden lg:block animate-fade-in-scale">
                                <GlobeNetwork />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ─── Animated Stats Bar ─── */}
                <section className="relative bg-gradient-to-r from-purple-700 via-purple-600 to-purple-800 text-white overflow-hidden" aria-label="Platform statistics">
                    <div className="absolute inset-0 opacity-10" aria-hidden="true">
                        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                    </div>
                    <div className="container mx-auto px-4 py-14">
                        <StatsCounter />
                    </div>
                </section>

                {/* ─── Live Translation Demo ─── */}
                <section id="demo" className="py-20 lg:py-28 bg-white relative" aria-labelledby="demo-heading">
                    <div className="container mx-auto px-4">
                        <ScrollReveal className="text-center mb-16">
                            <span className="inline-block bg-purple-100/60 text-purple-700 px-4 py-1 rounded-full text-sm font-semibold mb-4 border border-purple-200/50">
                                Live Preview
                            </span>
                            <h2 id="demo-heading" className="text-3xl lg:text-5xl font-bold mb-4 gradient-text">
                                See AI Translation in Action
                            </h2>
                            <p className="text-lg text-gray-500 max-w-xl mx-auto">
                                Watch subtitles get translated in real-time through our multi-model pipeline
                            </p>
                        </ScrollReveal>

                        <ScrollReveal delay={200}>
                            <div className="mb-8 opacity-40">
                                <SubtitleWaveform />
                            </div>
                            <TranslationPipeline />
                        </ScrollReveal>
                    </div>
                </section>

                {/* ─── Features ─── */}
                <section id="features" className="py-20 lg:py-28 mesh-gradient relative" aria-labelledby="features-heading">
                    <ParticleField count={15} />
                    <div className="container mx-auto px-4 relative z-10">
                        <ScrollReveal className="text-center mb-16">
                            <span className="inline-block bg-purple-100/60 text-purple-700 px-4 py-1 rounded-full text-sm font-semibold mb-4 border border-purple-200/50">
                                Features
                            </span>
                            <h2 id="features-heading" className="text-3xl lg:text-5xl font-bold mb-4 gradient-text">
                                Everything You Need
                            </h2>
                            <p className="text-lg text-gray-500 max-w-xl mx-auto">
                                Professional-grade subtitle translation tools, accessible to everyone
                            </p>
                        </ScrollReveal>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                            {FEATURES.map((feature, index) => (
                                <ScrollReveal key={feature.title} delay={index * 80}>
                                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 border border-gray-100/80 h-full group">
                                        <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} text-white mb-4 shadow-sm`}>
                                            <FeatureIcon feature={feature} />
                                        </div>
                                        <h3 className="text-lg font-bold mb-2 text-gray-900 group-hover:text-purple-700 transition-colors">
                                            {feature.title}
                                        </h3>
                                        <p className="text-gray-500 text-sm leading-relaxed">
                                            {feature.description}
                                        </p>
                                    </div>
                                </ScrollReveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── How It Works ─── */}
                <section className="py-20 lg:py-28 bg-white relative overflow-hidden" aria-labelledby="how-it-works-heading">
                    <div className="container mx-auto px-4">
                        <ScrollReveal className="text-center mb-16">
                            <span className="inline-block bg-purple-100/60 text-purple-700 px-4 py-1 rounded-full text-sm font-semibold mb-4 border border-purple-200/50">
                                How It Works
                            </span>
                            <h2 id="how-it-works-heading" className="text-3xl lg:text-5xl font-bold mb-4 gradient-text">
                                Three Simple Steps
                            </h2>
                        </ScrollReveal>

                        <div className="grid lg:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
                            <div className="space-y-8">
                                {STEPS.map((item, index) => (
                                    <ScrollReveal key={item.step} delay={index * 150} animation="animate-fade-in-left">
                                        <div className="flex gap-5 group">
                                            <div className="flex-shrink-0">
                                                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center text-lg font-bold shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                                                    {item.step}
                                                </div>
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold mb-1 text-gray-900 group-hover:text-purple-700 transition-colors">
                                                    {item.title}
                                                </h3>
                                                <p className="text-gray-500 leading-relaxed">
                                                    {item.description}
                                                </p>
                                            </div>
                                        </div>
                                    </ScrollReveal>
                                ))}
                            </div>

                            <ScrollReveal className="flex justify-center" animation="animate-fade-in-scale" delay={300}>
                                <LanguageOrbit />
                            </ScrollReveal>
                        </div>
                    </div>
                </section>

                {/* ─── Testimonials ─── */}
                <section className="py-20 lg:py-28 mesh-gradient relative" aria-labelledby="testimonials-heading">
                    <div className="container mx-auto px-4">
                        <ScrollReveal className="text-center mb-16">
                            <span className="inline-block bg-purple-100/60 text-purple-700 px-4 py-1 rounded-full text-sm font-semibold mb-4 border border-purple-200/50">
                                Testimonials
                            </span>
                            <h2 id="testimonials-heading" className="text-3xl lg:text-5xl font-bold mb-4 gradient-text">
                                Loved by Creators Worldwide
                            </h2>
                        </ScrollReveal>

                        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                            {TESTIMONIALS.map((t, index) => (
                                <ScrollReveal key={t.name} delay={index * 100}>
                                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100/80">
                                        <div className="flex gap-1 mb-4" role="img" aria-label="5 out of 5 stars">
                                            {[...Array(5)].map((_, i) => (
                                                <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                            ))}
                                        </div>
                                        <blockquote>
                                            <p className="text-gray-600 text-sm mb-6 leading-relaxed italic">
                                                &ldquo;{t.quote}&rdquo;
                                            </p>
                                        </blockquote>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-xs font-bold shadow-sm`} aria-hidden="true">
                                                {t.avatar}
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900 text-sm">{t.name}</div>
                                                <div className="text-xs text-gray-500">{t.role}</div>
                                            </div>
                                        </div>
                                    </div>
                                </ScrollReveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Pricing ─── */}
                <section id="pricing" className="py-20 lg:py-28 bg-white relative" aria-labelledby="pricing-heading">
                    <div className="container mx-auto px-4">
                        <ScrollReveal className="text-center mb-16">
                            <span className="inline-block bg-purple-100/60 text-purple-700 px-4 py-1 rounded-full text-sm font-semibold mb-4 border border-purple-200/50">
                                Pricing
                            </span>
                            <h2 id="pricing-heading" className="text-3xl lg:text-5xl font-bold mb-4 gradient-text">
                                Simple, Transparent Pricing
                            </h2>
                            <p className="text-lg text-gray-500 max-w-xl mx-auto">
                                Buy credits once or go unlimited. Pay with card or PayPal — no hidden fees.
                            </p>
                        </ScrollReveal>

                        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
                            {PRICING.map((plan, index) => (
                                <ScrollReveal key={plan.name} delay={index * 100}>
                                    <div
                                        className={`relative rounded-2xl p-6 lg:p-8 border-2 transition-all duration-300 h-full flex flex-col ${plan.popular
                                            ? 'border-purple-400 bg-gradient-to-b from-purple-50/50 to-white shadow-xl shadow-purple-100 scale-[1.03]'
                                            : 'border-gray-200 bg-white hover:border-purple-200 hover:shadow-lg'
                                            }`}
                                    >
                                        {plan.popular && (
                                            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                                                <span className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-1 rounded-full text-xs font-bold shadow-md">
                                                    Most Popular
                                                </span>
                                            </div>
                                        )}

                                        <div className="text-center mb-6">
                                            <h3 className="text-lg font-bold mb-2 text-gray-900">{plan.name}</h3>
                                            <div className="flex items-baseline justify-center gap-1 mb-1">
                                                <span className="text-4xl font-extrabold gradient-text">{plan.price}</span>
                                                <span className="text-gray-400 text-sm">{plan.period}</span>
                                            </div>
                                            <p className="text-gray-500 text-sm">{plan.description}</p>
                                        </div>

                                        <div className={`text-center py-2.5 rounded-xl bg-gradient-to-r ${plan.gradient} mb-6`}>
                                            <span className="font-bold text-white text-sm">{plan.credits}</span>
                                        </div>

                                        <ul className="space-y-3 mb-8 flex-1">
                                            {plan.features.map((feature) => (
                                                <li key={feature} className="flex items-start gap-2.5 text-sm">
                                                    <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                    <span className="text-gray-600">{feature}</span>
                                                </li>
                                            ))}
                                        </ul>

                                        <Link
                                            href={plan.href}
                                            className={`block text-center py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${plan.popular
                                                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:shadow-lg hover:shadow-purple-200 hover:scale-[1.02]'
                                                : 'border-2 border-purple-200 text-purple-700 hover:bg-purple-50'
                                                }`}
                                        >
                                            {plan.cta}
                                        </Link>
                                    </div>
                                </ScrollReveal>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-6 mt-10">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                                Secure checkout
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                                </svg>
                                Card &amp; PayPal accepted
                            </div>
                        </div>
                    </div>
                </section>

                {/* ─── CTA ─── */}
                <section className="relative py-20 lg:py-28 bg-gradient-to-br from-purple-700 via-purple-600 to-purple-800 text-white overflow-hidden" aria-labelledby="cta-heading">
                    <ParticleField count={20} />
                    <div className="container mx-auto px-4 text-center relative z-10">
                        <ScrollReveal>
                            <h2 id="cta-heading" className="text-3xl lg:text-5xl font-bold mb-6">
                                Ready to Break Language Barriers?
                            </h2>
                            <p className="text-lg mb-10 max-w-xl mx-auto text-purple-200">
                                Join thousands of creators and viewers translating subtitles with AI
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Link
                                    href="/app"
                                    className="inline-flex items-center justify-center gap-2 bg-white text-purple-700 px-8 py-4 rounded-2xl text-lg font-bold hover:shadow-2xl hover:scale-[1.03] transition-all duration-200"
                                >
                                    Start Translating Free
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </Link>
                                <a
                                    href={`stremio://${(() => { try { return new URL(process.env.NEXT_PUBLIC_ADDON_MANIFEST_URL || '').host; } catch { return '127.0.0.1:3012'; } })()}/manifest.json`}
                                    className="inline-flex items-center justify-center gap-2 border-2 border-white/30 text-white px-8 py-4 rounded-2xl text-lg font-semibold hover:bg-white/10 transition-all duration-200"
                                    aria-label="Install GlobalSubs Stremio Add-on"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Install Stremio Add-on
                                </a>
                            </div>
                        </ScrollReveal>
                    </div>
                </section>
            </main>

            {/* ─── Footer ─── */}
            <footer className="bg-gray-950 text-white py-12" role="contentinfo">
                <div className="container mx-auto px-4">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center" aria-hidden="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <circle cx="12" cy="10" r="7" stroke="white" strokeWidth="1.5" opacity="0.9" />
                                    <rect x="6" y="19" width="12" height="1.5" rx="0.75" fill="white" opacity="0.9" />
                                    <rect x="8" y="21.5" width="8" height="1.5" rx="0.75" fill="white" opacity="0.5" />
                                </svg>
                            </div>
                            <div>
                                <div className="font-bold text-sm">GlobalSubs</div>
                                <div className="text-gray-500 text-xs">&copy; 2025 GlobalSubs. All rights reserved.</div>
                            </div>
                        </div>
                        <nav className="flex gap-6 text-sm" aria-label="Footer navigation">
                            <Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">
                                Privacy Policy
                            </Link>
                            <Link href="/terms" className="text-gray-400 hover:text-white transition-colors">
                                Terms of Service
                            </Link>
                            <Link href="/contact" className="text-gray-400 hover:text-white transition-colors">
                                Contact Us
                            </Link>
                        </nav>
                    </div>
                </div>
            </footer>
        </div>
    );
}
