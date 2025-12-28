'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ContactPage() {
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
    };

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
                <h1 className="text-4xl font-bold mb-8">Contact Us</h1>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Contact Form */}
                    <div className="bg-white rounded-lg shadow-lg p-8">
                        <h2 className="text-2xl font-bold mb-6">Send us a Message</h2>

                        {submitted ? (
                            <div className="text-center py-8">
                                <div className="text-6xl mb-4">✅</div>
                                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                                    Message Sent!
                                </h3>
                                <p className="text-gray-500 mb-6">
                                    We'll get back to you as soon as possible.
                                </p>
                                <button
                                    onClick={() => setSubmitted(false)}
                                    className="text-primary hover:underline"
                                >
                                    Send Another Message
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                        placeholder="Your name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                        placeholder="your.email@example.com"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Subject
                                    </label>
                                    <select
                                        required
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    >
                                        <option value="">Select a topic</option>
                                        <option value="support">Technical Support</option>
                                        <option value="billing">Billing Question</option>
                                        <option value="feature">Feature Request</option>
                                        <option value="partnership">Partnership Inquiry</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Message
                                    </label>
                                    <textarea
                                        required
                                        rows={6}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                        placeholder="How can we help you?"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="w-full bg-gradient-to-r from-primary to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200"
                                >
                                    Send Message
                                </button>
                            </form>
                        )}
                    </div>

                    {/* Contact Information */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-lg p-8">
                            <h2 className="text-2xl font-bold mb-6">Get in Touch</h2>

                            <div className="space-y-4">
                                <div className="flex items-start gap-4">
                                    <div className="text-2xl">📧</div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">Email</h3>
                                        <a href="mailto:support@globalsubs.net" className="text-primary hover:underline">
                                            support@globalsubs.net
                                        </a>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="text-2xl">💬</div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">Live Chat</h3>
                                        <p className="text-gray-600">Available Mon-Fri, 9am-5pm EST</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="text-2xl">📖</div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">Documentation</h3>
                                        <p className="text-gray-600">Check our comprehensive guides and FAQs</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-purple-50 to-white rounded-lg border border-purple-100 p-6">
                            <h3 className="font-bold text-lg mb-3">Need Immediate Help?</h3>
                            <p className="text-gray-700 mb-4">
                                For urgent issues or technical support, our team is here to help.
                            </p>
                            <Link
                                href="/app"
                                className="inline-block bg-gradient-to-r from-primary to-purple-600 text-white px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200"
                            >
                                Visit Dashboard
                            </Link>
                        </div>
                    </div>
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
