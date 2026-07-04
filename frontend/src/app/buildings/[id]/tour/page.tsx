"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import dynamic from "next/dynamic";

// Dynamically import TourViewer to avoid server-side pre-rendering errors with Pannellum
const TourViewer = dynamic(() => import("@/components/TourViewer"), {
  ssr: false,
  loading: () => (
    <div className="h-[65vh] bg-bg/50 border border-line rounded-md flex items-center justify-center font-sans text-xs text-ink-muted animate-pulse">
      Memuat Viewer 360°...
    </div>
  ),
});

interface Building {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
}

interface Annotation {
  id: string;
  building_id: string;
  audit_result_id: string | null;
  label: string;
  pitch: number;
  yaw: number;
  photo_url: string;
  audit_results: {
    status: "met" | "not_met" | "unknown" | "na";
    reasoning: string | null;
    audit_criteria: {
      code: string;
      description: string;
      category: string;
    } | null;
  } | null;
}

export default function BuildingTourPage() {
  const params = useParams();
  const id = params.id as string;

  const [building, setBuilding] = useState<Building | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadData() {
      try {
        const [buildingRes, annotationsRes] = await Promise.all([
          fetch(`http://localhost:8000/buildings/${id}`),
          fetch(`http://localhost:8000/annotations/${id}`),
        ]);

        if (!buildingRes.ok) {
          if (buildingRes.status === 404) {
            setBuilding(null);
            setIsLoading(false);
            return;
          }
          throw new Error("Gagal memuat detail gedung.");
        }

        if (!annotationsRes.ok) {
          throw new Error("Gagal memuat anotasi gedung.");
        }

        const [buildingData, annotationsData] = await Promise.all([
          buildingRes.json(),
          annotationsRes.json(),
        ]);

        setBuilding(buildingData);
        setAnnotations(annotationsData);
      } catch (err: any) {
        setError(err.message || "Terjadi kesalahan koneksi.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <Navbar />
        <main className="flex-1 px-6 py-10 md:py-12 max-w-5xl mx-auto w-full space-y-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-line rounded w-20"></div>
            <div className="h-6 bg-line rounded w-1/3"></div>
            <div className="h-4 bg-line rounded w-1/2"></div>
          </div>
          <div className="h-[65vh] bg-bg/50 border border-line rounded-md flex items-center justify-center font-sans text-xs text-ink-muted animate-pulse">
            Memuat Viewer 360°...
          </div>
        </main>
      </div>
    );
  }

  if (error || !building) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h1 className="font-display text-3xl font-medium text-ink mb-4">
            {error ? "Terjadi Kesalahan" : "Gedung Tidak Ditemukan"}
          </h1>
          <p className="font-sans text-sm text-ink-muted mb-8 max-w-sm">
            {error ? error : "Gedung publik dengan ID tersebut tidak terdaftar di database kami."}
          </p>
          <Link
            href="/buildings"
            className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all cursor-pointer"
          >
            Kembali ke Daftar Gedung
          </Link>
        </main>
      </div>
    );
  }

  // Fallback panorama URL for testing
  const fallbackUrl = "https://pannellum.org/images/tocopilla.jpg";

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-10 md:py-12 max-w-5xl mx-auto w-full">
        {/* Navigation & Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-line/45">
          <div>
            <span className="text-[10px] font-sans font-bold text-accent uppercase tracking-wider">
              Tur Aksesibilitas 360°
            </span>
            <h1 className="font-display text-2xl md:text-3xl font-normal text-ink mt-0.5 leading-tight">
              {building.name}
            </h1>
            <p className="font-sans text-xs text-ink-muted mt-1">
              {building.address || "Alamat belum ditambahkan."}
            </p>
          </div>
          
          <Link
            href={`/buildings/${building.id}`}
            className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2.5 rounded-md transition-all w-fit cursor-pointer"
          >
            Kembali ke Dashboard Gedung
          </Link>
        </div>

        {/* 360° Tour Viewer Component */}
        <TourViewer annotations={annotations} fallbackImageUrl={fallbackUrl} />

        {/* Instruction Footer Text */}
        <p className="text-[10px] font-sans text-ink-muted mt-3 italic text-center">
          * Seret/drag mouse Anda pada gambar untuk berputar 360°. Klik ikon info hotspot untuk melihat detail evaluasi kriteria.
        </p>
      </main>
    </div>
  );
}
