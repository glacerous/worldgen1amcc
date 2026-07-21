"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VoteButtons from "./VoteButtons";
import ReportModal from "./ReportModal";

interface BuildingDetailActionsProps {
  buildingId: string;
  auditRunId?: string | null;
}

export default function BuildingDetailActions({ buildingId, auditRunId }: BuildingDetailActionsProps) {
  const router = useRouter();
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleSuccess = () => {
    // Refresh the server component data
    router.refresh();
  };

  return (
    <div className="flex items-center gap-3 select-none">
      <VoteButtons 
        buildingId={buildingId} 
        auditRunId={auditRunId}
        onVoteSuccess={handleSuccess} 
      />
      
      <span className="text-line/45 h-3 w-px bg-line/60"></span>
      
      <div className="group relative inline-block">
        <button
          onClick={() => setIsReportOpen(true)}
          className="text-ink-muted hover:text-status-not-met p-1 rounded hover:bg-bg/40 transition-all cursor-pointer flex items-center justify-center"
          title="Laporkan Ketidaksesuaian"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18M3 5h12l-1 3.5 1 3.5H3" />
          </svg>
        </button>
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block w-36 bg-surface border border-line p-1.5 rounded-md shadow-md text-[9px] font-sans text-center text-ink z-50">
          Laporkan Ketidaksesuaian
        </div>
      </div>

      <ReportModal
        buildingId={buildingId}
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        onReportSuccess={handleSuccess}
      />
    </div>
  );
}
