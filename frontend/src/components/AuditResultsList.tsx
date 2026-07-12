"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AuditResult {
  criteria_code: string;
  category: string;
  description: string;
  short_label?: string | null;
  status: "met" | "not_met" | "unknown" | "na";
  is_disputed: boolean;
  total_runs: number;
  agree_count: number;
  audit_result_id: string | null;
  reasoning: string | null;
  evidence_url: string | null;
  source_agent: string | null;
}

interface AuditResultsListProps {
  auditResults: AuditResult[];
}

export default function AuditResultsList({ auditResults }: AuditResultsListProps) {
  // Accordion State: Stores the expanded criteria code per category
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, string | null>>({});
  
  // Reporting Modal State
  const [reportResultId, setReportResultId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setReportResultId(null);
      }
    };
    if (reportResultId) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [reportResultId]);

  const toggleExpand = (category: string, code: string) => {
    setExpandedCriteria((prev) => ({
      ...prev,
      [category]: prev[category] === code ? null : code,
    }));
  };

  // Status mapping for Indonesian translation and badge colors
  const statusMap = {
    met: {
      label: "Terpenuhi",
      colorClass: "bg-status-met/10 text-status-met border-status-met/20",
    },
    not_met: {
      label: "Tidak Terpenuhi",
      colorClass: "bg-status-not-met/10 text-status-not-met border-status-not-met/20",
    },
    unknown: {
      label: "Tidak Diketahui",
      colorClass: "bg-status-unknown/10 text-status-unknown border-status-unknown/20",
    },
    na: {
      label: "Tidak Relevan",
      colorClass: "bg-status-na/10 text-status-na border-status-na/20",
    },
  };

  // Group the criteria results by category
  const categories = ["mobilitas", "netra", "rungu"];
  
  const categoryNames: Record<string, string> = {
    mobilitas: "Aksesibilitas Mobilitas",
    netra: "Aksesibilitas Netra",
    rungu: "Fasilitas Rungu & Komunikasi",
  };

  const categoryTooltips: Record<string, string> = {
    mobilitas: "Diatur dalam SNI 8201:2015 dan Permen PUPR No. 14/2017 tentang Persyaratan Kemudahan Bangunan Gedung, sebagai turunan dari PP No. 42/2020 dan UU No. 8 Tahun 2016 tentang Penyandang Disabilitas.",
    netra: "Diatur dalam SNI 8201:2015 dan PP No. 42/2020 tentang Aksesibilitas bagi Penyandang Disabilitas Sensorik Netra, sebagai turunan dari UU No. 8 Tahun 2016 tentang Penyandang Disabilitas.",
    rungu: "Diatur dalam SNI 8201:2015 dan PP No. 42/2020 tentang Aksesibilitas bagi Penyandang Disabilitas Sensorik Rungu, sebagai turunan dari UU No. 8 Tahun 2016 tentang Penyandang Disabilitas.",
  };

  const getReferenceText = (category: string) => {
    if (category === "mobilitas") {
      return "Persyaratan kemudahan hubungan ke, dari, dan di dalam bangunan gedung mencakup penyediaan ramp, pintu, toilet, lift, serta tempat parkir khusus disabilitas yang memenuhi standar aksesibilitas fisik.";
    } else if (category === "netra") {
      return "Penyediaan fasilitas bagi penyandang disabilitas sensorik netra berupa penyediaan ubin pemandu (guiding block), huruf timbul, braille, serta peta taktil untuk memudahkan arah dan pergerakan secara mandiri.";
    } else if (category === "rungu") {
      return "Penyediaan kemudahan informasi bagi penyandang disabilitas sensorik rungu melalui penyediaan sistem informasi visual, alarm darurat dengan indikator lampu strobo, dan running text.";
    }
    return "Persyaratan teknis kemudahan bangunan gedung untuk memastikan aksesibilitas bagi semua penyandang disabilitas secara aman dan mandiri.";
  };

  const getReferenceAttribution = (category: string) => {
    if (category === "mobilitas") {
      return "Permen PUPR No. 14/2017";
    } else if (category === "netra") {
      return "PP No. 42/2020";
    } else if (category === "rungu") {
      return "PP No. 42/2020";
    }
    return "SNI 8201:2015";
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportResultId) return;

    setIsSubmittingReport(true);
    setReportError(null);
    setReportSuccess(false);

    try {
      const res = await fetch(`http://127.0.0.1:8000/audit-results/${reportResultId}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reportReason.trim() || null }),
      });

      if (!res.ok) {
        throw new Error("Gagal mengirimkan laporan. Coba lagi nanti.");
      }

      setReportSuccess(true);
      setReportReason("");
      // Automatically close modal after success message
      setTimeout(() => {
        setReportResultId(null);
        setReportSuccess(false);
      }, 1500);
    } catch (err: any) {
      setReportError(err.message || "Terjadi kesalahan koneksi server.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <div className="space-y-12">
      {categories.map((category) => {
        const filteredResults = auditResults.filter(
          (r) => r.category?.toLowerCase() === category
        );

        if (filteredResults.length === 0) return null;

        return (
          <div key={category} className="space-y-4">
            {/* Category Heading with Tooltip Icon */}
            <h4 className="font-display text-lg font-semibold text-ink border-b border-line pb-2 flex items-center gap-1.5">
              <span>{categoryNames[category] || category}</span>
              
              {/* Info Tooltip */}
              <div className="group relative inline-block cursor-pointer select-none">
                <span className="text-ink-muted hover:text-accent transition-colors text-xs font-sans font-bold w-4 h-4 rounded-full border border-line flex items-center justify-center">
                  i
                </span>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-72 bg-surface border border-line p-3 rounded-md shadow-lg text-[10px] leading-relaxed font-sans font-normal text-ink z-50 text-left">
                  {categoryTooltips[category] || ""}
                </div>
              </div>
            </h4>

            {/* Accordion Grid (2 Columns on Desktop) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {filteredResults.map((result, index) => {
                const isExpanded = expandedCriteria[category] === result.criteria_code;
                const statusConfig = statusMap[result.status] || statusMap.unknown;
                const isLastAndOdd = filteredResults.length % 2 !== 0 && index === filteredResults.length - 1;
                return (
                  <div
                    key={result.criteria_code}
                    className={`bg-surface border border-line rounded-md overflow-hidden transition-all shadow-xs ${
                      isLastAndOdd ? "md:col-span-2" : ""
                    }`}
                  >
                    {/* Collapsed Bar Row */}
                    <div
                      onClick={() => toggleExpand(category, result.criteria_code)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpand(category, result.criteria_code);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isExpanded}
                      className="p-[16px] flex items-center justify-between gap-4 cursor-pointer hover:bg-bg/5 transition-colors focus:outline-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Small Status Icon */}
                        {result.status === "met" && (
                          <svg className="w-4 h-4 text-status-met flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {result.status === "not_met" && (
                          <svg className="w-4 h-4 text-status-not-met flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        {result.status === "unknown" && (
                          <svg className="w-4 h-4 text-status-unknown flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {result.status === "na" && (
                          <span className="w-4 h-4 flex items-center justify-center text-status-na font-sans font-bold text-xs flex-shrink-0">—</span>
                        )}

                        <div className="flex flex-col min-w-0">
                          <span className="font-sans text-sm font-semibold text-ink leading-tight">
                            {result.short_label || result.criteria_code}
                          </span>
                          <span className="font-mono text-[10px] text-ink-muted mt-0.5">
                            {result.criteria_code}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(category, result.criteria_code);
                        }}
                        className="inline-flex items-center gap-1 border border-line bg-surface hover:bg-bg/40 text-[10px] font-sans font-semibold px-2.5 py-1 rounded text-ink hover:text-accent transition-all cursor-pointer"
                      >
                        <span>{isExpanded ? "Tutup" : "Info"}</span>
                        <svg
                          className={`w-3 h-3 transform transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Accordion Expanded Panel (with Framer Motion animation) */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden border-t border-line/45 bg-bg/5"
                        >
                          <div className="p-[16px] space-y-4">
                            
                            {/* Section PENJELASAN */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-sans font-bold text-ink-muted tracking-wider uppercase">
                                Penjelasan
                              </span>
                              <p className="font-display text-sm text-ink leading-relaxed">
                                {result.description}
                              </p>
                            </div>

                            {/* Section SUMBER RUJUKAN */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-sans font-bold text-ink-muted tracking-wider uppercase">
                                Sumber Rujukan
                              </span>
                              <div className="border-l-4 border-accent bg-surface p-3.5 rounded-r-md border border-line border-l-0 shadow-xs flex flex-col">
                                <p className="font-sans text-[11px] italic text-ink leading-relaxed">
                                  &ldquo;{getReferenceText(category)}&rdquo;
                                </p>
                                <div className="text-[9px] text-ink-muted font-sans text-right mt-1.5">
                                  — {getReferenceAttribution(category)}
                                </div>
                              </div>
                            </div>

                            {/* AI reasoning analysis */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-sans font-bold text-ink-muted tracking-wider uppercase">
                                Analisis Penalaran AI
                              </span>
                              <p className="text-ink leading-relaxed bg-surface p-3.5 rounded-md border border-line text-xs">
                                {result.reasoning || "Tidak ada penalaran yang dicatat."}
                              </p>
                              <div className="flex justify-between items-center text-[9px] text-ink-muted font-mono pt-1">
                                <span>Evaluator: {result.source_agent || "N/A"}</span>
                                <span>{result.agree_count} dari {result.total_runs} audit sepakat</span>
                              </div>
                            </div>

                            {/* Visual Evidence */}
                            {result.evidence_url && (
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-sans font-bold text-ink-muted tracking-wider uppercase">
                                  Bukti Foto (Visual)
                                </span>
                                <div className="relative border border-line rounded-md overflow-hidden bg-bg/20 max-w-sm">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={result.evidence_url}
                                    alt={`Foto bukti visual kriteria ${result.criteria_code}: ${result.short_label || result.description}`}
                                    className="w-full h-auto object-cover max-h-48"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Action buttons row */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line/30">
                              <div>
                                {result.is_disputed && (
                                  <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-700 font-sans font-semibold uppercase tracking-wider rounded">
                                    Hasil Beragam
                                  </span>
                                )}
                              </div>
                              
                              {result.audit_result_id && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReportResultId(result.audit_result_id);
                                    setReportReason("");
                                    setReportSuccess(false);
                                    setReportError(null);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-status-not-met/20 bg-status-not-met/5 hover:bg-status-not-met/10 text-[10px] font-sans font-semibold text-status-not-met hover:text-red-700 transition-all cursor-pointer shadow-xs"
                                >
                                  <svg className="w-3 h-3 text-status-not-met" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  <span>Laporkan Poin Ini</span>
                                </button>
                              )}
                            </div>

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Report Modal Overlay */}
      {reportResultId && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-opacity">
          <div 
            className="bg-surface border border-line rounded-md p-6 max-w-md w-full shadow-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-line/60 mb-4">
              <h3 className="font-display text-lg font-medium text-ink">
                Laporkan Hasil Audit
              </h3>
              <button
                onClick={() => setReportResultId(null)}
                className="text-ink-muted hover:text-ink font-sans text-xs font-semibold focus:outline-none cursor-pointer"
                disabled={isSubmittingReport}
              >
                Batal
              </button>
            </div>

            {reportSuccess ? (
              <div className="my-6 p-4 bg-status-met/10 border border-status-met/20 rounded-md text-xs text-status-met font-sans font-medium text-center">
                Laporan berhasil dikirim! Terima kasih atas kontribusi Anda.
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="space-y-4">
                <p className="font-sans text-xs text-ink-muted leading-relaxed">
                  Jika Anda mendapati evaluasi kriteria ini tidak akurat, kirimkan laporan kepada tim kami dengan memberikan alasan pendukung di bawah.
                </p>

                {reportError && (
                  <div className="p-3 bg-status-not-met/10 border border-status-not-met/20 rounded-md text-xs text-status-not-met font-sans font-medium">
                    {reportError}
                  </div>
                )}

                <div>
                  <label htmlFor="reason" className="block text-[10px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
                    Alasan Pelaporan (Opsional)
                  </label>
                  <textarea
                    id="reason"
                    rows={3}
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Contoh: Ramp pintu masuk sebenarnya landai, namun dianalisis curam karena sudut kamera..."
                    className="w-full bg-transparent border border-line rounded-md px-3 py-2 text-xs font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
                    disabled={isSubmittingReport}
                  />
                </div>

                <div className="pt-3 flex justify-end gap-3 border-t border-line/40">
                  <button
                    type="button"
                    onClick={() => setReportResultId(null)}
                    className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors"
                    disabled={isSubmittingReport}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReport}
                    className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingReport ? "Mengirim..." : "Kirim Laporan"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
