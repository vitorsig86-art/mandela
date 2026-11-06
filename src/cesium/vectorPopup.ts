import { BoundingSphere, Cartesian3, Cartographic, ColorMaterialProperty, JulianDate, SceneTransforms, type Entity, type PolygonHierarchy, type Viewer } from "cesium";
import type { VectorPopupConfig } from "../projects/types";
import { readCuratedPopup } from "./curatedPopup";

// popup.openOnHome for the current layout: true always, "desktop" only outside mobile.
export function opensOnHome(popup: VectorPopupConfig | undefined, mobile: boolean): boolean {
  return popup?.openOnHome === true || (popup?.openOnHome === "desktop" && !mobile);
}

export interface VectorPopupActionLink {
  label: string;
  url: string;
  target: "overlay" | "tab";
  flyTo: boolean | "home";
  onClose: "keep" | "home";
}

// Returns the normalized URL when it is https and its origin is allowed.
export function allowedPageUrl(value: unknown, allowedOrigins: readonly string[] = []): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const allowed = allowedOrigins.some(origin => {
    try { return new URL(origin).origin === url.origin; } catch { return false; }
  });
  return allowed ? url.href : null;
}

const configurations = new WeakMap<Entity, VectorPopupConfig>();

export function registerVectorPopup(entity: Entity, config: VectorPopupConfig): void {
  configurations.set(entity, config);
}

// popup.openOnHome: the first visible feature of a layer configured to open its
// popup at the opening view and after Home. Outline helpers (entities with a
// parent) are skipped; the feature itself owns the popup. Public APIs only.
export function findHomePopupEntity(viewer: Viewer, mobile = false): Entity | undefined {
  if (viewer.isDestroyed()) return undefined;
  for (let index = 0; index < viewer.dataSources.length; index++) {
    const dataSource = viewer.dataSources.get(index);
    if (!dataSource.show) continue;
    for (const entity of dataSource.entities.values) {
      if (!entity.parent && entity.isShowing && opensOnHome(configurations.get(entity), mobile)) return entity;
    }
  }
  return undefined;
}

// Screen point (viewport CSS pixels, like a click) at the center of the
// feature, raised to the terrain so a ground-clamped polygon lines up.
export function homePopupPoint(viewer: Viewer, entity: Entity, time = JulianDate.now()): { x: number; y: number } | undefined {
  if (viewer.isDestroyed()) return undefined;
  const hierarchy = entity.polygon?.hierarchy?.getValue(time) as PolygonHierarchy | undefined;
  const positions: Cartesian3[] = hierarchy?.positions ?? entity.polyline?.positions?.getValue(time) ?? [];
  const position = positions.length ? BoundingSphere.fromPoints(positions).center : entity.position?.getValue(time);
  if (!position) return undefined;
  const cartographic = Cartographic.fromCartesian(position);
  if (!cartographic) return undefined;
  cartographic.height = viewer.scene.globe.getHeight(cartographic) ?? 0;
  const onCanvas = SceneTransforms.worldToWindowCoordinates(viewer.scene, Cartographic.toCartesian(cartographic));
  const canvas = viewer.canvas.getBoundingClientRect();
  // Off screen (or behind the camera): no anchor, the popup uses its default spot.
  if (!onCanvas || onCanvas.x < 0 || onCanvas.y < 0 || onCanvas.x > canvas.width || onCanvas.y > canvas.height) return undefined;
  return { x: canvas.left + onCanvas.x, y: canvas.top + onCanvas.y };
}

// Ground geometry draw order is not consistently reflected in Scene.pick.
// Resolve overlapping configured vectors by their draw priority, leaving
// measurement and other non-vector selection targets untouched.
export function resolveVectorPopupSelection(current: Entity | undefined, candidates: Entity[], time = JulianDate.now()): Entity | undefined {
  if (!current || !configurations.has(current)) return current;
  let selected: Entity | undefined;
  let priority = -Infinity;
  for (const candidate of [current, ...candidates]) {
    if (!configurations.has(candidate) || !candidate.isShowing) continue;
    const graphics = candidate.polyline ?? candidate.polygon;
    const material = graphics?.material;
    if (material instanceof ColorMaterialProperty && material.color?.getValue(time)?.alpha === 0) continue;
    const zIndex = graphics?.zIndex?.getValue(time) ?? 0;
    if (zIndex > priority) {
      selected = candidate;
      priority = zIndex;
    }
  }
  return selected ?? current;
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && !(typeof value === "number" && !Number.isFinite(value));
}

export function readVectorPopup(entity: Entity | undefined, time = JulianDate.now(), allowedOrigins: readonly string[] = []) {
  const config = entity && configurations.get(entity);
  if (!config || !entity || !entity.isShowing) return null;
  const properties = entity.properties?.getValue(time) ?? {};
  const titleValue = config.titleProperty ? properties[config.titleProperty] : undefined;
  // Curated (macro) popups: only the configured fields, with sections.
  const curated = config.presentation === "curated" ? readCuratedPopup(properties, config) : null;
  return {
    title: curated?.title ?? (present(titleValue) ? `${config.titlePrefix ?? ""}${titleValue}${config.titleSuffix ?? ""}` : config.title ?? "Informações"),
    notice: config.notice,
    fields: curated?.fields ?? config.fields.filter(field => present(properties[field.property])).map(field => {
      const value = properties[field.property];
      const decimals = field.numberFormat?.decimalPlaces ?? (field.format === "integer" ? 0 : field.decimals);
      const formatted = typeof value === "number"
        ? new Intl.NumberFormat(field.numberFormat?.locale ?? "pt-BR", decimals === undefined ? {} : {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        }).format(value)
        : String(value);
      return { label: field.label, value: `${field.prefix ?? ""}${formatted}${field.suffix ?? ""}`, section: undefined as string | undefined };
    }),
    actions: (config.actions ?? []).flatMap((action): VectorPopupActionLink[] => {
      const url = allowedPageUrl(action.url ?? (action.urlProperty ? properties[action.urlProperty] : undefined), allowedOrigins);
      return url ? [{ label: action.label, url, target: action.target ?? "overlay", flyTo: action.flyTo ?? false, onClose: action.onClose ?? "keep" }] : [];
    }),
  };
}
