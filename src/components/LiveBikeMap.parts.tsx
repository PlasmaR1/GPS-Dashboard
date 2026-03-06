"use client";

import React, { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Feature } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";
import * as mapboxgl from "mapbox-gl";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";

/** 区块类型与颜色（导出给主文件复用） */
export type ZoneType =
  | "operating area"
  | "parking zone"
  | "city zone"
  | "slow zone"
  | "no-go zone";

export const ZONE_COLORS: Record<ZoneType, string> = {
  "operating area": "#22c55e",
  "parking zone": "#3b82f6",
  "city zone": "#a855f7",
  "slow zone": "#f59e0b",
  "no-go zone": "#ef4444",
};

/** 车辆类型（导出给左侧面板） */
export type BikeGeo = { type: "FeatureCollection"; features: Feature[] };
export type BikeExtra = {
  lastUpdated?: number;
  status?: "online" | "offline";
  address?: string;
  lastGeocode?: { lat: number; lng: number; ts: number };
};

/** 渲染层：把 Draw 里的 polygon 同步到彩色源 */
export function updateZonesRender(
  map?: mapboxgl.Map | null,
  draw?: MapboxDraw | null
) {
  if (!map || !draw) return;
  const src = map.getSource("zones-render") as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;

  const fc = draw.getAll() as FeatureCollection;
  fc.features = (fc.features || []).filter((f) => f.geometry?.type === "Polygon");
  src.setData(fc);
}

/** 确保彩色渲染用的 Source/Layer 存在（只创建一次） */
export function ensureZonesRenderLayers(map: mapboxgl.Map) {
  if (!map.getSource("zones-render")) {
    map.addSource("zones-render", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: "zones-render-fill",
      type: "fill",
      source: "zones-render",
      paint: {
        "fill-color": [
          "match",
          ["get", "zoneType"],
          "operating area", ZONE_COLORS["operating area"],
          "parking zone",   ZONE_COLORS["parking zone"],
          "city zone",      ZONE_COLORS["city zone"],
          "slow zone",      ZONE_COLORS["slow zone"],
          "no-go zone",     ZONE_COLORS["no-go zone"],
          /* default */     "#6b7280",
        ],
        "fill-opacity": 0.28,
      },
    });

    map.addLayer({
      id: "zones-render-line",
      type: "line",
      source: "zones-render",
      paint: {
        "line-color": [
          "match",
          ["get", "zoneType"],
          "operating area", ZONE_COLORS["operating area"],
          "parking zone",   ZONE_COLORS["parking zone"],
          "city zone",      ZONE_COLORS["city zone"],
          "slow zone",      ZONE_COLORS["slow zone"],
          "no-go zone",     ZONE_COLORS["no-go zone"],
          /* default */     "#374151",
        ],
        "line-width": 2,
      },
    });
  }
}

/** 右侧 3 个按钮（放大 / 缩小 / Reset North） */
export function RightToolbar({
  mapRef,
  top = 96, // 等价于 top-24
}: {
  mapRef: React.MutableRefObject<MapboxMap | null>;
  top?: number;
}) {
  return (
    <div
      className="absolute right-3 z-20 flex flex-col gap-2"
      style={{ top }}
    >
      <button
        onClick={() => mapRef.current?.zoomIn()}
        className="text-black w-10 h-10 grid place-items-center bg-white/95 border rounded-md shadow hover:bg-gray-100"
        title="Zoom in"
      >
        +
      </button>
      <button
        onClick={() => mapRef.current?.zoomOut()}
        className="text-black w-10 h-10 grid place-items-center bg-white/95 border rounded-md shadow hover:bg-gray-100"
        title="Zoom out"
      >
        −
      </button>
      <button
        onClick={() => mapRef.current?.rotateTo(0, { duration: 300 })}
        className="text-black w-10 h-10 grid place-items-center bg-white/95 border rounded-md shadow hover:bg-gray-100"
        title="Reset north"
      >
        ▲
      </button>
    </div>
  );
}

