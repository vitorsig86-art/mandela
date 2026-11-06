import type { GeographicBounds, ProjectConfig, ProjectLayerConfig } from "./types";

// Illustrative W/S/E/N raster extent in degrees for the inactive examples.
const bounds: GeographicBounds = [-1, -1, 1, 1];
const basemap: ProjectLayerConfig = {
  id: "basemap", name: "Bing Aerial com rótulos", description: "Bing Maps via Cesium ion", kind: "basemap",
  source: {
    format: "ion-world-imagery",
    fallback: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      credit: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
      maximumLevel: 19,
    },
  },
  defaultVisible: true,
};

// EDIT URLs, bounds, zoom levels, labels and legends, then add the configured
// entries to templateProject.layers. example.invalid is reserved for examples.
// Confirmed edge tile 404/410 errors are recoverable automatically.
export const exampleLayers: ProjectLayerConfig[] = [{
  id: "raster-example-a", name: "Raster A", description: "Descrição do seu raster", kind: "raster",
  source: {
    format: "tms", url: "https://example.invalid/raster-a/{z}/{x}/{reverseY}.png",
    credit: "Seu projeto", bounds, minimumLevel: 0, maximumLevel: 8,
    tileWidth: 256, tileHeight: 256,
  },
  defaultVisible: false,
  legend: { type: "image", title: "Raster A", imageUrl: "/legends/example.png", imageAlt: "Legenda ilustrativa; substitua pelos valores do seu raster" },
}, {
  id: "raster-example-b", name: "Raster B", description: "Segundo raster independente", kind: "raster",
  source: {
    format: "tms", url: "https://example.invalid/raster-b/{z}/{x}/{reverseY}.png",
    credit: "Seu projeto", bounds, minimumLevel: 0, maximumLevel: 8,
    tileWidth: 256, tileHeight: 256,
  },
  defaultVisible: false,
  legend: { type: "image", title: "Raster B", imageUrl: "/legends/example.png", imageAlt: "Legenda ilustrativa do segundo raster" },
}, {
  id: "vector-example", name: "Vetor", description: "Descrição do seu vetor", kind: "vector",
  source: {
    format: "geojson", url: "https://example.invalid/vector.geojson", autoZoom: false,
    style: { stroke: "#ff0000", strokeWidth: 3, fill: "#00000000", clampToGround: true, zIndex: 1 },
  },
  defaultVisible: false,
}, {
  id: "model-example", name: "Modelo 3D", description: "Descrição do seu modelo", kind: "3d-tiles",
  source: { format: "3d-tiles", source: "url", url: "https://example.invalid/tileset.json" },
  defaultVisible: false,
}];

export const templateProject: ProjectConfig = {
  id: "seu-projeto", name: "Nome do projeto", location: "Município, UF",
  // No project bounds: the neutral globe view has no navigation limit.
  // A project sets bounds: [W, S, E, N] (and optionally navigation) to enable it.
  // EDIT: neutral globe view. Capture your final opening/Home view.
  // Angles in degrees, height in meters above the ellipsoid.
  initialCamera: { longitude: 0, latitude: 0, height: 20000000, heading: 0, pitch: -90, roll: 0 },
  // Examples are excluded: the stable loader eagerly loads rasters/vectors,
  // even when defaultVisible is false. A fresh clone never requests placeholders.
  layers: [basemap],
  // Optional UI has no data or presets in a fresh template. A scene may carry
  // a saved view: { id, label, layerIds, camera: { longitude, latitude, height, heading, pitch, roll } }.
  scenes: [],
  diagnostic: { steps: [] },
  // temporalComparison: { left: "configured-period-a", right: "configured-period-b" },
  // Popup actions open only pages from these origins (https, exact origin):
  // embeddedPages: { allowedOrigins: ["https://your-simulation.example.invalid"] },
  // Add temporalCampaign to configured XYZ/TMS overlays to show the selector.
  developmentTools: { modelAlignment: false, cropAuthoring: false, cameraCapture: false },
};

// Palette of the microbasins example, indexed by the "cor" attribute (0 to 9).
export const microbasinColors = ["#E6194B", "#3CB44B", "#FFE119", "#4363D8", "#F58231", "#911EB4", "#42D4F4", "#F032E6", "#BFEF45", "#FABED4"];

