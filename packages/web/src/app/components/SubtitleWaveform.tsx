export default function SubtitleWaveform() {
    const barCount = 40;
    const center = barCount / 2;
    const maxHeight = 40;
    const baseHeight = 8;

    return (
        <div className="flex items-end justify-center gap-[2px] h-12">
            {Array.from({ length: barCount }, (_, i) => {
                const distance = Math.abs(i - center);
                const height = maxHeight - (distance / center) * (maxHeight - baseHeight);
                return (
                    <div
                        key={i}
                        className="rounded-full animate-wave-bar"
                        style={{
                            width: 3,
                            backgroundColor: '#7c3aed',
                            height: height * 0.6,
                            animationDelay: `${i * 0.05}s`,
                            animationDuration: `${1.5 + (i % 3) * 0.15}s`,
                        }}
                    />
                );
            })}
        </div>
    );
}
