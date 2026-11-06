#!/usr/bin/env node
// Prepares a GeoJSON exported from Global Mapper for upload to the R2.
//
// Usage:
//   node scripts/prepare-geojson.cjs <entrada.geojson> <saida.geojson> --tipo <tipo> [options]
//
// Tipos:
//   generico     only the common steps (e.g. property boundary, study area, roads).
//   curvas       contours: ELEVATION -> cota_m and mestra (true every --intervalo-mestra m).
//   drenagem     drainage: keeps a complete STRAHLER attribute; computes STRAHLER
//                from the network topology only when it is missing. Adds comprimento_m.
//   microbacias  watershed polygons (STREAM_ID, ENCLOSED_AREA, PERIMETER):
//                nome "Microbacia N", area_ha, perimetro_km and cor (0 to 9),
//                with neighbouring polygons never sharing a color.
//
// Options:
//   --intervalo-mestra <m>   index contour interval, default 15.
//
// Common steps (every type): removes Z, rounds coordinates to 7 decimals
// (about 1 cm), drops repeated vertices left by the rounding, replaces
// KML_STYLE with a sequential id (also the feature id) and a nome (from
// nome/NAME/name, or a default per type), and turns Global Mapper texts with
// a unit ("1080 m", "17.977 ha", "2.339 km") into numbers. Input must be
// geographic degrees (WGS84/CRS84); output is RFC 7946 without a "crs" member.
//
// Numbers in texts: "." or "," alone is the decimal separator ("17.977",
// "17,977"); with both, the last one is the decimal separator ("1,080.5").
// An attribute is converted only when all its values are numbers with a known
// unit (m, km, m², ha, km²); the value keeps that unit, and an attribute that
// mixes m and km (or m², ha and km²) is converted to m (or ha).
//
// Drainage topology (only when STRAHLER is missing): line endpoints are
// matched after rounding to 7 decimals. Each line flows from its higher end to
// its lower end, using the Z of its first and last vertex; lines drawn uphill
// are reversed, so the output always runs upstream -> downstream. Aborts when
// a line has no defined direction (missing or equal Z, closed line), when a
// line has more than one outlet (bifurcation) or when the network has a cycle.
// Lines must be split at every junction.
//
// Microbasin colors: polygons are neighbours when they share a vertex (within
// about 0.1 m). Colors are assigned by DSatur (most constrained polygon
// first), preferring the least used color overall and then the one least used
// among the polygons two steps away, so the 10 colors stay balanced and spread.
const fs = require("node:fs");

const DECIMALS = 7;
const SCALE = 10 ** DECIMALS;
const TYPES = ["generico", "curvas", "drenagem", "microbacias"];
const COLOR_COUNT = 10;
// Vertex match tolerance for microbasin neighbours, in degrees (about 0.1 m).
const NEIGHBOUR_TOLERANCE = 1e-6;
// Attribute area/perimeter farther than this from the geometry is reported.
const MEASURE_TOLERANCE = 0.05;
// WGS84 ellipsoid, for lengths and areas.
const A = 6378137;
const E2 = 6.69437999014e-3;
const UNITS = {
  m: ["length", 1], km: ["length", 1000],
  "m²": ["area", 1], m2: ["area", 1], "sq m": ["area", 1],
  ha: ["area", 1e4],
  "km²": ["area", 1e6], km2: ["area", 1e6], "sq km": ["area", 1e6],
};
const BASE_UNIT = { length: "m", area: "ha" };

class PrepareError extends Error {}

const round = (value) => Math.round(value * SCALE) / SCALE;
const roundTo = (value, decimals) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const key = ([x, y]) => `${round(x).toFixed(DECIMALS)},${round(y).toFixed(DECIMALS)}`;
const describe = (feature) => `id ${feature.properties.id}`;

function list(items, limit = 10) {
  return items.slice(0, limit).join("; ") + (items.length > limit ? `; e mais ${items.length - limit}` : "");
}

