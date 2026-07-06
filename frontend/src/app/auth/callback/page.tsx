"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const redirect = searchParams.get("redirect");

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    if (!token) {
      router.push("/");
      return;
    }

    // 1. Simpan token ke localStorage key "aksesibel_token"
    localStorage.setItem("aksesibel_token", token);

    // 2. Fetch GET /auth/me untuk dapat data user
    fetch(`${BACKEND_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Gagal mengambil profil pengguna.");
        }
        return res.json();
      })
      .then((userData) => {
        // 3. Simpan user ke localStorage key "aksesibel_user"
        localStorage.setItem("aksesibel_user", JSON.stringify(userData));
        
        // 4. Redirect ke /buildings/submit atau parameter redirect asal
        const targetPath = redirect || "/buildings/submit";
        window.location.href = targetPath;
      })
      .catch((err) => {
        console.error("Autentikasi gagal:", err);
        localStorage.removeItem("aksesibel_token");
        window.location.href = "/";
      });
  }, [token, redirect, router, BACKEND_URL]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg font-sans">
      <div className="bg-surface p-8 rounded-lg border border-line shadow-sm max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin"></div>
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink">Menyelesaikan Autentikasi...</h2>
        <p className="font-sans text-sm text-ink-muted leading-relaxed">
          Mohon tunggu sebentar selagi kami menghubungkan akun Google Anda.
        </p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg font-sans">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto"></div>
          <p className="text-ink-muted">Memuat...</p>
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
