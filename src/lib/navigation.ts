import {
    PiggyBank,
    ScrollText,
    Coins,
    LineChart,
    BarChart3,
    Flame,
    Sparkles,
    Settings,
} from 'lucide-react';

export interface NavItem {
    name: string;
    href: string;
    icon: typeof PiggyBank;
    mobileVisible?: boolean;
}

export const navigation: NavItem[] = [
    { name: 'Budget', href: '/budget', icon: PiggyBank, mobileVisible: true },
    { name: 'Transactions', href: '/transactions', icon: ScrollText, mobileVisible: true },
    { name: 'Accounts', href: '/accounts', icon: Coins, mobileVisible: true },
    { name: 'Investments', href: '/investments', icon: LineChart },
    { name: 'Reports', href: '/reports', icon: BarChart3, mobileVisible: true },
    { name: 'FIRE', href: '/fire', icon: Flame },
    { name: 'Assistant', href: '/assistant', icon: Sparkles },
];

export const settingsItem: NavItem = {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    mobileVisible: true,
};

export const mobileNavigation = [...navigation.filter(item => item.mobileVisible), settingsItem];