/** 左侧可拖动面板：展示车辆 & 删除按钮 & 绘制开关 */
export function BikesPanel({
  bikeFC,
  bikeExtra,
  onDeleteZones,
  isDrawing,
  onToggleDraw,
  initialLeft = 16, // left-4
  initialTop = 80,  // top-20
}: {
  bikeFC: BikeGeo;
  bikeExtra: Record<string, BikeExtra>;
  onDeleteZones: () => void;
  isDrawing: boolean;
  onToggleDraw: () => void;
  initialLeft?: number;
  initialTop?: number;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: initialLeft, y: initialTop });
  const [drag, setDrag] = useState<{ active: boolean; dx: number; dy: number }>({
    active: false,
    dx: 0,
    dy: 0,
  });

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const p = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    setDrag({ active: true, dx: p.clientX - pos.x, dy: p.clientY - pos.y });
  };

  useEffect(() => {
    if (!drag.active) return;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const p = ev instanceof TouchEvent ? ev.touches[0] ?? ev.changedTouches[0] : (ev as MouseEvent);
      const w = panelRef.current?.offsetWidth ?? 0;
      const h = panelRef.current?.offsetHeight ?? 0;
      const margin = 8;
      const topGuard = 64;

      let nx = p.clientX - drag.dx;
      let ny = p.clientY - drag.dy;

      nx = Math.max(margin, Math.min(nx, window.innerWidth - w - margin));
      ny = Math.max(topGuard, Math.min(ny, window.innerHeight - h - margin));

      setPos({ x: nx, y: ny });
      ev.preventDefault?.();
    };
    const endMove = () => setDrag((d) => ({ ...d, active: false }));

    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", endMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", endMove);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", endMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", endMove);
    };
  }, [drag.active, drag.dx, drag.dy, pos.x, pos.y]);

  return (
    <div
      ref={panelRef}
      className="absolute z-20 w-110 bg-white shadow rounded-xl p-3 border text-black select-none"
      style={{
        left: pos.x,
        top: pos.y,
        cursor: drag.active ? "grabbing" : "grab",
      }}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
    >
      <div className="text-sm font-semibold mb-2">Bikes</div>
      <div className="space-y-3 max-h-64 overflow-auto pr-1">
        {bikeFC.features.length === 0 && (
          <div className="text-xs text-gray-600">No bike data yet…</div>
        )}
        {bikeFC.features.map((f) => {
          const id = (f.properties as any)?.id as string;
          const name = (f.properties as any)?.name ?? "Bike";
          const lat =
            (f.properties as any)?.lat ??
            (f.geometry as any)?.coordinates?.[1];
          const lng =
            (f.properties as any)?.lng ??
            (f.geometry as any)?.coordinates?.[0];
          const extra = bikeExtra[id] || {};
          const status = extra.status ?? "offline";
          const addr = extra.address;

          return (
            <div key={id || name} className="text-xs leading-5">
              <div className="font-medium">{name}</div>
              <div className="text-gray-700">
                Status:{" "}
                <span
                  className={
                    status === "online" ? "text-green-600" : "text-red-600"
                  }
                >
                  {status}
                </span>
              </div>
              <div className="text-gray-700">
                lat: {typeof lat === "number" ? lat.toFixed(6) : "-"} | lng:{" "}
                {typeof lng === "number" ? lng.toFixed(6) : "-"}
              </div>
              {addr && (
                <div className="text-gray-700 truncate" title={addr}>
                  📍 {addr}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <button
          onClick={onToggleDraw}
          className={
            "w-full border rounded px-2 py-2 text-left " +
            (isDrawing
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-white text-black hover:bg-gray-100")
          }
          title={isDrawing ? "Finish drawing polygon" : "Start drawing polygon"}
        >
          {isDrawing ? "Finish Drawing" : "Draw Zone"}
        </button>

        <button
          onClick={onDeleteZones}
          className="w-full border rounded px-2 py-2 text-left bg-white text-black hover:bg-gray-100"
          title="Delete selected Zone (also Delete/Backspace)"
        >
          Delete Zone
        </button>
        
        <div className="text-[11px] text-gray-600">
          Tips: hold <kbd>Ctrl</kbd> to draw . <kbd>DEL</kbd> deletes selected zone. Press <kbd>R</kbd> to re-select current zone type
        </div>
      </div>
    </div>
  );
}

/** 区块类型选择面板 */
export function ZoneTypePicker({
  pendingFeatureId,
  colors,
  onSelect,
  onCancel,
}: {
  pendingFeatureId: string | null;
  colors: Record<ZoneType, string>;
  onSelect: (t: ZoneType) => void;
  onCancel: () => void;
}) {
  if (!pendingFeatureId) return null;
  const types = Object.keys(colors) as ZoneType[];

  return (
    <div className="absolute top-24 right-6 z-20 w-64 bg-white shadow rounded-xl p-3 border text-black">
      <div className="text-sm font-semibold mb-2">Select zone type</div>
      <div className="grid grid-cols-1 gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => onSelect(t)}
            className="w-full border rounded px-2 py-2 text-left bg-white text-black hover:bg-gray-100"
            title={t}
          >
            <span
              className="inline-block w-3 h-3 mr-2 align-middle rounded"
              style={{ background: colors[t] }}
            />
            {t}
          </button>
        ))}
      </div>
      <div className="mt-2 text-right">
        <button className="text-sm text-gray-700 hover:underline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
//合并导出功能 指定城市的 GeoJSON

// 合并导出：Zone(Polygon) + Parking/Business(Point)
export function exportCityGeoJSON(params: {
  city: string;
  loadZones: () => any;
  parkingFC?: FeatureCollection;   
  businessFC?: FeatureCollection;  
}) {
  const { city, loadZones, parkingFC, businessFC } = params;

  console.log("export sizes:", parkingFC?.features?.length, businessFC?.features?.length);

  try {
    // Zone
    const stored = loadZones();
    const baseZones: FeatureCollection = stored?.[city] || { type: "FeatureCollection", features: [] };

    // Zone Type
    const zoneFeatures = (baseZones.features || [])
      .filter((f: any) => f?.geometry?.type === "Polygon")
      .map((f: any) => {
        const props = { ...(f.properties || {}) };
        const zoneTypeRaw = (props.zoneType ?? props.type ?? props.kind ?? "city zone");
        const zoneType = String(zoneTypeRaw).toLowerCase();
        return { ...f, properties: { ...props, kind: "zone", zoneType } };
      });

    // 3) Parking Spot
    const parkingFeatures = (parkingFC?.features || [])
      .filter((f: any) => f?.geometry?.type === "Point")
      .map((f: any) => {
        const p = { ...(f.properties || {}) };
        return {
          ...f,
          properties: {
            ...p,
            kind: "parking",
            id: p.id,
            spotType: p.spotType,
            spaces: typeof p.spaces === "number" ? p.spaces : (p.spaces ? Number(p.spaces) : undefined),
            image: p.image,
            watchFor: Array.isArray(p.watchFor) ? p.watchFor : (p.watchFor ? [p.watchFor] : undefined),
          },
        };
      });

    // 4) Business Spot
    const businessFeatures = (businessFC?.features || [])
      .filter((f: any) => f?.geometry?.type === "Point")
      .map((f: any) => {
        const p = { ...(f.properties || {}) };
        return {
          ...f,
          properties: {
            ...p,
            kind: "business",
            id: p.id,
            name: p.name,
            image: p.image,
            website: p.website,
            phone: p.phone,
            closestParkingId: p.closestParkingId,
          },
        };
      });

    // Combine
    const combined: FeatureCollection = {
      type: "FeatureCollection",
      features: [...zoneFeatures, ...parkingFeatures, ...businessFeatures],
    };

    // Download
    const blob = new Blob([JSON.stringify(combined, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `${city}-zones-${ts}.geojson`; // Downloadname
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to export merged GeoJSON:", err);
    alert("Download failed。");
  }
}

  
  export function ExportGeoJSONButton({
    city,
    loadZones,
    parkingFC,
    businessFC,
  }: {
    city: string;
    loadZones: () => any;
    parkingFC: FeatureCollection;
    businessFC: FeatureCollection;
  }) {
    return (
      <button
        onClick={() =>
          exportCityGeoJSON({ city, loadZones, parkingFC, businessFC })
        }
        className="border rounded px-3 py-2 bg-white text-black hover:bg-gray-100"
        title="export current city Zone + Spots to GeoJSON"
      >
        Export GeoJSON
      </button>
      
    );
  }
  
  
//导入功能
// 规范化 zoneType，匹配到 ZONE_COLORS
type ZoneTypeAll = ZoneType;
function normalizeZoneType(t: any): ZoneTypeAll {
  const fallback: ZoneTypeAll = "city zone";
  if (!t || typeof t !== "string") return fallback;
  const v = t.toLowerCase();
  const all: ZoneTypeAll[] = [
    "operating area",
    "parking zone",
    "city zone",
    "slow zone",
    "no-go zone",
  ];
  return (all as readonly string[]).includes(v) ? (v as ZoneTypeAll) : fallback;
}

// 去重 key（优先用 feature.id，其次 geometry+zoneType）
function featureKey(f: Feature): string {
  const id = (f as any).id ?? (f.properties as any)?.id;
  if (id) return `id:${String(id)}`;
  const zt = (f.properties as any)?.zoneType ?? "";
  return `geom:${JSON.stringify(f.geometry)}|zt:${zt}`;
}


/* 导入 GeoJSON 按钮, 保留旧 zones */
export function ImportGeoJSONButton({
  city,
  drawRef,
  loadZones,
  saveZones,
  mapRef,
}: {
  city: string;
  drawRef: React.RefObject <MapboxDraw | null>;
  loadZones: () => Record<string, FeatureCollection>;
  saveZones: (z: Record<string, FeatureCollection>) => void;
  mapRef?: React.RefObject <MapboxMap | null>; 
}) {
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as FeatureCollection;

      if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
        alert("Invalid GeoJSON: not a FeatureCollection.");
        e.target.value = "";
        return;
      }

      const draw = drawRef.current;
      if (!draw) {
        alert("Map not ready.");
        e.target.value = "";
        return;
      }

      // 仅保留 Polygon，并规范化 zoneType
      const incoming = (data.features || [])
        .filter((f) => f?.geometry?.type === "Polygon")
        .map((f) => {
          const zt = normalizeZoneType((f.properties as any)?.zoneType);
          (f.properties as any) = { ...(f.properties || {}), zoneType: zt };
          return f;
        });

      // 合并进当前城市
      const stored = loadZones() || {};
      const currentFC: FeatureCollection = stored[city] ?? {
        type: "FeatureCollection",
        features: [],
      };

      const seen = new Set<string>();
      const merged: Feature[] = [];

      // 先保留旧的
      for (const f of currentFC.features || []) {
        const k = featureKey(f);
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(f);
        }
      }

      // 再追加新的
      let appended = 0;
      for (const f of incoming) {
        const k = featureKey(f);
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(f);
          appended++;
          try {
            draw.add(f as any); // 直接加到 Draw
          } catch (err) {
            console.warn("draw.add failed:", err);
          }
        }
      }

      // 写回存储并刷新彩色渲染
      stored[city] = { type: "FeatureCollection", features: merged };
      saveZones(stored);
      if (mapRef?.current) updateZonesRender(mapRef.current, draw);

      alert(` Imported ${appended} new zone(s).`);
    } catch (err) {
      console.error("Import GeoJSON error:", err);
      alert("Failed to read or parse GeoJSON.");
    } finally {
      e.target.value = ""; // 重置 input
    }
  };

  return (
    <label className="border rounded px-3 py-2 bg-white text-black hover:bg-gray-100 cursor-pointer">
      Import GeoJSON
      <input type="file" accept=".geojson,.json" onChange={onPick} hidden />
    </label>
  );
}
