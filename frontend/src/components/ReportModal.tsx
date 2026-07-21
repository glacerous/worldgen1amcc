"use client";

import { useState, useEffect } from "react";
import { BACKEND_URL } from "@/config";

interface ReportModalProps {
  buildingId: string;
  isOpen: boolean;
  onClose: () => void;
  onReportSuccess?: () => void;
}

export default function ReportModal({
  buildingId,
  isOpen,
  onClose,
  onReportSuccess,
}: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Alasan pelaporan wajib diisi.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/buildings/${buildingId}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reason.trim() }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Gagal mengirimkan laporan.");
      }

      alert("Laporan berhasil dikirim. Terima kasih atas partisipasi Anda!");
      setReason("");
      onClose();
      if (onReportSuccess) {
        onReportSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat mengirimkan laporan.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-ink/40 backdrop-blur-xs" 
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative bg-surface border border-line rounded-lg w-full max-w-md p-6 shadow-xl mx-4 animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4 mb-4">
          <h3 className="font-display text-lg font-medium text-ink">
            Laporkan Gedung
          </h3>
          <button 
            onClick={onClose}
            className="text-ink-muted hover:text-ink transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info Box */}
        <div className="bg-amber-500/5 border border-amber-500/10 rounded p-3 mb-4">
          <p className="font-sans text-[11px] text-amber-700 leading-relaxed dark:text-amber-600">
            Aksi ini digunakan jika data aksesibilitas gedung tidak akurat secara signifikan atau ada pelanggaran. Laporan yang masuk akan ditinjau secara manual oleh Admin.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-status-not-met/10 border border-status-not-met/20 rounded-md text-xs text-status-not-met font-sans font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label 
              htmlFor="report-reason" 
              className="block text-[10px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1.5"
            >
              Alasan Pelaporan <span className="text-status-not-met">*</span>
            </label>
            <textarea
              id="report-reason"
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Jelaskan secara spesifik mengapa data gedung ini salah (misal: Tangga ram tertutup barang, tidak ada ramp sama sekali, atau informasi toilet salah)..."
              className="w-full bg-transparent border border-line rounded-md px-3 py-2 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40 resize-none"
              required
              disabled={isLoading}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="border border-line bg-surface hover:bg-bg/40 text-ink font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || !reason.trim()}
              className="inline-flex items-center justify-center bg-status-not-met text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? "Mengirim..." : "Kirim Laporan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
