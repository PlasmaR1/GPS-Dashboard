"use client";
import React, { forwardRef, useImperativeHandle } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Source, Layer } from "react-map-gl";
import type { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Feature } from "geojson";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { CITIES, DEFAULT_CITY, type CityKey } from "@/lib/cities";
import RoutesHeatmap from "@/components/RoutesHeatmap";
import "mapbox-gl/dist/mapbox-gl.css";


import  mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import SpotMarker from "./SpotMarker";
import CityPicker, { AnyCity } from "@/components/CityPicker";
import { ZONE_COLORS, 
      ZoneType, 
      ensureZonesRenderLayers, 
      updateZonesRender, 
      RightToolbar, 
      BikesPanel, 
      ZoneTypePicker, 
      type BikeGeo, 
      type BikeExtra, 
      ExportGeoJSONButton, 
      exportCityGeoJSON ,
      ImportGeoJSONButton 
    } from "./LiveBikeMap.parts";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

const STORAGE_KEY = "zonesByCity";
type ZonesByCity = Record<string, FeatureCollection>;

function loadZones(): ZonesByCity {
try {
const raw = localStorage.getItem(STORAGE_KEY);
return raw ? JSON.parse(raw) : ({} as ZonesByCity);
} catch {
return {} as ZonesByCity;
}
}
function saveZones(z: Record<string, FeatureCollection>) {
localStorage.setItem(STORAGE_KEY, JSON.stringify(z));
}
function collectDrawToFeatureCollection(draw: MapboxDraw): FeatureCollection {
const all = draw.getAll();
const onlyPolygons: Feature[] = (all.features || []).filter(
(f) => f.geometry?.type === "Polygon"
);
return { type: "FeatureCollection", features: onlyPolygons };
}
function syncCityZonesToDraw(draw: MapboxDraw | null | undefined, fc?: FeatureCollection) {
if (!draw) return;
try { draw.deleteAll(); } catch {}
if (!fc?.features) return;
for (const f of fc.features) {
try { draw.add(f as any); } catch {}
}
}

const bikePointLayer: any = {
id: "bike-points",
type: "circle",
source: "bikes",
paint: {
"circle-radius": 6,
"circle-color": "#111827",
"circle-stroke-color": "#ffffff",
"circle-stroke-width": 2,
},
};
const bikeLabelLayer: any = {
id: "bike-labels",
type: "symbol",
source: "bikes",
layout: {
"text-field": ["get", "name"],
"text-size": 12,
"text-offset": [0, 0.8],
"text-anchor": "top",
},
paint: {
"text-color": "#111827",
"text-halo-color": "#ffffff",
"text-halo-width": 1.2,
},
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
const toRad = (d: number) => (d * Math.PI) / 180,
R = 6371000;
const dLat = toRad(lat2 - lat1),
dLng = toRad(lng2 - lng1);
const a =
Math.sin(dLat / 2) ** 2 +
Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
return 2 * R * Math.asin(Math.sqrt(a));
}

export default function LiveBikeMap() {
const mapRef = useRef<MapboxMap | null>(null);
const drawRef = useRef<MapboxDraw | null>(null);
const geocoderRef = useRef<HTMLDivElement | null>(null);

const [city, setCity] = useState<CityKey>(DEFAULT_CITY);

const [parkingFC, setParkingFC] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });
const [businessFC, setBusinessFC] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });

// Load/save spots & businesses per-city
useEffect(() => {
try {
  const p = localStorage.getItem(`parking:${city}`);
  const b = localStorage.getItem(`business:${city}`);
  if (p) setParkingFC(JSON.parse(p));
  else setParkingFC({ type: "FeatureCollection", features: [] });
  if (b) setBusinessFC(JSON.parse(b));
  else setBusinessFC({ type: "FeatureCollection", features: [] });
} catch {}
}, [city]);

useEffect(() => {
try { localStorage.setItem(`parking:${city}`, JSON.stringify(parkingFC)); } catch {}
}, [city, parkingFC]);

useEffect(() => {
try { localStorage.setItem(`business:${city}`, JSON.stringify(businessFC)); } catch {}
}, [city, businessFC]);
const cityRef = useRef<CityKey>(DEFAULT_CITY);
useEffect(() => { cityRef.current = city; }, [city]);

