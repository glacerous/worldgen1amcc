"use client";

import { useState, useEffect, use } from "react";
import Navbar from "@/components/Navbar";
import AuditResultsList from "@/components/AuditResultsList";
import Link from "next/link";
import BuildingDetailActions from "@/components/BuildingDetailActions";
import { useAuth } from "@/hooks/useAuth";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

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
  id: string;
  building_id: string;
  user_id: string | null;
  contributor_name: string | null;
  trust_score: number | null;
  created_at: string;
  results?: AuditResult[];
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

  // Fetch building info
  useEffect(() => {
    fetch(`${BACKEND_URL}/buildings/${id}`, { cache: "no-store" } as RequestInit)
      .then((res) => {
        if (res.status === 404) { setNotFound(true); return null; }
        if (!res.ok) throw new Error("Fetch building failed");
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
    fetch(`${BACKEND_URL}/audit/runs/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Fetch runs failed");
        return res.json();
      })
      .then((runs: AuditRun[]) => {
        setAuditRuns(runs);
        if (runs.length > 0) {
          setSelectedRunId(runs[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingRuns(false));
  }, [id]);

  // Fetch consensus results (default view / no specific run selected)
  useEffect(() => {
    if (selectedRunId !== null) return; // only for consensus view
    fetch(`${BACKEND_URL}/buildings/${id}/consensus`)
      .then((res) => {
        if (!res.ok) throw new Error("Fetch consensus failed");
        return res.json();
      })
      .then((data: AuditResult[]) => setConsensusResults(data))
      .catch(console.error);
  }, [id, selectedRunId]);

  // Fetch results for a specific audit run when user clicks a pill
  useEffect(() => {
    if (!selectedRunId) return;

    // Check if the run already has results cached
    const cachedRun = auditRuns.find((r) => r.id === selectedRunId);
    if (cachedRun?.results) return;

    setLoadingResults(true);
    fetch(`${BACKEND_URL}/audit/runs/${selectedRunId}/results`)
      .then((res) => {
        if (!res.ok) throw new Error("Fetch run results failed");
        return res.json();
      })
      .then((results: AuditResult[]) => {
        setAuditRuns((prev) =>
          prev.map((r) => (r.id === selectedRunId ? { ...r, results } : r))
        );
      })
      .catch(console.error)
      .finally(() => setLoadingResults(false));
  }, [selectedRunId, auditRuns, id]);

  // Determine displayed results
  const selectedRun = auditRuns.find((r) => r.id === selectedRunId);
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
  const complianceScore =
    building.compliance_score !== undefined ? building.compliance_score : null;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-12 md:py-16 max-w-4xl mx-auto w-full">
        {/* Consolidated Header Container */}
        <div className="bg-surface border border-line rounded-lg p-6 sm:p-8 mb-8 space-y-6">
          {/* Navigation & Actions Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <Link
              href="/buildings"
              className="inline-flex items-center text-xs font-sans text-ink-muted hover:text-accent transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"></path>
              </svg>
              Kembali ke Daftar Gedung
            </Link>

            {/* Inline actions (Vote & Tour) */}
            <div className="flex flex-wrap items-center gap-4">
              <BuildingDetailActions buildingId={building.id} />

              <Link
                href={`/buildings/${building.id}/tour`}
                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all w-fit cursor-pointer"
              >
                Lihat Tur 360°
              </Link>
            </div>
          </div>

          <div className="border-t border-line/45"></div>

          {/* Building Details, Score, and Breakdown */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-3xl md:text-4xl font-bold text-ink leading-tight">
                  {building.name}
                </h1>

                {/* Status Badge */}
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
              <p className="font-sans text-sm text-ink-muted leading-relaxed truncate">
                {building.address || "Alamat belum ditambahkan."}
              </p>
            </div>

            {/* Score & Breakdown Row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 flex-shrink-0 md:justify-end">
              {statusSummary === "active" && (
                <div className="flex flex-col items-start sm:items-end gap-1">
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-5xl md:text-6xl font-extrabold text-accent leading-none">
                      {complianceScore !== null ? `${complianceScore}%` : "N/A"}
                    </span>

                    {/* Tooltip Disclaimer */}
                    <div className="group relative cursor-pointer inline-flex items-center text-ink-muted hover:text-accent select-none self-start mt-0.5">
                      <span className="text-[11px] font-bold font-sans">ⓘ</span>
                      <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 bg-surface border border-line p-3 rounded-md shadow-lg text-[10px] leading-relaxed font-sans font-normal text-ink z-50">
                        Hasil ini dihasilkan otomatis oleh AI dari foto yang diunggah. Mungkin tidak 100% akurat — untuk kebutuhan penting, disarankan konfirmasi langsung ke pengelola gedung.
                      </div>
                    </div>
                  </div>

                  <span className="text-[9px] font-sans text-ink-muted font-medium whitespace-nowrap">
                    Hasil dianalisis otomatis oleh AI
                  </span>
                </div>
              )}

              {/* Decorative separator */}
              {statusSummary === "active" && <div className="hidden sm:block w-px h-10 bg-line/60"></div>}

              {/* Stats Breakdown */}
              <div className="flex items-center gap-x-4 text-center sm:text-left">
                <div className="flex flex-col">
                  <span className="text-[9px] font-sans font-semibold text-ink-muted uppercase tracking-wider">Terpenuhi</span>
                  <span className="font-display text-lg font-bold text-status-met">{metCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-sans font-semibold text-ink-muted uppercase tracking-wider">Gagal</span>
                  <span className="font-display text-lg font-bold text-status-not-met">{notMetCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-sans font-semibold text-ink-muted uppercase tracking-wider">Unknown</span>
                  <span className="font-display text-lg font-bold text-status-unknown">{unknownCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-sans font-semibold text-ink-muted uppercase tracking-wider">N/A</span>
                  <span className="font-display text-lg font-bold text-status-na">{naCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Informatif Banner if no visual agent results */}
        {!hasVisualAgent && (
          <div className="bg-surface border-l-4 border-status-unknown border-t border-r border-b border-line/40 rounded-r-md p-4 mb-10 flex items-start space-x-3">
            <svg className="w-5 h-5 text-status-unknown flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p className="font-sans text-xs text-ink-muted leading-relaxed">
              Audit ini baru berdasarkan analisis teks nama dan alamat gedung, belum ada foto yang dianalisis. Hasil akan lebih akurat setelah foto diunggah.
            </p>
          </div>
        )}

        {/* ── Multi-Audit Run Selector ── */}
        {!loadingRuns && auditRuns.length > 0 && (
          <div className="mb-6 bg-surface border border-line rounded-md px-5 py-4">
            <p className="font-sans text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-3">
              Audit oleh:
            </p>
            <div className="flex flex-wrap gap-2">
              {auditRuns.map((run) => {
                const isSelected = run.id === selectedRunId;
                const label =
                  run.contributor_name ||
                  (run.user_id ? `Kontributor #${run.user_id.slice(0, 6)}` : "Anonim");
                const isOwner = user?.id && run.user_id === user.id;

                return (
                  <div key={run.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedRunId(run.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-sans font-medium border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-accent text-white border-accent shadow-sm"
                          : "bg-bg text-ink-muted border-line hover:border-accent/50 hover:text-ink"
                      }`}
                    >
                      {run.trust_score !== null && (
                        <span className={`text-[10px] font-semibold ${isSelected ? "text-white/80" : "text-accent"}`}>
                          {Math.round(run.trust_score * 100)}%
                        </span>
                      )}
                      {label}
                    </button>

                    {/* Edit button for logged-in user's own run */}
                    {isOwner && (
                      <Link
                        href={`/buildings/${id}/edit-audit/${run.id}`}
                        className="inline-flex items-center px-2 py-1 text-[10px] font-sans font-semibold rounded-md border border-line text-ink-muted hover:border-accent hover:text-accent transition-all bg-surface"
                        title="Edit audit run milik Anda"
                      >
                        Edit
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Audit Results Heading & Italic Caption Accent */}
        <div className="mb-6">
          <h3 className="font-display text-xl font-normal text-ink mb-1">
            Kutipan Hasil Audit Kriteria
          </h3>
          <p className="font-display italic text-xs text-ink-muted">
            Daftar kriteria evaluasi fisik gedung berdasarkan standar nasional, klik untuk meninjau detail analisis.
          </p>
        </div>

        {/* Loading state for run results */}
        {loadingResults && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
          </div>
        )}

        {/* Main interactive cards list */}
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
