import type { MacroPopupPreset, ProjectLayerConfig, VectorPopupConfig } from "./types";

// Curated popups of the macro context layers. Reference: Andrelândia WebGIS
// curation, reused unchanged in EFAC (validated against Andrelândia). Keep the
// field order, labels, units, decimals and sections as they are: they are the
// Cardeal Map standard. Missing or empty attributes are omitted, and raw source
// attributes are never listed automatically.
//
// Use: in a layer with group "macro", set source.macroPopup to a preset id.
// A new source schema: add a preset here (and its id to MacroPopupPreset in
// types.ts) instead of a per-project popup.

// UF names as in the IBGE base -> abbreviation (the reference listed Minas Gerais).
const ufLabels: Record<string, string> = Object.fromEntries(
  "AC:Acre,AL:Alagoas,AP:Amapá,AM:Amazonas,BA:Bahia,CE:Ceará,DF:Distrito Federal,ES:Espírito Santo,GO:Goiás,MA:Maranhão,MT:Mato Grosso,MS:Mato Grosso do Sul,MG:Minas Gerais,PA:Pará,PB:Paraíba,PR:Paraná,PE:Pernambuco,PI:Piauí,RJ:Rio de Janeiro,RN:Rio Grande do Norte,RS:Rio Grande do Sul,RO:Rondônia,RR:Roraima,SC:Santa Catarina,SP:São Paulo,SE:Sergipe,TO:Tocantins".split(",").map(item => item.split(":")).map(([uf, name]) => [name, uf]),
);
// IBGE rural-urban typology: only source values confirmed in the reference.
// Any other value is shown as supplied (no invented descriptions).
const typologyLabels: Record<string, string> = {
  IntermediarioAdjacente: "Intermediário Adjacente",
};

