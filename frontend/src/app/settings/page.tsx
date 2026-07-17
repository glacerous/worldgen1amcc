"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  id: string;
}

function ToggleRow({ label, description, checked, onChange, id }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-line/30 last:border-b-0">
      <div className="flex flex-col">
        <span className="font-sans text-sm font-semibold text-ink">{label}</span>
        <span className="font-sans text-xs text-ink-muted leading-relaxed mt-0.5">{description}</span>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? "bg-accent" : "bg-line/80"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow-xs transition duration-200 ease-in-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { 
    user, 
    login, 
    loading, 
    textSize, 
    setTextSize, 
    updateUser, 
    token,
    highContrast,
    setHighContrast,
    reduceMotion,
    setReduceMotion,
    lineSpacing,
    setLineSpacing,
    dyslexiaFont,
    setDyslexiaFont,
    largeTargets,
    setLargeTargets,
    underlineLinks,
    setUnderlineLinks
  } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "appearance">("profile");
  const [displayName, setDisplayName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name);
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "appearance") {
        setActiveTab("appearance");
      } else if (tab === "profile") {
        setActiveTab("profile");
      }
    }
  }, []);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setUpdateMessage({ type: "error", text: "Nama tidak boleh kosong." });
      return;
    }
    setIsUpdating(true);
    setUpdateMessage(null);
    try {
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${BACKEND_URL}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Gagal memperbarui nama.");
      }

      const data = await response.json();
      updateUser(data.user, data.token);
      setUpdateMessage({ type: "success", text: "Nama akun berhasil diperbarui." });
    } catch (err: any) {
      setUpdateMessage({ type: "error", text: err.message || "Terjadi kesalahan." });
    } finally {
      setIsUpdating(false);
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

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 flex flex-col justify-start">
        {/* Title Section */}
        <div className="mb-8 text-left border-b border-line pb-6">
          <span className="font-sans text-xs tracking-widest text-accent uppercase font-semibold">
            Pengaturan Aplikasi
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-normal text-ink mt-2">
            Pengaturan
          </h1>
          <p className="font-display italic text-base text-ink-muted mt-2">
            Kelola preferensi akun dan akses integrasi API Anda.
          </p>
        </div>

        {/* GUEST OR LOGGED IN VIEW */}
        {!user && !loading ? (
          /* NOT LOGGED IN STATE */
          <div className="max-w-3xl w-full mx-auto bg-surface border-l-4 border-status-not-met p-6 md:p-8 rounded-r-md border border-line shadow-xs">
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
          /* LOGGED IN SETTINGS WORKSPACE (WITH SIDEBAR) OR LOADING WORKSPACE */
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-10 items-start align-start">
            
            {/* Sidebar on the Left */}
            <aside className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible pb-4 md:pb-0 border-b md:border-b-0 md:border-r border-line/65 gap-1 md:gap-6 pr-0 md:pr-6 whitespace-nowrap md:sticky md:top-24 md:self-start">
              
              <div className="flex flex-row md:flex-col gap-1 md:gap-1.5 w-full">
                <span className="text-[10px] font-sans font-bold text-ink-muted uppercase tracking-wider hidden md:block mb-2 select-none">
                  Konfigurasi Akun
                </span>
                <button
                  onClick={() => setActiveTab("profile")}
                  className={`text-left px-3.5 py-2 text-xs md:text-sm font-sans rounded transition-all cursor-pointer w-full focus:outline-none ${
                    activeTab === "profile"
                      ? "bg-accent text-white font-semibold shadow-xs"
                      : "text-ink hover:bg-bg/40 font-medium"
                  }`}
                >
                  Profil Pengguna
                </button>
                
                <button
                  onClick={() => setActiveTab("appearance")}
                  className={`text-left px-3.5 py-2 text-xs md:text-sm font-sans rounded transition-all cursor-pointer w-full focus:outline-none ${
                    activeTab === "appearance"
                      ? "bg-accent text-white font-semibold shadow-xs"
                      : "text-ink hover:bg-bg/40 font-medium"
                  }`}
                >
                  Tampilan & Aksesibilitas
                </button>
              </div>

              <div className="flex flex-row md:flex-col gap-1 md:gap-1.5 w-full md:pt-4 md:border-t md:border-line/45">
                <span className="text-[10px] font-sans font-bold text-ink-muted uppercase tracking-wider hidden md:block mb-2 select-none">
                  Integrasi
                </span>
                <Link
                  href="/developers"
                  className="text-left px-3.5 py-2 text-xs md:text-sm font-sans rounded transition-all flex items-center justify-between text-ink hover:bg-bg/40 font-medium cursor-pointer w-full group"
                >
                  <span>Public API (Kunci)</span>
                  <svg className="w-3.5 h-3.5 text-ink-muted group-hover:translate-x-0.5 transition-transform hidden md:block" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              </div>
            </aside>

            {/* Main Content Area on the Right */}
            <div className="space-y-8 min-w-0">
              {loading ? (
                /* LOADING CARD */
                <div className="w-full bg-surface border border-line rounded-md p-8 flex flex-col items-center justify-center min-h-[250px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mb-4"></div>
                  <span className="font-sans text-sm text-ink-muted">Memuat preferensi Anda...</span>
                </div>
              ) : activeTab === "profile" && user && (
                <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-5 animate-in fade-in duration-200">
                  <h2 className="font-display text-2xl font-normal text-ink border-b border-line/45 pb-2">
                    Profil Pengguna
                  </h2>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="sm:col-span-2">
                      <form onSubmit={handleUpdateName} className="space-y-3 max-w-md">
                        <div>
                          <label htmlFor="displayName" className="block font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase mb-1.5">
                            Nama Akun
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              id="displayName"
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              placeholder="Masukkan nama akun baru"
                              className="flex-1 bg-transparent border border-line rounded-md px-3 py-2 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
                              disabled={isUpdating}
                              required
                            />
                            <button
                              type="submit"
                              disabled={isUpdating || displayName.trim() === user.display_name || !displayName.trim()}
                              className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-5 py-2.5 rounded-md transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              {isUpdating ? "Memperbarui..." : "Ubah Nama"}
                            </button>
                          </div>
                        </div>
                        {updateMessage && (
                          <div className={`p-3 border rounded-md text-xs font-sans font-medium ${
                            updateMessage.type === "success" 
                              ? "bg-status-met/10 border-status-met/20 text-status-met" 
                              : "bg-status-not-met/10 border-status-not-met/20 text-status-not-met"
                          }`}>
                            {updateMessage.text}
                          </div>
                        )}
                      </form>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                        Alamat Email
                      </span>
                      <p className="font-sans text-sm text-ink-muted mt-1">
                        {user.email}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-sans text-[10px] font-bold text-ink-muted tracking-wider uppercase block">
                        User ID (Database ID)
                      </span>
                      <p className="font-mono text-xs text-ink-muted bg-bg/30 border border-line/45 rounded px-3 py-2 mt-1.5 overflow-x-auto select-all">
                        {user.id}
                      </p>
                    </div>
                  </div>
                  
                  <p className="font-sans text-[11px] text-ink-muted italic pt-4 border-t border-line/45">
                    * Data profil di atas disinkronkan secara otomatis melalui akun Google Anda saat pendaftaran.
                  </p>
                </div>
              )}

              {activeTab === "appearance" && (
                <div className="space-y-6">
                  {/* Card 1: Kontras & Tampilan */}
                  <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-5 animate-in fade-in duration-200">
                    <h2 className="font-display text-2xl font-normal text-ink border-b border-line/45 pb-2">
                      Kontras & Tampilan
                    </h2>
                    <p className="font-sans text-sm text-ink-muted leading-relaxed">
                      Sesuaikan visibilitas dan tampilan antarmuka aplikasi.
                    </p>
                    
                    <div className="space-y-1 pt-2">
                      <ToggleRow
                        id="high-contrast-toggle"
                        label="Mode Kontras Tinggi"
                        description="Gunakan warna latar belakang hitam pekat dan teks putih terang untuk keterbacaan optimal."
                        checked={highContrast}
                        onChange={setHighContrast}
                      />
                      <ToggleRow
                        id="reduce-motion-toggle"
                        label="Kurangi Animasi/Gerakan"
                        description="Menonaktifkan semua transisi dan animasi gerakan di seluruh sistem."
                        checked={reduceMotion}
                        onChange={setReduceMotion}
                      />
                    </div>
                  </div>

                  {/* Card 2: Preferensi Teks */}
                  <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-6 animate-in fade-in duration-200">
                    <h2 className="font-display text-2xl font-normal text-ink border-b border-line/45 pb-2">
                      Preferensi Teks
                    </h2>
                    
                    {/* Ukuran Teks (existing) */}
                    <div className="space-y-2">
                      <span className="block font-sans text-sm font-semibold text-ink">
                        Ukuran Teks
                      </span>
                      <span className="block font-sans text-xs text-ink-muted leading-relaxed mt-0.5 mb-3">
                        Sesuaikan ukuran teks dasar di seluruh aplikasi web Aksesibel demi kenyamanan membaca Anda.
                      </span>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => setTextSize("normal")}
                          className={`px-4.5 py-2.5 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                            textSize === "normal"
                              ? "bg-accent text-white border-accent font-semibold shadow-xs"
                              : "bg-surface border-line text-ink hover:bg-bg/40 font-medium"
                          }`}
                        >
                          AA (Normal / 16px)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTextSize("besar")}
                          className={`px-4.5 py-2.5 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                            textSize === "besar"
                              ? "bg-accent text-white border-accent font-semibold shadow-xs"
                              : "bg-surface border-line text-ink hover:bg-bg/40 font-medium"
                          }`}
                        >
                          AA+ (Besar / 18px)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTextSize("sangat-besar")}
                          className={`px-4.5 py-2.5 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                            textSize === "sangat-besar"
                              ? "bg-accent text-white border-accent font-semibold shadow-xs"
                              : "bg-surface border-line text-ink hover:bg-bg/40 font-medium"
                          }`}
                        >
                          AA++ (Sangat Besar / 20px)
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-line/45 my-4" />

                    {/* Jarak Antar Baris (new) */}
                    <div className="space-y-2">
                      <span className="block font-sans text-sm font-semibold text-ink">
                        Jarak Antar Baris
                      </span>
                      <span className="block font-sans text-xs text-ink-muted leading-relaxed mt-0.5 mb-3">
                        Sesuaikan kerenggangan paragraf teks demi kenyamanan membaca Anda.
                      </span>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => setLineSpacing("normal")}
                          className={`px-4.5 py-2.5 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                            lineSpacing === "normal"
                              ? "bg-accent text-white border-accent font-semibold shadow-xs"
                              : "bg-surface border-line text-ink hover:bg-bg/40 font-medium"
                          }`}
                        >
                          Normal (1.5)
                        </button>
                        <button
                          type="button"
                          onClick={() => setLineSpacing("lega")}
                          className={`px-4.5 py-2.5 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                            lineSpacing === "lega"
                              ? "bg-accent text-white border-accent font-semibold shadow-xs"
                              : "bg-surface border-line text-ink hover:bg-bg/40 font-medium"
                          }`}
                        >
                          Lega (1.8)
                        </button>
                        <button
                          type="button"
                          onClick={() => setLineSpacing("sangat-lega")}
                          className={`px-4.5 py-2.5 border rounded font-sans text-sm font-semibold transition-all cursor-pointer ${
                            lineSpacing === "sangat-lega"
                              ? "bg-accent text-white border-accent font-semibold shadow-xs"
                              : "bg-surface border-line text-ink hover:bg-bg/40 font-medium"
                          }`}
                        >
                          Sangat Lega (2.2)
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-line/45 my-4" />

                    {/* Font Ramah Disleksia (new) */}
                    <div className="space-y-1">
                      <ToggleRow
                        id="dyslexia-font-toggle"
                        label="Font Ramah Disleksia"
                        description="Gunakan font khusus 'Lexend' yang dirancang untuk membantu penderita disleksia membaca dengan lebih mudah."
                        checked={dyslexiaFont}
                        onChange={setDyslexiaFont}
                      />
                    </div>
                  </div>

                  {/* Card 3: Navigasi & Interaksi */}
                  <div className="bg-surface border-l-4 border-accent p-6 md:p-8 rounded-r-md border border-line shadow-xs space-y-5 animate-in fade-in duration-200">
                    <h2 className="font-display text-2xl font-normal text-ink border-b border-line/45 pb-2">
                      Navigasi & Interaksi
                    </h2>
                    <p className="font-sans text-sm text-ink-muted leading-relaxed">
                      Sesuaikan tombol dan tautan untuk navigasi yang lebih mudah dan ramah motorik.
                    </p>
                    
                    <div className="space-y-1 pt-2">
                      <ToggleRow
                        id="large-targets-toggle"
                        label="Perbesar Area Klik"
                        description="Memperbesar ukuran minimum tombol dan tautan interaktif menjadi minimal 44x44px untuk kemudahan menekan."
                        checked={largeTargets}
                        onChange={setLargeTargets}
                      />
                      <ToggleRow
                        id="underline-links-toggle"
                        label="Selalu Garis Bawahi Tautan"
                        description="Memaksa semua tautan/link teks memiliki garis bawah agar lebih mudah dibedakan tanpa bergantung pada warna."
                        checked={underlineLinks}
                        onChange={setUnderlineLinks}
                      />
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
