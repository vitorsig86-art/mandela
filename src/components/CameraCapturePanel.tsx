import { useEffect, useId, useState } from "react";
import type { Viewer } from "cesium";
import { boundsSnippet, captureCamera, captureViewBounds, initialCameraSnippet, sceneCameraSnippet } from "../cesium/captureCamera";
import type { QuickScene } from "../projects/types";
import "./CameraCapturePanel.css";

interface Props {
  viewer: Viewer | null;
  scenes: QuickScene[];
  hasLimit: boolean;
  ignoreLimits: boolean;
  onIgnoreLimitsChange: (ignore: boolean) => void;
}

// Development only (import.meta.env.DEV and developmentTools.cameraCapture).
// Each button copies a snippet for src/projects/<slug>.ts and shows it here.
export default function CameraCapturePanel({ viewer, scenes, hasLimit, ignoreLimits, onIgnoreLimitsChange }: Props) {
  const [open, setOpen] = useState(true);
  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? "");
  const [output, setOutput] = useState("");
  const [message, setMessage] = useState("Enquadre a vista e escolha o que capturar.");
  const selectId = useId();
  const unavailable = !viewer || viewer.isDestroyed();

  useEffect(() => {
    if (!scenes.some(scene => scene.id === sceneId)) setSceneId(scenes[0]?.id ?? "");
  }, [scenes, sceneId]);

  function publish(text: string) {
    setOutput(text);
    if (!navigator.clipboard?.writeText) { setMessage("Selecione e copie o texto abaixo."); return; }
    navigator.clipboard.writeText(text).then(
      () => setMessage("Copiado. Cole em src/projects/<slug>.ts."),
      () => setMessage("Selecione e copie o texto abaixo."),
    );
  }

  function captureHome() {
    if (viewer && !viewer.isDestroyed()) publish(initialCameraSnippet(captureCamera(viewer)));
  }

  function captureScene() {
    if (viewer && !viewer.isDestroyed()) publish(sceneCameraSnippet(sceneId || "<id-da-cena>", captureCamera(viewer)));
  }

  function captureBounds() {
    if (!viewer || viewer.isDestroyed()) return;
    const bounds = captureViewBounds(viewer);
    if (!bounds) { setOutput(""); setMessage("A vista não mostra o terreno. Aproxime ou incline menos a câmera."); return; }
    if (bounds[0] > bounds[2]) { setOutput(""); setMessage("A vista cruza o antimeridiano; enquadre só a área do projeto."); return; }
    publish(boundsSnippet(bounds));
  }

  return <section className="camera-capture-dev" aria-label="Captura de câmera em desenvolvimento">
    <button type="button" className="camera-capture-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>Captura de câmera (dev)</button>
    {open && <>
      <div className="camera-capture-actions">
        <button type="button" disabled={unavailable} onClick={captureHome}>Capturar Home</button>
        <div className="camera-capture-scene">
          <label htmlFor={selectId}>Cena</label>
          <select id={selectId} value={sceneId} onChange={event => setSceneId(event.currentTarget.value)} disabled={!scenes.length}>
            {scenes.length ? scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)
              : <option value="">Nenhuma cena configurada</option>}
          </select>
          <button type="button" disabled={unavailable} onClick={captureScene}>Capturar cena</button>
        </div>
        <button type="button" disabled={unavailable} onClick={captureBounds}>Capturar bounds da vista</button>
      </div>
      <label className="camera-capture-ignore">
        <input type="checkbox" checked={ignoreLimits} disabled={!hasLimit} onChange={event => onIgnoreLimitsChange(event.currentTarget.checked)} />
        Ignorar limite de navegação{!hasLimit && " (sem bounds)"}
      </label>
      <p role="status">{message}</p>
      {output && <textarea aria-label="Trecho capturado" readOnly value={output} onFocus={event => event.currentTarget.select()} />}
    </>}
  </section>;
}
