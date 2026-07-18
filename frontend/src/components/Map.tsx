"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Reset default marker icon paths (fix for React/Webpack import issue in Next.js)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Helper component to center and pan map dynamically when coordinates update
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (map && typeof map.setView === "function" && map.getContainer()) {
      try {
        map.setView(center, 15);
      } catch (err) {
        console.warn("Leaflet setView warning:", err);
      }
    }
  }, [center, map]);
  return null;
}

interface MapProps {
  center: [number, number];
  onChange: (lat: number, lng: number) => void;
}

export default function Map({ center, onChange }: MapProps) {
  const markerRef = useRef<L.Marker | null>(null);
  const [mapKey] = useState(() => `map-${center[0]}-${center[1]}`);

  // Drag handlers for updating coordinates when pin is moved
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          onChange(latLng.lat, latLng.lng);
        }
      },
    }),
    [onChange]
  );

  return (
    <MapContainer
      key={mapKey}
      center={center}
      zoom={13}
      scrollWheelZoom={false}
      className="h-[380px] w-full rounded-md border border-line z-0"
    >
      <ChangeView center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        draggable={true}
        eventHandlers={eventHandlers}
        position={center}
        ref={markerRef}
      />
    </MapContainer>
  );
}