// Fill and outline in the color of "cor". The class stroke is only a fallback
// when "cor" comes as text ("3"): the outline uses the numeric index, the
// classification accepts both.
const microbasinsExample: ProjectLayerConfig = {
  id: "microbasins-example", name: "Microbacias", description: "Microbacias", kind: "vector", defaultVisible: false, panelOrder: 3, opacityControl: true,
  source: {
    format: "geojson", url: "https://example.invalid/geojson/microbacias.geojson", autoZoom: false,
    style: {
      stroke: "#FFFFFF", strokeWidth: 1.5, fillOpacity: 0.35, clampToGround: true, zIndex: 3,
      classification: { property: "cor", classes: Object.fromEntries(microbasinColors.map((color, index) => [String(index), { fill: color, stroke: color }])) },
      outline: { property: "cor", colors: microbasinColors, width: 1.5 },
    },
    popup: { titleProperty: "nome", fields: [
      { property: "area_ha", label: "Área", decimals: 2, suffix: " ha" },
      { property: "perimetro_km", label: "Perímetro", decimals: 2, suffix: " km" },
    ] },
  },
};

const contoursExample = (id: string, name: string, file: string, panelOrder: number): ProjectLayerConfig => ({
  id, name, description: name, kind: "contours", defaultVisible: false, exclusiveGroup: "curvas", panelOrder,
  source: {
    format: "geojson", url: `https://example.invalid/geojson/${file}`, autoZoom: false,
    style: { stroke: "#000000", strokeWidth: 1, clampToGround: true, zIndex: 5 },
    popup: { title: "Curva de nível", fields: [{ property: "cota_m", label: "Cota", suffix: " m", format: "integer" }] },
  },
});

// Study area (--tipo generico) with the 3D simulation button. Orange, so it is
// not mistaken for the yellow parcels. On at the desktop opening, off on mobile.
// The popup never opens on its own (no popup.openOnHome): only on click or tap.
// The page opens without moving the camera (flyTo false) and the camera stays
// where it was on close (onClose "keep"). Its origin must be listed in
// ProjectConfig.embeddedPages.allowedOrigins.
const studyAreaExample: ProjectLayerConfig = {
  id: "study-area-example", name: "Área de Estudo", description: "Simulação 3D ilustrativa", kind: "vector",
  defaultVisible: true, defaultVisibleMobile: false, panelOrder: 1, opacityControl: true,
  source: {
    format: "geojson", url: "https://example.invalid/geojson/area_estudo.geojson", autoZoom: false,
    style: { stroke: "#FF6A00", strokeWidth: 3, fill: "#FF6A00", fillOpacity: 0.18, clampToGround: true, zIndex: 25 },
    popup: {
      titleProperty: "nome",
      fields: [
        { property: "area_ha", label: "Área", decimals: 2, suffix: " ha" },
        { property: "perimetro_km", label: "Perímetro", decimals: 2, suffix: " km" },
      ],
      actions: [{ label: "Entrar na simulação 3D", url: "https://your-simulation.example.invalid/", flyTo: false, onClose: "keep" }],
    },
  },
};

