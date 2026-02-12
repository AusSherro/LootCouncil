'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    PiggyBank,
    ScrollText,
    Coins,
    BarChart3,
    Settings,
} from 'lucide-react';

const navItems = [
    { name: 'Budget', href: '/budget', icon: PiggyBank },
    { name: 'Transactions', href: '/transactions', icon: ScrollText },
    { name: 'Accounts', href: '/accounts', icon: Coins },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },
];

export default function MobileNav() {
    const pathname = usePathname();

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-background-secondary border-t border-border z-50 safe-area-bottom">
            <div className="flex items-center justify-around h-16">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                                isActive ? 'text-gold' : 'text-neutral hover:text-foreground'
                            }`}
                        >
                            <Icon className="w-5 h-5 mb-1" />
                            <span className="text-xs font-medium">{item.name}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
