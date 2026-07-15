"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (redirectPath?: string) => void;
  logout: () => void;
  textSize: "normal" | "besar" | "sangat-besar";
  setTextSize: (size: "normal" | "besar" | "sangat-besar") => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [textSize, setTextSizeState] = useState<"normal" | "besar" | "sangat-besar">("normal");

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("aksesibel_token");
      const storedUser = localStorage.getItem("aksesibel_user");
      const savedTextSize = localStorage.getItem("aksesibel-text-size");

      if (storedToken) {
        setToken(storedToken);
      }
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error("Gagal mengurai data user dari localStorage", e);
        }
      }
      if (savedTextSize === "normal" || savedTextSize === "besar" || savedTextSize === "sangat-besar") {
        setTextSizeState(savedTextSize);
      }
      setLoading(false);
    }
  }, []);

  const login = (redirectPath?: string) => {
    let url = `${BACKEND_URL}/auth/google`;
    if (redirectPath) {
      url += `?redirect=${encodeURIComponent(redirectPath)}`;
    }
    window.location.href = url;
  };

  const logout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("aksesibel_token");
      localStorage.removeItem("aksesibel_user");
    }
    setUser(null);
    setToken(null);
    window.location.href = "/";
  };

  const setTextSize = (size: "normal" | "besar" | "sangat-besar") => {
    setTextSizeState(size);
    const sizeMap = {
      normal: "16px",
      besar: "18px",
      "sangat-besar": "20px",
    };
    if (typeof window !== "undefined") {
      document.documentElement.style.setProperty("--base-font-size", sizeMap[size]);
      localStorage.setItem("aksesibel-text-size", size);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, textSize, setTextSize }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
