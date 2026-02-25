'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

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
  delay: number;
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
  { from: 'en', to: 'es', delay: 0.5 },
  { from: 'en', to: 'fr', delay: 0.8 },
  { from: 'en', to: 'de', delay: 1.1 },
  { from: 'en', to: 'ja', delay: 1.4 },
  { from: 'en', to: 'zh', delay: 0.6 },
  { from: 'en', to: 'ar', delay: 1.7 },
  { from: 'en', to: 'pt', delay: 1.0 },
  { from: 'en', to: 'ru', delay: 1.3 },
  { from: 'en', to: 'ko', delay: 1.6 },
  { from: 'en', to: 'hi', delay: 0.9 },
  { from: 'en', to: 'it', delay: 1.2 },
  { from: 'es', to: 'pt', delay: 2.0 },
  { from: 'fr', to: 'it', delay: 2.2 },
  { from: 'zh', to: 'ja', delay: 2.4 },
  { from: 'ja', to: 'ko', delay: 2.6 },
  { from: 'de', to: 'ru', delay: 2.1 },
];

function getNode(id: string) {
  return LANGUAGES.find((l) => l.id === id)!;
}

export default function GlobeNetwork() {
  const [activeConnection, setActiveConnection] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveConnection((prev) => (prev + 1) % CONNECTIONS.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-square">
      {/* Glow background */}
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
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Background globe circle */}
        <circle cx="50" cy="50" r="42" fill="url(#globeGrad)" stroke="#7c3aed" strokeWidth="0.3" strokeOpacity="0.2" />
        <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke="#7c3aed" strokeWidth="0.2" strokeOpacity="0.15" />
        <ellipse cx="50" cy="50" rx="16" ry="42" fill="none" stroke="#7c3aed" strokeWidth="0.2" strokeOpacity="0.15" />
        <ellipse cx="50" cy="50" rx="30" ry="42" fill="none" stroke="#7c3aed" strokeWidth="0.15" strokeOpacity="0.1" />

        {/* Connection lines */}
        {CONNECTIONS.map((conn, i) => {
          const from = getNode(conn.from);
          const to = getNode(conn.to);
          const isActive = i === activeConnection;
          return (
            <motion.line
              key={`${conn.from}-${conn.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isActive ? '#a855f7' : '#7c3aed'}
              strokeWidth={isActive ? 0.6 : 0.3}
              strokeOpacity={isActive ? 0.8 : 0.15}
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: 1,
                strokeOpacity: isActive ? [0.15, 0.8, 0.15] : 0.15,
              }}
              transition={{
                pathLength: { duration: 1.5, delay: conn.delay },
                strokeOpacity: isActive
                  ? { duration: 2, repeat: 0 }
                  : { duration: 0 },
              }}
            />
          );
        })}

        {/* Animated data packet along active connection */}
        {(() => {
          const conn = CONNECTIONS[activeConnection];
          const from = getNode(conn.from);
          const to = getNode(conn.to);
          return (
            <motion.circle
              r="0.8"
              fill="#a855f7"
              filter="url(#nodeGlow)"
              initial={{ cx: from.x, cy: from.y, opacity: 0 }}
              animate={{
                cx: [from.x, to.x],
                cy: [from.y, to.y],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ duration: 1.5, ease: 'easeInOut' }}
              key={`packet-${activeConnection}`}
            />
          );
        })()}

        {/* Language nodes */}
        {LANGUAGES.map((lang) => (
          <motion.g
            key={lang.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: lang.delay }}
          >
            <motion.circle
              cx={lang.x}
              cy={lang.y}
              r={lang.size / 8}
              fill="#7c3aed"
              fillOpacity="0.15"
              animate={{
                r: [lang.size / 8, lang.size / 6, lang.size / 8],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: lang.delay,
                ease: 'easeInOut',
              }}
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
              y={lang.y - lang.size / 7}
              textAnchor="middle"
              fill="#6b21a8"
              fontSize="2.5"
              fontWeight="700"
              fontFamily="system-ui, sans-serif"
            >
              {lang.label}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
