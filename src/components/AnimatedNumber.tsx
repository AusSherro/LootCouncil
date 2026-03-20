'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
    value: number;
    duration?: number;
    formatFn?: (value: number) => string;
    className?: string;
}

export default function AnimatedNumber({ value, duration = 400, formatFn, className }: AnimatedNumberProps) {
    const [display, setDisplay] = useState(value);
    const prevValue = useRef(value);
    const rafRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        const from = prevValue.current;
        const to = value;
        prevValue.current = value;

        if (from === to) return;

        const start = performance.now();
        const diff = to - from;

        function tick(now: number) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(from + diff * eased);

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                setDisplay(to);
            }
        }

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [value, duration]);

    return (
        <span className={className}>
            {formatFn ? formatFn(display) : display.toFixed(0)}
        </span>
    );
}
