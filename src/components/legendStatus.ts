import type { LayerKind, ProjectLayerConfig } from "../projects/types";

// Thematic rasters whose colors only make sense with a scale. A layer with neither
// legend nor legendMode is an incomplete configuration. While developing
// (npm run dev) the interface says so; a production build never shows it.
// legendMode "embedded" (scale drawn into the raster) and "none" show nothing.
const thematicKinds = new Set<LayerKind>(["dtm", "dsm", "slope", "solar-orientation", "aspect", "ndvi", "multispectral"]);

export function legendMissing(layer: ProjectLayerConfig, dev: boolean = import.meta.env.DEV) {
  return dev && !layer.legend && !layer.legendMode && thematicKinds.has(layer.kind);
}

// Empty in production builds, so the text is not even shipped.
export const legendMissingText = import.meta.env.DEV ? "Legenda não fornecida para esta camada" : "";
