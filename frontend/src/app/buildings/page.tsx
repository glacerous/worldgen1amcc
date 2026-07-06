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
}

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    async function loadBuildings() {
      try {
        const res = await fetch("http://localhost:8000/buildings", {
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

  // Filter client-side
  const filteredBuildings = buildings.filter((building) => {
    // 1. Filter by search query (name and address)
    const matchesSearch =
      building.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (building.address && building.address.toLowerCase().includes(searchQuery.toLowerCase()));

    // 2. Filter by category pill
    const matchesCategory =
      !selectedCategory ||
      (building.audit_results &&
        building.audit_results.some(
          (result) =>
            result.audit_criteria?.category?.toLowerCase() === selectedCategory.toLowerCase()
        ));

    return matchesSearch && matchesCategory;
  });

  // Calculate compliance score for a building
  const getComplianceStats = (building: Building) => {
    const results = building.audit_results || [];
    if (results.length === 0) return null;

    const totalCount = results.length;
    const metCount = results.filter((r) => r.status === "met").length;
    const naCount = results.filter((r) => r.status === "na").length;

    const evaluableCount = totalCount - naCount;
    if (evaluableCount <= 0) return "N/A";

    return Math.round((metCount / evaluableCount) * 100);
  };

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
        <div className="space-y-4 mb-8">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Cari gedung berdasarkan nama atau alamat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-line rounded-md pl-10 pr-4 py-2.5 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
            />
            <svg
              className="absolute left-3.5 top-3 w-4 h-4 text-ink-muted/60"
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

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-sans font-semibold text-ink-muted uppercase tracking-wider mr-2">
              Filter Kategori:
            </span>
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 rounded-md text-xs font-sans font-medium border transition-all cursor-pointer ${
                selectedCategory === null
                  ? "bg-accent text-white border-accent"
                  : "bg-surface text-ink border-line hover:bg-bg/40"
              }`}
            >
              Semua
            </button>
            {["Mobilitas", "Netra", "Rungu"].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-md text-xs font-sans font-medium border transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-accent text-white border-accent"
                    : "bg-surface text-ink border-line hover:bg-bg/40"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Buildings Content */}
        {isLoading ? (
          /* Loading Skeleton */
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-surface border border-line rounded-md p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-pulse"
              >
                <div className="space-y-2 flex-1">
                  <div className="h-5 bg-line rounded w-1/3"></div>
                  <div className="h-3 bg-line rounded w-1/2"></div>
                </div>
                <div className="h-6 bg-line rounded w-20 flex-shrink-0"></div>
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
          /* Listing Grid */
          <div className="grid grid-cols-1 gap-4">
            {filteredBuildings.map((building) => {
              return (
                <Link
                  href={`/buildings/${building.id}`}
                  key={building.id}
                  className="bg-surface border border-line hover:border-accent/40 rounded-md p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all group"
                >
                  <div>
                    <h2 className="font-display text-xl font-medium text-ink group-hover:text-accent transition-colors mb-1">
                      {building.name}
                    </h2>
                    <p className="font-sans text-xs text-ink-muted">
                      {building.address || "Tidak ada alamat lengkap"}
                    </p>
                  </div>

                  {/* Main Status Container */}
                  <div className="flex-shrink-0 flex items-center justify-end mt-2 sm:mt-0">
                    {building.status_summary === "review" && (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-sans font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-600 border border-amber-500/20 gap-1.5 shadow-sm">
                        <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Dalam Peninjauan
                      </span>
                    )}

                    {building.status_summary === "no_audit" && (
                      <span className="px-3 py-1.5 bg-status-unknown/10 text-status-unknown border border-status-unknown/20 rounded-md text-xs font-sans font-medium">
                        Menunggu Audit Pertama
                      </span>
                    )}

                    {building.status_summary === "active" && (
                      <div className="flex flex-col items-end gap-1">
                        <span className={`font-display text-4xl font-bold ${
                          building.compliance_score === "N/A" ? "text-ink-muted" : "text-accent"
                        }`}>
                          {building.compliance_score === "N/A" ? "N/A" : `${building.compliance_score}%`}
                        </span>
                        <span className="font-sans text-[10px] text-ink-muted">
                          berdasarkan {building.audit_run_count} audit
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
