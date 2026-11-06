#!/usr/bin/env node
// Prints a raster layer entry for src/projects/ from a tilemapresource.xml.
//
// Usage:
//   node scripts/raster-from-xml.cjs <tilemapresource.xml> [options]
//
// Options:
//   --url <base>      Public folder that contains the {z} folders (or a full
//                     template with {z}/{x}/{y|reverseY}). Enables the remote check.
//   --tiles <folder>  Local export folder (same z/x/y structure uploaded to R2).
//                     Confirms TMS/XYZ, levels and axis order from real files.
//   --id <id> --name <name> --description <text> --kind <kind> --credit <text>
//                     Raster kinds: raster, orthomosaic, dtm, dsm, slope, aspect,
//                     solar-orientation, ndvi, multispectral (src/projects/types.ts).
//   --origin <url>    Extra origin for the CORS check (repeatable). The local
//                     dev/preview origins are always checked.
//
// Only Web Mercator is accepted: the template loader uses WebMercatorTilingScheme.
const fs = require("node:fs");
const path = require("node:path");

const R = 6378137;
const MAX_MERCATOR = Math.PI * R;
const MAX_LATITUDE = 85.0511287798;
const WEB_MERCATOR_SRS = new Set(["EPSG:3857", "EPSG:900913", "EPSG:3785", "EPSG:102100", "EPSG:102113", "OSGEO:41001"]);
const DEFAULT_ORIGINS = ["http://127.0.0.1:5173", "http://127.0.0.1:4173"];

class UsageError extends Error {}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

function element(xml, name) {
  const match = xml.match(new RegExp(`<${name}\\b([^>]*?)\\/?>`, "i"));
  return match ? attributes(match[1]) : undefined;
}

function text(xml, name) {
  const match = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? match[1].trim() : undefined;
}

function parseTileMap(xml) {
  const srs = (text(xml, "SRS") ?? "").toUpperCase().replace(/\s+/g, "");
  if (!WEB_MERCATOR_SRS.has(srs)) {
    throw new UsageError(`SRS "${srs || "ausente"}" não é Web Mercator. O loader do template aceita apenas EPSG:3857/900913 (WebMercatorTilingScheme). Reexporte os tiles em EPSG:3857.`);
  }
  const tileSetsTag = xml.match(/<TileSets\b([^>]*)>/i);
  const profile = tileSetsTag ? attributes(tileSetsTag[1]).profile : undefined;
  if (profile && !/mercator/i.test(profile)) {
    throw new UsageError(`TileSets profile="${profile}" não é mercator. Reexporte com perfil Web Mercator.`);
  }
  const box = element(xml, "BoundingBox");
  if (!box) throw new UsageError("BoundingBox ausente no XML.");
  const raw = ["minx", "miny", "maxx", "maxy"].map((key) => Number(box[key]));
  if (!raw.every(Number.isFinite)) throw new UsageError("BoundingBox com valores inválidos.");
  const origin = element(xml, "Origin");
  const format = element(xml, "TileFormat") ?? {};
  const levels = [...xml.matchAll(/<TileSet\b([^>]*?)\/?>/gi)].map((match) => {
    const set = attributes(match[1]);
    return Number(set.order ?? set.href);
  }).filter(Number.isInteger);
  if (!levels.length) throw new UsageError("Nenhum TileSet com order/href numérico.");
  const extension = (format.extension || (format["mime-type"] ?? "").split("/")[1] || "png").toLowerCase().replace("jpeg", "jpg");
  return {
    title: text(xml, "Title") ?? "",
    srs,
    raw,
    origin: origin ? [Number(origin.x), Number(origin.y)] : undefined,
    tileWidth: Number(format.width) || 256,
    tileHeight: Number(format.height) || 256,
    extension,
    minimumLevel: Math.min(...levels),
    maximumLevel: Math.max(...levels),
  };
}

const toLongitude = (x) => x / R * 180 / Math.PI;
const toLatitude = (y) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;

// gdal2tiles writes degrees even for EPSG:3857 (older releases also swap the
// axes); other exporters write meters. Returns candidate W,S,E,N bounds.
function boundsCandidates(raw) {
  const [minx, miny, maxx, maxy] = raw;
  const degrees = raw.every((value) => Math.abs(value) <= 180);
  if (!degrees) {
    if (!raw.every((value) => Math.abs(value) <= MAX_MERCATOR * 1.0001)) throw new UsageError("BoundingBox fora da extensão Web Mercator.");
    return { units: "meters", candidates: [[toLongitude(minx), toLatitude(miny), toLongitude(maxx), toLatitude(maxy)]] };
  }
  const candidates = [[minx, miny, maxx, maxy], [miny, minx, maxy, maxx]]
    .filter(([w, s, e, n]) => Math.abs(s) <= 90 && Math.abs(n) <= 90 && w < e && s < n);
  if (!candidates.length) throw new UsageError("BoundingBox em graus não forma um retângulo válido.");
  return { units: "degrees", candidates };
}