// "17.977" -> 17.977, "17,977" -> 17.977, "1,080.5" -> 1080.5, "1.234.567" -> 1234567.
function parseNumber(text) {
  if (!/^-?\d[\d.,]*$/.test(text)) return undefined;
  const count = (character) => text.split(character).length - 1;
  const [dots, commas] = [count("."), count(",")];
  let normalized = text;
  if (dots && commas) {
    const decimal = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    if (count(decimal) > 1) return undefined;
    normalized = text.split(decimal === "." ? "," : ".").join("").replace(",", ".");
  } else if (dots > 1 || commas > 1) {
    const separator = dots > 1 ? "." : ",";
    if (!text.replace(/^-/, "").split(separator).slice(1).every((group) => group.length === 3)) return undefined;
    normalized = text.split(separator).join("");
  } else if (commas) {
    normalized = text.replace(",", ".");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

// Number or Global Mapper text ("1080 m", "17.977 ha", "45") -> { value, unit }; unit null when absent.
function parseMeasure(value) {
  if (typeof value === "number") return Number.isFinite(value) ? { value, unit: null } : undefined;
  if (typeof value !== "string") return undefined;
  const match = /^\s*(-?\d[\d.,]*)\s*([a-zA-Z²][a-zA-Z²2 ]*?)?\s*$/.exec(value);
  if (!match) return undefined;
  const number = parseNumber(match[1]);
  if (number === undefined) return undefined;
  const unit = match[2] ? match[2].toLowerCase().replace(/\s+/g, " ") : null;
  if (unit && !(unit in UNITS)) return undefined;
  return { value: number, unit };
}

// Converts a measure with a unit to the target unit of the same kind.
function inUnit(measure, target, where) {
  const [kind, factor] = UNITS[measure.unit];
  const [targetKind, targetFactor] = UNITS[target];
  if (kind !== targetKind) throw new PrepareError(`Unidade "${measure.unit}" em ${where} não é de ${targetKind === "area" ? "área" : "comprimento"}.`);
  return measure.value * factor / targetFactor;
}

function checkPosition(position, where) {
  if (!Array.isArray(position) || position.length < 2 || !position.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new PrepareError(`Coordenada inválida em ${where}.`);
  }
  if (Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) {
    throw new PrepareError(`Coordenada ${position.slice(0, 2).join(", ")} em ${where} não está em graus. Exporte do Global Mapper em WGS84 (EPSG:4326), não em UTM.`);
  }
}

// 2D, rounded, without consecutive duplicates created by the rounding.
function line(positions, where, minimum) {
  const out = [];
  for (const position of positions) {
    checkPosition(position, where);
    const next = [round(position[0]), round(position[1])];
    const last = out.at(-1);
    if (!last || last[0] !== next[0] || last[1] !== next[1]) out.push(next);
  }
  if (out.length < minimum) throw new PrepareError(`Geometria degenerada em ${where}: menos de ${minimum} vértices distintos após arredondar para ${DECIMALS} casas.`);
  return out;
}

function ring(positions, where) {
  const out = line(positions, where, 3);
  const [first, last] = [out[0], out.at(-1)];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([...first]);
  if (out.length < 4) throw new PrepareError(`Anel degenerado em ${where} após arredondar.`);
  return out;
}

function geometry(value, where) {
  if (!value) return value;
  const c = value.coordinates;
  switch (value.type) {
    case "Point": checkPosition(c, where); return { type: "Point", coordinates: [round(c[0]), round(c[1])] };
    case "MultiPoint": return { type: "MultiPoint", coordinates: c.map((position) => { checkPosition(position, where); return [round(position[0]), round(position[1])]; }) };
    case "LineString": return { type: "LineString", coordinates: line(c, where, 2) };
    case "MultiLineString": return { type: "MultiLineString", coordinates: c.map((part) => line(part, where, 2)) };
    case "Polygon": return { type: "Polygon", coordinates: c.map((part) => ring(part, where)) };
    case "MultiPolygon": return { type: "MultiPolygon", coordinates: c.map((polygon) => polygon.map((part) => ring(part, where))) };
    case "GeometryCollection": return { type: "GeometryCollection", geometries: value.geometries.map((item) => geometry(item, where)) };
    default: throw new PrepareError(`Tipo de geometria não suportado em ${where}: ${value.type}.`);
  }
}

// Local ellipsoid radii (meridian, normal) at a latitude in degrees.
function radii(latitude) {
  const phi = latitude * Math.PI / 180;
  const w = Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
  return { meridian: A * (1 - E2) / w ** 3, normal: A / w, phi };
}

// Geodesic length on the WGS84 ellipsoid with local radii per segment
// (error far below 1 mm for the short segments of a drainage line).
function lengthMeters(positions) {
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const [lon1, lat1] = positions[i - 1];
    const [lon2, lat2] = positions[i];
    const { meridian, normal, phi } = radii((lat1 + lat2) / 2);
    const dx = ((lon2 - lon1) * Math.PI / 180) * normal * Math.cos(phi);
    const dy = ((lat2 - lat1) * Math.PI / 180) * meridian;
    total += Math.hypot(dx, dy);
  }
  return total;
}

// Ring area in m², projected on the local ellipsoid radii at the ring's mean
// latitude (well under 0.1% for watershed-sized polygons).
function ringAreaMeters(positions) {
  const latitude = positions.reduce((sum, [, lat]) => sum + lat, 0) / positions.length;
  const { meridian, normal, phi } = radii(latitude);
  const x = (lon) => lon * Math.PI / 180 * normal * Math.cos(phi);
  const y = (lat) => lat * Math.PI / 180 * meridian;
  let twice = 0;
  for (let i = 1; i < positions.length; i++) {
    twice += x(positions[i - 1][0]) * y(positions[i][1]) - x(positions[i][0]) * y(positions[i - 1][1]);
  }
  return Math.abs(twice) / 2;
}

const polygonsOf = (value) => value?.type === "Polygon" ? [value.coordinates] : value?.type === "MultiPolygon" ? value.coordinates : [];
const linesOf = (value) => value?.type === "LineString" ? [value.coordinates] : value?.type === "MultiLineString" ? value.coordinates : [];

// Outer rings minus holes, in m².
function areaMeters(value) {
  return polygonsOf(value).reduce((sum, [outer, ...holes]) => sum + ringAreaMeters(outer) - holes.reduce((inner, hole) => inner + ringAreaMeters(hole), 0), 0);
}

// Every ring, holes included, in m.
function perimeterMeters(value) {
  return polygonsOf(value).flat().reduce((sum, part) => sum + lengthMeters(part), 0);
}

function checkCrs(data) {
  const name = data.crs?.properties?.name;
  if (name && !/CRS84|EPSG::?4326|EPSG:4326/i.test(name)) {
    throw new PrepareError(`CRS "${name}" não é WGS84 geográfico. Exporte do Global Mapper em WGS84 (EPSG:4326).`);
  }
}

function prepareContours(features, notes, interval) {
  if (!(interval > 0)) throw new PrepareError("--intervalo-mestra deve ser um número maior que zero.");
  const missing = [];
  for (const feature of features) {
    const { ELEVATION, ...rest } = feature.properties;
    const measure = parseMeasure(ELEVATION);
    if (!measure) { missing.push(describe(feature)); continue; }
    const cota = measure.unit ? roundTo(inUnit(measure, "m", describe(feature)), 6) : measure.value;
    const remainder = Math.abs(cota % interval);
    const mestra = remainder < 1e-6 || Math.abs(remainder - interval) < 1e-6;
    feature.properties = { id: rest.id, cota_m: cota, mestra, ...rest };
  }
  if (missing.length) throw new PrepareError(`${missing.length} curva(s) sem ELEVATION numérico: ${list(missing)}. Confira o atributo exportado pelo Global Mapper.`);
  const masters = features.filter((feature) => feature.properties.mestra).length;
  notes.push(`Curvas: ELEVATION renomeado para cota_m; ${masters} de ${features.length} são mestras (a cada ${interval} m).`);
}

// comprimento_m from the attribute (converted to m) or from the 2D geometry.
function lineLength(feature) {
  const given = parseMeasure(feature.properties.comprimento_m);
  if (given) return given.unit ? roundTo(inUnit(given, "m", describe(feature)), 3) : given.value;
  return Math.round(linesOf(feature.geometry).reduce((sum, part) => sum + lengthMeters(part), 0) * 10) / 10;
}

function prepareDrainage(features, originals, notes) {
  // A complete STRAHLER attribute is kept (only cleaned); topology runs only when it is missing.
  const given = features.map((feature) => parseMeasure(feature.properties.STRAHLER));
  const valid = given.map((measure) => Boolean(measure && measure.unit === null && Number.isInteger(measure.value) && measure.value >= 1));
  if (features.length && valid.every(Boolean)) {
    for (const [index, feature] of features.entries()) {
      const { STRAHLER, comprimento_m, ...rest } = feature.properties;
      feature.properties = { id: rest.id, STRAHLER: given[index].value, comprimento_m: lineLength(feature), ...rest };
    }
    const counts = {};
    for (const feature of features) counts[feature.properties.STRAHLER] = (counts[feature.properties.STRAHLER] ?? 0) + 1;
    notes.push(`Drenagem: STRAHLER da entrada mantido em ${features.length} trechos (ordens ${Object.entries(counts).map(([order, count]) => `${order}: ${count}`).join(", ")}); topologia não recalculada.`);
    return;
  }
  // Some values but not all valid: stop instead of mixing given and computed orders.
  // Empty everywhere (missing, null, "") counts as missing.
  if (given.some(Boolean)) {
    const invalid = features.filter((_, index) => !valid[index]).map(describe);
    throw new PrepareError(`STRAHLER ausente ou inválido em ${invalid.length} de ${features.length} trecho(s): ${list(invalid)}. Complete o atributo (inteiro a partir de 1) ou remova-o para calcular pela topologia.`);
  }

  const segments = [];
  const undirected = [];
  for (const [index, feature] of features.entries()) {
    const source = originals[index].geometry;
    if (!source || source.type !== "LineString") {
      throw new PrepareError(`Drenagem só aceita LineString (${describe(feature)} é ${source?.type ?? "sem geometria"}). Separe MultiLineString em linhas simples antes.`);
    }
    const coords = source.coordinates;
    const [z1, z2] = [coords[0][2], coords.at(-1)[2]];
    const start = key(coords[0]);
    const end = key(coords.at(-1));
    if (start === end) { undirected.push(`${describe(feature)} (linha fechada)`); continue; }
    if (!Number.isFinite(z1) || !Number.isFinite(z2)) { undirected.push(`${describe(feature)} (sem Z)`); continue; }
    if (z1 === z2) { undirected.push(`${describe(feature)} (Z inicial = Z final = ${z1})`); continue; }
    const reversed = z1 < z2;
    if (reversed) feature.geometry.coordinates.reverse();
    segments.push({ feature, up: reversed ? end : start, down: reversed ? start : end, reversed });
  }
  if (undirected.length) {
    throw new PrepareError(`Rede sem sentido definido: ${undirected.length} trecho(s) sem Z de início/fim distintos: ${list(undirected)}. Exporte a drenagem com Z (3D) do Global Mapper ou corrija esses trechos.`);
  }

  const leaving = new Map();
  const arriving = new Map();
  for (const segment of segments) {
    if (!leaving.has(segment.up)) leaving.set(segment.up, []);
    leaving.get(segment.up).push(segment);
    if (!arriving.has(segment.down)) arriving.set(segment.down, []);
    arriving.get(segment.down).push(segment);
  }
  const multipleOutlets = segments
    .filter((segment) => (leaving.get(segment.down)?.length ?? 0) > 1)
    .map((segment) => `${describe(segment.feature)} -> ${leaving.get(segment.down).map((next) => describe(next.feature)).join(" e ")}`);
  if (multipleOutlets.length) {
    throw new PrepareError(`${multipleOutlets.length} trecho(s) com mais de uma saída (bifurcação): ${list(multipleOutlets)}. A ordem de Strahler exige uma única saída por trecho; corrija o sentido (Z) ou remova o braço.`);
  }

  // Kahn order: a line is ready when every line arriving at its upstream end is done.
  const pending = new Map(segments.map((segment) => [segment, arriving.get(segment.up)?.length ?? 0]));
  const queue = segments.filter((segment) => pending.get(segment) === 0);
  let done = 0;
  while (queue.length) {
    const segment = queue.shift();
    const inflow = (arriving.get(segment.up) ?? []).map((item) => item.order);
    const top = Math.max(0, ...inflow);
    segment.order = inflow.length === 0 ? 1 : inflow.filter((order) => order === top).length >= 2 ? top + 1 : top;
    done++;
    for (const next of leaving.get(segment.down) ?? []) {
      pending.set(next, pending.get(next) - 1);
      if (pending.get(next) === 0) queue.push(next);
    }
  }
  if (done !== segments.length) {
    const cycle = segments.filter((segment) => segment.order === undefined).map((segment) => describe(segment.feature));
    throw new PrepareError(`Rede sem sentido definido: ciclo entre ${cycle.length} trecho(s) (${list(cycle)}). Confira o Z de início e fim desses trechos.`);
  }

  // A tributary ending on an inner vertex of another line is not a confluence.
  const inner = new Map();
  for (const segment of segments) {
    for (const position of segment.feature.geometry.coordinates.slice(1, -1)) inner.set(key(position), segment);
  }
  const touching = segments
    .filter((segment) => !leaving.has(segment.down) && inner.has(segment.down))
    .map((segment) => `${describe(segment.feature)} em ${describe(inner.get(segment.down).feature)}`);
  if (touching.length) notes.push(`ATENÇÃO: ${touching.length} trecho(s) terminam no meio de outra linha e não contam como confluência: ${list(touching)}. Quebre as linhas nas confluências e rode de novo.`);

  for (const segment of segments) {
    const { STRAHLER, comprimento_m, ...rest } = segment.feature.properties;
    segment.feature.properties = { id: rest.id, STRAHLER: segment.order, comprimento_m: lineLength(segment.feature), ...rest };
  }
  const counts = {};
  for (const segment of segments) counts[segment.order] = (counts[segment.order] ?? 0) + 1;
  const outlets = segments.filter((segment) => !leaving.has(segment.down)).length;
  const reversed = segments.filter((segment) => segment.reversed).length;
  notes.push(`Drenagem: STRAHLER calculado pela topologia; ${segments.length} trechos, ${outlets} exutório(s), ordens ${Object.entries(counts).map(([order, count]) => `${order}: ${count}`).join(", ")}.`);
  if (reversed) notes.push(`Drenagem: ${reversed} trecho(s) desenhados de jusante para montante foram invertidos.`);
}

// Polygons sharing a vertex (within NEIGHBOUR_TOLERANCE) are neighbours.
function polygonNeighbours(features) {
  const cells = new Map();
  const cell = (x, y) => `${x},${y}`;
  const vertices = features.map((feature) => polygonsOf(feature.geometry).flat(2));
  vertices.forEach((positions, index) => {
    for (const [lon, lat] of positions) {
      const id = cell(Math.floor(lon / NEIGHBOUR_TOLERANCE), Math.floor(lat / NEIGHBOUR_TOLERANCE));
      if (!cells.has(id)) cells.set(id, new Set());
      cells.get(id).add(index);
    }
  });
  return vertices.map((positions, index) => {
    const found = new Set();
    for (const [lon, lat] of positions) {
      const [x, y] = [Math.floor(lon / NEIGHBOUR_TOLERANCE), Math.floor(lat / NEIGHBOUR_TOLERANCE)];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(cell(x + dx, y + dy)) ?? []) if (other !== index) found.add(other);
      }
    }
    return [...found].sort((a, b) => a - b);
  });
}

