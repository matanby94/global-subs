'use client';

import { useEffect, useState, useRef } from 'react';

interface LanguageNode {
    id: string;
    label: string;
    x: number;
    y: number;
    size: number;
    delay: number;
}

interface Connection {
    from: string;
    to: string;
}

const LANGUAGES: LanguageNode[] = [
    { id: 'en', label: 'EN', x: 50, y: 30, size: 18, delay: 0 },
    { id: 'es', label: 'ES', x: 82, y: 45, size: 16, delay: 0.3 },
    { id: 'fr', label: 'FR', x: 25, y: 55, size: 15, delay: 0.5 },
    { id: 'de', label: 'DE', x: 75, y: 72, size: 14, delay: 0.7 },
    { id: 'ja', label: 'JA', x: 88, y: 20, size: 13, delay: 0.9 },
    { id: 'zh', label: 'ZH', x: 15, y: 35, size: 16, delay: 1.1 },
    { id: 'ar', label: 'AR', x: 38, y: 78, size: 13, delay: 1.3 },
    { id: 'pt', label: 'PT', x: 65, y: 18, size: 12, delay: 1.5 },
    { id: 'ru', label: 'RU', x: 10, y: 65, size: 14, delay: 0.4 },
    { id: 'ko', label: 'KO', x: 90, y: 60, size: 12, delay: 0.6 },
    { id: 'hi', label: 'HI', x: 55, y: 85, size: 13, delay: 0.8 },
    { id: 'it', label: 'IT', x: 30, y: 15, size: 12, delay: 1.0 },
];

const CONNECTIONS: Connection[] = [
    { from: 'en', to: 'es' },
    { from: 'en', to: 'fr' },
    { from: 'en', to: 'de' },
    { from: 'en', to: 'ja' },
    { from: 'en', to: 'zh' },
    { from: 'en', to: 'ar' },
    { from: 'en', to: 'pt' },
    { from: 'en', to: 'ru' },
    { from: 'en', to: 'ko' },
    { from: 'en', to: 'hi' },
    { from: 'en', to: 'it' },
    { from: 'es', to: 'pt' },
    { from: 'fr', to: 'it' },
    { from: 'zh', to: 'ja' },
    { from: 'ja', to: 'ko' },
    { from: 'de', to: 'ru' },
];

function getNode(id: string) {
    return LANGUAGES.find((l) => l.id === id)!;
}

export default function GlobeNetwork() {
    const [active, setActive] = useState(0);
    const [packetProgress, setPacketProgress] = useState(0);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        let startTime: number | null = null;
        const PACKET_DURATION = 1800; // ms
        const PAUSE_DURATION = 200; // ms between packets

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const totalCycle = PACKET_DURATION + PAUSE_DURATION;
            const cycleElapsed = elapsed % totalCycle;

            if (cycleElapsed < PACKET_DURATION) {
                // Ease-out cubic for smooth deceleration
                const raw = cycleElapsed / PACKET_DURATION;
                setPacketProgress(1 - Math.pow(1 - raw, 2));
            } else {
                setPacketProgress(0);
            }

            // Advance to next connection each full cycle
            const currentCycle = Math.floor(elapsed / totalCycle);
            setActive(currentCycle % CONNECTIONS.length);

            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    const conn = CONNECTIONS[active];
    const from = getNode(conn.from);
    const to = getNode(conn.to);

    const packetX = from.x + (to.x - from.x) * packetProgress;
    const packetY = from.y + (to.y - from.y) * packetProgress;
    const packetOpacity = packetProgress > 0 ? Math.sin(packetProgress * Math.PI) : 0;

    return (
        <div className="relative w-full max-w-2xl mx-auto aspect-square">
            <div className="absolute inset-0 rounded-full bg-gradient-radial from-purple-500/10 via-transparent to-transparent" />

            <svg viewBox="0 0 100 100" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <radialGradient id="globeGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.08" />
                        <stop offset="70%" stopColor="#7c3aed" stopOpacity="0.03" />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                    </radialGradient>
                    <filter id="nodeGlow">
                        <feGaussianBlur stdDeviation="0.8" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Globe background */}
                <circle cx="50" cy="50" r="42" fill="url(#globeGrad)" stroke="#7c3aed" strokeWidth="0.3" strokeOpacity="0.2" />
                <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke="#7c3aed" strokeWidth="0.2" strokeOpacity="0.15" />
                <ellipse cx="50" cy="50" rx="16" ry="42" fill="none" stroke="#7c3aed" strokeWidth="0.2" strokeOpacity="0.15" />
                <ellipse cx="50" cy="50" rx="30" ry="42" fill="none" stroke="#7c3aed" strokeWidth="0.15" strokeOpacity="0.1" />

                {/* Connection lines */}
                {CONNECTIONS.map((c, i) => {
                    const f = getNode(c.from);
                    const t = getNode(c.to);
                    const isActive = i === active;
                    return (
                        <line
                            key={`${c.from}-${c.to}`}
                            x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                            stroke={isActive ? '#a855f7' : '#7c3aed'}
                            strokeWidth={isActive ? 0.6 : 0.3}
                            strokeOpacity={isActive ? 0.8 : 0.15}
                            className={isActive ? 'transition-all duration-500' : ''}
                        />
                    );
                })}

                {/* Animated data packet along active connection — rAF-driven */}
                {packetOpacity > 0 && (
                    <circle
                        cx={packetX}
                        cy={packetY}
                        r="1.2"
                        fill="#c084fc"
                        opacity={packetOpacity}
                        filter="url(#nodeGlow)"
                    />
                )}

                {/* Language nodes */}
                {LANGUAGES.map((lang) => (
                    <g key={lang.id} className="animate-fade-in-up" style={{ animationDelay: `${lang.delay}s` }}>
                        <circle
                            cx={lang.x}
                            cy={lang.y}
                            r={lang.size / 8}
                            fill="#7c3aed"
                            fillOpacity="0.15"
                            className="animate-node-pulse"
                            style={{ animationDelay: `${lang.delay}s` }}
                        />
                        <circle
                            cx={lang.x}
                            cy={lang.y}
                            r={lang.size / 10}
                            fill="#7c3aed"
                            filter="url(#nodeGlow)"
                        />
                        <text
                            x={lang.x}
                            y={lang.y - lang.size / 6}
                            textAnchor="middle"
                            fill="#6b21a8"
                            fontSize="3.5"
                            fontWeight="700"
                            fontFamily="system-ui, sans-serif"
                        >
                            {lang.label}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
}
