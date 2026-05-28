'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';
import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';
import { ADMIN_NAV, isAdminNavActive } from '@/components/admin/adminNav';
import { LogOut, Menu, X } from 'lucide-react';

export default function AdminShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { userData, logout } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    const navContent = (
        <nav className="flex flex-col gap-0.5 p-3" aria-label="Admin navigation">
            {ADMIN_NAV.map((item) => {
                const active = isAdminNavActive(pathname, item);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`admin-nav-link ${active ? 'admin-nav-link-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                    >
                        <Icon icon={item.icon} size="sm" className="shrink-0" />
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );

    return (
        <div className="min-h-screen bg-background flex">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex lg:w-60 xl:w-64 flex-col border-r border-gray-200 bg-white shrink-0 sticky top-0 h-screen">
                <div className="px-4 py-5 border-b border-gray-100">
                    <Link href="/dashboard" className="flex items-center gap-2.5">
                        <Logo size={36} />
                        <span className="font-semibold text-gray-900 tracking-tight text-sm">GKS Workforce</span>
                    </Link>
                    <p className="admin-kicker mt-3 truncate">{userData?.name ?? 'Admin'}</p>
                </div>
                <div className="flex-1 overflow-y-auto">{navContent}</div>
                <div className="p-3 border-t border-gray-100">
                    <Button variant="ghost" size="sm" fullWidth onClick={handleLogout} className="justify-start">
                        <Icon icon={LogOut} size="sm" />
                        Sign out
                    </Button>
                </div>
            </aside>

            {/* Mobile drawer */}
            {mobileOpen && (
                <button
                    type="button"
                    className="lg:hidden fixed inset-0 z-40 bg-black/40"
                    aria-label="Close menu"
                    onClick={() => setMobileOpen(false)}
                />
            )}
            <aside
                className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] bg-white border-r border-gray-200 shadow-xl flex flex-col transition-transform duration-200 ${
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
                    <Link href="/dashboard" className="flex items-center gap-2.5">
                        <Logo size={32} />
                        <span className="font-semibold text-gray-900 tracking-tight text-sm">GKS Workforce</span>
                    </Link>
                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100"
                        aria-label="Close menu"
                    >
                        <Icon icon={X} size="md" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">{navContent}</div>
                <div className="p-3 border-t border-gray-100">
                    <Button variant="ghost" size="sm" fullWidth onClick={handleLogout} className="justify-start">
                        <Icon icon={LogOut} size="sm" />
                        Sign out
                    </Button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-white/95 backdrop-blur-sm border-b border-gray-200">
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
                        aria-label="Open menu"
                    >
                        <Icon icon={Menu} size="md" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <p className="admin-kicker">Operations</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">
                            {ADMIN_NAV.find((i) => isAdminNavActive(pathname, i))?.label ?? 'Admin'}
                        </p>
                    </div>
                </header>

                <main className="flex-1 admin-main">{children}</main>
            </div>
        </div>
    );
}
