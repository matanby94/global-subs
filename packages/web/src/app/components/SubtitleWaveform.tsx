'use client';

import { motion } from 'framer-motion';

interface WaveBarProps {
    index: number;
    total: number;
    color?: string;
}

function WaveBar({ index, total, color = '#7c3aed' }: WaveBarProps) {
    const center = total / 2;
    const distance = Math.abs(index - center);
    const maxHeight = 40;
    const baseHeight = 8;
    const height = maxHeight - (distance / center) * (maxHeight - baseHeight);

    return (
        <motion.div
            className="rounded-full"
            style={{
                width: 3,
                backgroundColor: color,
                opacity: 0.6,
            }}
            animate={{
                height: [height * 0.4, height, height * 0.6, height * 0.9, height * 0.4],
                opacity: [0.3, 0.7, 0.5, 0.6, 0.3],
            }}
            transition={{
                duration: 1.5 + Math.random() * 0.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: index * 0.05,
            }}
        />
    );
}

export default function SubtitleWaveform() {
    const barCount = 40;

    return (
        <div className="flex items-center justify-center gap-[2px] h-12">
            {Array.from({ length: barCount }, (_, i) => (
                <WaveBar key={i} index={i} total={barCount} />
            ))}
        </div>
    );
}
