interface Geometry {
  type: string;
  coordinates?: unknown;
  geometries?: Geometry[];
}
interface Feature {
  type: string;
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry: Geometry | null;
}
interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

// Transform a private copy, retaining vertices, ring order and all attributes.
export function prepareGeoJson(data: unknown, namespace: string, ignoreAltitude = false, uniqueFeatureIds = false): FeatureCollection {
  const copy = structuredClone(data) as FeatureCollection;
  if (copy?.type !== "FeatureCollection" || !Array.isArray(copy.features)) throw new Error("Expected a GeoJSON FeatureCollection.");
  function coordinates(value: unknown): unknown {
    if (!Array.isArray(value)) return value;
    return typeof value[0] === "number" ? value.slice(0, 2) : value.map(coordinates);
  }
  function flatten(geometry: Geometry | null) {
    if (!geometry) return;
    if (geometry.coordinates) geometry.coordinates = coordinates(geometry.coordinates);
    geometry.geometries?.forEach(flatten);
  }
  copy.features.forEach((feature, index) => {
    if (uniqueFeatureIds) {
      // Keep the source identifier as an attribute before replacing it. An
      // existing source_id attribute is data and is never overwritten.
      if (feature.id !== undefined && feature.id !== null) {
        feature.properties = { ...(feature.properties ?? {}) };
        if (!("source_id" in feature.properties)) feature.properties.source_id = feature.id;
      }
      feature.id = `${namespace}:${index}`;
    }
    if (ignoreAltitude) flatten(feature.geometry);
  });
  return copy;
}
