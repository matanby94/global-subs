import Link from 'next/link';

export const metadata = {
    title: 'Privacy Policy - GlobalSubs',
    description: 'Privacy policy for GlobalSubs subtitle translation service',
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow">
                <div className="container mx-auto px-4 py-4">
                    <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                        GlobalSubs
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 py-12 max-w-4xl">
                <h1 className="text-4xl font-bold mb-8 text-primary">Privacy Policy</h1>

                <div className="bg-white rounded-lg shadow-lg p-8 prose prose-lg max-w-none">
                    <p className="text-gray-600 mb-6">
                        <strong>Last Updated:</strong> October 22, 2025
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">1. Information We Collect</h2>
                    <p className="text-gray-700 mb-4">
                        We collect information that you provide directly to us, including:
                    </p>
                    <ul className="list-disc pl-6 text-gray-700 mb-6">
                        <li>Email address for account creation and authentication</li>
                        <li>Subtitle files you upload for translation</li>
                        <li>Payment information (processed securely through Stripe)</li>
                        <li>Usage data and translation history</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">2. How We Use Your Information</h2>
                    <p className="text-gray-700 mb-4">
                        We use the information we collect to:
                    </p>
                    <ul className="list-disc pl-6 text-gray-700 mb-6">
                        <li>Provide, maintain, and improve our translation services</li>
                        <li>Process your translation requests</li>
                        <li>Send you technical notices and support messages</li>
                        <li>Respond to your comments and questions</li>
                        <li>Monitor and analyze usage patterns</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">3. Data Storage and Security</h2>
                    <p className="text-gray-700 mb-6">
                        We take reasonable measures to protect your information from unauthorized access,
                        use, or disclosure. Your subtitle files are processed and stored securely, and are
                        automatically deleted after 30 days.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">4. Third-Party Services</h2>
                    <p className="text-gray-700 mb-6">
                        We use third-party services for payment processing (Stripe) and AI translation
                        (OpenAI, DeepL, Google Translate). These services have their own privacy policies
                        governing the use of your information.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">5. Your Rights</h2>
                    <p className="text-gray-700 mb-4">
                        You have the right to:
                    </p>
                    <ul className="list-disc pl-6 text-gray-700 mb-6">
                        <li>Access and update your personal information</li>
                        <li>Delete your account and associated data</li>
                        <li>Export your translation history</li>
                        <li>Opt out of marketing communications</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">6. Contact Us</h2>
                    <p className="text-gray-700 mb-6">
                        If you have any questions about this Privacy Policy, please contact us at{' '}
                        <a href="mailto:privacy@globalsubs.net" className="text-primary hover:underline">
                            privacy@globalsubs.net
                        </a>
                    </p>
                </div>

                <div className="mt-8 text-center">
                    <Link href="/" className="text-primary hover:underline">
                        ← Back to Home
                    </Link>
                </div>
            </main>
        </div>
    );
}
