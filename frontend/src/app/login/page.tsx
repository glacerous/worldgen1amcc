"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in, redirect to admin page directly
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_token")) {
      router.push("/admin");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!email.trim() || !password) {
      setError("Email dan password wajib diisi.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Email atau password salah.");
      }

      const data = await res.json();
      if (data.access_token) {
        sessionStorage.setItem("admin_token", data.access_token);
        // Expiry 7 days matching backend JWT exp
        document.cookie = `admin_token=${data.access_token}; path=/; max-age=604800; samesite=lax`;
        router.push("/admin");
      } else {
        throw new Error("Gagal menerima token akses dari server.");
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan koneksi server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-12 md:py-16 max-w-sm mx-auto w-full flex flex-col justify-center">
        <div className="bg-surface border border-line rounded-md p-6 md:p-8 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl font-normal text-ink mb-1">
              Admin Login
            </h1>
            <p className="font-sans text-xs text-ink-muted">
              Masuk untuk mengelola data gedung dan pelaporan komunitas.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-status-not-met/10 border border-status-not-met/20 rounded-md text-xs text-status-not-met font-sans font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[10px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
                Alamat Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@aksesibel.id"
                className="w-full bg-transparent border border-line rounded-md px-3 py-2 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[10px] font-sans font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
                Kata Sandi
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent border border-line rounded-md px-3 py-2 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
                required
                disabled={isLoading}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? "Mengautentikasi..." : "Masuk"}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-line/50 text-center">
            <Link
              href="/buildings"
              className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
