"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import dynamic from "next/dynamic";

// Dynamically import the Leaflet map to avoid server-side pre-rendering window issues
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-bg/50 border border-line rounded-md flex items-center justify-center font-sans text-xs text-ink-muted animate-pulse">
      Memuat peta...
    </div>
  ),
});

export default function SuggestBuildingPage() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([-6.2088, 106.8456]); // Default: Jakarta center
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search geocode address from backend
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Basic validation
    if (!name.trim() || !address.trim()) {
      setError("Nama gedung dan alamat wajib diisi.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/buildings/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          latitude: mapCenter[0],
          longitude: mapCenter[1],
        }),
      });

      if (!res.ok) {
        throw new Error("Gagal mengirimkan usulan gedung.");
      }

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan koneksi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />
      
      <main className="flex-1 px-6 py-12 md:py-16 max-w-xl mx-auto w-full flex flex-col justify-center">
        {isSuccess ? (
          <div className="bg-surface border border-line rounded-md p-8 shadow-sm text-center">
            {/* Success Icon */}
            <div className="w-12 h-12 rounded-full bg-status-met/10 text-status-met flex items-center justify-center mx-auto mb-6">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            
            <h2 className="font-display text-2xl font-medium text-ink mb-4">
              Usulan Terkirim
            </h2>
            
            <p className="font-sans text-sm text-ink-muted leading-relaxed mb-8">
              Terima kasih! Usulan Anda telah kami terima dan akan ditinjau oleh tim verifikator sebelum diterbitkan di daftar publik.
            </p>
            
            <Link
              href="/buildings"
              className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all cursor-pointer"
            >
              Kembali ke Daftar Gedung
            </Link>
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-md p-6 md:p-8 shadow-sm">
            <h1 className="font-display text-2xl font-normal text-ink mb-2">
              Usulkan Gedung Baru
            </h1>
            <p className="font-sans text-xs text-ink-muted mb-6">
              Usulkan gedung publik baru untuk diaudit standar aksesibilitasnya.
            </p>

            {error && (
              <div className="mb-6 p-4 bg-status-not-met/10 border border-status-not-met/20 rounded-md text-xs text-status-not-met font-sans font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-xs font-sans font-semibold text-ink-muted mb-1">
                  Nama Gedung <span className="text-status-not-met">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Gedung Rektorat Kampus A"
                  className="w-full bg-transparent border border-line rounded-md px-3 py-2 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
                  required
                />
              </div>

              <div>
                <label htmlFor="address" className="block text-xs font-sans font-semibold text-ink-muted mb-1">
                  Alamat Lengkap <span className="text-status-not-met">*</span>
                </label>
                <div className="flex gap-2">
                  <textarea
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Contoh: Jl. Diponegoro No. 123, Jakarta Pusat"
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

              {/* Leaflet Draggable Map */}
              <div className="space-y-2">
                <label className="block text-xs font-sans font-semibold text-ink-muted">
                  Titik Lokasi Gedung (Geser pin jika kurang akurat)
                </label>
                <Map center={mapCenter} onChange={handleMapMarkerChange} />
                <p className="text-[10px] font-sans text-ink-muted italic">
                  Koordinat terpilih: {mapCenter[0].toFixed(6)}, {mapCenter[1].toFixed(6)}
                </p>
              </div>

              <div className="pt-4 flex items-center justify-between gap-4">
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
                  {isLoading ? "Mengirimkan..." : "Kirim Usulan"}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
