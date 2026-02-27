'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';

interface ScrollRevealProps {
    children: ReactNode;
    className?: string;
    animation?: string;
    delay?: number;
}

export default function ScrollReveal({
    children,
    className = '',
    animation = 'animate-fade-in-up',
    delay = 0,
}: ScrollRevealProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [revealed, setRevealed] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    if (delay > 0) {
                        setTimeout(() => setRevealed(true), delay);
                    } else {
                        setRevealed(true);
                    }
                    observer.unobserve(el);
                }
            },
            { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [delay]);

    return (
        <div
            ref={ref}
            className={`${className} ${revealed ? animation : 'opacity-0 translate-y-4'}`}
            style={{ willChange: revealed ? 'auto' : 'opacity, transform' }}
        >
            {children}
        </div>
    );
}
