import { Cartesian3, Cartographic, ClippingPolygon, ClippingPolygonCollection, Math as CesiumMath, Rectangle, type BoundingSphere, type Ellipsoid, type Cesium3DTileset } from "cesium";
import * as Cesium from "cesium";
import type { ModelClippingConfig } from "../projects/types";

export function geographicVertex(position: Cartesian3): [number, number] {
  const point = Cartographic.fromCartesian(position);
  return [CesiumMath.toDegrees(point.longitude), CesiumMath.toDegrees(point.latitude)];
}

export function validateClipping(config: ModelClippingConfig): void {
  const points = config.positions;
  if (typeof config.inverse !== "boolean" || points.length < 3
    || points.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)) {
    throw new Error("O recorte exige pelo menos 3 coordenadas geográficas válidas.");
  }
  // Local geographic polygons must be simple and have area. Reject crossed edges
  // instead of letting a malformed authoring polygon reach the renderer.
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a: number[], b: number[], p: number[]) => Math.abs(cross(a, b, p)) < 1e-14
    && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
    && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
  let area = 0;
  const origin = points[0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a[0] === b[0] && a[1] === b[1]) throw new Error("Remova os pontos repetidos do recorte.");
    area += (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1]);
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
        || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) {
        throw new Error("As bordas do recorte não podem se cruzar.");
      }
    }
  }
  if (Math.abs(area) < 1e-14) throw new Error("Os pontos do recorte devem formar uma área.");
}

export function createModelClipping(config: ModelClippingConfig): ClippingPolygonCollection {
  validateClipping(config);
  return new ClippingPolygonCollection({
    enabled: config.enabled ?? true,
    inverse: config.inverse,
    polygons: [new ClippingPolygon({ positions: config.positions.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat)) })],
  });
}

export function applyModelClipping(tileset: Cesium3DTileset, config: ModelClippingConfig): ClippingPolygonCollection {
  const collection = createModelClipping(config);
  guardClippingRectangles(tileset);
  tileset.clippingPolygons = collection;
  return collection;
}

interface TileVolume {
  rectangle?: Rectangle;
  boundingSphere?: BoundingSphere;
}
interface TileModel {
  getRectangle(ellipsoid?: Ellipsoid): Rectangle;
}
interface TileContent {
  _model?: TileModel;
  innerContents?: TileContent[];
}
interface ClippingTile {
  content?: TileContent;
  contentBoundingVolume?: TileVolume;
  boundingVolume?: TileVolume;
}
interface ClippingTilesetInternals {
  _processingQueue?: ClippingTile[];
  _selectedTiles?: ClippingTile[];
  prePassesUpdate?: (...args: unknown[]) => void;
}
const guardedTilesets = new WeakSet<Cesium3DTileset>();

function validRectangle(rectangle: Rectangle | undefined): rectangle is Rectangle {
  return Boolean(rectangle && [rectangle.west, rectangle.south, rectangle.east, rectangle.north].every(Number.isFinite)
    && rectangle.width > 0 && rectangle.north > rectangle.south);
}

function tileRectangle(tile: ClippingTile, ellipsoid?: Ellipsoid): Rectangle | undefined {
  for (const volume of [tile.contentBoundingVolume, tile.boundingVolume]) {
    if (!volume) continue;
    if (validRectangle(volume.rectangle)) return Rectangle.clone(volume.rectangle);
    const sphere = volume.boundingSphere;
    if (!sphere || ![sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius].every(Number.isFinite) || sphere.radius <= 0) continue;
    const rectangle = Rectangle.fromBoundingSphere(sphere, ellipsoid);
    if (validRectangle(rectangle)) return rectangle;
  }
  return undefined;
}

// Cesium 1.146 Model.getRectangle projects the glTF model's bounding sphere.
// A non-finite sphere can reach that path while tile content initializes/rebakes,
// crashing polygon clipping even though the tile's native bounding volume is valid.
// Adapt instances of this clipped tileset only, never Cesium/global prototypes.
// These private access points are version-scoped and must be reviewed on upgrade.
function guardClippingRectangles(tileset: Cesium3DTileset): void {
  // VERSION is exported at runtime but omitted from Cesium 1.146's declarations.
  const version = (Cesium as unknown as { VERSION: string }).VERSION;
  if (version !== "1.146" && version !== "1.146.0") return;
  if (guardedTilesets.has(tileset)) return;
  const internal = tileset as unknown as ClippingTilesetInternals;
  const originalUpdate = internal.prePassesUpdate;
  if (!originalUpdate) return;
  guardedTilesets.add(tileset);
  const models = new WeakSet<TileModel>();
  let reported = false;
  function guardContent(content: TileContent | undefined, tile: ClippingTile) {
    if (!content) return;
    const model = content._model;
    if (model && typeof model.getRectangle === "function" && !models.has(model)) {
      models.add(model);
      const originalRectangle = model.getRectangle;
      model.getRectangle = function (ellipsoid) {
        try {
          return originalRectangle.call(this, ellipsoid);
        } catch (error) {
          // Do not suppress readiness errors, bad configuration or other failures.
          if (!(error instanceof Error) || error.name !== "DeveloperError" || error.message !== "cartesian has a NaN component") throw error;
          const fallback = tileRectangle(tile, ellipsoid);
          if (!fallback) throw error;
          if (!reported) {
            reported = true;
            console.warn("Cesium 1.146: recorte 3D usando o volume nativo do tile após esfera inválida do modelo.");
          }
          return fallback;
        }
      };
    }
    content.innerContents?.forEach((inner) => guardContent(inner, tile));
  }
  function guardTile(tile: ClippingTile) { guardContent(tile.content, tile); }
  // Guard before processing: tileLoad is too late for a model's first ready update.
  internal.prePassesUpdate = function (...args) {
    internal._processingQueue?.forEach(guardTile);
    internal._selectedTiles?.forEach(guardTile);
    originalUpdate.apply(this, args);
  };
  // Also cover already loaded content when clipping is added interactively.
  tileset.tileVisible.addEventListener(guardTile);
}

export function exportModelClipping(config: ModelClippingConfig): string {
  validateClipping(config);
  return `{\n  inverse: ${config.inverse},\n  positions: [\n${config.positions.map(([lon, lat]) => `    [${lon.toFixed(7)}, ${lat.toFixed(7)}]`).join(",\n")}\n  ]\n}`;
}
