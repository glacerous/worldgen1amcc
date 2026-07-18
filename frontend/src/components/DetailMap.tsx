"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Helper component to center and pan map dynamically when coordinates update
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      try {
        map.setView(center, 19);
      } catch (err) {
        console.warn("Leaflet setView warning:", err);
      }
    }
  }, [center, map]);
  return null;
}

// Custom SVG Pin with accent color #0F5C5C
const customIcon = typeof window !== "undefined"
  ? L.divIcon({
      className: "custom-leaflet-marker-accent",
      html: `
        <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transform: translateY(-4px);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
            <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="#0F5C5C"/>
          </svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    })
  : null;

interface DetailMapProps {
  center: [number, number];
  buildingName: string;
}

export default function DetailMap({ center, buildingName }: DetailMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={19}
      maxZoom={20}
      zoomControl={false}
      scrollWheelZoom={true}
      className="h-full w-full z-0"
    >
      <ChangeView center={center} />
      <TileLayer
        attribution="Esri, Maxar, Earthstar Geographics"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={19}
        maxZoom={20}
      />
      {customIcon && (
        <>
          <Marker position={center} icon={customIcon}>
            <Tooltip 
              permanent 
              direction="top" 
              offset={[0, -28]} 
              className="leaflet-tooltip-custom"
            >
              {buildingName}
            </Tooltip>
          </Marker>
          <Circle
            center={center}
            radius={15}
            pathOptions={{
              color: "#0F5C5C",
              fillColor: "#0F5C5C",
              fillOpacity: 0.15,
              weight: 2,
            }}
          />
        </>
      )}
    </MapContainer>
  );
}