// DSatur with COLOR_COUNT colors: no neighbours share a color; among the free
// colors, the least used overall (balanced counts), then the one least used
// two steps away (spread on the map).
function colorPolygons(neighbours) {
  const colors = neighbours.map(() => -1);
  const usage = Array(COLOR_COUNT).fill(0);
  const used = (nodes) => new Set(nodes.map((node) => colors[node]).filter((color) => color >= 0));
  for (let step = 0; step < neighbours.length; step++) {
    let node = -1;
    let best = [-1, -1];
    for (let index = 0; index < neighbours.length; index++) {
      if (colors[index] >= 0) continue;
      const score = [used(neighbours[index]).size, neighbours[index].length];
      if (score[0] > best[0] || (score[0] === best[0] && score[1] > best[1])) { node = index; best = score; }
    }
    let forbidden = used(neighbours[node]);
    if (forbidden.size >= COLOR_COUNT) {
      // Rare repair: move one neighbour whose color is unique around the node to another free color.
      for (const other of neighbours[node]) {
        const color = colors[other];
        if (neighbours[node].filter((item) => colors[item] === color).length !== 1) continue;
        const alternative = [...Array(COLOR_COUNT).keys()].find((candidate) => candidate !== color && !used(neighbours[other]).has(candidate));
        if (alternative === undefined) continue;
        usage[color]--; usage[alternative]++;
        colors[other] = alternative;
        break;
      }
      forbidden = used(neighbours[node]);
      if (forbidden.size >= COLOR_COUNT) throw new PrepareError(`Não foi possível colorir a microbacia de índice ${node + 1} com ${COLOR_COUNT} cores sem repetir vizinhas.`);
    }
    const direct = new Set(neighbours[node]);
    const around = new Set(neighbours[node].flatMap((other) => neighbours[other]).filter((other) => other !== node && !direct.has(other)));
    const nearby = Array(COLOR_COUNT).fill(0);
    for (const other of around) if (colors[other] >= 0) nearby[colors[other]]++;
    const free = [...Array(COLOR_COUNT).keys()].filter((color) => !forbidden.has(color));
    free.sort((a, b) => usage[a] - usage[b] || nearby[a] - nearby[b] || a - b);
    colors[node] = free[0];
    usage[free[0]]++;
  }
  return colors;
}

