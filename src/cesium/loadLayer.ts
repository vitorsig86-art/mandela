import { createWorldImageryAsync, IonWorldImageryStyle, Cartesian3, Cesium3DTileset, Color, ColorMaterialProperty, ConstantProperty, GeoJsonDataSource, ImageryLayer, JulianDate, Math as CesiumMath, PolylineGraphics, Rectangle, UrlTemplateImageryProvider, Viewer, WebMercatorTilingScheme, type Entity, type PolygonHierarchy, type TerrainProvider } from "cesium";
import type { ProjectLayerConfig } from "../projects/types";
import { registerVectorPopup } from "./vectorPopup";
import { IonResource } from "cesium";
import { applyModelClipping } from "./modelClipping";
import { createModelHeightAdjustment } from "./modelHeight";
import { NeverTileDiscardPolicy } from "cesium";
import { Resource } from "cesium";
import { prepareGeoJson } from "./prepareGeoJson";

export type LoadedLayer = ImageryLayer | GeoJsonDataSource | Cesium3DTileset;

const fallbackLayers = new WeakSet<ImageryLayer>();
const boundaryHelpers = new WeakMap<GeoJsonDataSource, Entity[]>();

export function setVectorVisibility(dataSource: GeoJsonDataSource, visible: boolean): void {
  dataSource.show = visible;
  for (const helper of boundaryHelpers.get(dataSource) ?? []) {
    if (visible && !dataSource.entities.contains(helper)) dataSource.entities.add(helper);
    else if (!visible) dataSource.entities.remove(helper);
  }
}

const originalColors = new WeakMap<ColorMaterialProperty, Color>();

export function setVectorOpacity(dataSource: GeoJsonDataSource, opacity: number): void {
  for (const entity of new Set([...dataSource.entities.values, ...(boundaryHelpers.get(dataSource) ?? [])])) {
    for (const material of [entity.polygon?.material, entity.polyline?.material]) {
      if (!(material instanceof ColorMaterialProperty)) continue;
      let original = originalColors.get(material);
      if (!original) {
        original = Color.clone(material.color?.getValue(JulianDate.now()) ?? Color.WHITE);
        originalColors.set(material, original);
      }
      material.color = new ConstantProperty(original.withAlpha(original.alpha * opacity));
    }
  }
}

export function assertImageryLayerReady(layer: ImageryLayer): void {
  const provider = layer.imageryProvider;
  if (layer.isDestroyed() || !layer.ready || !provider || !provider.tilingScheme) {
    throw new Error("Cannot attach or show an uninitialized imagery layer.");
  }
  for (const rectangle of [provider.rectangle, layer.rectangle]) {
    if (!rectangle || ![rectangle.west, rectangle.south, rectangle.east, rectangle.north].every(Number.isFinite)
      || rectangle.south >= rectangle.north || rectangle.width <= 0) {
      throw new Error("Cannot attach or show imagery without a valid rectangle.");
    }
  }
}

function guardRasterTileIntersections(layer: ImageryLayer): void {
  // Cesium 1.146's skeleton builder treats a roundoff-sized edge overlap as
  // real imagery. Its subsequent clipping can return undefined, which is then
  // passed to rectangleToNativeRectangle. Guard only this layer's tile seam;
  // do not change dataset bounds or patch Cesium's global prototype.
  type SkeletonLayer = ImageryLayer & {
    _createTileImagerySkeletons(tile: { rectangle: Rectangle }, terrainProvider: TerrainProvider | undefined, insertionPoint?: number): boolean;
  };
  const guarded = layer as SkeletonLayer;
  const createSkeletons = guarded._createTileImagerySkeletons;
  guarded._createTileImagerySkeletons = function (tile, terrainProvider, insertionPoint) {
    if (this.ready && !this.isBaseLayer()) {
      const imageryBounds = Rectangle.intersection(this.imageryProvider.rectangle, this.rectangle);
      const overlap = imageryBounds && Rectangle.intersection(tile.rectangle, imageryBounds);
      // EPSILON14 radians is less than 0.1 micrometer on Earth. This rejects
      // numerical edge contact, not visible raster coverage.
      if (!overlap || overlap.width <= CesiumMath.EPSILON14 || overlap.height <= CesiumMath.EPSILON14) return false;
    }
    return createSkeletons.call(this, tile, terrainProvider, insertionPoint);
  };
}

export function isBasemapFallback(layer: LoadedLayer): boolean {
  return layer instanceof ImageryLayer && fallbackLayers.has(layer);
}

export function createBasemapFallback(layer: ProjectLayerConfig): ImageryLayer {
  if (layer.source.format !== "ion-world-imagery") throw new Error("Fallback requires a world imagery source.");
  const fallback = new ImageryLayer(new UrlTemplateImageryProvider({
    ...layer.source.fallback,
    tilingScheme: new WebMercatorTilingScheme(),
  }));
  fallbackLayers.add(fallback);
  return fallback;
}

