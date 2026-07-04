"use client";

import { useState } from "react";
import { Pannellum } from "pannellum-react";

interface AuditCriteria {
  code: string;
  description: string;
  category: string;
}

interface AuditResult {
  status: "met" | "not_met" | "unknown" | "na";
  reasoning: string | null;
  audit_criteria: AuditCriteria | null;
}

interface Annotation {
  id: string;
  scene_id: string;
  audit_result_id: string | null;
  label: string;
  pitch: number;
  yaw: number;
  audit_results: AuditResult | null;
}

interface TourViewerProps {
  annotations: Annotation[];
  fallbackImageUrl: string;
}

export default function TourViewer({ annotations, fallbackImageUrl }: TourViewerProps) {
  const [selectedHotspot, setSelectedHotspot] = useState<Annotation | null>(null);

  // Status tokens styling
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

  const panoramaUrl = fallbackImageUrl;

  return (
    <div className="relative w-full h-[65vh] border border-line rounded-md overflow-hidden bg-bg/20">
      {/* Pannellum Panoramic Viewer */}
      <Pannellum
        width="100%"
        height="100%"
        image={panoramaUrl}
        pitch={0}
        yaw={0}
        hfov={100}
        autoLoad={true}
        showZoomCtrl={true}
      >
        {annotations.map((annotation) => {
          // Only show hotspot if there is an evaluation criteria attached
          if (!annotation.audit_results?.audit_criteria) return null;
          
          return (
            <Pannellum.Hotspot
              key={annotation.id}
              type="info"
              pitch={annotation.pitch}
              yaw={annotation.yaw}
              tooltip={() => {
                // Return simple tooltip text
                return annotation.audit_results?.audit_criteria?.code || "Kriteria";
              }}
              handleClick={() => setSelectedHotspot(annotation)}
            />
          );
        })}
      </Pannellum>

      {/* Custom styled criteria detail panel overlay */}
      {selectedHotspot && selectedHotspot.audit_results?.audit_criteria && (() => {
        const criteria = selectedHotspot.audit_results.audit_criteria;
        const statusConfig = statusMap[selectedHotspot.audit_results.status] || statusMap.unknown;

        return (
          <div className="absolute top-4 right-4 z-10 max-w-sm w-80 bg-surface border border-line rounded-md p-4 shadow-md font-sans text-xs">
            {/* Header: criteria code & badge */}
            <div className="flex items-center justify-between pb-2 border-b border-line mb-3">
              <span className="font-mono font-medium text-[11px] text-ink-muted tracking-wider">
                {criteria.code}
              </span>
              <span className={`px-2 py-0.5 border rounded-md text-[9px] font-sans font-bold uppercase tracking-wider ${statusConfig.colorClass}`}>
                {statusConfig.label}
              </span>
            </div>

            {/* Body Description */}
            <p className="font-sans font-medium text-ink leading-relaxed mb-3 text-[12px]">
              {criteria.description}
            </p>

            {/* Agent reasoning block */}
            <div className="bg-bg/40 border border-line/50 p-2.5 rounded-md text-[11px] text-ink-muted mb-4 max-h-36 overflow-y-auto">
              <span className="block font-semibold mb-0.5 text-ink/75">Analisis AI:</span>
              {selectedHotspot.audit_results.reasoning || "Tidak ada rincian penalaran."}
            </div>

            {/* Action buttons */}
            <div className="flex justify-between items-center pt-1">
              <span className="text-[10px] font-sans text-ink-muted capitalize">
                Kategori: {criteria.category}
              </span>
              <button
                onClick={() => setSelectedHotspot(null)}
                className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors focus:outline-none cursor-pointer"
              >
                Tutup Info
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