// Attribute measure converted to the target unit; null when missing or without unit.
function attributeMeasure(value, target, where) {
  const measure = parseMeasure(value);
  if (!measure || !measure.unit) return null;
  return inUnit(measure, target, where);
}

function prepareMicrobasins(features, notes) {
  const notPolygon = features.filter((feature) => !polygonsOf(feature.geometry).length).map(describe);
  if (notPolygon.length) throw new PrepareError(`Microbacias só aceita Polygon ou MultiPolygon: ${list(notPolygon)}.`);
  const fromGeometry = { area: [], perimeter: [] };
  const mismatch = [];
  for (const feature of features) {
    const where = describe(feature);
    const { ENCLOSED_AREA, PERIMETER, area_ha, perimetro_km, cor, nome, ...rest } = feature.properties;
    const geometryArea = areaMeters(feature.geometry) / 1e4;
    const geometryPerimeter = perimeterMeters(feature.geometry) / 1000;
    let area = attributeMeasure(ENCLOSED_AREA, "ha", where);
    let perimeter = attributeMeasure(PERIMETER, "km", where);
    if (area === null) { area = roundTo(geometryArea, 3); fromGeometry.area.push(where); } else area = roundTo(area, 6);
    if (perimeter === null) { perimeter = roundTo(geometryPerimeter, 3); fromGeometry.perimeter.push(where); } else perimeter = roundTo(perimeter, 6);
    if (Math.abs(area - geometryArea) > MEASURE_TOLERANCE * geometryArea || Math.abs(perimeter - geometryPerimeter) > MEASURE_TOLERANCE * geometryPerimeter) {
      mismatch.push(`${where} (${area} ha × ${roundTo(geometryArea, 3)} ha; ${perimeter} km × ${roundTo(geometryPerimeter, 3)} km)`);
    }
    feature.properties = { id: rest.id, nome: `Microbacia ${rest.id}`, area_ha: area, perimetro_km: perimeter, ...rest };
  }
  const neighbours = polygonNeighbours(features);
  const colors = colorPolygons(neighbours);
  features.forEach((feature, index) => {
    const { id, nome, area_ha, perimetro_km, ...rest } = feature.properties;
    feature.properties = { id, nome, area_ha, perimetro_km, cor: colors[index], ...rest };
  });
  const clash = neighbours.flatMap((others, index) => others.filter((other) => colors[other] === colors[index]).map((other) => `${index + 1}/${other + 1}`));
  if (clash.length) throw new PrepareError(`Vizinhas com a mesma cor: ${list(clash)}.`);
  const usage = Array(COLOR_COUNT).fill(0);
  for (const color of colors) usage[color]++;
  notes.push(`Microbacias: nome "Microbacia N", area_ha e perimetro_km numéricos; cor 0–${COLOR_COUNT - 1} sem vizinhas iguais (${usage.map((count, color) => `${color}: ${count}`).join(", ")}).`);
  const isolated = neighbours.filter((others) => !others.length).length;
  if (features.length > 1 && isolated) notes.push(`Microbacias: ${isolated} sem vizinha por vértice comum. Se deveriam tocar outras, confira se as bordas compartilham vértices.`);
  if (fromGeometry.area.length) notes.push(`Microbacias: ENCLOSED_AREA ausente ou sem unidade em ${fromGeometry.area.length}; área calculada pela geometria.`);
  if (fromGeometry.perimeter.length) notes.push(`Microbacias: PERIMETER ausente ou sem unidade em ${fromGeometry.perimeter.length}; perímetro calculado pela geometria.`);
  if (mismatch.length) notes.push(`ATENÇÃO: área ou perímetro do atributo difere mais de ${MEASURE_TOLERANCE * 100}% da geometria em ${mismatch.length}: ${list(mismatch, 5)}. Confira a unidade exportada.`);
}