const [bikeFC, setBikeFC] = useState<BikeGeo>({ type: "FeatureCollection", features: [] });
const [bikeExtra, setBikeExtra] = useState<Record<string, BikeExtra>>({});
const [pendingFeatureId, setPendingFeatureId] = useState<string | null>(null);
const [pendingIsNew, setPendingIsNew] = useState<boolean>(false);
const [isDrawing, setIsDrawing] = useState(false);
const [lastZoneType, setLastZoneType] = useState<ZoneType | null>(null);

const initialView = useMemo(() => {
const c = CITIES[city];
return { longitude: c.center[0], latitude: c.center[1], zoom: c.zoom };
}, []);

const loadCityZonesIntoDraw = (cityKey: CityKey) => {
const draw = drawRef.current;
if (!draw) return;
const stored = loadZones();
syncCityZonesToDraw(draw, stored[cityKey]);
};


const persistCurrentCity = () => {
const draw = drawRef.current;
if (!draw) return;
const all = collectDrawToFeatureCollection(draw);
// 仅保存已定义类型的区块
all.features = all.features.filter((f) => (f.properties as any)?.zoneType);
const current = loadZones();
current[cityRef.current] = all;
saveZones(current);
};

// applyZoneType
const applyZoneType = (type: ZoneType) => {
const draw = drawRef.current;
const map = mapRef.current;
const id = pendingFeatureId;
if (!draw || !map || !id) return;

try {
  // @ts-ignore
  if (typeof draw.setFeatureProperty === "function") {
    // @ts-ignore
    draw.setFeatureProperty(id, "zoneType", type);
  } else {
    throw new Error("setFeatureProperty not available");
  }
} catch {
  const f = draw.get(id) as any;
  if (f) {
    f.properties = { ...(f.properties || {}), zoneType: type };
    // @ts-ignore
    draw.delete(id);
    draw.add(f);
  }
}

updateZonesRender(map, draw);
setLastZoneType(type);
persistCurrentCity();
setPendingFeatureId(null);
};


const cancelZoneType = () => {
const draw = drawRef.current;
const map = mapRef.current;
const id = pendingFeatureId;
if (draw && map && id) {
  try {
    const f: any = draw.get(id);
    const hasType = !!(f && f.properties && f.properties.zoneType);
    if (pendingIsNew && !hasType) {
      // only delete newly-created polygon without a zoneType
      // @ts-ignore
      draw.delete(id);
      updateZonesRender(map, draw);
      persistCurrentCity();
    }
  } catch (e) {
    console.warn("[cancelZoneType]", e);
  }
}
setPendingFeatureId(null);
setPendingIsNew(false);
};


const deleteSelectedZones = () => {
const draw = drawRef.current;
const map = mapRef.current;
if (!draw || !map) return;
// @ts-ignore
if (typeof draw.trash === "function") draw.trash();
updateZonesRender(map, draw);
persistCurrentCity();
};

// 切换绘制模式(按钮)
const toggleDrawMode = () => {
const draw = drawRef.current as any;
if (!draw) return;
if (isDrawing) {
  // 结束绘制,回到选择模式并持久化
  if (typeof draw.changeMode === "function") {
    draw.changeMode("simple_select");
  }
  setIsDrawing(false);
  persistCurrentCity();
} else {
  // 开始绘制
  if (typeof draw.changeMode === "function") {
    draw.changeMode("draw_polygon");
  }
  setIsDrawing(true);
}
};

useEffect(() => {
const onKey = (e: KeyboardEvent) => {
  // 'R' opens zone type menu for the currently selected polygon
  if ((e.key === 'r' || e.key === 'R')) {
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl && (activeEl.isContentEditable || ['input','textarea','select'].includes((activeEl.tagName||'').toLowerCase()))) {
      // do not trigger in text inputs
    } else {
      const draw: any = drawRef.current;
      if (draw) {
        let ids: string[] = [];
        try {
          if (typeof draw.getSelectedIds === 'function') ids = draw.getSelectedIds();
          else if (typeof draw.getSelected === 'function') {
            const sel = draw.getSelected();
            ids = (sel?.features || []).map((f: any) => f.id).filter(Boolean);
          }
        } catch {}
        if (ids.length === 1) {
          try {
            const f = draw.get(ids[0]);
            if (f?.geometry?.type === 'Polygon') {
              setPendingFeatureId(ids[0]);
              setPendingIsNew(false);
            }
          } catch {}
        }
      }
    }
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelectedZones();
  }
};
window.addEventListener("keydown", onKey);
return () => window.removeEventListener("keydown", onKey);
}, []);

