// src/app/api/bikes/route.ts
import { NextResponse } from "next/server";
import { parseDeviceResponse } from "@/lib/nmea";


// MOCK
// 开关：.env.local -> MOCK_BIKES=true 使用模拟
const USE_MOCK = process.env.MOCK_BIKES === "true";

// 三个城市中心，给不同 mock 车分配不同中心点，便于区分
const CENTERS = [
  { name: "Canberra", lng: 149.1287, lat: -35.2820 },
  { name: "Brisbane", lng: 153.0251, lat: -27.4698 },
  { name: "Melbourne", lng: 144.9631, lat: -37.8136 },
];
//bike active radis
function mockBikePositions(ids: string[], names: string[] = []) {
  const now = Date.now() / 1000;
  const r = 0.01; // ~1km 级别
  // 如果没有传 ids，则给一个默认
  if (ids.length === 0) {
    const lat = CENTERS[0].lat + r * Math.sin(now / 20);
    const lng = CENTERS[0].lng + r * Math.cos(now / 20);
    return [
      { id: "860537061172086", name: "Sim Bike", lat, lng, raw: "*MOCK*" },
    ];
  }

  // 为每个 id 生成一辆车，名字按 BIKE_DEVICE_NAMES 对应
  return ids.map((id, i) => {
    const center = CENTERS[i % CENTERS.length];
    const phase = i * 7; 
    const lat = center.lat + r * Math.sin((now + phase) / 20);
    const lng = center.lng + r * Math.cos((now + phase) / 20);
    return {
      id,
      name: names[i] || id, // If no name , use IMEI
      lat,
      lng,
      raw: "*MOCK*",
    };
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const forceMock = url.searchParams.get("useMock") === "1";

    // 解析环境中的设备 & 名称列表
    const ids =
      process.env.BIKE_DEVICE_IDS?.split(",").map((s) => s.trim()).filter(Boolean) || [];
    const names =
      process.env.BIKE_DEVICE_NAMES?.split(",").map((s) => s.trim()) || [];

    // MOCK bike
    if (USE_MOCK || forceMock) {
      return NextResponse.json(mockBikePositions(ids, names));
    }

    // Real bike
    const base = process.env.UPSTREAM_BASE;
    if (!base || ids.length === 0) {
      
      return NextResponse.json([]);
    }

    const results = await Promise.all(
      ids.map(async (imei, idx) => {
        try {
          const upstream = `${base}/device?id=${imei}`;
          const resp = await fetch(upstream, { cache: "no-store" });
          if (!resp.ok) return null;

          const raw = await resp.text();
          const { lat, lng } = parseDeviceResponse(raw);
          if (typeof lat !== "number" || typeof lng !== "number") return null;

          return {
            id: imei,
            name: names[idx] || imei,
            lat,
            lng,
            raw,
          };
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json(results.filter(Boolean));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
