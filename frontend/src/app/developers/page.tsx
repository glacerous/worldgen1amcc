"use client";

import { useState, useEffect } from "react";
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
  const { user, token, login, loading } = useAuth();
  const [apiKeyData, setApiKeyData] = useState<APIKeyData | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  // TEMP MOCK LOGIN FOR TESTING
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("aksesibel_token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNDJjZWQ1OGItNDZiYi00ZDA2LTljYzctOTcxNTA4ZTdjYTU4IiwiZW1haWwiOiJhenpha3lyYWloYW5AZ21haWwuY29tIiwiZGlzcGxheV9uYW1lIjoiYXp6YWt5IiwiZXhwIjoxNzg0NzI5NjExfQ.GVKVvuHudm3hBg7ieG3GWEKecb32etFrTn2BCxQ1lTc");
      localStorage.setItem("aksesibel_user", '{"id":"42ced58b-46bb-4d06-9cc7-971508e7ca58","email":"azzakyraihan@gmail.com","display_name":"azzaky","avatar_url":null}');
    }
  }, []);

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
                  <div className="flex-1 bg-bg/40 font-mono text-sm border border-line/60 rounded px-4 py-2.5 text-ink overflow-x-auto select-all">
                    {apiKeyData.api_key}
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

            {/* API Documentation block */}
            <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-4">
              <h3 className="font-display text-xl font-normal text-ink">Dokumentasi API</h3>
              <p className="font-sans text-sm text-ink-muted leading-relaxed">
                Anda dapat melihat seluruh skema data, endpoint, parameter, serta mencoba memanggil API secara 
                interaktif melalui halaman OpenAPI Swagger UI kami.
              </p>
              <div>
                <a
                  href={`${BACKEND_URL}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-sans text-sm font-bold text-accent hover:text-accent/80 hover:underline transition-all"
                >
                  <span>Lihat dokumentasi lengkap endpoint</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
            </div>

            {/* cURL Usage Code Block */}
            <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-4">
              <h3 className="font-display text-xl font-normal text-ink">Contoh Pemanggilan</h3>
              <p className="font-sans text-sm text-ink-muted leading-relaxed">
                Gunakan perintah `curl` berikut di terminal Anda untuk mengambil daftar gedung terverifikasi 
                menggunakan API key Anda:
              </p>
              <div className="bg-ink/5 border border-line/65 rounded p-4 font-mono text-xs text-ink overflow-x-auto relative group">
                <pre>{`curl -H "X-API-Key: ${apiKeyData.api_key}" \\\n  ${BACKEND_URL}/v1/public/buildings`}</pre>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
