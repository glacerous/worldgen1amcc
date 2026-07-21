"use client";

import { motion, AnimatePresence } from "framer-motion";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`pointer-events-auto p-3.5 rounded-md border shadow-md flex items-center justify-between gap-3 text-xs font-sans font-medium ${
              t.type === "success"
                ? "bg-surface border-status-met/30 text-status-met"
                : t.type === "error"
                ? "bg-surface border-status-not-met/30 text-status-not-met"
                : "bg-surface border-line text-ink"
            }`}
          >
            <div className="flex items-center gap-2">
              {t.type === "success" && (
                <svg className="w-4 h-4 text-status-met flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {t.type === "error" && (
                <svg className="w-4 h-4 text-status-not-met flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {t.type === "info" && (
                <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span>{t.message}</span>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-ink-muted hover:text-ink text-sm font-bold focus:outline-none cursor-pointer"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
