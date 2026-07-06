"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/buildings/submit";
  
  const { login, user, loading } = useAuth();

  // If already logged in via Google, redirect immediately
  useEffect(() => {
    if (!loading && user) {
      router.push(redirect);
    }
  }, [user, loading, router, redirect]);

  const handleGoogleLogin = () => {
    login(redirect);
  };

  return (
    <main className="flex-1 px-6 py-12 md:py-20 max-w-md mx-auto w-full flex flex-col justify-center animate-fade-in">
      <div className="bg-surface border border-line rounded-lg p-8 shadow-sm transition-all">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="font-display text-3xl font-bold text-accent mb-2 block">
            Aksesibel
          </span>
          <h1 className="font-display text-xl font-medium text-ink mb-2">
            Masuk ke Akun Anda
          </h1>
          <p className="font-sans text-xs text-ink-muted leading-relaxed">
            Gunakan akun Google Anda untuk mulai berkontribusi dalam audit aksesibilitas gedung publik.
          </p>
        </div>

        {/* Primary View: User Google Login */}
        <div className="space-y-6">
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-bg border border-line text-ink font-sans text-sm font-semibold py-3 px-4 rounded-md transition-all shadow-xs cursor-pointer focus:outline-none"
          >
            {/* Google Colored Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Login dengan Google
          </button>
        </div>

        <div className="mt-8 pt-4 border-t border-line/50 text-center">
          <Link
            href="/"
            className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center bg-bg">
          <div className="w-8 h-8 border-4 border-accent/25 border-t-accent rounded-full animate-spin"></div>
        </div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  );
}
