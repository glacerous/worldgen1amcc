"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VoteButtons from "./VoteButtons";
import ReportModal from "./ReportModal";

interface BuildingDetailActionsProps {
  buildingId: string;
}

export default function BuildingDetailActions({ buildingId }: BuildingDetailActionsProps) {
  const router = useRouter();
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleSuccess = () => {
    // Refresh the server component data
    router.refresh();
  };

  return (
    <div className="bg-surface border border-line rounded-md p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <VoteButtons 
        buildingId={buildingId} 
        onVoteSuccess={handleSuccess} 
      />
      
      <button
        onClick={() => setIsReportOpen(true)}
        className="inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/40 text-ink-muted hover:text-status-not-met hover:border-status-not-met/30 font-sans text-xs font-semibold px-4 py-2.5 rounded-md transition-all cursor-pointer w-full sm:w-auto"
      >
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Laporkan Ketidaksesuaian
      </button>

      <ReportModal
        buildingId={buildingId}
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        onReportSuccess={handleSuccess}
      />
    </div>
  );
}
