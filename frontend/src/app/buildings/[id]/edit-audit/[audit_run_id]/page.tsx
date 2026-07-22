"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import { BACKEND_URL } from "@/config";
import AuditLoadingOverlay from "@/components/AuditLoadingOverlay";



interface AuditRun {
  id: string;
  building_id: string;
  user_id: string | null;
  contributor_name: string | null;
  trust_score: number | null;
  created_at: string;
  photos?: string[];
}

export default function EditAuditPage({
  params,
}: {
  params: Promise<{ id: string; audit_run_id: string }>;
}) {
  const { id: buildingId, audit_run_id: auditRunId } = use(params);
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  const [auditRun, setAuditRun] = useState<AuditRun | null>(null);
  const [loadingRun, setLoadingRun] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successTargetUrl, setSuccessTargetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [photoUrlsToDelete, setPhotoUrlsToDelete] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    const admTok = sessionStorage.getItem("admin_token");
    if (admTok) {
      setAdminToken(admTok);
      setIsAdminLoggedIn(true);
    }
  }, []);

  const executeDeleteAudit = async () => {
    const admTok = sessionStorage.getItem("admin_token");
    const activeToken = admTok || token;
    if (!auditRunId || !activeToken) return;

    setIsDeleting(true);
    setError(null);
    try {
      const deleteEndpoint = admTok
        ? `${BACKEND_URL}/admin/audit-runs/${auditRunId}`
        : `${BACKEND_URL}/audit-runs/${auditRunId}`;

      const res = await fetch(deleteEndpoint, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${activeToken}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Gagal menghapus audit.");
      }

      setShowDeleteModal(false);
      setSuccessMessage("Audit berhasil dihapus.");
      setTimeout(() => {
        router.push(`/buildings/${buildingId}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Gagal menghapus audit.");
      setIsDeleting(false);
    }
  };

  // Auth guard: redirect to login if not logged in (neither user nor admin)
  useEffect(() => {
    const admTok = sessionStorage.getItem("admin_token");
    if (!authLoading && !user && !admTok) {
      router.push(`/login?redirect=/buildings/${buildingId}/edit-audit/${auditRunId}`);
    }
  }, [authLoading, user, router, buildingId, auditRunId]);

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Fetch audit run detail + ownership check
  useEffect(() => {
    const admTok = sessionStorage.getItem("admin_token");
    if (authLoading || (!user && !admTok) || !auditRunId || !UUID_REGEX.test(auditRunId)) return;

    const activeToken = admTok || token;
    const headers: Record<string, string> = {};
    if (activeToken) {
      headers["Authorization"] = `Bearer ${activeToken}`;
    }

    fetch(`${BACKEND_URL}/audit/runs/${auditRunId}/detail`, { headers })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Gagal mengambil data audit run (status ${res.status}): ${errText}`);
        }
        return res.json();
      })
      .then((data: AuditRun) => {
        setAuditRun(data);
        // Check ownership — redirect if not the owner (skip check if admin)
        if (!admTok && data.user_id !== user?.id) {
          router.push(`/buildings/${buildingId}`);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Tidak dapat memuat data audit. Mungkin audit tidak ditemukan.");
      })
      .finally(() => setLoadingRun(false));
  }, [auditRunId, buildingId, user, token, authLoading, router]);

  // Fetch existing audit results and scenes to extract photos
  useEffect(() => {
    if (!auditRunId || !buildingId || !UUID_REGEX.test(auditRunId) || !auditRun) return;
    
    const fetchResults = fetch(`${BACKEND_URL}/audit-runs/${auditRunId}/results`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
      
    const fetchScenes = fetch(`${BACKEND_URL}/scenes?building_id=${buildingId}`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
      
    Promise.all([fetchResults, fetchScenes])
      .then(([results, scenesList]) => {
        const closeUps = auditRun?.photos && auditRun.photos.length > 0
          ? auditRun.photos
          : results
              .map((r: any) => r.evidence_url)
              .filter((url: any): url is string => !!url);
          
        const uniqueCloseUps = Array.from(new Set(closeUps));
        
        const runTime = new Date(auditRun.created_at).getTime();
        const matchedPanoramas = scenesList
          .filter((s: any) => {
            const sceneTime = new Date(s.created_at).getTime();
            return Math.abs(sceneTime - runTime) < 60000;
          })
          .map((s: any) => s.file_url);
          
        const combined = Array.from(new Set([...uniqueCloseUps, ...matchedPanoramas]));
        setExistingPhotos(combined);
      })
      .catch(console.error);
  }, [auditRunId, buildingId, auditRun]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const invalidFiles = filesArray.some((file) => !file.type.startsWith("image/"));
      if (invalidFiles) {
        setError("Hanya berkas gambar (image/*) yang diperbolehkan.");
        return;
      }
      setSelectedFiles((prev) => [...prev, ...filesArray]);
      setError(null);
    }
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const remainingCount = existingPhotos.filter(url => !photoUrlsToDelete.includes(url)).length + selectedFiles.length;
    if (remainingCount === 0) {
      setError("Minimal harus ada 1 foto bukti tersisa atau baru yang diunggah.");
      return;
    }

    setIsSubmitting(true);
    setIsSuccess(false);
    setSuccessTargetUrl(null);
    setError(null);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("new_photos", file);
    });
    formData.append("photo_ids_to_delete", JSON.stringify(photoUrlsToDelete));

    const admTok = sessionStorage.getItem("admin_token");
    const activeToken = admTok || token;
    const patchEndpoint = admTok
      ? `${BACKEND_URL}/admin/audit-runs/${auditRunId}`
      : `${BACKEND_URL}/audit-runs/${auditRunId}`;

    try {
      const headers: Record<string, string> = {};
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }

      const res = await fetch(patchEndpoint, {
        method: "PATCH",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Gagal memperbarui audit.");
      }

      setIsSuccess(true);
      setSuccessTargetUrl(`/buildings/${buildingId}?updated=1`);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan koneksi server.");
      setIsSubmitting(false);
    }
  };

  // Loading states
  if (authLoading || (!user && !isAdminLoggedIn) || loadingRun) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  if (!auditRun) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h1 className="font-display text-2xl font-medium text-ink mb-4">
            Audit Tidak Ditemukan
          </h1>
          <Link
            href={`/buildings/${buildingId}`}
            className="font-sans text-sm text-accent hover:underline"
          >
            Kembali ke Detail Gedung
          </Link>
        </main>
      </div>
    );
  }

  const label =
    auditRun.contributor_name ||
    (auditRun.user_id ? `Kontributor #${auditRun.user_id.slice(0, 6)}` : "Anonim");

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-12 md:py-16 max-w-xl mx-auto w-full flex flex-col justify-center">
        {/* Breadcrumb */}
        <Link
          href={`/buildings/${buildingId}`}
          className="inline-flex items-center text-xs font-sans text-ink-muted hover:text-accent transition-colors mb-6"
        >
          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Kembali ke Detail Gedung
        </Link>

        <div className="bg-surface border border-line rounded-md p-6 md:p-8 shadow-sm">
          {/* Header */}
          <div className="mb-6">
            <h1 className="font-display text-2xl font-normal text-ink mb-1">
              Edit Audit
            </h1>
            <p className="font-sans text-xs text-ink-muted">
              Perbarui audit Anda &mdash;{" "}
              <span className="font-semibold text-ink">{label}</span>{" "}
              &mdash; dengan mengunggah foto bukti fisik terbaru.
            </p>
          </div>

          {/* Audit run info */}
          <div className="mb-6 flex items-center gap-3 p-3 bg-bg border border-line rounded-md">
            <div className="flex flex-col">
              <span className="font-sans text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                Trust Score
              </span>
              <span className="font-display text-lg font-bold text-accent">
                {auditRun.trust_score !== null
                  ? `${Math.round(auditRun.trust_score * 100)}%`
                  : "N/A"}
              </span>
            </div>
            <div className="w-px h-8 bg-line" />
            <div className="flex flex-col">
              <span className="font-sans text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                Dibuat
              </span>
              <span className="font-sans text-xs text-ink">
                {new Date(auditRun.created_at).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Success message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-status-met/10 border border-status-met/20 rounded-md text-xs text-status-met font-sans font-medium flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {successMessage}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-status-not-met/10 border border-status-not-met/20 rounded-md text-xs text-status-not-met font-sans font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Existing Photos Gallery with delete buttons */}
            {existingPhotos.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-sans font-semibold text-ink-muted">
                  Foto Bukti yang Sudah Ada ({existingPhotos.filter(url => !photoUrlsToDelete.includes(url)).length})
                </label>
                <div className="grid grid-cols-4 gap-3 bg-bg p-3 border border-line rounded-md">
                  {existingPhotos.map((url) => {
                    const isDeleted = photoUrlsToDelete.includes(url);
                    const isPanorama = url.includes("/panoramas/");
                    return (
                      <div
                        key={url}
                        className={`relative aspect-square rounded overflow-hidden border bg-surface transition-all ${
                          isDeleted ? "opacity-35 border-line" : "border-line hover:border-status-not-met/40"
                        }`}
                      >
                        <img
                          src={url}
                          alt="Foto bukti audit yang sudah terunggah"
                          className="w-full h-full object-cover"
                        />
                        {isPanorama && (
                          <span className="absolute bottom-1 left-1 bg-accent text-[7px] text-white font-sans font-bold px-1 rounded scale-80 origin-bottom-left">
                            360°
                          </span>
                        )}
                        {!isDeleted ? (
                          <button
                            type="button"
                            onClick={() => setPhotoUrlsToDelete((prev) => [...prev, url])}
                            className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] shadow-xs cursor-pointer focus:outline-none transition-colors"
                            title="Hapus foto ini"
                            aria-label="Tandai foto bukti ini untuk dihapus"
                          >
                            ✕
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPhotoUrlsToDelete((prev) => prev.filter((item) => item !== url))}
                            className="absolute inset-0 bg-black/55 flex items-center justify-center text-[10px] font-sans font-bold text-white cursor-pointer hover:bg-black/45 focus:outline-none transition-colors"
                            title="Batalkan hapus"
                          >
                            Batal
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photo upload area */}
            <div className="space-y-2">
              <label className="block text-xs font-sans font-semibold text-ink-muted">
                Unggah Foto Bukti Fisik Baru
              </label>

              {/* Drop area */}
              <div
                onClick={() => document.getElementById("edit-photo-picker")?.click()}
                className="border border-dashed border-line hover:border-accent/40 rounded-md p-6 text-center cursor-pointer transition-colors"
              >
                <svg
                  className="w-8 h-8 text-ink-muted/70 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="font-sans text-[11px] text-ink-muted">
                  Klik untuk memilih foto-foto bukti standar gedung (Ramp, Pintu, Toilet, dll.)
                </p>
              </div>

              <input
                type="file"
                id="edit-photo-picker"
                multiple
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Thumbnails */}
              {selectedFiles.length > 0 && (
                <div className="pt-2">
                  <span className="block text-[10px] font-sans font-semibold text-ink-muted mb-2">
                    Foto Baru terpilih ({selectedFiles.length}):
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {selectedFiles.map((file, idx) => {
                      const objectUrl = URL.createObjectURL(file);
                      return (
                        <div
                          key={idx}
                          className="relative w-16 h-16 border border-line rounded-md overflow-hidden bg-bg"
                        >
                          <img
                            src={objectUrl}
                            alt={`Preview foto bukti baru ke-${idx + 1} yang akan diunggah`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="absolute top-0 right-0 bg-ink-muted text-white w-4.5 h-4.5 flex items-center justify-center text-[9px] hover:bg-status-not-met transition-colors focus:outline-none cursor-pointer"
                            aria-label={`Batal pilih foto preview baru ke-${idx + 1}`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* AI disclaimer */}
            <p className="font-sans text-[10px] text-ink-muted leading-relaxed">
              * Foto yang diunggah akan dianalisis ulang oleh AI. Hasil audit Anda akan diperbarui otomatis.
            </p>

            {/* Footer buttons */}
            <div className="pt-4 flex items-center justify-between gap-4 border-t border-line/50">
              <div className="flex items-center gap-4">
                <Link
                  href={`/buildings/${buildingId}`}
                  className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors"
                >
                  Batal
                </Link>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={isDeleting || isSubmitting}
                  className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-status-not-met hover:underline cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  Hapus Audit
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isDeleting || (existingPhotos.filter(url => !photoUrlsToDelete.includes(url)).length + selectedFiles.length === 0)}
                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? "Memproses..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      </main>

      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        isDeleting={isDeleting}
        onConfirm={executeDeleteAudit}
        onClose={() => {
          if (!isDeleting) setShowDeleteModal(false);
        }}
      />

      <AuditLoadingOverlay
        isVisible={isSubmitting}
        isSuccess={isSuccess}
        mode="edit"
        onComplete={() => {
          if (successTargetUrl) {
            router.push(successTargetUrl);
          }
        }}
      />
    </div>
  );
}
