import { useEffect, useState } from "react";
import type { Cesium3DTileset, Viewer } from "cesium";
import { createModelHeightAdjustment } from "../cesium/modelHeight";
import ModelCropDev from "./ModelCropDev";

export default function ModelDevelopmentTools({ viewer, tileset, alignment, crop }: {
  viewer: Viewer | null; tileset: Cesium3DTileset | null; alignment: boolean; crop: boolean;
}) {
  const [meters, setMeters] = useState(0);
  const [adjustment, setAdjustment] = useState<ReturnType<typeof createModelHeightAdjustment> | null>(null);
  useEffect(() => {
    setMeters(0);
    if (!alignment || !tileset || tileset.isDestroyed()) { setAdjustment(null); return; }
    const controller = createModelHeightAdjustment(tileset);
    setAdjustment(controller);
    return () => { controller.reset(); if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender(); };
  }, [tileset, alignment, viewer]);
  function change(value: number) {
    if (!Number.isFinite(value)) return;
    setMeters(value);
    adjustment?.set(value);
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }
  return <>
    {alignment && <section className="model-alignment-dev" aria-label="Ajuste de modelo em desenvolvimento">
      <label>Ajustar altura 3D (m)<input type="number" value={meters} step={0.1} disabled={!adjustment} onChange={event => change(Number(event.currentTarget.value))} /></label>
      <input aria-label="Altura relativa do modelo" type="range" min={-100} max={100} step={0.1} value={meters} disabled={!adjustment} onChange={event => change(Number(event.currentTarget.value))} />
      <button type="button" disabled={!adjustment} onClick={() => change(0)}>Restaurar transformação configurada</button>
    </section>}
    {crop && <ModelCropDev viewer={viewer} tileset={tileset} visible={Boolean(tileset?.show)} />}
  </>;
}
