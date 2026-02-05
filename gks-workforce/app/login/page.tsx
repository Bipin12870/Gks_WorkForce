'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const { showNotification } = useNotification();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Determine if input is a username (no @) or an email
            let loginEmail = email.trim();
            if (!loginEmail.includes('@')) {
                // Staff username login - append internal domain
                loginEmail = `${loginEmail}@gks.internal`;
            }

            await login(loginEmail, password);
            router.push('/dashboard');
        } catch (err: any) {
            showNotification(err.message || 'Failed to login. Please check your credentials.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="max-w-md w-full card-base p-8">
                <div className="text-center mb-10">
                    <Logo className="mb-6 mx-auto" width={140} height={45} />
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Workforce</h1>
                    <p className="text-sm text-gray-500 mt-1">Sign in to your shop account</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="email" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                            Email or Username
                        </label>
                        <input
                            id="email"
                            type="text"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="input-base"
                            placeholder="e.g. admin@gks.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="input-base"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <p className="mt-8 text-center text-xs text-gray-400">
                    Contact your manager for account access
                </p>
            </div>
        </div>
    );
}
