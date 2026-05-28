'use client';

import { useState, useEffect } from 'react';
import { Share, Download, X } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function PwaInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOSDevice, setIsIOSDevice] = useState(false);

    useEffect(() => {
        // Only run on client side
        if (typeof window === 'undefined') return;

        // Check if already dismissed
        const isDismissed = localStorage.getItem('gks_pwa_dismissed') === 'true';
        if (isDismissed) return;

        // Check if already in standalone (installed) mode
        const isStandalone = 
            window.matchMedia('(display-mode: standalone)').matches || 
            (window.navigator as any).standalone === true;
        
        if (isStandalone) return;

        // Detect iOS device
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOSDevice(isIOS);

        if (isIOS) {
            // Show prompt for iOS after a short delay
            const timer = setTimeout(() => setShowPrompt(true), 3000);
            return () => clearTimeout(timer);
        }

        // Handler for Android/Chrome prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            // Show prompt after a short delay
            setTimeout(() => setShowPrompt(true), 3000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            setShowPrompt(false);
        }
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('gks_pwa_dismissed', 'true');
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-sm mx-auto bg-slate-900/95 backdrop-blur-md border border-slate-800 text-white rounded-xl shadow-xl p-4 animate-in slide-in-from-bottom-5 duration-300">
            <button 
                type="button" 
                onClick={handleDismiss}
                className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Dismiss"
            >
                <X size={16} />
            </button>
            <div className="flex gap-3 items-start pr-4">
                <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
                    <Download size={18} />
                </div>
                <div className="space-y-1">
                    <p className="text-xs font-semibold">Install GKS Workforce</p>
                    <p className="text-[11px] text-slate-300 leading-normal">
                        {isIOSDevice 
                            ? "Tap the Share button below and select 'Add to Home Screen' to launch full-screen."
                            : "Install GKS Workforce on your home screen for quick offline access and full-screen rostering."
                        }
                    </p>
                </div>
            </div>
            {!isIOSDevice ? (
                <div className="mt-3 flex gap-2">
                    <Button 
                        variant="primary" 
                        size="sm" 
                        className="text-[11px] font-semibold tracking-tight h-8 px-4 flex-1"
                        onClick={handleInstallClick}
                    >
                        Install
                    </Button>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="text-[11px] font-semibold tracking-tight h-8 px-4 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                        onClick={handleDismiss}
                    >
                        Maybe later
                    </Button>
                </div>
            ) : (
                <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                    <span>Instructions: Tap</span>
                    <Share size={12} className="text-blue-400" />
                    <span>then</span>
                    <span className="text-white border border-slate-700 px-1 py-0.5 rounded">Add to Home Screen</span>
                </div>
            )}
        </div>
    );
}
