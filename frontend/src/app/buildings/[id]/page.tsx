import Navbar from "@/components/Navbar";
import AuditResultsList from "@/components/AuditResultsList";
import Link from "next/link";
import TrustBadge from "@/components/TrustBadge";
import BuildingDetailActions from "@/components/BuildingDetailActions";

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

async function fetchBuildingDetails(id: string): Promise<Building | null> {
  try {
    const res = await fetch(`http://localhost:8000/buildings/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Failed to fetch building details");
    }
    return await res.json();
  } catch (error) {
    console.error("Error fetching building:", error);
    return null;
  }
}

async function fetchAuditResults(id: string): Promise<AuditResult[]> {
  try {
    const res = await fetch(`http://localhost:8000/buildings/${id}/consensus`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Failed to fetch audit results");
    }
    return await res.json();
  } catch (error) {
    console.error("Error fetching audit results:", error);
    return [];
  }
}

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch data in parallel
  const [building, auditResults] = await Promise.all([
    fetchBuildingDetails(id),
    fetchAuditResults(id),
  ]);

  if (!building) {
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

  // Calculate compliance stats
  const totalCount = auditResults.length;
  const metCount = auditResults.filter((r) => r.status === "met").length;
  const notMetCount = auditResults.filter((r) => r.status === "not_met").length;
  const unknownCount = auditResults.filter((r) => r.status === "unknown").length;
  const naCount = auditResults.filter((r) => r.status === "na").length;

  const hasVisualAgent = auditResults.some(
    (r) => r.source_agent === "visual_agent" && r.status !== "unknown"
  );

  const statusSummary = building.status_summary || "active";
  const complianceScore = building.compliance_score !== undefined ? building.compliance_score : null;

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

        {/* Audit Results Heading & Italic Caption Accent */}
        <div className="mb-6">
          <h3 className="font-display text-xl font-normal text-ink mb-1">
            Kutipan Hasil Audit Kriteria
          </h3>
          <p className="font-display italic text-xs text-ink-muted">
            Daftar kriteria evaluasi fisik gedung berdasarkan standar nasional, klik untuk meninjau detail analisis.
          </p>
        </div>

        {/* Main interactive cards list */}
        {auditResults.length === 0 ? (
          <div className="bg-surface border border-line rounded-md p-10 text-center">
            <p className="font-display italic text-lg text-ink-muted mb-2">
              "Belum ada kriteria yang diaudit untuk gedung ini."
            </p>
            <p className="font-sans text-xs text-ink-muted">
              Jalankan program audit untuk mengisi daftar kriteria aksesibilitas.
            </p>
          </div>
        ) : (
          <AuditResultsList auditResults={auditResults} />
        )}
      </main>
    </div>
  );
}
