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
    <div className="flex items-center gap-3 select-none">
      <VoteButtons 
        buildingId={buildingId} 
        onVoteSuccess={handleSuccess} 
      />
      
      <span className="text-line/45 h-3 w-px bg-line/60"></span>
      
      <button
        onClick={() => setIsReportOpen(true)}
        className="text-[10px] font-sans font-semibold text-ink-muted hover:text-status-not-met transition-colors cursor-pointer"
      >
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