function tileX(longitude, level) {
  return Math.min(2 ** level - 1, Math.max(0, Math.floor((longitude + 180) / 360 * 2 ** level)));
}
function tileYXyz(latitude, level) {
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude)) * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * 2 ** level);
  return Math.min(2 ** level - 1, Math.max(0, y));
}
function expectedRange([west, south, east, north], level) {
  const yTop = tileYXyz(north, level);
  const yBottom = tileYXyz(south, level);
  const flip = (y) => 2 ** level - 1 - y;
  return {
    x: [tileX(west, level), tileX(east, level)],
    xyz: [yTop, yBottom],
    tms: [flip(yBottom), flip(yTop)],
  };
}

function numericEntries(folder, files) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => files ? entry.isFile() : entry.isDirectory())
    .map((entry) => files ? entry.name.replace(/\.[^.]+$/, "") : entry.name)
    .filter((name) => /^\d+$/.test(name)).map(Number);
}

function scanLevel(folder, level) {
  const xs = numericEntries(path.join(folder, String(level)), false);
  const ys = [];
  let sample;
  for (const x of xs) {
    const files = fs.readdirSync(path.join(folder, String(level), String(x)));
    for (const file of files) {
      const match = file.match(/^(\d+)\.(\w+)$/);
      if (!match) continue;
      ys.push(Number(match[1]));
      sample ??= { x, y: Number(match[1]), extension: match[2].toLowerCase() };
    }
  }
  return { xs, ys, sample };
}

const overlaps = (values, [low, high]) => values.some((value) => value >= low && value <= high);
const within = (values, [low, high], slack = 1) => values.every((value) => value >= low - slack && value <= high + slack);

// Uses real files to choose TMS/XYZ and the axis order of degree bounding boxes.
function inspectTiles(folder, tileMap, candidates) {
  const levels = numericEntries(folder, false).sort((a, b) => a - b);
  if (!levels.length) throw new UsageError(`Nenhuma pasta de nível numérica em ${folder}.`);
  const notes = [];
  if (levels[0] !== tileMap.minimumLevel || levels.at(-1) !== tileMap.maximumLevel) {
    notes.push(`Pastas de nível ${levels[0]}–${levels.at(-1)} diferem dos TileSets ${tileMap.minimumLevel}–${tileMap.maximumLevel}; usando as pastas existentes.`);
  }
  let decision;
  for (const level of levels) {
    const scan = scanLevel(folder, level);
    if (!scan.ys.length) continue;
    for (const bounds of candidates) {
      const range = expectedRange(bounds, level);
      if (!within(scan.xs, range.x)) continue;
      const tms = overlaps(scan.ys, range.tms) && within(scan.ys, range.tms);
      const xyz = overlaps(scan.ys, range.xyz) && within(scan.ys, range.xyz);
      if (tms !== xyz) { decision = { format: tms ? "tms" : "xyz", bounds, level }; break; }
      decision ??= { format: undefined, bounds, level };
    }
    if (decision?.format) break;
  }
  if (!decision) throw new UsageError("Os tiles da pasta não coincidem com o BoundingBox do XML (verifique a pasta e o XML).");
  const minimumLevel = levels[0];
  const sample = scanLevel(folder, minimumLevel).sample;
  return { ...decision, minimumLevel, maximumLevel: levels.at(-1), sample, notes };
}

// 1e-9 degree is about 0.1 mm: removes edge contact, not real coverage.
function inset([west, south, east, north], epsilon = 1e-9) {
  return [west + epsilon, south + epsilon, east - epsilon, north - epsilon];
}

function roundOut([west, south, east, north]) {
  const scale = 1e7;
  return [Math.floor(west * scale) / scale, Math.floor(south * scale) / scale, Math.ceil(east * scale) / scale, Math.ceil(north * scale) / scale];
}

