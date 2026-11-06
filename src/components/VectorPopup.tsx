import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Cartesian2, Entity, type Viewer } from "cesium";
import { findHomePopupEntity, homePopupPoint, readVectorPopup, resolveVectorPopupSelection, type VectorPopupActionLink } from "../cesium/vectorPopup";
import { isMobileLayout } from "./mobileTabs";
import { placePopup, type ScreenPoint } from "./popupPosition";
import { Icon } from "./icons";
import "./VectorPopup.css";

// Labels kept as raw source field names (e.g. STREAM_ID, COD_2) are technical IDs:
// still shown, but after the readable ones, under "Atributos da fonte".
export function isSourceField(label?: string) {
  return Boolean(label && /^[A-Z0-9_]+$/.test(label) && /[_\d]/.test(label));
}

const NO_ORIGINS: readonly string[] = [];

interface Props {
  viewer: Viewer | null;
  allowedOrigins?: readonly string[];
  onOpenPage?: (page: { action: VectorPopupActionLink; title: string; entity: Entity }) => void;
  // Increment to open the popup configured with popup.openOnHome (opening view and Home).
  homeRequest?: number;
}

export function VectorPopup({ viewer, allowedOrigins = NO_ORIGINS, onOpenPage, homeRequest = 0 }: Props) {
  const [popup, setPopup] = useState<ReturnType<typeof readVectorPopup>>(null);
  const popupRef = useRef<HTMLElement>(null);
  const clickRef = useRef<ScreenPoint | null>(null);
  // Pending openOnHome request: started at (ms), cancelled by any click on the map.
  const homePending = useRef<number | null>(null);
  useEffect(() => { if (homeRequest > 0) homePending.current = performance.now(); }, [homeRequest]);
  const [anchor, setAnchor] = useState<ScreenPoint | null>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; maxWidth: number; maxHeight: number } | null>(null);
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const canvas = viewer.canvas;
    const update = () => {
      const next = readVectorPopup(viewer.selectedEntity, viewer.clock.currentTime, allowedOrigins);
      setPopup(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      setAnchor(clickRef.current);
    };
    // Observe clicks without replacing Cesium's picking or input actions.
    const rememberPoint = (event: PointerEvent) => { homePending.current = null; clickRef.current = { x: event.clientX, y: event.clientY }; };
    // Opens once the feature is loaded and visible, after the terrain under the
    // view loads (so the anchor sits on the ground), or after 5 s at the latest.
    const openHomePopup = () => {
      const since = homePending.current;
      if (since === null || viewer.isDestroyed()) return;
      const entity = findHomePopupEntity(viewer, isMobileLayout());
      if (!entity || (!viewer.scene.globe.tilesLoaded && performance.now() - since < 5000)) return;
      homePending.current = null;
      clickRef.current = homePopupPoint(viewer, entity, viewer.clock.currentTime) ?? null;
      if (viewer.selectedEntity === entity) update();
      else viewer.selectedEntity = entity;
    };
    const clicked = (event: MouseEvent) => {
      clickRef.current = { x: event.clientX, y: event.clientY };
      if (!viewer.isDestroyed() && readVectorPopup(viewer.selectedEntity, viewer.clock.currentTime)) {
        const bounds = canvas.getBoundingClientRect();
        const hits = viewer.scene.drillPick(new Cartesian2(event.clientX - bounds.left, event.clientY - bounds.top));
        const entities = hits.map(hit => hit.id).filter((id): id is Entity => id instanceof Entity);
        const selected = resolveVectorPopupSelection(viewer.selectedEntity, entities, viewer.clock.currentTime);
        if (selected !== viewer.selectedEntity) viewer.selectedEntity = selected;
      }
      update();
    };
    canvas.addEventListener("pointerdown", rememberPoint);
    canvas.addEventListener("click", clicked);
    update();
    const remove = viewer.selectedEntityChanged.addEventListener(update);
    const removeTick = viewer.clock.onTick.addEventListener(() => { openHomePopup(); update(); });
    return () => {
      removeTick();
      remove();
      canvas.removeEventListener("pointerdown", rememberPoint);
      canvas.removeEventListener("click", clicked);
    };
  }, [viewer, allowedOrigins]);

  useLayoutEffect(() => {
    if (!popup || !viewer || viewer.isDestroyed() || !popupRef.current) return;
    const element = popupRef.current;
    const shell = element.closest(".app-shell");
    const controls = [...(shell?.querySelectorAll<HTMLElement>(".measurement-controls, .navigation-controls, .raster-legend-stack, .map-alert, .cesium-viewer-bottom, .temporal-timeline, .period-badge, .map-hint, .mobile-bar") ?? [])];
    const position = () => {
      if (viewer.isDestroyed()) return;
      const map = viewer.canvas.getBoundingClientRect();
      const bounds = { left: Math.max(0, map.left), top: Math.max(0, map.top), right: Math.min(window.innerWidth, map.right), bottom: Math.min(window.innerHeight, map.bottom) };
      const maxWidth = Math.max(0, Math.min(300, bounds.right - bounds.left - 24));
      const maxHeight = Math.max(0, bounds.bottom - bounds.top - 24);
      // Constrain before measuring so wrapping is included in collision checks.
      element.style.maxWidth = `${maxWidth}px`;
      element.style.maxHeight = `${maxHeight}px`;
      const rect = element.getBoundingClientRect();
      const obstacles = controls.filter(control => getComputedStyle(control).visibility !== "hidden")
        .map(control => control.getBoundingClientRect()).filter(control => control.width > 0 && control.height > 0);
      const point = anchor ?? { x: bounds.left + (bounds.right - bounds.left) / 2, y: bounds.top + 80 };
      const next = { ...placePopup(point, rect, bounds, obstacles), maxWidth, maxHeight };
      setPlacement(current => current && Object.keys(next).every(key => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
    };
    position();
    const observer = new ResizeObserver(position);
    [element, viewer.canvas, ...controls].forEach(control => observer.observe(control));
    window.addEventListener("resize", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); };
  }, [popup, anchor, viewer]);
  if (!popup) return null;
  const readable = popup.fields.filter(field => !isSourceField(field.label));
  const source = popup.fields.filter(field => isSourceField(field.label));
  const row = (field: { label?: string; value: string }, index: number) => <p key={index}>{field.label && <span className="vector-popup-label">{field.label}</span>}<span>{field.value}</span></p>;
  // Curated popups group fields: a heading before the first field of each section.
  const sectioned = (field: { label?: string; value: string; section?: string }, index: number, list: { section?: string }[]) => field.section && field.section !== list[index - 1]?.section
    ? <div key={index}><h4 className="vector-popup-section">{field.section}</h4>{row(field, index)}</div>
    : row(field, index);
  return <section ref={popupRef} className="vector-popup" style={placement ?? { visibility: "hidden" }} aria-label="Informações da feição" aria-live="polite">
    <button type="button" className="vector-popup-close" aria-label="Fechar informações" onClick={() => {
      if (viewer && !viewer.isDestroyed()) viewer.selectedEntity = undefined;
      setPopup(null);
    }}><Icon name="close" /></button>
    <strong className="vector-popup-title">{popup.title}</strong>
    {popup.notice && <p className="vector-popup-notice">{popup.notice}</p>}
    {readable.map(sectioned)}
    {source.length > 0 && <details className="vector-popup-source">
      <summary>Atributos da fonte</summary>
      {source.map(row)}
    </details>}
    {popup.actions.length > 0 && <div className="vector-popup-actions">
      {popup.actions.map(action => action.target === "tab"
        ? <a key={action.url + action.label} className="vector-popup-action" href={action.url} target="_blank" rel="noopener noreferrer">{action.label}</a>
        : <button key={action.url + action.label} type="button" className="vector-popup-action" onClick={() => {
          const entity = viewer && !viewer.isDestroyed() ? viewer.selectedEntity : undefined;
          if (entity && onOpenPage) onOpenPage({ action, title: popup.title, entity });
        }}>{action.label}</button>)}
    </div>}
  </section>;
}
