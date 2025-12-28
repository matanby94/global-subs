'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const [selectedLang, setSelectedLang] = useState('Spanish');
  const [count, setCount] = useState({ translations: 0, users: 0, languages: 0 });

  // Animated counter
  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;

    const targets = { translations: 1250000, users: 15000, languages: 100 };
    let step = 0;

    const timer = setInterval(() => {
      step++;
      setCount({
        translations: Math.floor((targets.translations * step) / steps),
        users: Math.floor((targets.users * step) / steps),
        languages: Math.floor((targets.languages * step) / steps),
      });

      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, []);

  const demoText = {
    English: "Welcome to the future of subtitle translation",
    Spanish: "Bienvenido al futuro de la traducción de subtítulos",
    French: "Bienvenue dans l'avenir de la traduction de sous-titres",
    German: "Willkommen in der Zukunft der Untertitelübersetzung",
    Japanese: "字幕翻訳の未来へようこそ"
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-purple-50 to-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-purple-100 sticky top-0 z-50">
        <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
          <motion.h1
            className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            GlobalSubs
          </motion.h1>
          <div className="flex items-center space-x-6">
            <Link href="#pricing" className="text-gray-700 hover:text-primary transition-colors">
              Pricing
            </Link>
            <Link
              href="/app"
              className="bg-gradient-to-r from-primary to-purple-600 text-white px-6 py-2 rounded-full hover:shadow-lg hover:scale-105 transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 lg:py-32">
        <div className="text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-5xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-gray-900 via-primary to-purple-600 bg-clip-text text-transparent leading-tight">
              AI-Powered Subtitle Translations
            </h2>
            <p className="text-xl lg:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Professional subtitle translations in <span className="font-semibold text-primary">100+ languages</span>. Fast, accurate, and affordable.
            </p>
          </motion.div>

          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Link
              href="/app"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-purple-600 text-white px-8 py-4 rounded-full text-lg font-semibold hover:shadow-2xl hover:scale-105 transition-all duration-200"
            >
              Get Started Free
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="#demo"
              className="inline-flex items-center gap-2 border-2 border-primary text-primary px-8 py-4 rounded-full text-lg font-semibold hover:bg-primary hover:text-white transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Watch Demo
            </Link>
          </motion.div>

          {/* Trust Indicators */}
          <motion.div
            className="mt-16 flex flex-wrap justify-center gap-8 text-sm text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>100+ Languages</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Lightning Fast</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Enterprise Security</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Statistics Counter */}
      <section className="py-16 bg-gradient-to-r from-primary to-purple-600 text-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-5xl font-bold mb-2">{count.translations.toLocaleString()}+</div>
              <div className="text-purple-200 text-lg">Subtitles Translated</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="text-5xl font-bold mb-2">{count.users.toLocaleString()}+</div>
              <div className="text-purple-200 text-lg">Happy Users</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="text-5xl font-bold mb-2">{count.languages}+</div>
              <div className="text-purple-200 text-lg">Languages Supported</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section id="demo" className="py-20 lg:py-32 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h3 className="text-4xl lg:text-5xl font-bold mb-4 text-primary">See It In Action</h3>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Try our AI-powered translation live
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-gradient-to-br from-purple-50 to-white rounded-3xl p-8 shadow-2xl border border-purple-100">
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Select Target Language
                </label>
                <div className="flex flex-wrap gap-3">
                  {['Spanish', 'French', 'German', 'Japanese'].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLang(lang)}
                      className={`px-6 py-3 rounded-full font-semibold transition-all duration-200 ${selectedLang === lang
                        ? 'bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg scale-105'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                        }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Original (English)
                  </div>
                  <div className="bg-white rounded-xl p-6 border-2 border-gray-200 min-h-[120px] flex items-center">
                    <p className="text-gray-800 text-lg">
                      {demoText.English}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    Translated ({selectedLang})
                  </div>
                  <motion.div
                    key={selectedLang}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="bg-gradient-to-br from-primary/5 to-purple-100/50 rounded-xl p-6 border-2 border-primary/30 min-h-[120px] flex items-center"
                  >
                    <p className="text-gray-800 text-lg font-medium">
                      {demoText[selectedLang as keyof typeof demoText]}
                    </p>
                  </motion.div>
                </div>
              </div>

              <div className="mt-6 text-center">
                <Link
                  href="/app"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-purple-600 text-white px-8 py-3 rounded-full font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200"
                >
                  Try Full Translation
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 lg:py-32 bg-gradient-to-br from-purple-50 to-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h3 className="text-4xl lg:text-5xl font-bold mb-4 text-primary">Powerful Features</h3>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Everything you need to translate subtitles at scale
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: '🌍',
                title: '100+ Languages',
                description: 'Translate subtitles to and from over 100 languages with AI-powered accuracy.',
                gradient: 'from-blue-500 to-cyan-500'
              },
              {
                icon: '⚡',
                title: 'Lightning Fast',
                description: 'Get your translated subtitles in seconds with our optimized AI pipeline.',
                gradient: 'from-purple-500 to-pink-500'
              },
              {
                icon: '💰',
                title: 'Pay As You Go',
                description: 'Credit-based pricing. Only pay for what you use. No hidden fees or subscriptions.',
                gradient: 'from-orange-500 to-red-500'
              }
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                className="group relative"
              >
                <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 h-full">
                  <div className={`text-5xl mb-4 inline-block p-4 rounded-xl bg-gradient-to-br ${feature.gradient} bg-opacity-10`}>
                    {feature.icon}
                  </div>
                  <h4 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h4>
                  <p className="text-gray-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 lg:py-32 bg-gradient-to-br from-purple-50 to-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h3 className="text-4xl lg:text-5xl font-bold mb-4 text-primary">How It Works</h3>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Get started in three simple steps
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto space-y-8">
            {[
              {
                step: '1',
                title: 'Sign Up & Get Credits',
                description: 'Create a free account and get started with free credits. No credit card required.',
                color: 'from-blue-500 to-cyan-500'
              },
              {
                step: '2',
                title: 'Upload Subtitles',
                description: 'Choose subtitles from OpenSubtitles or upload your own SRT files.',
                color: 'from-purple-500 to-pink-500'
              },
              {
                step: '3',
                title: 'Get Translations',
                description: 'Download translated subtitles or stream directly in Stremio with our addon.',
                color: 'from-orange-500 to-red-500'
              }
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="flex items-start gap-6 group"
              >
                <div className={`flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center text-2xl font-bold shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                  {item.step}
                </div>
                <div className="flex-1">
                  <h4 className="text-2xl font-bold mb-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-gray-600 text-lg leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 lg:py-32 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h3 className="text-4xl lg:text-5xl font-bold mb-4 text-primary">Loved by Creators Worldwide</h3>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              See what our users are saying
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                name: 'Sarah Chen',
                role: 'Content Creator',
                avatar: '👩‍💼',
                quote: 'GlobalSubs has been a game-changer for my international audience. The translations are incredibly accurate and fast!',
                rating: 5
              },
              {
                name: 'Marco Rodriguez',
                role: 'Film Distributor',
                avatar: '👨‍💼',
                quote: 'We\'ve translated thousands of subtitles with GlobalSubs. The quality is on par with professional translators at a fraction of the cost.',
                rating: 5
              },
              {
                name: 'Yuki Tanaka',
                role: 'Streaming Platform',
                avatar: '👩‍💻',
                quote: 'The API integration was seamless. Now we can offer subtitles in 100+ languages to our global users automatically.',
                rating: 5
              }
            ].map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="bg-gradient-to-br from-purple-50 to-white rounded-2xl p-8 shadow-lg border border-purple-100"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-600 mb-6 italic leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="text-4xl">{testimonial.avatar}</div>
                  <div>
                    <div className="font-bold text-gray-900">{testimonial.name}</div>
                    <div className="text-sm text-gray-500">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 lg:py-32 bg-gradient-to-br from-purple-50 to-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h3 className="text-4xl lg:text-5xl font-bold mb-4 text-primary">Simple, Transparent Pricing</h3>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Pay only for what you use. No hidden fees, no subscriptions.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                name: 'Starter',
                price: '$9',
                credits: '10 Movies',
                description: 'Perfect for trying out the service',
                features: [
                  '10 movie translations',
                  '50+ languages',
                  'Standard processing',
                  'Email support',
                  '30-day validity'
                ],
                popular: false,
                gradient: 'from-blue-500 to-cyan-500'
              },
              {
                name: 'Popular',
                price: '$29',
                credits: '50 Movies',
                description: 'Best for movie enthusiasts',
                features: [
                  '50 movie translations',
                  '100+ languages',
                  'Priority processing',
                  'Priority support',
                  'Never expires',
                  'API access'
                ],
                popular: true,
                gradient: 'from-purple-500 to-pink-500'
              },
              {
                name: 'Pro',
                price: '$99',
                credits: '200 Movies',
                description: 'For power users',
                features: [
                  '200 movie translations',
                  '100+ languages',
                  'Fastest processing',
                  'Premium support',
                  'Never expires',
                  'API access',
                  'Bulk discounts'
                ],
                popular: false,
                gradient: 'from-orange-500 to-red-500'
              }
            ].map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`relative bg-white rounded-3xl p-8 shadow-xl border-2 ${plan.popular ? 'border-primary scale-105' : 'border-gray-200'
                  }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-primary to-purple-600 text-white px-6 py-1 rounded-full text-sm font-semibold shadow-lg">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h4 className="text-2xl font-bold mb-2">{plan.name}</h4>
                  <div className="flex items-baseline justify-center gap-2 mb-2">
                    <span className="text-5xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                      {plan.price}
                    </span>
                    {plan.price !== 'Custom' && <span className="text-gray-500">/month</span>}
                  </div>
                  <p className="text-gray-600">{plan.description}</p>
                </div>

                <div className="mb-8">
                  <div className={`text-center py-3 rounded-xl bg-gradient-to-r ${plan.gradient} bg-opacity-10 mb-4`}>
                    <span className="font-bold text-lg">{plan.credits}</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/app"
                  className={`block text-center py-4 rounded-full font-semibold transition-all duration-200 ${plan.popular
                    ? 'bg-gradient-to-r from-primary to-purple-600 text-white hover:shadow-xl hover:scale-105'
                    : 'border-2 border-primary text-primary hover:bg-primary hover:text-white'
                    }`}
                >
                  Get Started
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-32 bg-gradient-to-r from-primary to-purple-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-4xl lg:text-5xl font-bold mb-6">
              Ready to Get Started?
            </h3>
            <p className="text-xl mb-10 max-w-2xl mx-auto opacity-90">
              Join thousands of users translating subtitles with AI
            </p>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 bg-white text-primary px-8 py-4 rounded-full text-lg font-semibold hover:shadow-2xl hover:scale-105 transition-all duration-200"
            >
              Start Translating Now
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                GlobalSubs
              </h2>
              <p className="text-gray-400">&copy; 2025 GlobalSubs. All rights reserved.</p>
            </div>
            <div className="flex gap-6">
              <Link href="/privacy" className="text-gray-400 hover:text-white transition-colors" aria-label="Privacy Policy">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-gray-400 hover:text-white transition-colors" aria-label="Terms of Service">
                Terms of Service
              </Link>
              <Link href="/contact" className="text-gray-400 hover:text-white transition-colors" aria-label="Contact Support">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
