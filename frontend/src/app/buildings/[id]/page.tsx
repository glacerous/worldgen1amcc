import Navbar from "@/components/Navbar";
import AuditResultsList from "@/components/AuditResultsList";
import Link from "next/link";

interface Building {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
}

interface AuditResult {
  id: string;
  building_id: string;
  criteria_id: string;
  status: "met" | "not_met" | "unknown" | "na";
  source_agent: string;
  evidence_url: string | null;
  reasoning: string;
  audit_criteria: {
    code: string;
    description: string;
    category: string;
  };
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
    const res = await fetch(`http://localhost:8000/audit/results/${id}`, {
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

  const evaluableCount = totalCount - naCount;
  const complianceScore =
    totalCount > 0 && evaluableCount > 0
      ? Math.round((metCount / evaluableCount) * 100)
      : null;

  const hasVisualAgent = auditResults.some(
    (r) => r.source_agent === "visual_agent" && r.status !== "unknown"
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />
      
      <main className="flex-1 px-6 py-12 md:py-16 max-w-4xl mx-auto w-full">
        {/* Header Section */}
        <div className="mb-8">
          <Link
            href="/buildings"
            className="inline-flex items-center text-xs font-sans text-ink-muted hover:text-accent transition-colors mb-4"
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"></path>
            </svg>
            Kembali ke Daftar Gedung
          </Link>
          <h1 className="font-display text-3xl md:text-5xl font-normal text-ink leading-tight">
            {building.name}
          </h1>
          <p className="font-sans text-sm text-ink-muted mt-2">
            {building.address || "Alamat belum ditambahkan."}
          </p>
        </div>

        {/* Summary Bar Component */}
        <div className="bg-surface border border-line rounded-md p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            {/* compliance score rendering */}
            <div>
              <span className="block text-[11px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Kepatuhan Audit
              </span>
              <div className="flex items-baseline gap-1">
                {complianceScore !== null ? (
                  <>
                    <span className="font-display text-4xl md:text-5xl font-bold text-accent">
                      {complianceScore}%
                    </span>
                  </>
                ) : (
                  <span className="font-display text-2xl font-bold text-ink-muted">
                    Belum Audit
                  </span>
                )}
              </div>
            </div>
            
            {/* Decorative hairline vertical divider */}
            <div className="hidden md:block w-px h-12 bg-line"></div>
          </div>

          {/* Breakdown Section */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-8 text-center md:text-left flex-1 md:justify-end">
            <div className="border border-line/40 md:border-transparent p-2.5 md:p-0 rounded-md bg-bg/20 md:bg-transparent">
              <span className="block text-[10px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Terpenuhi
              </span>
              <span className="font-display text-2xl font-semibold text-status-met">
                {metCount}
              </span>
            </div>
            <div className="border border-line/40 md:border-transparent p-2.5 md:p-0 rounded-md bg-bg/20 md:bg-transparent">
              <span className="block text-[10px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Gagal
              </span>
              <span className="font-display text-2xl font-semibold text-status-not-met">
                {notMetCount}
              </span>
            </div>
            <div className="border border-line/40 md:border-transparent p-2.5 md:p-0 rounded-md bg-bg/20 md:bg-transparent">
              <span className="block text-[10px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Unknown
              </span>
              <span className="font-display text-2xl font-semibold text-status-unknown">
                {unknownCount}
              </span>
            </div>
            <div className="border border-line/40 md:border-transparent p-2.5 md:p-0 rounded-md bg-bg/20 md:bg-transparent">
              <span className="block text-[10px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1">
                N/A
              </span>
              <span className="font-display text-2xl font-semibold text-status-na">
                {naCount}
              </span>
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