// Texts with a unit -> numbers, per attribute (see the header for the rules).
function convertMeasures(features, notes) {
  const keys = new Set(features.flatMap((feature) => Object.keys(feature.properties)));
  keys.delete("id");
  keys.delete("nome");
  for (const name of keys) {
    const values = features.map((feature) => feature.properties[name]);
    const texts = values.filter((value) => typeof value === "string");
    if (!texts.length) continue;
    if (!values.every((value) => value === null || value === undefined || typeof value === "number" || typeof value === "string")) continue;
    const measures = texts.map(parseMeasure);
    if (!measures.every((measure) => measure && measure.unit)) continue;
    const kinds = new Set(measures.map((measure) => UNITS[measure.unit][0]));
    if (kinds.size > 1) { notes.push(`ATENÇÃO: ${name} mistura unidades de área e comprimento; mantido como texto.`); continue; }
    const units = new Set(measures.map((measure) => measure.unit));
    const target = units.size === 1 ? [...units][0] : BASE_UNIT[[...kinds][0]];
    for (const feature of features) {
      const measure = parseMeasure(feature.properties[name]);
      if (typeof feature.properties[name] === "string" && measure) feature.properties[name] = roundTo(inUnit(measure, target, describe(feature)), 6);
    }
    notes.push(`${name}: texto com unidade convertido para número (${target}${units.size > 1 ? `; ${[...units].join(", ")} unificados` : ""}).`);
  }
}

