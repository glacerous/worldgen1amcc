"use client";

import { useEffect, useState, useRef } from "react";

interface AuditLoadingOverlayProps {
  isVisible: boolean;
  isSuccess?: boolean;
  mode?: "create" | "edit";
  onComplete?: () => void;
}

const STEPS_CREATE = [
  { label: "Mengunggah foto bukti & dokumen" },
  { label: "Menganalisis kriteria aksesibilitas dengan AI" },
  { label: "Menyimpan hasil audit ke database" },
];

const STEPS_EDIT = [
  { label: "Mengunggah foto baru & memperbarui berkas" },
  { label: "Menganalisis ulang kriteria dengan AI" },
  { label: "Memperbarui hasil audit ke database" },
];

export default function AuditLoadingOverlay({
  isVisible,
  isSuccess = false,
  mode = "create",
  onComplete,
}: AuditLoadingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [successPhase, setSuccessPhase] = useState<"none" | "saving" | "done">("none");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const steps = mode === "create" ? STEPS_CREATE : STEPS_EDIT;

  // Track progress
  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      setCurrentStepIdx(0);
      setSuccessPhase("none");
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Set up timer to increment progress
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        let next = prev;
        if (prev < 25) {
          // Uploading stage: reaches 25% in 2.5 seconds
          next = prev + 1.0;
        } else if (prev < 95) {
          // AI analysis stage: slower, takes 28 seconds to reach 95%
          next = prev + 0.25;
        }
        // Cap at 95% until isSuccess is true (which triggers successPhase)
        return Math.min(next, 95);
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isVisible]);

  // Update current step index and phases based on progress and success phase
  useEffect(() => {
    if (successPhase === "done") {
      setCurrentStepIdx(3);
    } else if (successPhase === "saving") {
      setCurrentStepIdx(2);
    } else {
      if (progress < 25) {
        setCurrentStepIdx(0);
      } else {
        setCurrentStepIdx(1); // Keep it on AI analysis while waiting at 95%
      }
    }
  }, [progress, successPhase]);

  // Handle successful completion sequence
  useEffect(() => {
    if (isSuccess && isVisible) {
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Phase 1: DB Saving (shows brief visual feedback for database saving stage)
      setSuccessPhase("saving");
      setProgress(98);
      
      // Phase 2: Complete success (checkmark & "Audit berhasil disimpan" text)
      const t1 = setTimeout(() => {
        setSuccessPhase("done");
        setProgress(100);
      }, 700);

      // Phase 3: Trigger redirect callback
      const t2 = setTimeout(() => {
        if (onComplete) onComplete();
      }, 2000);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isSuccess, isVisible, onComplete]);

  // Render nothing if not visible and opacity is 0 (to avoid overlay blocking interaction when closed)
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
    } else {
      const timeout = setTimeout(() => {
        setShouldRender(false);
      }, 200); // matches the transition-opacity duration
      return () => clearTimeout(timeout);
    }
  }, [isVisible]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-bg/85 backdrop-blur-xs flex items-center justify-center p-4 select-none transition-opacity duration-200 ease-in-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="bg-surface border border-line rounded-lg max-w-sm w-full p-6 shadow-md flex flex-col space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">
            {mode === "create" ? "Memproses Audit Baru" : "Memperbarui Audit"}
          </h3>
          <p className="font-sans text-[11px] text-ink-muted leading-relaxed mt-1">
            Mohon tunggu selagi kami memproses and menganalisis audit Anda.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4 font-sans text-xs">
          {steps.map((s, idx) => {
            const isCompleted = successPhase === "done" || (successPhase === "saving" && idx < 2) || (successPhase === "none" && currentStepIdx > idx);
            const isActive = currentStepIdx === idx && successPhase !== "done";
            return (
              <div key={idx} className="flex items-center space-x-3">
                {/* Step Indicator Dot/Icon */}
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : isActive ? (
                    <div className="w-5 h-5 flex items-center justify-center">
                      <div className="w-4.5 h-4.5 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-line" />
                    </div>
                  )}
                </div>
                {/* Step Text */}
                <span className={`transition-colors duration-200 ${
                  isActive ? "text-ink font-semibold" : isCompleted ? "text-accent" : "text-ink-muted"
                }`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] font-sans font-bold text-ink-muted uppercase tracking-wider">
            <span>{isSuccess ? "Selesai" : "Progres"}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full bg-line rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Success indicator text */}
        {isSuccess && (
          <div className="text-center font-sans text-xs font-semibold text-accent animate-in fade-in duration-300">
            {mode === "create" ? "Audit berhasil disimpan!" : "Audit berhasil diperbarui!"}
          </div>
        )}

        {/* Screen Reader Announcements */}
        <div className="sr-only" role="status" aria-live="polite">
          {isSuccess
            ? (mode === "create" ? "Audit berhasil disimpan!" : "Audit berhasil diperbarui!")
            : `Langkah ${currentStepIdx + 1} dari ${steps.length}: ${steps[currentStepIdx]?.label || ""}. Progress ${Math.round(progress)} persen.`}
        </div>
      </div>
    </div>
  );
}
