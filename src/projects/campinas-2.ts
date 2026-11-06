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

export const project: ProjectConfig = {
  ...templateProject,
  id: "campinas-2",
  name: "Campinas 2",
  location: "Campinas-SP",
  // Sem bounds do projeto: limite de navegação desligado. Os bounds das camadas
  // são tiles inteiros, não o contorno dos dados. Para ligar o limite, use
  // "Capturar bounds da vista" (cameraCapture) e cole bounds: [W, S, E, N].
  // Provisória: vista de cima sobre o centro do orto. Capture a Home final com cameraCapture.
  // Ângulos em graus; altura em metros sobre o elipsoide.
  initialCamera: { longitude: -47.197, latitude: -23.0, height: 5000, heading: 0, pitch: -90, roll: 0 },
  // Ordem = empilhamento: o último item fica por cima.
  layers: [basemap, orto, mds, mdt, declividade, aspecto],
  scenes: [],
  diagnostic: { steps: [] },
  // Ferramentas só aparecem em npm run dev; desligue cameraCapture ao finalizar.
  developmentTools: { modelAlignment: false, cropAuthoring: false, cameraCapture: true },
};
