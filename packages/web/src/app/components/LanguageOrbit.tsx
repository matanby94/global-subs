const LANGUAGES = [
    { code: 'ES', angle: 0 },
    { code: 'FR', angle: 45 },
    { code: 'DE', angle: 90 },
    { code: 'JA', angle: 135 },
    { code: 'ZH', angle: 180 },
    { code: 'AR', angle: 225 },
    { code: 'PT', angle: 270 },
    { code: 'RU', angle: 315 },
];

export default function LanguageOrbit() {
    const radius = 95;

    return (
        <div className="relative w-72 h-72 mx-auto">
            {/* Center hub */}
            <div className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-xl z-10 animate-hub-pulse">
                <span className="text-white text-sm font-bold">AI</span>
            </div>

            {/* Orbit rings */}
            <div className="absolute inset-4 rounded-full border border-purple-200/50" />
            <div className="absolute inset-10 rounded-full border border-purple-100/30" />

            {/* Orbiting languages — CSS rotation on a wrapper, badge counter-rotates */}
            <div className="absolute inset-0 animate-orbit" style={{ willChange: 'transform' }}>
                {LANGUAGES.map((lang, i) => {
                    const rad = (lang.angle * Math.PI) / 180;
                    const x = Math.cos(rad) * radius;
                    const y = Math.sin(rad) * radius;

                    return (
                        <div
                            key={lang.code}
                            className="absolute animate-fade-in"
                            style={{
                                left: `calc(50% + ${x}px - 18px)`,
                                top: `calc(50% + ${y}px - 18px)`,
                                animationDelay: `${i * 0.15}s`,
                            }}
                        >
                            <div
                                className="w-9 h-9 rounded-full bg-white shadow-md border border-purple-100 flex items-center justify-center animate-orbit-reverse"
                                style={{ willChange: 'transform' }}
                            >
                                <span className="text-[10px] font-bold text-purple-700">{lang.code}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
