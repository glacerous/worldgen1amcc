"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Dynamically import Leaflet Map to bypass SSR window issues
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-bg/50 border border-line rounded-md flex items-center justify-center font-sans text-xs text-ink-muted animate-pulse">
      Memuat peta...
    </div>
  ),
});

export default function SubmitBuildingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contributorName, setContributorName] = useState("");
  const [address, setAddress] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([-6.2088, 106.8456]); // Default: Jakarta center
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [panoramaFile, setPanoramaFile] = useState<File | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningDistance, setWarningDistance] = useState<number | null>(null);
 
  // Geocoding query to resolve address coordinates
  const handleGeocode = async () => {
    if (!address.trim()) {
      setError("Masukkan alamat terlebih dahulu untuk mencari lokasi.");
      return;
    }
    setIsGeocoding(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:8000/geocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address: address.trim() }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Lokasi tidak ditemukan. Coba perjelas nama jalan atau kota.");
        }
        throw new Error("Gagal melakukan pencarian lokasi.");
      }

      const data = await res.json();
      setMapCenter([data.latitude, data.longitude]);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat mencari lokasi.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleMapMarkerChange = (lat: number, lng: number) => {
    setMapCenter([lat, lng]);
  };

  // Handle file picking and validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      
      // Validate image types
      const invalidFiles = filesArray.some((file) => !file.type.startsWith("image/"));
      if (invalidFiles) {
        setError("Hanya berkas gambar (image/*) yang diperbolehkan.");
        return;
      }

      setSelectedFiles((prev) => [...prev, ...filesArray]);
      setError(null);
    }
  };

  // Remove a selected file from the preview list
  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSubmit(false);
  };

  const performSubmit = async (confirmLocation: boolean) => {
    setIsLoading(true);
    setError(null);

    // Form validation checks
    if (!name.trim() || !address.trim()) {
      setError("Nama gedung dan alamat lengkap wajib diisi.");
      setIsLoading(false);
      return;
    }

    if (selectedFiles.length === 0) {
      setError("Minimal 1 foto bukti fisik wajib diunggah.");
      setIsLoading(false);
      return;
    }

    // Build Form Data payload
    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("address", address.trim());
    formData.append("latitude", mapCenter[0].toString());
    formData.append("longitude", mapCenter[1].toString());
    formData.append("confirm_location", confirmLocation ? "true" : "false");
    
    if (contributorName.trim()) {
      formData.append("contributor_name", contributorName.trim());
    }

    selectedFiles.forEach((file) => {
      formData.append("photos", file);
    });

    if (panoramaFile) {
      formData.append("panorama", panoramaFile);
    }

    try {
      const res = await fetch("http://localhost:8000/buildings/submit", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || "Gagal melakukan registrasi gedung.");
      }

      // Check if it is a warning
      if (data.warning === "gps_mismatch") {
        setWarningDistance(data.distance_meters);
        setShowWarningModal(true);
        setIsLoading(false);
        return;
      }

      const newBuildingId = data.building?.id;

      if (!newBuildingId) {
        throw new Error("Gagal memperoleh ID gedung hasil submit.");
      }

      // Success redirect to the detail results page immediately
      router.push(`/buildings/${newBuildingId}`);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan koneksi server.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-12 md:py-16 max-w-xl mx-auto w-full flex flex-col justify-center">
        <div className="bg-surface border border-line rounded-md p-6 md:p-8 shadow-sm">
          <h1 className="font-display text-2xl font-normal text-ink mb-2">
            Audit Gedung Baru
          </h1>
          <p className="font-sans text-xs text-ink-muted mb-6">
            Daftarkan gedung publik dan unggah foto bukti fisik untuk memulai audit standar aksesibilitas berbasis AI.
          </p>

          {error && (
            <div className="mb-6 p-4 bg-status-not-met/10 border border-status-not-met/20 rounded-md text-xs text-status-not-met font-sans font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Building Name Input */}
            <div>
              <label htmlFor="name" className="block text-xs font-sans font-semibold text-ink-muted mb-1.5">
                Nama Gedung <span className="text-status-not-met">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Gedung Sate Bandung"
                className="w-full bg-transparent border border-line rounded-md px-3 py-2 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
                required
              />
            </div>

            {/* Contributor Name Input */}
            <div>
              <label htmlFor="contributor_name" className="block text-xs font-sans font-semibold text-ink-muted mb-1.5">
                Nama/Institusi Anda (opsional)
              </label>
              <input
                type="text"
                id="contributor_name"
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
                placeholder="Contoh: Universitas Gadjah Mada / Budi"
                className="w-full bg-transparent border border-line rounded-md px-3 py-2 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
              />
            </div>

            {/* Address & Geocode Search Input */}
            <div>
              <label htmlFor="address" className="block text-xs font-sans font-semibold text-ink-muted mb-1.5">
                Alamat Lengkap <span className="text-status-not-met">*</span>
              </label>
              <div className="flex gap-2">
                <textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Contoh: Jl. Diponegoro No. 22, Bandung"
                  rows={2}
                  className="w-full bg-transparent border border-line rounded-md px-3 py-2 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
                  required
                />
                <button
                  type="button"
                  disabled={isGeocoding}
                  onClick={handleGeocode}
                  className="flex-shrink-0 inline-flex items-center justify-center border border-line hover:bg-bg/40 font-sans text-xs font-semibold px-4 rounded-md text-ink transition-all disabled:opacity-50 h-auto cursor-pointer"
                >
                  {isGeocoding ? "Mencari..." : "Cari Lokasi"}
                </button>
              </div>
            </div>

            {/* Leaflet Dynamic Map */}
            <div className="space-y-2">
              <label className="block text-xs font-sans font-semibold text-ink-muted">
                Titik Lokasi Gedung (Geser pin jika kurang akurat)
              </label>
              <Map center={mapCenter} onChange={handleMapMarkerChange} />
              <p className="text-[10px] font-sans text-ink-muted italic">
                Koordinat terpilih: {mapCenter[0].toFixed(6)}, {mapCenter[1].toFixed(6)}
              </p>
            </div>

            {/* Multiple Photo Picker & Preview Thumbnails */}
            <div className="space-y-2">
              <label className="block text-xs font-sans font-semibold text-ink-muted">
                Foto Bukti Fisik Aksesibilitas <span className="text-status-not-met">*</span>
              </label>
              
              {/* Fake file pick area */}
              <div 
                onClick={() => document.getElementById("photo-picker")?.click()}
                className="border border-dashed border-line hover:border-accent/40 rounded-md p-6 text-center cursor-pointer transition-colors"
              >
                <svg className="w-8 h-8 text-ink-muted/70 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p className="font-sans text-[11px] text-ink-muted">
                  Klik untuk memilih foto-foto bukti standar gedung (Ramp, Pintu, Toilet, dll.)
                </p>
              </div>
              
              <input
                type="file"
                id="photo-picker"
                multiple
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Thumbnails list */}
              {selectedFiles.length > 0 && (
                <div className="pt-2">
                  <span className="block text-[10px] font-sans font-semibold text-ink-muted mb-2">
                    Foto terpilih ({selectedFiles.length}):
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {selectedFiles.map((file, idx) => {
                      const objectUrl = URL.createObjectURL(file);
                      return (
                        <div key={idx} className="relative w-16 h-16 border border-line rounded-md overflow-hidden bg-bg">
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

            {/* Panorama 360 File Picker (Optional) */}
            <div className="space-y-2">
              <label className="block text-xs font-sans font-semibold text-ink-muted">
                Foto 360° (opsional)
              </label>
              
              <div 
                onClick={() => document.getElementById("panorama-picker")?.click()}
                className="border border-dashed border-line hover:border-accent/40 rounded-md p-4 text-center cursor-pointer transition-colors bg-surface/40"
              >
                <svg className="w-6 h-6 text-ink-muted/70 mx-auto mb-1.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h1.5A1.5 1.5 0 0118 13.5v1a1.5 1.5 0 001.5 1.5h1.365M15 18a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <p className="font-sans text-[11px] text-ink-muted">
                  {panoramaFile ? `Terpilih: ${panoramaFile.name}` : "Tambahkan foto 360° untuk tur virtual dengan penanda otomatis oleh AI"}
                </p>
              </div>

              <input
                type="file"
                id="panorama-picker"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    const file = e.target.files[0];
                    if (!file.type.startsWith("image/")) {
                      setError("Berkas panorama harus berupa file gambar.");
                      return;
                    }
                    setPanoramaFile(file);
                    setError(null);
                  }
                }}
                className="hidden"
              />

              {panoramaFile && (
                <div className="flex items-center justify-between text-[10px] font-sans text-ink-muted bg-surface border border-line rounded-md px-3 py-1.5">
                  <span className="truncate max-w-[80%]">{panoramaFile.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPanoramaFile(null);
                    }}
                    className="text-status-not-met font-semibold hover:underline cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              )}
            </div>


            {/* AI analysis disclaimer text */}
            <p className="font-sans text-[10px] text-ink-muted leading-relaxed">
              * Hasil akan dianalisis otomatis oleh AI dan langsung tayang, ditandai sebagai kontribusi komunitas hingga diverifikasi tim kami.
            </p>

            {/* Footer buttons */}
            <div className="pt-4 flex items-center justify-between gap-4 border-t border-line/50">
              <Link
                href="/buildings"
                className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors"
              >
                Batal
              </Link>
              
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? "Memproses Audit..." : "Kirim & Mulai Audit"}
              </button>
            </div>
          </form>
        </div>
      </main>

      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-ink/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setShowWarningModal(false)}
          />
          
          {/* Modal Card */}
          <div className="relative bg-surface border border-line rounded-md max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 text-amber-700 dark:text-amber-600 rounded-full border border-amber-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink mb-2">
                  Peringatan Selisih GPS
                </h3>
                <p className="font-sans text-xs text-ink-muted leading-relaxed mb-4">
                  Metadata lokasi GPS pada foto bukti yang Anda unggah berjarak sekitar{" "}
                  <strong className="text-amber-700 dark:text-amber-500">
                    {warningDistance ? Math.round(warningDistance) : 0} meter
                  </strong>{" "}
                  dari titik koordinat alamat yang ditentukan di peta.
                </p>
                <p className="font-sans text-xs text-ink-muted leading-relaxed">
                  Apakah Anda yakin koordinat dan foto yang Anda kirimkan sudah benar? Anda dapat kembali dan memindahkan pin lokasi atau tetap melanjutkan.
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/40 text-ink-muted hover:text-ink font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
              >
                Perbaiki Alamat
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowWarningModal(false);
                  performSubmit(true);
                }}
                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
              >
                Tetap Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
