'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [resettingPassword, setResettingPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const { login } = useAuth();
    const { showNotification } = useNotification();
    const router = useRouter();

    const getAuthErrorMessage = (error: any) => {
        const code = error?.code || '';
        const message = error?.message || '';
        
        // Check for specific codes or substrings in the message
        if (code === 'auth/invalid-email' || message.includes('invalid-email')) {
            return 'Invalid email format. Please check your entry.';
        }
        if (code === 'auth/user-disabled' || message.includes('user-disabled')) {
            return 'This account has been disabled. Please contact your manager.';
        }
        if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential' || 
            message.includes('user-not-found') || message.includes('wrong-password') || message.includes('invalid-credential')) {
            return 'Invalid username or password. Please try again.';
        }
        if (code === 'auth/too-many-requests' || message.includes('too-many-requests')) {
            return 'Too many failed attempts. Access restricted temporarily.';
        }
        if (code === 'auth/network-request-failed' || message.includes('network-request-failed')) {
            return 'Network error. Please check your internet connection.';
        }

        // Fallback: If we can't map it, show a generic but clear message
        return 'Login failed. Please check your credentials and try again.';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setLocalError(null);

        try {
            // Determine if input is a username (no @) or an email
            let loginEmail = email.trim();
            if (!loginEmail.includes('@')) {
                // Staff username login - append internal domain
                // IMPORTANT: Must match the domain used in staff creation (@internal.gks)
                loginEmail = `${loginEmail}@internal.gks`;
            }

            await login(loginEmail, password);
            router.push('/dashboard');
        } catch (err: any) {
            const friendlyMessage = getAuthErrorMessage(err);
            setLocalError(friendlyMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email.trim() || email.trim() !== 'gksyerros@gmail.com') return;
        
        setResettingPassword(true);
        setLocalError(null);
        try {
            const { auth } = await import('@/lib/firebase');
            const { sendPasswordResetEmail } = await import('firebase/auth');
            await sendPasswordResetEmail(auth, email.trim());
            showNotification('Success! A password reset link has been sent to your Gmail.', 'success');
        } catch (err: any) {
            setLocalError(getAuthErrorMessage(err));
        } finally {
            setResettingPassword(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="max-w-md w-full card-base p-8">
                <div className="text-center mb-10">
                    <Link href="/dashboard">
                        <Logo className="mb-6 mx-auto" width={140} height={45} />
                    </Link>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Workforce</h1>
                    <p className="text-sm text-gray-500 mt-1">Sign in to your shop account</p>
                </div>

                {localError && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <p className="text-sm text-red-800 font-medium leading-relaxed">{localError}</p>
                    </div>
                )}

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

                    <div className="relative">
                        <div className="flex justify-between items-center mb-2">
                            <label htmlFor="password" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Password
                            </label>
                            {email.trim() === 'gksyerros@gmail.com' && (
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    disabled={resettingPassword}
                                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 uppercase tracking-tight disabled:opacity-50"
                                >
                                    {resettingPassword ? 'Sending...' : 'Forgot Password?'}
                                </button>
                            )}
                        </div>
                        <div className="relative">
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="input-base pr-10"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                {showPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
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
