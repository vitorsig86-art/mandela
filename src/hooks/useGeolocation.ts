import { useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  ClassificationType,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  HeadingPitchRange,
  HeightReference,
  type Entity,
  type Viewer,
} from "cesium";
import { isInsideArea, type NavigationArea } from "../cesium/navigationLimits";
import { beginManagedFlight } from "../cesium/projectCamera";

type LocationStatus = "idle" | "locating" | "active" | "error";

interface LocationState {
  status: LocationStatus;
  accuracy: number | null;
  error: string | null;
  // Short notice: the position is outside the navigation limit, camera kept.
  outsideArea: boolean;
}

const idleState: LocationState = { status: "idle", accuracy: null, error: null, outsideArea: false };
const OUTSIDE_NOTICE_MS = 5000;

function locationError(code: number): string {
  switch (code) {
    case 1: return "Permissão de localização negada.";
    case 3: return "Não foi possível obter a localização a tempo.";
    default: return "Localização indisponível.";
  }
}

// Session-only positioning on the supplied viewer. Camera following is deliberately
// separate from position updates; a future follow mode can use the same marker.
export function useGeolocation(viewer: Viewer | null, area: NavigationArea | null = null) {
  const [state, setState] = useState<LocationState>(idleState);
  const actions = useRef<{ locate: () => void; stop: () => void } | null>(null);
  const areaRef = useRef(area);
  areaRef.current = area;

  useEffect(() => {
    setState(idleState);
    if (!viewer || viewer.isDestroyed()) return;
    const instance = viewer;
    let disposed = false;
    let generation = 0;
    let watchId: number | null = null;
    let geolocation: Geolocation | undefined;
    let marker: Entity | undefined;
    let accuracyCircle: Entity | undefined;
    let latestAccuracy: number | null = null;
    let hasPosition = false;
    let lastLongitude = 0;
    let lastLatitude = 0;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    const positionProperty = new ConstantPositionProperty();
    const accuracyProperty = new ConstantProperty(1);

    function available() {
      return !disposed && !instance.isDestroyed();
    }

    function clearWatch() {
      generation += 1;
      if (watchId !== null) geolocation?.clearWatch(watchId);
      watchId = null;
    }

    function hidePosition() {
      hasPosition = false;
      latestAccuracy = null;
      if (!available()) return;
      if (marker) marker.show = false;
      if (accuracyCircle) accuracyCircle.show = false;
      instance.scene.requestRender();
    }

    function fail(message: string) {
      if (!available()) return;
      // End the failed session so repeated watch errors cannot repeat the alert.
      // The next explicit tap starts a fresh request, including after a timeout.
      clearWatch();
      hidePosition();
      setState({ status: "error", accuracy: null, error: message, outsideArea: false });
    }

    function recenter() {
      if (!available() || !hasPosition || !marker) return;
      const limit = areaRef.current;
      if (limit && !isInsideArea(lastLongitude, lastLatitude, limit)) {
        // Show the marker, keep the camera inside the limit and warn briefly.
        if (noticeTimer !== undefined) clearTimeout(noticeTimer);
        setState((current) => ({ ...current, outsideArea: true }));
        noticeTimer = setTimeout(() => {
          noticeTimer = undefined;
          if (available()) setState((current) => ({ ...current, outsideArea: false }));
        }, OUTSIDE_NOTICE_MS);
        return;
      }
      instance.camera.cancelFlight();
      const endFlight = beginManagedFlight(instance);
      // Framing the clamped point lets Cesium resolve terrain height instead of
      // using the device's ellipsoidal altitude. Keep a useful field-view range.
      void instance.flyTo(marker, {
        duration: 1.2,
        offset: new HeadingPitchRange(
          instance.camera.heading,
          -Math.PI / 2,
          Math.max(350, Math.min(1500, (latestAccuracy ?? 0) * 3)),
        ),
      }).catch(() => {
        // Viewer teardown or an interrupted flight must not create an unhandled rejection.
      }).finally(endFlight);
      instance.scene.requestRender();
    }

    function updatePosition(position: GeolocationPosition) {
      const { longitude, latitude, accuracy } = position.coords;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
        || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        fail("Localização indisponível.");
        return;
      }
      const firstFix = !hasPosition;
      latestAccuracy = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null;
      lastLongitude = longitude;
      lastLatitude = latitude;
      positionProperty.setValue(Cartesian3.fromDegrees(longitude, latitude));
      if (!marker) {
        marker = instance.entities.add({
          name: "Minha localização",
          position: positionProperty,
          point: {
            pixelSize: 16,
            color: Color.fromCssColorString("#2684ff"),
            outlineColor: Color.WHITE,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_TERRAIN,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
      marker.show = true;
      if (latestAccuracy !== null) {
        accuracyProperty.setValue(latestAccuracy);
        if (!accuracyCircle) {
          accuracyCircle = instance.entities.add({
            name: "Precisão da localização",
            position: positionProperty,
            ellipse: {
              semiMajorAxis: accuracyProperty,
              semiMinorAxis: accuracyProperty,
              material: Color.fromCssColorString("#2684ff").withAlpha(0.15),
              heightReference: HeightReference.CLAMP_TO_TERRAIN,
              classificationType: ClassificationType.TERRAIN,
            },
          });
        }
        accuracyCircle.show = true;
      } else if (accuracyCircle) {
        accuracyCircle.show = false;
      }
      hasPosition = true;
      setState((current) => ({ status: "active", accuracy: latestAccuracy, error: null, outsideArea: current.outsideArea }));
      instance.scene.requestRender();
      if (firstFix) recenter();
    }

    function locate() {
      if (!available()) return;
      if (hasPosition) {
        recenter();
        return;
      }
      if (watchId !== null) return;
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        fail("Este dispositivo ou navegador não oferece localização.");
        return;
      }
      geolocation = navigator.geolocation;
      setState({ status: "locating", accuracy: null, error: null, outsideArea: false });
      const requestGeneration = ++generation;
      try {
        const id = geolocation.watchPosition(
          (position) => {
            if (available() && generation === requestGeneration) updatePosition(position);
          },
          (error) => {
            if (available() && generation === requestGeneration) fail(locationError(error.code));
          },
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
        );
        if (available() && generation === requestGeneration) watchId = id;
        else geolocation.clearWatch(id);
      } catch {
        fail("Localização indisponível.");
      }
    }

    function stop() {
      clearWatch();
      hidePosition();
      if (available()) setState(idleState);
    }

    actions.current = { locate, stop };
    return () => {
      disposed = true;
      actions.current = null;
      if (noticeTimer !== undefined) clearTimeout(noticeTimer);
      clearWatch();
      if (!instance.isDestroyed()) {
        if (marker) instance.entities.remove(marker);
        if (accuracyCircle) instance.entities.remove(accuracyCircle);
        instance.scene.requestRender();
      }
    };
  }, [viewer]);

  return {
    ...state,
    locate: () => actions.current?.locate(),
    stop: () => actions.current?.stop(),
  };
}
