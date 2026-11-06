import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appTitle } from "./appTitle";
import { projects } from "./projects";
import { LayerPanel } from "./components/LayerPanel";
import { Legend, MissingLegend } from "./components/Legend";
import { legendMissing, legendMissingText } from "./components/legendStatus";
import { NavigationControls } from "./components/NavigationControls";
import { MeasurementToolbar } from "./components/MeasurementToolbar";
import { VectorPopup } from "./components/VectorPopup";
import { ModeSwitcher, type MapMode } from "./components/ModeSwitcher";
import { DiagnosticJourney } from "./components/DiagnosticJourney";
import { TemporalComparison } from "./components/TemporalComparison";
import { AboutDialog } from "./components/AboutDialog";
import { PeriodBadge } from "./components/PeriodBadge";
import { TemporalSelector } from "./components/TemporalSelector";
import { canCompare } from "./components/temporal";
import { DEFAULT_TEMPORAL_LAYER_NAME } from "./components/LayerPanel";
import { Icon } from "./components/icons";
import { activeMobileView as resolveMobileView, initialMobileState, isMobileLayout, shownMobileTabs, type MobileView } from "./components/mobileTabs";
import { configuredVisibility, defaultLayerIds, isTemporalLayer } from "./projects/layerVisibility";
import { applyProjectCamera, beginManagedFlight, captureCamera, flyToCamera, flyToCameraSettled, restoreCamera, type CameraSnapshot } from "./cesium/projectCamera";
import { HeadingPitchRange, Math as CesiumMath, type Entity } from "cesium";
import { opensOnHome, type VectorPopupActionLink } from "./cesium/vectorPopup";

import { useCesiumViewer } from "./hooks/useCesiumViewer";
import { useProjectLayers } from "./hooks/useProjectLayers";
import { useNavigationLimits } from "./hooks/useNavigationLimits";
import type { ProjectConfig, TemporalComparisonSelection } from "./projects/types";

const ModelDevelopmentTools = import.meta.env.DEV ? lazy(() => import("./components/ModelDevelopmentTools")) : null;
const CameraCapturePanel = import.meta.env.DEV ? lazy(() => import("./components/CameraCapturePanel")) : null;
const EmbeddedPageOverlay = lazy(() => import("./components/EmbeddedPageOverlay"));

// Layout at load time: the mobile opening uses defaultVisibleMobile.
function defaultVisibility(project: ProjectConfig) {
  return configuredVisibility(project.layers, defaultLayerIds(project.layers, isMobileLayout()));
}

// popup.openOnHome for the current layout (checked at the opening and at each Home).
function homePopupActive(project: ProjectConfig) {
  const mobile = isMobileLayout();
  return project.layers.some(layer => layer.source.format === "geojson" && opensOnHome(layer.source.popup, mobile));
}

