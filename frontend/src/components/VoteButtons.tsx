"use client";

import { useState, useEffect } from "react";
import CountUpNumber from "./CountUpNumber";
import { BACKEND_URL } from "@/config";

interface VoteButtonsProps {
  buildingId: string;
  auditRunId?: string | null;
  onVoteSuccess?: () => void;
}

export default function VoteButtons({ buildingId, auditRunId, onVoteSuccess }: VoteButtonsProps) {
  const [activeVote, setActiveVote] = useState<"up" | "down" | null>(null);
  const [voteStats, setVoteStats] = useState<{
    trustScore: number | null;
    voteCount: number;
    upCount?: number;
    downCount?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial vote status for this user
  useEffect(() => {
    let id = "";
    if (typeof window !== "undefined") {
      let localId = localStorage.getItem("anonymous_id");
      if (!localId) {
        localId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem("anonymous_id", localId);
      }
      id = localId;
    }

    async function fetchVoteStatus() {
      try {
        const headers: Record<string, string> = {};
        if (id) {
          headers["X-Anonymous-ID"] = id;
        }
        const endpoint = auditRunId
          ? `${BACKEND_URL}/audit-runs/${auditRunId}/vote-status`
          : `${BACKEND_URL}/buildings/${buildingId}/vote-status`;

        const res = await fetch(endpoint, {
          headers,
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setActiveVote(data.has_voted ? data.vote_type : null);
          setVoteStats({
            trustScore: data.trust_score !== undefined ? data.trust_score : null,
            voteCount: data.vote_count !== undefined ? data.vote_count : 0,
            upCount: data.up_count !== undefined ? data.up_count : 0,
            downCount: data.down_count !== undefined ? data.down_count : 0,
          });
        }
      } catch (err) {
        console.error("Failed to load user vote status:", err);
      }
    }

    setActiveVote(null);
    setVoteStats(null);
    fetchVoteStatus();
  }, [buildingId, auditRunId]);

  const handleVote = async (type: "up" | "down") => {
    if (isLoading) return;
    setIsLoading(true);

    const isUnselecting = activeVote === type;
    const targetVoteType = isUnselecting ? null : type;

    let id = "";
    if (typeof window !== "undefined") {
      id = localStorage.getItem("anonymous_id") || "";
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (id) {
        headers["X-Anonymous-ID"] = id;
      }
      const endpoint = auditRunId
        ? `${BACKEND_URL}/audit-runs/${auditRunId}/vote`
        : `${BACKEND_URL}/buildings/${buildingId}/vote`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ vote_type: targetVoteType, audit_run_id: auditRunId }),
        credentials: "include", // Ensure session cookies are sent/received
      });

      if (!res.ok) {
        throw new Error("Gagal mengirim vote.");
      }

      const data = await res.json();
      setActiveVote(targetVoteType);

      setVoteStats({
        trustScore: data.trust_score ?? data.building?.trust_score_cache ?? null,
        voteCount: data.vote_count ?? data.building?.vote_count_cache ?? 0,
        upCount: data.up_count ?? 0,
        downCount: data.down_count ?? 0,
      });

      if (onVoteSuccess) {
        onVoteSuccess();
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat memproses vote.");
    } finally {
      setIsLoading(false);
    }
  };

  const percentage = voteStats && voteStats.trustScore !== null && voteStats.voteCount > 0
    ? Math.round(voteStats.trustScore * 100)
    : null;

  return (
    <div className="group relative flex items-center gap-1">
      {/* Upvote Button */}
      <button
        onClick={() => handleVote("up")}
        disabled={isLoading}
        className={`inline-flex items-center gap-1 justify-center p-1.5 rounded transition-all cursor-pointer ${
          activeVote === "up" ? "text-status-met bg-status-met/10" : "text-ink-muted hover:text-status-met"
        } disabled:opacity-50`}
        title="Akurat"
        aria-label="Tandai data akurat"
      >
        <svg className="w-4 h-4" fill={activeVote === "up" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10v12" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
        <span className="text-[11px] font-sans font-semibold">
          <CountUpNumber value={voteStats?.upCount ?? 0} />
        </span>
      </button>

      {/* Downvote Button */}
      <button
        onClick={() => handleVote("down")}
        disabled={isLoading}
        className={`inline-flex items-center gap-1 justify-center p-1.5 rounded transition-all cursor-pointer ${
          activeVote === "down" ? "text-status-not-met bg-status-not-met/10" : "text-ink-muted hover:text-status-not-met"
        } disabled:opacity-50`}
        title="Tidak Akurat"
        aria-label="Tandai data tidak akurat"
      >
        <svg className="w-4 h-4" fill={activeVote === "down" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 14V2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
        <span className="text-[11px] font-sans font-semibold">
          <CountUpNumber value={voteStats?.downCount ?? 0} />
        </span>
      </button>

      {/* Hover Tooltip showing percentage accuracy from total votes */}
      {percentage !== null && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-48 bg-surface border border-line p-2 rounded-md shadow-lg text-[10px] text-ink font-sans font-normal text-center z-50">
          {percentage}% dari {voteStats?.voteCount ?? 0} vote menganggap ini akurat
        </div>
      )}
    </div>
  );
}
