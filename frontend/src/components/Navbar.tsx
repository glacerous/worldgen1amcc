"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, login, logout } = useAuth();

  return (
    <nav className="bg-surface border-b border-line py-4 px-6 md:px-12 flex items-center justify-between">
      {/* Left: Branding Wordmark */}
      <Link href="/" className="group">
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
        <Link 
          href="/audit" 
          className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          Jelajahi
        </Link>
        <Link 
          href="/about" 
          className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          Panduan
        </Link>
      </div>

      {/* Right: Action button & Auth info */}
      <div className="flex items-center space-x-4 md:space-x-6">
        {user ? (
          <div className="flex items-center space-x-3">
            {user.avatar_url && (
              <img 
                src={user.avatar_url} 
                alt={user.display_name} 
                className="w-8 h-8 rounded-full border border-line" 
              />
            )}
            <span className="hidden sm:inline font-sans text-sm font-semibold text-ink">
              {user.display_name}
            </span>
            <button 
              onClick={logout}
              className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
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
        )}

        <Link 
          href="/buildings/submit"
          className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-sm font-semibold px-4 py-2 rounded-md transition-all"
        >
          Mulai Audit
        </Link>
      </div>
    </nav>
  );
}
