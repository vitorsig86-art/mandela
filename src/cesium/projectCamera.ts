import { Cartesian3, Math as CesiumMath, type Viewer } from "cesium";
import type { ProjectConfig, CameraConfig } from "../projects/types";

export function createCameraView(camera: CameraConfig) {
  return {
    destination: Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height),
    orientation: {
      heading: CesiumMath.toRadians(camera.heading),
      pitch: CesiumMath.toRadians(camera.pitch),
      roll: CesiumMath.toRadians(camera.roll),
    },
  };
}

// Immediate opening view.
export function applyProjectCamera(viewer: Viewer, project: ProjectConfig): void {
  if (viewer.isDestroyed()) return;
  viewer.camera.cancelFlight();
  viewer.camera.setView(createCameraView(project.initialCamera));
  viewer.scene.requestRender();
}

// Flights started by the app (Home, scenes, GPS) may arc outside the
// navigation limit; the limit waits until they complete or are cancelled.
const managedFlights = new WeakMap<Viewer, number>();

export function beginManagedFlight(viewer: Viewer): () => void {
  managedFlights.set(viewer, (managedFlights.get(viewer) ?? 0) + 1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    managedFlights.set(viewer, Math.max(0, (managedFlights.get(viewer) ?? 1) - 1));
    if (!viewer.isDestroyed()) viewer.scene.requestRender();
  };
}

export function isManagedFlightActive(viewer: Viewer): boolean {
  return (managedFlights.get(viewer) ?? 0) > 0;
}

// Same flight as flyToCamera, as a promise that settles when it ends or is cancelled.
export function flyToCameraSettled(viewer: Viewer, camera: CameraConfig, duration = 1.2): Promise<void> {
  if (viewer.isDestroyed()) return Promise.resolve();
  const end = beginManagedFlight(viewer);
  return new Promise(resolve => {
    const done = () => { end(); resolve(); };
    viewer.camera.flyTo({ ...createCameraView(camera), duration, complete: done, cancel: done });
    viewer.scene.requestRender();
  });
}

// Exact camera pose, to put the camera back after an overlay (embedded page).
export interface CameraSnapshot { position: Cartesian3; heading: number; pitch: number; roll: number }

export function captureCamera(viewer: Viewer): CameraSnapshot {
  const { camera } = viewer;
  return { position: Cartesian3.clone(camera.positionWC), heading: camera.heading, pitch: camera.pitch, roll: camera.roll };
}

// Restores the pose without animation, only when something moved it. Returns true when it restored.
export function restoreCamera(viewer: Viewer, snapshot: CameraSnapshot): boolean {
  if (viewer.isDestroyed()) return false;
  const { camera } = viewer;
  camera.cancelFlight();
  const same = Cartesian3.equalsEpsilon(camera.positionWC, snapshot.position, 0, 1e-3)
    && [[camera.heading, snapshot.heading], [camera.pitch, snapshot.pitch], [camera.roll, snapshot.roll]]
      .every(([a, b]) => CesiumMath.equalsEpsilon(CesiumMath.negativePiToPi(a - b), 0, 1e-6));
  if (same) return false;
  camera.setView({ destination: snapshot.position, orientation: { heading: snapshot.heading, pitch: snapshot.pitch, roll: snapshot.roll } });
  viewer.scene.requestRender();
  return true;
}

// Animated move to a configured view: Home and scenes with a camera.
// onComplete runs only when the flight reaches the view (not when it is cancelled).
export function flyToCamera(viewer: Viewer, camera: CameraConfig, duration = 1.2, onComplete?: () => void): void {
  if (viewer.isDestroyed()) return;
  const end = beginManagedFlight(viewer);
  viewer.camera.flyTo({ ...createCameraView(camera), duration, complete: () => { end(); onComplete?.(); }, cancel: end });
  viewer.scene.requestRender();
}
