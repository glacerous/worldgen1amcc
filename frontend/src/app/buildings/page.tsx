"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import TrustBadge from "@/components/TrustBadge";

interface AuditCriteria {
  category: string;
}

interface AuditResult {
  status: "met" | "not_met" | "unknown" | "na";
  audit_criteria: AuditCriteria | null;
  evidence_url?: string | null;
}

interface Building {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  audit_results: AuditResult[];
  source?: string;
  verified?: boolean;
  trust_status?: string;
  manually_set_by_admin?: boolean;
  trust_score_cache?: number | null;
  vote_count_cache?: number;
  status_summary?: "review" | "no_audit" | "active";
  compliance_score?: number | "N/A" | null;
  audit_run_count?: number;
  created_at?: string;
}

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"terbaru" | "skor_tertinggi" | "nama_az">("terbaru");

  useEffect(() => {
    async function loadBuildings() {
      try {
        const res = await fetch("http://127.0.0.1:8000/buildings", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Failed to fetch buildings");
        }
        const data = await res.json();
        setBuildings(data);
      } catch (error) {
        console.error("Error loading buildings:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadBuildings();
  }, []);

  // Filter client-side by search query
  const filteredBuildings = buildings.filter((building) => {
    return (
      building.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (building.address && building.address.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Sort client-side
  const sortedBuildings = [...filteredBuildings].sort((a, b) => {
    if (sortBy === "terbaru") {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    } else if (sortBy === "skor_tertinggi") {
      const scoreA = typeof a.compliance_score === "number" ? a.compliance_score : -1;
      const scoreB = typeof b.compliance_score === "number" ? b.compliance_score : -1;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    } else {
      return a.name.localeCompare(b.name, "id", { sensitivity: "base" });
    }
  });

  // Find the building with highest numeric compliance score as the featured spotlight
  let featuredBuilding: Building | null = null;
  const eligibleForFeature = sortedBuildings.filter(
    (b) => b.status_summary === "active" && typeof b.compliance_score === "number"
  );
  if (eligibleForFeature.length > 0) {
    featuredBuilding = eligibleForFeature.reduce((max, b) => 
      (b.compliance_score ?? 0) > (max.compliance_score ?? 0) ? b : max
    , eligibleForFeature[0]);
  }

  // Exclude featured building from main grid to prevent duplication
  const gridBuildings = featuredBuilding
    ? sortedBuildings.filter((b) => b.id !== featuredBuilding!.id)
    : sortedBuildings;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-12 md:py-16 max-w-4xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 pb-6 border-b border-line/45">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-normal text-ink">
              Daftar Gedung Publik
            </h1>
            <p className="font-sans text-sm text-ink-muted mt-1">
              Gedung publik terverifikasi yang telah diaudit atau diajukan untuk audit.
            </p>
          </div>
          <Link
            href="/buildings/submit"
            className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2.5 rounded-md transition-all w-fit cursor-pointer"
          >
            Audit Gedung Baru
          </Link>
        </div>

        {/* Filter & Search Bar */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <input
                type="text"
                placeholder="Cari gedung berdasarkan nama atau alamat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-line rounded-md pl-10 pr-4 py-2.5 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
              />
              <svg
                className="absolute left-3.5 top-3.5 w-4 h-4 text-ink-muted/60"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                ></path>
              </svg>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
              <span className="text-[11px] font-sans font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">
                Urutkan:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-surface border border-line rounded-md px-3 py-2 text-xs font-sans text-ink font-semibold focus:outline-none focus:border-accent/40 cursor-pointer w-full sm:w-auto"
              >
                <option value="terbaru">Terbaru</option>
                <option value="skor_tertinggi">Skor Kepatuhan Tertinggi</option>
                <option value="nama_az">Nama A-Z</option>
              </select>
            </div>
          </div>
        </div>

        {/* Buildings Content */}
        {isLoading ? (
          /* Loading Skeleton */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-surface border border-line rounded-md p-5 flex items-center gap-4 animate-pulse"
              >
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-line rounded flex-shrink-0"></div>
                <div className="flex-1 space-y-2.5">
                  <div className="h-4 bg-line rounded w-2/3"></div>
                  <div className="h-3 bg-line rounded w-1/2"></div>
                </div>
                <div className="w-12 h-8 bg-line rounded flex-shrink-0"></div>
              </div>
            ))}
          </div>
        ) : filteredBuildings.length === 0 ? (
          /* Empty State */
          <div className="bg-surface border border-line rounded-md p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-md bg-bg border border-line flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-ink-muted/85"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                ></path>
              </svg>
            </div>
            <p className="font-display italic text-lg text-ink mb-2">
              "Gedung yang Anda cari tidak ditemukan."
            </p>
            <p className="font-sans text-xs text-ink-muted mb-6 max-w-sm mx-auto leading-relaxed">
              Kami belum memiliki data untuk kriteria pencarian ini. Bantu kami melengkapi database dengan mengusulkan gedung baru.
            </p>
            <Link
              href="/buildings/submit"
              className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-5 py-2.5 rounded-md transition-all cursor-pointer"
            >
              Audit Gedung Pertama
            </Link>
          </div>
        ) : (
          /* Listing Layout */
          <div className="space-y-8">
            {/* Featured Spotlight Card */}
            {featuredBuilding && (
              <Link
                href={`/buildings/${featuredBuilding.id}`}
                className="relative bg-surface border-2 border-accent/20 hover:border-accent/50 rounded-lg p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 transition-all group overflow-hidden block"
              >
                {/* Highlight Badge */}
                <div className="absolute top-4 left-4 bg-accent text-white text-[9px] font-sans font-bold uppercase tracking-widest px-2.5 py-1 rounded shadow-sm z-10">
                  Sorotan Kepatuhan Terbaik
                </div>
                
                {/* Thumbnail */}
                {(() => {
                  const firstPhotoResult = featuredBuilding.audit_results?.find((r) => r.evidence_url);
                  const thumbnailUrl = firstPhotoResult?.evidence_url || null;
                  return (
                    <div 
                      className="w-full md:w-36 h-36 md:h-36 rounded-md bg-bg overflow-hidden flex-shrink-0 relative border border-line/50 mt-6 md:mt-0"
                    >
                      {thumbnailUrl ? (
                        <img src={thumbnailUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-bg to-line/40 flex items-center justify-center">
                          <svg className="w-10 h-10 text-ink-muted/40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Content */}
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-6 w-full">
                  <div className="space-y-2">
                    <h2 className="font-display text-2xl font-bold text-ink group-hover:text-accent transition-colors">
                      {featuredBuilding.name}
                    </h2>
                    <p className="font-sans text-sm text-ink-muted leading-relaxed">
                      {featuredBuilding.address || "Tidak ada alamat lengkap"}
                    </p>
                  </div>

                  <div className="flex-shrink-0 flex items-center">
                    <div className="flex flex-col items-end">
                      <span className="font-display text-5xl sm:text-6xl font-extrabold text-accent leading-none">
                        {featuredBuilding.compliance_score}%
                      </span>
                      <span className="font-sans text-[10px] text-ink-muted mt-1.5 uppercase tracking-wider font-semibold">
                        Kepatuhan
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Grid layout for other buildings */}
            {gridBuildings.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {gridBuildings.map((building) => {
                  const firstPhotoResult = building.audit_results?.find((r) => r.evidence_url);
                  const thumbnailUrl = firstPhotoResult?.evidence_url || null;

                  return (
                    <Link
                      href={`/buildings/${building.id}`}
                      key={building.id}
                      className="bg-surface border border-line hover:border-accent/50 rounded-md p-5 flex items-center gap-4 transition-all group"
                    >
                      {/* Card Thumbnail */}
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded bg-bg overflow-hidden flex-shrink-0 relative border border-line/45">
                        {thumbnailUrl ? (
                          <img src={thumbnailUrl} className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300" alt="" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-bg to-line/30 flex items-center justify-center">
                            <svg className="w-8 h-8 text-ink-muted/30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Card Content & Score */}
                      <div className="flex-1 flex items-center justify-between gap-4 min-w-0">
                        <div className="min-w-0 pr-2">
                          <h2 className="font-display text-base sm:text-lg font-medium text-ink group-hover:text-accent transition-colors truncate">
                            {building.name}
                          </h2>
                          <p className="font-sans text-xs text-ink-muted truncate mt-1">
                            {building.address || "Tidak ada alamat lengkap"}
                          </p>
                        </div>

                        {/* Status Container */}
                        <div className="flex-shrink-0 flex items-center justify-end">
                          {building.status_summary === "review" && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-sans font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-600 border border-amber-500/20 gap-1.5 shadow-xs">
                              <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              Review
                            </span>
                          )}

                          {building.status_summary === "no_audit" && (
                            <span className="px-2.5 py-1 bg-status-unknown/10 text-status-unknown border border-status-unknown/20 rounded text-[10px] font-sans font-medium whitespace-nowrap">
                              No Audit
                            </span>
                          )}

                          {building.status_summary === "active" && (
                            <div className="flex flex-col items-end">
                              <span className={`font-display text-3xl sm:text-4xl font-extrabold ${
                                building.compliance_score === "N/A" ? "text-ink-muted" : "text-accent"
                              }`}>
                                {building.compliance_score === "N/A" ? "N/A" : `${building.compliance_score}%`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
