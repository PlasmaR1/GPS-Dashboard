"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

type Bike = {
  id: string;
  name?: string;
  location?: { lng: number; lat: number };
  address?: string;
  updatedAt?: string;
};

type Extra = {
  address?: string;
  lastGeocode?: { lat: number; lng: number; ts: number };
};

function normalizeBike(raw: any): Bike | null {
  if (!raw) return null;
  const id = String(raw.id ?? raw.bikeId ?? raw._id ?? "");
  if (!id) return null;

  let lng: number | undefined;
  let lat: number | undefined;
  if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 2) {
    lng = Number(raw.coordinates[0]);
    lat = Number(raw.coordinates[1]);
  } else if (raw.location && typeof raw.location === "object") {
    lng = Number(raw.location.lng ?? raw.location.lon);
    lat = Number(raw.location.lat);
  } else if (raw.lng !== undefined && raw.lat !== undefined) {
    lng = Number(raw.lng);
    lat = Number(raw.lat);
  }

  const location =
    typeof lng === "number" && typeof lat === "number" ? { lng, lat } : undefined;

  return {
    id,
    name: raw.name ?? raw.title ?? "—",
    location,
    address: raw.address ?? undefined,
    updatedAt: raw.updatedAt ?? raw.timestamp ?? raw.time ?? "",
  };
}

export default function BikesTable() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [q, setQ] = useState("");
  const [bikeExtra, setBikeExtra] = useState<Record<string, Extra>>({});

  // ====== 环境里的 Mapbox Token（优先 env，其次复用全局 accessToken）======
  const MAPBOX_TOKEN =
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    (typeof window !== "undefined" ? (mapboxgl as any).accessToken : undefined);

  // 去重 & 安全更新
  const pending = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current.clear();
    };
  }, []);


  async function reverseGeocode(id: string, lng: number, lat: number, nowTs: number) {
    if (!MAPBOX_TOKEN) return; 
    if (pending.current.has(id)) return;
    pending.current.add(id);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1&language=en`;
      const r = await fetch(url);
      const j = await r.json();
      const place = j?.features?.[0]?.place_name as string | undefined;
      if (!mounted.current) return;
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
      pending.current.delete(id);
    }
  }

  // 拉数据
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/bikes", { cache: "no-store" });
        const data = await res.json();
        const arr = (Array.isArray(data) ? data : [])
          .map(normalizeBike)
          .filter(Boolean) as Bike[];
        setBikes(arr);

        // 对“有坐标但无地址（后端和本地都没有）”的车触发逆地理
        const now = Date.now();
        for (const b of arr) {
          if (!b.location) continue;
          const currentAddr = b.address || bikeExtra[b.id]?.address;
          if (!currentAddr) {
            reverseGeocode(b.id, b.location.lng, b.location.lat, now);
          }
        }
      } catch (e) {
        console.error("Failed to load bikes:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // 搜索
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return bikes;
    return bikes.filter((b) => {
      const addr = b.address ?? bikeExtra[b.id]?.address ?? "";
      return (
        b.id.toLowerCase().includes(s) ||
        (b.name ?? "").toLowerCase().includes(s) ||
        addr.toLowerCase().includes(s)
      );
    });
  }, [q, bikes, bikeExtra]);

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">All Bikes</h1>
        <div className="text-sm text-gray-500">
          Showing {filtered.length} / {bikes.length}
        </div>
      </header>

      <div className="flex items-center justify-between">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by ID / name / address..."
          className="w-80 border rounded-lg px-3 py-2 outline-none focus:ring"
        />
      </div>

      <div className="rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black-50">
            <tr>
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Location (lng, lat)</th>
              <th className="text-left px-4 py-2">Address</th>
              <th className="text-left px-4 py-2">Last Update</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const loc = b.location;
              const addr = b.address ?? bikeExtra[b.id]?.address;
              return (
                <tr key={b.id} className="border-t hover:bg-gray-50 transition">
                  <td className="px-4 py-2 font-mono">#{b.id}</td>
                  <td className="px-4 py-2">{b.name}</td>
                  <td className="px-4 py-2">
                    {loc ? `${loc.lng.toFixed(6)}, ${loc.lat.toFixed(6)}` : "—"}
                  </td>
                  <td className="px-4 py-2 max-w-[420px]">
                    <div className="truncate" title={addr || ""}>
                      {addr ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {b.updatedAt ? new Date(b.updatedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={
                        loc
                          ? `/gps?lng=${loc.lng}&lat=${loc.lat}&id=${encodeURIComponent(b.id)}`
                          : `/gps?id=${encodeURIComponent(b.id)}`
                      }
                      className={`text-blue-600 hover:underline ${
                        !loc ? "pointer-events-none text-gray-400" : ""
                      }`}
                      title={loc ? "Open GPS and fly to this bike" : "No coordinates"}
                    >
                      📍 Locate
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No bikes found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
