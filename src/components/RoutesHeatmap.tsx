"use client";

import { useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Props = {
  map?: mapboxgl.Map | null;
  file: string;
  sourceId?: string;
  layerId?: string;
};

export default function RoutesHeatmap({
  map,
  file,
  sourceId = "routes-heat-src",
  layerId = "routes-heat-layer",
}: Props) {
  useEffect(() => {
    // capture a stable reference for this effect run
    const mapRef = map;
    if (!mapRef) return;

    const url = file.startsWith("/") ? file : `/heatmap/${file}`;
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: true,
      offset: 12,
    });

    const addLayer = async () => {
      if (!mapRef.isStyleLoaded()) return;

      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();

      // safety remove existing
      try {
        if (mapRef.getLayer(layerId)) mapRef.removeLayer(layerId);
      } catch {}
      try {
        if (mapRef.getSource(sourceId)) mapRef.removeSource(sourceId);
      } catch {}

      mapRef.addSource(sourceId, { type: "geojson", data } as any);

      const VALUE: any = [
        "coalesce",
        ["to-number", ["get", "count"]],
        ["*", ["to-number", ["get", "percentage"]], 5500],
        0,
      ];

      mapRef.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            VALUE,
            1,    "#fee5d9",
            300,  "#fcbba1",
            600,  "#fc9272",
            1200, "#fb6a4a",
            2500, "#de2d26",
            5500, "#a50f15"
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            VALUE,
            1,    1.2,
            300,  1.8,
            600,  2.4,
            1200, 3.6,
            2500, 5,
            5500, 7,
          ],
          "line-opacity": 0.9,
        },
      });

      
      //popup
      const onEnter = () => {
        mapRef.getCanvas().style.cursor = "pointer";
      };
      const onLeave = () => {
        mapRef.getCanvas().style.cursor = "";
      };

      const onClick = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
        const f = (e as any).features && (e as any).features[0];
        if (!f) return;

        const props: any = f.properties || {};
        const n = Number(props.count);
        const countText = Number.isFinite(n)
          ? String(n)
          : props.displayCount || "N/A";
        const p =
          typeof props.percentage === "number"
            ? props.percentage
            : Number(props.percentage);
        const pctText = Number.isFinite(p)
          ? `${(p * 1).toFixed(1)}%`
          : "—";

        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="text-black">
              <div><strong>${countText}</strong> trips passed through this segment.</div>
              <div>About <strong>${pctText}</strong> of trips in this time period.</div>
            </div>
          `)
          .addTo(mapRef);
      };

      mapRef.on("mouseenter", layerId, onEnter);
      mapRef.on("mouseleave", layerId, onLeave);
      mapRef.on("click", layerId, onClick);

      // return proper cleanup function
      return () => {
        try {
          mapRef.off("mouseenter", layerId, onEnter);
          mapRef.off("mouseleave", layerId, onLeave);
          mapRef.off("click", layerId, onClick);
        } catch {}
        popup.remove();
      };
    };

    let cleanup: (() => void) | undefined;
    let cancelled = false;
    let timeoutId: number | undefined;

    const tryAdd = async () => {
      if (!mapRef || cancelled) return;

      if (!mapRef.isStyleLoaded()) {
        timeoutId = window.setTimeout(tryAdd, 300);
        return;
      }

      const fn = await addLayer();
      if (!cancelled && typeof fn === "function") {
        cleanup = fn;
      }
    };

    void tryAdd();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);

      if (typeof cleanup === "function") {
        try {
          cleanup();
        } catch {}
      }

      // final defensive cleanup; fully wrapped
      try {
        if (mapRef && mapRef.getLayer(layerId)) mapRef.removeLayer(layerId);
      } catch {}
      try {
        if (mapRef && mapRef.getSource(sourceId)) mapRef.removeSource(sourceId);
      } catch {}
    };
  }, [map, file, sourceId, layerId]);

  return null;
}
