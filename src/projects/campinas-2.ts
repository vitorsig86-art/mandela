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
  layers: [basemap, orto, mds, mdt, declividade, aspecto, modelo],
  scenes: [],
  diagnostic: { steps: [] },
  // Ferramentas de desenvolvimento desligadas: o dev fica igual ao site publicado.
  developmentTools: { modelAlignment: false, cropAuthoring: false, cameraCapture: false },
};
