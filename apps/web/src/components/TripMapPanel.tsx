import type { Destination } from "@pangofold/shared";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface MapPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: "itinerary" | "food" | "activity";
}

export function collectDestinationMapPoints(dest: Destination): MapPoint[] {
  const out: MapPoint[] = [];

  for (const day of dest.days) {
    for (const item of day.items) {
      const lat = item.place?.lat;
      const lng = item.place?.lng;
      if (lat == null || lng == null) continue;
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      out.push({ id: item.id, label: item.title, lat, lng, kind: "itinerary" });
    }
  }

  for (const f of dest.foodSpots) {
    const lat = f.place?.lat;
    const lng = f.place?.lng;
    if (lat == null || lng == null) continue;
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    out.push({ id: f.id, label: f.name, lat, lng, kind: "food" });
  }

  for (const a of dest.activities) {
    const lat = a.place?.lat;
    const lng = a.place?.lng;
    if (lat == null || lng == null) continue;
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    out.push({ id: a.id, label: a.name, lat, lng, kind: "activity" });
  }

  return out;
}

function MapFitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
  }, [map, points]);

  return null;
}

interface TripMapPanelProps {
  dest: Destination;
}

export function TripMapPanel({ dest }: TripMapPanelProps) {
  const points = collectDestinationMapPoints(dest);
  const positions = points.map((p) => [p.lat, p.lng] as [number, number]);

  let center: [number, number] = [49.25, -123.12];
  if (points.length === 1) {
    center = [points[0].lat, points[0].lng];
  } else if (points.length > 1) {
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    center = [lat, lng];
  }

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface-muted/60 px-4 py-10 text-center text-sm text-text-muted">
        No map pins yet. Use <strong className="text-text">Enrich places (Google)</strong> on the trip so stops get
        coordinates — then they appear here (OpenStreetMap, no extra map key).
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden h-[min(52vh,440px)] z-0">
      <MapContainer
        key={dest.id}
        center={center}
        zoom={12}
        className="h-full w-full z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFitBounds points={positions} />
        {points.map((p) => (
          <Marker key={`${p.kind}-${p.id}`} position={[p.lat, p.lng]} icon={markerIcon}>
            <Popup>
              <span className="text-xs font-medium">{p.label}</span>
              <span className="block text-[10px] text-text-muted capitalize mt-0.5">{p.kind}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
