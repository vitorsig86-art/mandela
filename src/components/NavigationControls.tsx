import { useEffect, useId, useRef } from "react";
import { Cartesian2, Cartesian3, type Viewer } from "cesium";
import { flyToCamera } from "../cesium/projectCamera";
import { useGeolocation } from "../hooks/useGeolocation";
import type { NavigationArea } from "../cesium/navigationLimits";
import type { CameraConfig } from "../projects/types";
import { Icon } from "./icons";
import "./NavigationControls.css";

interface NavigationControlsProps {
  viewer: Viewer | null;
  homeCamera?: CameraConfig;
  disabled?: boolean;
  // Navigation limit; GPS does not fly the camera outside it.
  area?: NavigationArea | null;
  // Runs when the Home flight reaches the initial view (e.g. popup.openOnHome).
  onHome?: () => void;
}

export function NavigationControls({ viewer, homeCamera, disabled = false, area = null, onHome }: NavigationControlsProps) {
  const compassRef = useRef<HTMLSpanElement>(null);
  const unavailable = disabled || !viewer || viewer.isDestroyed();
  const location = useGeolocation(unavailable ? null : viewer, area);
  const locationStatusId = useId();
  const locationStatus = location.status === "locating" ? "Buscando localização…"
    : location.status === "active" && location.outsideArea ? "GPS ativo, fora da área do projeto."
    : location.status === "active" ? "GPS ativo. Toque para centralizar novamente."
    : location.status === "error" ? "GPS indisponível. Toque para tentar novamente." : "GPS inativo.";
  const locationTitle = location.status === "active" && location.accuracy !== null
    ? `Minha localização — GPS ± ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(location.accuracy)} m`
    : "Minha localização";

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    let previousHeading: number | undefined;
    function syncCompass() {
      if (!viewer || viewer.isDestroyed() || !compassRef.current) return;
      const heading = viewer.camera.heading;
      if (heading === previousHeading) return;
      // North rotates opposite the camera. Update only the icon, not the React tree.
      compassRef.current.style.transform = `rotate(${-heading}rad)`;
      previousHeading = heading;
    }
    syncCompass();
    // postRender follows even small heading changes without changing camera thresholds.
    return viewer.scene.postRender.addEventListener(syncCompass);
  }, [viewer]);

  function resetNorth() {
    if (unavailable || !viewer) return;
    const camera = viewer.camera;
    camera.cancelFlight();
    camera.setView({
      orientation: { heading: 0, pitch: camera.pitch, roll: camera.roll },
    });
    viewer.scene.requestRender();
  }

  function zoom(closer: boolean) {
    if (unavailable || !viewer) return;
    const { camera, scene } = viewer;
    camera.cancelFlight();
    const orientation = { heading: camera.heading, pitch: camera.pitch, roll: camera.roll };
    const center = new Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2);
    const ray = camera.getPickRay(center);
    const target = (ray && scene.globe.pick(ray, scene))
      ?? camera.pickEllipsoid(center, scene.globe.ellipsoid);
    const position = camera.positionCartographic;
    const clearance = position.height - (scene.globe.getHeight(position) ?? 0);
    const distance = target ? Cartesian3.distance(camera.positionWC, target) : Math.max(clearance, 1);
    const step = distance * 0.2;
    const amount = closer
      ? Math.min(step, Math.max(0, distance - scene.screenSpaceCameraController.minimumZoomDistance))
      : step;
    if (closer) camera.zoomIn(amount);
    else camera.zoomOut(amount);
    // Translation can change the local ENU frame; preserve the original heading/pitch.
    camera.setView({ orientation });
    scene.requestRender();
  }

  function goHome() {
    if (unavailable || !viewer || !homeCamera) return;
    flyToCamera(viewer, homeCamera, undefined, onHome);
  }

  return (
    <>
      <div className="navigation-controls" role="group" aria-label="Navegação do mapa">
        <button className="navigation-compass" type="button" disabled={unavailable} onClick={resetNorth} aria-label="Orientar para o norte" title="Orientar para o norte">
          <span className="navigation-compass-face" ref={compassRef} aria-hidden="true"><Icon name="north" /></span>
        </button>
        <div className="navigation-button-stack">
          {/* Touch screens already pinch to zoom; CSS hides these two on mobile. */}
          <button className="navigation-zoom" type="button" disabled={unavailable} onClick={() => zoom(true)} aria-label="Aproximar" title="Aproximar"><Icon name="plus" /></button>
          <button className="navigation-zoom" type="button" disabled={unavailable} onClick={() => zoom(false)} aria-label="Afastar" title="Afastar"><Icon name="minus" /></button>
          <button type="button" disabled={unavailable || !homeCamera} onClick={goHome} aria-label="Voltar à vista inicial do projeto" title="Vista inicial"><Icon name="home" /></button>
          <button className="navigation-location" data-state={location.status} type="button" disabled={unavailable} onClick={location.locate} aria-label="Minha localização" title={locationTitle} aria-describedby={locationStatusId} aria-busy={location.status === "locating"}>
            <Icon name="locate" />
            {location.status !== "idle" && <span className="navigation-location-dot" aria-hidden="true" />}
          </button>
          {location.status === "active" && <button type="button" onClick={location.stop} aria-label="Desativar GPS" title="Desativar GPS"><Icon name="close" /></button>}
        </div>
        <span id={locationStatusId} className="navigation-location-status" role="status">{locationStatus}</span>
      </div>
      {location.error && <div className="map-alert navigation-location-error" role="alert">{location.error}</div>}
      {!location.error && location.outsideArea && <div className="map-alert navigation-location-error" role="status">Sua posição está fora da área do projeto</div>}
    </>
  );
}
