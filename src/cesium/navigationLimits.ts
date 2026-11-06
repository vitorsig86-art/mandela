import type { CameraConfig, GeographicBounds, ProjectConfig } from "../projects/types";

// Approximate restriction of the camera position to the project area.
// Pure functions in degrees/meters; the hook applies them to the viewer.

const METERS_PER_DEGREE_LATITUDE = 110574;
const METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111320;
export const DEFAULT_MARGIN_RATIO = 0.25;
export const MINIMUM_DEFAULT_ZOOM_DISTANCE = 2000;
const ANGLE_TOLERANCE = 1e-9;
const HEIGHT_TOLERANCE = 0.5;

export interface NavigationArea {
  // Expanded limit in degrees (project bounds plus margin on each side).
  west: number;
  south: number;
  east: number;
  north: number;
  // Maximum camera height above the ground, in meters.
  maximumHeight: number;
}

function cosLatitude(latitude: number) {
  return Math.max(Math.cos(latitude * Math.PI / 180), 0.01);
}

export function boundsSizeMeters([west, south, east, north]: GeographicBounds) {
  const middle = (south + north) / 2;
  return {
    width: (east - west) * METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * cosLatitude(middle),
    height: (north - south) * METERS_PER_DEGREE_LATITUDE,
  };
}

export function validateBounds(bounds: GeographicBounds): void {
  const [west, south, east, north] = bounds;
  if (bounds.length !== 4 || !bounds.every(Number.isFinite)
    || west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error("bounds deve ser [W, S, E, N] em graus, com W < E e S < N.");
  }
}

// null when the project has no bounds or navigation.enabled is false.
export function navigationArea(project: Pick<ProjectConfig, "bounds" | "navigation">): NavigationArea | null {
  const { bounds, navigation } = project;
  if (!bounds || navigation?.enabled === false) return null;
  validateBounds(bounds);
  const ratio = navigation?.marginRatio ?? DEFAULT_MARGIN_RATIO;
  if (!Number.isFinite(ratio) || ratio < 0) throw new Error("navigation.marginRatio deve ser um número >= 0.");
  const [west, south, east, north] = bounds;
  const size = boundsSizeMeters(bounds);
  // Margin: ratio of the largest dimension, applied on every side.
  const margin = ratio * Math.max(size.width, size.height);
  const deltaLatitude = margin / METERS_PER_DEGREE_LATITUDE;
  const deltaLongitude = margin / (METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * cosLatitude((south + north) / 2));
  const area = {
    west: Math.max(-180, west - deltaLongitude),
    south: Math.max(-90, south - deltaLatitude),
    east: Math.min(180, east + deltaLongitude),
    north: Math.min(90, north + deltaLatitude),
  };
  const expanded = boundsSizeMeters([area.west, area.south, area.east, area.north]);
  const configured = navigation?.maximumZoomDistance;
  if (configured !== undefined && (!Number.isFinite(configured) || configured <= 0)) {
    throw new Error("navigation.maximumZoomDistance deve ser um número > 0 (metros).");
  }
  const maximumHeight = configured
    ?? Math.max(MINIMUM_DEFAULT_ZOOM_DISTANCE, 2 * Math.max(expanded.width, expanded.height));
  return { ...area, maximumHeight };
}

export function isInsideArea(longitude: number, latitude: number, area: NavigationArea): boolean {
  return longitude >= area.west && longitude <= area.east && latitude >= area.south && latitude <= area.north;
}

export function clampToArea(longitude: number, latitude: number, heightAboveGround: number, area: NavigationArea) {
  const next = {
    longitude: Math.min(area.east, Math.max(area.west, longitude)),
    latitude: Math.min(area.north, Math.max(area.south, latitude)),
    heightAboveGround: Math.min(area.maximumHeight, heightAboveGround),
  };
  const changed = Math.abs(next.longitude - longitude) > ANGLE_TOLERANCE
    || Math.abs(next.latitude - latitude) > ANGLE_TOLERANCE
    || heightAboveGround - next.heightAboveGround > HEIGHT_TOLERANCE;
  return { ...next, changed };
}

// Configured views outside the limit are snapped back after opening/flying.
export function camerasOutsideArea(project: Pick<ProjectConfig, "initialCamera" | "scenes">, area: NavigationArea): string[] {
  const views: [string, CameraConfig][] = [["initialCamera", project.initialCamera]];
  for (const scene of project.scenes ?? []) if (scene.camera) views.push([`scenes "${scene.id}".camera`, scene.camera]);
  return views.filter(([, camera]) => !isInsideArea(camera.longitude, camera.latitude, area)).map(([name]) => name);
}
