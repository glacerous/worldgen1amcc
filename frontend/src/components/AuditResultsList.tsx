"use client";

import { useState } from "react";

interface AuditCriteria {
  code: string;
  description: string;
  category: string;
}

interface AuditResult {
  id: string;
  building_id: string;
  criteria_id: string;
  status: "met" | "not_met" | "unknown" | "na";
  source_agent: string;
  evidence_url: string | null;
  reasoning: string;
  audit_criteria: AuditCriteria;
}

interface AuditResultsListProps {
  auditResults: AuditResult[];
}

export default function AuditResultsList({ auditResults }: AuditResultsListProps) {
  const [selectedResult, setSelectedResult] = useState<AuditResult | null>(null);

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

  // 1. Group the criteria results by category
  const categories = ["mobilitas", "netra", "rungu"];
  
  const categoryNames: Record<string, string> = {
    mobilitas: "Aksesibilitas Mobilitas",
    netra: "Aksesibilitas Netra",
    rungu: "Fasilitas Rungu & Komunikasi",
  };

  return (
    <div className="space-y-12">
      {categories.map((category) => {
        const filteredResults = auditResults.filter(
          (r) => r.audit_criteria?.category?.toLowerCase() === category
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
                    key={result.id}
                    onClick={() => setSelectedResult(result)}
                    className="bg-surface border border-line rounded-md p-6 flex flex-col justify-between hover:border-accent/40 cursor-pointer transition-all min-h-[160px] relative"
                  >
                    {/* Top Row: Code and Status Badge */}
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-line/40">
                      <span className="font-mono text-xs text-ink-muted tracking-wider">
                        {result.audit_criteria?.code || "N/A"}
                      </span>
                      <span className={`px-2.5 py-0.5 border rounded-md text-[10px] font-sans font-semibold uppercase tracking-wider ${statusConfig.colorClass}`}>
                        {statusConfig.label}
                      </span>
                    </div>

                    {/* Middle: Description in Serif Regular (Not Italic) */}
                    <p className="font-display text-lg text-ink leading-relaxed mb-4 flex-1">
                      "{result.audit_criteria?.description}"
                    </p>

                    {/* Bottom Row: Category and Visual Evidence Indicator */}
                    <div className="text-[11px] font-sans text-ink-muted flex items-center justify-between pt-1">
                      <span className="capitalize font-medium text-ink-muted">
                        Kategori: {result.audit_criteria?.category || "Umum"}
                      </span>
                      
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
                    {selectedResult.audit_criteria?.code}
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
                "{selectedResult.audit_criteria?.description}"
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
                  <span className="font-mono font-semibold text-accent">{selectedResult.source_agent}</span>
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
                        alt={`Evidence for ${selectedResult.audit_criteria?.code}`}
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
    </div>
  );
}