function hasZ(value) {
  if (!value) return false;
  if (value.type === "GeometryCollection") return value.geometries.some(hasZ);
  let position = value.coordinates;
  while (Array.isArray(position?.[0])) position = position[0];
  return Array.isArray(position) && position.length > 2;
}

const defaultName = {
  generico: (properties) => `Feição ${properties.id}`,
  curvas: (properties) => `Curva ${properties.cota_m} m`,
  drenagem: (properties) => `Trecho ${properties.id}`,
  microbacias: (properties) => `Microbacia ${properties.id}`,
};

// Pure part, shared with checks.
function prepareGeoJson(data, options = {}) {
  const type = options.type ?? "generico";
  if (!TYPES.includes(type)) throw new PrepareError(`--tipo deve ser ${TYPES.join(", ")}.`);
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new PrepareError("A entrada não é um GeoJSON FeatureCollection.");
  checkCrs(data);
  const notes = [];
  const hadStyle = data.features.some((feature) => feature?.properties && "KML_STYLE" in feature.properties);
  const hadZ = data.features.some((feature) => hasZ(feature?.geometry));
  let namedFrom = 0;
  const features = data.features.map((feature, index) => {
    const id = index + 1;
    const { KML_STYLE, id: _previousId, ...properties } = feature?.properties ?? {};
    // nome from nome, NAME or name (the original attribute is dropped).
    if (!(typeof properties.nome === "string" && properties.nome.trim())) {
      const source = ["NAME", "name"].find((name) => typeof properties[name] === "string" && properties[name].trim());
      delete properties.nome;
      if (source) { properties.nome = properties[source].trim(); delete properties[source]; namedFrom++; }
    }
    return {
      type: "Feature",
      id,
      properties: { id, ...properties },
      geometry: geometry(feature?.geometry, `feição ${id}`),
    };
  });
  if (data.features.some((feature) => feature?.properties && "id" in feature.properties)) notes.push("Atributo id da entrada substituído pelo id sequencial.");
  notes.push(`${features.length} feições; id sequencial 1–${features.length} e nome${hadStyle ? " no lugar de KML_STYLE" : ""}.`);
  notes.push(`Coordenadas em 2D${hadZ ? " (Z removido)" : ""}, arredondadas para ${DECIMALS} casas.`);
  if (type === "curvas") prepareContours(features, notes, options.masterInterval ?? 15);
  if (type === "drenagem") prepareDrainage(features, data.features, notes);
  if (type === "microbacias") prepareMicrobasins(features, notes);
  convertMeasures(features, notes);
  const defaults = [];
  for (const feature of features) {
    const { id, nome, ...rest } = feature.properties;
    feature.properties = { id, nome: nome ?? defaultName[type](feature.properties), ...rest };
    if (nome === undefined) defaults.push(feature.properties.nome);
  }
  if (type !== "microbacias") notes.push(`nome: ${namedFrom ? `${namedFrom} de NAME/name` : "nenhum NAME/name na entrada"}${defaults.length ? `; ${defaults.length} com o padrão (ex.: "${defaults[0]}")` : ""}.`);
  return { geojson: { type: "FeatureCollection", features }, notes };
}

