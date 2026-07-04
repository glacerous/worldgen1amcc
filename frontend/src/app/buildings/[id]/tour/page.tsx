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

interface Scene {
  id: string;
  building_id: string;
  type: "panorama_360" | "gaussian_splat";
  file_url: string;
  label: string | null;
  created_at: string;
}

interface Annotation {
  id: string;
  scene_id: string;
  audit_result_id: string | null;
  label: string;
  pitch: number;
  yaw: number;
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
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadData() {
      try {
        const [buildingRes, scenesRes] = await Promise.all([
          fetch(`http://localhost:8000/buildings/${id}`),
          fetch(`http://localhost:8000/scenes?building_id=${id}`),
        ]);

        if (!buildingRes.ok) {
          if (buildingRes.status === 404) {
            setBuilding(null);
            setIsLoading(false);
            return;
          }
          throw new Error("Gagal memuat detail gedung.");
        }

        if (!scenesRes.ok) {
          throw new Error("Gagal memuat panorama gedung.");
        }

        const buildingData = await buildingRes.json();
        const scenesData: Scene[] = await scenesRes.json();

        setBuilding(buildingData);
        
        // Filter panorama_360 type scenes
        const panoramaScenes = scenesData.filter((s) => s.type === "panorama_360");
        setScenes(panoramaScenes);

        // Fetch annotations for first panorama scene if exists
        if (panoramaScenes.length > 0) {
          const firstSceneId = panoramaScenes[0].id;
          const annotationsRes = await fetch(`http://localhost:8000/scenes/${firstSceneId}/annotations`);
          if (annotationsRes.ok) {
            const annotationsData = await annotationsRes.json();
            setAnnotations(annotationsData);
          }
        }
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

  // If no scenes are found, display a beautiful empty state
  if (scenes.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-md bg-surface border border-line flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-ink-muted/80" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
          </div>
          <h2 className="font-display text-lg font-medium text-ink mb-2">
            Tur 360° Belum Tersedia
          </h2>
          <p className="font-sans text-xs text-ink-muted mb-6 leading-relaxed">
            Tur 360° belum tersedia untuk gedung ini — jadilah yang pertama menambahkan!
          </p>
          <div className="flex gap-3">
            <Link
              href={`/buildings/${building.id}`}
              className="inline-flex items-center justify-center border border-line hover:bg-bg/40 font-sans text-xs font-semibold px-4 py-2 rounded-md text-ink transition-all cursor-pointer"
            >
              Kembali
            </Link>
            <Link
              href="/buildings/submit"
              className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
            >
              Tambah Foto 360°
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const activeScene = scenes[0];

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-10 md:py-12 max-w-5xl mx-auto w-full">
        {/* Navigation & Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-line/45">
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-[10px] font-sans font-bold text-accent uppercase tracking-wider">
                Tur Aksesibilitas 360°
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-accent/20 bg-accent/5 rounded-md text-[9px] font-sans font-semibold text-accent uppercase tracking-wider">
                <span className="w-1 h-1 rounded-full bg-accent animate-ping" />
                Titik ditandai otomatis oleh AI
              </span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-normal text-ink mt-1 leading-tight">
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
        <TourViewer annotations={annotations} fallbackImageUrl={activeScene.file_url} />

        {/* Instruction Footer Text */}
        <p className="text-[10px] font-sans text-ink-muted mt-3 italic text-center">
          * Seret/drag mouse Anda pada gambar untuk berputar 360°. Klik ikon info hotspot untuk melihat detail evaluasi kriteria.
        </p>
      </main>
    </div>
  );
}
