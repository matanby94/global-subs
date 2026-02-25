'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './auth-provider';
import { ReactNode } from 'react';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '';

export function Providers({ children }: { children: ReactNode }) {
    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <AuthProvider>{children}</AuthProvider>
        </GoogleOAuthProvider>
    );
}