// One feature per line: compact for the R2 and still readable in a diff.
function serialize(collection) {
  return `{"type":"FeatureCollection","features":[\n${collection.features.map((feature) => JSON.stringify(feature)).join(",\n")}\n]}\n`;
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const value = argv[++i];
    if (value === undefined) throw new PrepareError(`Valor ausente para ${arg}.`);
    if (arg === "--tipo") options.type = value;
    else if (arg === "--intervalo-mestra") options.masterInterval = Number(value);
    else throw new PrepareError(`Opção desconhecida: ${arg}`);
  }
  if (positional.length !== 2 || !options.type) {
    throw new PrepareError(`Uso: node scripts/prepare-geojson.cjs <entrada.geojson> <saida.geojson> --tipo ${TYPES.join("|")} [--intervalo-mestra 15]`);
  }
  [options.input, options.output] = positional;
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.input === options.output) throw new PrepareError("A saída deve ser um arquivo diferente da entrada.");
  const text = fs.readFileSync(options.input, "utf8").replace(/^﻿/, "");
  let data;
  try { data = JSON.parse(text); } catch (error) { throw new PrepareError(`JSON inválido em ${options.input}: ${error.message}`); }
  const { geojson, notes } = prepareGeoJson(data, options);
  const output = serialize(geojson);
  fs.writeFileSync(options.output, output);
  const before = Buffer.byteLength(text);
  const after = Buffer.byteLength(output);
  console.log(`Gerado ${options.output} (${(after / 1024).toFixed(0)} KB; entrada ${(before / 1024).toFixed(0)} KB).`);
  for (const note of notes) console.log(`- ${note}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof PrepareError ? `Erro: ${error.message}` : error);
    process.exitCode = 1;
  }
}

module.exports = { prepareGeoJson, serialize, lengthMeters, areaMeters, perimeterMeters, parseMeasure, polygonNeighbours, colorPolygons, PrepareError };
