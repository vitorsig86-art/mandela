import { Cartesian3, Matrix4, type Cesium3DTileset } from "cesium";

// Capture the original transform and local vertical once; each adjustment is
// absolute relative to that transform, so slider changes never accumulate.
export function createModelHeightAdjustment(tileset: Cesium3DTileset) {
  const original = Matrix4.clone(tileset.modelMatrix);
  const center = Cartesian3.clone(tileset.boundingSphere.center);
  const normal = tileset.ellipsoid.geodeticSurfaceNormal(center, new Cartesian3());
  return {
    set(meters: number) {
      if (!Number.isFinite(meters) || tileset.isDestroyed()) return;
      const translation = Cartesian3.multiplyByScalar(normal, meters, new Cartesian3());
      const offset = Matrix4.fromTranslation(translation);
      tileset.modelMatrix = Matrix4.multiply(offset, original, new Matrix4());
    },
    reset() {
      if (!tileset.isDestroyed()) tileset.modelMatrix = Matrix4.clone(original);
    },
  };
}
