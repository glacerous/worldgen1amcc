"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface AuditRun {
  id: string;
  building_id: string;
  user_id: string | null;
  contributor_name: string | null;
  trust_score: number | null;
  created_at: string;
}

export default function EditAuditPage({
  params,
}: {
  params: Promise<{ id: string; audit_run_id: string }>;
}) {
  const { id: buildingId, audit_run_id: auditRunId } = use(params);
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();

  const [auditRun, setAuditRun] = useState<AuditRun | null>(null);
  const [loadingRun, setLoadingRun] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auth guard: redirect to homepage if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, user, router]);

  // Fetch audit run detail + ownership check
  useEffect(() => {
    if (authLoading || !user) return;

    fetch(`${BACKEND_URL}/audit/runs/${auditRunId}/detail`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Gagal mengambil data audit run.");
        return res.json();
      })
      .then((data: AuditRun) => {
        setAuditRun(data);
        // Check ownership — redirect if not the owner
        if (data.user_id !== user.id) {
          router.push(`/buildings/${buildingId}`);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Tidak dapat memuat data audit. Mungkin audit tidak ditemukan.");
      })
      .finally(() => setLoadingRun(false));
  }, [auditRunId, buildingId, user, token, authLoading, router]);

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

    if (selectedFiles.length === 0) {
      setError("Minimal 1 foto baru wajib diunggah untuk memperbarui audit.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("photos", file);
    });

    try {
      const res = await fetch(`${BACKEND_URL}/audit/runs/${auditRunId}/rerun`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Gagal memperbarui audit.");
      }

      setSuccessMessage("Audit berhasil diperbarui");
      setTimeout(() => {
        router.push(`/buildings/${buildingId}?updated=1`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan koneksi server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading states
  if (authLoading || loadingRun) {
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
            {/* Photo upload area */}
            <div className="space-y-2">
              <label className="block text-xs font-sans font-semibold text-ink-muted">
                Foto Bukti Fisik Terbaru{" "}
                <span className="text-status-not-met">*</span>
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
                    Foto terpilih ({selectedFiles.length}):
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {selectedFiles.map((file, idx) => {
                      const objectUrl = URL.createObjectURL(file);
                      return (
                        <div
                          key={idx}
                          className="relative w-16 h-16 border border-line rounded-md overflow-hidden bg-bg"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={objectUrl}
                            alt={`Preview ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="absolute top-0 right-0 bg-ink-muted text-white w-4 h-4 flex items-center justify-center text-[9px] hover:bg-status-not-met transition-colors focus:outline-none cursor-pointer"
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
              <Link
                href={`/buildings/${buildingId}`}
                className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors"
              >
                Batal
              </Link>

              <button
                type="submit"
                disabled={isSubmitting || selectedFiles.length === 0}
                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? "Memproses..." : "Simpan & Analisis Ulang"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
