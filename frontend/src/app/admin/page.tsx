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
  gps_mismatch?: boolean;
  edit_history_count?: number;
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
    audit_runs?: {
      gps_mismatch: boolean;
      gps_distance_meters: number | null;
    } | null;
  } | null;
}

interface BuildingReport {
  id: string;
  building_id: string;
  anonymous_id: string;
  reporter_ip_hash: string;
  reason: string;
  created_at: string;
  buildings: {
    id: string;
    name: string;
    address: string | null;
    trust_status: string;
    manually_set_by_admin: boolean;
  } | null;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  
  // Dashboard state
  const [activeTab, setActiveTab] = useState<"reports" | "disputed" | "moderation">("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [buildingReports, setBuildingReports] = useState<BuildingReport[]>([]);
  const [disputedBuildings, setDisputedBuildings] = useState<Building[]>([]);
  const [moderationBuildings, setModerationBuildings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Action state
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  // Authenticate and fetch initial data
  useEffect(() => {
    const sessionToken = sessionStorage.getItem("admin_token");
    if (!sessionToken) {
      router.push("/admin/login");
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

      // Fetch reports, disputed buildings, moderation queue, and building reports in parallel
      const [reportsRes, disputedRes, moderationRes, buildingReportsRes] = await Promise.all([
        fetch("http://127.0.0.1:8000/admin/reports", { headers, cache: "no-store" }),
        fetch("http://127.0.0.1:8000/admin/disputed", { headers, cache: "no-store" }),
        fetch("http://127.0.0.1:8000/admin/moderation-queue", { headers, cache: "no-store" }),
        fetch("http://127.0.0.1:8000/admin/building-reports", { headers, cache: "no-store" }),
      ]);

      if (!reportsRes.ok || !disputedRes.ok || !moderationRes.ok || !buildingReportsRes.ok) {
        if (
          reportsRes.status === 401 || 
          disputedRes.status === 401 || 
          moderationRes.status === 401 ||
          buildingReportsRes.status === 401
        ) {
          sessionStorage.removeItem("admin_token");
          document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; samesite=lax";
          router.push("/admin/login");
          return;
        }
        throw new Error("Gagal mengambil data administrasi.");
      }

      const reportsData = await reportsRes.json();
      const disputedData = await disputedRes.json();
      const moderationData = await moderationRes.json();
      const buildingReportsData = await buildingReportsRes.json();

      setReports(reportsData);
      setDisputedBuildings(disputedData);
      setModerationBuildings(moderationData);
      setBuildingReports(buildingReportsData);
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
      const res = await fetch(`http://127.0.0.1:8000/admin/reports/${reportId}/resolve`, {
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

  const handleSetTrustStatus = async (buildingId: string, status: string) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/admin/buildings/${buildingId}/trust-status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error("Gagal merubah status kepercayaan.");
      }

      await fetchData(token);
      alert(`Berhasil menetapkan status gedung menjadi ${status.toUpperCase()}.`);
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetToAuto = async (buildingId: string) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/admin/buildings/${buildingId}/reset-to-auto`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Gagal mengembalikan status ke perhitungan otomatis.");
      }

      await fetchData(token);
      alert("Berhasil mengembalikan status gedung ke perhitungan otomatis.");
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBuilding = async (buildingId: string, buildingName: string) => {
    if (!token) return;
    if (!confirm(`Apakah Anda yakin ingin menghapus gedung "${buildingName}" secara permanen? Semua data audit, foto, dan hotspot terkait akan dihapus.`)) {
      return;
    }
    
    setIsLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/admin/buildings/${buildingId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Gagal menghapus gedung.");
      }

      await fetchData(token);
      alert("Gedung berhasil dihapus.");
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_token");
    document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; samesite=lax";
    router.push("/admin/login");
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
            Laporan Masuk ({openReports.length + buildingReports.length})
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
          <button
            onClick={() => setActiveTab("moderation")}
            className={`font-sans text-sm font-semibold pb-3 px-4 -mb-px transition-colors cursor-pointer border-b-2 ${
              activeTab === "moderation"
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Antrian Moderasi ({moderationBuildings.length})
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
              <div className="space-y-12">
                {/* 1. Seksi Laporan Umum Gedung */}
                <div className="space-y-6">
                  <div>
                    <h3 className="font-display text-xl font-normal text-ink">
                      Laporan Umum Gedung ({buildingReports.length})
                    </h3>
                    <p className="font-sans text-xs text-ink-muted mt-1">
                      Laporan tingkat gedung (dari fitur vote / ketidaksesuaian umum).
                    </p>
                  </div>

                  {buildingReports.length === 0 ? (
                    <div className="bg-surface border border-line rounded-md p-8 text-center">
                      <p className="font-sans text-xs text-ink-muted italic">
                        Tidak ada laporan umum gedung saat ini.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {buildingReports.map((bReport) => {
                        const buildingName = bReport.buildings?.name || "Gedung Tidak Diketahui";
                        const buildingId = bReport.building_id;
                        const buildingAddress = bReport.buildings?.address || "Alamat tidak tersedia";
                        const trustStatus = bReport.buildings?.trust_status || "neutral";

                        return (
                          <div key={bReport.id} className="bg-surface border border-line rounded-md p-5 flex flex-col md:flex-row justify-between gap-6 hover:border-line/80 transition-colors">
                            <div className="flex-1 space-y-3">
                              {/* Metadata */}
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-sans text-ink-muted">
                                <Link 
                                  href={`/buildings/${buildingId}`}
                                  className="font-bold text-accent hover:underline"
                                >
                                  {buildingName}
                                </Link>
                                <span>•</span>
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-sans font-semibold uppercase tracking-wider ${
                                  trustStatus === "trusted" ? "bg-status-met/10 text-status-met border border-status-met/20" :
                                  trustStatus === "reported" ? "bg-status-not-met/10 text-status-not-met border border-status-not-met/20" :
                                  "bg-bg text-ink-muted border-line"
                                }`}>
                                  Status: {trustStatus.toUpperCase()}
                                </span>
                              </div>

                              {/* Reported Reason */}
                              <div className="bg-bg/40 p-3 rounded border border-line/30">
                                <span className="block text-[9px] font-sans font-bold text-ink-muted uppercase tracking-wider mb-1">
                                  Alasan Komunitas:
                                </span>
                                <p className="font-sans text-xs text-ink italic leading-relaxed">
                                  "{bReport.reason || "Tanpa alasan tertulis."}"
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center justify-between text-[9px] font-sans text-ink-muted">
                                <span>IP Hash: <strong className="font-mono">{bReport.reporter_ip_hash?.substring(0, 8)}...</strong></span>
                                <span>Dilaporkan pada: {new Date(bReport.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</span>
                              </div>
                            </div>

                            {/* Action Buttons for building status override directly */}
                            <div className="flex flex-wrap md:flex-col md:items-end justify-center gap-2">
                              <button
                                onClick={() => handleSetTrustStatus(buildingId, "trusted")}
                                className="inline-flex items-center justify-center bg-status-met/10 text-status-met hover:bg-status-met hover:text-white border border-status-met/20 font-sans text-[10px] font-semibold px-2.5 py-1.5 rounded transition-all cursor-pointer"
                              >
                                Set Trusted
                              </button>
                              <button
                                onClick={() => handleSetTrustStatus(buildingId, "doubtful")}
                                className="inline-flex items-center justify-center bg-amber-500/10 text-amber-700 hover:bg-amber-500 hover:text-white border border-amber-500/20 font-sans text-[10px] font-semibold px-2.5 py-1.5 rounded transition-all cursor-pointer"
                              >
                                Set Doubtful
                              </button>
                              <button
                                onClick={() => handleResetToAuto(buildingId)}
                                className="inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/40 text-ink font-sans text-[10px] font-semibold px-2.5 py-1.5 rounded transition-all cursor-pointer"
                              >
                                Reset to Auto
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Seksi Laporan Poin Kriteria */}
                <div className="space-y-6 pt-6 border-t border-line/60">
                  <div>
                    <h3 className="font-display text-xl font-normal text-ink">
                      Laporan Poin Kriteria ({openReports.length})
                    </h3>
                    <p className="font-sans text-xs text-ink-muted mt-1">
                      Laporan tingkat kriteria spesifik (terhubung ke audit_result_id).
                    </p>
                  </div>

                  {openReports.length === 0 ? (
                    <div className="bg-surface border border-line rounded-md p-8 text-center">
                      <p className="font-sans text-xs text-ink-muted italic">
                        Tidak ada laporan poin kriteria saat ini.
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
                        const hasGpsMismatch = report.audit_results?.audit_runs?.gps_mismatch || false;

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
                                {hasGpsMismatch && (
                                  <>
                                    <span>•</span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-sans font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-700 border border-amber-500/20">
                                      GPS Tidak Cocok
                                    </span>
                                  </>
                                )}
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
                </div>

                {/* 3. Laporan yang Telah Diselesaikan (Criteria Reports) */}
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
                            {building.gps_mismatch && (
                              <span className="inline-flex px-2 py-0.5 border rounded-md text-[8px] font-sans font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-700 border-amber-500/20">
                                GPS Tidak Cocok
                              </span>
                            )}
                            {building.edit_history_count !== undefined && building.edit_history_count > 0 && (
                              <span className="inline-flex px-2 py-0.5 border rounded-md text-[8px] font-sans font-semibold uppercase tracking-wider bg-accent/10 text-accent border-accent/20">
                                Riwayat Edit ({building.edit_history_count})
                              </span>
                            )}
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

            {activeTab === "moderation" && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-display text-xl font-normal text-ink">
                    Antrian Moderasi Gedung Dilaporkan ({moderationBuildings.length})
                  </h3>
                  <p className="font-sans text-xs text-ink-muted mt-1">
                    Gedung-gedung di bawah ini ditandai sebagai "Dilaporkan" oleh komunitas karena melampaui ambang batas laporan.
                  </p>
                </div>

                {moderationBuildings.length === 0 ? (
                  <div className="bg-surface border border-line rounded-md p-10 text-center">
                    <p className="font-display italic text-lg text-ink-muted mb-1">
                      "Antrian moderasi kosong."
                    </p>
                    <p className="font-sans text-xs text-ink-muted">
                      Tidak ada gedung dengan status 'Dilaporkan' saat ini.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {moderationBuildings.map((building) => {
                      const isExpanded = expandedIds.includes(building.id);
                      const reportList = building.building_reports || [];
                      
                      return (
                        <div key={building.id} className="bg-surface border border-line rounded-md p-5 space-y-4 hover:border-line/80 transition-colors">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <Link 
                                  href={`/buildings/${building.id}`}
                                  className="font-display text-lg font-medium text-ink hover:text-accent hover:underline"
                                >
                                  {building.name}
                                </Link>
                                <span className="bg-status-not-met/10 text-status-not-met border border-status-not-met/20 inline-flex px-2 py-0.5 rounded-md text-[8px] font-sans font-semibold uppercase tracking-wider">
                                  Dilaporkan ({reportList.length})
                                </span>
                              </div>
                              <p className="font-sans text-xs text-ink-muted mt-1">
                                {building.address || "Alamat belum diisi."}
                              </p>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => handleSetTrustStatus(building.id, "trusted")}
                                className="inline-flex items-center justify-center bg-status-met/10 text-status-met hover:bg-status-met hover:text-white border border-status-met/20 font-sans text-xs font-semibold px-3 py-1.5 rounded-md transition-all cursor-pointer"
                                title="Override status menjadi Dipercaya"
                              >
                                Set Trusted
                              </button>
                              <button
                                onClick={() => handleSetTrustStatus(building.id, "doubtful")}
                                className="inline-flex items-center justify-center bg-amber-500/10 text-amber-700 hover:bg-amber-500 hover:text-white border border-amber-500/20 font-sans text-xs font-semibold px-3 py-1.5 rounded-md transition-all cursor-pointer"
                                title="Override status menjadi Meragukan"
                              >
                                Set Doubtful
                              </button>
                              <button
                                onClick={() => handleResetToAuto(building.id)}
                                className="inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/40 text-ink font-sans text-xs font-semibold px-3 py-1.5 rounded-md transition-all cursor-pointer"
                                title="Reset override admin dan hitung otomatis berdasarkan vote"
                              >
                                Reset to Auto
                              </button>
                              <button
                                onClick={() => handleDeleteBuilding(building.id, building.name)}
                                className="inline-flex items-center justify-center bg-status-not-met/10 text-status-not-met hover:bg-status-not-met hover:text-white border border-status-not-met/20 font-sans text-xs font-semibold px-3 py-1.5 rounded-md transition-all cursor-pointer"
                                title="Hapus gedung secara permanen"
                              >
                                Hapus Gedung
                              </button>
                            </div>
                          </div>

                          {/* Expand details toggler */}
                          <div className="pt-2 border-t border-line/40 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                const id = building.id;
                                setExpandedIds((prev) => 
                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                );
                              }}
                              className="text-xs font-semibold font-sans text-accent hover:underline inline-flex items-center cursor-pointer"
                            >
                              {isExpanded ? "Sembunyikan Laporan" : "Lihat Semua Laporan Komunitas"}
                              <svg 
                                className={`w-3.5 h-3.5 ml-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            <span className="text-[10px] text-ink-muted font-sans font-medium">
                              {building.manually_set_by_admin ? "Override Manual Admin Aktif" : "Perhitungan Status Otomatis"}
                            </span>
                          </div>

                          {/* Expanded list of reports */}
                          {isExpanded && (
                            <div className="bg-bg/30 border border-line/30 p-4 rounded space-y-3">
                              <span className="block text-[9px] font-sans font-bold text-ink-muted uppercase tracking-wider">
                                Rincian Laporan Komunitas:
                              </span>
                              
                              {reportList.length === 0 ? (
                                <p className="text-xs font-sans text-ink-muted italic">
                                  Tidak ada detail laporan tersimpan (mungkin dimasukkan lewat mock).
                                </p>
                              ) : (
                                <div className="space-y-2 divide-y divide-line/20">
                                  {reportList.map((rep: any, idx: number) => (
                                    <div key={rep.id || idx} className="text-xs font-sans space-y-1 py-1">
                                      <div className="flex items-center justify-between text-[10px] text-ink-muted">
                                        <span>Anonim: <strong className="font-mono">{rep.anonymous_id?.substring(0, 8) || "N/A"}...</strong></span>
                                        <span>{new Date(rep.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
                                      </div>
                                      <p className="text-ink italic bg-surface/40 p-2 rounded border border-line/20 leading-relaxed">
                                        "{rep.reason || "Tanpa alasan tertulis."}"
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
