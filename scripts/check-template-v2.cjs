// Local synthetic contracts: no browser, tokens, real property data or network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const cesium = require("cesium");
const root = path.join(__dirname, "..");
function modules(dependencies = {}, env = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    file = path.normalize(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8").replaceAll("import.meta.env", "__env"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { exports, __env: env, console, structuredClone, setTimeout, clearTimeout, ...globals,
      require: name => dependencies[name] ?? (name.startsWith(".") ? load(path.normalize(path.join(path.dirname(file), name + ".ts"))) : require(name)),
    });
    return exports;
  }
  return load;
}
async function main() {
  const load = modules();
  const popup = load("src/cesium/vectorPopup.ts");
  const t1 = cesium.JulianDate.fromIso8601("2020-01-01T00:00:00Z");
  const t2 = cesium.JulianDate.addSeconds(t1, 10, new cesium.JulianDate());
  const temporal = new cesium.SampledProperty(Number);
  temporal.addSample(t1, 12.345); temporal.addSample(t2, 98.765);
  const entity = new cesium.Entity({ properties: { label: "Exemplo", size: temporal, count: 12345, zero: 0, nil: null, invalid: NaN } });
  popup.registerVectorPopup(entity, { titleProperty: "label", titlePrefix: "Unidade ", titleSuffix: "!", fields: [
    { property: "size", decimals: 2, prefix: "≈ ", suffix: " ha" }, { property: "count", format: "integer" },
    { property: "zero" }, { property: "nil" }, { property: "invalid" }, { property: "absent" },
  ] });
  assert.equal(popup.readVectorPopup(entity, t1).title, "Unidade Exemplo!");
  assert.equal(popup.readVectorPopup(entity, t1).fields.map(f => f.value).join("|"), "≈ 12,35 ha|12.345|0");
  assert.equal(popup.readVectorPopup(entity, t2).fields[0].value, "≈ 98,77 ha");
  entity.show = false; assert.equal(popup.readVectorPopup(entity, t1), null); entity.show = true;

  const ring = [[0,0],[0.02,0],[0.02,0.01],[0.01,0.01],[0.01,0.02],[0,0.02],[0,0]];
  const fixture = { type: "FeatureCollection", features: [
    { type: "Feature", id: "shared", properties: { category: "B", colorIndex: 1 }, geometry: { type: "Polygon", coordinates: [ring] } },
    { type: "Feature", id: "shared", properties: { category: "A", colorIndex: 0 }, geometry: { type: "Polygon", coordinates: [ring] } },
    { type: "Feature", id: "shared", properties: { category: "unknown", colorIndex: 9 }, geometry: { type: "LineString", coordinates: [[0,0,123],[0.01,0.01,456]] } },
    { type: "Feature", id: "shared", properties: { category: "B", source_id: "existing" }, geometry: { type: "LineString", coordinates: [[0,0,123],[0.01,0.01,456]] } },
  ] };
  const original = JSON.stringify(fixture);
  const vectorLoad = modules({ cesium: { ...cesium, Resource: { fetchJson: async () => fixture } } });
  const loader = vectorLoad("src/cesium/loadLayer.ts");
  const definition = { id: "synthetic", source: { format: "geojson", url: "https://example.invalid/data.geojson", uniqueFeatureIds: true, ignoreAltitude: true,
    style: { stroke: "#32404A", strokeWidth: 1, fill: "#B6C3CF", fillOpacity: 0.35, clampToGround: true, zIndex: 1,
      classification: { property: "category", classes: { A: { fill: "#285F9E", stroke: "#2457B2", strokeWidth: 2, zIndex: 10 }, B: { fill: "#C68524", stroke: "#34B3C8", strokeWidth: 3.5, zIndex: 11 } } },
      outline: { property: "colorIndex", colors: ["#285F9E", "#C68524"], width: 3, fallbackColor: "#32404A" },
    }, popup: { titleProperty: "category", fields: [{ property: "source_id", label: "ID de origem" }] },
  } };
  const ds = await loader.loadLayer(definition);
  assert.equal(JSON.stringify(fixture), original, "Source data remains untouched");
  assert.equal(ds.entities.values.length, 6, "Two polygons, two lines, two boundary helpers");
  assert.equal(new Set(ds.entities.values.map(e => e.id)).size, 6);
  const at = cesium.JulianDate.now();
  const polygons = ds.entities.values.filter(e => e.polygon);
  assert.equal(polygons.length, 2);
  assert.equal(polygons[0].polygon.material.color.getValue(at).withAlpha(1).toCssHexString(), "#c68524");
  assert.equal(polygons[1].polygon.material.color.getValue(at).withAlpha(1).toCssHexString(), "#285f9e");
  for (const e of polygons) { assert.equal(e.polygon.material.color.getValue(at).alpha, 0.35); assert.equal(e.polygon.outline.getValue(at), false); assert.equal(e.polygon.extrudedHeight, undefined); }
  const helpers = ds.entities.values.filter(e => e.parent);
  for (const e of helpers) { assert.equal(e.polyline.width.getValue(at), 3); assert.equal(e.polyline.clampToGround.getValue(at), true); assert.equal(e.polyline.positions.getValue(at).length, ring.length); assert.equal(e.polygon, undefined); }
  const lines = ds.entities.values.filter(e => e.polyline && !e.parent);
  assert.equal(lines[0].polyline.width.getValue(at), 1, "Unmatched category uses fallback");
  assert.equal(lines[1].polyline.width.getValue(at), 3.5);
  assert.equal(lines[1].polyline.zIndex.getValue(at), 11);
  assert.equal(lines[1].polyline.material.color.getValue(at).toCssHexString(), "#34b3c8");
  assert.equal(polygons[0].properties.getValue(at).source_id, "shared", "Original id kept as source_id");
  assert.equal(lines[1].properties.getValue(at).source_id, "existing", "An existing source_id attribute is not overwritten");
  assert.equal(vectorLoad("src/cesium/vectorPopup.ts").readVectorPopup(polygons[0], at).fields[0].value, "shared", "source_id can be shown in the popup");
  for (const e of lines) for (const p of e.polyline.positions.getValue(at)) assert.ok(Math.abs(cesium.Cartographic.fromCartesian(p).height) < 1e-6, "Altitude removed before loading");
  const selected = vectorLoad("src/cesium/vectorPopup.ts").resolveVectorPopupSelection(polygons[1], [lines[1]], at);
  assert.ok(selected === lines[1]);
  const measurement = new cesium.Entity();
  assert.equal(vectorLoad("src/cesium/vectorPopup.ts").resolveVectorPopupSelection(measurement, [lines[1]], at), measurement);
  for (let i = 0; i < 4; i++) {
    loader.setVectorVisibility(ds, false); assert.equal(ds.entities.values.length, 4);
    loader.setVectorOpacity(ds, 0.5);
    loader.setVectorVisibility(ds, true); assert.equal(ds.entities.values.length, 6);
    assert.equal(helpers[0].polyline.material.color.getValue(at).alpha, 0.5);
    assert.equal(polygons[0].polygon.material.color.getValue(at).alpha, 0.175);
    loader.setVectorOpacity(ds, 1); assert.equal(polygons[0].polygon.material.color.getValue(at).alpha, 0.35);
  }
  const sources = new cesium.DataSourceCollection(); await sources.add(ds);
  loader.removeLayer({ isDestroyed: () => false, dataSources: sources }, ds);
  assert.equal(sources.length, 0); assert.equal(ds.entities.values.length, 0);

  const config = { inverse: true, positions: [[0,0],[0.01,0],[0.01,0.01],[0,0.01]] };
  const clipping = load("src/cesium/modelClipping.ts");
  const c1 = clipping.createModelClipping(config), c2 = clipping.createModelClipping(config);
  assert.notEqual(c1, c2); assert.notEqual(c1.get(0), c2.get(0)); assert.equal(c1.inverse, true);
  assert.throws(() => clipping.validateClipping({ ...config, positions: [[0,0],[0,0],[1,1]] }));
  assert.equal(clipping.createModelClipping({ ...config, enabled: false }).enabled, false);
  class Tileset {
    static async fromUrl(url) { const t = new Tileset(); t.url = url; return t; }
    isDestroyed() { return false; }
    destroy() { this.destroyed = true; }
  }
  let credential;
  const modelLoader = modules({ cesium: { ...cesium, Cesium3DTileset: Tileset, IonResource: { fromAssetId: async (id, options) => { credential = options.accessToken; return { id }; } } } }, { VITE_CESIUM_3D_TOKEN: "synthetic-placeholder" })("src/cesium/loadLayer.ts");
  const urlModel = await modelLoader.loadLayer({ source: { format: "3d-tiles", source: "url", url: "https://example.invalid/tileset.json" } });
  assert.equal(urlModel.url, "https://example.invalid/tileset.json"); assert.equal(urlModel.clippingPolygons, undefined);
  const ionModel = await modelLoader.loadLayer({ source: { format: "3d-tiles", source: "ion", assetId: 1001 } });
  assert.equal(ionModel.url.id, 1001); assert.equal(credential, "synthetic-placeholder");
  const clipped = await modelLoader.loadLayer({ source: { format: "3d-tiles", url: "https://example.invalid/tileset.json", clipping: config } });
  assert.equal(clipped.clippingPolygons.length, 1);
  const unclipped = await modelLoader.loadLayer({ source: { format: "3d-tiles", url: "https://example.invalid/tileset.json", clipping: { ...config, enabled: false } } });
  assert.equal(unclipped.clippingPolygons, undefined);
  const noToken = modules({ cesium: { ...cesium, Cesium3DTileset: Tileset } }, {})("src/cesium/loadLayer.ts");
  await assert.rejects(noToken.loadLayer({ source: { format: "3d-tiles", source: "ion", assetId: 1001 } }), /VITE_CESIUM_3D_TOKEN/);

  const timers = []; let diagnostics = 0, debug = 0;
  const errorModule = modules({}, {}, { setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, console: { warn() {}, debug() { debug++; } } })("src/cesium/imageryTileErrors.ts");
  const requestImage = () => Promise.resolve({ width: 256 });
  const provider = { requestImage };
  const handler = errorModule.createImageryTileErrorHandler({ name: "Synthetic raster", source: { format: "tms", url: "https://example.invalid/{z}/{x}/{reverseY}.png" } }, () => diagnostics++, true, provider);
  for (let x = 0; x < 32; x++) handler({ x, y: 1, level: 6, retry: true, error: { cause: { status: x % 2 ? 410 : "404" } } });
  assert.equal(diagnostics, 0); assert.equal(debug, 1); timers[0](); assert.equal(diagnostics, 1);
  const success = provider.requestImage(0,0,0); await success;
  handler({ x: 0, y: 0, level: 0, error: { statusCode: 403 } }); assert.equal(diagnostics, 2);
  handler({ x: 0, y: 0, level: 0, error: Error("opaque CORS/network") }); assert.equal(diagnostics, 3);
  handler.dispose(); assert.equal(provider.requestImage, requestImage);
  const { templateProject, thematicExamples } = load("src/projects/template.ts");
  assert.equal(templateProject.layers.length, 1); assert.equal(thematicExamples.length, 10);
  // Vector pattern: array (drawing order) follows the reference zIndex; real URLs never.
  const vectors = thematicExamples.filter(layer => layer.id.match(/^(microbasins|contours|drainage|roads|parcels|study-area)/));
  assert.equal(JSON.stringify(vectors.map(layer => [layer.id, layer.source.style.zIndex])), JSON.stringify([
    ["microbasins-example", 3], ["contours-2m-example", 5], ["contours-3m-example", 5], ["drainage-example", 10],
    ["roads-example", 15], ["parcels-example", 20], ["study-area-example", 25],
  ]));
  assert.ok(vectors.every(layer => layer.source.url.startsWith("https://example.invalid/") && layer.source.autoZoom === false && layer.source.style.clampToGround));
  const [microbasins, contours2, contours3, drainage, roads, parcels, studyArea] = vectors;
  assert.equal(microbasins.source.style.classification.property, "cor");
  assert.equal(Object.keys(microbasins.source.style.classification.classes).length, 10);
  assert.equal(new Set(microbasins.source.style.outline.colors).size, 10);
  assert.ok(Object.entries(microbasins.source.style.classification.classes).every(([index, item]) => item.fill === item.stroke && item.fill === microbasins.source.style.outline.colors[index]));
  assert.equal(microbasins.source.style.fillOpacity, 0.35); assert.equal(microbasins.source.style.outline.width, 1.5); assert.equal(microbasins.opacityControl, true);
  assert.equal(JSON.stringify(microbasins.source.popup.fields.map(field => field.property)), JSON.stringify(["area_ha", "perimetro_km"]));
  for (const contour of [contours2, contours3]) assert.ok(contour.exclusiveGroup === "curvas" && contour.source.style.stroke === "#000000" && contour.source.style.strokeWidth === 1);
  assert.equal(JSON.stringify(Object.entries(drainage.source.style.classification.classes).map(([order, item]) => [order, item.stroke, item.strokeWidth])), JSON.stringify([
    ["1", "#00E5FF", 1], ["2", "#14B8F0", 1.6], ["3", "#1E88E5", 2.4], ["4", "#1546D8", 3.4], ["5", "#0B2A9E", 4.4],
  ]));
  assert.equal(JSON.stringify(drainage.source.popup.fields.map(field => field.property)), JSON.stringify(["STRAHLER", "area_contribuicao_ha"]));
  assert.ok(roads.source.style.fill === "#8B5A2B" && roads.source.style.fillOpacity === 0.6 && roads.source.style.polygonOutline === false);
  assert.ok(parcels.source.style.stroke === "#FFD400" && parcels.source.style.strokeWidth === 2.5 && parcels.source.style.fillOpacity === 0);
  assert.ok(parcels.defaultVisible && parcels.defaultVisibleMobile === undefined, "Parcels on at the opening, mobile included");
  assert.ok(studyArea.defaultVisible && studyArea.defaultVisibleMobile === false, "Study area off at the mobile opening");
  assert.equal(studyArea.source.popup.openOnHome, undefined, "The study area popup never opens on its own");
  assert.equal(JSON.stringify(studyArea.source.popup.actions.map(action => [action.flyTo, action.onClose])), JSON.stringify([[false, "keep"]]));
  assert.ok(thematicExamples.every(layer => layer.source.format !== "geojson" || !layer.source.popup?.openOnHome), "No example opens a popup on its own");
  assert.ok(Object.values(templateProject.developmentTools).every(v => v === false));
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  assert.ok(app.includes("import.meta.env.DEV ? lazy"));
  assert.equal(fs.readFileSync(path.join(root, ".env.example"), "utf8").split(/\r?\n/).filter(l => /^VITE_/.test(l) && !l.endsWith("=")).length, 0);
  console.log("Template v2 passed: temporal popups, formatting/omissions, attribute styles, boundaries/toggles/cleanup, IDs/altitude, URL/ion/token separation, clipping and recoverable tiles.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
