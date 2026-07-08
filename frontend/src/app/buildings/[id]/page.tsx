"use client";

import { useState, useEffect, use } from "react";
import Navbar from "@/components/Navbar";
import AuditResultsList from "@/components/AuditResultsList";
import Link from "next/link";
import BuildingDetailActions from "@/components/BuildingDetailActions";
import { useAuth } from "@/hooks/useAuth";
import dynamic from "next/dynamic";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

const DetailMap = dynamic(() => import("@/components/DetailMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-bg/50 flex items-center justify-center font-sans text-xs text-ink-muted animate-pulse">
      Memuat peta satelit...
    </div>
  ),
});

interface Building {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
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

interface AuditResult {
  criteria_code: string;
  category: string;
  description: string;
  short_label?: string | null;
  status: "met" | "not_met" | "unknown" | "na";
  is_disputed: boolean;
  total_runs: number;
  agree_count: number;
  audit_result_id: string | null;
  reasoning: string | null;
  evidence_url: string | null;
  source_agent: string | null;
}

interface AuditRun {
  id?: string;
  audit_run_id: string;
  building_id?: string;
  user_id: string | null;
  contributor_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  trust_score?: number | null;
  created_at: string;
  results?: AuditResult[];
  is_primary?: boolean;
  summary?: {
    met: number;
    not_met: number;
    unknown: number;
  };
}

export default function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();