export const macroPopups: Record<MacroPopupPreset, VectorPopupConfig> = {
  // Contexto municipal — IBGE.
  "municipality": {
    title: "Contexto Municipal IBGE",
    fields: [
      { property: "BaseRurU_2", label: "Município" },
      { property: "BaseRurUrb", label: "UF", valueLabels: ufLabels },
      { property: "Pop_Tot_Mu", label: "População total", format: "integer", suffix: " habitantes" },
      { property: "Pop_Urb_Mu", label: "População urbana", format: "integer" },
      { property: "Perc_Urb_U", label: "Percentual urbano", decimals: 2, suffix: "%" },
      { property: "Pop_Rur_Mu", label: "População rural", format: "integer" },
      { property: "Pop_Rur_Mu", label: "Percentual rural", ratioTo: "Pop_Tot_Mu", decimals: 2, suffix: "%" },
      { property: "Tipologia_", label: "Tipologia territorial", valueLabels: typologyLabels },
      { property: "Classes_Pe", label: "Urbanização" },
    ],
  },
  // Clima — IBGE.
  "climate": {
    title: "Clima IBGE",
    fields: [
      { property: "ZONA", label: "Zona" },
      { property: "TP_UMIDADE", label: "Umidade" },
      { property: "DISTR_UMID", label: "Distribuição de umidade" },
      { property: "TEMPERATUR", label: "Temperatura" },
      { property: "DESC_COMPL", label: "Descrição completa" },
    ],
  },
  // Geologia — IBGE.
  "geology": {
    title: "Geologia IBGE",
    fields: [
      { property: "nm_unidade", label: "Unidade" },
      { property: "letra_simb", label: "Símbolo" },
      { property: "nm_tempo_g", label: "Tempo geológico" },
      { property: "nm_provinc", label: "Província" },
      { property: "nm_sub_pro", label: "Subprovíncia" },
      { property: "nm_lito1", label: "Litologia" },
      { property: "nm_lito2", label: "Litologia" },
      { property: "nm_lito3", label: "Litologia" },
      { property: "nm_lito4", label: "Litologia" },
    ],
  },
  // Geomorfologia — IBGE.
  "geomorphology": {
    title: "Geomorfologia IBGE",
    fields: [
      { property: "nm_dominio", label: "Domínio" },
      { property: "nm_regiao", label: "Região" },
      { property: "nm_unidade", label: "Unidade" },
      { property: "categoria", label: "Categoria" },
      { property: "natureza", label: "Natureza" },
      { property: "caract", label: "Característica" },
      { property: "forma", label: "Forma" },
      { property: "dens_dren", label: "Densidade de drenagem" },
      { property: "aprof_inci", label: "Aprofundamento da incisão" },
      { property: "compartime", label: "Compartimento" },
    ],
  },
  // Pedologia — IBGE.
  "soils": {
    title: "Pedologia IBGE",
    fields: [
      { property: "nom_unidad", label: "Unidade" },
      { property: "legenda", label: "Solo" },
      { property: "ordem", label: "Ordem" },
      { property: "subordem", label: "Subordem" },
      { property: "grande_gru", label: "Grande grupo" },
      { property: "subgrupos", label: "Subgrupo" },
      { property: "textura", label: "Textura" },
      { property: "horizonte", label: "Horizonte" },
      { property: "relevo", label: "Relevo" },
      { property: "componente", label: "Componente", section: "Associação de solos" },
      { property: "component1", label: "Componente", section: "Associação de solos" },
      { property: "component2", label: "Componente", section: "Associação de solos" },
      { property: "component3", label: "Componente", section: "Associação de solos" },
      { property: "inclu_p1", label: "Inclusão", section: "Associação de solos" },
      { property: "inclu_p2", label: "Inclusão", section: "Associação de solos" },
      { property: "inclu_p3", label: "Inclusão", section: "Associação de solos" },
    ],
  },
  // Vegetação — IBGE.
  "vegetation": {
    title: "Vegetação IBGE",
    fields: [
      { property: "nm_uveg", label: "Vegetação atual/principal" },
      { property: "nm_pretet", label: "Vegetação pretérita" },
      { property: "nm_sec1", label: "Uso associado" },
      { property: "nm_sec2", label: "Classe associada" },
      { property: "leg_sup", label: "Dominância" },
    ],
  },
  // Hidrografia — ANA.
  "ana-hydrography": {
    title: "Drenagem ANA",
    fields: [
      { property: "nuordemcda", label: "Ordem", format: "integer" },
      { property: "nunivotcda", label: "Nível Otto", format: "integer" },
      { property: "nuareabacc", label: "Área da bacia", unit: "km²", decimals: 3 },
      { property: "nucompcda", label: "Comprimento", unit: "km", decimals: 3 },
      { property: "dsversao", label: "Versão/base" },
    ],
  },
  // Microbacias — ANA (Pfafstetter).
  "ana-basin": {
    title: "Microbacias ANA",
    fields: [
      { property: "wts_cd_pfafstetterbasin", label: "Código da microbacia", format: "integer" },
      { property: "wts_cd_pfafstetterbasincodeleve", label: "Nível Pfafstetter", format: "integer" },
      { property: "wts_gm_area", label: "Área", unit: "km²", decimals: 4 },
    ],
  },
  // Microbacias simuladas (Global Mapper: STREAM_ID, ENCLOSED_AREA, PERIMETER).
  "simulated-basins": {
    title: "Microbacia simulada",
    fields: [
      { property: "STREAM_ID", label: "STREAM ID", format: "integer" },
      { property: "ENCLOSED_AREA", label: "Área", unit: "ha", decimals: 2 },
      { property: "PERIMETER", label: "Perímetro", unit: "km", decimals: 3 },
    ],
  },
  // Drenagem simulada (STRAHLER, DRAIN_AREA).
  "simulated-drainage": {
    title: "Simulação de drenagem ANADEM",
    fields: [
      { property: "STRAHLER", label: "Ordem Strahler", format: "integer" },
      { property: "DRAIN_AREA", label: "Área drenada", unit: "ha", decimals: 4 },
    ],
  },
};

// Preset as a popup config, ready for source.popup.
export function macroPopup(preset: MacroPopupPreset): VectorPopupConfig {
  return { ...macroPopups[preset], presentation: "curated" };
}

export const MACRO_POPUP_MISSING = "Popup Macro não configurado: defina source.macroPopup (src/projects/macroPopups.ts).";

// Applied before the existing loader. A macro GeoJSON layer gets its preset;
// without one it shows no attributes: no popup in production and, in
// development only, a popup with the layer name and a notice.
export function resolveMacroPopup(layer: ProjectLayerConfig, development = import.meta.env.DEV): ProjectLayerConfig {
  if (layer.group !== "macro" || layer.source.format !== "geojson") return layer;
  const { macroPopup: preset } = layer.source;
  if (preset) return { ...layer, source: { ...layer.source, popup: macroPopup(preset) } };
  if (layer.source.popup?.presentation === "curated" || layer.source.popup?.fields.length) return layer;
  return { ...layer, source: { ...layer.source, popup: development
    ? { title: layer.name, presentation: "curated", notice: MACRO_POPUP_MISSING, fields: [] }
    : undefined } };
}
