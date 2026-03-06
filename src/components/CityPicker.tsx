"use client";

import React, { useEffect, useMemo, useState } from "react";

type BuiltinCity = {
  id: string;
  name: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  isCustom?: false;
};

export type CustomCity = {
  id: string;              // "custom:<lng>,<lat>"
  name: string;
  center: [number, number];
  zoom: number;
  isCustom: true;
};

export type AnyCity = BuiltinCity | CustomCity;

const CUSTOM_CITIES_KEY = "customCities.v1";
const DEFAULT_ZOOM = 12;

function loadCustomCities(): CustomCity[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CITIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveCustomCities(list: CustomCity[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_CITIES_KEY, JSON.stringify(list));
}

export type CitiesRecord = Record<string, { center: [number, number]; zoom: number }>;

function mapBuiltinCities(record: CitiesRecord): BuiltinCity[] {
  return Object.entries(record).map(([name, v]) => ({
    id: name,
    name,
    center: v.center,
    zoom: v.zoom,
    isCustom: false as const,
  }));
}

function parseLatLng(input: string): [number, number] | null {
  const s = input.replace(/\s+/g, "");
  const m = s.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a]; // lat,lng -> [lng,lat]
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return [a, b]; // lng,lat
  return null;
}

async function geocodeAddress(query: string, token: string) {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    encodeURIComponent(query) +
    `.json?access_token=${token}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const json = await res.json();
  const f = json?.features?.[0];
  if (!f) throw new Error("No result for this address.");
  const [lng, lat] = f.center as [number, number];
  const name = f.place_name as string;
  return { center: [lng, lat] as [number, number], name };
}

type CityPickerProps = {
  builtinCities: CitiesRecord;
  value: string;
  onChange: (city: AnyCity) => void;
  mapboxToken: string;
};

export default function CityPicker({
  builtinCities,
  value,
  onChange,
  mapboxToken,
}: CityPickerProps) {
  const baseList = useMemo(() => mapBuiltinCities(builtinCities), [builtinCities]);
  const [customList, setCustomList] = useState<CustomCity[]>([]);
  const allCities: AnyCity[] = useMemo(() => [...baseList, ...customList], [baseList, customList]);

  const [openCreate, setOpenCreate] = useState(false);
  const [openManage, setOpenManage] = useState(false);

  const [addr, setAddr] = useState("");
  const [latlng, setLatlng] = useState("");
  const [name, setName] = useState("");
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setCustomList(loadCustomCities()), []);
  useEffect(() => saveCustomCities(customList), [customList]);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (id === "__add_custom__") {
      setOpenCreate(true);
      return;
    }
    if (id === "__manage_custom__") {
      setOpenManage(true);
      return;
    }
    const c = allCities.find((x) => x.id === id);
    if (c) onChange(c);
  }

  async function handleCreate() {
    setErr(null);
    setBusy(true);
    try {
      let center: [number, number] | null = null;
      let label = name?.trim();

      if (latlng.trim()) {
        const parsed = parseLatLng(latlng.trim());
        if (!parsed) throw new Error("error! example：-35.28, 149.13 or 149.13, -35.28");
        center = parsed;
        if (!label) label = `${parsed[1].toFixed(4)}, ${parsed[0].toFixed(4)}`;
      } else if (addr.trim()) {
        const g = await geocodeAddress(addr.trim(), mapboxToken);
        center = g.center;
        if (!label) label = g.name;
      } else {
        throw new Error("At least filled in address or LatLng");
      }

      const id = `custom:${center[0].toFixed(6)},${center[1].toFixed(6)}`;
      const newCity: CustomCity = { id, name: label!, center, zoom: zoom || DEFAULT_ZOOM, isCustom: true };
      const next = dedupeCustom([...customList, newCity]);
      setCustomList(next);
      onChange(newCity);
      // reset
      setOpenCreate(false);
      setAddr(""); setLatlng(""); setName(""); setZoom(DEFAULT_ZOOM);
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  function dedupeCustom(list: CustomCity[]) {
    const map = new Map<string, CustomCity>();
    for (const c of list) map.set(c.id, c);
    return Array.from(map.values());
  }

  function deleteOne(id: string) {
    const next = customList.filter((c) => c.id !== id);
    setCustomList(next);
    if (value === id) {
      const fallback = baseList[2]; // 0 = Bris, 1 = Mel, 2 = Canberra
      if (fallback) onChange(fallback);
    }
  }

  function clearAll() {
    setCustomList([]);

    if (value.startsWith("custom:")) {
      const fallback = baseList[2]; // 0 = Bris, 1 = Mel, 2 = Canberra
      if (fallback) onChange(fallback);
    }
  }

  const selectedId =
    allCities.some((c) => c.id === value) ? value : baseList[0]?.id;

  return (
    <>
      <select
        className="border rounded px-3 py-2 bg-white text-black hover:bg-gray-100 cursor-pointer"
        value={selectedId}
        onChange={handleSelect}
      >
        {baseList.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}

        {customList.length > 0 && (
          <optgroup label="Custom">
            {customList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}

        <option value="__add_custom__"> Add city…</option>
        <option value="__manage_custom__">Manage cities</option>
      </select>

      {/* 创建自定义城市 */}
      {openCreate && (
        <Modal onClose={() => setOpenCreate(false)}>
          <div className="text-lg font-semibold text-black">Add city</div>

          <Field label="Address (Optional)"> 
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="e.g. ANU, Canberra"
              className="w-full border rounded px-3 py-2 text-black"
            />
          </Field>

          <Field label="Lat, Lng or Lng, Lat（Optional）">
            <input
              value={latlng}
              onChange={(e) => setLatlng(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full border rounded px-3 py-2 text-black"
            />
          </Field>

          <Field label=" Display name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full border rounded px-3 py-2"
            />
          </Field>

          <Field label="Zoom（default 12）">
            <input
              type="number"
              min={1}
              max={22}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full border rounded px-3 py-2 text-black"
            />
          </Field>

          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setOpenCreate(false)} className="px-3 py-2 rounded border text-black">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="px-3 py-2 rounded bg-black text-white"
              disabled={busy}
            >
              {busy ? "Creating..." : "Create"}
            </button>
          </div>
        </Modal>
      )}

      {/* 管理自定义城市 */}
      {openManage && (
        <Modal onClose={() => setOpenManage(false)}>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-black">Manage cities</div>
            {customList.length > 0 && (
              <button
                className="text-sm px-2 py-1 rounded border text-black"
                onClick={() => {
                  if (confirm("Delete all？")) clearAll();
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {customList.length === 0 ? (
            <div className="text-sm text-gray-500 py-4"> No Cities</div>
          ) : (
            <ul className="divide-y border rounded text-black">
              {customList.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {c.center[1].toFixed(6)}, {c.center[0].toFixed(6)} · zoom {c.zoom}
                    </div>
                  </div>
                  <button
                    className="ml-3 px-2 py-1 rounded bg-red-600 text-white text-sm"
                    onClick={() => {
                      if (confirm(`Delete Custom city?${c.name}」？`)) deleteOne(c.id);
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end pt-3">
            <button onClick={() => setOpenManage(false)} className="px-3 py-2 rounded border text-black">
              Close
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** 弹窗容器 */
function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        {children}
      </div>
    </div>
  );
}

/** 表单字段包装 */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-black">{label}</label>
      {children}
    </div>
  );
}