// Additional v2 examples are deliberately inactive. Replace all placeholders
// before adding them to templateProject.layers. These are synthetic categories.
export const thematicExamples: ProjectLayerConfig[] = [
  {
    id: "areas-example", name: "Áreas temáticas", description: "Classes ilustrativas", kind: "vector", defaultVisible: false, opacityControl: true,
    source: {
      format: "geojson", url: "https://example.invalid/areas.geojson", autoZoom: false, uniqueFeatureIds: true,
      style: {
        stroke: "#32404A", strokeWidth: 3, fill: "#B6C3CF", fillOpacity: 0.35, clampToGround: true, zIndex: 1,
        classification: { property: "class_code", classes: { A: { fill: "#285F9E" }, B: { fill: "#C68524" } } },
        outline: { property: "color_index", colors: ["#285F9E", "#C68524", "#6B4E99"], width: 3, fallbackColor: "#32404A" },
      },
      popup: { title: "Área temática", titleProperty: "label", fields: [
        { property: "size", label: "Área", decimals: 2, suffix: " ha" },
        { property: "value_count", label: "Quantidade", format: "integer" },
        { property: "class_code", label: "Classe", prefix: "Código " },
        // uniqueFeatureIds keeps the original feature id in source_id.
        { property: "source_id", label: "ID de origem" },
      ] },
    },
  },
  {
    id: "lines-example", name: "Linhas classificadas", description: "Hierarquia ilustrativa", kind: "vector", defaultVisible: false,
    source: {
      format: "geojson", url: "https://example.invalid/lines.geojson", autoZoom: false, ignoreAltitude: true, uniqueFeatureIds: true,
      style: {
        stroke: "#32404A", strokeWidth: 1, clampToGround: true, zIndex: 10,
        classification: { property: "level_code", classes: {
          minor: { stroke: "#34B3C8", strokeWidth: 1, zIndex: 10 },
          major: { stroke: "#2457B2", strokeWidth: 3.5, zIndex: 11 },
        } },
      },
      popup: { title: "Linha", titleProperty: "label", titlePrefix: "Trecho ", fields: [{ property: "level_code", label: "Classe" }] },
    },
  },
  {
    id: "ion-model-example", name: "Modelo ion", description: "Substitua o assetId ilustrativo", kind: "3d-tiles", defaultVisible: false,
    source: { format: "3d-tiles", source: "ion", assetId: 0, tokenEnv: "VITE_CESIUM_3D_TOKEN", heightOffsetMeters: 0 },
  },
  // Visual pattern of the vector layers (validated in a derived project). URLs
  // are placeholders. Files come from scripts/prepare-geojson.cjs (--tipo in
  // each comment). Kept in drawing order: between GeoJSON layers Cesium 1.146
  // draws in the order of the layers array (zIndex only orders inside a layer),
  // so keep the array in the zIndex order below. panelOrder sets the panel
  // order: Área de Estudo, Matrículas, then the others.
  // Microbasins (--tipo microbacias): one color per polygon from "cor" (0 to 9).
  microbasinsExample,
  // Contours (--tipo curvas): black, 1 px; one interval at a time.
  contoursExample("contours-2m-example", "Curvas de Nível (2 m)", "curvas_2m.geojson", 4),
  contoursExample("contours-3m-example", "Curvas de Nível (3 m)", "curvas_3m.geojson", 5),
  // Drainage (--tipo drenagem): 5 Strahler classes. area_contribuicao_ha is
  // read from the source file; prepare-geojson does not compute it.
  {
    id: "drainage-example", name: "Drenagem", description: "Drenagem", kind: "drainage", defaultVisible: false, panelOrder: 6,
    source: {
      format: "geojson", url: "https://example.invalid/geojson/drenagem.geojson", autoZoom: false,
      style: {
        stroke: "#00E5FF", strokeWidth: 1, clampToGround: true, zIndex: 10,
        classification: { property: "STRAHLER", classes: {
          1: { stroke: "#00E5FF", strokeWidth: 1, zIndex: 10 },
          2: { stroke: "#14B8F0", strokeWidth: 1.6, zIndex: 11 },
          3: { stroke: "#1E88E5", strokeWidth: 2.4, zIndex: 12 },
          4: { stroke: "#1546D8", strokeWidth: 3.4, zIndex: 13 },
          5: { stroke: "#0B2A9E", strokeWidth: 4.4, zIndex: 14 },
        } },
      },
      popup: { title: "Drenagem", fields: [
        { property: "STRAHLER", label: "Ordem de Strahler", format: "integer" },
        { property: "area_contribuicao_ha", label: "Área de contribuição", decimals: 2, suffix: " ha" },
      ] },
    },
  },
  // Roads (--tipo generico): filled brown polygons without outline (stroke only satisfies the type).
  {
    id: "roads-example", name: "Estradas", description: "Estradas", kind: "vector", defaultVisible: false, panelOrder: 7,
    source: {
      format: "geojson", url: "https://example.invalid/geojson/estradas.geojson", autoZoom: false,
      style: { stroke: "#8B5A2B", strokeWidth: 1, fill: "#8B5A2B", fillOpacity: 0.6, polygonOutline: false, clampToGround: true, zIndex: 15 },
    },
  },
  // Property parcels (--tipo generico): yellow outline, no fill. On at the opening, also on mobile.
  {
    id: "parcels-example", name: "Matrículas", description: "Matrículas", kind: "property-boundary", defaultVisible: true, panelOrder: 2,
    source: {
      format: "geojson", url: "https://example.invalid/geojson/perimetros.geojson", autoZoom: false,
      style: { stroke: "#FFD400", strokeWidth: 2.5, fillOpacity: 0, clampToGround: true, zIndex: 20 },
      popup: { titleProperty: "nome", fields: [] },
    },
  },
  studyAreaExample,
];

// Inactive example: plots whose popup opens a 3D simulation over the map.
// The feature property "simulation_url" holds an https page whose origin must
// be listed in ProjectConfig.embeddedPages.allowedOrigins.
export const plotSimulationExample: ProjectLayerConfig = {
  id: "plots-example", name: "Talhões", description: "Talhões com simulação 3D ilustrativa", kind: "vector", defaultVisible: false,
  source: {
    format: "geojson", url: "https://example.invalid/plots.geojson", autoZoom: false,
    style: { stroke: "#C68524", strokeWidth: 3, fill: "#C68524", fillOpacity: 0.15, clampToGround: true, zIndex: 2 },
    popup: { title: "Talhão", titleProperty: "label", fields: [{ property: "size", label: "Área", decimals: 2, suffix: " ha" }],
      actions: [{ label: "Entrar na simulação 3D", urlProperty: "simulation_url" }] },
  },
};

// Synthetic polygon near 0°; never use this boundary for a real property.
// Attach to a configured model source only after replacing all coordinates.
export const exampleClipping = {
  enabled: true, inverse: true,
  positions: [[-0.01, -0.01], [0.01, -0.01], [0.01, 0.01], [-0.01, 0.01]] as [number, number][],
};
