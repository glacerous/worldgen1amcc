"use client";

import { useState, useEffect } from "react";

interface VoteButtonsProps {
  buildingId: string;
  onVoteSuccess?: () => void;
}

export default function VoteButtons({ buildingId, onVoteSuccess }: VoteButtonsProps) {
  const [activeVote, setActiveVote] = useState<"up" | "down" | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial vote status for this user
  useEffect(() => {
    async function fetchVoteStatus() {
      try {
        const res = await fetch(`http://localhost:8000/buildings/${buildingId}/vote-status`, {
          // Send cookies for session tracking
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.has_voted) {
            setActiveVote(data.vote_type);
          }
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

    try {
      const res = await fetch(`http://localhost:8000/buildings/${buildingId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vote_type: type }),
        credentials: "include", // Ensure session cookies are sent/received
      });

      if (!res.ok) {
        throw new Error("Gagal mengirim vote.");
      }

      setActiveVote(type);
      if (onVoteSuccess) {
        onVoteSuccess();
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat memproses vote.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-sans text-xs text-ink-muted mr-1">Apakah gedung ini aksesibel?</span>
      
      {/* Upvote Button */}
      <button
        onClick={() => handleVote("up")}
        disabled={isLoading}
        className={`inline-flex items-center justify-center p-2 rounded-md border font-sans text-xs font-semibold transition-all cursor-pointer gap-1.5 ${
          activeVote === "up"
            ? "bg-status-met/10 text-status-met border-status-met/40 shadow-sm"
            : "bg-surface border-line hover:bg-bg/40 text-ink hover:text-status-met hover:border-status-met/30"
        } disabled:opacity-50`}
        title="Ya, gedung ini aksesibel"
      >
        <svg className="w-4 h-4" fill={activeVote === "up" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.896 0 1.7-.33 2.312-.872l.224-.197c.18-.158.375-.303.585-.436.438-.278.96-.341 1.442-.236l.24.05c.465.097.943.047 1.378-.146A3.486 3.486 0 0015.75 7.5V4.75a.75.75 0 011.096-.666l4.032 2.16c.866.464 1.402 1.36 1.402 2.336V11.25c0 1.24-.808 2.31-1.984 2.658l-.545.161c-.29.086-.57.247-.811.467L15.75 17.5V20.25a2.25 2.25 0 01-2.25 2.25h-3.375a2.25 2.25 0 01-2.25-2.25V14.5m-3 0H2.25A2.25 2.25 0 010 12.25v-4.5A2.25 2.25 0 012.25 5.5h3" />
        </svg>
        <span>Aksesibel</span>
      </button>

      {/* Downvote Button */}
      <button
        onClick={() => handleVote("down")}
        disabled={isLoading}
        className={`inline-flex items-center justify-center p-2 rounded-md border font-sans text-xs font-semibold transition-all cursor-pointer gap-1.5 ${
          activeVote === "down"
            ? "bg-status-not-met/10 text-status-not-met border-status-not-met/40 shadow-sm"
            : "bg-surface border-line hover:bg-bg/40 text-ink hover:text-status-not-met hover:border-status-not-met/30"
        } disabled:opacity-50`}
        title="Tidak, gedung ini tidak aksesibel"
      >
        <svg className="w-4 h-4" fill={activeVote === "down" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 9.75V4.75A2.25 2.25 0 019.75 2.5h3.375a2.25 2.25 0 012.25 2.25V10.25m3 0h3.75A2.25 2.25 0 0124 12.5v4.5a2.25 2.25 0 01-2.25 2.25h-3m-3 0c-.896 0-1.7.33-2.312.872l-.224.197c-.18.158-.375.303-.585.436-.438.278-.96.341-1.442.236l-.24-.05c-.465-.097-.943-.047-1.378.146A3.486 3.486 0 018.25 17v-2.75a.75.75 0 00-1.096-.666l-4.032-2.16A2.25 2.25 0 011.72 9.088V5.5c0-1.24.808-2.31 1.984-2.658l.545-.161c.29-.086.57-.247.811-.467L8.25 1z" />
        </svg>
        <span>Tidak Aksesibel</span>
      </button>
    </div>
  );
}
