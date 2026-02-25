'use client';

import { motion } from 'framer-motion';

const LANGUAGES = [
  { code: 'ES', name: 'Spanish', angle: 0 },
  { code: 'FR', name: 'French', angle: 45 },
  { code: 'DE', name: 'German', angle: 90 },
  { code: 'JA', name: 'Japanese', angle: 135 },
  { code: 'ZH', name: 'Chinese', angle: 180 },
  { code: 'AR', name: 'Arabic', angle: 225 },
  { code: 'PT', name: 'Portuguese', angle: 270 },
  { code: 'RU', name: 'Russian', angle: 315 },
];

export default function LanguageOrbit() {
  return (
    <div className="relative w-64 h-64 mx-auto">
      {/* Center hub */}
      <motion.div
        className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-xl z-10"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="text-white text-sm font-bold">AI</span>
      </motion.div>

      {/* Orbit ring */}
      <div className="absolute inset-0 rounded-full border border-purple-200/50" />
      <div className="absolute inset-4 rounded-full border border-purple-100/30" />

      {/* Orbiting languages */}
      {LANGUAGES.map((lang, i) => {
        const radius = 110;
        return (
          <motion.div
            key={lang.code}
            className="absolute left-1/2 top-1/2"
            style={{ marginLeft: -18, marginTop: -18 }}
            animate={{
              x: [
                Math.cos(((lang.angle) * Math.PI) / 180) * radius,
                Math.cos(((lang.angle + 360) * Math.PI) / 180) * radius,
              ],
              y: [
                Math.sin(((lang.angle) * Math.PI) / 180) * radius,
                Math.sin(((lang.angle + 360) * Math.PI) / 180) * radius,
              ],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: 'linear',
              delay: 0,
            }}
          >
            <motion.div
              className="w-9 h-9 rounded-full bg-white shadow-md border border-purple-100 flex items-center justify-center cursor-default"
              whileHover={{ scale: 1.3 }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.15, duration: 0.4 }}
            >
              <span className="text-[10px] font-bold text-purple-700">{lang.code}</span>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}
