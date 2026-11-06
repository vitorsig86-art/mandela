import { Math as CesiumMath, type Viewer } from "cesium";
import type { CameraConfig, GeographicBounds } from "../projects/types";

export function captureCamera(viewer: Viewer): CameraConfig {
  const { camera } = viewer;
  const position = camera.positionCartographic;
  return {
    longitude: CesiumMath.toDegrees(position.longitude),
    latitude: CesiumMath.toDegrees(position.latitude),
    height: position.height,
    heading: CesiumMath.toDegrees(camera.heading),
    pitch: CesiumMath.toDegrees(camera.pitch),
    roll: CesiumMath.toDegrees(camera.roll),
  };
}

// Ground rectangle visible in the current view, W/S/E/N in degrees.
// undefined when the view does not intersect the globe.
export function captureViewBounds(viewer: Viewer): GeographicBounds | undefined {
  const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  if (!rectangle) return undefined;
  return [rectangle.west, rectangle.south, rectangle.east, rectangle.north].map(CesiumMath.toDegrees) as GeographicBounds;
}

function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

// Snippets ready to paste into src/projects/<slug>.ts.
export function formatCamera(camera: CameraConfig): string {
  return `{ longitude: ${fixed(camera.longitude, 7)}, latitude: ${fixed(camera.latitude, 7)}, height: ${fixed(camera.height, 1)}, `
    + `heading: ${fixed(camera.heading, 2)}, pitch: ${fixed(camera.pitch, 2)}, roll: ${fixed(camera.roll, 2)} }`;
}

export function initialCameraSnippet(camera: CameraConfig): string {
  return `initialCamera: ${formatCamera(camera)},`;
}

export function sceneCameraSnippet(sceneId: string, camera: CameraConfig): string {
  return `// scenes → { id: "${sceneId}", … }\ncamera: ${formatCamera(camera)},`;
}

export function boundsSnippet([west, south, east, north]: GeographicBounds): string {
  return `bounds: [${fixed(west, 7)}, ${fixed(south, 7)}, ${fixed(east, 7)}, ${fixed(north, 7)}],`;
}
