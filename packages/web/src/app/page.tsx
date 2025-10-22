import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-primary text-white py-4">
        <nav className="container mx-auto px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Stremio AI Subtitles</h1>
          <div className="space-x-4">
            <Link href="/pricing" className="hover:underline">
              Pricing
            </Link>
            <Link href="/docs" className="hover:underline">
              Docs
            </Link>
            <Link href="/app" className="bg-white text-primary px-4 py-2 rounded hover:bg-gray-100">
              Sign In
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-5xl font-bold mb-6">
          AI-Powered Subtitle Translations
        </h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Get professionally translated subtitles for your favorite movies and series
          using cutting-edge LLM technology. Fast, accurate, and affordable.
        </p>
        <div className="space-x-4">
          <Link
            href="/app"
            className="inline-block bg-primary text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-secondary"
          >
            Get Started
          </Link>
          <Link
            href="/docs"
            className="inline-block border-2 border-primary text-primary px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-50"
          >
            Learn More
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20">
        <div className="container mx-auto px-4">
          <h3 className="text-3xl font-bold text-center mb-12">Features</h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h4 className="text-xl font-bold mb-3">🌍 100+ Languages</h4>
              <p className="text-gray-600">
                Translate subtitles to and from over 100 languages with high accuracy.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h4 className="text-xl font-bold mb-3">⚡ Fast Processing</h4>
              <p className="text-gray-600">
                Get your translated subtitles in seconds with our optimized pipeline.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h4 className="text-xl font-bold mb-3">💰 Pay As You Go</h4>
              <p className="text-gray-600">
                Credit-based system. Only pay for what you use. No subscriptions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-20">
        <h3 className="text-3xl font-bold text-center mb-12">How It Works</h3>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-start gap-4">
            <div className="bg-primary text-white rounded-full w-10 h-10 flex items-center justify-center font-bold flex-shrink-0">
              1
            </div>
            <div>
              <h4 className="font-bold text-lg mb-2">Sign Up & Get Credits</h4>
              <p className="text-gray-600">
                Create an account and purchase credits to start translating.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="bg-primary text-white rounded-full w-10 h-10 flex items-center justify-center font-bold flex-shrink-0">
              2
            </div>
            <div>
              <h4 className="font-bold text-lg mb-2">Upload or Select Subtitles</h4>
              <p className="text-gray-600">
                Choose subtitles from OpenSubtitles or upload your own.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="bg-primary text-white rounded-full w-10 h-10 flex items-center justify-center font-bold flex-shrink-0">
              3
            </div>
            <div>
              <h4 className="font-bold text-lg mb-2">Get Translated Subtitles</h4>
              <p className="text-gray-600">
                Download or stream directly in Stremio with our addon.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; 2025 Stremio AI Subtitles. All rights reserved.</p>
          <div className="mt-4 space-x-4">
            <Link href="/privacy" className="hover:underline" aria-label="Privacy Policy">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:underline" aria-label="Terms of Service">
              Terms of Service
            </Link>
            <Link href="/contact" className="hover:underline" aria-label="Contact Support">
              Contact Us
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
