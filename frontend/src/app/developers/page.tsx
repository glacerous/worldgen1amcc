"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";

interface APIKeyData {
  api_key: string;
  tier: "free" | "pro";
  rate_limit_per_day: number;
  is_active: boolean;
  pro_requested_at: string | null;
  pro_approved_at: string | null;
}

export default function DevelopersPage() {
  const router = useRouter();
  const { user, token, login, loading } = useAuth();
  const [apiKeyData, setApiKeyData] = useState<APIKeyData | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [activeDocTab, setActiveDocTab] = useState<"buildings" | "audit" | "tour">("buildings");

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  // Fetch API key details on load if logged in
  useEffect(() => {
    if (token) {
      setIsFetching(true);
      setError(null);
      fetch(`${BACKEND_URL}/developers/key`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => {
          if (res.status === 401) {
            throw new Error("Sesi login Anda tidak valid atau telah berakhir.");
          }
          return res.ok ? res.json() : null;
        })
        .then((data) => {
          setApiKeyData(data);
        })
        .catch((err) => {
          setError(err.message || "Gagal mengambil data API key.");
        })
        .finally(() => {
          setIsFetching(false);
        });
    } else {
      setApiKeyData(null);
    }
  }, [token, BACKEND_URL]);

  // Generate a new API Key
  const handleGenerateKey = async () => {
    if (!token) return;
    setIsActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/developers/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error("Gagal mendaftarkan API key baru.");
      }
      const data = await res.json();
      setApiKeyData(data);
      setJustGenerated(true);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat generate key.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Request PRO Upgrade
  const handleRequestPro = async () => {
    if (!token) return;
    setIsActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/developers/request-pro`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Gagal mengajukan upgrade PRO.");
      }
      // Re-fetch key status
      const keyRes = await fetch(`${BACKEND_URL}/developers/key`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (keyRes.ok) {
        const updatedData = await keyRes.json();
        setApiKeyData(updatedData);
      }
    } catch (err: any) {
      setError(err.message || "Gagal mengajukan upgrade PRO.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Copy key to clipboard
  const handleCopyKey = () => {
    if (apiKeyData?.api_key) {
      navigator.clipboard.writeText(apiKeyData.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Safe developer key getter for example calls
  const currentDevKey = apiKeyData?.api_key || "YOUR_API_KEY";

  return (
    <div className="min-h-screen flex flex-col bg-bg relative overflow-x-hidden">
      {/* Background Noise Texture */}
      <div 
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 flex flex-col justify-start">
        
        {/* Tombol Back */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/settings")}
            className="inline-flex items-center gap-2 text-ink-muted hover:text-accent font-sans text-xs font-semibold cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 text-ink-muted group-hover:text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            <span>Kembali ke Pengaturan</span>
          </button>
        </div>

        {/* Title Section */}
        <div className="mb-10 text-left">
          <span className="font-sans text-xs tracking-widest text-accent uppercase font-semibold">
            Integrasi Pengembang
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-normal text-ink mt-2">
            Aksesibel Public API
          </h1>
          <p className="font-display italic text-lg text-ink-muted mt-2">
            Bangun aplikasi inklusif dengan data audit aksesibilitas gedung terverifikasi kami.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-status-not-met text-sm rounded font-sans">
            {error}
          </div>
        )}

        {/* LOADING STATE */}
        {loading || isFetching ? (
          <div className="w-full bg-surface border border-line rounded-md p-8 flex flex-col items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mb-4"></div>
            <span className="font-sans text-sm text-ink-muted">Memuat data akses developer...</span>
          </div>
        ) : !user ? (
          /* STATE 1: NOT LOGGED IN */
          <div className="w-full space-y-8">
            <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs">
              <h2 className="font-display text-2xl font-normal text-ink mb-4">
                Ketentuan Layanan API Publik
              </h2>
              <p className="font-sans text-sm text-ink-muted leading-relaxed mb-6">
                Kami menyediakan data audit bangunan publik secara gratis untuk mendukung pembuatan aplikasi 
                sosial, riset, maupun integrasi sistem pemetaan. Anda dapat mengakses daftar gedung terverifikasi, 
                nilai kepatuhan aksesibilitas, serta detail kriteria audit secara real-time.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="border border-line/65 p-4 rounded bg-bg/20">
                  <h3 className="font-sans text-sm font-semibold text-accent mb-1">Tier Free</h3>
                  <p className="font-sans text-xs text-ink-muted leading-relaxed">
                    Batas limit pemanggilan 100 requests per hari. Cocok untuk fase testing, riset mahasiswa, atau aplikasi kecil.
                  </p>
                </div>
                <div className="border border-line/65 p-4 rounded bg-bg/20">
                  <h3 className="font-sans text-sm font-semibold text-accent mb-1">Tier Pro</h3>
                  <p className="font-sans text-xs text-ink-muted leading-relaxed">
                    Batas limit pemanggilan 2,000 requests per hari dan mendapat akses ke data tur virtual 360° beserta hotspot anotasinya.
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-start gap-4">
                <span className="font-sans text-xs text-ink-muted">
                  Masuk dengan akun Google Anda untuk mendaftarkan API Key:
                </span>
                <button
                  onClick={() => login("/developers")}
                  className="inline-flex items-center gap-2.5 bg-accent text-white font-sans text-sm font-semibold px-6 py-3 rounded transition-all cursor-pointer hover:bg-accent/90"
                >
                  {/* Google Icon SVG */}
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.113-5.136 4.113-3.41 0-6.19-2.779-6.19-6.19 0-3.41 2.78-6.19 6.19-6.19 1.542 0 2.94.577 4.01 1.524l3.19-3.19C19.14 2.544 15.93 1.135 12.24 1.135 6.185 1.135 1.25 6.07 1.25 12.125s4.935 10.99 10.99 10.99c6.326 0 10.495-4.416 10.495-10.678 0-.698-.073-1.365-.189-2.152H12.24z"/>
                  </svg>
                  <span>Login dengan Google</span>
                </button>
              </div>
            </div>
          </div>
        ) : !apiKeyData ? (
          /* STATE 2: LOGGED IN, NO API KEY */
          <div className="w-full bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs flex flex-col items-start">
            <h2 className="font-display text-2xl font-normal text-ink mb-2">
              Halo, {user.display_name}
            </h2>
            <p className="font-sans text-sm text-ink-muted leading-relaxed mb-6">
              Anda belum memiliki Developer API Key. Silakan daftarkan kunci API Anda di bawah ini untuk 
              memulai pemanggilan data publik dari platform Aksesibel.
            </p>
            <button
              onClick={handleGenerateKey}
              disabled={isActionLoading}
              className="inline-flex items-center justify-center bg-accent text-white font-sans text-sm font-semibold px-6 py-3 rounded transition-all cursor-pointer hover:bg-accent/90 disabled:opacity-50"
            >
              {isActionLoading ? "Mendaftarkan..." : "Generate API Key"}
            </button>
          </div>
        ) : (
          /* STATE 3: LOGGED IN & HAS API KEY */
          <div className="w-full space-y-8">
            {/* Warning if just generated */}
            {justGenerated && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-700 text-sm rounded font-sans leading-relaxed">
                <strong>PENTING:</strong> API Key Anda berhasil di-generate. Simpan baik-baik, key ini akan selalu 
                bisa Anda lihat kembali di halaman ini kapan saja selama Anda login dengan akun Google Anda.
              </div>
            )}

            {/* Decree citation card showing key and tier details */}
            <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-6">
              <div>
                <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase">
                  Developer API Key Anda
                </span>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1 bg-bg/40 font-mono text-sm border border-line/60 rounded px-4 py-2.5 text-ink select-all flex items-center justify-between min-w-0">
                    <span className="truncate font-mono mr-2">
                      {isKeyVisible ? apiKeyData.api_key : "••••••••••••••••••••••••••••••••••••••••"}
                    </span>
                    <button
                      onClick={() => setIsKeyVisible(!isKeyVisible)}
                      className="text-ink-muted hover:text-accent focus:outline-none transition-colors cursor-pointer flex-shrink-0"
                      title={isKeyVisible ? "Sembunyikan API Key" : "Tampilkan API Key"}
                    >
                      {isKeyVisible ? (
                        /* Eye Slash SVG */
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        /* Eye SVG */
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <button
                    onClick={handleCopyKey}
                    className="inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/25 px-4 py-2.5 rounded font-sans text-xs font-semibold text-accent transition-all cursor-pointer select-none whitespace-nowrap min-w-[85px]"
                  >
                    {copied ? "Disalin!" : "Salin Key"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-line/45">
                <div>
                  <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase">
                    Tier Pengembang
                  </span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-sans font-bold uppercase tracking-wider ${
                      apiKeyData.tier === "pro" 
                        ? "bg-accent/15 text-accent border border-accent/25" 
                        : "bg-status-unknown/15 text-status-unknown border border-status-unknown/25"
                    }`}>
                      {apiKeyData.tier}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase">
                    Batas Panggilan Harian
                  </span>
                  <p className="font-display italic text-lg text-ink mt-1">
                    {apiKeyData.rate_limit_per_day.toLocaleString()} requests / hari
                  </p>
                </div>
              </div>

              {/* Pro Upgrade Action */}
              {apiKeyData.tier === "free" && (
                <div className="pt-6 border-t border-line/45 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="max-w-md">
                    <h3 className="font-sans text-sm font-semibold text-ink">Butuh batas limit lebih besar?</h3>
                    <p className="font-sans text-xs text-ink-muted leading-relaxed mt-0.5">
                      Ajukan permohonan upgrade ke Pro Tier untuk menaikkan limit harian menjadi 2,000 requests 
                      serta membuka akses API Virtual Tour 360°.
                    </p>
                  </div>
                  {apiKeyData.pro_requested_at ? (
                    <span className="inline-flex items-center px-4 py-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs font-sans font-bold text-amber-700 uppercase tracking-wider select-none">
                      Menunggu Approval
                    </span>
                  ) : (
                    <button
                      onClick={handleRequestPro}
                      disabled={isActionLoading}
                      className="inline-flex items-center justify-center bg-accent text-white font-sans text-xs font-semibold px-4 py-2.5 rounded transition-all cursor-pointer hover:opacity-90 disabled:opacity-50"
                    >
                      {isActionLoading ? "Mengajukan..." : "Request Upgrade ke Pro"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* CUSTOM DEVELOPER API DOCUMENTATION & EXAMPLES */}
            <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-6">
              <div>
                <h3 className="font-display text-2xl font-normal text-ink">Dokumentasi API Publik</h3>
                <p className="font-sans text-sm text-ink-muted leading-relaxed mt-1">
                  Integrasikan data kepatuhan aksesibilitas fisik, visual, dan auditori platform Aksesibel secara real-time ke aplikasi Anda.
                </p>
              </div>

              {/* API Documentation Tabs */}
              <div className="flex border-b border-line/65 overflow-x-auto whitespace-nowrap">
                <button
                  onClick={() => setActiveDocTab("buildings")}
                  className={`px-4 py-2.5 text-xs font-sans font-semibold border-b-2 cursor-pointer transition-all ${
                    activeDocTab === "buildings"
                      ? "border-accent text-accent"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  1. List Buildings
                </button>
                <button
                  onClick={() => setActiveDocTab("audit")}
                  className={`px-4 py-2.5 text-xs font-sans font-semibold border-b-2 cursor-pointer transition-all ${
                    activeDocTab === "audit"
                      ? "border-accent text-accent"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  2. Building Audit
                </button>
                <button
                  onClick={() => setActiveDocTab("tour")}
                  className={`px-4 py-2.5 text-xs font-sans font-semibold border-b-2 cursor-pointer transition-all ${
                    activeDocTab === "tour"
                      ? "border-accent text-accent"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  3. 360° Tour (Pro)
                </button>
              </div>

              {/* Tab 1: GET /v1/public/buildings */}
              {activeDocTab === "buildings" && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-600 text-white text-[10px] font-sans font-bold uppercase px-2 py-0.5 rounded">
                      GET
                    </span>
                    <span className="font-mono text-sm font-semibold text-ink">
                      /v1/public/buildings
                    </span>
                  </div>

                  <p className="font-sans text-xs text-ink-muted leading-relaxed">
                    Mengambil daftar gedung yang berstatus terverifikasi dan dipublikasikan (`approved`), menyembunyikan kolom internal seperti email pemilik atau trust score internal.
                  </p>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Parameter Query (Optional)
                    </span>
                    <div className="border border-line/55 rounded divide-y divide-line/35 font-sans text-xs bg-bg/15">
                      <div className="p-2.5 flex justify-between gap-4">
                        <span className="font-mono font-semibold text-accent">limit</span>
                        <span className="text-ink-muted">Integer (Default: 20) — Jumlah data maksimum yang dikembalikan</span>
                      </div>
                      <div className="p-2.5 flex justify-between gap-4">
                        <span className="font-mono font-semibold text-accent">offset</span>
                        <span className="text-ink-muted">Integer (Default: 0) — Indeks awal/offset data untuk pagination</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Contoh Pemanggilan (cURL)
                    </span>
                    <div className="bg-ink/5 border border-line/65 rounded p-3 font-mono text-[11px] text-ink overflow-x-auto relative select-all">
                      <pre>{`curl -H "X-API-Key: ${currentDevKey}" \\\n  "${BACKEND_URL}/v1/public/buildings?limit=10&offset=0"`}</pre>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Format Response (200 OK)
                    </span>
                    <div className="bg-ink/5 border border-line/65 rounded p-3 font-mono text-[11px] text-ink overflow-x-auto">
                      <pre>{`[\n  {\n    "id": "8374691d-b2fb-421f-ba6c-d5717adde2b6",\n    "name": "MRT Bundaran HI",\n    "address": "bundaran HI",\n    "lat": -6.1949853,\n    "lng": 106.8226741\n  }\n]`}</pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: GET /v1/public/buildings/{id}/audit */}
              {activeDocTab === "audit" && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-600 text-white text-[10px] font-sans font-bold uppercase px-2 py-0.5 rounded">
                      GET
                    </span>
                    <span className="font-mono text-sm font-semibold text-ink">
                      /v1/public/buildings/{"{id}"}/audit
                    </span>
                  </div>

                  <p className="font-sans text-xs text-ink-muted leading-relaxed">
                    Mengambil hasil evaluasi konsensus kriteria audit utama (`primary` / run tertua) untuk gedung tertentu. 
                    Mencakup kode kriteria, deskripsi, kategori, status evaluasi (`met`/`not_met`/`unknown`), dan status sengketa (`is_disputed`).
                  </p>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Parameter Path (Wajib)
                    </span>
                    <div className="border border-line/55 rounded font-sans text-xs bg-bg/15 p-2.5 flex justify-between gap-4">
                      <span className="font-mono font-semibold text-accent">id</span>
                      <span className="text-ink-muted">UUID — ID Gedung yang terdaftar (misal: `8374691d-b2fb-421f-ba6c-d5717adde2b6`)</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Contoh Pemanggilan (cURL)
                    </span>
                    <div className="bg-ink/5 border border-line/65 rounded p-3 font-mono text-[11px] text-ink overflow-x-auto relative select-all">
                      <pre>{`curl -H "X-API-Key: ${currentDevKey}" \\\n  "${BACKEND_URL}/v1/public/buildings/8374691d-b2fb-421f-ba6c-d5717adde2b6/audit"`}</pre>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Format Response (200 OK)
                    </span>
                    <div className="bg-ink/5 border border-line/65 rounded p-3 font-mono text-[11px] text-ink overflow-x-auto max-h-72">
                      <pre>{`{\n  "building_id": "8374691d-b2fb-421f-ba6c-d5717adde2b6",\n  "building_name": "MRT Bundaran HI",\n  "audit_run_id": "cca3589c-4deb-4462-a565-f94e2747edad",\n  "created_at": "2026-07-15T13:32:38.171281Z",\n  "results": [\n    {\n      "code": "SNI-8201-M1",\n      "description": "Ramp dengan kemiringan wajar (maksimal 8 derajat)...",\n      "category": "mobilitas",\n      "status": "met",\n      "is_disputed": false\n    }\n  ]\n}`}</pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: GET /v1/public/buildings/{id}/tour (Pro Tier) */}
              {activeDocTab === "tour" && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-600 text-white text-[10px] font-sans font-bold uppercase px-2 py-0.5 rounded">
                      GET
                    </span>
                    <span className="font-mono text-sm font-semibold text-ink">
                      /v1/public/buildings/{"{id}"}/tour
                    </span>
                    <span className="bg-accent/15 text-accent text-[9px] font-sans font-bold uppercase px-2 py-0.5 rounded border border-accent/20">
                      Tier Pro Only
                    </span>
                  </div>

                  <p className="font-sans text-xs text-ink-muted leading-relaxed">
                    Mengambil seluruh data panorama 360° virtual tour (`scenes`) dan hotspot aksen aksesibilitas (`annotations`) 
                    terkait audit gedung utama. Akses dibatasi khusus untuk developer Tier Pro.
                  </p>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Parameter Path (Wajib)
                    </span>
                    <div className="border border-line/55 rounded font-sans text-xs bg-bg/15 p-2.5 flex justify-between gap-4">
                      <span className="font-mono font-semibold text-accent">id</span>
                      <span className="text-ink-muted">UUID — ID Gedung yang terdaftar</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Contoh Pemanggilan (cURL)
                    </span>
                    <div className="bg-ink/5 border border-line/65 rounded p-3 font-mono text-[11px] text-ink overflow-x-auto relative select-all">
                      <pre>{`curl -H "X-API-Key: ${currentDevKey}" \\\n  "${BACKEND_URL}/v1/public/buildings/8374691d-b2fb-421f-ba6c-d5717adde2b6/tour"`}</pre>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                      Format Response (200 OK)
                    </span>
                    <div className="bg-ink/5 border border-line/65 rounded p-3 font-mono text-[11px] text-ink overflow-x-auto max-h-72">
                      <pre>{`{\n  "building_id": "8374691d-b2fb-421f-ba6c-d5717adde2b6",\n  "building_name": "MRT Bundaran HI",\n  "audit_run_id": "cca3589c-4deb-4462-a565-f94e2747edad",\n  "scenes": [\n    {\n      "id": "b5405a1b-cf38-4755-8e72-1574cdb78a48",\n      "label": "Lobby Entrance",\n      "file_url": "https://...",\n      "type": "panorama_360",\n      "created_at": "2026-07-15T13:32:38.776045Z",\n      "annotations": [\n        {\n          "id": "a3a73356-c8c2-4d63-9fae-b590cdcaf8a5",\n          "label": "Tangga Akses",\n          "pitch": -7.2,\n          "yaw": -82.8,\n          "criteria": {\n            "code": "SNI-8201-N2",\n            "description": "Tersedia kontras warna...",\n            "category": "netra",\n            "status": "met"\n          }\n        }\n      ]\n    }\n  ]\n}`}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
