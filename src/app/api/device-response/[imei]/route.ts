//for testing 

import { NextResponse } from "next/server";
import { parseDeviceResponse } from "@/lib/nmea";

type DeviceCache = {
  fails: number;
  last?: {
    lat: number;
    lng: number;
    raw: string;
    updatedAt: number;
  };
};
const cache: Record<string, DeviceCache> = {};
const FAIL_THRESHOLD = 10;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ imei: string }> }
) {
  try {
    const { imei } = await ctx.params;
    const base = process.env.UPSTREAM_BASE;
    if (!base) {
      return NextResponse.json({ error: "Missing UPSTREAM_BASE" }, { status: 500 });
    }

    const url = `${base}/api/devices/positioning-d0/${imei}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error(`Upstream ${res.status}`);

      const data = await res.json();
      const deviceResponse: string | undefined = data?.device_response;
      if (typeof deviceResponse !== "string") {
        throw new Error("No valid device_response");
      }

    
      let lat: number, lng: number;
      try {
        const coords = parseDeviceResponse(deviceResponse);
        lat = coords.lat;
        lng = coords.lng;
      } catch (parseErr: any) {
        throw new Error("Parse error: " + parseErr?.message);
      }

      // Fail counter reset
      cache[imei] = {
        fails: 0,
        last: { lat, lng, raw: deviceResponse, updatedAt: Date.now() },
      };

      return NextResponse.json({
        imei,
        lat,
        lng,
        raw: deviceResponse,
        online: true,
        stale: false,
        fails: 0,
        updatedAt: new Date(cache[imei].last!.updatedAt).toISOString(),
      });
    } catch (err: any) {
      // request failed
      const prev = cache[imei] ?? { fails: 0 };
      const fails = prev.fails + 1;
      cache[imei] = { ...prev, fails };

      const isOffline = fails >= FAIL_THRESHOLD; // offline counter

      // 如果有上一次成功位置 → 返回旧位置
      if (prev.last) {
        return NextResponse.json({
          imei,
          lat: prev.last.lat,
          lng: prev.last.lng,
          raw: prev.last.raw,
          online: !isOffline, // 
          stale: true,
          fails,
          updatedAt: new Date(prev.last.updatedAt).toISOString(),
          error: err?.message ?? "Upstream/parse failed",
        });
      }

      // 如果从没成功过  只能返回状态
      return NextResponse.json({
        imei,
        online: !isOffline,
        stale: false,
        fails,
        error: err?.message ?? "No data",
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
