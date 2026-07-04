"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";

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
              const compliance = getComplianceStats(building);
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

                  {/* Compliance & Provenance badges */}
                  <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0 sm:flex-col sm:items-end sm:gap-1.5">
                    {/* Provenance Badge */}
                    <span className={`px-2 py-0.5 border rounded-md text-[9px] font-sans font-semibold uppercase tracking-wider ${
                      building.verified 
                        ? "bg-accent/10 text-accent border-accent/20" 
                        : "bg-bg text-ink-muted border-line"
                    }`}>
                      {building.verified ? "Diverifikasi Tim" : "Kontribusi Komunitas"}
                    </span>

                    {/* Compliance Badge */}
                    {compliance !== null ? (
                      compliance === "N/A" ? (
                        <span className="px-2.5 py-0.5 bg-status-na/10 text-status-na border border-status-na/20 rounded-md text-xs font-sans font-bold">
                          N/A
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-xs text-ink-muted hidden md:inline">Compliance:</span>
                          <span className="px-2.5 py-0.5 bg-status-met/10 text-status-met border border-status-met/20 rounded-md text-xs font-sans font-bold">
                            {compliance}%
                          </span>
                        </div>
                      )
                    ) : (
                      <span className="px-2.5 py-0.5 bg-status-unknown/10 text-status-unknown border border-status-unknown/20 rounded-md text-[11px] font-sans font-medium">
                        Menunggu Audit
                      </span>
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
