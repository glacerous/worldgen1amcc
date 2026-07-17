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
  updateUser: (updatedUser: User, newToken: string) => void;
  highContrast: boolean;
  setHighContrast: (val: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (val: boolean) => void;
  lineSpacing: "normal" | "lega" | "sangat-lega";
  setLineSpacing: (val: "normal" | "lega" | "sangat-lega") => void;
  dyslexiaFont: boolean;
  setDyslexiaFont: (val: boolean) => void;
  largeTargets: boolean;
  setLargeTargets: (val: boolean) => void;
  underlineLinks: boolean;
  setUnderlineLinks: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [textSize, setTextSizeState] = useState<"normal" | "besar" | "sangat-besar">("normal");
  const [highContrast, setHighContrastState] = useState(false);
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [lineSpacing, setLineSpacingState] = useState<"normal" | "lega" | "sangat-lega">("normal");
  const [dyslexiaFont, setDyslexiaFontState] = useState(false);
  const [largeTargets, setLargeTargetsState] = useState(false);
  const [underlineLinks, setUnderlineLinksState] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("aksesibel_token");
      const storedUser = localStorage.getItem("aksesibel_user");
      const savedTextSize = localStorage.getItem("aksesibel-text-size");
      const savedHighContrast = localStorage.getItem("aksesibel_high_contrast") === "true";
      const savedReduceMotion = localStorage.getItem("aksesibel_reduce_motion") === "true";
      const savedLineSpacing = localStorage.getItem("aksesibel_line_spacing");
      const savedDyslexiaFont = localStorage.getItem("aksesibel_dyslexia_font") === "true";
      const savedLargeTargets = localStorage.getItem("aksesibel_large_targets") === "true";
      const savedUnderlineLinks = localStorage.getItem("aksesibel_underline_links") === "true";

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

      setHighContrastState(savedHighContrast);
      setReduceMotionState(savedReduceMotion);
      if (savedLineSpacing === "normal" || savedLineSpacing === "lega" || savedLineSpacing === "sangat-lega") {
        setLineSpacingState(savedLineSpacing);
      }
      setDyslexiaFontState(savedDyslexiaFont);
      setLargeTargetsState(savedLargeTargets);
      setUnderlineLinksState(savedUnderlineLinks);

      setLoading(false);
    }
  }, []);

  // Reactively apply accessibility preferences to documentElement (runs on mount and state changes)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const applyClass = (className: string, active: boolean) => {
        if (active) {
          document.documentElement.classList.add(className);
        } else {
          document.documentElement.classList.remove(className);
        }
      };

      applyClass("high-contrast", highContrast);
      applyClass("reduce-motion", reduceMotion);
      applyClass("dyslexia-font", dyslexiaFont);
      applyClass("large-targets", largeTargets);
      applyClass("underline-links", underlineLinks);

      const spacingMap = {
        normal: "1.5",
        lega: "1.8",
        "sangat-lega": "2.2",
      };
      document.documentElement.style.setProperty("--base-line-height", spacingMap[lineSpacing]);
    }
  }, [highContrast, reduceMotion, lineSpacing, dyslexiaFont, largeTargets, underlineLinks]);

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

  const setHighContrast = (val: boolean) => {
    setHighContrastState(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("aksesibel_high_contrast", String(val));
    }
  };

  const setReduceMotion = (val: boolean) => {
    setReduceMotionState(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("aksesibel_reduce_motion", String(val));
    }
  };

  const setLineSpacing = (val: "normal" | "lega" | "sangat-lega") => {
    setLineSpacingState(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("aksesibel_line_spacing", val);
    }
  };

  const setDyslexiaFont = (val: boolean) => {
    setDyslexiaFontState(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("aksesibel_dyslexia_font", String(val));
    }
  };

  const setLargeTargets = (val: boolean) => {
    setLargeTargetsState(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("aksesibel_large_targets", String(val));
    }
  };

  const setUnderlineLinks = (val: boolean) => {
    setUnderlineLinksState(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("aksesibel_underline_links", String(val));
    }
  };

  const updateUser = (updatedUser: User, newToken: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("aksesibel_token", newToken);
      localStorage.setItem("aksesibel_user", JSON.stringify(updatedUser));
    }
    setUser(updatedUser);
    setToken(newToken);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        textSize,
        setTextSize,
        updateUser,
        highContrast,
        setHighContrast,
        reduceMotion,
        setReduceMotion,
        lineSpacing,
        setLineSpacing,
        dyslexiaFont,
        setDyslexiaFont,
        largeTargets,
        setLargeTargets,
        underlineLinks,
        setUnderlineLinks,
      }}
    >
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
