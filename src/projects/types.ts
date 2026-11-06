// Thematic data and transport format are separate: several themes share a loader.
export type LayerKind =
  | "raster"
  | "vector"
  | "basemap"
  | "orthomosaic"
  | "dtm"
  | "dsm"
  | "slope"
  | "solar-orientation"
  // Slope aspect (orientação de vertentes), a terrain derivative; not solar exposure.
  | "aspect"
  | "ndvi"
  | "multispectral"
  | "property-boundary"
  | "drainage"
  | "contours"
  | "3d-tiles";

// Geographic rectangles use longitude/latitude degrees.
export type GeographicBounds = [west: number, south: number, east: number, north: number];

export type LayerSource =
  | { format: "3d-tiles"; source?: "url"; url: string; clipping?: ModelClippingConfig; heightOffsetMeters?: number; terrainCutout?: boolean }
  | { format: "3d-tiles"; source: "ion"; assetId: number; tokenEnv?: string; clipping?: ModelClippingConfig; heightOffsetMeters?: number; terrainCutout?: boolean }
  | {
    format: "ion-world-imagery";
    fallback: { url: string; credit: string; maximumLevel: number };
  }
  | {
    format: "xyz" | "tms";
    url: string;
    credit: string;
    // Imagery tile zoom levels, independent of camera height/navigation limits.
    minimumLevel?: number;
    maximumLevel?: number;
    bounds?: GeographicBounds;
    tileWidth?: number;
    tileHeight?: number;
  }
  | {
    format: "geojson";
    url: string;
    // Optional attribution (GeoJsonDataSource credit). Cesium shows it while the
    // layer is loaded, even when switched off: hidden vectors stay attached.
    credit?: string;
    // Explicit opt-in for simulated drainage only; requires kind: "drainage".
    symbology?: "simulated-drainage-strahler";
    autoZoom?: boolean;
    popup?: VectorPopupConfig;
    // Macro context layers: curated popup preset from src/projects/macroPopups.ts
    // (Andrelândia reference). Replaces popup. Without it a macro layer shows no
    // attributes and, in development only, a "not configured" notice.
    macroPopup?: MacroPopupPreset;
    ignoreAltitude?: boolean;
    uniqueFeatureIds?: boolean;
    style?: {
      stroke: string;
      strokeWidth: number;
      outline?: { property: string; width: number; colors: string[]; fallbackColor?: string };
      polygonOutline?: boolean;
      classification?: {
        property: string;
        classes: Record<string, { fill?: string; fillOpacity?: number; stroke?: string; strokeWidth?: number; zIndex?: number }>;
      };
      fill?: string;
      fillOpacity?: number;
      clampToGround?: boolean;
      zIndex?: number;
    };
  };

export interface ProjectLayerConfig {
  id: string;
  name: string;
  description: string;
  kind: LayerKind;
  source: LayerSource;
  defaultVisible: boolean;
  // Initial visibility in the mobile layout (bottom bar, max-width 760px).
  // Default: defaultVisible. Only the opening changes; the panel still toggles the layer.
  defaultVisibleMobile?: boolean;
  // Position inside its panel section, ascending. Layers without it follow in
  // array order. Panel only: map stacking still follows the layers array.
  panelOrder?: number;
  opacityControl?: boolean;
  legend?: LegendConfig;
  // "external": legend card from `legend`. "embedded": the scale is drawn into
  // the raster, no card and no notice. "none": the layer needs no legend.
  // A thematic raster with neither legend nor legendMode gets a notice in
  // development only (npm run dev), never in a production build.
  legendMode?: "external" | "embedded" | "none";
  // Panel section. Temporal campaigns default to "basemap", where they form
  // one switch whose period is chosen on the timeline.
  group?: "basemap" | "raster" | "vector" | "model" | "macro";
  subsection?: string;
  exclusiveGroup?: string;
  // Opt in only on configured XYZ/TMS overlays. One temporal series per project.
  // comparisonLabel "2024 — Pré-obra" splits into year and period on the timeline.
  // eventAfter marks an event recorded between this campaign and the next one.
  temporalCampaign?: { label: string; description: string; comparisonLabel?: string; eventAfter?: string };
}

// Popup button that opens an external page, e.g. a 3D simulation of a plot.
// The URL is fixed (url) or read from a feature property (urlProperty), so each
// feature can decide whether the button appears. Only https URLs whose origin is
// listed in ProjectConfig.embeddedPages.allowedOrigins are offered.
export interface VectorPopupAction {
  label: string;
  url?: string;
  urlProperty?: string;
  // "overlay" (default) opens the page over the map; "tab" opens a new tab.
  target?: "overlay" | "tab";
  // Overlay only: false (default) keeps the camera, true flies to the feature,
  // "home" flies to the Home view before opening.
  flyTo?: boolean | "home";
  // Overlay only, on close: "keep" (default) puts the camera back exactly where it
  // was when the page opened, without animation; "home" jumps to initialCamera.
  onClose?: "keep" | "home";
}

// Curated popups of the macro context layers (src/projects/macroPopups.ts).
export type MacroPopupPreset =
  | "municipality" | "climate" | "geology" | "geomorphology" | "soils" | "vegetation"
  | "ana-hydrography" | "ana-basin" | "simulated-basins" | "simulated-drainage";

