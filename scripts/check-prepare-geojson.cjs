// Checks scripts/prepare-geojson.cjs with synthetic data near 10°E 20°N,
// unrelated to any property. No network. Run: node scripts/check-prepare-geojson.cjs
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { prepareGeoJson, lengthMeters, areaMeters, parseMeasure, polygonNeighbours, colorPolygons, PrepareError } = require("./prepare-geojson.cjs");

const collection = (features) => ({ type: "FeatureCollection", features });
const feature = (geometry, properties = {}) => ({ type: "Feature", properties: { KML_STYLE: "Global Mapper style", ...properties }, geometry });
const lineString = (...coordinates) => ({ type: "LineString", coordinates });
const fails = (data, options, pattern) => assert.throws(() => prepareGeoJson(data, options), (error) => error instanceof PrepareError && pattern.test(error.message), String(pattern));

// 1. Common steps: Z removed, 7 decimals, KML_STYLE -> sequential id, rings kept closed.
let { geojson, notes } = prepareGeoJson(collection([
  feature(lineString([10.123456789, 20.987654321, 812.4], [10.12345681, 20.98765429, 811], [10.2, 21.1, 800]), { nome: "a", id: 99 }),
  feature({ type: "Polygon", coordinates: [[[10, 20, 1], [10.1, 20, 1], [10.1, 20.1, 1], [10, 20, 1]]] }, { nome: "b" }),
  feature({ type: "Point", coordinates: [10.000000049, 20.000000051, 5] }),
]), { type: "generico" });
assert.deepEqual(geojson.features.map((item) => [item.id, item.properties.id]), [[1, 1], [2, 2], [3, 3]]);
assert.ok(geojson.features.every((item) => !("KML_STYLE" in item.properties)));
assert.equal(Object.keys(geojson.features[0].properties)[0], "id");
assert.equal(geojson.features[0].properties.nome, "a");
assert.deepEqual(geojson.features[0].geometry.coordinates, [[10.1234568, 20.9876543], [10.2, 21.1]], "Rounded, 2D, repeated vertex dropped");
assert.deepEqual(geojson.features[1].geometry.coordinates[0].at(-1), [10, 20]);
assert.deepEqual(geojson.features[2].geometry.coordinates, [10, 20.0000001]);
assert.ok(notes.some((note) => /Z removido/.test(note)) && notes.some((note) => /KML_STYLE/.test(note)));
assert.equal(geojson.crs, undefined);
fails(collection([feature(lineString([500000, 7600000, 1], [500100, 7600100, 1]))]), { type: "generico" }, /não está em graus/);
fails({ ...collection([]), crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::31983" } } }, { type: "generico" }, /não é WGS84/);
fails(collection([feature(lineString([10, 20], [10.00000001, 20.00000001]))]), { type: "generico" }, /degenerada/);
fails(collection([]), { type: "outro" }, /--tipo/);
// nome: kept, taken from NAME/name (dropped) or a default per type.
assert.deepEqual(geojson.features.map((item) => item.properties.nome), ["a", "b", "Feição 3"]);
({ geojson } = prepareGeoJson(collection([feature(lineString([10, 20], [10.1, 20]), { NAME: " Divisa norte " }), feature(lineString([10, 20], [10.1, 20]), { name: "Divisa sul" })]), { type: "generico" }));
assert.deepEqual(geojson.features.map((item) => Object.keys(item.properties)), [["id", "nome"], ["id", "nome"]]);
assert.deepEqual(geojson.features.map((item) => item.properties.nome), ["Divisa norte", "Divisa sul"]);

// 1b. Global Mapper texts with a unit become numbers, in every type.
assert.deepEqual(["1080 m", "17.977 ha", "2.339 km", "17,977 ha", "1,080.5 m", "1.234.567 m²", "12 sq m", "3km", "45", 7].map(parseMeasure), [
  { value: 1080, unit: "m" }, { value: 17.977, unit: "ha" }, { value: 2.339, unit: "km" }, { value: 17.977, unit: "ha" },
  { value: 1080.5, unit: "m" }, { value: 1234567, unit: "m²" }, { value: 12, unit: "sq m" }, { value: 3, unit: "km" },
  { value: 45, unit: null }, { value: 7, unit: null },
]);
assert.deepEqual(["Rua 2 m", "12 ft", "1.2.3 m", "", null].map(parseMeasure), [undefined, undefined, undefined, undefined, undefined]);
({ geojson, notes } = prepareGeoJson(collection([
  feature(lineString([10, 20], [10.1, 20]), { ALTURA: "1080 m", AREA: "17.977 ha", COMPR: "850 m", CODIGO: "007", OBS: "Rua 2 m", VAZIO: null }),
  feature(lineString([10, 20], [10.1, 20]), { ALTURA: "1081.5 m", AREA: "2 ha", COMPR: "2.339 km", CODIGO: "008", OBS: "Rua 3", VAZIO: null }),
]), { type: "generico" }));
assert.deepEqual(geojson.features.map((item) => [item.properties.ALTURA, item.properties.AREA, item.properties.COMPR]), [[1080, 17.977, 850], [1081.5, 2, 2339]], "Mixed m and km become m");
assert.deepEqual(geojson.features.map((item) => [item.properties.CODIGO, item.properties.OBS, item.properties.VAZIO]), [["007", "Rua 2 m", null], ["008", "Rua 3", null]], "Codes and free text stay text");
assert.ok(notes.some((note) => /ALTURA: .*\(m\)/.test(note)) && notes.some((note) => /AREA: .*\(ha\)/.test(note)) && notes.some((note) => /COMPR: .*m, km unificados/.test(note)));
for (const type of ["curvas", "drenagem", "microbacias"]) {
  const square = { type: "Polygon", coordinates: [[[10, 20], [10.001, 20], [10.001, 20.001], [10, 20.001], [10, 20]]] };
  const input = {
    curvas: feature(lineString([10, 20], [10.1, 20]), { ELEVATION: "1080 m", EXTRA: "2.339 km" }),
    drenagem: feature(lineString([10, 20], [10.1, 20]), { STRAHLER: "2", EXTRA: "2.339 km" }),
    microbacias: feature(square, { STREAM_ID: 1, ENCLOSED_AREA: "1.1 ha", PERIMETER: "0.4 km", EXTRA: "2.339 km" }),
  }[type];
  const output = prepareGeoJson(collection([input]), { type }).geojson.features[0];
  assert.equal(output.properties.EXTRA, 2.339, `${type} converts texts with a unit`);
  assert.ok(!("KML_STYLE" in output.properties) && typeof output.properties.nome === "string" && output.properties.id === 1, `${type} swaps KML_STYLE for id and nome`);
  assert.ok(JSON.stringify(output.geometry.coordinates).match(/-?\d+(\.\d+)?/g).every((number) => (number.split(".")[1] ?? "").length <= 7));
}

// 2. Contours: ELEVATION -> cota_m, mestra every 15 m (default) or every 10 m.
const contours = collection(Array.from({ length: 16 }, (_, i) => feature(lineString([10, 20 + i / 1000, i * 3], [10.01, 20 + i / 1000, i * 3]), { ELEVATION: i * 3 })));
({ geojson } = prepareGeoJson(contours, { type: "curvas" }));
const masters = (result) => result.features.filter((item) => item.properties.mestra).map((item) => item.properties.cota_m);
assert.deepEqual(masters(geojson), [0, 15, 30, 45]);
assert.ok(geojson.features.every((item) => !("ELEVATION" in item.properties) && typeof item.properties.mestra === "boolean"));
assert.deepEqual(Object.keys(geojson.features[1].properties), ["id", "nome", "cota_m", "mestra"]);
assert.equal(geojson.features[1].properties.nome, "Curva 3 m");
assert.deepEqual(["1080 m", "1.08 km", "1080"].map((ELEVATION) => prepareGeoJson(collection([feature(lineString([10, 20], [10.1, 20]), { ELEVATION })]), { type: "curvas" }).geojson.features[0].properties.cota_m), [1080, 1080, 1080]);
fails(collection([feature(lineString([10, 20], [10.1, 20]), { ELEVATION: "3 ha" })]), { type: "curvas" }, /não é de comprimento/);
assert.deepEqual(masters(prepareGeoJson(contours, { type: "curvas", masterInterval: 10 }).geojson), [0, 30]);
assert.equal(prepareGeoJson(collection([feature(lineString([10, 20], [10.1, 20]), { ELEVATION: "45" })]), { type: "curvas" }).geojson.features[0].properties.cota_m, 45);
fails(collection([feature(lineString([10, 20], [10.1, 20]), { ELEVATION: null })]), { type: "curvas" }, /sem ELEVATION/);
fails(contours, { type: "curvas", masterInterval: 0 }, /intervalo-mestra/);

// 3. Drainage: Strahler from topology, Z gives the direction, endpoints matched with 7 decimals.
//   A, B -> J1 (order 2) -> J2 <- C (stays 2) -> J4 <- J3 (2, from D and E) -> outlet (3)
const A = [10.000, 20.010], B = [10.010, 20.010], C = [10.020, 20.006], D = [10.030, 20.010], E = [10.040, 20.010];
const J1 = [10.005, 20.005], J2 = [10.010, 20.000], J3 = [10.035, 20.004], J4 = [10.020, 19.995], O = [10.020, 19.985];
const z = (position, height) => [...position, height];
const network = [
  feature(lineString(z(A, 100), z(J1, 80)), { nome: "s1" }),
  feature(lineString(z(J1, 80), z(B, 100)), { nome: "s2 desenhado para montante" }),
  feature(lineString(z(J1, 80), [10.008, 20.002, 70], z(J2, 60)), { nome: "s3" }),
  feature(lineString(z(C, 90), [J2[0] + 3e-9, J2[1] - 3e-9, 61]), { nome: "s4 casado em 7 casas" }),
  feature(lineString(z(J2, 60), z(J4, 40)), { nome: "s5" }),
  feature(lineString(z(D, 95), z(J3, 70)), { nome: "s6" }),
  feature(lineString(z(E, 95), z(J3, 70)), { nome: "s7" }),
  feature(lineString(z(J3, 70), z(J4, 41)), { nome: "s8" }),
  feature(lineString(z(J4, 40), z(O, 30)), { nome: "s9", STRAHLER: null }),
];
({ geojson, notes } = prepareGeoJson(collection(network), { type: "drenagem" }));
const byName = Object.fromEntries(geojson.features.map((item) => [item.properties.nome, item.properties]));
assert.deepEqual(geojson.features.map((item) => item.properties.STRAHLER), [1, 1, 2, 1, 2, 1, 1, 2, 3]);
assert.deepEqual(geojson.features[1].geometry.coordinates, [B, J1], "Line drawn uphill is reversed to run downstream");
assert.ok(geojson.features.every((item) => item.geometry.coordinates.every((position) => position.length === 2)));
assert.deepEqual(Object.keys(byName.s9).slice(0, 4), ["id", "nome", "STRAHLER", "comprimento_m"]);
assert.ok(Math.abs(byName.s9.comprimento_m - lengthMeters([J4, O])) < 0.05);
assert.ok(notes.some((note) => /1 exutório/.test(note)) && notes.some((note) => /invertidos/.test(note)) && notes.some((note) => /calculado pela topologia/.test(note)));
// A complete STRAHLER is kept and only cleaned: no Z, direction or topology needed.
const given = [
  feature(lineString([10, 20, 5], [10.1, 20, 9]), { STREAM_ID: 4, STRAHLER: 2 }),
  feature({ type: "MultiLineString", coordinates: [[[10, 20], [10.01, 20]], [[10.02, 20], [10.03, 20]]] }, { STRAHLER: "1", comprimento_m: "1.5 km" }),
];
({ geojson, notes } = prepareGeoJson(collection(given), { type: "drenagem" }));
assert.deepEqual(geojson.features.map((item) => [item.properties.STRAHLER, item.properties.nome]), [[2, "Trecho 1"], [1, "Trecho 2"]]);
assert.deepEqual(geojson.features[0].geometry.coordinates, [[10, 20], [10.1, 20]], "Kept order: the line is not reversed");
assert.equal(geojson.features[0].properties.STREAM_ID, 4);
assert.ok(Math.abs(geojson.features[0].properties.comprimento_m - lengthMeters([[10, 20], [10.1, 20]])) < 0.05, "comprimento_m computed when missing");
assert.equal(geojson.features[1].properties.comprimento_m, 1500, "comprimento_m from the attribute, in m");
assert.ok(notes.some((note) => /STRAHLER da entrada mantido em 2 trechos/.test(note)));
fails(collection([...given, feature(lineString([10, 20], [10.1, 20]), { STRAHLER: null })]), { type: "drenagem" }, /STRAHLER ausente ou inválido em 1 de 3.*id 3/);
fails(collection([feature(lineString([10, 20], [10.1, 20]), { STRAHLER: 0 })]), { type: "drenagem" }, /STRAHLER ausente ou inválido/);
// Lengths on the WGS84 ellipsoid: 1° of longitude on the equator and 0.01° of latitude at 20°.
assert.ok(Math.abs(lengthMeters([[0, 0], [1, 0]]) - 111319.49) < 0.1);
assert.ok(Math.abs(lengthMeters([[10, 19.995], [10, 20.005]]) - 1107.04) < 0.1);
// A tributary ending on an inner vertex is reported, not silently counted.
({ notes } = prepareGeoJson(collection([...network, feature(lineString([10.009, 20.009, 99], [10.008, 20.002, 70]), { nome: "afluente no meio" })]), { type: "drenagem" }));
assert.ok(notes.some((note) => /meio de outra linha/.test(note)));

// 4. Drainage aborts with a clear message.
fails(collection([...network, feature(lineString(z(J1, 80), [10.0, 20.0, 50]), { nome: "braço" })]), { type: "drenagem" }, /mais de uma saída.*id 1 -> id 3 e id 10/);
fails(collection([...network.slice(0, 2), feature(lineString(z(J1, 80), z(J2, 80)))]), { type: "drenagem" }, /sem sentido definido.*id 3 \(Z inicial = Z final = 80\)/);
fails(collection([feature(lineString(A, J1))]), { type: "drenagem" }, /sem sentido definido.*sem Z/);
fails(collection([
  feature(lineString(z(A, 10), z(B, 5))), feature(lineString(z(B, 8), z(C, 3))), feature(lineString(z(C, 9), z(A, 2))),
]), { type: "drenagem" }, /ciclo entre 3/);
fails(collection([feature({ type: "MultiLineString", coordinates: [[z(A, 2), z(B, 1)]] })]), { type: "drenagem" }, /só aceita LineString/);

// 4b. Microbasins: a 6 x 5 grid of 0.001° squares exported by Global Mapper
// (shared vertices, Z, KML_STYLE, texts with units). Corner contact counts as neighbour.
const [columns, rows, size] = [6, 5, 0.001];
const cell = (column, row) => {
  const [x, y] = [10 + column * size, 20 + row * size];
  return [[x, y, 900], [x + size / 2, y, 900], [x + size, y, 901], [x + size, y + size, 902], [x, y + size, 903], [x, y, 900]];
};
const cellArea = areaMeters({ type: "Polygon", coordinates: [cell(0, 0)] }) / 1e4;
const basins = [];
for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
  const index = basins.length;
  basins.push(feature({ type: "Polygon", coordinates: [cell(column, row)] }, {
    STREAM_ID: 100 + index,
    // Units vary as in Global Mapper exports; one feature without ENCLOSED_AREA.
    ENCLOSED_AREA: index === 7 ? undefined : index % 3 === 0 ? `${(cellArea * 1e4).toFixed(1)} sq m` : `${cellArea.toFixed(3)} ha`,
    PERIMETER: index % 2 ? "0.400 km" : "420 m",
  }));
}
({ geojson, notes } = prepareGeoJson(collection(basins), { type: "microbacias" }));
const basin = geojson.features;
assert.deepEqual(Object.keys(basin[0].properties), ["id", "nome", "area_ha", "perimetro_km", "cor", "STREAM_ID"]);
assert.deepEqual(basin.slice(0, 3).map((item) => item.properties.nome), ["Microbacia 1", "Microbacia 2", "Microbacia 3"]);
assert.ok(basin.every((item) => typeof item.properties.area_ha === "number" && typeof item.properties.perimetro_km === "number" && Number.isInteger(item.properties.cor)));
assert.equal(basin[1].properties.area_ha, Number(cellArea.toFixed(3)), "ha text kept in ha");
assert.ok(Math.abs(basin[0].properties.area_ha - cellArea) < 1e-4, "sq m converted to ha");
assert.ok(Math.abs(basin[7].properties.area_ha - cellArea) < 1e-3, "Missing area computed from the geometry");
assert.equal(basin[0].properties.perimetro_km, 0.42, "m converted to km");
assert.equal(basin[1].properties.perimetro_km, 0.4);
assert.ok(notes.some((note) => /ENCLOSED_AREA ausente ou sem unidade em 1/.test(note)));
const at = (column, row) => basin[row * columns + column].properties.cor;
for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
    const [c, r] = [column + dx, row + dy];
    if (c >= 0 && c < columns && r < rows) assert.notEqual(at(column, row), at(c, r), `Neighbours ${column},${row} and ${c},${r} share a color`);
  }
}
const usage = Array(10).fill(0);
for (const item of basin) usage[item.properties.cor]++;
assert.ok(Math.max(...usage) - Math.min(...usage) <= 1, `10 colors balanced: ${usage}`);
assert.ok(basin.every((item) => item.geometry.coordinates[0].every((position) => position.length === 2)));
// Colors spread out: at most one repeat inside any 3 x 3 block of the grid.
for (let row = 0; row + 2 < rows; row++) for (let column = 0; column + 2 < columns; column++) {
  const block = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) block.push(at(column + dx, row + dy));
  assert.ok(new Set(block).size >= 8, `3 x 3 block at ${column},${row}: ${block}`);
}
// Neighbours by shared vertex (within about 0.1 m), not by bounding box.
assert.deepEqual(polygonNeighbours([
  { geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
  { geometry: { type: "Polygon", coordinates: [[[1 + 5e-8, 0], [2, 0], [1, 1], [1 + 5e-8, 0]]] } },
  { geometry: { type: "Polygon", coordinates: [[[5, 5], [6, 5], [6, 6], [5, 5]]] } },
]), [[1], [0], []]);
// Dense contact (a wheel of 12 around a hub) still gets valid colors.
const wheel = Array.from({ length: 13 }, (_, index) => index === 0 ? [...Array(12).keys()].map((item) => item + 1) : [0, ((index % 12) + 1), (((index + 10) % 12) + 1)]);
const wheelColors = colorPolygons(wheel);
wheel.forEach((others, index) => others.forEach((other) => assert.notEqual(wheelColors[index], wheelColors[other])));
assert.ok(wheelColors.every((color) => color >= 0 && color < 10));
fails(collection([feature(lineString([10, 20], [10.1, 20]))]), { type: "microbacias" }, /só aceita Polygon/);
({ notes } = prepareGeoJson(collection([feature({ type: "Polygon", coordinates: [cell(0, 0)] }, { ENCLOSED_AREA: "50 ha", PERIMETER: "0.42 km" })]), { type: "microbacias" }));
assert.ok(notes.some((note) => /ATENÇÃO: área ou perímetro/.test(note)), "Attribute far from the geometry is reported");

// 5. CLI: writes one feature per line and exits 1 with the message on errors.
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "cardeal-prepare-geojson-"));
try {
  const input = path.join(folder, "drenagem_global_mapper.geojson");
  const output = path.join(folder, "drenagem.geojson");
  fs.writeFileSync(input, "﻿" + JSON.stringify(collection(network)));
  const script = path.join(__dirname, "prepare-geojson.cjs");
  const stdout = execFileSync(process.execPath, [script, input, output, "--tipo", "drenagem"], { encoding: "utf8" });
  assert.match(stdout, /Gerado .*drenagem\.geojson/);
  const written = fs.readFileSync(output, "utf8");
  assert.equal(written.split("\n").length, network.length + 3);
  assert.deepEqual(JSON.parse(written).features.map((item) => item.properties.STRAHLER), [1, 1, 2, 1, 2, 1, 1, 2, 3]);
  fs.writeFileSync(input, JSON.stringify(collection([feature(lineString(A, J1))])));
  assert.throws(() => execFileSync(process.execPath, [script, input, output, "--tipo", "drenagem"], { stdio: "pipe" }), (error) => error.status === 1 && /Erro: Rede sem sentido definido/.test(String(error.stderr)));
  assert.throws(() => execFileSync(process.execPath, [script, input], { stdio: "pipe" }), (error) => error.status === 1 && /Uso:/.test(String(error.stderr)));
} finally {
  fs.rmSync(folder, { recursive: true, force: true });
}

console.log("Prepare GeoJSON passed: Z removed, 7 decimals, KML_STYLE -> id and nome, Global Mapper texts with units -> numbers, contours (cota_m, mestra, interval), drainage keeps a complete STRAHLER or computes it from topology (Z direction, reversed lines, 7-decimal endpoints, WGS84 lengths), aborts on partial STRAHLER/bifurcation/flat/missing Z/cycle/MultiLineString, microbasins (nome, area_ha, perimetro_km, cor 0-9 balanced with no equal neighbours), CLI output and errors.");
