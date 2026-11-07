import type { GeographicBounds, ProjectConfig, ProjectLayerConfig } from "./types";
import { templateProject } from "./template";

// Valores reais do projeto Campinas 2. template.ts guarda só exemplos genéricos
// usados por npm run check: não coloque dados da propriedade nele.
// Passo a passo: docs/NOVO-PROJETO.md.
const basemap = templateProject.layers[0];
const R2 = "https://pub-a77183f72594453289c7a809aae35b66.r2.dev"; // r2.dev: sem o nome do bucket

// Bounds das camadas = tiles inteiros do nível mínimo (tilemapresource.xml),
// não o contorno dos dados. Servem só para limitar as requisições de tiles.
const ortoBounds: GeographicBounds = [-47.2852, -23.0797, -47.1094, -22.9179];
const mdsBounds: GeographicBounds = [-47.4609, -23.2413, -47.1094, -22.9179];
const relevoBounds: GeographicBounds = [-47.8125, -23.2413, -46.4062, -21.9430];

// Ortomosaico único: sem análise temporal (nenhum temporalCampaign).
const orto: ProjectLayerConfig = {
  id: "orto", name: "Ortomosaico", description: "", kind: "orthomosaic", defaultVisible: true,
  source: {
    format: "tms", url: `${R2}/orto/{z}/{x}/{reverseY}.png`, credit: "Cardeal Map",
    bounds: ortoBounds, minimumLevel: 11, maximumLevel: 20, tileWidth: 256, tileHeight: 256,
  },
};

// Derivados do relevo: legenda no próprio raster, um por vez (mesmo exclusiveGroup).
const derivado = (
  id: string, name: string, kind: ProjectLayerConfig["kind"], folder: string,
  bounds: GeographicBounds, minimumLevel: number, maximumLevel: number,
): ProjectLayerConfig => ({
  id, name, description: "", kind, defaultVisible: false,
  legendMode: "embedded", exclusiveGroup: "derivados",
  source: {
    format: "tms", url: `${R2}/${folder}/{z}/{x}/{reverseY}.png`, credit: "Cardeal Map",
    bounds, minimumLevel, maximumLevel, tileWidth: 256, tileHeight: 256,
  },
});
const mds = derivado("mds", "Modelo Digital de Superfície", "dsm", "mds", mdsBounds, 10, 19);
const mdt = derivado("mdt", "Modelo Digital de Terreno", "dtm", "mdt", relevoBounds, 8, 17);
const declividade = derivado("declividade", "Declividade", "slope", "decli", relevoBounds, 8, 17);
const aspecto = derivado("aspecto", "Orientação de Vertentes", "aspect", "aspect", relevoBounds, 8, 17);

// Modelo 3D do Cesium ion, gerado no Agisoft Metashape. VITE_CESIUM_3D_TOKEN
// é igual ao token do ion, por isso reaproveita VITE_CESIUM_ION_TOKEN.
const modelo: ProjectLayerConfig = {
  id: "modelo", name: "Modelo 3D", description: "", kind: "3d-tiles", defaultVisible: false,
  source: {
    format: "3d-tiles", source: "ion", assetId: 6130668, tokenEnv: "VITE_CESIUM_ION_TOKEN",
    // Recorte desenhado com cropAuthoring.
    clipping: {
      enabled: true,
      inverse: true,
      positions: [
        [-47.1312274, -22.9837204],
        [-47.1298383, -22.9868115],
        [-47.1286680, -22.9888048],
        [-47.1273744, -22.9885586],
        [-47.1262175, -22.9883483],
        [-47.1215179, -22.9865162],
        [-47.1233174, -22.9816928],
      ],
    },
    // 0: modelo assenta no World Terrain sem offset; referencial vertical do asset a confirmar no ion.
    heightOffsetMeters: 0,
    terrainCutout: false,
  },
};

// Vetores: GeoJSON em CRS84, sem Z, com id único (sem uniqueFeatureIds).
// Ordem no painel (panelOrder): Microbacias, Curvas, Drenagem MDT, Drenagem MDS.
const geojson = (file: string) => `${R2}/geojson/${file}`;

// Paleta das microbacias, indexada pelo atributo "cor" (0 a 9).
const microbaciaCores = ["#E6194B", "#3CB44B", "#FFE119", "#4363D8", "#F58231", "#911EB4", "#42D4F4", "#F032E6", "#BFEF45", "#FABED4"];

