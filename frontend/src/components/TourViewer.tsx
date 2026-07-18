"use client";

import { useState, useRef, useEffect } from "react";
import "pannellum-react"; // Ensure pannellum assets are bundled and window.pannellum is populated

interface AuditCriteria {
  code: string;
  description: string;
  category: string;
  short_label?: string | null;
}

interface AuditResult {
  status: "met" | "not_met" | "unknown" | "na";
  reasoning: string | null;
  audit_criteria: AuditCriteria | null;
}

interface Annotation {
  id: string;
  scene_id: string;
  audit_result_id: string | null;
  label: string;
  pitch: number;
  yaw: number;
  audit_results: AuditResult | null;
}

interface Hotspot {
  id: string;
  source_scene_id: string;
  target_scene_id: string;
  pitch: number;
  yaw: number;
  label: string | null;
}

interface PannellumViewerInstance {
  addScene: (sceneId: string, config: Record<string, unknown>) => void;
  addHotSpot: (config: Record<string, unknown>) => void;
  removeHotSpot: (hotSpotId: string) => void;
  destroy: () => void;
  getScene: () => string;
  getConfig: () => { hotSpots?: { id?: string; div?: HTMLElement }[] };
  loadScene: (sceneId: string) => void;
  lookAt: (pitch: number, yaw: number, hfov: number, duration: number, callback?: () => void) => void;
  on: (event: string, callback: () => void) => void;
  setHfov: (hfov: number) => void;
}

interface TourViewerProps {
  fallbackImageUrl: string;
  annotations: Annotation[];
  hotspots: Hotspot[];
  onNavigateToScene?: (targetSceneId: string) => void;
  editMode?: boolean;
  pannellumRef?: React.RefObject<{ getViewer: () => PannellumViewerInstance | null } | null>;
}

