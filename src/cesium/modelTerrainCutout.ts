import { ClippingPolygonCollection, type Viewer } from "cesium";
import { createModelClipping } from "./modelClipping";
import type { ModelClippingConfig } from "../projects/types";

// Globe and tileset collections must have separate owners and polygons.
export function createModelTerrainCutout(viewer: Viewer, clipping: ModelClippingConfig) {
  let collection: ClippingPolygonCollection | undefined;
  return {
    setVisible(visible: boolean) {
      if (viewer.isDestroyed()) return;
      const globe = viewer.scene.globe;
      if (!collection && visible && !globe.clippingPolygons && ClippingPolygonCollection.isSupported(viewer.scene)) {
        collection = createModelClipping({ ...clipping, inverse: !clipping.inverse });
        globe.clippingPolygons = collection;
      }
      if (collection && globe.clippingPolygons === collection) {
        collection.enabled = visible;
        viewer.scene.requestRender();
      }
    },
    dispose() {
      if (!collection) return;
      if (!viewer.isDestroyed() && viewer.scene.globe.clippingPolygons === collection) {
        // Detach from the globe; Cesium owns the rendering resources.
        (viewer.scene.globe as { clippingPolygons: ClippingPolygonCollection | undefined }).clippingPolygons = undefined;
        viewer.scene.requestRender();
      }
      collection.enabled = false;
      collection.removeAll();
      collection = undefined;
    },
  };
}