export async function loadLayer(layer: ProjectLayerConfig): Promise<LoadedLayer> {
  switch (layer.source.format) {
    case "3d-tiles": {
      let tileset: Cesium3DTileset;
      if (layer.source.source === "ion") {
        const tokenEnv = layer.source.tokenEnv ?? "VITE_CESIUM_3D_TOKEN";
        const accessToken = import.meta.env[tokenEnv]?.trim();
        if (!Number.isInteger(layer.source.assetId) || layer.source.assetId <= 0) throw new Error("Configure a valid positive ion assetId.");
        if (!accessToken) throw new Error(`Configure ${tokenEnv} locally to load this ion asset.`);
        // Cesium 1.146 fromIonAssetId does not forward a dedicated accessToken.
        const resource = await IonResource.fromAssetId(layer.source.assetId, { accessToken });
        tileset = await Cesium3DTileset.fromUrl(resource);
      } else {
        // Cesium resolves nested content against the original URL.
        tileset = await Cesium3DTileset.fromUrl(layer.source.url);
      }
      try {
        if (layer.source.heightOffsetMeters !== undefined) {
          if (!Number.isFinite(layer.source.heightOffsetMeters)) throw new Error("Invalid model height offset.");
          createModelHeightAdjustment(tileset).set(layer.source.heightOffsetMeters);
        }
        if (layer.source.clipping && layer.source.clipping.enabled !== false) applyModelClipping(tileset, layer.source.clipping);
        return tileset;
      } catch (error) {
        tileset.destroy();
        throw error;
      }
    }
    case "ion-world-imagery": {
      try {
        // Uses Ion.defaultAccessToken, set from VITE_CESIUM_ION_TOKEN by createViewer.
        const provider = await createWorldImageryAsync({ style: IonWorldImageryStyle.AERIAL_WITH_LABELS });
        return new ImageryLayer(provider);
      } catch {
        // Never log credential-bearing provider errors or metadata URLs.
        console.warn("Bing Aerial unavailable · OpenStreetMap fallback");
        return createBasemapFallback(layer);
      }
    }
    case "xyz":
    case "tms": {
      const source = layer.source;
      const minimumLevel = source.minimumLevel ?? 0;
      const maximumLevel = source.maximumLevel ?? 18;
      const tileWidth = source.tileWidth ?? 256;
      const tileHeight = source.tileHeight ?? 256;
      if (!source.url || !Number.isInteger(minimumLevel) || minimumLevel < 0
        || !Number.isInteger(maximumLevel) || maximumLevel < minimumLevel
        || !Number.isInteger(tileWidth) || tileWidth <= 0 || !Number.isInteger(tileHeight) || tileHeight <= 0) {
        throw new Error(`Invalid raster configuration for ${layer.id}.`);
      }
      const bounds = source.bounds;
      if (bounds && (bounds.length !== 4 || !bounds.every(Number.isFinite)
        || bounds[0] < -180 || bounds[0] > 180 || bounds[2] < -180 || bounds[2] > 180
        || bounds[1] < -90 || bounds[3] > 90 || bounds[1] >= bounds[3] || bounds[0] === bounds[2])) {
        throw new Error(`Invalid raster bounds for ${layer.id}.`);
      }
      const tilingScheme = new WebMercatorTilingScheme();
      const rectangle = bounds ? Rectangle.fromDegrees(...bounds) : tilingScheme.rectangle;
      if (!Rectangle.intersection(rectangle, tilingScheme.rectangle)) {
        throw new Error(`Raster bounds for ${layer.id} do not intersect Web Mercator.`);
      }
      // UrlTemplateImageryProvider is synchronous: its rectangle and tiling
      // scheme exist before ImageryLayer is constructed. No provider promise
      // or placeholder layer enters the collection.
      const provider = new UrlTemplateImageryProvider({
        url: layer.source.url,
        credit: layer.source.credit,
        tilingScheme,
        minimumLevel,
        maximumLevel,
        rectangle,
        tileWidth,
        tileHeight,
        // A discard policy makes Cesium fetch a blob, preserving HTTP status
        // even when ImageBitmap is unavailable. Valid images are never discarded.
        tileDiscardPolicy: new NeverTileDiscardPolicy(),
      });
      const imageryLayer = new ImageryLayer(provider, { rectangle: provider.rectangle, show: false });
      assertImageryLayerReady(imageryLayer);
      guardRasterTileIntersections(imageryLayer);
      return imageryLayer;
    }
    case "geojson": {
      const popup = layer.source.popup;
      const style = layer.source.style;
      const stroke = Color.fromCssColorString(style?.stroke ?? "#d9f18b");
      const strokeWidth = style?.strokeWidth ?? 3;
      const fill = style?.fill ? Color.fromCssColorString(style.fill) : stroke.withAlpha(0.18);
      const clampToGround = style?.clampToGround ?? true;
      const input = layer.source.ignoreAltitude || layer.source.uniqueFeatureIds
        ? prepareGeoJson(await Resource.fetchJson({ url: layer.source.url }), layer.id, layer.source.ignoreAltitude, layer.source.uniqueFeatureIds)
        : layer.source.url;
      const dataSource = await GeoJsonDataSource.load(input, {
        ...(layer.source.credit ? { credit: layer.source.credit } : {}),
        clampToGround,
        stroke,
        strokeWidth,
        fill,
        ...(style ? { describe: () => "" } : {}),
      });
      if (!style) {
        if (popup) for (const entity of dataSource.entities.values) registerVectorPopup(entity, popup);
        return dataSource;
      }

      const helpers: Entity[] = [];
      boundaryHelpers.set(dataSource, helpers);
      const time = JulianDate.now();
      const lineOptions = {
        material: new ColorMaterialProperty(stroke),
        width: new ConstantProperty(strokeWidth),
        clampToGround: new ConstantProperty(clampToGround),
        zIndex: new ConstantProperty(style.zIndex ?? 0),
      };
      // Enforce the configured style even when GeoJSON includes
      // simplestyle properties such as stroke, stroke-width or fill-opacity.
      for (const entity of [...dataSource.entities.values]) {
        if (popup) registerVectorPopup(entity, popup);
        entity.description = undefined;
        entity.label = undefined;
        const classification = style.classification;
        const properties = entity.properties?.getValue(time) ?? {};
        const classified = classification?.classes[String(properties[classification.property])];
        const entityLineOptions = {
          ...lineOptions,
          material: new ColorMaterialProperty(classified?.stroke ? Color.fromCssColorString(classified.stroke) : stroke),
          width: new ConstantProperty(classified?.strokeWidth ?? strokeWidth),
          zIndex: new ConstantProperty(classified?.zIndex ?? style.zIndex ?? 0),
        };
        if (entity.polyline) {
          entity.polyline.material = entityLineOptions.material;
          entity.polyline.width = entityLineOptions.width;
          entity.polyline.clampToGround = entityLineOptions.clampToGround;
          entity.polyline.zIndex = entityLineOptions.zIndex;
        }
        if (entity.polygon) {
          const outlineStyle = style.outline;
          const index = outlineStyle ? properties[outlineStyle.property] : undefined;
          const outlineColor = outlineStyle && Number.isInteger(index) && index >= 0 && index < outlineStyle.colors.length
            ? Color.fromCssColorString(outlineStyle.colors[index])
            : Color.fromCssColorString(outlineStyle?.fallbackColor ?? classified?.stroke ?? style.stroke);
          const outlineOptions = {
            ...entityLineOptions,
            material: new ColorMaterialProperty(outlineColor),
            width: new ConstantProperty(outlineStyle?.width ?? classified?.strokeWidth ?? strokeWidth),
          };
          const hierarchy = entity.polygon.hierarchy?.getValue(time) as PolygonHierarchy | undefined;
          // Ground polygon outlines do not reliably support pixel widths.
          // Draw each closed ring (including holes) as a ground polyline.
          const addRing = (ring: PolygonHierarchy) => {
            const positions = [...ring.positions];
            if (positions.length > 1) {
              if (!Cartesian3.equals(positions[0], positions[positions.length - 1])) positions.push(positions[0]);
              const outline = dataSource.entities.add({
                parent: entity,
                properties: entity.properties,
                polyline: new PolylineGraphics({ ...outlineOptions, positions }),
              });
              helpers.push(outline);
              if (popup) registerVectorPopup(outline, popup);
            }
            ring.holes.forEach(addRing);
          };
          if (hierarchy && style.polygonOutline !== false) addRing(hierarchy);
          const baseFill = classified?.fill ? Color.fromCssColorString(classified.fill) : fill;
          const entityFill = baseFill.withAlpha(baseFill.alpha * Math.min(1, Math.max(0, classified?.fillOpacity ?? style.fillOpacity ?? 1)));
          entity.polygon.material = new ColorMaterialProperty(entityFill);
          entity.polygon.zIndex = new ConstantProperty(classified?.zIndex ?? style.zIndex ?? 0);
          entity.polygon.outline = new ConstantProperty(false);
          // The original polygon owns fill, properties and picking; helpers contain lines only.
        }
      }
      return dataSource;
    }
  }
}

