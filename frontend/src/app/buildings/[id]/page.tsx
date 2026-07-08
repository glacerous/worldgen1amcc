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
    <div className="w-screen h-screen relative overflow-hidden flex flex-col bg-bg">
      <Navbar />

      {/* Full-bleed Satellite Map in background */}
      <div className="absolute inset-0 z-0">
        <DetailMap center={buildingCoords} buildingName={building.name} />
      </div>

      {/* Floating Panel Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-10 w-full max-w-4xl mx-auto h-[78%] md:h-[55%] bg-surface border-t border-line rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.04)] flex flex-col">
        
        {/* Floating Close Button in Top-Right of Bottom Sheet */}
        <Link
          href="/buildings"
          className="absolute top-4 right-4 z-50 w-8 h-8 rounded-full bg-surface border border-line flex items-center justify-center hover:bg-bg transition-colors shadow-xs group cursor-pointer"
          title="Kembali ke Daftar Gedung"
        >
          <svg className="w-4 h-4 text-ink-muted group-hover:text-accent" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </Link>

        {/* Scrollable sheet container */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 scrollbar-none">
          
          {/* Header block with Details & Carousel */}
          <div className="flex flex-col md:flex-row justify-between gap-6 items-start">
            <div className="flex-1 space-y-2 pr-10">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-2xl md:text-3xl font-bold text-ink leading-tight">
                  {building.name}
                </h1>
                {statusSummary === "review" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 text-[10px] font-sans font-semibold border border-amber-500/20 gap-1">
                    <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Dalam Peninjauan
                  </span>
                )}
                {statusSummary === "no_audit" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-status-unknown/10 text-status-unknown text-[10px] font-sans font-semibold border border-status-unknown/20">
                    Belum Diaudit
                  </span>
                )}
              </div>

              <p className="font-sans text-xs text-ink-muted leading-relaxed">
                {building.address || "Alamat belum ditambahkan."}
              </p>

              {/* Compliance score metric */}
              {statusSummary !== "no_audit" && (
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="font-display text-xl font-bold text-accent">
                    {complianceScore !== null && complianceScore !== "N/A" ? `${complianceScore}% Kepatuhan` : "Skor N/A"}
                  </span>
                  <span className="text-[11px] font-sans text-ink-muted">
                    ({metCount} Terpenuhi • {notMetCount} Gagal)
                  </span>
                </div>
              )}

              {/* Contributor dropdown switcher */}
              {!loadingRuns && auditRuns.length > 0 && selectedRun && (
                <div className="relative inline-block text-[11px] font-sans text-ink-muted mt-2">
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

            {/* Photo Evidence Carousel */}
            {evidencePhotos.length > 0 && (
              <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-xl overflow-hidden border border-line flex-shrink-0 bg-bg/20 shadow-xs">
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

          {/* Audit Banner */}
          {!hasVisualAgent && statusSummary !== "no_audit" && (
            <div className="bg-bg/40 border border-line rounded-lg p-3 flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-status-unknown flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <p className="font-sans text-[11px] text-ink-muted leading-relaxed">
                Audit ini baru berdasarkan analisis teks nama/alamat gedung, belum ada foto yang dianalisis. Hasil akan lebih akurat setelah foto bukti fisik diunggah.
              </p>
            </div>
          )}

          {/* Main results list - Compact grid of criteria */}
          <div className="space-y-3">
            <h3 className="font-display text-base font-semibold text-ink">
              Kutipan Hasil Audit Kriteria
            </h3>

            {loadingResults && (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
              </div>
            )}

            {!loadingResults && (
              sortedResults.length === 0 ? (
                <div className="border border-line border-dashed rounded-lg p-6 text-center bg-bg/5">
                  <p className="font-sans text-xs text-ink-muted">
                    Belum ada kriteria yang diaudit untuk gedung ini.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sortedResults.map((result) => {
                    return (
                      <div
                        key={result.criteria_code}
                        className="flex items-center justify-between p-3 border border-line rounded-lg bg-surface hover:border-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Status Icon */}
                          {result.status === "met" && (
                            <svg className="w-4 h-4 text-status-met flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {result.status === "not_met" && (
                            <svg className="w-4 h-4 text-status-not-met flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          {result.status === "unknown" && (
                            <svg className="w-4 h-4 text-status-unknown flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          {result.status === "na" && (
                            <span className="w-4 h-4 flex items-center justify-center text-status-na font-sans font-bold text-xs flex-shrink-0">—</span>
                          )}
                          
                          <div className="flex flex-col min-w-0">
                            <span className="font-mono text-xs text-ink font-semibold tracking-wider leading-none">
                              {result.criteria_code}
                            </span>
                            <span className="font-sans text-[10px] text-ink-muted truncate max-w-[150px] md:max-w-[220px] mt-0.5">
                              {result.description}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedResult(result)}
                          className="inline-flex items-center justify-center bg-bg hover:bg-line/25 border border-line text-[10px] font-sans font-semibold px-2.5 py-1 rounded text-ink hover:text-accent transition-all cursor-pointer"
                        >
                          Info
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Footer Actions block */}
          <div className="pt-5 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link
              href={`/buildings/${building.id}/tour`}
              className="w-full sm:w-auto inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md border border-accent/25 transition-all cursor-pointer"
            >
              Lihat Tur 360°
            </Link>

            <div className="flex items-center border border-line bg-bg/10 rounded-md px-3 py-1.5 w-full sm:w-auto justify-center sm:justify-start">
              <BuildingDetailActions buildingId={building.id} />
            </div>
          </div>

        </div>
      </div>

      {/* Detail Modal Overlay */}
      {selectedResult && (() => {
        const statusConfig = statusMap[selectedResult.status] || statusMap.unknown;
        return (
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-opacity">
            <div 
              className="bg-surface border border-line rounded-md p-6 max-w-lg w-full shadow-lg flex flex-col max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-line/60 mb-5">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-sm text-ink-muted tracking-wider">
                    {selectedResult.criteria_code}
                  </span>
                  <span className={`px-2.5 py-0.5 border rounded-md text-[10px] font-sans font-semibold uppercase tracking-wider ${statusConfig.colorClass}`}>
                    {statusConfig.label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="text-ink-muted hover:text-ink font-sans text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  Tutup
                </button>
              </div>

              {/* Criteria Description */}
              <p className="font-display text-lg text-ink leading-relaxed mb-6">
                "{selectedResult.description}"
              </p>

              {/* Evaluation Details */}
              <div className="space-y-4 font-sans text-sm">
                <div>
                  <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
                    Analisis Penalaran AI
                  </h4>
                  <p className="text-ink leading-relaxed bg-bg/40 p-4 rounded-md border border-line/30 text-[12px]">
                    {selectedResult.reasoning || "Tidak ada penalaran yang dicatat."}
                  </p>
                </div>

                <div className="flex justify-between items-center text-xs border-b border-line/30 pb-2">
                  <span className="text-ink-muted">Agen Pengevaluasi:</span>
                  <span className="font-mono font-semibold text-accent">{selectedResult.source_agent || "N/A"}</span>
                </div>

                {/* Evidence Image */}
                {selectedResult.evidence_url && (
                  <div className="pt-2">
                    <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                      Bukti Foto (Visual)
                    </h4>
                    <div className="relative border border-line rounded-md overflow-hidden bg-bg/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedResult.evidence_url}
                        alt={`Evidence for ${selectedResult.criteria_code}`}
                        className="w-full h-auto object-cover max-h-64"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Close Button at bottom */}
              <button
                onClick={() => setSelectedResult(null)}
                className="mt-8 bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2 rounded-md transition-all ml-auto cursor-pointer"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
