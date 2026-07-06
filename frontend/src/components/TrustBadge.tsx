import React from "react";

export type TrustStatus = "neutral" | "trusted" | "doubtful" | "reported";

interface TrustBadgeProps {
  status: TrustStatus;
  manuallySetByAdmin: boolean;
  trustScore: number | null;
  voteCount: number;
  reportCount?: number;
}

export default function TrustBadge({
  status,
  manuallySetByAdmin,
  trustScore,
  voteCount,
  reportCount = 0,
}: TrustBadgeProps) {
  // Format percentage
  const percentage = trustScore !== null ? Math.round(trustScore * 100) : 0;

  // Render variables based on status
  let badgeClasses = "";
  let icon: React.ReactNode = null;
  let label = "";

  switch (status) {
    case "trusted":
      badgeClasses = "bg-status-met/10 text-status-met border-status-met/20";
      icon = (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
      label = `Dipercaya (${percentage}% dari ${voteCount} vote)`;
      break;

    case "doubtful":
      badgeClasses = "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-600";
      icon = (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h1.5M12 18.75h.008v.008H12V18.75zm.375-3h-.75c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125h.75c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-3" />
        </svg>
      );
      label = `Meragukan (${percentage}% dari ${voteCount} vote)`;
      break;

    case "reported":
      badgeClasses = "bg-status-not-met/10 text-status-not-met border-status-not-met/20";
      icon = (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
      // Count is either passed or fallbacks to a minimum of 3 (the default threshold) if status is reported
      const displayReports = reportCount > 0 ? reportCount : 3;
      label = `Dalam Peninjauan (${displayReports} laporan)`;
      break;

    case "neutral":
    default:
      badgeClasses = "bg-status-unknown/10 text-status-unknown border-status-unknown/20";
      icon = (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
      label = "Belum Ada Cukup Data";
      break;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold font-sans border ${badgeClasses} transition-all duration-200`}
      >
        {icon}
        <span>{label}</span>
      </div>
      
      {manuallySetByAdmin && (
        <span className="text-[10px] font-sans font-medium text-ink-muted italic pl-1 flex items-center gap-1">
          <svg className="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944a11.954 11.954 0 007.834 3.056 12.01 12.01 0 01-1.834 8.784 12.01 12.01 0 01-6 3.216 12.01 12.01 0 01-6-3.216 12.01 12.01 0 01-1.834-8.784zm11.233 2.707a1 1 0 00-1.414-1.414L9 9.172 7.707 7.879a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l3-3z" clipRule="evenodd" />
          </svg>
          Ditinjau & dikonfirmasi admin
        </span>
      )}
    </div>
  );
}
