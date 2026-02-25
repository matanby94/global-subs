'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface SubtitleLine {
  time: string;
  original: string;
  translated: string;
}

const DEMO_LINES: SubtitleLine[] = [
  { time: '00:01:23', original: 'The world is changing fast.', translated: 'El mundo está cambiando rápido.' },
  { time: '00:01:26', original: 'We need to adapt.', translated: 'Necesitamos adaptarnos.' },
  { time: '00:01:30', original: 'Together we can make it.', translated: 'Juntos podemos lograrlo.' },
  { time: '00:01:34', original: 'Are you ready?', translated: '¿Estás listo?' },
  { time: '00:01:37', original: 'Let\'s begin.', translated: 'Comencemos.' },
];

const MODEL_LABELS = ['GPT-4o', 'Gemini Pro', 'DeepL'];

export default function TranslationPipeline() {
  const [currentLine, setCurrentLine] = useState(0);
  const [stage, setStage] = useState<'input' | 'processing' | 'output'>('input');
  const [activeModel, setActiveModel] = useState(0);

  useEffect(() => {
    const cycle = () => {
      setStage('input');
      setTimeout(() => setStage('processing'), 800);
      setTimeout(() => {
        setActiveModel((prev) => (prev + 1) % MODEL_LABELS.length);
        setStage('output');
      }, 2200);
      setTimeout(() => {
        setCurrentLine((prev) => (prev + 1) % DEMO_LINES.length);
      }, 3800);
    };

    cycle();
    const timer = setInterval(cycle, 4000);
    return () => clearInterval(timer);
  }, []);

  const line = DEMO_LINES[currentLine];

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="relative">
        {/* Pipeline visualization */}
        <div className="flex items-center justify-between gap-2 md:gap-4">
          {/* Input stage */}
          <motion.div
            className="flex-1 relative"
            animate={{
              opacity: stage === 'input' ? 1 : 0.6,
              scale: stage === 'input' ? 1.02 : 1,
            }}
            transition={{ duration: 0.3 }}
          >
            <div className={`rounded-2xl p-4 md:p-6 border-2 transition-all duration-300 ${
              stage === 'input'
                ? 'border-blue-400 bg-blue-50 shadow-lg shadow-blue-100'
                : 'border-gray-200 bg-white'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${stage === 'input' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Source</span>
              </div>
              <div className="font-mono text-xs text-gray-400 mb-1">{line.time}</div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={`orig-${currentLine}`}
                  className="text-sm md:text-base font-medium text-gray-800"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  {line.original}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Processing arrow */}
          <div className="flex-shrink-0 relative">
            <div className="flex flex-col items-center gap-1">
              {/* Arrow */}
              <motion.div
                className="relative"
                animate={{
                  scale: stage === 'processing' ? [1, 1.15, 1] : 1,
                }}
                transition={{ duration: 0.6, repeat: stage === 'processing' ? Infinity : 0 }}
              >
                <svg width="48" height="48" viewBox="0 0 48 48" className="hidden md:block">
                  <defs>
                    <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="50%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                  <motion.path
                    d="M8 24 H36 L30 18 M36 24 L30 30"
                    stroke="url(#arrowGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    animate={{
                      strokeDashoffset: stage === 'processing' ? [40, 0] : 0,
                    }}
                    strokeDasharray="40"
                    transition={{ duration: 1, repeat: stage === 'processing' ? Infinity : 0, ease: 'linear' }}
                  />
                </svg>
                <svg width="24" height="24" viewBox="0 0 24 24" className="md:hidden">
                  <path
                    d="M4 12 H18 L14 8 M18 12 L14 16"
                    stroke="#7c3aed"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </motion.div>
              {/* Model label */}
              <AnimatePresence mode="wait">
                <motion.span
                  key={activeModel}
                  className="text-[10px] md:text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  {MODEL_LABELS[activeModel]}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          {/* Output stage */}
          <motion.div
            className="flex-1 relative"
            animate={{
              opacity: stage === 'output' ? 1 : 0.6,
              scale: stage === 'output' ? 1.02 : 1,
            }}
            transition={{ duration: 0.3 }}
          >
            <div className={`rounded-2xl p-4 md:p-6 border-2 transition-all duration-300 ${
              stage === 'output'
                ? 'border-purple-400 bg-purple-50 shadow-lg shadow-purple-100'
                : 'border-gray-200 bg-white'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${stage === 'output' ? 'bg-purple-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Translated</span>
              </div>
              <div className="font-mono text-xs text-gray-400 mb-1">{line.time}</div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={`trans-${currentLine}`}
                  className="text-sm md:text-base font-medium text-gray-800"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: stage === 'output' ? 1 : 0.3, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  {stage === 'output' ? line.translated : '...'}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mt-6">
          {DEMO_LINES.map((_, i) => (
            <motion.div
              key={i}
              className={`w-2 h-2 rounded-full ${i === currentLine ? 'bg-purple-500' : 'bg-gray-300'}`}
              animate={{ scale: i === currentLine ? 1.3 : 1 }}
              transition={{ duration: 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
