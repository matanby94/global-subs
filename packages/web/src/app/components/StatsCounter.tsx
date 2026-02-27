'use client';

import { useState, useEffect, useRef } from 'react';

export default function StatsCounter() {
    const [count, setCount] = useState({ translations: 0, users: 0, languages: 0 });
    const [hasStarted, setHasStarted] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Trigger counting only when scrolled into view
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasStarted) {
                    setHasStarted(true);
                    observer.unobserve(el);
                }
            },
            { threshold: 0.3 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [hasStarted]);

    // Run the counting animation
    useEffect(() => {
        if (!hasStarted) return;

        const duration = 2000;
        const targets = { translations: 1250000, users: 15000, languages: 100 };
        let start: number | null = null;
        let raf: number;

        const tick = (timestamp: number) => {
            if (!start) start = timestamp;
            const elapsed = timestamp - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic for a satisfying deceleration
            const eased = 1 - Math.pow(1 - progress, 3);

            setCount({
                translations: Math.floor(targets.translations * eased),
                users: Math.floor(targets.users * eased),
                languages: Math.floor(targets.languages * eased),
            });

            if (progress < 1) {
                raf = requestAnimationFrame(tick);
            }
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [hasStarted]);

    return (
        <div ref={containerRef} className="grid md:grid-cols-3 gap-8 text-center">
            {[
                { value: count.translations.toLocaleString(), label: 'Subtitles Translated', suffix: '+' },
                { value: count.users.toLocaleString(), label: 'Happy Users', suffix: '+' },
                { value: count.languages.toString(), label: 'Languages Supported', suffix: '+' },
            ].map((stat) => (
                <div key={stat.label} className="animate-fade-in-up">
                    <div className="text-4xl md:text-5xl font-extrabold mb-1 tracking-tight tabular-nums">
                        {stat.value}{stat.suffix}
                    </div>
                    <div className="text-purple-200 text-base font-medium">{stat.label}</div>
                </div>
            ))}
        </div>
    );
}
