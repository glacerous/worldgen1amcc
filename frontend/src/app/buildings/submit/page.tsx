"use client";

import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import AuditLoadingOverlay from "@/components/AuditLoadingOverlay";

interface NearbyBuilding {
  id: string;
  name: string;
  address: string;
  distance_meters: number;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
}

interface SuggestionItem {
  display_name: string;
  lat: string;
  lon: string;
}

// Dynamically import Leaflet Map components to bypass SSR window issues
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-bg/50 border border-line rounded-md flex items-center justify-center font-sans text-xs text-ink-muted animate-pulse">
      Memuat peta...
    </div>
  ),
});

const DetailMap = dynamic(() => import("@/components/DetailMap"), {
  ssr: false,
  loading: () => (
    <div className="h-44 bg-bg/50 border border-line rounded-md flex items-center justify-center font-sans text-xs text-ink-muted animate-pulse">
      Memuat peta...
    </div>
  ),
});

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

export default function SubmitBuildingPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  
  // Wizard step state
  const [step, setStep] = useState(1);
  
  // Form states
  const [name, setName] = useState("");
  const [contributorName, setContributorName] = useState("");
  const [address, setAddress] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([-6.2088, 106.8456]); // Default: Jakarta center
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [panoramaFiles, setPanoramaFiles] = useState<File[]>([]);
  
  // UI States
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const [isDraggingPanoramas, setIsDraggingPanoramas] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningDistance, setWarningDistance] = useState<number | null>(null);
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [shouldSearch, setShouldSearch] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Nearby buildings match state
  const [nearbyBuildings, setNearbyBuildings] = useState<NearbyBuilding[]>([]);
  const [selectedNearbyBuildingId, setSelectedNearbyBuildingId] = useState<string | null>(null);
  const [userSelection, setUserSelection] = useState<"existing" | "new" | null>(null);

  // Auth guard: redirect to login if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/buildings/submit");
    }
  }, [loading, user, router]);

  // Fetch nearby buildings when mapCenter coordinates change
  useEffect(() => {
    const fetchNearby = async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/buildings/nearby?lat=${mapCenter[0]}&lng=${mapCenter[1]}&radius_meters=100`
        );
        if (res.ok) {
          const data = await res.json();
          setNearbyBuildings(data);
          // Only reset if the current selection is no longer in the retrieved data
          setSelectedNearbyBuildingId((prev) => {
            if (prev && !data.some((b: NearbyBuilding) => b.id === prev)) {
              setUserSelection(null);
              return null;
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("Error fetching nearby buildings:", err);
      }
    };

    const timer = setTimeout(fetchNearby, 500);
    return () => clearTimeout(timer);
  }, [mapCenter]);

  // Real-time Nominatim search autocomplete with 250ms debounce and AbortController request cancellation
  useEffect(() => {
    if (address.trim().length < 3 || !shouldSearch) {
      return;
    }

    const abortController = new AbortController();

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const query = encodeURIComponent(address.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5&countrycodes=id`,
          {
            signal: abortController.signal,
            headers: {
              "User-Agent": "AksesibilitasGedung/1.0 (contact@aksesibilitas.id)",
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.slice(0, 5));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // Ignore aborted requests
        }
        console.error("Error fetching address autocomplete:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [address, shouldSearch]);

  // Click outside to close Nominatim dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-accent/25 border-t-accent rounded-full animate-spin"></div>
        </main>
      </div>
    );
  }

  const isExisting = userSelection === "existing" && !!selectedNearbyBuildingId;
  const selectedBuilding = nearbyBuildings.find((b: NearbyBuilding) => b.id === selectedNearbyBuildingId);

  const handleMapMarkerChange = (lat: number, lng: number) => {
    setMapCenter([lat, lng]);
  };

  const handleSelectSuggestion = (item: SuggestionItem) => {
    setAddress(item.display_name);
    setMapCenter([parseFloat(item.lat), parseFloat(item.lon)]);
    setSuggestions([]);
    setShouldSearch(false);
  };

  // Step Navigations with Validation
  const handleNextStep1 = () => {
    if (!isExisting && !name.trim()) {
      setError("Nama gedung wajib diisi.");
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleNextStep2 = () => {
    if (!isExisting && (!address.trim() || !mapCenter)) {
      setError("Alamat lengkap dan titik koordinat wajib diisi.");
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleNextStep3 = () => {
    if (selectedFiles.length === 0) {
      setError("Minimal 1 foto bukti fisik wajib diunggah.");
      return;
    }
    setError(null);
    setStep(4);
  };

  // Handle file picking and validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      
      // Validate image types
      const invalidFiles = filesArray.some((file) => !file.type.startsWith("image/"));
      if (invalidFiles) {
        setError("Hanya berkas gambar (image/*) yang diperbolehkan.");
        return;
      }

      setSelectedFiles((prev) => [...prev, ...filesArray]);
      setError(null);
    }
  };

  // Remove a selected file from the preview list
  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Drag & Drop handlers for regular photos
  const handlePhotosDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPhotos(true);
  };

  const handlePhotosDragLeave = () => {
    setIsDraggingPhotos(false);
  };

  const handlePhotosDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPhotos(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      const invalidFiles = filesArray.some((file) => !file.type.startsWith("image/"));
      if (invalidFiles) {
        setError("Hanya berkas gambar (image/*) yang diperbolehkan.");
        return;
      }
      setSelectedFiles((prev) => [...prev, ...filesArray]);
      setError(null);
    }
  };

  // Drag & Drop handlers for 360 panoramas
  const handlePanoramasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPanoramas(true);
  };

  const handlePanoramasDragLeave = () => {
    setIsDraggingPanoramas(false);
  };

  const handlePanoramasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPanoramas(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      const invalidFiles = filesArray.some((file) => !file.type.startsWith("image/"));
      if (invalidFiles) {
        setError("Semua berkas panorama harus berupa file gambar.");
        return;
      }
      setPanoramaFiles((prev) => [...prev, ...filesArray]);
      setError(null);
    }
  };

  const performSubmit = async (confirmLocation: boolean) => {
    setIsLoading(true);
    setError(null);

    const isExistingBuilding = userSelection === "existing" && selectedNearbyBuildingId;

    // Final Form validation checks
    if (!isExistingBuilding && (!name.trim() || !address.trim())) {
      setError("Nama gedung dan alamat lengkap wajib diisi.");
      setIsLoading(false);
      return;
    }

    if (selectedFiles.length === 0) {
      setError("Minimal 1 foto bukti fisik wajib diunggah.");
      setIsLoading(false);
      return;
    }

    // Build Form Data payload
    const formData = new FormData();
    if (!isExistingBuilding) {
      formData.append("name", name.trim());
      formData.append("address", address.trim());
      formData.append("latitude", mapCenter[0].toString());
      formData.append("longitude", mapCenter[1].toString());
      formData.append("confirm_location", confirmLocation ? "true" : "false");
    }
    
    if (contributorName.trim()) {
      formData.append("contributor_name", contributorName.trim());
    }

    selectedFiles.forEach((file) => {
      formData.append("photos", file);
    });

    panoramaFiles.forEach((file) => {
      formData.append("panoramas", file);
    });

    const submitUrl = isExistingBuilding
      ? `${BACKEND_URL}/buildings/${selectedNearbyBuildingId}/audit-submit`
      : `${BACKEND_URL}/buildings/submit`;

    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || "Gagal melakukan registrasi gedung.");
      }

      // Check if it is a warning (only applicable to new building submission)
      if (!isExistingBuilding && data.warning === "gps_mismatch") {
        setWarningDistance(data.distance_meters);
        setShowWarningModal(true);
        setIsLoading(false);
        return;
      }

      const targetBuildingId = isExistingBuilding ? selectedNearbyBuildingId : data.building?.id;

      if (!targetBuildingId) {
        throw new Error("Gagal memperoleh ID gedung hasil submit.");
      }

      // Success redirect to the detail results page immediately
      router.push(`/buildings/${targetBuildingId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan koneksi server.");
      setIsLoading(false);
    }
  };

  // Renders the horizontal step progress indicator with numbered circles and connector line
  const renderStepper = () => {
    return (
      <div className="mb-10 select-none relative z-0">
        <div className="relative flex items-center justify-between">
          {/* Background grey connector line */}
          <div className="absolute left-10 right-10 top-4 h-0.5 bg-line -translate-y-1/2 -z-10" />
          
          {/* Active colored connector line */}
          <div 
            className="absolute left-10 top-4 h-0.5 bg-accent -translate-y-1/2 -z-10 transition-all duration-500"
            style={{ width: `calc(${((step - 1) / 3) * 100}% - ${((step - 1) / 3) * 80}px)` }}
          />

          {[
            { id: 1, label: "Info Dasar" },
            { id: 2, label: "Lokasi" },
            { id: 3, label: "Foto" },
            { id: 4, label: "Review" }
          ].map((s) => {
            const isActive = s.id === step;
            const isCompleted = s.id < step;
            
            return (
              <div key={s.id} className="flex flex-col items-center relative z-10 w-20">
                {/* Circle Indicator */}
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-sans text-xs font-bold border-2 transition-all duration-300 ${
                    isCompleted 
                      ? "bg-accent border-accent text-white" 
                      : isActive 
                        ? "bg-surface border-accent text-accent ring-4 ring-accent/15" 
                        : "bg-surface border-line text-ink-muted/50"
                  }`}
                >
                  {s.id}
                </div>
                
                {/* Step labels */}
                <span 
                  className={`mt-2.5 text-center font-sans text-[10px] font-bold uppercase tracking-widest block transition-colors duration-500 truncate w-full ${
                    isActive ? "text-accent" : isCompleted ? "text-ink" : "text-ink-muted/80"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStep1 = () => {
    return (
      <div className="space-y-5">
        <div>
          <label htmlFor="name" className="block text-xs font-sans font-semibold text-ink-muted mb-1.5">
            Nama Gedung {!isExisting && <span className="text-status-not-met">*</span>}
          </label>
          {isExisting ? (
            <div className="border border-line bg-bg/30 rounded-md px-3 py-2.5 text-sm font-sans text-ink-muted select-none flex items-center justify-between">
              <span>{selectedBuilding?.name || "Gedung Terdaftar"}</span>
              <span className="text-[10px] bg-accent/10 text-accent font-semibold px-2.5 py-0.5 rounded-full">
                Terdaftar
              </span>
            </div>
          ) : (
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Contoh: Gedung Sate Bandung"
              className="w-full bg-transparent border border-line rounded-md px-3 py-2.5 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
              required
            />
          )}
        </div>

        <div>
          <label htmlFor="contributor_name" className="block text-xs font-sans font-semibold text-ink-muted mb-1.5">
            Nama/Institusi Anda (opsional)
          </label>
          <input
            type="text"
            id="contributor_name"
            value={contributorName}
            onChange={(e) => {
              setContributorName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Contoh: Universitas Gadjah Mada / Budi"
            className="w-full bg-transparent border border-line rounded-md px-3 py-2.5 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40"
          />
        </div>

        <div className="pt-4 flex items-center justify-between gap-4 border-t border-line/50">
          <Link
            href="/buildings"
            className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors"
          >
            Batal
          </Link>
          
          <button
            type="button"
            onClick={handleNextStep1}
            className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all cursor-pointer"
          >
            Lanjut
          </button>
        </div>
      </div>
    );
  };

  const renderStep2 = () => {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="address" className="block text-xs font-sans font-semibold text-ink-muted uppercase tracking-wider">
            Alamat Lengkap {!isExisting && <span className="text-status-not-met">*</span>}
          </label>
          {isExisting ? (
            <div className="border border-line bg-bg/30 rounded-md px-3 py-2.5 text-sm font-sans text-ink-muted select-none flex items-center justify-between">
              <span>{selectedBuilding?.address || "Alamat Gedung Terpilih"}</span>
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <input
                type="text"
                id="address"
                value={address}
                onChange={(e) => {
                  const val = e.target.value;
                  setAddress(val);
                  if (error) setError(null);
                  if (val.trim().length < 3) {
                    setSuggestions([]);
                    setShouldSearch(false);
                  } else {
                    setShouldSearch(true);
                  }
                }}
                placeholder="Contoh: Jl. Diponegoro No. 22, Bandung"
                className="w-full bg-transparent border border-line rounded-md pl-3 pr-10 py-2.5 text-sm font-sans text-ink placeholder-ink-muted/50 focus:outline-none focus:border-accent/40 transition-colors"
                required
              />
              
              {/* Spinning loading indicator on the right of input */}
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                  <svg className="animate-spin h-4 w-4 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
              
              {/* Autocomplete suggestions dropdown overlay */}
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-line rounded-md shadow-lg z-50 max-h-60 overflow-y-auto divide-y divide-line/40">
                  {suggestions.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSuggestion(item)}
                      className="w-full text-left px-3 py-2.5 text-xs font-sans hover:bg-bg border-b border-line/40 last:border-0 cursor-pointer text-ink transition-colors block leading-normal select-none"
                    >
                      {item.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Leaflet Dynamic Map */}
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-sans font-semibold text-ink-muted uppercase tracking-wider">
            Titik Lokasi Gedung (Geser pin jika kurang akurat)
          </label>
          <div className="border border-line rounded-md overflow-hidden relative z-0 shadow-sm">
            <Map center={mapCenter} onChange={handleMapMarkerChange} />
          </div>
          
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-accent/10 border border-accent/20 rounded text-[11px] font-mono text-accent select-all shadow-xs">
              <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              <span>{mapCenter[0].toFixed(6)}, {mapCenter[1].toFixed(6)}</span>
            </div>
            
            <p className="text-[10px] font-sans text-ink-muted italic">
              * Seret penanda di peta untuk koordinat presisi.
            </p>
          </div>
        </div>

        {/* Nearby Buildings Suggestion Card */}
        {nearbyBuildings.length > 0 && (
          <div className="bg-accent/5 border border-accent/20 rounded-md p-4 space-y-3 font-sans text-xs">
            {userSelection === null ? (
              <>
                {nearbyBuildings.length === 1 ? (
                  <div>
                    <p className="text-ink font-medium">
                      Sepertinya gedung ini sudah terdaftar sebagai{" "}
                      <span className="font-semibold text-accent">{nearbyBuildings[0].name}</span>,{" "}
                      jarak <span className="font-semibold">{Math.round(nearbyBuildings[0].distance_meters)}</span> meter dari lokasi Anda.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNearbyBuildingId(nearbyBuildings[0].id);
                          setUserSelection("existing");
                          if (error) setError(null);
                        }}
                        className="bg-accent text-white hover:opacity-90 px-3 py-1.5 rounded font-semibold text-[11px] cursor-pointer"
                      >
                        Ya, tambahkan audit saya ke gedung ini
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNearbyBuildingId(null);
                          setUserSelection("new");
                          if (error) setError(null);
                        }}
                        className="bg-bg border border-line text-ink hover:bg-line/20 px-3 py-1.5 rounded font-semibold text-[11px] cursor-pointer"
                      >
                        Bukan, ini gedung berbeda
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-ink font-medium mb-2">
                      Sepertinya lokasi ini dekat dengan beberapa gedung terdaftar:
                    </p>
                    <div className="space-y-2">
                      {nearbyBuildings.map((b: NearbyBuilding) => (
                        <label
                          key={b.id}
                          className="flex items-center gap-2 p-2 border border-line rounded hover:bg-bg/40 cursor-pointer block"
                        >
                          <input
                            type="radio"
                            name="nearby_building"
                            checked={selectedNearbyBuildingId === b.id}
                            onChange={() => {
                              setSelectedNearbyBuildingId(b.id);
                              if (error) setError(null);
                            }}
                            className="cursor-pointer"
                          />
                          <span className="text-xs text-ink">
                            <strong>{b.name}</strong> ({Math.round(b.distance_meters)}m) - <span className="text-ink-muted text-[11px]">{b.address}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        disabled={!selectedNearbyBuildingId}
                        onClick={() => {
                          setUserSelection("existing");
                          if (error) setError(null);
                        }}
                        className="bg-accent text-white hover:opacity-90 px-3 py-1.5 rounded font-semibold text-[11px] disabled:opacity-50 cursor-pointer"
                      >
                        Ya, tambahkan audit saya ke gedung terpilih
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNearbyBuildingId(null);
                          setUserSelection("new");
                          if (error) setError(null);
                        }}
                        className="bg-bg border border-line text-ink hover:bg-line/20 px-3 py-1.5 rounded font-semibold text-[11px] cursor-pointer"
                      >
                        Bukan, ini gedung berbeda
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-ink text-xs">
                  {userSelection === "existing" ? (
                    <>
                      ✓ Menambahkan audit ke gedung:{" "}
                      <span className="font-semibold text-accent">
                        {nearbyBuildings.find((b: NearbyBuilding) => b.id === selectedNearbyBuildingId)?.name}
                      </span>
                    </>
                  ) : (
                    "✓ Mendaftarkan gedung baru"
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUserSelection(null);
                    setSelectedNearbyBuildingId(null);
                    if (error) setError(null);
                  }}
                  className="text-accent font-semibold hover:underline text-[11px] cursor-pointer"
                >
                  Ubah Pilihan
                </button>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 flex items-center justify-between gap-4 border-t border-line/50">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(1);
            }}
            className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors cursor-pointer"
          >
            Kembali
          </button>
          
          <button
            type="button"
            onClick={handleNextStep2}
            className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all cursor-pointer"
          >
            Lanjut
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    return (
      <div className="space-y-5">
        {/* Multiple Photo Picker & Preview Thumbnails */}
        <div className="space-y-2">
          <label className="block text-xs font-sans font-semibold text-ink-muted">
            Foto Bukti Fisik Aksesibilitas <span className="text-status-not-met">*</span>
          </label>
          
          {/* Fake file pick area */}
          <div 
            onClick={() => document.getElementById("photo-picker")?.click()}
            onDragOver={handlePhotosDragOver}
            onDragLeave={handlePhotosDragLeave}
            onDrop={handlePhotosDrop}
            className={`border border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
              isDraggingPhotos
                ? "border-accent bg-accent/5"
                : "border-line hover:border-accent/40 bg-surface/10"
            }`}
          >
            <svg className="w-8 h-8 text-ink-muted/70 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p className="font-sans text-[11px] text-ink-muted">
              Klik atau seret foto-foto bukti standar gedung ke sini (Ramp, Pintu, Toilet, dll.)
            </p>
          </div>
          
          <input
            type="file"
            id="photo-picker"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Thumbnails list */}
          {selectedFiles.length > 0 && (
            <div className="pt-2">
              <span className="block text-[10px] font-sans font-semibold text-ink-muted mb-2">
                Foto terpilih ({selectedFiles.length}):
              </span>
              <div className="flex flex-wrap gap-3">
                {selectedFiles.map((file, idx) => {
                  const objectUrl = URL.createObjectURL(file);
                  return (
                    <div key={idx} className="relative w-16 h-16 border border-line rounded-md overflow-hidden bg-bg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={objectUrl}
                        alt={`Preview foto bukti ke-${idx + 1} yang diunggah`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="absolute top-0 right-0 bg-ink-muted text-white w-4 h-4 flex items-center justify-center text-[9px] hover:bg-status-not-met transition-colors focus:outline-none cursor-pointer"
                        aria-label={`Batal pilih foto preview ke-${idx + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mock photo upload button for dev tests */}
          {process.env.NODE_ENV === "development" && (
            <button
              type="button"
              id="mock-upload-btn"
              onClick={() => {
                const mockFile = new File(
                  [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])],
                  "mock_evidence.png",
                  { type: "image/png" }
                );
                setSelectedFiles((prev) => [...prev, mockFile]);
                if (error) setError(null);
              }}
              className="mt-2 text-[10px] text-accent hover:underline block cursor-pointer"
            >
              [Dev] Gunakan Foto Mock
            </button>
          )}
        </div>

        {/* Panorama 360 File Picker (Optional) */}
        <div className="space-y-2">
          <label className="block text-xs font-sans font-semibold text-ink-muted">
            Foto 360° (opsional)
          </label>
          
          <div 
            onClick={() => document.getElementById("panorama-picker")?.click()}
            onDragOver={handlePanoramasDragOver}
            onDragLeave={handlePanoramasDragLeave}
            onDrop={handlePanoramasDrop}
            className={`border border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
              isDraggingPanoramas
                ? "border-accent bg-accent/5"
                : "border-line hover:border-accent/40 bg-surface/40"
            }`}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg className="w-6 h-6 text-accent/70" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <span className="bg-accent/10 text-accent text-[10px] font-bold px-2 py-0.5 rounded-full font-sans tracking-wide">
                360°
              </span>
            </div>
            <p className="font-sans text-[11px] text-ink-muted">
              {panoramaFiles.length > 0 ? `Terpilih: ${panoramaFiles.length} foto 360°` : "Klik atau seret foto-foto 360° ke sini untuk tur virtual dengan penanda otomatis oleh AI"}
            </p>
          </div>

          <input
            type="file"
            id="panorama-picker"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const files = Array.from(e.target.files);
                const invalidFiles = files.filter(f => !f.type.startsWith("image/"));
                if (invalidFiles.length > 0) {
                  setError("Semua berkas panorama harus berupa file gambar.");
                  return;
                }
                setPanoramaFiles((prev) => [...prev, ...files]);
                if (error) setError(null);
              }
            }}
            className="hidden"
          />

          {panoramaFiles.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {panoramaFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between text-[10px] font-sans text-ink-muted bg-surface border border-line rounded-md px-3 py-1.5">
                  <span className="truncate max-w-[80%]">{file.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPanoramaFiles((prev) => prev.filter((_, i) => i !== idx));
                      if (error) setError(null);
                    }}
                    className="text-status-not-met font-semibold hover:underline cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI analysis disclaimer text */}
        <p className="font-sans text-[10px] text-ink-muted leading-relaxed">
          * Hasil akan dianalisis otomatis oleh AI dan langsung tayang, ditandai sebagai kontribusi komunitas hingga diverifikasi tim kami.
        </p>

        <div className="pt-4 flex items-center justify-between gap-4 border-t border-line/50">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(2);
            }}
            className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors cursor-pointer"
          >
            Kembali
          </button>
          
          <button
            type="button"
            onClick={handleNextStep3}
            className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all cursor-pointer"
          >
            Lanjut
          </button>
        </div>
      </div>
    );
  };

  const renderStep4 = () => {
    return (
      <div className="space-y-6">
        <p className="font-sans text-xs text-ink-muted -mt-2">
          Periksa kembali data gedung dan lampiran sebelum mengirim. Anda bisa mengedit data langsung lewat tombol Edit di kanan atas setiap kartu.
        </p>

        <div className="space-y-4">
          {/* Card Info Dasar - Citation Style */}
          <div className="border-l-4 border-accent bg-surface p-4 rounded-r-md border border-line border-l-0 shadow-xs flex flex-col relative transition-all hover:shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-sans font-bold text-ink-muted tracking-wider uppercase">
                Info Dasar
              </span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-[10px] text-accent font-semibold hover:underline cursor-pointer transition-all"
              >
                Edit
              </button>
            </div>
            <div className="font-sans text-xs text-ink leading-relaxed space-y-1">
              <p>
                <span className="font-semibold text-ink-muted">Nama Gedung:</span>{" "}
                <span className="text-sm font-semibold text-ink">
                  {isExisting ? (selectedBuilding?.name || "Gedung Terdaftar") : (name || "—")}
                </span>
                {isExisting && (
                  <span className="ml-2 text-[9px] bg-accent/10 text-accent font-semibold px-2.5 py-0.5 rounded-full inline-block">
                    Terdaftar
                  </span>
                )}
              </p>
              <p>
                <span className="font-semibold text-ink-muted">Nama/Institusi Anda:</span>{" "}
                <span>{contributorName.trim() ? contributorName : "—"}</span>
              </p>
            </div>
          </div>

          {/* Card Lokasi - Citation Style */}
          <div className="border-l-4 border-accent bg-surface p-4 rounded-r-md border border-line border-l-0 shadow-xs flex flex-col relative transition-all hover:shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-sans font-bold text-ink-muted tracking-wider uppercase">
                Lokasi
              </span>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-[10px] text-accent font-semibold hover:underline cursor-pointer transition-all"
              >
                Edit
              </button>
            </div>
            <div className="font-sans text-xs text-ink leading-relaxed space-y-3">
              <p>
                <span className="font-semibold text-ink-muted">Alamat Lengkap:</span>{" "}
                <span>{isExisting ? (selectedBuilding?.address || "—") : (address || "—")}</span>
              </p>
              <div className="space-y-1">
                <span className="block text-[10px] font-sans font-semibold text-ink-muted">
                  Titik Koordinat: {mapCenter[0].toFixed(6)}, {mapCenter[1].toFixed(6)}
                </span>
                <div className="h-44 w-full rounded-md overflow-hidden border border-line relative z-0">
                  <DetailMap center={mapCenter} buildingName={isExisting ? (selectedBuilding?.name || "Gedung Terdaftar") : (name || "Gedung Baru")} />
                </div>
              </div>
            </div>
          </div>

          {/* Card Foto - Citation Style */}
          <div className="border-l-4 border-accent bg-surface p-4 rounded-r-md border border-line border-l-0 shadow-xs flex flex-col relative transition-all hover:shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-sans font-bold text-ink-muted tracking-wider uppercase">
                Foto & Lampiran
              </span>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-[10px] text-accent font-semibold hover:underline cursor-pointer transition-all"
              >
                Edit
              </button>
            </div>
            <div className="font-sans text-xs text-ink leading-relaxed space-y-3">
              {selectedFiles.length > 0 && (
                <div>
                  <span className="block text-[10px] text-ink-muted font-semibold mb-1.5">
                    Foto Bukti Fisik ({selectedFiles.length}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedFiles.map((file, idx) => {
                      const objectUrl = URL.createObjectURL(file);
                      return (
                        <div key={idx} className="relative w-12 h-12 border border-line rounded overflow-hidden bg-bg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={objectUrl}
                            alt={`Preview foto bukti ke-${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {panoramaFiles.length > 0 && (
                <div>
                  <span className="block text-[10px] text-ink-muted font-semibold mb-1.5">
                    Foto 360° ({panoramaFiles.length}):
                  </span>
                  <ul className="text-[10px] text-ink-muted list-disc list-inside space-y-0.5 bg-bg/30 p-2 rounded border border-line/50">
                    {panoramaFiles.map((file, idx) => (
                      <li key={idx} className="truncate max-w-xs">{file.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI analysis disclaimer text */}
        <p className="font-sans text-[10px] text-ink-muted leading-relaxed">
          * Menekan tombol di bawah berarti Anda menyetujui data dianalisis secara otomatis oleh sistem AI kami.
        </p>

        <div className="pt-4 flex items-center justify-between gap-4 border-t border-line/50">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(3);
            }}
            className="font-sans text-xs font-semibold text-ink hover:text-accent transition-colors cursor-pointer"
          >
            Kembali
          </button>
          
          <button
            type="button"
            disabled={isLoading}
            onClick={() => performSubmit(false)}
            className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-6 py-2.5 rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-sm hover:shadow"
          >
            {isLoading ? "Memproses Audit..." : "Kirim & Mulai Audit"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />

      <main className="flex-1 px-6 py-12 md:py-16 max-w-xl mx-auto w-full flex flex-col justify-center">
        <div className="bg-surface border border-line rounded-md p-6 md:p-8 shadow-sm">
          <h1 className="font-display text-2xl font-normal text-ink mb-2">
            Audit Gedung Baru
          </h1>
          
          <p className="font-sans text-xs text-ink-muted mb-6">
            Daftarkan gedung publik dan unggah foto bukti fisik untuk memulai audit standar aksesibilitas berbasis AI.
          </p>

          {renderStepper()}

          {error && (
            <div className="mb-6 p-4 bg-status-not-met/10 border border-status-not-met/20 rounded-md text-xs text-status-not-met font-sans font-medium">
              {error}
            </div>
          )}

          <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </form>
        </div>
      </main>

      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-ink/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setShowWarningModal(false)}
          />
          
          {/* Modal Card */}
          <div className="relative bg-surface border border-line rounded-md max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 text-amber-700 dark:text-amber-600 rounded-full border border-amber-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink mb-2">
                  Peringatan Selisih GPS
                </h3>
                <p className="font-sans text-xs text-ink-muted leading-relaxed mb-4">
                  Metadata lokasi GPS pada foto bukti yang Anda unggah berjarak sekitar{" "}
                  <strong className="text-amber-700 dark:text-amber-500">
                    {warningDistance ? Math.round(warningDistance) : 0} meter
                  </strong>{" "}
                  dari titik koordinat alamat yang ditentukan di peta.
                </p>
                <p className="font-sans text-xs text-ink-muted leading-relaxed">
                  Apakah Anda yakin koordinat dan foto yang Anda kirimkan sudah benar? Anda dapat kembali dan memindahkan pin lokasi atau tetap melanjutkan.
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="inline-flex items-center justify-center border border-line bg-surface hover:bg-bg/40 text-ink-muted hover:text-ink font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
              >
                Perbaiki Alamat
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowWarningModal(false);
                  performSubmit(true);
                }}
                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-xs font-semibold px-4 py-2 rounded-md transition-all cursor-pointer"
              >
                Tetap Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
      
      <AuditLoadingOverlay isVisible={isLoading} />
    </div>
  );
}