// O stroke da classe só é usado se "cor" vier como texto ("3"): o outline lê o índice numérico.
const microbacias: ProjectLayerConfig = {
  id: "microbacias", name: "Microbacias", description: "", kind: "vector", defaultVisible: false, panelOrder: 1, opacityControl: true,
  source: {
    format: "geojson", url: geojson("microbacias.geojson"), autoZoom: false,
    style: {
      stroke: "#FFFFFF", strokeWidth: 1.5, fillOpacity: 0.35, clampToGround: true, zIndex: 3,
      classification: { property: "cor", classes: Object.fromEntries(microbaciaCores.map((color, index) => [String(index), { fill: color, stroke: color }])) },
      outline: { property: "cor", colors: microbaciaCores, width: 1.5 },
    },
    popup: { titleProperty: "nome", fields: [
      { property: "area_ha", label: "Área", decimals: 2, suffix: " ha" },
      { property: "perimetro_km", label: "Perímetro", decimals: 2, suffix: " km" },
    ] },
  },
};

const curvas: ProjectLayerConfig = {
  id: "curvas1", name: "Curvas de Nível (1 m)", description: "", kind: "contours", defaultVisible: false, panelOrder: 2,
  source: {
    format: "geojson", url: geojson("curvas_1m.geojson"), autoZoom: false,
    style: { stroke: "#000000", strokeWidth: 1, clampToGround: true, zIndex: 5 },
    popup: { title: "Curva de nível", fields: [{ property: "cota_m", label: "Cota", suffix: " m", format: "integer" }] },
  },
};

// Drenagem por ordem de Strahler, uma por vez (mesmo exclusiveGroup).
const drenagem = (id: string, name: string, file: string, panelOrder: number): ProjectLayerConfig => ({
  id, name, description: "", kind: "drainage", defaultVisible: false, exclusiveGroup: "drenagem", panelOrder,
  source: {
    format: "geojson", url: geojson(file), autoZoom: false,
    style: {
      stroke: "#00E5FF", strokeWidth: 1, clampToGround: true, zIndex: 10,
      classification: { property: "STRAHLER", classes: {
        1: { stroke: "#00E5FF", strokeWidth: 1, zIndex: 10 },
        2: { stroke: "#14B8F0", strokeWidth: 1.6, zIndex: 11 },
        3: { stroke: "#1E88E5", strokeWidth: 2.4, zIndex: 12 },
        4: { stroke: "#1546D8", strokeWidth: 3.4, zIndex: 13 },
      } },
    },
    popup: { title: "Drenagem", fields: [
      { property: "STRAHLER", label: "Ordem de Strahler", format: "integer" },
      { property: "area_contribuicao_ha", label: "Área de contribuição", decimals: 2, suffix: " ha" },
    ] },
  },
});
const drenagemMdt = drenagem("drenagem-mdt", "Drenagem (MDT)", "drenagem_mdt.geojson", 3);
const drenagemMds = drenagem("drenagem-mds", "Drenagem (MDS)", "drenagem_mds.geojson", 4);

export const project: ProjectConfig = {
  ...templateProject,
  id: "campinas-2",
  name: "Campinas 2",
  location: "Campinas-SP",
  // Sem bounds do projeto: limite de navegação desligado. Os bounds das camadas
  // são tiles inteiros, não o contorno dos dados. Para ligar o limite, use
  // "Capturar bounds da vista" (cameraCapture) e cole bounds: [W, S, E, N].
  // Abertura e Home, capturada com cameraCapture. Ângulos em graus; altura em metros sobre o elipsoide.
  initialCamera: { longitude: -47.1247007, latitude: -22.9890922, height: 1051.7, heading: 336.55, pitch: -43.34, roll: 0 },
  // Ordem = empilhamento: o último item fica por cima.
  layers: [basemap, orto, mds, mdt, declividade, aspecto, microbacias, curvas, drenagemMdt, drenagemMds, modelo],
  scenes: [],
  diagnostic: { steps: [] },
  // Ferramentas de desenvolvimento desligadas: o dev fica igual ao site publicado.
  developmentTools: { modelAlignment: false, cropAuthoring: false, cameraCapture: false },
};