export default function TourViewer({
  fallbackImageUrl,
  annotations,
  hotspots,
  onNavigateToScene,
  editMode = false,
  pannellumRef,
}: TourViewerProps) {
  const [selectedHotspot, setSelectedHotspot] = useState<Annotation | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedHotspot(null);
      }
    };
    if (selectedHotspot) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedHotspot]);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewerInstance | null>(null);
  const isNavigatingRef = useRef(false);

  // Sync fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement && document.fullscreenElement === wrapperRef.current);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().catch((err) => {
        console.error("Error entering fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Expose the viewer instance to the parent component safely
  useEffect(() => {
    if (pannellumRef) {
      const ref = pannellumRef as unknown as { current: { getViewer: () => PannellumViewerInstance | null } | null };
      ref.current = {
        getViewer: () => viewerRef.current,
      };
    }
  });

  // Inject premium hotspot styles dynamically to override any cached CSS
  useEffect(() => {
    const styleId = "tour-viewer-hotspot-upgraded-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      .custom-hotspot-nav {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      
      .custom-hotspot-inner-upgraded {
        position: relative !important;
        height: 100% !important;
        width: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        transform: perspective(200px) rotateX(60deg) !important;
        transform-origin: center center !important;
        pointer-events: none !important;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      }

      /* Navigation Hotspot Pulse - BLUE COLOR */
      .custom-hotspot-pulse {
        position: absolute !important;
        inset: 4px !important;
        border-radius: 50% !important;
        border: 2.5px solid #2563EB !important;
        background: rgba(37, 99, 235, 0.2) !important;
        box-shadow: 0 0 12px #2563EB, inset 0 0 8px #2563EB !important;
        pointer-events: none !important;
        animation: hotspot-pulse-wave-blue 2s infinite ease-out !important;
      }

      @keyframes hotspot-pulse-wave-blue {
        0% {
          transform: scale(0.92);
          opacity: 0.85;
          box-shadow: 0 0 8px #2563EB, inset 0 0 4px #2563EB;
        }
        50% {
          transform: scale(1.03);
          opacity: 1;
          box-shadow: 0 0 16px #2563EB, inset 0 0 10px #2563EB;
        }
        100% {
          transform: scale(0.92);
          opacity: 0.85;
          box-shadow: 0 0 8px #2563EB, inset 0 0 4px #2563EB;
        }
      }

      .custom-hotspot-arrow-wrapper {
        position: absolute !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #FFFFFF !important;
        filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.4)) !important;
        animation: hotspot-bob 2s infinite ease-in-out !important;
        pointer-events: none !important;
        transition: color 0.3s ease !important;
      }

      @keyframes hotspot-bob {
        0%, 100% {
          transform: translateY(0px) scale(0.95);
        }
        50% {
          transform: translateY(-5px) scale(1.05);
        }
      }

      .custom-hotspot-arrow-svg {
        width: 22px !important;
        height: 22px !important;
      }

      .custom-hotspot-nav:hover .custom-hotspot-arrow-wrapper {
        color: #DBEAFE !important;
      }

      .custom-hotspot-label-upgraded {
        position: absolute !important;
        bottom: 130% !important;
        left: 50% !important;
        transform: translate3d(-50%, 8px, 0) scale(0.9) !important;
        background: rgba(44, 43, 41, 0.88) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        color: #FFFFFF !important;
        font-family: var(--font-sans), sans-serif !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        letter-spacing: 0.025em !important;
        padding: 5px 10px !important;
        border-radius: 6px !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        white-space: nowrap !important;
        opacity: 0 !important;
        pointer-events: none !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
        transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        z-index: 9999 !important;
      }

      .custom-hotspot-nav:hover .custom-hotspot-label-upgraded,
      .custom-hotspot-ann:hover .custom-hotspot-label-upgraded {
        opacity: 1 !important;
        transform: translate3d(-50%, 0, 0) scale(1) !important;
      }

      /* Audit Annotation Pin Styles */
      .custom-hotspot-ann {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }

      .custom-ann-pin {
        width: 32px !important;
        height: 32px !important;
        border-radius: 50% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 2.5px solid #FFFFFF !important;
        box-shadow: 0 3px 6px rgba(0,0,0,0.35) !important;
        color: #FFFFFF !important;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        cursor: pointer !important;
      }

      .custom-ann-pin:hover {
        transform: scale(1.18) !important;
      }

      .custom-ann-pin-met {
        background-color: #0F5C5C !important; /* Teal Solid */
        box-shadow: 0 0 12px rgba(15, 92, 92, 0.6) !important;
      }

      .custom-ann-pin-not_met {
        background-color: #EF4444 !important; /* Red Solid */
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.6) !important;
      }

      .custom-ann-pin-unknown {
        background-color: #9CA3AF !important; /* Grey Solid */
        box-shadow: 0 0 12px rgba(156, 163, 175, 0.6) !important;
      }

      .custom-ann-svg {
        width: 16px !important;
        height: 16px !important;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Status tokens styling
  const statusMap = {
    met: {
      label: "Terpenuhi",
      colorClass: "bg-status-met/10 text-status-met border-status-met/20",
    },
    not_met: {
      label: "Tidak Terpenuhi",
      colorClass: "bg-status-not-met/10 text-status-not-met border-status-not-met/20",
    },
    unknown: {
      label: "Tidak Diketahui",
      colorClass: "bg-status-unknown/10 text-status-unknown border-status-unknown/20",
    },
    na: {
      label: "Tidak Relevan",
      colorClass: "bg-status-na/10 text-status-na border-status-na/20",
    },
  };

  // Sync Pannellum configuration dynamically
  useEffect(() => {
    try {
      if (typeof window === "undefined" || !containerRef.current) return;

      const win = window as unknown as { pannellum?: { viewer: (container: HTMLElement, config: Record<string, unknown>) => PannellumViewerInstance } };
      if (!win.pannellum) return;

      const pnlm = win.pannellum;

      // 1. Initialize viewer once as a tour configuration to support multi-scene transitions and dynamic configs
      if (!viewerRef.current) {
        viewerRef.current = pnlm.viewer(containerRef.current, {
          default: {
            firstScene: fallbackImageUrl, // Use the image URL as the initial scene ID
            sceneFadeDuration: 600, // Seamless fade transition between scenes
            autoLoad: true,
            showZoomCtrl: true,
            showFullscreenCtrl: false,
          },
          scenes: {
            [fallbackImageUrl]: {
              type: "equirectangular",
              panorama: fallbackImageUrl,
              hotSpots: []
            }
          }
        });

        // Handle the Street View zoom-out effect when loading finishes
        viewerRef.current.on("load", () => {
          if (isNavigatingRef.current && viewerRef.current) {
            isNavigatingRef.current = false;
            viewerRef.current.setHfov(35);
            const v = viewerRef.current;
            setTimeout(() => {
              v.lookAt(0, 0, 100, 500);
            }, 50);
          }
        });
      }

      const viewer = viewerRef.current;

      // 2. Prepare the list of hotspots for the active scene
      const pnlmHotspots: Record<string, unknown>[] = [];

      // Annotations (info spots as custom checkmark/warning/grey circles)
      (annotations || [])
        .filter((ann) => ann.audit_results?.audit_criteria)
        .forEach((ann) => {
          pnlmHotspots.push({
            id: `ann-${ann.id}`,
            pitch: ann.pitch,
            yaw: ann.yaw,
            type: "custom",
            cssClass: "custom-hotspot-ann",
            createTooltipFunc: (hotSpotDiv: HTMLElement) => {
              if (hotSpotDiv.querySelector(".custom-ann-pin")) return;

              hotSpotDiv.style.setProperty("width", "36px", "important");
              hotSpotDiv.style.setProperty("height", "36px", "important");
              hotSpotDiv.style.setProperty("margin-left", "-18px", "important");
              hotSpotDiv.style.setProperty("margin-top", "-18px", "important");
              hotSpotDiv.style.setProperty("background", "transparent", "important");
              hotSpotDiv.style.setProperty("border", "none", "important");
              hotSpotDiv.style.setProperty("display", "flex", "important");
              hotSpotDiv.style.setProperty("align-items", "center", "important");
              hotSpotDiv.style.setProperty("justify-content", "center", "important");

              const inner = document.createElement("div");
              const status = ann.audit_results?.status || "unknown";
              inner.className = `custom-ann-pin custom-ann-pin-${status}`;

              const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
              svg.setAttribute("viewBox", "0 0 24 24");
              svg.setAttribute("class", "custom-ann-svg");

              const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
              if (status === "met") {
                path.setAttribute("d", "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z");
              } else if (status === "not_met") {
                path.setAttribute("d", "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z");
              } else {
                path.setAttribute("d", "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H6c0-3.31 2.69-6 6-6s6 2.69 6 6c0 1.04-.42 1.99-1.07 2.75z");
              }
              path.setAttribute("fill", "currentColor");
              svg.appendChild(path);
              inner.appendChild(svg);
              hotSpotDiv.appendChild(inner);

              hotSpotDiv.addEventListener("click", (e) => {
                e.stopPropagation();
                setSelectedHotspot(ann);
              });

              const label = document.createElement("span");
              label.className = "custom-hotspot-label-upgraded";
              label.innerText = ann.audit_results?.audit_criteria?.short_label || ann.audit_results?.audit_criteria?.code || ann.label;
              hotSpotDiv.appendChild(label);
            },
          });
        });

      // Navigation hotspots (custom 3D flat layout - BLUE ARROW)
      (hotspots || []).forEach((hotspot) => {
        pnlmHotspots.push({
          id: `nav-${hotspot.id}`,
          pitch: hotspot.pitch,
          yaw: hotspot.yaw,
          type: "custom",
          cssClass: "custom-hotspot-nav",
          createTooltipFunc: (hotSpotDiv: HTMLElement) => {
            if (hotSpotDiv.querySelector(".custom-hotspot-inner-upgraded")) return;

            hotSpotDiv.style.setProperty("width", "48px", "important");
            hotSpotDiv.style.setProperty("height", "48px", "important");
            hotSpotDiv.style.setProperty("margin-left", "-24px", "important");
            hotSpotDiv.style.setProperty("margin-top", "-24px", "important");
            hotSpotDiv.style.setProperty("background", "transparent", "important");
            hotSpotDiv.style.setProperty("border", "none", "important");
            hotSpotDiv.style.setProperty("box-shadow", "none", "important");
            hotSpotDiv.style.setProperty("display", "flex", "important");
            hotSpotDiv.style.setProperty("align-items", "center", "important");
            hotSpotDiv.style.setProperty("justify-content", "center", "important");

            const inner = document.createElement("div");
            inner.className = "custom-hotspot-inner-upgraded";
            
            hotSpotDiv.addEventListener("mouseenter", () => {
              inner.style.setProperty("transform", "perspective(200px) rotateX(48deg) scale(1.15)", "important");
            });
            hotSpotDiv.addEventListener("mouseleave", () => {
              inner.style.setProperty("transform", "perspective(200px) rotateX(60deg)", "important");
            });
            
            const pulse = document.createElement("div");
            pulse.className = "custom-hotspot-pulse";
            inner.appendChild(pulse);
            
            const arrowWrapper = document.createElement("div");
            arrowWrapper.className = "custom-hotspot-arrow-wrapper";
            
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("class", "custom-hotspot-arrow-svg");
            
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M12 3l8 16-8-4-8 16z");
            path.setAttribute("fill", "currentColor");
            svg.appendChild(path);
            
            arrowWrapper.appendChild(svg);
            inner.appendChild(arrowWrapper);
            hotSpotDiv.appendChild(inner);
            
            const label = document.createElement("span");
            label.className = "custom-hotspot-label-upgraded";
            label.innerText = hotspot.label || "Ke titik selanjutnya";
            hotSpotDiv.appendChild(label);
          },
          clickHandlerFunc: () => {
            isNavigatingRef.current = true;
            viewer.lookAt(hotspot.pitch, hotspot.yaw, 35, 400, () => {
              onNavigateToScene?.(hotspot.target_scene_id);
            });
          },
        });
      });

      // 3. Render or transition scenes
      const currentScene = viewer.getScene();
      if (currentScene !== fallbackImageUrl) {
        const sceneId = fallbackImageUrl; // Unique ID based on the URL
        
        viewer.addScene(sceneId, {
          type: "equirectangular",
          panorama: fallbackImageUrl,
          hotSpots: pnlmHotspots,
          autoLoad: true,
        });

        viewer.loadScene(sceneId);
      } else {
        const currentConfig = viewer.getConfig();
        const currentHotspots = [...(currentConfig.hotSpots || [])];
        
        currentHotspots.forEach((h: { id?: string; div?: HTMLElement }) => {
          if (h.id) {
            if (h.div) {
              viewer.removeHotSpot(h.id);
            } else {
              if (currentConfig.hotSpots) {
                const idx = currentConfig.hotSpots.indexOf(h);
                if (idx > -1) {
                  currentConfig.hotSpots.splice(idx, 1);
                }
              }
            }
          }
        });

        pnlmHotspots.forEach((h) => {
          viewer.addHotSpot(h);
        });
      }
    } catch (err) {
      console.error("CRITICAL ERROR IN TOURVIEWER EFFECT:", err);
    }
  }, [fallbackImageUrl, annotations, hotspots, editMode, onNavigateToScene]);

  // Clean up viewer on component unmount
  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      ref={wrapperRef}
      className={`relative w-full border border-line rounded-md overflow-hidden bg-bg/20 transition-all ${
        isFullscreen ? "h-screen w-screen z-50 bg-bg" : "h-[65vh] z-0"
      }`}
    >
      {/* Container where native Pannellum renders */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Fullscreen Toggle Button */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute top-4 right-4 z-20 p-2 bg-surface/90 border border-line rounded-md shadow-md text-ink hover:text-accent transition-colors cursor-pointer flex items-center justify-center focus:outline-none"
        title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
      >
        {isFullscreen ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0l5 0M4 4v5m11-5l5 5m0-5h-5m5 0v5m-5 11l5 5m0 0h-5m5 0v-5m-11 5l-5-5m0 5h5m-5 0v-5" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        )}
      </button>

      {/* Target/Crosshair Center Overlay in Edit Mode */}
      {editMode && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute w-full h-[2px] bg-accent/70"></div>
            <div className="absolute h-full w-[2px] bg-accent/70"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-accent border border-white"></div>
          </div>
          <span className="absolute mt-14 bg-surface border border-line px-2 py-0.5 rounded text-[10px] text-ink font-semibold shadow-md whitespace-nowrap">
            Bidikan Hotspot Baru
          </span>
        </div>
      )}

      {/* Custom styled criteria detail panel overlay */}
      {selectedHotspot && selectedHotspot.audit_results?.audit_criteria && (() => {
        const criteria = selectedHotspot.audit_results.audit_criteria;
        const statusConfig = statusMap[selectedHotspot.audit_results.status] || statusMap.unknown;

        return (
          <div className="absolute top-16 right-4 left-4 sm:left-auto z-20 max-w-sm sm:w-80 bg-surface/95 backdrop-blur-md border border-line rounded-md p-4 shadow-md font-sans text-xs max-h-[70vh] overflow-y-auto">
            {/* Header */}
            <div className="flex flex-col gap-1.5 pb-2 border-b border-line mb-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-sans font-semibold text-[13px] text-ink leading-tight">
                  {criteria.short_label || criteria.code}
                </span>
                <span className={`px-2 py-0.5 border rounded-md text-[9px] font-sans font-bold uppercase tracking-wider shrink-0 ${statusConfig.colorClass}`}>
                  {statusConfig.label}
                </span>
              </div>
              {criteria.short_label && (
                <span className="font-mono text-[9px] text-ink-muted uppercase tracking-wider">
                  Kode: {criteria.code}
                </span>
              )}
            </div>

            {/* Description */}
            <p className="font-sans font-medium text-ink leading-relaxed mb-3 text-[12px]">
              {criteria.description}
            </p>

            {/* Reasoning */}
            <div className="bg-bg/40 border border-line/50 p-2.5 rounded-md text-[11px] text-ink-muted mb-4 max-h-36 overflow-y-auto">
              <span className="block font-semibold mb-0.5 text-ink/75">Analisis AI:</span>
              {selectedHotspot.audit_results.reasoning || "Tidak ada rincian penalaran."}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-1">
              <span className="text-[10px] font-sans text-ink-muted capitalize">
                Kategori: {criteria.category}
              </span>
              <button
                onClick={() => setSelectedHotspot(null)}
                className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors focus:outline-none cursor-pointer"
              >
                Tutup Info
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
