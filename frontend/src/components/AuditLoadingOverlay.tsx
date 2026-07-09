"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGES = [
  "Menganalisis foto yang diunggah...",
  "Memeriksa kriteria aksesibilitas...",
  "Menyusun hasil audit...",
];

interface AuditLoadingOverlayProps {
  isVisible: boolean;
}

export default function AuditLoadingOverlay({ isVisible }: AuditLoadingOverlayProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % MESSAGES.length);
    }, 3500);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-bg/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
      <div className="max-w-xs w-full flex flex-col items-center space-y-6">
        {/* Modern Custom Spinning SVG with a pulse accent background */}
        <div className="relative flex items-center justify-center w-20 h-20">
          <div className="absolute inset-0 bg-accent/10 rounded-full animate-ping duration-1500" />
          <svg
            className="animate-spin h-12 w-12 text-accent relative z-10"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>

        {/* Text Container with Fixed Height to Prevent Layout Shifting */}
        <div className="w-full relative h-8 flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="text-sm font-sans font-medium text-ink tracking-wide absolute"
            >
              {MESSAGES[index]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Subtitle helper */}
        <p className="text-[11px] font-sans text-ink-muted/80 max-w-[240px] leading-relaxed">
          Biasanya memakan waktu 10-30 detik, mohon tunggu.
        </p>
      </div>
    </div>
  );
}
