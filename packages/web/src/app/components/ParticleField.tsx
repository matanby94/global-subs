'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface Particle {
    id: number;
    x: number;
    y: number;
    size: number;
    duration: number;
    delay: number;
    opacity: number;
}

export default function ParticleField({ count = 30 }: { count?: number }) {
    const particles = useMemo<Particle[]>(() => {
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 4 + 1,
            duration: Math.random() * 15 + 10,
            delay: Math.random() * 5,
            opacity: Math.random() * 0.3 + 0.05,
        }));
    }, [count]);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full bg-purple-400"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                        opacity: p.opacity,
                    }}
                    animate={{
                        y: [0, -30, 0, 20, 0],
                        x: [0, 15, -10, 5, 0],
                        opacity: [p.opacity, p.opacity * 2, p.opacity, p.opacity * 1.5, p.opacity],
                    }}
                    transition={{
                        duration: p.duration,
                        delay: p.delay,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
            ))}
        </div>
    );
}
