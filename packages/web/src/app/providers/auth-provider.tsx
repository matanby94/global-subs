'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { trackEvent } from '../../lib/analytics';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011';

interface User {
    id: string;
    email: string;
    name?: string;
    avatar_url?: string;
    balance_credits: number;
}

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    loading: boolean;
    signInWithGoogle: (idToken: string) => Promise<void>;
    signInWithApple: (idToken: string) => Promise<void>;
    signOut: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

async function refreshTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;

    try {
        const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefresh } = res.data;
        localStorage.setItem('token', accessToken);
        localStorage.setItem('refreshToken', newRefresh);
        trackEvent('auth_token_refreshed');
        return { accessToken, refreshToken: newRefresh };
    } catch {
        // Refresh failed - clear tokens
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        trackEvent('auth_session_expired');
        return null;
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const loadUser = useCallback(async (token: string) => {
        try {
            const res = await axios.get(`${API_URL}/api/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setUser(res.data);
            setAccessToken(token);
        } catch (err: unknown) {
            const error = err as { response?: { status: number } };
            if (error.response?.status === 401) {
                // Try token refresh
                const result = await refreshTokens();
                if (result) {
                    setAccessToken(result.accessToken);
                    try {
                        const res = await axios.get(`${API_URL}/api/me`, {
                            headers: { Authorization: `Bearer ${result.accessToken}` },
                        });
                        setUser(res.data);
                        return;
                    } catch {
                        // Fall through to clear state
                    }
                }
            }
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            setUser(null);
            setAccessToken(null);
        }
    }, []);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            trackEvent('auth_session_restored');
            loadUser(storedToken).finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [loadUser]);

    const handleOAuthResponse = useCallback(
        async (data: { user: User; accessToken: string; refreshToken: string; isNew?: boolean }, provider: string) => {
            localStorage.setItem('token', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            setAccessToken(data.accessToken);
            setUser(data.user);
            trackEvent('auth_google_success', { provider, isNew: data.isNew ? 1 : 0 });
        },
        []
    );

    const signInWithGoogle = useCallback(
        async (idToken: string) => {
            trackEvent('auth_google_start');
            const res = await axios.post(`${API_URL}/api/auth/google`, { idToken });
            await handleOAuthResponse(res.data, 'google');
        },
        [handleOAuthResponse]
    );

    const signInWithApple = useCallback(
        async (idToken: string) => {
            trackEvent('auth_google_start');
            const res = await axios.post(`${API_URL}/api/auth/apple`, { idToken });
            await handleOAuthResponse(res.data, 'apple');
        },
        [handleOAuthResponse]
    );

    const signOut = useCallback(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        setUser(null);
        setAccessToken(null);
        trackEvent('auth_signout');
    }, []);

    const refreshUser = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (token) await loadUser(token);
    }, [loadUser]);

    return (
        <AuthContext.Provider
            value={{ user, accessToken, loading, signInWithGoogle, signInWithApple, signOut, refreshUser }}
        >
            {children}
        </AuthContext.Provider>
    );
}