// 车辆数据 & 逆地理
useEffect(() => {
let mounted = true;
const pending = new Set<string>();

async function reverseGeocode(id: string, lng: number, lat: number, nowTs: number) {
  if (pending.has(id)) return;
  pending.add(id);
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1&language=en`;
    const r = await fetch(url);
    const j = await r.json();
    const place = j?.features?.[0]?.place_name as string | undefined;
    if (!mounted) return;
    setBikeExtra((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        address: place ?? prev[id]?.address,
        lastGeocode: { lat, lng, ts: nowTs },
      },
    }));
  } catch {
    setBikeExtra((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), lastGeocode: { lat, lng, ts: nowTs } },
    }));
  } finally {
    pending.delete(id);
  }
}

async function fetchBikes() {
  try {
    const res = await fetch("/api/bikes", { cache: "no-store" });
    const arr = await res.json();
    if (!mounted) return;
    const now = Date.now();
    const features: Feature[] = (arr || []).map((b: any) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [b.lng, b.lat] },
      properties: { id: b.id, name: b.name || b.id, lat: b.lat, lng: b.lng },
    }));
    setBikeFC({ type: "FeatureCollection", features });

    setBikeExtra((prev) => {
      const next = { ...prev };
      for (const f of features) {
        const id = (f.properties as any)?.id as string;
        const lng = (f.geometry as any)?.coordinates?.[0];
        const lat = (f.geometry as any)?.coordinates?.[1];
        next[id] = { ...(next[id] || {}), lastUpdated: now, status: "online" };
        const last = next[id].lastGeocode;
        const moved =
          typeof lat === "number" &&
          typeof lng === "number" &&
          last &&
          haversineMeters(lat, lng, last.lat, last.lng) > 80;
        const stale = !last || now - last.ts > 120_000;
        if ((stale || moved) && typeof lat === "number" && typeof lng === "number") {
          reverseGeocode(id, lng, lat, now);
        }
      }
      return next;
    });
  } catch {}
}

fetchBikes();
const id = setInterval(fetchBikes, 5000);
return () => {
  mounted = false;
  clearInterval(id);
};
}, []);

// Draw/渲染在 style.load 时复挂 
const drawMountedRef = useRef(false);
const renderMountedRef = useRef(false);

const [ready, setReady] = useState(false);

const onMapLoad = () => {
if (!mapRef.current) return;
const map = mapRef.current;
setReady(true);

const setupDraw = () => {
  if (drawMountedRef.current) return;

  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: { polygon: true, trash: true },
    userProperties: true,
    // Draw 自身图层透明，仅保留极细描边用于交互反馈
    styles: [
      {
        id: "gl-draw-polygon-fill-inactive",
        type: "fill",
        filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
        paint: { "fill-color": "#000000", "fill-opacity": 0 },
      },
      {
        id: "gl-draw-polygon-stroke-inactive",
        type: "line",
        filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
        paint: { "line-color": "#000000", "line-width": 0.5, "line-opacity": 0.15 },
      },
      {
        id: "gl-draw-polygon-fill-active",
        type: "fill",
        filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
        paint: { "fill-color": "#000000", "fill-opacity": 0 },
      },
      {
        id: "gl-draw-polygon-stroke-active",
        type: "line",
        filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
        paint: { "line-color": "#000000", "line-width": 1, "line-opacity": 0.25 },
      },
    ],
  });

  drawRef.current = draw;
  map.addControl(draw as any, "top-left");

  // 载入当前城市的 zone
  loadCityZonesIntoDraw(cityRef.current);   

  // 事件：变化后同步渲染并持久化
  map.on("draw.create", (e: any) => {
    const created = e.features as Feature[];
    if (created?.length) {
      const id = created[0].id as string;
      setPendingFeatureId(id);
      setPendingIsNew(true);
      // 预填上一次类型
      if (lastZoneType) {
        // @ts-ignore
        draw.setFeatureProperty(id, "zoneType", lastZoneType);
      }
    }
    updateZonesRender(map, draw);
    persistCurrentCity();
  });
  map.on("draw.update", () => {
    updateZonesRender(map, draw);
    persistCurrentCity();
  });
  map.on("draw.delete", () => {
    updateZonesRender(map, draw);
    persistCurrentCity();
  });

  map.on("draw.modechange", (e: any) => setIsDrawing(e?.mode === "draw_polygon"));

  drawMountedRef.current = true;
};

const setupZonesRender = () => {
  if (renderMountedRef.current && map.getSource("zones-render")) return;
  ensureZonesRenderLayers(map);

// Click to open editor on our markers
try {
  map.on("click", "parking-points", (e: any) => {
    const id = e.features?.[0]?.properties?.id || e.features?.[0]?.id;
    if ((window as any).__openSpotEditor && id) (window as any).__openSpotEditor(String(id));
  });
  map.on("click", "business-points", (e: any) => {
    const id = e.features?.[0]?.properties?.id || e.features?.[0]?.id;
    if ((window as any).__openSpotEditor && id) (window as any).__openSpotEditor(String(id));
  });
  map.getCanvas().style.cursor = "";
} catch {}

  const draw = drawRef.current;
  if (draw) updateZonesRender(map, draw);
  renderMountedRef.current = true;
};

// 首次挂载
setupDraw();
setupZonesRender();

// 样式重载（切换 mapStyle）时复挂两者
map.on("style.load", () => {
  drawMountedRef.current = false;
  renderMountedRef.current = false;
  setupDraw();
  setupZonesRender();
});

// ===== Geocoder=====
if (geocoderRef.current && mapRef.current) {
  const geocoder = new MapboxGeocoder({
    accessToken: MAPBOX_TOKEN,
    mapboxgl,
    placeholder: "Search address…",
    proximity: {
      longitude: mapRef.current.getCenter().lng,
      latitude: mapRef.current.getCenter().lat,
    },
    countries: "au",
  });

  geocoder.addTo(geocoderRef.current);

  const inputEl = geocoderRef.current?.querySelector<HTMLInputElement>(
    "input.mapboxgl-ctrl-geocoder--input"
  );
  const onKeydownStopBubble = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (e.key === "Backspace" || e.key === "Delete") e.stopPropagation();
  };
  if (inputEl) inputEl.addEventListener("keydown", onKeydownStopBubble as EventListener);

  if (!map.getSource("geocoder-point")) {
    map.addSource("geocoder-point", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "geocoder-point-layer",
      type: "circle",
      source: "geocoder-point",
      paint: {
        "circle-radius": 8,
        "circle-color": "#ff7500",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }

  geocoder.on("result", (e: any) => {
    const c = e?.result?.center;
    if (Array.isArray(c) && c.length === 2 && typeof c[0] === "number" && typeof c[1] === "number") {
      const [lng, lat] = c as [number, number];
      map.flyTo({ center: [lng, lat], zoom: 15, essential: true });

      const src = map.getSource("geocoder-point") as mapboxgl.GeoJSONSource;
      src.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: {} },
        ],
      });
    } else {
      console.warn("Geocoder result has no valid center:", e?.result);
    }
  });

  geocoder.on("clear", () => {
    const src = map.getSource("geocoder-point") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData({ type: "FeatureCollection", features: [] });
  });

  geocoder.on("error", (err: any) => console.warn("[geocoder error]", err));

  const cleanup = () => {
    try {
      if (inputEl) inputEl.removeEventListener("keydown", onKeydownStopBubble as EventListener);
      geocoder.clear();
    } catch {}
  };
  map.on("remove", cleanup);
}
};

// Ctrl 快捷绘制
useEffect(() => {
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Control") {
    const draw = drawRef.current;
    // @ts-ignore
    if (draw?.changeMode && !isDrawing) {
      // @ts-ignore
      draw.changeMode("draw_polygon");
      setIsDrawing(true);
    }
  }
};
const onKeyUp = (e: KeyboardEvent) => {
  if (e.key === "Control") {
    const draw = drawRef.current;
    // @ts-ignore
    if (draw?.changeMode) {
      // @ts-ignore
      draw.changeMode("simple_select");
      setIsDrawing(false);
      persistCurrentCity();
    }
  }
};
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
return () => {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
};
}, [isDrawing]);

return (
<div className="w-full h-full">
  <style jsx global>{`
    .mapboxgl-ctrl-top-left { margin-top: 64px; }
    .mapboxgl-ctrl-top-right { margin-top: 64px; }
    .mapboxgl-ctrl-geocoder { width: 100% !important; min-width: 0 !important; }
  `}</style>


  {/* 顶部地址搜索栏 */}
  <div ref={geocoderRef} className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[520px] max-w-[92vw]" />

  {/* 右上城市切换 + GeoJSON*/}
  <div className="absolute top-4 right-6 z-20 flex gap-2 items-center">
  <CityPicker
      builtinCities={CITIES}
      value={city}
      onChange={(next: AnyCity) => {
        setCity(next.id as CityKey); 
        const map = mapRef.current;
        if (map) map.flyTo({ center: next.center, zoom: next.zoom, essential: true });
        loadCityZonesIntoDraw(next.id as CityKey);
        const draw = drawRef.current;
        if (map && draw) updateZonesRender(map, draw);
      }}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!}
    />

    
    <ImportGeoJSONButton
      city={city}
      drawRef={drawRef}
      loadZones={loadZones}
      saveZones={saveZones}
      mapRef={mapRef}
      />


    <ExportGeoJSONButton
      city={city}                 
      loadZones={loadZones}        // () => ZonesByCity
      parkingFC={parkingFC}        // FeatureCollection<Geometry, GeoJsonProperties>
      businessFC={businessFC}
    />
  </div>

  {/* 左侧面板 */}
  <BikesPanel
    bikeFC={bikeFC}
    bikeExtra={bikeExtra}
    onDeleteZones={deleteSelectedZones}
    isDrawing={isDrawing}
    onToggleDraw={toggleDrawMode}
  />

  {/* ZoneType面板 */}
  <ZoneTypePicker
    pendingFeatureId={pendingFeatureId}
    colors={ZONE_COLORS}
    onSelect={applyZoneType}
    onCancel={cancelZoneType}
  />

  {/* 右侧按钮 */}
  <RightToolbar mapRef={mapRef} top={96} />

  {/* 地图主体 */}

{/* 左下角 SpotMarker 浮窗 */}
<SpotMarker
  mapRef={mapRef as any}
  city={city}
  parkingFC={parkingFC}
  setParkingFC={setParkingFC}
  businessFC={businessFC}
  setBusinessFC={setBusinessFC}
/>

<Map
  initialViewState={initialView}
  mapStyle="mapbox://styles/mapbox/streets-v12"
  mapboxAccessToken={MAPBOX_TOKEN}
  style={{ width: "100%", height: "100%", zIndex: 0 }}
  onLoad={onMapLoad}
  ref={(instance) => {
    // @ts-ignore
    mapRef.current = instance?.getMap?.() || (instance as any);
  }}
>

  
  
{mapRef.current && (
        <>
<RoutesHeatmap
  map={mapRef.current}
  file="act-routes-data-for-all-vehicles-in-2025-Q3.geojson"
  sourceId="act-routes-src"
  layerId="act-routes-heat"
/>


<RoutesHeatmap
  map={mapRef.current}
  file="brisbane-routes-data-for-all-vehicles-in-2025-Q3.geojson"
  sourceId="brisbane-2025Q3-src"
  layerId="brisbane-2025Q3-heat"
/>

<RoutesHeatmap
  map={mapRef.current}
  file="melbourne-routes-data-for-all-vehicles-in-2025-Q3.geojson"
  sourceId="melbourne-2025Q3-src"
  layerId="melbourne-2025Q3-heat"
/>



    </>

)}





    <Source id="bikes" type="geojson" data={bikeFC as any}>
      <Layer {...bikePointLayer} />
      <Layer {...bikeLabelLayer} />
    </Source>

    <Source id="parking-spots" type="geojson" data={parkingFC as any}>
      <Layer id="parking-points" type="circle" source="parking-spots" paint={{
        "circle-radius": 6,
        "circle-stroke-width": 1,
        "circle-color": "#10B981",
        "circle-stroke-color": "#064E3B"
      }} />
      <Layer id="parking-labels" type="symbol" source="parking-spots" layout={{
        "text-field": ["coalesce", ["get", "spotType"], ["get", "id"]],
        "text-size": 10,
        "text-offset": [0, 1.2]
      }} paint={{ "text-halo-width": 1, "text-halo-color": "#ffffff" }} />
    </Source>

    <Source id="businesses" type="geojson" data={businessFC as any}>
      <Layer id="business-points" type="circle" source="businesses" paint={{
        "circle-radius": 6,
        "circle-stroke-width": 1,
        "circle-color": "#3B82F6",
        "circle-stroke-color": "#1E3A8A"
      }} />
      <Layer id="business-labels" type="symbol" source="businesses" layout={{
        "text-field": ["coalesce", ["get", "name"], ["get", "id"]],
        "text-size": 10,
        "text-offset": [0, 1.2]
      }} paint={{ "text-halo-width": 1, "text-halo-color": "#ffffff" }} />
    </Source>
  </Map>
</div>
);
}
