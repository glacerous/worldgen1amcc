"use client";

import { useState } from "react";

interface AuditResult {
  criteria_code: string;
  category: string;
  description: string;
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
  const [selectedResult, setSelectedResult] = useState<AuditResult | null>(null);
  
  // Reporting Modal State
  const [reportResultId, setReportResultId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

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

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportResultId) return;

    setIsSubmittingReport(true);
    setReportError(null);
    setReportSuccess(false);

    try {
      const res = await fetch(`http://localhost:8000/audit-results/${reportResultId}/report`, {
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
          <div key={category} className="space-y-6">
            {/* Category Heading in Display Font */}
            <h4 className="font-display text-xl font-medium text-ink border-b border-line pb-2">
              {categoryNames[category] || category}
            </h4>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredResults.map((result) => {
                const statusConfig = statusMap[result.status] || statusMap.unknown;
                return (
                  <div
                    key={result.criteria_code}
                    onClick={() => setSelectedResult(result)}
                    className="bg-surface border border-line rounded-md p-6 flex flex-col justify-between hover:border-accent/40 cursor-pointer transition-all min-h-[180px] relative"
                  >
                    {/* Top Row: Code, Dispute Tag and Status Badge */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-line/40">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-muted tracking-wider">
                          {result.criteria_code || "N/A"}
                        </span>
                        {result.is_disputed && (
                          <span className="px-2 py-0.5 bg-bg border border-line text-[9px] text-ink-muted font-sans font-semibold uppercase tracking-wider rounded-md">
                            Hasil Beragam
                          </span>
                        )}
                      </div>
                      <span className={`px-2.5 py-0.5 border rounded-md text-[10px] font-sans font-semibold uppercase tracking-wider ${statusConfig.colorClass}`}>
                        {statusConfig.label}
                      </span>
                    </div>

                    {/* Middle: Description */}
                    <p className="font-display text-lg text-ink leading-relaxed mb-3 flex-1">
                      "{result.description}"
                    </p>

                    {/* Consensus Info */}
                    <div className="mb-4">
                      {result.total_runs > 0 ? (
                        <span className="text-[10px] text-ink-muted font-sans font-medium">
                          {result.agree_count} dari {result.total_runs} audit sepakat
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-muted font-sans font-medium italic">
                          Belum ada data audit
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Category, Photo and Report button */}
                    <div className="text-[11px] font-sans text-ink-muted flex items-center justify-between pt-2 border-t border-line/30">
                      <span className="capitalize font-medium text-ink-muted">
                        Kategori: {result.category || "Umum"}
                      </span>
                      
                      <div className="flex items-center gap-3">
                        {/* Evidence Photo Icon/Badge */}
                        {result.evidence_url && (
                          <span className="flex items-center text-[10px] text-accent font-sans font-semibold">
                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                            Foto Bukti
                          </span>
                        )}

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
                            className="inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/40 text-[10px] font-sans font-semibold px-2.5 py-0.5 rounded text-ink-muted hover:text-accent transition-all cursor-pointer"
                          >
                            Laporkan
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Detail Modal Overlay */}
      {selectedResult && (() => {
        const statusConfig = statusMap[selectedResult.status] || statusMap.unknown;
        return (
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-opacity">
            <div 
              className="bg-surface border border-line rounded-md p-6 max-w-lg w-full shadow-lg flex flex-col max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-line/60 mb-5">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-sm text-ink-muted tracking-wider">
                    {selectedResult.criteria_code}
                  </span>
                  <span className={`px-2.5 py-0.5 border rounded-md text-[10px] font-sans font-semibold uppercase tracking-wider ${statusConfig.colorClass}`}>
                    {statusConfig.label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="text-ink-muted hover:text-ink font-sans text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  Tutup
                </button>
              </div>

              {/* Criteria Description */}
              <p className="font-display text-xl text-ink leading-relaxed mb-6">
                "{selectedResult.description}"
              </p>

              {/* Evaluation Details */}
              <div className="space-y-4 font-sans text-sm">
                <div>
                  <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
                    Analisis Penalaran Agen
                  </h4>
                  <p className="text-ink leading-relaxed bg-bg/40 p-4 rounded-md border border-line/30 text-[13px]">
                    {selectedResult.reasoning || "Tidak ada penalaran yang dicatat."}
                  </p>
                </div>

                <div className="flex justify-between items-center text-xs border-b border-line/30 pb-2">
                  <span className="text-ink-muted">Agen Pengevaluasi:</span>
                  <span className="font-mono font-semibold text-accent">{selectedResult.source_agent || "N/A"}</span>
                </div>

                {/* Evidence Image */}
                {selectedResult.evidence_url && (
                  <div className="pt-2">
                    <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                      Bukti Foto (Visual)
                    </h4>
                    <div className="relative border border-line rounded-md overflow-hidden bg-bg/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedResult.evidence_url}
                        alt={`Evidence for ${selectedResult.criteria_code}`}
                        className="w-full h-auto object-cover max-h-64"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Close Button at bottom */}
              <button
                onClick={() => setSelectedResult(null)}
                className="mt-8 bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all ml-auto cursor-pointer"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        );
      })()}

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