function buildUrl(base, format, extension) {
  if (!base) return `https://SEU-DOMINIO-R2/CAMINHO/{z}/{x}/${format === "tms" ? "{reverseY}" : "{y}"}.${extension}`;
  if (base.includes("{z}")) {
    if (format === "tms" && !base.includes("{reverseY}")) throw new UsageError("URL informada usa {y}, mas os tiles são TMS: use {reverseY}.");
    if (format === "xyz" && base.includes("{reverseY}")) throw new UsageError("URL informada usa {reverseY}, mas os tiles são XYZ: use {y}.");
    return base;
  }
  return `${base.replace(/\/+$/, "")}/{z}/{x}/${format === "tms" ? "{reverseY}" : "{y}"}.${extension}`;
}

function tileUrl(template, z, x, yStored) {
  // yStored is the name on disk/R2. For TMS that is reverseY; Cesium's {y} is XYZ.
  return template.replace("{z}", z).replace("{x}", x).replace("{reverseY}", yStored).replace("{y}", yStored);
}

async function checkRemote(url, origins) {
  const results = [];
  for (const origin of origins) {
    try {
      const response = await fetch(url, { headers: { Origin: origin }, redirect: "follow" });
      const allow = response.headers.get("access-control-allow-origin");
      const type = response.headers.get("content-type") ?? "";
      await response.arrayBuffer();
      const corsOk = allow === "*" || allow === origin;
      results.push({ origin, ok: response.status === 200 && corsOk && type.startsWith("image/"), status: response.status, allow, type });
    } catch (error) {
      results.push({ origin, ok: false, status: "erro de rede", allow: null, type: "", error: error.message });
    }
  }
  return results;
}

