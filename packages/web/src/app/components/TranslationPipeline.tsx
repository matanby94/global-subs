'use client';

import { useEffect, useState } from 'react';

interface DemoLine {
    source: string;
    translated: string;
}

const DEMO_LINES: DemoLine[] = [
    { source: "I'll be right back.", translated: 'Vuelvo enseguida.' },
    { source: 'This changes everything.', translated: 'Esto lo cambia todo.' },
    { source: 'We need to talk.', translated: 'Necesitamos hablar.' },
    { source: "It's a beautiful day.", translated: 'Es un hermoso día.' },
    { source: 'Hold on a second.', translated: 'Espera un segundo.' },
];

const MODEL_LABELS = ['GPT-4o', 'Gemini Pro', 'DeepL'];

type Stage = 'input' | 'processing' | 'output';

export default function TranslationPipeline() {
    const [lineIdx, setLineIdx] = useState(0);
    const [stage, setStage] = useState<Stage>('input');
    const [modelIdx, setModelIdx] = useState(0);

    useEffect(() => {
        const cycle = () => {
            setStage('input');
            const t1 = setTimeout(() => setStage('processing'), 800);
            const t2 = setTimeout(() => setStage('output'), 2200);
            const t3 = setTimeout(() => {
                setLineIdx((p) => (p + 1) % DEMO_LINES.length);
                setModelIdx((p) => (p + 1) % MODEL_LABELS.length);
            }, 3800);
            return [t1, t2, t3];
        };

        let timers = cycle();
        const interval = setInterval(() => {
            timers = cycle();
        }, 4000);

        return () => {
            clearInterval(interval);
            timers.forEach(clearTimeout);
        };
    }, []);

    const line = DEMO_LINES[lineIdx];
    const model = MODEL_LABELS[modelIdx];

    return (
        <div className="w-full max-w-lg mx-auto select-none" aria-hidden="true">
            <div className="relative rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900 to-gray-950 p-6 overflow-hidden shadow-2xl">
                {/* Stage: Input */}
                <div
                    className="transition-all duration-500"
                    style={{
                        opacity: stage === 'input' ? 1 : 0.4,
                        transform: stage === 'input' ? 'translate3d(0,0,0)' : 'translate3d(0,-4px,0)',
                        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        willChange: 'opacity, transform',
                    }}
                >
                    <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Source (EN)
                    </div>
                    <p className="text-white/90 text-sm font-mono min-h-[1.5rem]">{line.source}</p>
                </div>

                {/* Arrow / Processing */}
                <div className="flex items-center justify-center my-4 gap-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-purple-400">
                        <path
                            d="M12 4v16m0 0l-4-4m4 4l4-4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={stage === 'processing' ? 'animate-arrow-pulse' : ''}
                        />
                    </svg>
                    <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full transition-all duration-300"
                        style={{
                            backgroundColor: stage === 'processing' ? 'rgba(168,85,247,0.25)' : 'rgba(168,85,247,0.1)',
                            color: stage === 'processing' ? '#c084fc' : '#a78bfa',
                            transform: stage === 'processing' ? 'scale(1.05)' : 'scale(1)',
                        }}
                    >
                        {model}
                    </span>
                </div>

                {/* Stage: Output */}
                <div
                    className="transition-all duration-500"
                    style={{
                        opacity: stage === 'output' ? 1 : 0.4,
                        transform: stage === 'output' ? 'translate3d(0,0,0)' : 'translate3d(0,4px,0)',
                        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        willChange: 'opacity, transform',
                    }}
                >
                    <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Translated (ES)
                    </div>
                    <p className="text-white/90 text-sm font-mono min-h-[1.5rem]">
                        {stage === 'output' ? line.translated : stage === 'processing' ? '...' : ''}
                    </p>
                </div>

                {/* Progress dots */}
                <div className="flex justify-center gap-1.5 mt-5">
                    {DEMO_LINES.map((_, i) => (
                        <span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                            style={{
                                backgroundColor: i === lineIdx ? '#a855f7' : 'rgba(255,255,255,0.2)',
                                transform: i === lineIdx ? 'scale(1.3)' : 'scale(1)',
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
