/* Deterministic pseudo-random so SSR output matches client hydration */
function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297;
    return x - Math.floor(x);
}

export default function ParticleField({ count = 30 }: { count?: number }) {
    const particles = Array.from({ length: count }, (_, i) => ({
        x: seededRandom(i * 7 + 1) * 100,
        y: seededRandom(i * 7 + 2) * 100,
        size: seededRandom(i * 7 + 3) * 4 + 1,
        duration: seededRandom(i * 7 + 4) * 15 + 10,
        delay: seededRandom(i * 7 + 5) * 5,
        opacity: seededRandom(i * 7 + 6) * 0.3 + 0.05,
        dx: (seededRandom(i * 7 + 7) - 0.5) * 40,
        dy: (seededRandom(i * 7 + 8) - 0.5) * 40,
    }));

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {particles.map((p, i) => (
                <div
                    key={i}
                    className="absolute rounded-full bg-purple-400 animate-particle-float"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                        opacity: p.opacity,
                        animationDuration: `${p.duration}s`,
                        animationDelay: `${p.delay}s`,
                        '--float-dx': `${p.dx}px`,
                        '--float-dy': `${p.dy}px`,
                    } as React.CSSProperties}
                />
            ))}
        </div>
    );
}