export function App() {
  const project = projects[0];
  const [visible, setVisible] = useState(() => defaultVisibility(projects[0]));
  // Mobile panel (open) and desktop panel (collapsed) are UI state only.
  // Mobile: "Camadas" opens the bottom sheet; the other tabs choose what sits
  // over the map. Default tab: "Tempo" with campaigns, otherwise "Camadas".
  const hasCampaigns = project.layers.some(isTemporalLayer);
  // popup.openOnHome: open that popup at the opening view and after every Home.
  const [hasHomePopup] = useState(() => homePopupActive(project));
  const homePopupConfigured = project.layers.some(layer => layer.source.format === "geojson" && layer.source.popup?.openOnHome);
  const [homePopupRequest, setHomePopupRequest] = useState(() => hasHomePopup ? 1 : 0);
  const [panelOpen, setPanelOpen] = useState(() => initialMobileState(hasCampaigns, hasHomePopup).panelOpen);
  const [sheetHigh, setSheetHigh] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView | null>(() => initialMobileState(hasCampaigns, hasHomePopup).view);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [modelHint, setModelHint] = useState(false);
  const modelHintShown = useRef(false);
  const [mode, setMode] = useState<MapMode>("explore");
  const [diagnosticStep, setDiagnosticStep] = useState(0);
  const [comparison, setComparison] = useState<TemporalComparisonSelection | null>(null);
  const [page, setPage] = useState<{ url: string; title: string } | null>(null);
  // Camera when the page opened and what to do with it on close (action.onClose).
  const pageCamera = useRef<{ snapshot: CameraSnapshot; onClose: "keep" | "home" } | null>(null);
  // DEV capture panel only: frame views at the edge of the navigation limit.
  const [ignoreLimits, setIgnoreLimits] = useState(false);
  const captureEnabled = Boolean(CameraCapturePanel && project.developmentTools?.cameraCapture);
  const campaigns = project.layers.filter(isTemporalLayer);
  const diagnosticSteps = project.diagnostic?.steps ?? [];
  useEffect(() => { document.title = appTitle(project.name); }, [project.name]);
  // Comparison is temporary: exiting restores the simple temporal selection.
  const displayVisible = useMemo(() => {
    if (!comparison) return visible;
    const next = new Set(visible);
    for (const layer of project.layers) if (isTemporalLayer(layer)) next.delete(layer.id);
    next.add(comparison.left);
    next.add(comparison.right);
    return next;
  }, [visible, comparison, project]);
  const { containerRef, viewer, error } = useCesiumViewer(Boolean(project.developmentTools?.cameraCapture));
  const { statuses, mapWarning, rasterOpacities, setRasterOpacity, getModel } = useProjectLayers(viewer, project, displayVisible, comparison);
  const navigationArea = useNavigationLimits(viewer, project, captureEnabled && ignoreLimits);
  const legendLayers = project.layers.filter((layer) => layer.legend && layer.legendMode !== "embedded" && layer.legendMode !== "none" && displayVisible.has(layer.id));
  const missingLegendLayers = project.layers.filter((layer) => displayVisible.has(layer.id) && legendMissing(layer));
  const legendCount = legendLayers.length + missingLegendLayers.length;
  const [legendOpen, setLegendOpen] = useState(true);
  const shownTabs = shownMobileTabs(hasCampaigns, legendCount);
  const activeMobileView = resolveMobileView(mobileView, hasCampaigns, legendCount);

  function showMobileView(view: MobileView) {
    setPanelOpen(false);
    setMobileView(view);
  }
  const modelVisible = project.layers.some(layer => layer.source.format === "3d-tiles" && displayVisible.has(layer.id));

  // Popup action: fly to the feature (its polygon when the click hit an outline helper), then open the page.
  async function openPage({ action, title, entity }: { action: VectorPopupActionLink; title: string; entity: Entity }) {
    if (action.target === "tab") { window.open(action.url, "_blank", "noopener"); return; }
    if (viewer && !viewer.isDestroyed()) {
      viewer.selectedEntity = undefined;
      if (action.flyTo === "home") {
        await flyToCameraSettled(viewer, project.initialCamera, 1.6);
      } else if (action.flyTo) {
        const target = entity.parent?.polygon ? entity.parent : entity;
        const end = beginManagedFlight(viewer);
        try {
          await viewer.flyTo(target, { duration: 1.6, offset: new HeadingPitchRange(viewer.camera.heading, CesiumMath.toRadians(-45), 0) });
        } finally { end(); }
      }
    }
    pageCamera.current = viewer && !viewer.isDestroyed() ? { snapshot: captureCamera(viewer), onClose: action.onClose } : null;
    setPage({ url: action.url, title });
  }

  // Closing the page never animates: "keep" restores the pose saved at opening
  // (only if something moved it), "home" jumps to the opening view.
  const closePage = useCallback(() => {
    const saved = pageCamera.current;
    pageCamera.current = null;
    setPage(null);
    if (!saved || !viewer || viewer.isDestroyed()) return;
    if (saved.onClose === "home") applyProjectCamera(viewer, project);
    else restoreCamera(viewer, saved.snapshot);
  }, [viewer, project]);

  function toggleLayer(id: string) {
    if (comparison && campaigns.some(layer => layer.id === id)) return;
    const layer = project.layers.find(item => item.id === id);
    // First model activation of the session explains navigation on the map itself.
    if (layer?.source.format === "3d-tiles" && !visible.has(id) && !modelHintShown.current) {
      modelHintShown.current = true;
      setModelHint(true);
    }
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return configuredVisibility(project.layers, next);
    });
  }

  function applyScene(layerIds: string[]) {
    setComparison(null);
    setVisible(configuredVisibility(project.layers, layerIds));
  }

  function changeDiagnosticStep(index: number) {
    const step = diagnosticSteps[index];
    if (!step) return;
    setDiagnosticStep(index);
    if (step.layerIds) applyScene(step.layerIds);
  }

  function changeMode(next: MapMode) {
    setComparison(null);
    setMode(next);
    if (next === "diagnostic") changeDiagnosticStep(0);
  }

  return (
    <main className="app-shell" data-panel={panelCollapsed ? "collapsed" : undefined} data-mobile-view={activeMobileView ?? undefined}>
      <div ref={containerRef} className="map-container" aria-label="Mapa 3D interativo do projeto" />
      {comparison && viewer && <TemporalComparison viewer={viewer} layers={project.layers} selection={comparison}
        visible={displayVisible} statuses={statuses} rasterOpacities={rasterOpacities} drawerOpen={panelOpen} modelVisible={modelVisible} />}
      <header className="app-header">
        <a className="brand" href="/" aria-label="Página inicial do Cardeal Map">
          <img src="/logo-cardeal.png" alt="" />
          <strong className="brand-company">Cardeal Map</strong>
        </a>
        <span className="brand-project">{project.name} · {project.location}</span>
        <div className="header-actions">
          {diagnosticSteps.length > 0 && <ModeSwitcher mode={mode} onChange={changeMode} />}
          <button type="button" className="header-button header-panel-toggle" aria-controls="layer-panel" aria-expanded={!panelCollapsed}
            onClick={() => setPanelCollapsed(!panelCollapsed)} title={panelCollapsed ? "Mostrar painel de camadas" : "Recolher painel de camadas"}>
            <Icon name="panelLeft" /><span>Camadas</span>
          </button>
          <button type="button" className="header-button" aria-haspopup="dialog" onClick={() => setAboutOpen(true)} aria-label="Sobre os dados">
            <Icon name="info" /><span>Sobre os dados</span>
          </button>
        </div>
      </header>
      {mode === "diagnostic" && diagnosticSteps.length > 0 && <DiagnosticJourney steps={diagnosticSteps}
        stepIndex={diagnosticStep} onStepChange={changeDiagnosticStep} onExplore={() => changeMode("explore")} />}
      {panelOpen && <button type="button" className="sheet-backdrop" aria-label="Fechar painel de camadas" onClick={() => setPanelOpen(false)} />}
      <aside id="layer-panel" aria-label="Camadas do projeto" className={`layer-panel ${panelOpen ? "is-open" : ""} ${sheetHigh ? "is-high" : ""}`}>
        <LayerPanel project={project} statuses={statuses} visible={displayVisible} rasterOpacities={rasterOpacities} onOpacityChange={setRasterOpacity} onToggle={toggleLayer} onClose={() => setPanelOpen(false)}
          onCollapse={() => setPanelCollapsed(true)} sheetHigh={sheetHigh} onToggleSheetHeight={() => setSheetHigh(!sheetHigh)}
          scenes={project.scenes} onApplyScene={scene => {
            setMode("explore");
            applyScene(scene.layerIds);
            if (scene.camera && viewer && !error) flyToCamera(viewer, scene.camera);
          }}
          comparing={Boolean(comparison)} />
      </aside>
      {/* Time controls exist only when the project has campaigns; otherwise both render nothing.
          While comparing, the "Antes | Depois" labels take the badge's place. */}
      {!comparison && <PeriodBadge layers={project.layers} visible={displayVisible} statuses={statuses}
        layerName={project.temporalLabels?.layerName ?? DEFAULT_TEMPORAL_LAYER_NAME} />}
      <TemporalSelector layers={project.layers} visible={displayVisible} statuses={statuses} onToggle={toggleLayer}
        title={project.temporalLabels?.timelineTitle} comparison={comparison} onComparisonChange={setComparison}
        onCompare={canCompare(project) && viewer && !error ? () => {
          setMode("explore");
          setComparison(project.temporalComparison ?? null);
          showMobileView("time");
        } : undefined} onExitComparison={() => setComparison(null)} />
      <div className="map-tools">
        <NavigationControls viewer={viewer} homeCamera={project.initialCamera} disabled={Boolean(error)} area={navigationArea}
          onHome={homePopupConfigured ? () => {
            if (!homePopupActive(project)) return;
            setPanelOpen(false);
            setHomePopupRequest(request => request + 1);
          } : undefined} />
        <MeasurementToolbar viewer={viewer} disabled={Boolean(error)} />
      </div>
      <VectorPopup viewer={viewer} allowedOrigins={project.embeddedPages?.allowedOrigins} onOpenPage={openPage} homeRequest={homePopupRequest} />
      {page && <Suspense fallback={null}><EmbeddedPageOverlay url={page.url} title={page.title} onClose={closePage} /></Suspense>}
      {ModelDevelopmentTools && (project.developmentTools?.modelAlignment || project.developmentTools?.cropAuthoring) &&
        <Suspense fallback={null}>
          {project.layers.filter(layer => layer.source.format === "3d-tiles" && visible.has(layer.id)).map(layer =>
            <ModelDevelopmentTools key={layer.id} viewer={viewer} tileset={getModel(layer.id)} alignment={Boolean(project.developmentTools?.modelAlignment)} crop={Boolean(project.developmentTools?.cropAuthoring)} />)}
        </Suspense>}
      {CameraCapturePanel && captureEnabled && <Suspense fallback={null}>
        <CameraCapturePanel viewer={viewer} scenes={project.scenes ?? []} hasLimit={Boolean(project.bounds) && project.navigation?.enabled !== false}
          ignoreLimits={ignoreLimits} onIgnoreLimitsChange={setIgnoreLimits} />
      </Suspense>}
      {modelHint && modelVisible && <div className="map-hint" role="status">
        <Icon name="box" />
        <p>
          <span className="desktop-only">Arraste para girar · Ctrl + arrastar inclina · role para aproximar</span>
          <span className="mobile-only">Use gestos de toque para girar, inclinar e aproximar a vista.</span>
        </p>
        <button type="button" aria-label="Fechar dica de navegação" onClick={() => setModelHint(false)}><Icon name="close" size={16} /></button>
      </div>}
      {(error || mapWarning) && <div role="alert" className="map-alert">{error || mapWarning}</div>}
      {!viewer && !error && <div role="status" className="map-alert">Iniciando o visualizador 3D…</div>}
      {/* Nothing to show (no legends, or only scales drawn into the rasters): no card and no button. */}
      {legendCount > 0 && <div className="raster-legend-stack" role="group" aria-label="Legendas das camadas visíveis">
        <div className="raster-legend-stack-items" id="legend-items" hidden={!legendOpen}>
          {legendLayers.map((layer) => layer.legend && <Legend key={layer.id} {...layer.legend} visibility={displayVisible.has(layer.id)} />)}
          {missingLegendLayers.map((layer) => <MissingLegend key={layer.id} title={layer.name} message={legendMissingText} />)}
        </div>
        <button type="button" className="legend-toggle" aria-controls="legend-items" aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}>
          Legenda · {legendCount}
          <Icon name="chevronDown" size={14} />
        </button>
      </div>}
      <nav className="mobile-bar" aria-label="Ferramentas do mapa">
        <button type="button" aria-pressed={panelOpen} aria-controls="layer-panel" onClick={() => setPanelOpen(!panelOpen)}>
          <span><Icon name="layers" size={20} /></span>Camadas
        </button>
        {shownTabs.map(tab => <button key={tab.id} type="button" aria-pressed={!panelOpen && activeMobileView === tab.id} onClick={() => showMobileView(tab.id)}>
          <span><Icon name={tab.icon} size={20} /></span>{tab.label}
        </button>)}
      </nav>
      <AboutDialog project={project} open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </main>
  );
}
