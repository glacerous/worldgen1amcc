import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

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

  const login = () => {
    window.location.href = `${BACKEND_URL}/auth/google`;
  };

  const logout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("aksesibel_token");
      localStorage.removeItem("aksesibel_user");
    }
    setUser(null);
    setToken(null);
    router.push("/");
  };

  return { user, token, loading, login, logout };
}
