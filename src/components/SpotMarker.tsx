
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import type { Feature, FeatureCollection, Point } from "geojson";

/* ---------- Types ---------- */
export type ParkingSpotProps = {
  id: string;
  kind: "parking";
  spotType: string;
  spaces: number; // stored as number
  image?: string;
  watchFor?: string[];
};

export type BusinessProps = {
  id: string;
  kind: "business";
  name: string;
  image?: string;
  website?: string;
  phone?: string;
  closestParkingId?: string;
};

export type ParkingFeature = Feature<Point, ParkingSpotProps>;
export type BusinessFeature = Feature<Point, BusinessProps>;

type Props = {
  mapRef: React.MutableRefObject<MapboxMap | null>;
  city: string;
  parkingFC: FeatureCollection;
  setParkingFC: (fc: FeatureCollection) => void;
  businessFC: FeatureCollection;
  setBusinessFC: (fc: FeatureCollection) => void;
  /** 'floating' renders the left-bottom tool; 'headless' hides it (used when top toolbar is present) */
  modeStyle?: "floating" | "headless";
};

type PlaceMode = null | "parking" | "business";

/* ---------- Utils ---------- */
function genId(prefix: "P" | "B") {
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${rnd}`;
}

const WATCH_CHOICES = [
  "near bus stop",
  "footpath",
  "crossing",
  "no-stopping signage",
  "loading zone",
];

/* ---------- Component ---------- */
export default function SpotMarker({
  mapRef,
  city,
  parkingFC,
  setParkingFC,
  businessFC,
  setBusinessFC,
  modeStyle = "floating",
}: Props) {
  const [mode, setMode] = useState<PlaceMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Form state: allow transient empty string for spaces input (UX), but persist as number
  const [parkingForm, setParkingForm] = useState<
    (Omit<ParkingSpotProps, "spaces"> & { spaces: number | "" }) | null
  >(null);
  const [businessForm, setBusinessForm] = useState<BusinessProps | null>(null);

  const parkingList = useMemo(() => {
    return (parkingFC.features as ParkingFeature[]).map((f) => ({
      id: (f.properties?.id as string) || String(f.id),
      label: `${(f.properties?.id as string) || f.id} (${f.properties?.spotType || "spot"})`,
    }));
  }, [parkingFC]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // One-time map click to place a point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mode) return;

    map.getCanvas().style.cursor = "crosshair";
    const once = (e: any) => {
      const { lng, lat } = e.lngLat || e;
      if (mode === "parking") {
        const id = genId("P");
        const feat: ParkingFeature = {
          type: "Feature",
          id,
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            id,
            kind: "parking",
            spotType: "rack",
            spaces: 2,
            image: "",
            watchFor: [],
          },
        };
        const next: FeatureCollection = {
          type: "FeatureCollection",
          features: [feat, ...(parkingFC.features || [])],
        };
        setParkingFC(next);
        setEditingId(id);
        setParkingForm({ ...feat.properties, spaces: 2 });
        setShowPanel(true);
      } else if (mode === "business") {
        const id = genId("B");
        const feat: BusinessFeature = {
          type: "Feature",
          id,
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            id,
            kind: "business",
            name: "New business",
            image: "",
            website: "",
            phone: "",
            closestParkingId: "",
          },
        };
        const next: FeatureCollection = {
          type: "FeatureCollection",
          features: [feat, ...(businessFC.features || [])],
        };
        setBusinessFC(next);
        setEditingId(id);
        setBusinessForm(feat.properties);
        setShowPanel(true);
      }
      setMode(null);
      map.getCanvas().style.cursor = "";
    };

    map.once("click", once);
    return () => {
      try { map.off("click", once as any); } catch {}
      map.getCanvas().style.cursor = "";
    };
  }, [mode, mapRef, parkingFC, businessFC, setParkingFC, setBusinessFC]);

  // Expose global helpers
  useEffect(() => {
    (window as any).__openSpotEditor = (id: string) => {
      if (id?.startsWith("P")) {
        const f = (parkingFC.features as ParkingFeature[]).find(
          (x) => (x.properties?.id || x.id) === id
        );
        if (f) {
          setEditingId(id);
          setParkingForm({ ...(f.properties as ParkingSpotProps), spaces: f.properties?.spaces ?? 0 });
          setBusinessForm(null);
          setShowPanel(true);
        }
      } else if (id?.startsWith("B")) {
        const f = (businessFC.features as BusinessFeature[]).find(
          (x) => (x.properties?.id || x.id) === id
        );
        if (f) {
          setEditingId(id);
          setBusinessForm({ ...(f.properties as BusinessProps) });
          setParkingForm(null);
          setShowPanel(true);
        }
      }
    };
    return () => { try { delete (window as any).__openSpotEditor; } catch {} };
  }, [parkingFC, businessFC]);

  useEffect(() => {
    (window as any).__startPlaceMode = (m: "parking" | "business") => setMode(m);
    return () => { try { delete (window as any).__startPlaceMode; } catch {} };
  }, []);

  // Save edits
  function commitForm() {
    if (editingId?.startsWith("P") && parkingForm) {
      const spacesNum = parkingForm.spaces === "" ? 0 : Number(parkingForm.spaces);
      const next: FeatureCollection = {
        type: "FeatureCollection",
        features: (parkingFC.features as ParkingFeature[]).map((f) =>
          (f.properties?.id || f.id) === editingId
            ? { ...f, properties: { ...(parkingForm as any), spaces: spacesNum, kind: "parking" } }
            : f
        ),
      };
      setParkingFC(next);
      setShowPanel(false);
      setEditingId(null);
    } else if (editingId?.startsWith("B") && businessForm) {
      const next: FeatureCollection = {
        type: "FeatureCollection",
        features: (businessFC.features as BusinessFeature[]).map((f) =>
          (f.properties?.id || f.id) === editingId
            ? { ...f, properties: { ...businessForm, kind: "business" } }
            : f
        ),
      };
      setBusinessFC(next);
      setShowPanel(false);
      setEditingId(null);
    }
  }

  // Delete current
  function deleteCurrent() {
    if (!editingId) return;
    if (editingId.startsWith("P")) {
      const next: FeatureCollection = {
        type: "FeatureCollection",
        features: (parkingFC.features as ParkingFeature[]).filter(
          (f) => (f.properties?.id || f.id) !== editingId
        ),
      };
      setParkingFC(next);
    } else {
      const next: FeatureCollection = {
        type: "FeatureCollection",
        features: (businessFC.features as BusinessFeature[]).filter(
          (f) => (f.properties?.id || f.id) !== editingId
        ),
      };
      setBusinessFC(next);
    }
    setEditingId(null);
    setShowPanel(false);
  }

  // stop key to avoid Mapbox capturing Backspace/Delete
  const stopKey = (e: React.KeyboardEvent) => { e.stopPropagation(); };

  return (
    <div className="absolute left-4 bottom-16 z-40 flex flex-col gap-2">
      {/* Floating card (hidden in headless mode) */}
      {modeStyle !== "headless" && (
        <div className="bg-white/95 backdrop-blur shadow rounded-2xl p-3 border w-64">
          <div className="text-sm font-semibold mb-2 text-black">Spot tools</div>
          {/* Dropdown button */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-full rounded-xl px-3 py-2 border bg-white text-black hover:bg-gray-100 flex items-center justify-between"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              Add Spot
              <span aria-hidden>▾</span>
            </button>

            {menuOpen && (
              <div role="menu" className="absolute left-0 bottom-full mb-2 w-48 bg-white border rounded-xl shadow">
                <button
                  role="menuitem"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-black rounded-t-xl"
                  onClick={() => { setMenuOpen(false); setMode("parking"); }}
                >
                Parking Spot
                </button>
                <button
                  role="menuitem"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-black rounded-b-xl"
                  onClick={() => { setMenuOpen(false); setMode("business"); }}
                >
                Business
                </button>
              </div>
            )}
          </div>

          {mode && (
            <div className="mt-2 text-xs text-gray-600">
              Spot mode <b>{mode === "parking" ? "Parking" : "Business"}</b>
            </div>
          )}
        </div>
      )}

      {/* Editor panel */}
      {showPanel && (
        <div className="bg-white/95 backdrop-blur shadow-lg rounded-2xl p-3 border w-80">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-black">
              {editingId?.startsWith("P") ? `Edit parking spot ${editingId}` : `Edit business spot ${editingId}`}
            </div>
            <div className="flex gap-2">
              <button onClick={deleteCurrent} className="text-red-600 text-xs hover:underline" >
                Delete
              </button>
              <button
                onClick={() => { setShowPanel(false); setEditingId(null); }}
                className="text-xs hover:underline text-black"
              >
                Close
              </button>
            </div>
          </div>

          {/* Parking form */}
          {editingId?.startsWith("P") && parkingForm && (
            <div className="space-y-3">
              <div className="text-xs text-gray-600">ID: {parkingForm.id}</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-black">
                  <div>Spot type</div>
                  <select
                    className="w-full border rounded px-2 py-1 text-black"
                    value={parkingForm.spotType}
                    onChange={(e) => setParkingForm({ ...parkingForm, spotType: e.target.value })}
                    onKeyDown={stopKey}
                  >
                    <option value="Rack">Rack</option>
                    <option value="Footpath">Footpath</option>
                    <option value="Carpark">Carpark</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="text-xs text-black">
                  <div>Spaces</div>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 text-black"
                    value={parkingForm.spaces as any}
                    min={0}
                    onChange={(e) => {
                      const v = e.target.value;
                      setParkingForm({ ...parkingForm, spaces: v === "" ? "" : Number(v) });
                    }}
                    onKeyDown={stopKey}
                  />
                </label>
              </div>

              <label className="text-xs block text-black">
                <div>Image URL</div>
                <input
                  type="url"
                  className="w-full border rounded px-2 py-1 text-black"
                  placeholder="https://..."
                  value={parkingForm.image || ""}
                  onChange={(e) => setParkingForm({ ...parkingForm, image: e.target.value })}
                  onKeyDown={stopKey}
                />
              </label>

              <label className="text-xs block text-black">
                <div>Things to watch</div>
                <select
                  multiple
                  className="w-full border rounded px-2 py-1 h-24 text-black"
                  value={parkingForm.watchFor || []}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
                    setParkingForm({ ...parkingForm, watchFor: values });
                  }}
                  onKeyDown={stopKey}
                >
                  {WATCH_CHOICES.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end">
                <button
                  onClick={commitForm}
                  className="rounded-xl px-3 py-2 border bg-gray-50 hover:bg-gray-100 text-sm text-black"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Business form */}
          {editingId?.startsWith("B") && businessForm && (
            <div className="space-y-3">
              <div className="text-xs text-gray-600">ID: {businessForm.id}</div>
              <label className="text-xs block text-black">
                <div>Business name</div>
                <input
                  className="w-full border rounded px-2 py-1 text-black"
                  value={businessForm.name}
                  onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })}
                  onKeyDown={stopKey}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-black">
                  <div>Website</div>
                  <input
                    type="url"
                    className="w-full border rounded px-2 py-1 text-black"
                    placeholder="https://..."
                    value={businessForm.website || ""}
                    onChange={(e) => setBusinessForm({ ...businessForm, website: e.target.value })}
                    onKeyDown={stopKey}
                  />
                </label>
                <label className="text-xs text-black">
                  <div>Phone</div>
                  <input
                    className="w-full border rounded px-2 py-1 text-black"
                    placeholder="+61 ..."
                    value={businessForm.phone || ""}
                    onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })}
                    onKeyDown={stopKey}
                  />
                </label>
              </div>

              <label className="text-xs block text-black">
                <div>Image URL</div>
                <input
                  type="url"
                  className="w-full border rounded px-2 py-1 text-black"
                  placeholder="https://..."
                  value={businessForm.image || ""}
                  onChange={(e) => setBusinessForm({ ...businessForm, image: e.target.value })}
                  onKeyDown={stopKey}
                />
              </label>

              <label className="text-xs block text-black">
                <div>Closest parking (by ID)</div>
                <select
                  className="w-full border rounded px-2 py-1 text-black"
                  value={businessForm.closestParkingId || ""}
                  onChange={(e) => setBusinessForm({ ...businessForm, closestParkingId: e.target.value })}
                  onKeyDown={stopKey}
                >
                  <option value="">(none)</option>
                  {parkingList.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end">
                <button
                  onClick={commitForm}
                  className="rounded-xl px-3 py-2 border bg-gray-50 hover:bg-gray-100 text-sm text-black"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
