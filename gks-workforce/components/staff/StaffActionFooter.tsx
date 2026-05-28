'use client';

import { ReactNode } from 'react';

/** Fixed bar above the staff tab bar; pair with content `pb-32` (or use StaffSubpageShell footer slot). */
export default function StaffActionFooter({ children }: { children: ReactNode }) {
    return (
        <div
            className="fixed left-0 right-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur-md"
            style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
            <div className="max-w-lg mx-auto px-4 py-2">{children}</div>
        </div>
    );
}
