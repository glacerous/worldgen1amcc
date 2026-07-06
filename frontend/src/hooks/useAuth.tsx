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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("aksesibel_token");
      const storedUser = localStorage.getItem("aksesibel_user");

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

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
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
