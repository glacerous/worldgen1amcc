"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, login, logout, loading } = useAuth();
  const [textSize, setTextSize] = useState<"normal" | "besar" | "sangat-besar">("normal");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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
    <nav className="sticky top-2 sm:top-4 z-50 mx-2 sm:mx-4 md:mx-12 my-2 bg-surface border border-line rounded-full py-2.5 sm:py-3.5 px-4 sm:px-6 md:px-8 flex items-center justify-between shadow-sm transition-all">
      {/* Left: Brand Logo & Title */}
      <div className="flex items-center">
        <Link href="/" className="group flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Aksesibel Logo" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
          <span className="font-display text-lg sm:text-2xl font-bold text-ink group-hover:text-accent transition-all hidden sm:inline">Aksesibel</span>
        </Link>
      </div>

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
      <div className="flex items-center space-x-2 sm:space-x-4 md:space-x-6">
        {!loading ? (
          user ? (
            <div className="flex items-center space-x-1.5 sm:space-x-3">
              <svg 
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-line bg-accent/10 text-accent p-1 sm:p-1.5" 
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
                className="inline-flex items-center gap-1 font-sans text-xs sm:text-sm font-semibold text-status-not-met hover:opacity-80 transition-all cursor-pointer focus:outline-none"
                title="Keluar"
                aria-label="Keluar dari akun"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                <span className="hidden sm:inline">Keluar</span>
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

        {/* Text Size (Custom Dropdown) */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 border border-line rounded-full px-3 py-1.5 bg-bg/20 hover:bg-bg/40 text-ink hover:text-accent hover:border-accent/40 transition-all font-sans text-xs font-semibold cursor-pointer focus:outline-none"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Ubah ukuran teks"
          >
            <span className="text-[10px] font-sans font-bold text-ink-muted uppercase tracking-wider hidden sm:inline">Axs:</span>
            <span className="font-sans font-semibold">
              {textSize === "normal" && "AA"}
              {textSize === "besar" && "AA+"}
              {textSize === "sangat-besar" && "AA++"}
            </span>
            <svg className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {/* Premium Dropdown Menu Card */}
          {isOpen && (
            <div className="absolute right-0 top-full mt-2.5 w-48 bg-surface border border-line rounded-md shadow-md py-1.5 z-[999] animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="px-3 py-1.5 border-b border-line/45 mb-1.5">
                <span className="text-[10px] font-sans font-bold text-ink-muted uppercase tracking-wider block">
                  Ukuran Teks
                </span>
              </div>
              
              <button
                type="button"
                onClick={() => {
                  handleTextSizeChange("normal");
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-bg/40 transition-colors flex items-center justify-between cursor-pointer focus:outline-none ${
                  textSize === "normal" ? "font-bold text-accent bg-accent/5" : "text-ink"
                }`}
              >
                <span>AA (Normal)</span>
                <span className="text-[10px] text-ink-muted font-normal">16px</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  handleTextSizeChange("besar");
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-bg/40 transition-colors flex items-center justify-between cursor-pointer focus:outline-none ${
                  textSize === "besar" ? "font-bold text-accent bg-accent/5" : "text-ink"
                }`}
              >
                <span>AA+ (Besar)</span>
                <span className="text-[10px] text-ink-muted font-normal">18px</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  handleTextSizeChange("sangat-besar");
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-bg/40 transition-colors flex items-center justify-between cursor-pointer focus:outline-none ${
                  textSize === "sangat-besar" ? "font-bold text-accent bg-accent/5" : "text-ink"
                }`}
              >
                <span>AA++ (Sangat Besar)</span>
                <span className="text-[10px] text-ink-muted font-normal">20px</span>
              </button>
            </div>
          )}
        </div>

        <Link 
          href="/buildings/submit"
          className="hidden sm:inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs sm:text-sm font-semibold px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-all whitespace-nowrap"
        >
          Mulai Audit
        </Link>
      </div>
    </nav>
  );
}