function toObjectLiteral(value, indent = "") {
  const next = indent + "  ";
  if (Array.isArray(value)) return `[${value.map((item) => toObjectLiteral(item, next)).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return `{\n${entries.map(([key, item]) => `${next}${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${toObjectLiteral(item, next)},`).join("\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function parseArgs(argv) {
  const options = { origins: [] };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const key = arg.slice(2);
    const value = argv[++i];
    if (value === undefined) throw new UsageError(`Valor ausente para ${arg}.`);
    if (key === "origin") options.origins.push(value);
    else if (["url", "tiles", "id", "name", "description", "kind", "credit"].includes(key)) options[key] = value;
    else throw new UsageError(`Opção desconhecida: ${arg}`);
  }
  if (positional.length !== 1) throw new UsageError("Uso: node scripts/raster-from-xml.cjs <tilemapresource.xml> [--url <base>] [--tiles <pasta>] [--id ...] [--name ...] [--kind ...] [--credit ...] [--origin ...]");
  options.xml = positional[0];
  return options;
}

function slug(value) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "raster";
}

// Pure part, shared with checks: returns the layer and the notes.
function deriveLayer(xml, options = {}) {
  const tileMap = parseTileMap(xml);
  const { units, candidates } = boundsCandidates(tileMap.raw);
  const notes = [];
  let bounds = candidates[0];
  let format = "tms";
  let minimumLevel = tileMap.minimumLevel;
  let maximumLevel = tileMap.maximumLevel;
  let extension = tileMap.extension;
  let sample;
  if (units === "degrees") notes.push("BoundingBox em graus (padrão do gdal2tiles), usado sem conversão.");
  else notes.push("BoundingBox em metros EPSG:3857, convertido para graus.");
  if (tileMap.origin) {
    const [, originY] = tileMap.origin;
    const [, miny, , maxy] = tileMap.raw;
    if (Math.abs(originY - maxy) < Math.abs(originY - miny)) {
      format = "xyz";
      notes.push("Origin no topo do BoundingBox: eixo Y de cima para baixo (XYZ).");
    } else {
      notes.push("Origin na base do BoundingBox: eixo Y de baixo para cima (TMS).");
    }
  } else {
    notes.push("Sem Origin no XML; assumindo TMS (padrão do tilemapresource).");
  }
  if (options.tiles) {
    const inspected = inspectTiles(options.tiles, tileMap, candidates);
    notes.push(...inspected.notes);
    if (inspected.format && inspected.format !== format) notes.push(`A pasta de tiles indica ${inspected.format.toUpperCase()}, diferente do XML; usando a pasta.`);
    if (inspected.format) notes.push(`Formato confirmado pela pasta (nível ${inspected.level}): ${inspected.format.toUpperCase()}.`);
    else notes.push("A pasta não permitiu distinguir TMS de XYZ (área simétrica); mantido o indicado pelo XML.");
    if (units === "degrees" && candidates.length > 1 && inspected.bounds !== candidates[0]) notes.push("Eixos do BoundingBox estavam invertidos (gdal2tiles antigo); corrigido pela pasta.");
    format = inspected.format ?? format;
    bounds = inspected.bounds;
    minimumLevel = inspected.minimumLevel;
    maximumLevel = inspected.maximumLevel;
    if (inspected.sample) {
      sample = inspected.sample;
      if (sample.extension !== extension) notes.push(`Extensão real dos tiles é .${sample.extension} (XML: .${extension}); usando a real.`);
      extension = sample.extension;
    }
  } else if (units === "degrees" && candidates.length > 1) {
    notes.push("ATENÇÃO: com graus, versões antigas do gdal2tiles invertem os eixos. Confirme passando --tiles <pasta>.");
  }
  if (Math.abs(bounds[1]) > MAX_LATITUDE || Math.abs(bounds[3]) > MAX_LATITUDE) throw new UsageError("Latitude fora do limite Web Mercator (±85,05°).");
  // Global Mapper writes a BoundingBox made of whole tiles: its edges sit exactly
  // on tile boundaries and would add a neighbor row/column. Count with a tiny inset.
  const range = expectedRange(inset(bounds), minimumLevel);
  const tilesAtMinimum = (range.x[1] - range.x[0] + 1) * (range.xyz[1] - range.xyz[0] + 1);
  if (tilesAtMinimum > 4) notes.push(`ATENÇÃO: ${tilesAtMinimum} tiles no nível mínimo ${minimumLevel}. O Cesium recomenda até ~4; considere exportar níveis menores.`);
  notes.push("bounds = BoundingBox do XML (tiles inteiros do nível mínimo), não o contorno dos dados: não use como bounds do projeto.");
  if (extension === "jpg") notes.push("Tiles JPG não têm transparência: bordas sem dado aparecem opacas.");
  if (!sample) {
    // Test tile = the one under the center of the BoundingBox, never an edge tile.
    const [west, south, east, north] = bounds;
    const x = tileX((west + east) / 2, minimumLevel);
    const yXyz = tileYXyz((south + north) / 2, minimumLevel);
    sample = { x, y: format === "tms" ? 2 ** minimumLevel - 1 - yXyz : yXyz };
  }
  const name = options.name ?? (tileMap.title || "Raster");
  const url = buildUrl(options.url, format, extension);
  const layer = {
    id: options.id ?? slug(name),
    name,
    description: options.description ?? "",
    kind: options.kind ?? "raster",
    defaultVisible: false,
    source: {
      format,
      url,
      credit: options.credit ?? "",
      bounds: roundOut(bounds),
      minimumLevel,
      maximumLevel,
      tileWidth: tileMap.tileWidth,
      tileHeight: tileMap.tileHeight,
    },
  };
  return { layer, notes, sampleTile: { z: minimumLevel, x: sample.x, y: sample.y } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const xml = fs.readFileSync(options.xml, "utf8");
  const { layer, notes, sampleTile } = deriveLayer(xml, options);
  console.log("// Cole em src/projects/<projeto>.ts e adicione o objeto à lista layers.");
  console.log("// Legenda (opcional): legend: { type: \"image\", title: \"...\", imageUrl: \"/legends/<arquivo>.png\", imageAlt: \"...\" }");
  console.log(toObjectLiteral(layer) + ",");
  console.error("\nObservações:");
  for (const note of notes) console.error(`- ${note}`);
  if (!options.url) {
    console.error("- URL não informada: substitua o placeholder e rode novamente com --url para testar CORS.");
    return;
  }
  const url = tileUrl(layer.source.url, sampleTile.z, sampleTile.x, sampleTile.y);
  console.error(`\nTeste remoto do tile ${sampleTile.z}/${sampleTile.x}/${sampleTile.y}: ${url}`);
  const results = await checkRemote(url, [...new Set([...DEFAULT_ORIGINS, ...options.origins])]);
  for (const result of results) {
    console.error(`- ${result.ok ? "OK  " : "FALHA"} origem ${result.origin}: HTTP ${result.status}, Access-Control-Allow-Origin=${result.allow ?? "(ausente)"}, Content-Type=${result.type || "(ausente)"}${result.error ? `, ${result.error}` : ""}`);
  }
  if (results.some((result) => !result.ok)) {
    console.error("\nCorrija a URL/caminho ou a política CORS do bucket (docs/R2_CORS.md) antes de ativar a camada.");
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof UsageError ? `Erro: ${error.message}` : error);
    process.exitCode = 1;
  });
}

module.exports = { deriveLayer, parseTileMap, boundsCandidates, expectedRange, UsageError };
