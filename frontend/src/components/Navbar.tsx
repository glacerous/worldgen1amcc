"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, login, logout, loading } = useAuth();
  const [textSize, setTextSize] = useState<"normal" | "besar" | "sangat-besar">("normal");

  useEffect(() => {
    const saved = localStorage.getItem("aksesibel-text-size");
    if (saved === "normal" || saved === "besar" || saved === "sangat-besar") {
      setTextSize(saved);
    }
  }, []);

  const handleTextSizeChange = (size: "normal" | "besar" | "sangat-besar") => {
    setTextSize(size);
    const sizeMap = {
      normal: "16px",
      besar: "18px",
      "sangat-besar": "20px",
    };
    document.documentElement.style.setProperty("--base-font-size", sizeMap[size]);
    localStorage.setItem("aksesibel-text-size", size);
  };

  return (
    <nav className="sticky top-4 z-50 mx-4 md:mx-12 my-2 bg-surface border border-line rounded-full py-3.5 px-6 md:px-8 flex items-center justify-between shadow-sm transition-all">
      {/* Left: Branding Wordmark */}
      <Link href="/" className="group flex items-center gap-2.5">
        <img 
          src="/logo.png" 
          alt="Aksesibel Logo" 
          className="w-8 h-8 object-contain"
        />
        <span className="font-display text-2xl font-bold text-ink group-hover:text-accent transition-all">
          Aksesibel
        </span>
      </Link>

      {/* Center: Nav links */}
      <div className="hidden md:flex items-center space-x-8">
        <Link 
          href="/buildings" 
          className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          Cari Gedung
        </Link>
      </div>

      {/* Right: Action button & Auth info */}
      <div className="flex items-center space-x-4 md:space-x-6">
        {!loading ? (
          user ? (
            <div className="flex items-center space-x-3">
              <svg 
                className="w-8 h-8 rounded-full border border-line bg-accent/10 text-accent p-1.5" 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline font-sans text-sm font-semibold text-ink">
                {user.display_name}
              </span>
              <button 
                onClick={logout}
                className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-status-not-met hover:opacity-80 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Keluar
              </button>
            </div>
          ) : (
            <Link 
              href="/login"
              className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              Login
            </Link>
          )
        ) : (
          <div className="w-9 h-5"></div>
        )}

        {/* Text Size (A11y Toggle) */}
        <div className="flex items-center space-x-1 border border-line rounded-full px-2.5 py-1 bg-bg/20">
          <span className="text-[10px] font-sans font-bold text-ink-muted uppercase tracking-wider hidden lg:inline">Axs</span>
          <select
            value={textSize}
            onChange={(e) => handleTextSizeChange(e.target.value as any)}
            className="bg-transparent text-xs font-sans text-ink font-semibold focus:outline-none cursor-pointer border-none py-0.5 pr-1"
            aria-label="Ukuran Teks"
          >
            <option value="normal">AA (Normal)</option>
            <option value="besar">AA+ (Besar)</option>
            <option value="sangat-besar">AA++ (Sangat Besar)</option>
          </select>
        </div>

        <Link 
          href="/buildings/submit"
          className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-sm font-semibold px-4 py-2 rounded-full transition-all"
        >
          Mulai Audit
        </Link>
      </div>
    </nav>
  );
}
