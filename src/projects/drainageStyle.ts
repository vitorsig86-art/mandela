import type { LayerSource, ProjectLayerConfig } from "./types";

type GeoJsonStyle = NonNullable<Extract<LayerSource, { format: "geojson" }>["style"]>;

// Validated Strahler hierarchy. Widths are screen pixels, not terrain meters.
// Unmatched values (including orders > 5) retain the reference's base stroke.
const simulatedDrainageStyle: GeoJsonStyle = {
  stroke: "#2457B2", strokeWidth: 1.2, fill: "#00000000", clampToGround: true, zIndex: 20,
  classification: { property: "STRAHLER", classes: {
    "1": { stroke: "#15DEEF", strokeWidth: 1.2, zIndex: 20 },
    "2": { stroke: "#08B5ED", strokeWidth: 1.8, zIndex: 21 },
    "3": { stroke: "#0087EB", strokeWidth: 2.6, zIndex: 22 },
    "4": { stroke: "#0062E8", strokeWidth: 3.8, zIndex: 23 },
    "5": { stroke: "#003DE0", strokeWidth: 5.2, zIndex: 24 },
  } },
};

// Resolve configuration before the existing loader; never infer from geometry,
// layer names or the mere presence of STRAHLER in an unrelated dataset.
export function resolveDrainageStyle(layer: ProjectLayerConfig): ProjectLayerConfig {
  if (layer.kind !== "drainage" || layer.source.format !== "geojson"
    || layer.source.symbology !== "simulated-drainage-strahler") return layer;
  return {
    ...layer,
    source: {
      ...layer.source,
      // Explicit project style wins. A supplied classification replaces the
      // entire default classification, allowing a different thematic scheme.
      style: { ...simulatedDrainageStyle, ...layer.source.style },
    },
  };
}
