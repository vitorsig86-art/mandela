// Checks scripts/raster-from-xml.cjs with synthetic XML and tile folders.
// No network or real project data. Run: node scripts/check-raster-xml.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { deriveLayer, UsageError } = require("./raster-from-xml.cjs");

const R = 6378137;
const toX = (longitude) => longitude * Math.PI / 180 * R;
const toY = (latitude) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * R;
// Synthetic extent, unrelated to any property.
const [west, south, east, north] = [10.0, 20.0, 10.5, 20.4];

function tileMap({ srs = "EPSG:3857", box, origin, profile = "mercator", levels = [8, 9, 10], extension = "png" }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<TileMap version="1.0.0" tilemapservice="http://tms.osgeo.org/1.0.0">
  <Title>Ortomosaico sintético</Title>
  <SRS>${srs}</SRS>
  <BoundingBox minx="${box[0]}" miny="${box[1]}" maxx="${box[2]}" maxy="${box[3]}"/>
  ${origin ? `<Origin x="${origin[0]}" y="${origin[1]}"/>` : ""}
  <TileFormat width="256" height="256" mime-type="image/${extension}" extension="${extension}"/>
  <TileSets profile="${profile}">
    ${levels.map((level) => `<TileSet href="${level}" units-per-pixel="1" order="${level}"/>`).join("\n    ")}
  </TileSets>
</TileMap>`;
}

function tileFolder(scheme, levels = [8, 9, 10]) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "cardeal-raster-xml-"));
  for (const z of levels) {
    const n = 2 ** z;
    const x0 = Math.floor((west + 180) / 360 * n), x1 = Math.floor((east + 180) / 360 * n);
    const y = (lat) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    for (let x = x0; x <= x1; x++) {
      fs.mkdirSync(path.join(folder, String(z), String(x)), { recursive: true });
      for (let yy = y(north); yy <= y(south); yy++) {
        const stored = scheme === "tms" ? n - 1 - yy : yy;
        fs.writeFileSync(path.join(folder, String(z), String(x), `${stored}.png`), "");
      }
    }
  }
  return folder;
}

const near = (actual, expected, tolerance = 2e-7) => assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance), `${actual} ≈ ${expected}`);
const temporary = [];

try {
  // 1. Meters (Global Mapper style), origin at the bottom: TMS, converted bounds.
  const meters = [toX(west), toY(south), toX(east), toY(north)];
  let result = deriveLayer(tileMap({ box: meters, origin: [meters[0], meters[1]] }), { url: "https://dados.example.invalid/proj/orto/" });
  assert.equal(result.layer.source.format, "tms");
  assert.equal(result.layer.source.url, "https://dados.example.invalid/proj/orto/{z}/{x}/{reverseY}.png");
  near(result.layer.source.bounds, [west, south, east, north]);
  assert.ok(result.layer.source.bounds[0] <= west && result.layer.source.bounds[3] >= north, "Bounds are rounded outward");
  assert.equal(result.layer.source.minimumLevel, 8);
  assert.equal(result.layer.source.maximumLevel, 10);
  assert.equal(result.layer.source.tileWidth, 256);
  assert.equal(result.layer.kind, "raster");
  assert.equal(result.layer.defaultVisible, false);
  assert.equal(result.layer.id, "ortomosaico-sintetico");

  // 2. Origin at the top: XYZ with {y}.
  result = deriveLayer(tileMap({ box: meters, origin: [meters[0], meters[3]] }), { url: "https://dados.example.invalid/x" });
  assert.equal(result.layer.source.format, "xyz");
  assert.match(result.layer.source.url, /\{z\}\/\{x\}\/\{y\}\.png$/);

  // 3. Degrees with swapped axes (old gdal2tiles) resolved by a TMS folder.
  const tms = tileFolder("tms"); temporary.push(tms);
  result = deriveLayer(tileMap({ srs: "EPSG:900913", box: [south, west, north, east], origin: [south, west] }), { tiles: tms });
  assert.equal(result.layer.source.format, "tms");
  near(result.layer.source.bounds, [west, south, east, north]);
  assert.ok(result.notes.some((note) => /invertidos/.test(note)));

  // 4. Degrees in the right order, XYZ folder overrides a TMS-looking XML.
  const xyz = tileFolder("xyz"); temporary.push(xyz);
  result = deriveLayer(tileMap({ box: [west, south, east, north], origin: [west, south] }), { tiles: xyz });
  assert.equal(result.layer.source.format, "xyz");
  assert.ok(result.notes.some((note) => /diferente do XML/.test(note)));

  // 5. Folder levels win over TileSets; sample tile exists on disk.
  const partial = tileFolder("tms", [9, 10]); temporary.push(partial);
  result = deriveLayer(tileMap({ box: meters, origin: [meters[0], meters[1]] }), { tiles: partial });
  assert.equal(result.layer.source.minimumLevel, 9);
  assert.ok(fs.existsSync(path.join(partial, "9", String(result.sampleTile.x), `${result.sampleTile.y}.png`)));

  // 6. Rejections: other SRS, geodetic profile, URL placeholder mismatch.
  assert.throws(() => deriveLayer(tileMap({ srs: "EPSG:4326", box: [west, south, east, north] })), (error) => error instanceof UsageError && /EPSG:3857/.test(error.message));
  assert.throws(() => deriveLayer(tileMap({ srs: "EPSG:31983", box: [500000, 7600000, 510000, 7610000] })), UsageError);
  assert.throws(() => deriveLayer(tileMap({ box: meters, profile: "geodetic" })), /mercator/);
  assert.throws(() => deriveLayer(tileMap({ box: meters, origin: [meters[0], meters[1]] }), { url: "https://x.invalid/{z}/{x}/{y}.png" }), /reverseY/);

  // 7. Many tiles at the minimum level produce a warning.
  result = deriveLayer(tileMap({ box: meters, levels: [14, 15] }));
  assert.ok(result.notes.some((note) => /tiles no nível mínimo/.test(note)));

  // 8. Whole-tile BoundingBox (Global Mapper): edges on tile boundaries. The test
  // tile is the one under the center, and the count does not add neighbor tiles.
  const size = 2 * Math.PI * R / 2 ** 9;
  const tileBox = (x, y, nx, ny) => [-Math.PI * R + x * size, Math.PI * R - (y + ny) * size, -Math.PI * R + (x + nx) * size, Math.PI * R - y * size];
  for (const [nx, ny] of [[1, 1], [3, 3], [2, 2], [3, 1]]) {
    const box = tileBox(280, 220, nx, ny);
    result = deriveLayer(tileMap({ box, origin: [box[0], box[1]], levels: [9, 12] }));
    const yXyz = 2 ** 9 - 1 - result.sampleTile.y;
    assert.equal(result.sampleTile.z, 9);
    assert.ok(result.sampleTile.x >= 280 && result.sampleTile.x < 280 + nx, `x inside ${nx}x${ny}: ${result.sampleTile.x}`);
    assert.ok(yXyz >= 220 && yXyz < 220 + ny, `y inside ${nx}x${ny}: ${yXyz}`);
    // Odd sizes have a single center tile.
    if (nx % 2 && ny % 2) assert.deepEqual([result.sampleTile.x, yXyz], [280 + (nx - 1) / 2, 220 + (ny - 1) / 2]);
    assert.equal(result.notes.some((note) => /tiles no nível mínimo/.test(note)), nx * ny > 4, `${nx * ny} tiles at the minimum level`);
  }
} finally {
  for (const folder of temporary) fs.rmSync(folder, { recursive: true, force: true });
}

console.log("Raster XML passed: meters→degrees, TMS/XYZ by Origin and by folder, swapped gdal2tiles axes, folder levels, rejected non-Mercator SRS/profile, URL placeholders, minimum-level warning and center test tile for whole-tile bounding boxes.");
