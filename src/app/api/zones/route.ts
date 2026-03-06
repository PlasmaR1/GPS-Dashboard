
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import type { Feature, FeatureCollection, Polygon } from "geojson";

type Zone = {
  id: string;
  feature: Feature<Polygon, { title?: string; serverId?: string; [k: string]: any }>;
};

const store: Record<string, Zone> = {}; // 内存存储（重启会丢）Zone Stroage, missing if restart

export async function GET() {
  const features = Object.values(store).map((z) => z.feature);
  const fc: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features,
  };
  return NextResponse.json(fc);
}

export async function POST(req: Request) {
  try {
    const feature = (await req.json()) as Feature<Polygon, any>;
    if (feature?.geometry?.type !== "Polygon") {
      return NextResponse.json({ error: "Only Polygon accepted" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    feature.properties = { ...(feature.properties || {}), serverId: id };
    store[id] = { id, feature };
    return NextResponse.json({ id, feature });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Invalid JSON" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id as string;
    const feature = body?.feature as Feature<Polygon, any>;
    if (!id || !store[id]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (feature?.geometry?.type !== "Polygon") {
      return NextResponse.json({ error: "Only Polygon accepted" }, { status: 400 });
    }
    feature.properties = { ...(feature.properties || {}), serverId: id };
    store[id] = { id, feature };
    return NextResponse.json({ id, feature });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Invalid JSON" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id as string;
    if (!id || !store[id]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    delete store[id];
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Invalid JSON" }, { status: 400 });
  }
}
