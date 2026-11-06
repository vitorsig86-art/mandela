import { useEffect, useRef, useState } from "react";
import { EllipsoidTerrainProvider, Terrain, type Viewer } from "cesium";
import { createViewer } from "../cesium/createViewer";
import { captureCamera } from "../cesium/captureCamera";

export function useCesiumViewer(cameraCapture = false) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let instance: Viewer;
    try {
      instance = createViewer(containerRef.current);
      setViewer(instance);
    } catch (cause) {
      console.error("Cesium initialization failed", cause);
      setError("Não foi possível iniciar o mapa 3D. Ative WebGL e aceleração de hardware e recarregue.");
      return;
    }

    function logCamera() {
      if (!instance.isDestroyed()) console.log(JSON.stringify(captureCamera(instance), null, 2));
    }
    if (import.meta.env.DEV && cameraCapture) window.addEventListener("cardeal:capture-camera", logCamera);
    let active = true;
    let fellBack = false;
    let terrain: Terrain | undefined;
    let removeTerrainReady = () => {};
    let removeTerrainError = () => {};
    let removeTileError = () => {};

    function useEllipsoid() {
      if (!active || fellBack || instance.isDestroyed()) return;
      fellBack = true;
      // The scene setter also cancels any pending World Terrain ready listener.
      instance.scene.terrainProvider = new EllipsoidTerrainProvider();
      instance.scene.requestRender();
      // Terrain errors may contain authenticated URLs. Never log the raw error.
      console.warn("Cesium World Terrain unavailable; using WGS84 Ellipsoid.");
    }

    try {
      // createViewer has already assigned the existing VITE_CESIUM_ION_TOKEN.
      terrain = Terrain.fromWorldTerrain();
      removeTerrainError = terrain.errorEvent.addEventListener(() => {
        useEllipsoid();
        if (!active) removeTerrainError();
      });
      instance.scene.setTerrain(terrain);
      removeTerrainReady = terrain.readyEvent.addEventListener((provider) => {
        if (!active || fellBack || instance.isDestroyed()) return;
        removeTileError = provider.errorEvent.addEventListener((tileError) => {
          tileError.retry = false;
          useEllipsoid();
        });
        instance.scene.requestRender();
      });
    } catch {
      useEllipsoid();
    }

    const unsubscribe = instance.scene.renderError.addEventListener(() => {
      setError("Ocorreu um erro ao renderizar o mapa. Recarregue para reiniciar.");
    });
    return () => {
      active = false;
      if (import.meta.env.DEV && cameraCapture) window.removeEventListener("cardeal:capture-camera", logCamera);
      removeTerrainReady();
      removeTileError();
      // Keep a safe error listener while initialization is pending: Terrain's
      // default handler otherwise prints the original credential-bearing error.
      if (terrain?.ready || fellBack) removeTerrainError();
      unsubscribe();
      if (!instance.isDestroyed()) instance.destroy();
    };
  }, [cameraCapture]);

  return { containerRef, viewer, error };
}
