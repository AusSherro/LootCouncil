'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, ChevronDown, Check, User } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { navigation, settingsItem } from '@/lib/navigation';
import { useProfile } from '@/components/ProfileProvider';

export default function Sidebar() {
    const pathname = usePathname();
    const { profiles, activeProfile, switchProfile } = useProfile();
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const navRef = useRef<HTMLElement>(null);
    const [indicatorY, setIndicatorY] = useState<number | null>(null);

    // Compute active nav index for the sliding indicator
    const activeIndex = useMemo(() => {
        const idx = navigation.findIndex(
            (item) => pathname === item.href || pathname?.startsWith(item.href + '/')
        );
        if (idx >= 0) return idx;
        if (pathname === settingsItem.href) return navigation.length; // settings is after nav
        return -1;
    }, [pathname]);

    // Position the indicator
    useEffect(() => {
        if (!navRef.current || activeIndex < 0) {
            setIndicatorY(null);
            return;
        }
        const navEl = navRef.current;
        const links = navEl.querySelectorAll<HTMLElement>('[data-nav-item]');
        const target = links[activeIndex];
        if (target) {
            const navRect = navEl.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            setIndicatorY(targetRect.top - navRect.top + (targetRect.height - 32) / 2);
        }
    }, [activeIndex]);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowProfileMenu(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <aside className="hidden lg:flex w-64 bg-background-secondary border-r border-border flex-col relative overflow-hidden">
            {/* Subtle gradient shimmer at top */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[color:var(--gold)]/[0.03] to-transparent pointer-events-none" />

            {/* Logo */}
            <Link href="/" className="h-16 flex items-center gap-3 px-5 border-b border-border hover:bg-background-tertiary/50 transition-colors relative z-10">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_16px_var(--gold-glow)]">
                    <Wallet className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="font-semibold text-lg text-gold-gradient bg-gradient-to-r from-[color:var(--gold-light)] to-[color:var(--gold)] bg-clip-text text-transparent">Loot Council</h1>
                    <p className="text-xs text-neutral">Personal Finance</p>
                </div>
            </Link>

            {/* Profile Switcher */}
            <div className="px-3 pt-3 pb-1" ref={menuRef}>
                <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-background-tertiary/50 hover:bg-background-tertiary transition-colors"
                >
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="flex-1 text-left text-sm font-medium text-foreground truncate">
                        {activeProfile?.name || 'Select Profile'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-neutral transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
                </button>

                {showProfileMenu && profiles.length > 1 && (
                    <div className="mt-1 py-1 bg-background-secondary border border-border rounded-lg shadow-lg z-50">
                        {profiles.map((profile) => (
                            <button
                                key={profile.id}
                                onClick={() => {
                                    if (profile.id !== activeProfile?.id) {
                                        switchProfile(profile.id);
                                    }
                                    setShowProfileMenu(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background-tertiary/50 transition-colors"
                            >
                                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                                    <User className="w-3 h-3 text-primary" />
                                </div>
                                <span className="flex-1 text-left text-foreground">{profile.name}</span>
                                {profile.id === activeProfile?.id && (
                                    <Check className="w-4 h-4 text-primary" />
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 relative" ref={navRef}>
                {/* Sliding active indicator */}
                {indicatorY !== null && (
                    <div
                        className="sidebar-active-indicator"
                        style={{ transform: `translateY(${indicatorY}px)` }}
                    />
                )}

                {navigation.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            data-nav-item
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                                isActive
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'text-neutral hover:text-foreground hover:bg-background-tertiary/50'
                            }`}
                        >
                            <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                            <span className="text-sm">{item.name}</span>
                        </Link>
                    );
                })}

                {/* Settings — last nav item for indicator tracking */}
                <div className="pt-2 mt-2 border-t border-border">
                    {(() => {
                        const Icon = settingsItem.icon;
                        const isActive = pathname === settingsItem.href;
                        return (
                            <Link
                                href={settingsItem.href}
                                data-nav-item
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                                    isActive
                                        ? 'bg-primary/10 text-primary font-semibold'
                                        : 'text-neutral hover:text-foreground hover:bg-background-tertiary/50'
                                }`}
                            >
                                <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                                <span className="text-sm">{settingsItem.name}</span>
                            </Link>
                        );
                    })()}
                </div>
            </nav>
        </aside>
    );
}
