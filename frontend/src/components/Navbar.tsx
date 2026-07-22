"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  useEffect(() => {
    const adminToken = sessionStorage.getItem("admin_token");
    setIsAdminLoggedIn(!!adminToken);
  }, [pathname]);

  const handleAdminLogout = () => {
    sessionStorage.removeItem("admin_token");
    document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; samesite=lax";
    setIsAdminLoggedIn(false);
    router.push("/admin/login");
  };

  const isAdminRoute = pathname?.startsWith("/admin");

  return (
    <nav className="sticky top-2 sm:top-4 z-50 mx-2 sm:mx-4 md:mx-12 my-2 bg-surface border border-line rounded-full py-2.5 sm:py-3.5 px-4 sm:px-6 md:px-8 flex items-center justify-between shadow-sm transition-all">
      {/* Left: Brand Logo & Title */}
      <div className="flex items-center">
        <Link href="/" className="group flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Aksesibel Logo" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
          <span className="font-display text-lg sm:text-2xl font-bold text-ink group-hover:text-accent transition-all hidden sm:inline">Aksesibel</span>
        </Link>
        {isAdminRoute && (
          <span className="ml-3 bg-accent text-white text-[9px] font-sans font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Admin Panel
          </span>
        )}
      </div>

      {/* Center: Nav links */}
      <div className="hidden md:flex items-center space-x-8">
        <Link 
          href="/buildings" 
          className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          Cari Gedung
        </Link>
        {isAdminLoggedIn && !isAdminRoute && pathname !== "/" && (
          <Link 
            href="/admin" 
            className="font-sans text-sm font-semibold text-accent hover:underline transition-colors"
          >
            Dashboard Admin
          </Link>
        )}
      </div>

      {/* Right: Action button & Auth info */}
      <div className="flex items-center space-x-2 sm:space-x-4 md:space-x-6">
        {isAdminRoute ? (
          <button 
            onClick={handleAdminLogout}
            className="inline-flex items-center gap-1 font-sans text-xs sm:text-sm font-semibold text-status-not-met hover:opacity-80 transition-all cursor-pointer focus:outline-none"
            title="Keluar Admin"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            <span>Keluar Admin</span>
          </button>
        ) : !loading ? (
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
              <Link 
                href="/settings"
                className="inline-flex items-center gap-1 font-sans text-xs sm:text-sm font-semibold text-ink-muted hover:text-accent transition-all cursor-pointer focus:outline-none"
                title="Pengaturan"
                aria-label="Buka Pengaturan"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.645-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">Pengaturan</span>
              </Link>
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
          <span className="font-sans text-sm font-medium text-transparent select-none pointer-events-none">
            Login
          </span>
        )}
      </div>
    </nav>
  );
}
