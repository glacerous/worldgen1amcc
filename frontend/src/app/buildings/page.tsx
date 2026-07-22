"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import TrustBadge from "@/components/TrustBadge";
import { motion, AnimatePresence } from "framer-motion";
import Footer from "@/components/Footer";
import { BACKEND_URL } from "@/config";

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



function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius of the Earth in meters
  const toRad = (val: number) => (val * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getComplianceColorClass(score: number | "N/A" | null | undefined): string {
  if (score === null || score === undefined || score === "N/A") {
    return "text-ink-muted";
  }
  if (score < 50) {
    return "text-status-not-met";
  }
  if (score < 75) {
    return "text-amber-600";
  }
  return "text-accent";
}
// Global in-memory cache to prevent delays and layout shifts during client-side navigation
let globalUserLocation: { latitude: number; longitude: number } | null = null;
let globalPermissionDenied = false;

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"terbaru" | "skor_tertinggi" | "nama_az">("terbaru");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isExpandedNearby, setIsExpandedNearby] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Try to load location from cache or sessionStorage immediately on mount (client-side)
    let cachedLoc = globalUserLocation;
    if (!cachedLoc) {
      try {
        const stored = sessionStorage.getItem("user_location");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
            cachedLoc = parsed;
            globalUserLocation = parsed;
          }
        }
      } catch (e) {
        console.error("Error reading location from sessionStorage:", e);
      }
    }

    if (cachedLoc) {
      setUserLocation(cachedLoc);
      setIsLocationLoading(false);

      // Perform a silent update in the background to get the fresh location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const loc = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            globalUserLocation = loc;
            try {
              sessionStorage.setItem("user_location", JSON.stringify(loc));
            } catch (e) {}
            setUserLocation(loc);
          },
          (error) => {
            console.log("Silent geolocation update failed:", error);
          },
          { timeout: 10000 }
        );
      }
      return;
    }

    // 2. If we don't have cached location and know permission is denied, skip loading geolocation
    if (globalPermissionDenied) {
      setIsLocationLoading(false);
      return;
    }

    // 3. Otherwise, query geolocation and request permission
    if (navigator.geolocation) {
      // Query permission status if supported to fail-fast if denied
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: "geolocation" })
          .then((result) => {
            if (result.state === "denied") {
              globalPermissionDenied = true;
              setIsLocationLoading(false);
            }
          })
          .catch((err) => {
            console.warn("Permissions API error:", err);
          });
      }

      const timer = setTimeout(() => {
        setIsLocationLoading(false);
      }, 1000); // 1s timeout to check location before fallback

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timer);
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          globalUserLocation = loc;
          try {
            sessionStorage.setItem("user_location", JSON.stringify(loc));
          } catch (e) {}
          setUserLocation(loc);
          setIsLocationLoading(false);
        },
        (error) => {
          clearTimeout(timer);
          console.log("Geolocation error or denied:", error);
          if (error.code === error.PERMISSION_DENIED) {
            globalPermissionDenied = true;
          }
          setIsLocationLoading(false);
        },
        { timeout: 4000 }
      );
    } else {
      setIsLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadBuildings() {
      try {
        const res = await fetch(`${BACKEND_URL}/buildings`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Failed to fetch buildings (status ${res.status}): ${errText}`);
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

  // Calculate distance from user location and sort 5 closest
  interface BuildingWithDistance extends Building {
    distance: number;
  }

  const topNearbyBuildings: BuildingWithDistance[] = (() => {
    if (!userLocation || buildings.length === 0) return [];

    return buildings
      .filter((b) => b.latitude !== null && b.longitude !== null)
      .map((b) => {
        const distance = calculateHaversineDistance(
          userLocation.latitude,
          userLocation.longitude,
          b.latitude!,
          b.longitude!
        );
        return { ...b, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  })();

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

  const isPageLoading = isLoading || isLocationLoading;
  const showMainCatalog = searchQuery.length > 0 || !userLocation || topNearbyBuildings.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-12 md:py-16 max-w-4xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5 pb-4 border-b border-line/45">
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
        <div className="mb-6">
          <div className="flex gap-4 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full">
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
          </div>
        </div>
          {/* Coba Cari (Try Searching) Section */}
          <div className="mt-4 mb-8">
            <h3 className="text-[10px] font-sans font-semibold text-ink-muted/80 uppercase tracking-widest mb-3">
              Coba Cari
            </h3>
            <div className="flex flex-col border border-line rounded-md bg-surface overflow-hidden divide-y divide-line/45">
              {[
                { label: "Kampus dengan aksesibilitas terverifikasi", value: "Kampus" },
                { label: "Kantor Pemerintah ramah disabilitas", value: "Kantor Pemerintah" },
                { label: "Rumah Sakit akses kursi roda", value: "Rumah Sakit" },
                { label: "Mall ramah disabilitas terdekat", value: "Mall" },
              ].map((item) => {
                const isActive = searchQuery.toLowerCase() === item.value.toLowerCase();
                return (
                  <button
                    key={item.value}
                    onClick={() => setSearchQuery(isActive ? "" : item.value)}
                    className={`flex items-center justify-between px-4 py-3.5 text-left font-sans text-xs transition-all duration-200 cursor-pointer group ${
                      isActive
                        ? "bg-accent/5 text-accent font-semibold"
                        : "text-ink hover:bg-bg/40"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <svg
                        className={`w-4 h-4 flex-shrink-0 ${
                          isActive ? "text-accent" : "text-ink-muted/60"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <span className="truncate">{item.label}</span>
                    </div>
                    <svg
                      className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 group-hover:translate-x-1.5 ${
                        isActive ? "text-accent" : "text-ink-muted/40"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
            </div>
            
            {/* Reset Button */}
            {searchQuery && (
              <div className="flex justify-end mt-2">
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => setSearchQuery("")}
                  className="font-sans text-xs px-2.5 py-1 rounded-md border border-status-not-met/30 bg-surface text-status-not-met hover:bg-status-not-met/5 hover:border-status-not-met transition-all cursor-pointer flex items-center gap-1 hover:-translate-y-0.5 duration-200"
                >
                  <span>✕</span> Reset Pencarian
                </motion.button>
              </div>
            )}
          </div>

        {/* Buildings Content */}
        {isPageLoading ? (
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
            {/* Gedung Terdekat Section */}
            {!searchQuery && userLocation && topNearbyBuildings.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="pb-6 border-b border-line/30"
              >
                {/* Header with badge count */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-xl font-normal text-ink">Gedung Terdekat</h2>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-sans font-semibold bg-accent/10 text-accent border border-accent/20">
                    {topNearbyBuildings.length} ditemukan
                  </span>
                </div>

                {/* Vertical List of cards */}
                <div className="flex flex-col gap-3.5">
                  {topNearbyBuildings
                    .slice(0, isExpandedNearby ? topNearbyBuildings.length : 5)
                    .map((building) => {
                      const firstPhotoResult = building.audit_results?.find((r) => r.evidence_url);
                      const thumbnailUrl = firstPhotoResult?.evidence_url || null;
                      const distanceText = building.distance < 1000
                        ? `${Math.round(building.distance)} m`
                        : `${(building.distance / 1000).toFixed(1)} km`;

                      const scoreColorClass = getComplianceColorClass(building.compliance_score);

                      return (
                        <Link
                          key={building.id}
                          href={`/buildings/${building.id}`}
                          className="bg-surface border border-line hover:border-accent/40 rounded-md p-3 sm:p-4 flex items-center gap-4 transition-all group hover:shadow-sm hover:-translate-y-0.5 duration-300 cursor-pointer w-full"
                        >
                          {/* Left Thumbnail */}
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-bg overflow-hidden flex-shrink-0 relative border border-line/45">
                            {thumbnailUrl ? (
                              <img src={thumbnailUrl} className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300" alt={`Foto bangunan ${building.name}`} />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-bg to-line/30 flex items-center justify-center">
                                <svg className="w-6 h-6 text-ink-muted/30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                              </div>
                            )}
                          </div>

                          {/* Center Info */}
                          <div className="flex-1 min-w-0 pr-2">
                            <h3 className="font-display text-sm sm:text-base font-semibold text-ink group-hover:text-accent transition-colors truncate">
                              {building.name}
                            </h3>
                            <p className="font-sans text-xs text-ink-muted flex items-center gap-1.5 mt-1 truncate">
                              <svg className="w-3.5 h-3.5 text-accent/80 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                              </svg>
                              <span className="font-semibold text-accent flex-shrink-0">{distanceText}</span>
                              {building.address && (
                                <>
                                  <span className="text-ink-muted/40 font-normal">·</span>
                                  <span className="truncate">{building.address}</span>
                                </>
                              )}
                            </p>
                          </div>

                          {/* Right Compliance Score */}
                          {building.compliance_score !== null && building.compliance_score !== undefined && (
                            <div className={`flex-shrink-0 font-display text-xl sm:text-2xl font-bold ${scoreColorClass}`}>
                              {building.compliance_score === "N/A" ? "N/A" : `${building.compliance_score}%`}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                </div>

                {/* Show more/less toggle button */}
                {topNearbyBuildings.length > 5 && (
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => setIsExpandedNearby(!isExpandedNearby)}
                      className="font-sans text-xs font-semibold text-accent hover:opacity-85 transition-opacity cursor-pointer py-1.5 px-4 border border-line rounded-md bg-surface hover:bg-bg/40 flex items-center gap-1.5 hover:-translate-y-0.5 duration-200"
                    >
                      {isExpandedNearby ? (
                        <>
                          Tampilkan Lebih Sedikit <span>↑</span>
                        </>
                      ) : (
                        <>
                          Tampilkan {topNearbyBuildings.length - 5} Lainnya <span>↓</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Featured Spotlight Card */}
            {showMainCatalog && featuredBuilding && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
              >
                <Link
                  href={`/buildings/${featuredBuilding.id}`}
                  className="relative bg-surface border-2 border-accent/20 hover:border-accent/50 rounded-lg p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 transition-all group overflow-hidden block hover:shadow-md hover:-translate-y-0.5 duration-300 cursor-pointer"
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
                          <img src={thumbnailUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={`Foto bangunan utama ${featuredBuilding.name}`} />
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
                        <span className={`font-display text-5xl sm:text-6xl font-extrabold leading-none ${getComplianceColorClass(featuredBuilding.compliance_score)}`}>
                          {featuredBuilding.compliance_score === "N/A" ? "N/A" : `${featuredBuilding.compliance_score}%`}
                        </span>
                        <span className="font-sans text-[10px] text-ink-muted mt-1.5 uppercase tracking-wider font-semibold">
                          Kepatuhan
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )}

            {/* Grid layout for other buildings */}
            {showMainCatalog && gridBuildings.length > 0 && (
              <motion.div
                layout
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {gridBuildings.map((building) => {
                  const firstPhotoResult = building.audit_results?.find((r) => r.evidence_url);
                  const thumbnailUrl = firstPhotoResult?.evidence_url || null;

                  return (
                    <motion.div
                      layout
                      key={building.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Link
                        href={`/buildings/${building.id}`}
                        className="bg-surface border border-line hover:border-accent/40 rounded-md p-5 flex items-center gap-4 transition-all group hover:shadow-md hover:-translate-y-0.5 duration-300 cursor-pointer h-full"
                      >
                        {/* Card Thumbnail */}
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-md bg-bg overflow-hidden flex-shrink-0 relative border border-line/45">
                          {thumbnailUrl ? (
                            <img src={thumbnailUrl} className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300" alt={`Foto bangunan ${building.name}`} />
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
                          <div className="flex-shrink-0 flex items-center justify-end gap-3">
                            {building.status_summary === "no_audit" && (
                              <span className="px-2.5 py-1 bg-status-unknown/10 text-status-unknown border border-status-unknown/20 rounded text-[10px] font-sans font-medium whitespace-nowrap">
                                No Audit
                              </span>
                            )}

                            {building.status_summary === "active" && building.compliance_score !== null && building.compliance_score !== undefined && (
                              <div className="flex flex-col items-end">
                                <span className={`font-display text-3xl sm:text-4xl font-extrabold ${getComplianceColorClass(building.compliance_score)}`}>
                                  {building.compliance_score === "N/A" ? "N/A" : `${building.compliance_score}%`}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        )}
      </main>
      
      <Footer />
    </div>
  );
}
