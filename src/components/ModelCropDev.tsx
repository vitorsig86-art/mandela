import { useEffect, useRef, useState } from "react";
import { Cartesian2, Cartesian3, ClippingPolygonCollection, Color, CustomDataSource, PolygonHierarchy, PolylineOutlineMaterialProperty, ScreenSpaceEventHandler, ScreenSpaceEventType, type Cesium3DTileset, type Viewer } from "cesium";
import { pickMeasurementPosition } from "../cesium/measurementUtils";
import { applyModelClipping, exportModelClipping, geographicVertex } from "../cesium/modelClipping";
import type { ModelClippingConfig } from "../projects/types";
import "./ModelCropDev.css";

interface EditorState {
  ready: boolean;
  editing: boolean;
  count: number;
  applied: boolean;
  preview: boolean;
  message: string;
  exported: string;
}
interface EditorActions {
  edit(): void;
  cancel(): void;
  undo(): void;
  apply(): void;
  preview(): void;
  clear(): void;
  copy(): void;
}
const initial: EditorState = { ready: false, editing: false, count: 0, applied: false, preview: false, message: "Ative o Modelo 3D para editar.", exported: "" };

export default function ModelCropDev({ viewer, tileset, visible }: { viewer: Viewer | null; tileset: Cesium3DTileset | null; visible: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(initial);
  const actions = useRef<EditorActions | null>(null);

  useEffect(() => {
    setState(initial);
    if (!viewer || viewer.isDestroyed() || !tileset || tileset.isDestroyed()) return;
    if (!ClippingPolygonCollection.isSupported(viewer.scene)) {
      setState({ ...initial, message: "Este navegador não suporta recorte por polígonos (WebGL 2)." });
      return;
    }
    const source = new CustomDataSource("cardeal-model-crop-dev");
    const handler = new ScreenSpaceEventHandler(viewer.canvas);
    const original = tileset.clippingPolygons;
    const originalEnabled = original?.enabled ?? true;
    // Cesium 1.146 collections have a single owner. Restore from geographic
    // metadata, never reassign an old, already-owned collection.
    const originalConfig: ModelClippingConfig | null = original?.length === 1 ? {
      inverse: original.inverse, positions: original.get(0).positions.map(geographicVertex),
    } : null;
    let completed: ModelClippingConfig | null = originalConfig;
    let draft: Cartesian3[] = [];
    let completedGraphics: Cartesian3[] = originalConfig?.positions.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat)) ?? [];
    let editing = false;
    let disposed = false;
    let ready = false;
    let changed = false;
    let preview = original?.enabled ?? false;
    let defaultClick: ReturnType<ScreenSpaceEventHandler["getInputAction"]>;
    let defaultDoubleClick: ReturnType<ScreenSpaceEventHandler["getInputAction"]>;

    const render = () => { if (!disposed && !viewer.isDestroyed()) viewer.scene.requestRender(); };
    function update(message: string) {
      setState((current) => ({ ...current, ready, editing, count: editing ? draft.length : completed?.positions.length ?? 0, applied: Boolean(completed), preview, message }));
      render();
    }
    function draw() {
      source.entities.removeAll();
      const points = editing ? draft : completedGraphics;
      points.forEach((position, i) => source.entities.add({
        position, point: { pixelSize: 10, color: Color.YELLOW.withAlpha(0.95), outlineColor: Color.BLACK.withAlpha(0.95), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `${i + 1}`, font: "bold 13px sans-serif", fillColor: Color.WHITE, showBackground: true, pixelOffset: new Cartesian2(0, -22), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));
      if (points.length >= 2) source.entities.add({
        polyline: { positions: points.length >= 3 ? [...points, points[0]] : points, width: 4,
          material: new PolylineOutlineMaterialProperty({ color: Color.YELLOW, outlineColor: Color.BLACK, outlineWidth: 1 }),
          depthFailMaterial: Color.YELLOW.withAlpha(0.8) },
      });
      if (points.length >= 3) source.entities.add({
        polygon: { hierarchy: new PolygonHierarchy(points), perPositionHeight: true, material: Color.YELLOW.withAlpha(0.08) },
      });
      render();
    }
    function stop() {
      if (!editing) return;
      editing = false;
      handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      if (!viewer!.isDestroyed()) {
        if (defaultClick) viewer!.screenSpaceEventHandler.setInputAction(defaultClick, ScreenSpaceEventType.LEFT_CLICK);
        if (defaultDoubleClick) viewer!.screenSpaceEventHandler.setInputAction(defaultDoubleClick, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      }
      draft = [];
      draw();
    }
    const usable = () => ready && tileset.show && !tileset.isDestroyed();
    function edit() {
      if (!usable() || editing) return;
      if (document.querySelector('.measurement-toolbar button[aria-pressed="true"]')) {
        update("Finalize ou cancele a medição antes de editar o recorte.");
        return;
      }
      // Editing appends to the last polygon; undo removes its final vertices.
      draft = completedGraphics.map((point) => Cartesian3.clone(point));
      editing = true;
      defaultClick = viewer!.screenSpaceEventHandler.getInputAction(ScreenSpaceEventType.LEFT_CLICK);
      defaultDoubleClick = viewer!.screenSpaceEventHandler.getInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      viewer!.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      viewer!.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      handler.setInputAction((event: { position: Cartesian2 }) => {
        if (!usable()) return;
        const point = pickMeasurementPosition(viewer!, event.position);
        if (!point) { update("Não foi possível identificar a superfície. Tente outro ponto."); return; }
        if (draft.some((vertex) => Cartesian3.distance(vertex, point) < 0.1)) {
          update("Este ponto já existe; escolha uma posição diferente."); return;
        }
        draft.push(point); draw(); update("Clique para adicionar pontos. Esc cancela a edição.");
      }, ScreenSpaceEventType.LEFT_CLICK);
      draw(); update("Clique na superfície para definir o limite. Mínimo: 3 pontos. Esc cancela.");
    }
    function undo() { if (editing) { draft.pop(); draw(); update("Último ponto removido."); } }
    function cancel() { stop(); update("Edição cancelada; recorte anterior preservado."); }
    function apply() {
      if (!usable() || !editing) return;
      try {
        const config = { inverse: true, positions: draft.map(geographicVertex) };
        applyModelClipping(tileset!, config);
        completed = config; completedGraphics = draft.map((point) => Cartesian3.clone(point));
        changed = true; preview = true; stop();
        setState((current) => ({ ...current, exported: "" }));
        update("Recorte aplicado: interior mantido. Use preview para comparar com o modelo completo.");
      } catch (error) { update(error instanceof Error ? error.message : "Não foi possível aplicar o recorte."); }
    }
    function togglePreview() {
      if (!usable() || !completed) return;
      preview = !preview; tileset!.clippingPolygons.enabled = preview; changed = true;
      update(preview ? "Preview ativo: interior mantido." : "Preview desativado: modelo completo.");
    }
    function clear() {
      if (!usable()) return;
      stop(); completed = null; completedGraphics = []; preview = false; changed = true;
      // Empty the attached collection without reassigning its single owner.
      if (tileset!.clippingPolygons) { tileset!.clippingPolygons.removeAll(); tileset!.clippingPolygons.enabled = false; }
      source.entities.removeAll(); setState((current) => ({ ...current, exported: "" })); update("Recorte removido; modelo completo.");
    }
    function copy() {
      if (!usable() || !completed || editing) return;
      const text = exportModelClipping(completed);
      setState((current) => ({ ...current, exported: text }));
      if (!navigator.clipboard?.writeText) { update("Selecione e copie o objeto exibido abaixo."); return; }
      void navigator.clipboard.writeText(text).then(() => {
        if (!disposed) update("Coordenadas copiadas em longitude/latitude (graus).");
      }).catch(() => { if (!disposed) update("Selecione e copie o objeto exibido abaixo."); });
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && editing) cancel();
    }
    function otherTool(event: PointerEvent) {
      if (editing && event.target instanceof Element && event.target.closest(".measurement-controls")) {
        stop(); update("Edição cancelada para usar medições; recorte anterior preservado.");
      }
    }
    function cancelIfHidden() {
      if (!tileset!.show && editing) { stop(); update("Edição cancelada: Modelo 3D oculto."); }
      source.show = tileset!.show;
    }
    const api = { edit, cancel, undo, apply, preview: togglePreview, clear, copy };
    actions.current = api;
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", otherTool, true);
    const removeRender = viewer.scene.preRender.addEventListener(cancelIfHidden);
    void viewer.dataSources.add(source).then(() => {
      if (disposed || viewer.isDestroyed()) {
        if (!viewer.isDestroyed()) viewer.dataSources.remove(source, true);
        return;
      }
      ready = true; draw(); update("Ferramenta temporária. Adicione pontos para definir o recorte.");
    }).catch(() => { if (!disposed) update("Não foi possível iniciar o editor temporário."); });
    return () => {
      stop(); disposed = true;
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", otherTool, true);
      removeRender(); handler.destroy();
      if (actions.current === api) actions.current = null;
      if (!tileset.isDestroyed() && changed) {
        if (originalConfig) { applyModelClipping(tileset, originalConfig).enabled = originalEnabled; }
        else if (tileset.clippingPolygons) { tileset.clippingPolygons.removeAll(); tileset.clippingPolygons.enabled = false; }
      }
      if (!viewer.isDestroyed()) { viewer.dataSources.remove(source, true); viewer.scene.requestRender(); }
    };
  }, [viewer, tileset]);

  const unavailable = !visible || !state.ready;
  return <section className="model-crop-dev" aria-label="Editor temporário de recorte 3D">
    <button type="button" disabled={unavailable} aria-expanded={open} onClick={() => { if (open && state.editing) actions.current?.cancel(); setOpen(!open); }}>Editar recorte 3D</button>
    {open && <>
      <small>Desenvolvimento · recorte apenas do Modelo 3D</small>
      <div className="model-crop-dev-actions">
        <button type="button" disabled={unavailable || state.editing} onClick={() => actions.current?.edit()}>Adicionar/Editar recorte</button>
        <button type="button" disabled={unavailable || !state.editing || state.count === 0} onClick={() => actions.current?.undo()}>Desfazer ponto</button>
        <button type="button" disabled={unavailable || !state.editing || state.count < 3} onClick={() => actions.current?.apply()}>Fechar polígono / Aplicar recorte</button>
        <button type="button" disabled={unavailable || !state.applied} aria-pressed={state.preview} onClick={() => actions.current?.preview()}>{state.preview ? "Desativar preview" : "Ativar preview"}</button>
        <button type="button" disabled={unavailable} onClick={() => actions.current?.clear()}>Limpar recorte</button>
        <button type="button" disabled={unavailable || !state.applied || state.editing} onClick={() => actions.current?.copy()}>Copiar coordenadas</button>
      </div>
      <p role="status">{state.message} {state.count} ponto(s).</p>
      {state.exported && <textarea aria-label="Configuração do recorte 3D" readOnly value={state.exported} onFocus={(event) => event.currentTarget.select()} />}
    </>}
  </section>;
}