  const [building, setBuilding] = useState<Building | null>(null);
  const [auditRuns, setAuditRuns] = useState<AuditRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [consensusResults, setConsensusResults] = useState<AuditResult[]>([]);
  const [loadingBuilding, setLoadingBuilding] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showAllRunsDropdown, setShowAllRunsDropdown] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [selectedResult, setSelectedResult] = useState<AuditResult | null>(null);

  // Reset photo index when selected run changes
  useEffect(() => {
    setCurrentPhotoIndex(0);
  }, [selectedRunId]);

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Fetch building info
  useEffect(() => {
    if (!id || !UUID_REGEX.test(id)) return;
    fetch(`${BACKEND_URL}/buildings/${id}`, { cache: "no-store" } as RequestInit)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return null; }
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Fetch building failed (status ${res.status}): ${errText}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data) setBuilding(data);
      })
      .catch(console.error)
      .finally(() => setLoadingBuilding(false));
  }, [id]);

  // Fetch audit runs list
  useEffect(() => {
    if (!id || !UUID_REGEX.test(id)) return;
    fetch(`${BACKEND_URL}/buildings/${id}/audit-runs`)
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Fetch runs failed (status ${res.status}): ${errText}`);
        }
        return res.json();
      })
      .then((runs: AuditRun[]) => {
        setAuditRuns(runs);
        if (runs.length > 0) {
          const primaryRun = runs.find((r) => r.is_primary) || runs[0];
          setSelectedRunId(primaryRun.audit_run_id || primaryRun.id || null);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingRuns(false));
  }, [id]);

  // Fetch consensus results (default view / no specific run selected)
  useEffect(() => {
    if (!id || !UUID_REGEX.test(id) || selectedRunId !== null) return; // only for consensus view
    fetch(`${BACKEND_URL}/buildings/${id}/consensus`)
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Fetch consensus failed (status ${res.status}): ${errText}`);
        }
        return res.json();
      })
      .then((data: AuditResult[]) => setConsensusResults(data))
      .catch(console.error);
  }, [id, selectedRunId]);

  // Fetch results for a specific audit run when user clicks a pill
  useEffect(() => {
    if (!selectedRunId || !UUID_REGEX.test(selectedRunId)) return;

    // Check if the run already has results cached
    const cachedRun = auditRuns.find((r) => r.audit_run_id === selectedRunId || r.id === selectedRunId);
    if (cachedRun?.results) return;

    setLoadingResults(true);
    fetch(`${BACKEND_URL}/audit-runs/${selectedRunId}/results`)
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Fetch run results failed (status ${res.status}): ${errText}`);
        }
        return res.json();
      })
      .then((results: AuditResult[]) => {
        setAuditRuns((prev) =>
          prev.map((r) => (r.audit_run_id === selectedRunId || r.id === selectedRunId ? { ...r, results } : r))
        );
      })
      .catch(console.error)
      .finally(() => setLoadingResults(false));
  }, [selectedRunId, auditRuns, id]);

  // Determine displayed results
  const selectedRun = auditRuns.find((r) => r.audit_run_id === selectedRunId || r.id === selectedRunId);
  const displayedResults: AuditResult[] =
    selectedRun?.results ?? consensusResults;

  // Compliance stats
  const totalCount = displayedResults.length;
  const metCount = displayedResults.filter((r) => r.status === "met").length;
  const notMetCount = displayedResults.filter((r) => r.status === "not_met").length;
  const unknownCount = displayedResults.filter((r) => r.status === "unknown").length;
  const naCount = displayedResults.filter((r) => r.status === "na").length;

  const hasVisualAgent = displayedResults.some(
    (r) => r.source_agent === "visual_agent" && r.status !== "unknown"
  );

  if (loadingBuilding) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  if (notFound || !building) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h1 className="font-display text-3xl font-medium text-ink mb-4">
            Gedung Tidak Ditemukan
          </h1>
          <p className="font-sans text-sm text-ink-muted mb-8 max-w-sm">
            Gedung publik dengan ID tersebut tidak terdaftar di database kami atau telah dihapus.
          </p>
          <Link
            href="/buildings"
            className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all cursor-pointer"
          >
            Kembali ke Daftar Gedung
          </Link>
        </main>
      </div>
    );
  }

  const statusSummary = building.status_summary || "active";
  const computedComplianceScore = displayedResults.length > 0
    ? (() => {
        const evaluable = displayedResults.length - displayedResults.filter((r) => r.status === "na").length;
        const met = displayedResults.filter((r) => r.status === "met").length;
        return evaluable > 0 ? Math.round((met / evaluable) * 100) : "N/A";
      })()
    : null;
  const complianceScore = computedComplianceScore !== null
    ? computedComplianceScore
    : (building.compliance_score !== undefined ? building.compliance_score : null);

  const buildingCoords: [number, number] = building.latitude !== null && building.longitude !== null
    ? [building.latitude, building.longitude]
    : [-6.2088, 106.8456];

  // Extract photos for the carousel from the current run results
  const evidencePhotos = Array.from(
    new Set(
      displayedResults
        .map((r) => r.evidence_url)
        .filter((url): url is string => !!url)
    )
  );

  // Sort criteria results by code
  const sortedResults = [...displayedResults].sort((a, b) =>
    a.criteria_code.localeCompare(b.criteria_code)
  );

  const statusMap = {
    met: {
      label: "Terpenuhi",
      colorClass: "bg-status-met/10 text-status-met border-status-met/20",
    },
    not_met: {
      label: "Tidak Terpenuhi",
      colorClass: "bg-status-not-met/10 text-status-not-met border-status-not-met/20",
    },
    unknown: {
      label: "Tidak Diketahui",
      colorClass: "bg-status-unknown/10 text-status-unknown border-status-unknown/20",
    },
    na: {
      label: "Tidak Relevan",
      colorClass: "bg-status-na/10 text-status-na border-status-na/20",
    },
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-6 max-w-4xl mx-auto w-full space-y-4">
        
        {/* One Single Cohesive Header Container Card */}
        <div className="bg-surface border border-line rounded-lg p-5 sm:p-6 space-y-4">
          {/* Row 1: Back Link (left) & Actions Toolbar (right) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
            <Link
              href="/buildings"
              className="inline-flex items-center text-xs font-sans text-ink-muted hover:text-accent transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"></path>
              </svg>
              Kembali ke Daftar Gedung
            </Link>

            {/* Actions Toolbar (Vote + Report + 360 Tour Button) */}
            <div className="flex items-center gap-4 flex-wrap">
              <BuildingDetailActions buildingId={building.id} />

              <Link
                href={`/buildings/${building.id}/tour`}
                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all w-fit cursor-pointer"
              >
                Lihat Tur 360°
              </Link>
            </div>
          </div>

          {/* Row 2: Building Title */}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-ink leading-tight">
              {building.name}
            </h1>
            {statusSummary === "review" && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-sans font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-600 border border-amber-500/20 gap-1 shadow-xs">
                <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Dalam Peninjauan
              </span>
            )}
            {statusSummary === "no_audit" && (
              <span className="px-2.5 py-1 bg-status-unknown/10 text-status-unknown border border-status-unknown/20 rounded-md text-[10px] font-sans font-medium whitespace-nowrap">
                Menunggu Audit Pertama
              </span>
            )}
          </div>

          {/* Row 3: Address & Contributor Switcher */}
          <div className="space-y-1">
            <p className="font-sans text-sm text-ink-muted leading-relaxed">
              {building.address || "Alamat belum ditambahkan."}
            </p>

            {/* Contributor switcher */}
            {!loadingRuns && auditRuns.length > 0 && selectedRun && (
              <div className="relative inline-block text-xs font-sans text-ink-muted mt-1">
                <span>
                  Dilihat: Audit oleh{" "}
                  <span className="font-semibold text-ink">
                    {selectedRun.contributor_name || "Anonim"}
                  </span>{" "}
                  ({new Date(selectedRun.created_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })})
                </span>

                {auditRuns.length > 1 && (
                  <div className="inline-block ml-2 relative">
                    <button
                      onClick={() => setShowAllRunsDropdown(!showAllRunsDropdown)}
                      className="text-accent hover:underline font-semibold focus:outline-none cursor-pointer"
                    >
                      Lihat {auditRuns.length - 1} audit lainnya
                    </button>

                    {showAllRunsDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowAllRunsDropdown(false)}
                        />
                        <div className="absolute left-0 mt-1 w-64 bg-surface border border-line rounded-md shadow-lg py-1 z-50">
                          {auditRuns
                            .filter((r) => r.audit_run_id !== selectedRunId && r.id !== selectedRunId)
                            .map((run) => {
                              const label = run.contributor_name || "Anonim";
                              return (
                                <button
                                  key={run.id || run.audit_run_id}
                                  onClick={() => {
                                    setSelectedRunId(run.id || run.audit_run_id);
                                    setShowAllRunsDropdown(false);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs font-sans text-ink hover:bg-bg hover:text-accent transition-colors block cursor-pointer"
                                >
                                  <div className="font-medium flex justify-between items-center">
                                    <span>{label}</span>
                                    {run.is_primary && (
                                      <span className="bg-accent/10 text-accent text-[9px] font-semibold px-1.5 py-0.5 rounded">
                                        Utama
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-ink-muted mt-0.5">
                                    {new Date(run.created_at).toLocaleDateString("id-ID", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                  {run.summary && (
                                    <div className="flex gap-2 text-[9px] text-ink-muted mt-1">
                                      <span className="text-status-met">Met: {run.summary.met}</span>
                                      <span className="text-status-not-met">Not Met: {run.summary.not_met}</span>
                                      <span className="text-status-unknown">Unknown: {run.summary.unknown}</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Edit button for current run if owned by logged-in user */}
                {user?.id && selectedRun.user_id === user.id && (
                  <Link
                    href={`/buildings/${id}/edit-audit/${selectedRunId}`}
                    className="ml-2 inline-flex items-center px-2 py-0.5 text-[10px] font-sans font-semibold rounded border border-line text-ink-muted hover:border-accent hover:text-accent transition-all bg-surface"
                    title="Edit audit run milik Anda"
                  >
                    Edit Audit
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-line/45"></div>

          {/* Main Card Content: Left Column (Score, Disclaimer) & Right Column (Map, Photos) */}
          <div className="flex flex-col md:flex-row gap-6 items-start">
            
            {/* Left Column: Score and Disclaimer */}
            <div className="flex-1 space-y-4 min-w-0 w-full">
              
              {/* Compliance Score & Breakdown */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-6 pt-1">
                {statusSummary !== "no_audit" && (
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl md:text-5xl font-extrabold text-accent leading-none">
                      {complianceScore !== null ? `${complianceScore}%` : "N/A"}
                    </span>
                    <span className="text-xs font-sans text-ink-muted">Kepatuhan</span>

                    {/* Tooltip Disclaimer */}
                    <div className="group relative cursor-pointer inline-flex items-center select-none self-start mt-0.5 ml-1">
                      <span className="w-3.5 h-3.5 rounded-full border border-ink-muted/50 text-ink-muted group-hover:border-accent group-hover:text-accent flex items-center justify-center text-[9px] font-sans font-bold leading-none transition-colors">
                        i
                      </span>
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 bg-surface border border-line p-3 rounded-md shadow-lg text-[10px] leading-relaxed font-sans font-normal text-ink z-50">
                        Hasil ini dihasilkan otomatis oleh AI dari foto yang diunggah. Mungkin tidak 100% akurat — untuk kebutuhan penting, disarankan konfirmasi langsung ke pengelola gedung.
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats Breakdown */}
                <div className="flex items-center gap-x-4 text-center sm:text-left flex-wrap">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-sans font-semibold text-ink-muted uppercase tracking-wider">Terpenuhi</span>
                    <span className="font-display text-lg font-bold" style={{ color: "var(--color-status-met)" }}>{metCount}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-sans font-semibold text-ink-muted uppercase tracking-wider">Gagal</span>
                    <span className="font-display text-lg font-bold" style={{ color: "var(--color-status-not-met)" }}>{notMetCount}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-sans font-semibold text-ink-muted uppercase tracking-wider">Unknown</span>
                    <span className="font-display text-lg font-bold" style={{ color: "var(--color-status-unknown)" }}>{unknownCount}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-sans font-semibold text-ink-muted uppercase tracking-wider">N/A</span>
                    <span className="font-display text-lg font-bold" style={{ color: "var(--color-status-na)" }}>{naCount}</span>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              {!hasVisualAgent && statusSummary !== "no_audit" && (
                <p className="font-sans text-xs text-ink-muted leading-relaxed max-w-xl">
                  * Audit ini baru berdasarkan analisis teks nama/alamat gedung, belum ada foto yang dianalisis. Hasil akan lebih akurat setelah foto bukti fisik diunggah.
                </p>
              )}
            </div>

            {/* Right Column: Map and Photos Carousel stacked */}
            <div className="w-full md:w-[320px] flex flex-col gap-4 flex-shrink-0">
              
              {/* Satellite Map Thumbnail */}
              <div className="w-full h-[200px] rounded-md border border-line overflow-hidden z-0 relative">
                <DetailMap center={buildingCoords} buildingName={building.name} />
              </div>

              {/* Photo Evidence Carousel (only rendered if photos exist) */}
              {evidencePhotos.length > 0 && (
                <div className="relative w-full h-[180px] rounded-md overflow-hidden border border-line bg-bg/20 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={evidencePhotos[currentPhotoIndex]}
                    alt="Bukti Audit"
                    className="w-full h-full object-cover"
                  />
                  {evidencePhotos.length > 1 && (
                    <div className="absolute inset-x-0 bottom-2 flex items-center justify-between px-2">
                      <button
                        onClick={() => setCurrentPhotoIndex((prev) => (prev === 0 ? evidencePhotos.length - 1 : prev - 1))}
                        className="w-5 h-5 rounded-full bg-surface/90 border border-line flex items-center justify-center hover:bg-surface text-ink hover:text-accent transition-colors focus:outline-none cursor-pointer shadow-xs font-mono text-[9px] font-bold"
                      >
                        &lt;
                      </button>
                      <button
                        onClick={() => setCurrentPhotoIndex((prev) => (prev === evidencePhotos.length - 1 ? 0 : prev + 1))}
                        className="w-5 h-5 rounded-full bg-surface/90 border border-line flex items-center justify-center hover:bg-surface text-ink hover:text-accent transition-colors focus:outline-none cursor-pointer shadow-xs font-mono text-[9px] font-bold"
                      >
                        &gt;
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Audit Results Section heading */}
        <div className="space-y-1 mt-[24px]!" style={{ marginTop: "24px" }}>
          <h3 className="font-display text-xl font-normal text-ink mb-1">
            Kutipan Hasil Audit Kriteria
          </h3>
          <p className="font-display italic text-xs text-ink-muted">
            Klik kartu untuk melihat detail analisis.
          </p>
        </div>

        {/* Loading state for run results */}
        {loadingResults && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
          </div>
        )}

        {/* Main criteria results - Reusing original AuditResultsList component */}
        {!loadingResults && (
          displayedResults.length === 0 ? (
            <div className="bg-surface border border-line rounded-md p-10 text-center">
              <p className="font-display italic text-lg text-ink-muted mb-2">
                &quot;Belum ada kriteria yang diaudit untuk gedung ini.&quot;
              </p>
              <p className="font-sans text-xs text-ink-muted">
                Jalankan program audit untuk mengisi daftar kriteria aksesibilitas.
              </p>
            </div>
          ) : (
            <AuditResultsList auditResults={displayedResults} />
          )
        )}
      </main>
    </div>
  );
}
