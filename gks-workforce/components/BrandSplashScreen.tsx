'use client';

import Logo from '@/components/Logo';

export default function BrandSplashScreen() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#f9fafb] animate-in fade-in duration-300">
            <div className="flex flex-col items-center gap-6">
                {/* Brand Logo Container with soft shadow and pulsing backdrop glow */}
                <div className="relative flex items-center justify-center">
                    <div className="absolute -inset-4 bg-orange-500/10 rounded-3xl blur-md animate-pulse duration-2000" />
                    <Logo size={100} className="shadow-lg relative rounded-2xl border border-white" />
                </div>

                {/* Brand-consistent sequential bouncing dots */}
                <div className="flex items-center gap-2 mt-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        </div>
    );
}