export interface VectorPopupConfig {
  actions?: VectorPopupAction[];
  // "curated": only the listed fields, in order, with units, sections,
  // valueLabels and ratioTo (src/cesium/curatedPopup.ts). Used by macroPopup.
  presentation?: "curated";
  // Development-only line under the title (e.g. macro layer without a preset).
  notice?: string;
  // Open this popup on its own at the opening view and after Home, over the
  // layer's first feature, while the layer is visible. One layer per project;
  // the first configured one wins. "desktop": only outside the mobile layout.
  // Default false. A tap on the feature always opens the popup.
  openOnHome?: boolean | "desktop";
  title?: string;
  titleProperty?: string;
  titlePrefix?: string;
  titleSuffix?: string;
  fields: {
    property: string;
    // Curated popups only: heading shown before the first field of each section.
    section?: string;
    // Curated popups only: display unit; texts like "1.2 km" are converted to it.
    unit?: "m" | "km" | "ha" | "km²";
    // Curated popups only: value / ratioTo × 100 (percentage of another field).
    ratioTo?: string;
    // Curated popups only: replaces a source value with a readable text.
    valueLabels?: Record<string, string>;
    label?: string;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    format?: "integer" | "decimal";
    numberFormat?: { locale: string; decimalPlaces: number };
  }[];
}

// Geographic polygon vertices in longitude/latitude degrees, without a repeated closing vertex.
export interface ModelClippingConfig {
  enabled?: boolean;
  inverse: boolean;
  positions: [longitude: number, latitude: number][];
}

// Navigation limit derived from ProjectConfig.bounds.
export interface NavigationConfig {
  // Default true when bounds exist.
  enabled?: boolean;
  // Margin on each side as a fraction of the largest bounds dimension. Default 0.25.
  marginRatio?: number;
  // Maximum camera height above the ground, in meters. Default: twice the
  // largest side of the area with margin, at least 2000 m.
  maximumZoomDistance?: number;
}

// Position and orientation angles are degrees; height is meters above the ellipsoid.
export interface CameraConfig {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

export type WorkspaceSectionId = "basemap" | "raster" | "vector" | "model" | "macro";

// Layer panel presentation. Every option keeps the current behavior when omitted.
export interface PanelConfig {
  // Show the "Buscar camada" field. Default false.
  showLayerSearch?: boolean;
  // Section order. Sections left out follow in the default order
  // (basemap, model, raster, vector, macro), so none disappears.
  sectionOrder?: WorkspaceSectionId[];
  // Sections that start open in addition to those with an active layer.
  // Default ["model"]; [] keeps only active sections open.
  // Only the section opens; no layer is turned on.
  expandedSections?: WorkspaceSectionId[];
  // Section titles. Default: Mapa base, Modelo 3D, Rasters, Vetores,
  // Análise Macro. Only the visible text changes; ids stay the same.
  sectionTitles?: Partial<Record<WorkspaceSectionId, string>>;
}

// Texts of the temporal series (only shown when the project has campaigns).
export interface TemporalLabels {
  // Timeline heading. Default "Evolução da paisagem".
  timelineTitle?: string;
  // Name of the single campaign switch in the panel. Default "Ortomosaico".
  layerName?: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  location: string;
  // Project area [W, S, E, N] in degrees. It defines the navigation limit;
  // when absent there is no limit (e.g. the template's neutral globe view).
  bounds?: GeographicBounds;
  navigation?: NavigationConfig;
  initialCamera: CameraConfig;
  layers: ProjectLayerConfig[];
  scenes?: QuickScene[];
  diagnostic?: { steps: DiagnosticStep[] };
  temporalComparison?: TemporalComparisonSelection;
  temporalLabels?: TemporalLabels;
  panel?: PanelConfig;
  // Origins allowed for popup actions (exact scheme + host + port, https only).
  // Without it no action button is shown.
  embeddedPages?: { allowedOrigins: string[] };
  developmentTools?: { modelAlignment?: boolean; cropAuthoring?: boolean; cameraCapture?: boolean };
}

export interface QuickScene {
  id: string;
  label: string;
  description?: string;
  // Exact visible set, including the basemap when wanted.
  layerIds: string[];
  // Optional saved view (same format as initialCamera); the scene flies there.
  camera?: CameraConfig;
}

export interface DiagnosticStep {
  title: string;
  text: string;
  layerIds?: string[];
  facts?: { label: string; value: string }[];
  references?: string[];
}

export interface TemporalComparisonSelection {
  left: string;
  right: string;
}

export type LayerStatus = "idle" | "loading" | "ready" | "fallback" | "error";

export type LegendConfig = GradientLegendConfig | ImageLegendConfig;

export interface ImageLegendConfig {
  type: "image";
  title: string;
  imageUrl: string;
  imageAlt: string;
}

export interface GradientLegendConfig {
  type?: "gradient";
  title: string;
  min: number;
  max: number;
  tickValues: number[];
  decimalPlaces?: number;
  // Percentage positions run from the minimum (bottom) to maximum (top).
  gradientStops: { position: number; color: string }[];
}
