"use client";

import { useState, useEffect, useRef } from "react";
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

interface Hotspot {
  id: string;
  source_scene_id: string;
  target_scene_id: string;
  pitch: number;
  yaw: number;
  label: string | null;
}

export default function BuildingTourPage() {
  const params = useParams();
  const id = params.id as string;
  const pannellumRef = useRef<any>(null);

  const [building, setBuilding] = useState<Building | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Mode states
  const [editMode, setEditMode] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadingScene, setIsUploadingScene] = useState(false);

  // New Hotspot states
  const [targetSceneId, setTargetSceneId] = useState("");
  const [hotspotLabel, setHotspotLabel] = useState("");
  const [isAddingHotspot, setIsAddingHotspot] = useState(false);

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Load building and list of scenes
  useEffect(() => {
    if (!id || !UUID_REGEX.test(id)) return;
    loadBuildingAndScenes();
  }, [id]);

  // Load annotations & hotspots for active scene
  useEffect(() => {
    if (!activeScene || !activeScene.id || !UUID_REGEX.test(activeScene.id)) return;
    loadActiveSceneData(activeScene.id);
  }, [activeScene]);

  async function loadBuildingAndScenes() {
    try {
      const [buildingRes, scenesRes] = await Promise.all([
        fetch(`http://127.0.0.1:8000/buildings/${id}`),
        fetch(`http://127.0.0.1:8000/scenes?building_id=${id}`),
      ]);

      if (!buildingRes.ok) {
        if (buildingRes.status === 404) {
          setBuilding(null);
          setIsLoading(false);
          return;
        }
        const errText = await buildingRes.text().catch(() => "");
        throw new Error(`Gagal memuat detail gedung (status ${buildingRes.status}): ${errText}`);
      }

      if (!scenesRes.ok) {
        const errText = await scenesRes.text().catch(() => "");
        throw new Error(`Gagal memuat panorama gedung (status ${scenesRes.status}): ${errText}`);
      }

      const buildingData = await buildingRes.json();
      const scenesData: Scene[] = await scenesRes.json();

      setBuilding(buildingData);
      
      const panoramaScenes = scenesData.filter((s) => s.type === "panorama_360");
      setScenes(panoramaScenes);

      if (panoramaScenes.length > 0) {
        // If there was an active scene already selected, keep it if it still exists.
        // Otherwise, default to the first scene.
        setActiveScene((prev) => {
          if (prev) {
            const stillExists = panoramaScenes.find((s) => s.id === prev.id);
            if (stillExists) return stillExists;
          }
          return panoramaScenes[0];
        });
      } else {
        setActiveScene(null);
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan koneksi.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadActiveSceneData(sceneId: string) {
    try {
      const [annotationsRes, sceneLinksRes] = await Promise.all([
        fetch(`http://127.0.0.1:8000/scenes/${sceneId}/annotations`),
        fetch(`http://127.0.0.1:8000/scenes/${sceneId}/scene-links`),
      ]);

      if (annotationsRes.ok) {
        const annotationsData = await annotationsRes.json();
        setAnnotations(annotationsData);
      }
      if (sceneLinksRes.ok) {
        const sceneLinksData = await sceneLinksRes.json();
        setHotspots(sceneLinksData);
      }
    } catch (err) {
      console.error("Gagal memuat detail anotasi/scene links untuk scene:", err);
    }
  }

  // Handle scene navigation via hotspot click
  const handleNavigateToScene = (targetId: string) => {
    const target = scenes.find((s) => s.id === targetId);
    if (target) {
      setActiveScene(target);
    } else {
      console.warn("Target scene tidak ditemukan di dalam list scenes gedung.");
    }
  };

  // Upload a new panorama scene
  const handleUploadScene = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadLabel.trim()) {
      alert("Pilih file foto 360 dan isi label ruangan.");
      return;
    }

    setIsUploadingScene(true);
    const formData = new FormData();
    formData.append("building_id", id);
    formData.append("label", uploadLabel.trim());
    formData.append("file", uploadFile);

    const token = typeof window !== "undefined" ? sessionStorage.getItem("admin_token") : null;
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/scenes", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Gagal mengunggah foto panorama.");
      }

      const newScene: Scene = await res.json();
      
      // Reset upload inputs
      setUploadLabel("");
      setUploadFile(null);
      
      // Reload scenes list and set newly uploaded scene as active
      await loadBuildingAndScenes();
      setActiveScene(newScene);
      
      alert("Foto 360° baru berhasil diunggah.");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsUploadingScene(false);
    }
  };

  // Delete active scene
  const handleDeleteActiveScene = async () => {
    if (!activeScene) return;
    if (!confirm(`Apakah Anda yakin ingin menghapus scene "${activeScene.label || "Tanpa Nama"}"? Semua anotasi dan hotspot terkait akan ikut terhapus.`)) {
      return;
    }

    const token = typeof window !== "undefined" ? sessionStorage.getItem("admin_token") : null;
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:8000/scenes/${activeScene.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Gagal menghapus scene.");
      }

      alert("Scene berhasil dihapus.");
      setActiveScene(null);
      await loadBuildingAndScenes();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Add navigation hotspot
  const handleCreateHotspot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeScene) return;
    if (!targetSceneId) {
      alert("Silakan pilih target scene tujuan.");
      return;
    }

    // Get current yaw/pitch from Pannellum viewer center
    let pitch = 0;
    let yaw = 0;
    try {
      const viewer = pannellumRef.current?.getViewer();
      if (viewer) {
        pitch = viewer.getPitch();
        yaw = viewer.getYaw();
      }
    } catch (err) {
      console.error("Gagal mendapatkan koordinat dari penonton pannellum:", err);
      alert("Gagal mengambil orientasi kamera. Pastikan penonton sudah termuat sepenuhnya.");
      return;
    }

    setIsAddingHotspot(true);

    try {
      const res = await fetch(`http://127.0.0.1:8000/scenes/${activeScene.id}/scene-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_scene_id: targetSceneId,
          pitch: pitch,
          yaw: yaw,
          label: hotspotLabel.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Gagal membuat penanda navigasi.");
      }

      // Reset input
      setTargetSceneId("");
      setHotspotLabel("");

      // Reload scene links for active scene
      await loadActiveSceneData(activeScene.id);
      alert("Penanda navigasi berhasil ditambahkan ke arah bidikan kamera!");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsAddingHotspot(false);
    }
  };

  // Delete specific hotspot
  const handleDeleteHotspot = async (hotspotId: string) => {
    if (!activeScene) return;
    if (!confirm("Apakah Anda yakin ingin menghapus hotspot navigasi ini?")) {
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:8000/scenes/scene-links/${hotspotId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Gagal menghapus penanda navigasi.");
      }

      // Reload scene links for active scene
      await loadActiveSceneData(activeScene.id);
      alert("Penanda navigasi berhasil dihapus.");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

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

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-10 md:py-12 max-w-7xl mx-auto w-full">
        <Link
          href={`/buildings/${building.id}`}
          className="inline-flex items-center text-xs font-sans text-ink-muted hover:text-accent transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Kembali ke Detail Gedung
        </Link>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 pb-5 border-b border-line/45">
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-[10px] font-sans font-bold text-accent uppercase tracking-wider">
                Tur Virtual Street-View 360°
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-accent/20 bg-accent/5 rounded-md text-[9px] font-sans font-semibold text-accent uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                {scenes.length} Titik Panorama
              </span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-normal text-ink mt-1.5 leading-tight">
              {building.name}
            </h1>
            <p className="font-sans text-xs text-ink-muted mt-1">
              {building.address || "Alamat belum ditambahkan."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Mode Switcher Toggle */}
            <button
              onClick={() => setEditMode(!editMode)}
              className={`inline-flex items-center justify-center gap-2 font-sans text-xs font-semibold px-4 py-2.5 rounded-md border transition-all cursor-pointer ${
                editMode
                  ? "bg-ink text-white border-ink hover:bg-ink/90"
                  : "bg-surface text-ink border-line hover:bg-bg/40"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {editMode ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                )}
              </svg>
              {editMode ? "Lihat Mode User" : "Mode Edit Tur"}
            </button>

            <Link
              href={`/buildings/${building.id}`}
              className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2.5 rounded-md transition-all cursor-pointer"
            >
              Dashboard Gedung
            </Link>
          </div>
        </div>

        {scenes.length === 0 ? (
          /* Empty State Section in Edit Mode vs View Mode */
          <div className="max-w-md mx-auto text-center py-16 px-6 bg-surface border border-line rounded-md">
            <div className="w-12 h-12 rounded-md bg-bg border border-line flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-ink-muted/80" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink mb-2">Tur 360° Belum Tersedia</h2>
            <p className="font-sans text-xs text-ink-muted mb-6 leading-relaxed">
              Belum ada foto 360 derajat yang diunggah untuk gedung ini.
            </p>
            {editMode ? (
              /* Inline upload for editor when empty */
              <form onSubmit={handleUploadScene} className="space-y-3 text-left">
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-1">Label Titik Ruangan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Lobi Utama, Toilet Difabel"
                    value={uploadLabel}
                    onChange={(e) => setUploadLabel(e.target.value)}
                    className="w-full bg-bg/40 border border-line rounded p-2 text-xs font-sans text-ink focus:outline-none focus:border-accent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-1">Berkas Foto Panorama 360°</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full text-xs font-sans text-ink-muted cursor-pointer"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isUploadingScene}
                  className="w-full bg-accent text-white py-2 rounded text-xs font-semibold hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUploadingScene ? "Mengunggah..." : "Unggah & Mulai Tur"}
                </button>
              </form>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="bg-accent text-white px-5 py-2.5 rounded text-xs font-semibold hover:opacity-95 transition-all cursor-pointer"
              >
                Mulai Unggah di Mode Edit
              </button>
            )}
          </div>
        ) : (
          /* Main Layout with active scene */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Viewer Column (3/4 width on desktop) */}
            <div className="lg:col-span-3 space-y-4">
              {activeScene && (
                <>
                  {/* Current Active Scene Banner */}
                  <div className="flex justify-between items-center bg-surface border border-line px-4 py-2.5 rounded-md">
                    <span className="font-sans font-semibold text-xs text-ink flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
                      Titik Aktif: <strong className="text-accent">{activeScene.label || "Tanpa Nama"}</strong>
                    </span>
                    {editMode && (
                      <button
                        onClick={handleDeleteActiveScene}
                        className="text-[10px] font-bold text-status-not-met hover:underline cursor-pointer"
                      >
                        Hapus Ruangan Ini
                      </button>
                    )}
                  </div>
                  <TourViewer
                    pannellumRef={pannellumRef}
                    fallbackImageUrl={activeScene.file_url}
                    annotations={annotations}
                    hotspots={hotspots}
                    onNavigateToScene={handleNavigateToScene}
                    editMode={editMode}
                  />
                  <p className="text-[10px] font-sans text-ink-muted italic text-center">
                    * Seret/drag mouse pada gambar untuk berputar 360°. {editMode ? "Dalam Mode Edit, bidik titik tengah kamera ke arah gerbang/pintu tujuan untuk menaruh hotspot navigasi." : "Klik ikon informasi untuk melihat hasil audit, atau ikon panah (➔) untuk berjalan ke titik lain."}
                  </p>
                </>
              )}
            </div>

            {/* Sidebar Controls (1/4 width) */}
            <div className="space-y-6">
              {/* Scene Switcher List */}
              <div className="bg-surface border border-line rounded-md p-4 space-y-3 shadow-sm">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider border-b border-line pb-1.5">
                  Daftar Area / Ruangan
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {scenes.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveScene(s)}
                      className={`w-full text-left font-sans text-xs px-3 py-2 rounded transition-all cursor-pointer flex justify-between items-center ${
                        activeScene?.id === s.id
                          ? "bg-accent/10 border-l-4 border-accent text-accent font-semibold"
                          : "bg-bg/20 text-ink-muted hover:bg-bg/60 border-l-4 border-transparent"
                      }`}
                    >
                      <span className="truncate">{s.label || "Tanpa Nama"}</span>
                      {activeScene?.id === s.id && <span className="text-[9px] font-mono">AKTIF</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Edit Mode Controls */}
              {editMode && activeScene && (
                <>
                  {/* Create Hotspot Panel */}
                  <div className="bg-surface border border-line rounded-md p-4 space-y-3.5 shadow-sm">
                    <div>
                      <h3 className="text-xs font-bold text-ink uppercase tracking-wider border-b border-line pb-1.5">
                        Tambah Hotspot Navigasi
                      </h3>
                      <p className="text-[10px] text-ink-muted mt-1 leading-relaxed">
                        Arahkan kamera 360° di sebelah kiri ke objek pintu/jalan tujuan, lalu isi form di bawah:
                      </p>
                    </div>

                    <form onSubmit={handleCreateHotspot} className="space-y-3">
                      <div>
                        <label className="block text-[9px] font-bold text-ink uppercase mb-1">Target Ruangan Tujuan</label>
                        <select
                          value={targetSceneId}
                          onChange={(e) => setTargetSceneId(e.target.value)}
                          className="w-full bg-bg/40 border border-line rounded p-2 text-xs font-sans text-ink focus:outline-none focus:border-accent cursor-pointer"
                          required
                        >
                          <option value="">-- Pilih Ruangan --</option>
                          {scenes
                            .filter((s) => s.id !== activeScene.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label || "Tanpa Nama"}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-ink uppercase mb-1">Label Hotspot (Opsional)</label>
                        <input
                          type="text"
                          placeholder="Contoh: Ke Toilet, Masuk Koridor"
                          value={hotspotLabel}
                          onChange={(e) => setHotspotLabel(e.target.value)}
                          className="w-full bg-bg/40 border border-line rounded p-2 text-xs font-sans text-ink focus:outline-none focus:border-accent"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isAddingHotspot}
                        className="w-full bg-accent text-white py-2 rounded text-xs font-semibold hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isAddingHotspot ? "Menyimpan..." : "Pasang di Arah Bidikan"}
                      </button>
                    </form>
                  </div>

                  {/* Hotspots List Manager */}
                  <div className="bg-surface border border-line rounded-md p-4 space-y-3 shadow-sm">
                    <h3 className="text-xs font-bold text-ink uppercase tracking-wider border-b border-line pb-1.5">
                      Hotspot di Ruangan Ini
                    </h3>
                    {hotspots.length === 0 ? (
                      <p className="text-[10px] text-ink-muted italic">Belum ada hotspot navigasi di area ini.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {hotspots.map((h) => {
                          const targetScene = scenes.find((s) => s.id === h.target_scene_id);
                          return (
                            <div
                              key={h.id}
                              className="flex justify-between items-center bg-bg/30 border border-line/60 p-2 rounded text-xs font-sans"
                            >
                              <div className="truncate pr-2">
                                <span className="font-semibold text-ink">{h.label || "Navigasi"}</span>
                                <span className="block text-[9px] text-ink-muted truncate">
                                  Tujuan: {targetScene?.label || "Area Lain"}
                                </span>
                              </div>
                              <button
                                onClick={() => handleDeleteHotspot(h.id)}
                                className="text-[10px] text-status-not-met hover:underline font-semibold cursor-pointer shrink-0"
                              >
                                Hapus
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Upload New Scene Form */}
                  <div className="bg-surface border border-line rounded-md p-4 space-y-3.5 shadow-sm">
                    <h3 className="text-xs font-bold text-ink uppercase tracking-wider border-b border-line pb-1.5">
                      Unggah Area Baru
                    </h3>
                    <form onSubmit={handleUploadScene} className="space-y-3">
                      <div>
                        <label className="block text-[9px] font-bold text-ink uppercase mb-1">Nama Area / Label</label>
                        <input
                          type="text"
                          placeholder="Contoh: Koridor Utama, Ramp Depan"
                          value={uploadLabel}
                          onChange={(e) => setUploadLabel(e.target.value)}
                          className="w-full bg-bg/40 border border-line rounded p-2 text-xs font-sans text-ink focus:outline-none focus:border-accent"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-ink uppercase mb-1">File Foto 360°</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full text-xs font-sans text-ink-muted cursor-pointer"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isUploadingScene}
                        className="w-full bg-accent text-white py-2 rounded text-xs font-semibold hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isUploadingScene ? "Mengunggah..." : "Unggah & Tambah Area"}
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
