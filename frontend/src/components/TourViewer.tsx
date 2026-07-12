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

interface TourViewerProps {
  fallbackImageUrl: string;
  annotations: Annotation[];
  hotspots: Hotspot[];
  onNavigateToScene?: (targetSceneId: string) => void;
  editMode?: boolean;
  pannellumRef?: React.RefObject<any>;
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
  const viewerRef = useRef<any>(null);
  const isNavigatingRef = useRef(false);

  // Expose the viewer instance to the parent component safely
  useEffect(() => {
    if (pannellumRef) {
      (pannellumRef as any).current = {
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

      .custom-hotspot-pulse {
        position: absolute !important;
        inset: 4px !important;
        border-radius: 50% !important;
        border: 2px solid #14B8A6 !important;
        background: rgba(20, 184, 166, 0.2) !important;
        box-shadow: 0 0 12px #14B8A6, inset 0 0 8px #14B8A6 !important;
        pointer-events: none !important;
        animation: hotspot-pulse-wave 2s infinite ease-out !important;
      }

      @keyframes hotspot-pulse-wave {
        0% {
          transform: scale(0.92);
          opacity: 0.85;
          box-shadow: 0 0 8px #14B8A6, inset 0 0 4px #14B8A6;
        }
        50% {
          transform: scale(1.03);
          opacity: 1;
          box-shadow: 0 0 16px #14B8A6, inset 0 0 10px #14B8A6;
        }
        100% {
          transform: scale(0.92);
          opacity: 0.85;
          box-shadow: 0 0 8px #14B8A6, inset 0 0 4px #14B8A6;
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
        color: #E2FFF8 !important;
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

      .custom-hotspot-nav:hover .custom-hotspot-label-upgraded {
        opacity: 1 !important;
        transform: translate3d(-50%, 0, 0) scale(1) !important;
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
      if (typeof window === "undefined" || !(window as any).pannellum || !containerRef.current) return;

      const pnlm = (window as any).pannellum;

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
          if (isNavigatingRef.current) {
            isNavigatingRef.current = false;
            viewerRef.current.setHfov(35);
            setTimeout(() => {
              viewerRef.current.lookAt(0, 0, 100, 500);
            }, 50);
          }
        });
      }

      const viewer = viewerRef.current;

      // 2. Prepare the list of hotspots for the active scene
      const pnlmHotspots: any[] = [];

      // Annotations (info spots)
      (annotations || [])
        .filter((ann) => ann.audit_results?.audit_criteria)
        .forEach((ann) => {
          pnlmHotspots.push({
            id: `ann-${ann.id}`,
            pitch: ann.pitch,
            yaw: ann.yaw,
            type: "info",
            text: ann.audit_results?.audit_criteria?.code || "Kriteria",
            clickHandlerFunc: () => {
              setSelectedHotspot(ann);
            },
          });
        });

      // Navigation hotspots (custom 3D flat layout)
      (hotspots || []).forEach((hotspot) => {
        pnlmHotspots.push({
          id: `nav-${hotspot.id}`,
          pitch: hotspot.pitch,
          yaw: hotspot.yaw,
          type: "custom",
          cssClass: "custom-hotspot-nav",
          createTooltipFunc: (hotSpotDiv: HTMLElement) => {
            if (hotSpotDiv.querySelector(".custom-hotspot-inner-upgraded")) return;

            // Force precise dimensions, offsets, and centering inline to prevent top-left shifting
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
            
            // JavaScript-driven hover effect to ensure perfect responsive transition even if style injection has slight delay
            hotSpotDiv.addEventListener("mouseenter", () => {
              inner.style.setProperty("transform", "perspective(200px) rotateX(48deg) scale(1.15)", "important");
            });
            hotSpotDiv.addEventListener("mouseleave", () => {
              inner.style.setProperty("transform", "perspective(200px) rotateX(60deg)", "important");
            });
            
            // Pulse circle (bottom ring)
            const pulse = document.createElement("div");
            pulse.className = "custom-hotspot-pulse";
            inner.appendChild(pulse);
            
            // SVG Arrow wrapper
            const arrowWrapper = document.createElement("div");
            arrowWrapper.className = "custom-hotspot-arrow-wrapper";
            
            // Create SVG Arrow pointing forward
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
            // Smoothly zoom in towards target and load scene on complete
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
        
        // Register the scene configuration dynamically
        viewer.addScene(sceneId, {
          type: "equirectangular",
          panorama: fallbackImageUrl,
          hotSpots: pnlmHotspots,
          autoLoad: true,
        });

        // Navigate to the scene smoothly
        viewer.loadScene(sceneId);
      } else {
        // Dynamic Hotspot list sync for active scene (avoids reloading WebGL image)
        const currentConfig = viewer.getConfig();
        const currentHotspots = [...(currentConfig.hotSpots || [])];
        
        // Remove all old hotspots safely
        currentHotspots.forEach((h: any) => {
          if (h.id) {
            if (h.div) {
              viewer.removeHotSpot(h.id);
            } else {
              // Splicing manually if DOM element is not rendered yet to prevent parentNode TypeErrors
              if (currentConfig.hotSpots) {
                const idx = currentConfig.hotSpots.indexOf(h);
                if (idx > -1) {
                  currentConfig.hotSpots.splice(idx, 1);
                }
              }
            }
          }
        });

        // Add all new hotspots
        pnlmHotspots.forEach((h: any) => {
          viewer.addHotSpot(h);
        });
      }
    } catch (err) {
      console.error("CRITICAL ERROR IN TOURVIEWER EFFECT:", err);
    }
  }, [fallbackImageUrl, annotations, hotspots, editMode]);

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
    <div className="relative w-full h-[65vh] border border-line rounded-md overflow-hidden bg-bg/20">
      {/* Container where native Pannellum renders */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Target/Crosshair Center Overlay in Edit Mode */}
      {editMode && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
          <div className="relative w-8 h-8 flex items-center justify-center">
            {/* Horizontal Line */}
            <div className="absolute w-full h-[2px] bg-accent/70"></div>
            {/* Vertical Line */}
            <div className="absolute h-full w-[2px] bg-accent/70"></div>
            {/* Inner Dot */}
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
          <div className="absolute top-4 right-4 z-10 max-w-sm w-80 bg-surface border border-line rounded-md p-4 shadow-md font-sans text-xs">
            {/* Header: criteria code & badge */}
            <div className="flex items-center justify-between pb-2 border-b border-line mb-3">
              <span className="font-mono font-medium text-[11px] text-ink-muted tracking-wider">
                {criteria.code}
              </span>
              <span className={`px-2 py-0.5 border rounded-md text-[9px] font-sans font-bold uppercase tracking-wider ${statusConfig.colorClass}`}>
                {statusConfig.label}
              </span>
            </div>

            {/* Body Description */}
            <p className="font-sans font-medium text-ink leading-relaxed mb-3 text-[12px]">
              {criteria.description}
            </p>

            {/* Agent reasoning block */}
            <div className="bg-bg/40 border border-line/50 p-2.5 rounded-md text-[11px] text-ink-muted mb-4 max-h-36 overflow-y-auto">
              <span className="block font-semibold mb-0.5 text-ink/75">Analisis AI:</span>
              {selectedHotspot.audit_results.reasoning || "Tidak ada rincian penalaran."}
            </div>

            {/* Action buttons */}
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
