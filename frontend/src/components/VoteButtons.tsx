"use client";

import { useState, useEffect } from "react";

interface VoteButtonsProps {
  buildingId: string;
  onVoteSuccess?: () => void;
}

export default function VoteButtons({ buildingId, onVoteSuccess }: VoteButtonsProps) {
  const [activeVote, setActiveVote] = useState<"up" | "down" | null>(null);
  const [voteStats, setVoteStats] = useState<{ trustScore: number | null; voteCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial vote status for this user
  useEffect(() => {
    async function fetchVoteStatus() {
      try {
        const res = await fetch(`http://127.0.0.1:8000/buildings/${buildingId}/vote-status`, {
          // Send cookies for session tracking
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.has_voted) {
            setActiveVote(data.vote_type);
          }
          setVoteStats({
            trustScore: data.trust_score !== undefined ? data.trust_score : null,
            voteCount: data.vote_count !== undefined ? data.vote_count : 0,
          });
        }
      } catch (err) {
        console.error("Failed to load user vote status:", err);
      }
    }
    fetchVoteStatus();
  }, [buildingId]);

  const handleVote = async (type: "up" | "down") => {
    if (isLoading) return;
    setIsLoading(true);

    const isUnselecting = activeVote === type;
    const targetVoteType = isUnselecting ? null : type;

    try {
      const res = await fetch(`http://127.0.0.1:8000/buildings/${buildingId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vote_type: targetVoteType }),
        credentials: "include", // Ensure session cookies are sent/received
      });

      if (!res.ok) {
        throw new Error("Gagal mengirim vote.");
      }

      const data = await res.json();
      setActiveVote(targetVoteType);

      if (data.building) {
        setVoteStats({
          trustScore: data.building.trust_score_cache ?? null,
          voteCount: data.building.vote_count_cache ?? 0,
        });
      }

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
    <div className="flex items-center gap-1">
      {/* Upvote Button */}
      <button
        onClick={() => handleVote("up")}
        disabled={isLoading}
        className={`inline-flex items-center justify-center p-1.5 rounded transition-all cursor-pointer ${
          activeVote === "up" ? "text-status-met bg-status-met/10" : "text-ink-muted hover:text-status-met"
        } disabled:opacity-50`}
        title="Akurat"
      >
        <svg className="w-4 h-4" fill={activeVote === "up" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10v12" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
      </button>

      {/* Downvote Button */}
      <button
        onClick={() => handleVote("down")}
        disabled={isLoading}
        className={`inline-flex items-center justify-center p-1.5 rounded transition-all cursor-pointer ${
          activeVote === "down" ? "text-status-not-met bg-status-not-met/10" : "text-ink-muted hover:text-status-not-met"
        } disabled:opacity-50`}
        title="Tidak Akurat"
      >
        <svg className="w-4 h-4" fill={activeVote === "down" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 14V2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
      </button>

      {/* Percentage / Count info */}
      {percentage !== null && (
        <span className="text-[10px] font-sans font-semibold ml-1.5 px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
          {percentage}% Akurat
        </span>
      )}
    </div>
  );
}
