'use client';

interface GoldCoinSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const sizes = {
    sm: { coin: 'w-6 h-6', text: 'text-xs' },
    md: { coin: 'w-10 h-10', text: 'text-base' },
    lg: { coin: 'w-14 h-14', text: 'text-xl' },
};

export default function GoldCoinSpinner({ size = 'md', className = '' }: GoldCoinSpinnerProps) {
    const s = sizes[size];
    return (
        <div className={`inline-flex items-center justify-center ${className}`}>
            <div className={`${s.coin} coin-spin`}>
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Outer ring */}
                    <circle cx="20" cy="20" r="18" fill="url(#coinGrad)" stroke="var(--gold-dark)" strokeWidth="1.5" />
                    {/* Inner ring */}
                    <circle cx="20" cy="20" r="14" fill="none" stroke="var(--gold-dark)" strokeWidth="0.75" opacity="0.5" />
                    {/* Dollar sign */}
                    <text x="20" y="25" textAnchor="middle" fill="var(--gold-dark)" fontWeight="600" fontSize="14" fontFamily="system-ui">$</text>
                    {/* Shine highlight */}
                    <ellipse cx="14" cy="13" rx="4" ry="6" fill="white" opacity="0.1" transform="rotate(-20, 14, 13)" />
                    <defs>
                        <linearGradient id="coinGrad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                            <stop stopColor="var(--gold-light)" />
                            <stop offset="0.5" stopColor="var(--gold)" />
                            <stop offset="1" stopColor="var(--gold-dark)" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
        </div>
    );
}
