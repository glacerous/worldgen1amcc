"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";

interface Building {
  id: string;
  name: string;
  address: string | null;
  verified: boolean;
}

interface Report {
  id: string;
  audit_result_id: string;
  reason: string | null;
  status: "open" | "resolved";
  created_at: string;
  audit_results: {
    id: string;
    status: "met" | "not_met" | "unknown" | "na";
    buildings: {
      id: string;
      name: string;
      address: string | null;
    } | null;
    audit_criteria: {
      code: string;
      description: string;
      category: string;
    } | null;
  } | null;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  
  // Dashboard state
  const [activeTab, setActiveTab] = useState<"reports" | "disputed">("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [disputedBuildings, setDisputedBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Action state
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Authenticate and fetch initial data
  useEffect(() => {
    const sessionToken = sessionStorage.getItem("admin_token");
    if (!sessionToken) {
      router.push("/login");
      return;
    }
    setToken(sessionToken);
    fetchData(sessionToken);
  }, [router]);

  const fetchData = async (sessionToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = {
        Authorization: `Bearer ${sessionToken}`,
      };

      // Fetch reports and disputed buildings in parallel
      const [reportsRes, disputedRes] = await Promise.all([
        fetch("http://localhost:8000/admin/reports", { headers, cache: "no-store" }),
        fetch("http://localhost:8000/admin/disputed", { headers, cache: "no-store" }),
      ]);

      if (!reportsRes.ok || !disputedRes.ok) {
        if (reportsRes.status === 401 || disputedRes.status === 401) {
          sessionStorage.removeItem("admin_token");
          router.push("/login");
          return;
        }
        throw new Error("Gagal mengambil data administrasi.");
      }

      const reportsData = await reportsRes.json();
      const disputedData = await disputedRes.json();

      setReports(reportsData);
      setDisputedBuildings(disputedData);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat memuat data.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveReport = async (reportId: string) => {
    if (!token) return;
    setResolvingId(reportId);

    try {
      const res = await fetch(`http://localhost:8000/admin/reports/${reportId}/resolve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Gagal menyelesaikan laporan.");
      }

      // Re-fetch data to reflect changes
      await fetchData(token);
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat memperbarui laporan.");
    } finally {
      setResolvingId(null);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_token");
    router.push("/login");
  };

  // Filter open reports
  const openReports = reports.filter((r) => r.status === "open");
  const resolvedReports = reports.filter((r) => r.status === "resolved");

  const statusLabels: Record<string, string> = {
    met: "Terpenuhi",
    not_met: "Tidak Terpenuhi",
    unknown: "Tidak Diketahui",
    na: "Tidak Relevan",
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-12 md:py-16 max-w-4xl mx-auto w-full">
        {/* Admin Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-6 mb-8 gap-4">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-normal text-ink">
              Dashboard Panel Admin
            </h1>
            <p className="font-sans text-xs text-ink-muted mt-1">
              Pantau laporan kontradiktif dari audit otomatis AI dan tinjau aduan komunitas.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start sm:self-center border border-line bg-surface hover:bg-bg/40 text-ink hover:text-accent font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
          >
            Keluar
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-status-not-met/10 border border-status-not-met/20 rounded-md text-xs text-status-not-met font-sans font-medium">
            {error}
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex border-b border-line mb-8">
          <button
            onClick={() => setActiveTab("reports")}
            className={`font-sans text-sm font-semibold pb-3 px-4 -mb-px transition-colors cursor-pointer border-b-2 ${
              activeTab === "reports"
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Laporan Masuk ({openReports.length})
          </button>
          <button
            onClick={() => setActiveTab("disputed")}
            className={`font-sans text-sm font-semibold pb-3 px-4 -mb-px transition-colors cursor-pointer border-b-2 ${
              activeTab === "disputed"
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Hasil Beragam ({disputedBuildings.length})
          </button>
        </div>

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="py-20 text-center font-sans text-xs text-ink-muted animate-pulse">
            Memuat data administrasi...
          </div>
        ) : (
          <>
            {/* Tab content 1: Reports List */}
            {activeTab === "reports" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl font-normal text-ink">
                    Laporan Kriteria dari Komunitas ({openReports.length})
                  </h3>
                </div>

                {openReports.length === 0 ? (
                  <div className="bg-surface border border-line rounded-md p-10 text-center">
                    <p className="font-display italic text-lg text-ink-muted mb-1">
                      "Semua laporan telah diselesaikan."
                    </p>
                    <p className="font-sans text-xs text-ink-muted">
                      Tidak ada laporan baru yang belum ditinjau saat ini.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {openReports.map((report) => {
                      const buildName = report.audit_results?.buildings?.name || "Gedung Tidak Diketahui";
                      const buildId = report.audit_results?.buildings?.id;
                      const critCode = report.audit_results?.audit_criteria?.code || "N/A";
                      const critDesc = report.audit_results?.audit_criteria?.description || "Kriteria tidak diketahui";
                      const evalStatus = report.audit_results?.status || "unknown";

                      return (
                        <div key={report.id} className="bg-surface border border-line rounded-md p-5 flex flex-col md:flex-row justify-between gap-6 hover:border-line/80 transition-colors">
                          <div className="flex-1 space-y-3">
                            {/* Metadata */}
                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-sans text-ink-muted">
                              {buildId ? (
                                <Link 
                                  href={`/buildings/${buildId}`}
                                  className="font-bold text-accent hover:underline"
                                >
                                  {buildName}
                                </Link>
                              ) : (
                                <span className="font-bold">{buildName}</span>
                              )}
                              <span>•</span>
                              <span className="font-mono bg-bg px-1.5 py-0.5 border border-line rounded">
                                {critCode}
                              </span>
                              <span>•</span>
                              <span>
                                Hasil Audit: <strong className="text-ink font-semibold">{statusLabels[evalStatus] || evalStatus}</strong>
                              </span>
                            </div>

                            {/* Criteria Description */}
                            <h4 className="font-display text-base text-ink leading-relaxed font-medium">
                              "{critDesc}"
                            </h4>

                            {/* Reported Reason */}
                            <div className="bg-bg/40 p-3 rounded border border-line/30">
                              <span className="block text-[9px] font-sans font-bold text-ink-muted uppercase tracking-wider mb-1">
                                Alasan Komunitas:
                              </span>
                              <p className="font-sans text-xs text-ink italic leading-relaxed">
                                {report.reason ? `"${report.reason}"` : "Tidak ada alasan tertulis yang disertakan."}
                              </p>
                            </div>

                            <span className="block text-[9px] font-sans text-ink-muted">
                              Dilaporkan pada: {new Date(report.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                          </div>

                          <div className="flex items-center md:justify-end">
                            <button
                              onClick={() => handleResolveReport(report.id)}
                              disabled={resolvingId === report.id}
                              className="w-full md:w-auto inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all disabled:opacity-50 cursor-pointer"
                            >
                              {resolvingId === report.id ? "Memproses..." : "Selesaikan Laporan"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Resolved Reports Divider & List */}
                {resolvedReports.length > 0 && (
                  <div className="pt-8 border-t border-line/60">
                    <h3 className="font-display text-lg font-normal text-ink-muted mb-4">
                      Laporan yang Telah Diselesaikan ({resolvedReports.length})
                    </h3>
                    <div className="space-y-3 opacity-60">
                      {resolvedReports.slice(0, 5).map((report) => (
                        <div key={report.id} className="bg-surface/60 border border-line/50 rounded-md p-4 flex justify-between gap-4 text-xs font-sans text-ink-muted">
                          <div>
                            <span className="font-bold">{report.audit_results?.buildings?.name || "Gedung"}</span>
                            <span className="mx-2">•</span>
                            <span className="font-mono bg-bg px-1 rounded border border-line/40">{report.audit_results?.audit_criteria?.code}</span>
                            <span className="mx-2">•</span>
                            <span className="italic">"{report.reason || "Tanpa alasan"}"</span>
                          </div>
                          <span className="text-[10px] text-status-met font-semibold uppercase">Resolved</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab content 2: Disputed Buildings */}
            {activeTab === "disputed" && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-display text-xl font-normal text-ink">
                    Gedung dengan Hasil Beragam ({disputedBuildings.length})
                  </h3>
                  <p className="font-sans text-xs text-ink-muted mt-1">
                    Gedung-gedung di bawah ini memiliki setidaknya satu kriteria audit dengan penilaian yang tidak konsisten antar sesi audit (sengketa konsensus).
                  </p>
                </div>

                {disputedBuildings.length === 0 ? (
                  <div className="bg-surface border border-line rounded-md p-10 text-center">
                    <p className="font-display italic text-lg text-ink-muted mb-1">
                      "Semua konsensus berjalan konsisten."
                    </p>
                    <p className="font-sans text-xs text-ink-muted">
                      Tidak ditemukan perbedaan evaluasi pada kriteria gedung publik saat ini.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {disputedBuildings.map((building) => (
                      <div key={building.id} className="bg-surface border border-line rounded-md p-5 flex items-center justify-between gap-4 hover:border-accent/40 transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-display text-lg font-medium text-ink">
                              {building.name}
                            </h4>
                            <span className={`inline-flex px-2 py-0.5 border rounded-md text-[8px] font-sans font-semibold uppercase tracking-wider ${
                              building.verified 
                                ? "bg-accent/10 text-accent border-accent/20" 
                                : "bg-bg text-ink-muted border-line"
                            }`}>
                              {building.verified ? "Diverifikasi" : "Komunitas"}
                            </span>
                          </div>
                          <p className="font-sans text-xs text-ink-muted mt-1">
                            {building.address || "Alamat belum diisi."}
                          </p>
                        </div>

                        <Link
                          href={`/buildings/${building.id}`}
                          className="flex-shrink-0 inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/40 text-ink hover:text-accent font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
                        >
                          Tinjau Kriteria
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
