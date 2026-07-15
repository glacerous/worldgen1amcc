"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, login, loading, textSize, setTextSize } = useAuth();

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

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-12 flex flex-col justify-start">
        {/* Title Section */}
        <div className="mb-10 text-left">
          <span className="font-sans text-xs tracking-widest text-accent uppercase font-semibold">
            Pengaturan Aplikasi
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-normal text-ink mt-2">
            Pengaturan
          </h1>
          <p className="font-display italic text-lg text-ink-muted mt-2">
            Kelola preferensi akun dan akses integrasi Anda.
          </p>
        </div>

        {/* LOADING STATE */}
        {loading ? (
          <div className="w-full bg-surface border border-line rounded-md p-8 flex flex-col items-center justify-center min-h-[250px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mb-4"></div>
            <span className="font-sans text-sm text-ink-muted">Memuat preferensi Anda...</span>
          </div>
        ) : !user ? (
          /* NOT LOGGED IN STATE */
          <div className="bg-surface border-l-4 border-status-not-met p-6 md:p-8 rounded-r-md border border-line shadow-xs">
            <h2 className="font-display text-2xl font-normal text-ink mb-3">
              Akses Terbatas
            </h2>
            <p className="font-sans text-sm text-ink-muted leading-relaxed mb-6">
              Silakan login terlebih dahulu untuk mengakses menu pengaturan akun dan API Key developer.
            </p>
            <button
              onClick={() => login("/settings")}
              className="inline-flex items-center gap-2.5 bg-accent text-white font-sans text-sm font-semibold px-6 py-3 rounded transition-all cursor-pointer hover:bg-accent/90"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.113-5.136 4.113-3.41 0-6.19-2.779-6.19-6.19 0-3.41 2.78-6.19 6.19-6.19 1.542 0 2.94.577 4.01 1.524l3.19-3.19C19.14 2.544 15.93 1.135 12.24 1.135 6.185 1.135 1.25 6.07 1.25 12.125s4.935 10.99 10.99 10.99c6.326 0 10.495-4.416 10.495-10.678 0-.698-.073-1.365-.189-2.152H12.24z"/>
              </svg>
              <span>Login dengan Google</span>
            </button>
          </div>
        ) : (
          /* LOGGED IN SETTINGS PANEL */
          <div className="space-y-8">
            
            {/* 1. User Profile Card */}
            <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-4">
              <h2 className="font-display text-2xl font-normal text-ink border-b border-line/45 pb-2">
                Profil Pengguna
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase">
                    Nama Akun
                  </span>
                  <p className="font-sans text-sm font-semibold text-ink mt-0.5">
                    {user.display_name}
                  </p>
                </div>
                <div>
                  <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase">
                    Alamat Email
                  </span>
                  <p className="font-sans text-sm text-ink-muted mt-0.5">
                    {user.email}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase">
                    User ID (Database ID)
                  </span>
                  <p className="font-mono text-xs text-ink-muted bg-bg/30 border border-line/45 rounded px-2.5 py-1.5 mt-1 overflow-x-auto select-all">
                    {user.id}
                  </p>
                </div>
              </div>
              <p className="font-sans text-[11px] text-ink-muted italic pt-2">
                * Data profil di atas disinkronkan secara otomatis melalui akun Google Anda.
              </p>
            </div>

            {/* 2. Accessibility Preference Card */}
            <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-4">
              <h2 className="font-display text-2xl font-normal text-ink border-b border-line/45 pb-2">
                Aksesibilitas Teks
              </h2>
              <p className="font-sans text-sm text-ink-muted leading-relaxed">
                Sesuaikan ukuran teks dasar di seluruh aplikasi web Aksesibel demi kenyamanan membaca Anda.
              </p>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setTextSize("normal")}
                  className={`px-4 py-2 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                    textSize === "normal"
                      ? "bg-accent text-white border-accent"
                      : "bg-surface border-line text-ink hover:bg-bg/40"
                  }`}
                >
                  AA (Normal / 16px)
                </button>
                <button
                  onClick={() => setTextSize("besar")}
                  className={`px-4 py-2 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                    textSize === "besar"
                      ? "bg-accent text-white border-accent"
                      : "bg-surface border-line text-ink hover:bg-bg/40"
                  }`}
                >
                  AA+ (Besar / 18px)
                </button>
                <button
                  onClick={() => setTextSize("sangat-besar")}
                  className={`px-4 py-2 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                    textSize === "sangat-besar"
                      ? "bg-accent text-white border-accent"
                      : "bg-surface border-line text-ink hover:bg-bg/40"
                  }`}
                >
                  AA++ (Sangat Besar / 20px)
                </button>
              </div>
            </div>

            {/* 3. Developer API Card */}
            <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-4 flex flex-col items-start">
              <h2 className="font-display text-2xl font-normal text-ink border-b border-line/45 pb-2 w-full">
                API Pengembang
              </h2>
              <p className="font-sans text-sm text-ink-muted leading-relaxed">
                Platform Aksesibel menawarkan data publik terverifikasi yang dapat Anda integrasikan ke sistem pemetaan, 
                penelitian, maupun aplikasi penunjang disabilitas eksternal.
              </p>
              <div className="w-full border border-line/55 rounded p-4 bg-bg/25 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-sans text-sm font-semibold text-accent">API untuk Developer</h3>
                  <p className="font-sans text-xs text-ink-muted leading-relaxed">
                    Dapatkan kunci API publik Anda, cek batas limit pemanggilan (rate limit), lihat contoh kode integrasi curl, dan baca dokumentasi teknis lengkap.
                  </p>
                </div>
                <Link
                  href="/developers"
                  className="inline-flex items-center justify-center bg-accent text-white hover:bg-accent/90 font-sans text-xs font-semibold px-4 py-2.5 rounded transition-all cursor-pointer whitespace-nowrap"
                >
                  Kelola API Key
                </Link>
              </div>
            </div>

          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
