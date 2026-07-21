"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Toast, { ToastMessage } from "@/components/Toast";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import { BACKEND_URL } from "@/config";

interface Building {
  id: string;
  name: string;
  address: string | null;
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
  } | null;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<"reports" | "disputed">("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [buildingReports, setBuildingReports] = useState<BuildingReport[]>([]);
  const [disputedBuildings, setDisputedBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toast notifications state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modal deletion state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "building" | "building_report" | "report";
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const addToast = (type: "success" | "error" | "info", message: string) => {
    const toastId = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id: toastId, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

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
      const headers = { Authorization: `Bearer ${sessionToken}` };

      const [reportsRes, disputedRes, buildingReportsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/admin/reports`, { headers, cache: "no-store" }),
        fetch(`${BACKEND_URL}/admin/disputed`, { headers, cache: "no-store" }),
        fetch(`${BACKEND_URL}/admin/building-reports`, { headers, cache: "no-store" }),
      ]);

      if (!reportsRes.ok || !disputedRes.ok || !buildingReportsRes.ok) {
        if (
          reportsRes.status === 401 ||
          disputedRes.status === 401 ||
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
      const buildingReportsData = await buildingReportsRes.json();

      setReports(reportsData);
      setDisputedBuildings(disputedData);
      setBuildingReports(buildingReportsData);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat memuat data.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveCriteriaReport = async (reportId: string) => {
    if (!token) return;
    setResolvingId(reportId);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/reports/${reportId}/resolve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Gagal menyelesaikan laporan poin kriteria.");
      }

      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: "resolved" } : r)));
      addToast("success", "Laporan kriteria berhasil diselesaikan.");
    } catch (err: any) {
      addToast("error", err.message || "Terjadi kesalahan saat memproses.");
    } finally {
      setResolvingId(null);
    }
  };

  const handleResolveBuildingReport = async (reportId: string) => {
    if (!token) return;
    setResolvingId(reportId);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/building-reports/${reportId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Gagal menghapus/menyelesaikan laporan gedung.");
      }

      setBuildingReports((prev) => prev.filter((r) => r.id !== reportId));
      addToast("success", "Laporan gedung berhasil diselesaikan.");
    } catch (err: any) {
      addToast("error", err.message || "Terjadi kesalahan saat memproses.");
    } finally {
      setResolvingId(null);
    }
  };

  const executeDeleteBuilding = async () => {
    if (!token || !deleteTarget || deleteTarget.type !== "building") return;
    setIsDeleting(true);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/buildings/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Gagal menghapus gedung.");
      }

      setDisputedBuildings((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setBuildingReports((prev) => prev.filter((r) => r.building_id !== deleteTarget.id));
      addToast("success", `Gedung "${deleteTarget.name}" berhasil dihapus.`);
      setDeleteTarget(null);
    } catch (err: any) {
      addToast("error", err.message || "Terjadi kesalahan saat menghapus gedung.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_token");
    document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; samesite=lax";
    router.push("/admin/login");
  };

  const openReports = reports.filter((r) => r.status === "open");

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
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-sans font-bold bg-accent text-white px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Panel Kontrol
              </span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-normal text-ink">
              Dashboard Admin
            </h1>
            <p className="font-sans text-xs text-ink-muted mt-1">
              Moderasi laporan komunitas dan kelola sengketa hasil audit gedung.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start sm:self-center border border-line bg-surface hover:bg-bg/40 text-ink hover:text-accent font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
          >
            Keluar Admin
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
            Laporan Komunitas ({buildingReports.length + openReports.length})
          </button>
          <button
            onClick={() => setActiveTab("disputed")}
            className={`font-sans text-sm font-semibold pb-3 px-4 -mb-px transition-colors cursor-pointer border-b-2 ${
              activeTab === "disputed"
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Audit Bersengketa ({disputedBuildings.length})
          </button>
        </div>

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="py-20 text-center font-sans text-xs text-ink-muted animate-pulse">
            Memuat data administrasi...
          </div>
        ) : (
          <>
            {/* TAB 1: LAPORAN KOMUNITAS */}
            {activeTab === "reports" && (
              <div className="space-y-12">
                {/* Laporan Umum Gedung */}
                <div className="space-y-6">
                  <div>
                    <h3 className="font-display text-xl font-normal text-ink">
                      Laporan Gedung ({buildingReports.length})
                    </h3>
                    <p className="font-sans text-xs text-ink-muted mt-1">
                      Aduan ketidaksesuaian umum dari pengguna pada tingkat gedung.
                    </p>
                  </div>

                  {buildingReports.length === 0 ? (
                    <div className="bg-surface border border-line rounded-md p-8 text-center">
                      <p className="font-sans text-xs text-ink-muted italic">
                        Tidak ada laporan gedung saat ini.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {buildingReports.map((bReport) => {
                        const buildingName = bReport.buildings?.name || "Gedung Tidak Diketahui";
                        const buildingId = bReport.building_id;

                        return (
                          <div
                            key={bReport.id}
                            className="bg-surface border border-line rounded-md p-5 flex flex-col md:flex-row justify-between gap-6 hover:border-line/80 transition-colors"
                          >
                            <div className="flex-1 space-y-3">
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-sans text-ink-muted">
                                <Link
                                  href={`/buildings/${buildingId}`}
                                  className="font-bold text-accent hover:underline text-xs"
                                >
                                  {buildingName}
                                </Link>
                              </div>

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

                            <div className="flex flex-col sm:flex-row md:flex-col justify-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => handleResolveBuildingReport(bReport.id)}
                                disabled={resolvingId === bReport.id}
                                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all disabled:opacity-50 cursor-pointer"
                              >
                                {resolvingId === bReport.id ? "Memproses..." : "Selesaikan Laporan"}
                              </button>

                              <button
                                onClick={() =>
                                  setDeleteTarget({
                                    type: "building",
                                    id: buildingId,
                                    name: buildingName,
                                  })
                                }
                                className="inline-flex items-center justify-center bg-status-not-met/10 text-status-not-met hover:bg-status-not-met hover:text-white border border-status-not-met/20 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
                              >
                                Hapus Gedung
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Laporan Poin Kriteria */}
                <div className="space-y-6 pt-6 border-t border-line/60">
                  <div>
                    <h3 className="font-display text-xl font-normal text-ink">
                      Laporan Poin Kriteria ({openReports.length})
                    </h3>
                    <p className="font-sans text-xs text-ink-muted mt-1">
                      Aduan ketidakakuratan hasil analisis AI untuk kriteria spesifik.
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

                        return (
                          <div
                            key={report.id}
                            className="bg-surface border border-line rounded-md p-5 flex flex-col md:flex-row justify-between gap-6 hover:border-line/80 transition-colors"
                          >
                            <div className="flex-1 space-y-3">
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-sans text-ink-muted">
                                {buildId ? (
                                  <Link
                                    href={`/buildings/${buildId}`}
                                    className="font-bold text-accent hover:underline text-xs"
                                  >
                                    {buildName}
                                  </Link>
                                ) : (
                                  <span className="font-bold text-xs">{buildName}</span>
                                )}
                                <span>•</span>
                                <span className="font-mono bg-bg px-1.5 py-0.5 border border-line rounded font-bold text-accent">
                                  {critCode}
                                </span>
                                <span>•</span>
                                <span>
                                  Hasil Audit: <strong className="text-ink font-semibold">{statusLabels[evalStatus] || evalStatus}</strong>
                                </span>
                              </div>

                              <h4 className="font-display text-base text-ink leading-relaxed font-medium">
                                "{critDesc}"
                              </h4>

                              <div className="bg-bg/40 p-3 rounded border border-line/30">
                                <span className="block text-[9px] font-sans font-bold text-ink-muted uppercase tracking-wider mb-1">
                                  Alasan Komunitas:
                                </span>
                                <p className="font-sans text-xs text-ink italic leading-relaxed">
                                  {report.reason ? `"${report.reason}"` : "Tidak ada alasan tertulis."}
                                </p>
                              </div>

                              <span className="block text-[9px] font-sans text-ink-muted">
                                Dilaporkan pada: {new Date(report.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                              </span>
                            </div>

                            <div className="flex items-center md:justify-end">
                              <button
                                onClick={() => handleResolveCriteriaReport(report.id)}
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
              </div>
            )}

            {/* TAB 2: AUDIT BERSENGKETA */}
            {activeTab === "disputed" && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-display text-xl font-normal text-ink">
                    Gedung dengan Audit Bersengketa ({disputedBuildings.length})
                  </h3>
                  <p className="font-sans text-xs text-ink-muted mt-1">
                    Gedung dengan penilaian kriteria yang tidak konsisten antar sesi audit.
                  </p>
                </div>

                {disputedBuildings.length === 0 ? (
                  <div className="bg-surface border border-line rounded-md p-10 text-center">
                    <p className="font-display italic text-lg text-ink-muted mb-1">
                      "Tidak ada sengketa audit."
                    </p>
                    <p className="font-sans text-xs text-ink-muted">
                      Semua hasil evaluasi kriteria berjalan konsisten.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {disputedBuildings.map((building) => (
                      <div
                        key={building.id}
                        className="bg-surface border border-line rounded-md p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-accent/40 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-display text-lg font-medium text-ink">
                              {building.name}
                            </h4>
                            {building.gps_mismatch && (
                              <span className="inline-flex px-2 py-0.5 border rounded-md text-[8px] font-sans font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-700 border-amber-500/20">
                                GPS Tidak Cocok
                              </span>
                            )}
                          </div>
                          <p className="font-sans text-xs text-ink-muted mt-1">
                            {building.address || "Alamat belum diisi."}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/buildings/${building.id}`}
                            className="flex-shrink-0 inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/40 text-ink hover:text-accent font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
                          >
                            Buka Detail Gedung
                          </Link>

                          <button
                            onClick={() =>
                              setDeleteTarget({
                                type: "building",
                                id: building.id,
                                name: building.name,
                              })
                            }
                            className="flex-shrink-0 inline-flex items-center justify-center bg-status-not-met/10 text-status-not-met hover:bg-status-not-met hover:text-white border border-status-not-met/20 font-sans text-xs font-semibold px-3 py-2 rounded-md transition-all cursor-pointer"
                          >
                            Hapus Gedung
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        description={`Apakah Anda yakin ingin menghapus gedung "${deleteTarget?.name}" secara permanen? Semua data audit, foto, dan hotspot terkait akan dihapus secara permanen.`}
        isDeleting={isDeleting}
        onConfirm={executeDeleteBuilding}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Custom Toast Notifications */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
