import Link from 'next/link';

export const metadata = {
    title: 'Terms of Service - GlobalSubs',
    description: 'Terms of service for GlobalSubs subtitle translation service',
};

export default function TermsPage() {
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
                <h1 className="text-4xl font-bold mb-8 text-primary">Terms of Service</h1>

                <div className="bg-white rounded-lg shadow-lg p-8 prose prose-lg max-w-none">
                    <p className="text-gray-600 mb-6">
                        <strong>Last Updated:</strong> October 22, 2025
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">1. Acceptance of Terms</h2>
                    <p className="text-gray-700 mb-6">
                        By accessing and using GlobalSubs, you agree to be bound by these Terms of Service.
                        If you do not agree to these terms, please do not use our service.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">2. Service Description</h2>
                    <p className="text-gray-700 mb-6">
                        GlobalSubs provides AI-powered subtitle translation services. We translate subtitle
                        files between 100+ languages using advanced AI technology. The service is provided
                        on a credit-based system.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">3. User Accounts</h2>
                    <p className="text-gray-700 mb-4">
                        To use our services, you must:
                    </p>
                    <ul className="list-disc pl-6 text-gray-700 mb-6">
                        <li>Provide accurate and complete registration information</li>
                        <li>Maintain the security of your account credentials</li>
                        <li>Be responsible for all activities under your account</li>
                        <li>Notify us immediately of any unauthorized use</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">4. Credits and Payments</h2>
                    <p className="text-gray-700 mb-6">
                        Translation services are purchased using credits. Credits are non-refundable once
                        purchased. Unused credits do not expire unless specified in your plan. Payments
                        are processed securely through Stripe.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">5. Acceptable Use</h2>
                    <p className="text-gray-700 mb-4">
                        You agree not to:
                    </p>
                    <ul className="list-disc pl-6 text-gray-700 mb-6">
                        <li>Upload content that violates copyright or intellectual property rights</li>
                        <li>Use the service for illegal or harmful purposes</li>
                        <li>Attempt to circumvent usage limits or payment systems</li>
                        <li>Reverse engineer or attempt to extract our AI models</li>
                        <li>Resell or redistribute our services without permission</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">6. Content Rights</h2>
                    <p className="text-gray-700 mb-6">
                        You retain all rights to the content you upload. By using our service, you grant
                        us a limited license to process your subtitle files for translation purposes.
                        Translated files are your property.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">7. Service Availability</h2>
                    <p className="text-gray-700 mb-6">
                        We strive to maintain high availability but do not guarantee uninterrupted service.
                        We reserve the right to modify, suspend, or discontinue any part of the service
                        with reasonable notice.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">8. Limitation of Liability</h2>
                    <p className="text-gray-700 mb-6">
                        GlobalSubs is provided &quot;as is&quot; without warranties of any kind. We are not liable
                        for any translation errors, service interruptions, or data loss. Our liability is
                        limited to the amount you paid for the service.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">9. Termination</h2>
                    <p className="text-gray-700 mb-6">
                        We reserve the right to terminate or suspend your account for violations of these
                        terms. You may terminate your account at any time through your account settings.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">10. Changes to Terms</h2>
                    <p className="text-gray-700 mb-6">
                        We may update these terms from time to time. Continued use of the service after
                        changes constitutes acceptance of the new terms.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-primary">11. Contact Information</h2>
                    <p className="text-gray-700 mb-6">
                        For questions about these Terms of Service, contact us at{' '}
                        <a href="mailto:legal@globalsubs.net" className="text-primary hover:underline">
                            legal@globalsubs.net
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
