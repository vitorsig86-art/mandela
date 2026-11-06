import { useEffect, useMemo } from "react";
import { Cartesian3, Math as CesiumMath, type Viewer } from "cesium";
import { camerasOutsideArea, clampToArea, navigationArea, type NavigationArea } from "../cesium/navigationLimits";
import { isManagedFlightActive } from "../cesium/projectCamera";
import type { ProjectConfig } from "../projects/types";

// Keeps the camera position inside the project area (bounds plus margin) and
// below the maximum height. Approximate: tilted views can still see beyond it.
// Public APIs only: ScreenSpaceCameraController.maximumZoomDistance,
// Scene.postRender, Globe.getHeight and Camera.setView.
export function useNavigationLimits(viewer: Viewer | null, project: ProjectConfig, bypass = false): NavigationArea | null {
  const area = useMemo(() => {
    try {
      return navigationArea(project);
    } catch (error) {
      console.error("Limite de navegação desativado: configuração inválida.", error);
      return null;
    }
  }, [project]);

  useEffect(() => {
    if (!area || !import.meta.env.DEV) return;
    const outside = camerasOutsideArea(project, area);
    if (outside.length) console.warn(`Fora do limite de navegação (serão reposicionadas): ${outside.join(", ")}.`);
  }, [project, area]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !area || bypass) return;
    const controller = viewer.scene.screenSpaceCameraController;
    const previousMaximum = controller.maximumZoomDistance;
    controller.maximumZoomDistance = area.maximumHeight;

    function clamp() {
      if (!viewer || viewer.isDestroyed() || isManagedFlightActive(viewer)) return;
      const { camera, scene } = viewer;
      const position = camera.positionCartographic;
      const ground = scene.globe.getHeight(position) ?? 0;
      const next = clampToArea(CesiumMath.toDegrees(position.longitude), CesiumMath.toDegrees(position.latitude), position.height - ground, area!);
      if (!next.changed) return;
      camera.setView({
        destination: Cartesian3.fromDegrees(next.longitude, next.latitude, ground + next.heightAboveGround),
        orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
      });
      scene.requestRender();
    }

    const remove = viewer.scene.postRender.addEventListener(clamp);
    viewer.scene.requestRender();
    return () => {
      remove();
      if (!viewer.isDestroyed()) {
        controller.maximumZoomDistance = previousMaximum;
        viewer.scene.requestRender();
      }
    };
  }, [viewer, area, bypass]);

  return bypass ? null : area;
}
