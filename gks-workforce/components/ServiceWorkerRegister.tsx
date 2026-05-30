'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            'serviceWorker' in navigator
        ) {
            const handleRegister = async () => {
                try {
                    const reg = await navigator.serviceWorker.register('/sw.js');
                    console.log('Service Worker registered successfully with scope:', reg.scope);
                } catch (error) {
                    console.error('Service Worker registration failed:', error);
                }
            };

            // Register after page load to avoid blocking initial load
            if (document.readyState === 'complete') {
                handleRegister();
            } else {
                window.addEventListener('load', handleRegister);
                return () => window.removeEventListener('load', handleRegister);
            }
        }
    }, []);

    return null;
}