export async function attachLayer(viewer: Viewer, layer: LoadedLayer, imageryIndex?: number): Promise<void> {
  if (viewer.isDestroyed()) throw new Error("Cannot attach a layer to a destroyed viewer.");
  if (layer instanceof ImageryLayer) {
    assertImageryLayerReady(layer);
    if (!viewer.imageryLayers.contains(layer)) viewer.imageryLayers.add(layer, imageryIndex);
  } else if (layer instanceof Cesium3DTileset) {
    viewer.scene.primitives.add(layer);
  } else {
    await viewer.dataSources.add(layer);
  }
}

export function removeLayer(viewer: Viewer, layer: LoadedLayer): void {
  if (viewer.isDestroyed()) return;
  if (layer instanceof ImageryLayer) {
    if (viewer.imageryLayers.contains(layer)) viewer.imageryLayers.remove(layer, true);
    else if (!layer.isDestroyed()) layer.destroy();
  } else if (layer instanceof Cesium3DTileset) {
    if (viewer.scene.primitives.contains(layer)) viewer.scene.primitives.remove(layer);
    else if (!layer.isDestroyed()) layer.destroy();
  } else {
    viewer.dataSources.remove(layer, true);
    boundaryHelpers.delete(layer);
    layer.entities.removeAll();
  }
}
