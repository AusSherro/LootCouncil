'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Coins,
    ScrollText,
    PiggyBank,
    Settings,
    BarChart3,
    Wallet,
    Flame,
    LineChart,
    Sparkles,
} from 'lucide-react';

const navigation = [
    { name: 'Budget', href: '/budget', icon: PiggyBank },
    { name: 'Transactions', href: '/transactions', icon: ScrollText },
    { name: 'Accounts', href: '/accounts', icon: Coins },
    { name: 'Investments', href: '/investments', icon: LineChart },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    { name: 'FIRE', href: '/fire', icon: Flame },
    { name: 'Assistant', href: '/assistant', icon: Sparkles },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 bg-background-secondary border-r border-border flex flex-col">
            {/* Logo */}
            <Link href="/" className="h-16 flex items-center gap-3 px-5 border-b border-border hover:bg-background-tertiary/50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="font-semibold text-lg text-foreground">Loot Council</h1>
                    <p className="text-xs text-neutral">Personal Finance</p>
                </div>
            </Link>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-neutral hover:text-foreground hover:bg-background-tertiary/50'
                            }`}
                        >
                            <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                            <span className="font-medium text-sm">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Settings */}
            <div className="p-3 border-t border-border">
                <Link
                    href="/settings"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        pathname === '/settings'
                            ? 'bg-primary/10 text-primary'
                            : 'text-neutral hover:text-foreground hover:bg-background-tertiary/50'
                    }`}
                >
                    <Settings className={`w-5 h-5 ${pathname === '/settings' ? 'text-primary' : ''}`} />
                    <span className="font-medium text-sm">Settings</span>
                </Link>
            </div>
        </aside>
    );
}
