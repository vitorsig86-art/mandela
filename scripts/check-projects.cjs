// Local configuration/loader checks. Run: node scripts/check-projects.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const cesium = require("cesium");
const root = path.join(__dirname, "..");

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8").replaceAll("import.meta.env", "({})"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, setTimeout, clearTimeout, structuredClone, URL, require: (name) => dependencies[name] ?? (name.startsWith(".") ? load(path.join(path.dirname(file), name + ".ts"), dependencies) : require(name)), ...globals });
  return exports;
}
const { appTitle } = load("src/appTitle.ts");
assert.equal(appTitle("Fazenda Exemplo"), "Fazenda Exemplo | Cardeal Map");
assert.equal(appTitle("  "), "Cardeal Map");
assert.equal(appTitle(undefined), "Cardeal Map");
const templateModule = load("src/projects/template.ts");
const { projects } = load("src/projects/index.ts", { "./template": templateModule });
// The template registers templateProject; a derived project registers src/projects/<slug>.ts.
assert.ok(projects.length >= 1);
if (projects[0] === templateModule.templateProject) assert.equal(projects.length, 1);
assert.equal(new Set(projects.map(entry => entry.id)).size, projects.length);
assert.ok(projects.every(entry => entry.layers.every(layer => !layer.source.url?.includes("example.invalid"))), "Active config must not request placeholders");
const project = { ...projects[0], layers: [...projects[0].layers.filter(layer => layer.kind === "basemap"), ...templateModule.exampleLayers] };
assert.equal(new Set(project.layers.map(layer => layer.id)).size, project.layers.length);
assert.ok(project.layers.filter(layer => layer.legend).length >= 2);
assert.ok(Object.values(project.initialCamera).every(Number.isFinite));
assert.ok(Math.abs(project.initialCamera.longitude) <= 180);
assert.ok(Math.abs(project.initialCamera.latitude) <= 90);

let opening, home;
const viewer = {
  isDestroyed: () => false,
  camera: { cancelFlight() {}, setView: (view) => opening = view, flyTo: (view) => home = view },
  scene: { requestRender() {} },
};
const camera = load("src/cesium/projectCamera.ts", { cesium });
camera.applyProjectCamera(viewer, project);
// Home and scenes share flyToCamera with the opening view format.
camera.flyToCamera(viewer, project.initialCamera);
assert.equal(home.duration, 1.2);
const sceneCamera = { ...project.initialCamera, longitude: 0.5, height: 1500, pitch: -35 };
let sceneFlight;
camera.flyToCamera({ ...viewer, camera: { ...viewer.camera, flyTo: (view) => sceneFlight = view } }, sceneCamera);
assert.ok(cesium.Cartesian3.equals(sceneFlight.destination, cesium.Cartesian3.fromDegrees(0.5, sceneCamera.latitude, 1500)));
assert.equal(sceneFlight.orientation.pitch, cesium.Math.toRadians(-35));
assert.ok(cesium.Cartesian3.equals(opening.destination, home.destination));
assert.equal(JSON.stringify(opening.orientation), JSON.stringify(home.orientation));
for (const angle of ["heading", "pitch", "roll"]) assert.equal(opening.orientation[angle], cesium.Math.toRadians(project.initialCamera[angle]));
const destination = cesium.Cartographic.fromCartesian(opening.destination);
assert.ok(Math.abs(destination.height - project.initialCamera.height) < 1e-6);
const { captureCamera } = load("src/cesium/captureCamera.ts", { cesium });
const captured = captureCamera({ camera: {
  positionCartographic: destination,
  ...opening.orientation,
} });
for (const key of Object.keys(project.initialCamera)) {
  assert.ok(Math.abs(captured[key] - project.initialCamera[key]) < 1e-6, `Capture round trip: ${key}`);
}
// Capture panel snippets paste as valid object literals.
const captureModule = load("src/cesium/captureCamera.ts", { cesium });
const sampleView = { longitude: -0.12345678, latitude: 0.0012345, height: 1234.56, heading: 359.999, pitch: -0.0001, roll: 0 };
const homeSnippet = captureModule.initialCameraSnippet(sampleView);
assert.match(homeSnippet, /^initialCamera: { longitude: -0.1234568, latitude: 0.0012345, height: 1234.6, heading: 360.00, pitch: 0.00, roll: 0.00 },$/);
const parsedHome = vm.runInNewContext(`({ ${homeSnippet} })`).initialCamera;
assert.ok(Math.abs(parsedHome.longitude - sampleView.longitude) < 1e-7);
const sceneSnippet = captureModule.sceneCameraSnippet("vista-norte", sampleView);
assert.match(sceneSnippet, /id: "vista-norte"/);
assert.equal(vm.runInNewContext(`({ ${sceneSnippet} })`).camera.height, 1234.6);
const viewRectangle = cesium.Rectangle.fromDegrees(0.01, -0.02, 0.03, 0.04);
const viewBounds = captureModule.captureViewBounds({ camera: { computeViewRectangle: () => viewRectangle }, scene: { globe: { ellipsoid: cesium.Ellipsoid.WGS84 } } });
assert.ok(viewBounds.every((value, index) => Math.abs(value - [0.01, -0.02, 0.03, 0.04][index]) < 1e-12));
assert.equal(JSON.stringify(vm.runInNewContext(`({ ${captureModule.boundsSnippet(viewBounds)} })`).bounds), JSON.stringify([0.01, -0.02, 0.03, 0.04]));
assert.equal(captureModule.captureViewBounds({ camera: { computeViewRectangle: () => undefined }, scene: { globe: {} } }), undefined);
const anotherProject = {
  ...project, id: "another-project", name: "Another project",
  initialCamera: { ...project.initialCamera, height: project.initialCamera.height + 250 },
};
camera.applyProjectCamera(viewer, anotherProject);
assert.ok(Math.abs(cesium.Cartographic.fromCartesian(opening.destination).height - anotherProject.initialCamera.height) < 1e-6);

class ImageryLayer {
  constructor(provider, options = {}) {
    this.imageryProvider = provider;
    this.rectangle = options.rectangle ?? cesium.Rectangle.MAX_VALUE;
    this.ready = Boolean(provider);
    this.show = options.show ?? true;
  }
  isDestroyed() { return false; }
  isBaseLayer() { return false; }
  _createTileImagerySkeletons() { return false; }
}
class UrlTemplateImageryProvider {
  constructor(options) {
    this.options = options;
    this.tilingScheme = options.tilingScheme;
    this.rectangle = options.rectangle ?? options.tilingScheme.rectangle;
  }
}
class Cesium3DTileset {
  static async fromUrl(url) { const layer = new Cesium3DTileset(); layer.url = url; return layer; }
}
class GeoJsonDataSource {
  constructor() { this.entities = new cesium.EntityCollection(); }
  static async load(url, options) {
    const source = new GeoJsonDataSource();
    source.url = url; source.options = options;
    source.entities.add({
      polyline: { positions: cesium.Cartesian3.fromDegreesArray([0, 0, 0.01, 0.01]) },
    });
    source.entities.add({ polygon: { hierarchy: new cesium.PolygonHierarchy(cesium.Cartesian3.fromDegreesArray([0, 0, 0.01, 0, 0, 0.01])) } });
    return source;
  }
}
let imageryStyle;
let failImagery = false;
const mockCesium = {
  ...cesium, ImageryLayer, UrlTemplateImageryProvider, Cesium3DTileset, GeoJsonDataSource,
  createWorldImageryAsync: async ({ style }) => {
    if (failImagery) throw new Error("Unavailable");
    imageryStyle = style; return { type: "world-imagery" };
  },
};
const quietConsole = { warn() {}, debug() {} };
const loader = load("src/cesium/loadLayer.ts", { cesium: mockCesium }, { console: quietConsole });
const errors = load("src/cesium/imageryTileErrors.ts", {}, { console: quietConsole });

async function main() {
  for (const definition of project.layers) {
    // Arbitrary IDs must work without changing generic loader logic.
    const configured = { ...definition, id: `another-project-${definition.id}`, source: { ...definition.source } };
    const loaded = await loader.loadLayer(configured);
    const source = configured.source;
    if (source.format === "ion-world-imagery") {
      assert.ok(loaded instanceof ImageryLayer);
      assert.equal(imageryStyle, cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS);
      failImagery = true;
      const fallback = await loader.loadLayer(configured);
      failImagery = false;
      assert.equal(loader.isBasemapFallback(fallback), true);
      assert.equal(fallback.imageryProvider.options.url, source.fallback.url);
      assert.equal(fallback.imageryProvider.options.maximumLevel, source.fallback.maximumLevel);
    } else if (source.format === "tms" || source.format === "xyz") {
      const options = loaded.imageryProvider.options;
      assert.equal(options.url, source.url);
      assert.equal(options.credit, source.credit);
      assert.equal(options.minimumLevel, source.minimumLevel);
      assert.equal(options.maximumLevel, source.maximumLevel);
      assert.equal(options.tileWidth, source.tileWidth);
      assert.equal(options.tileHeight, source.tileHeight);
      assert.ok(options.tilingScheme instanceof cesium.WebMercatorTilingScheme);
      assert.ok(cesium.Rectangle.equals(options.rectangle, cesium.Rectangle.fromDegrees(...source.bounds)));
      let warnings = 0;
      const sparseHandler = errors.createImageryTileErrorHandler(configured, () => warnings++, false);
      const missing = { x: 1, y: 2, level: 13, error: { statusCode: 404 }, retry: true };
      sparseHandler(missing);
      assert.equal(missing.retry, false);
      assert.equal(warnings, 0);
      sparseHandler({ ...missing, error: { statusCode: 500 } }); assert.equal(warnings, 1);
      const otherLayer = { ...configured, id: `second-${configured.id}` };
      errors.createImageryTileErrorHandler(otherLayer, () => warnings++, false)({ ...missing });
      assert.equal(warnings, 1, "Confirmed footprint gaps are recoverable for any layer");
    } else if (source.format === "geojson") {
      assert.equal(loaded.url, source.url);
      assert.equal(loaded.options.clampToGround, source.style.clampToGround);
      assert.ok(cesium.Color.equals(loaded.options.stroke, cesium.Color.fromCssColorString(source.style.stroke)));
      assert.equal(loaded.options.strokeWidth, source.style.strokeWidth);
      assert.equal(loaded.options.credit, source.credit, "Vector credit is optional and passed through as-is");
      const credited = await loader.loadLayer({ ...configured, source: { ...source, credit: "Fonte sintética" } });
      assert.equal(credited.options.credit, "Fonte sintética");
      const time = cesium.JulianDate.now();
      for (const entity of loaded.entities.values) {
        if (entity.polygon) {
          assert.equal(entity.polygon.material.color.getValue(time).alpha, 0);
          assert.equal(entity.polygon.outline.getValue(time), false);
        }
        assert.equal(entity.label, undefined);
        assert.equal(entity.description, undefined);
        // The original polygon retains its fill/picking; boundary helpers are lines only.
        if (!entity.polyline) continue;
        assert.equal(entity.polyline.width.getValue(time), source.style.strokeWidth);
        assert.equal(entity.polyline.zIndex.getValue(time), source.style.zIndex);
      }
      assert.equal(source.autoZoom, false);
    } else if (source.format === "3d-tiles") {
      assert.ok(loaded instanceof Cesium3DTileset);
      assert.equal(loaded.url, source.url);
      assert.equal(loaded.modelMatrix, undefined);
      assert.equal(definition.defaultVisible, false);
    } else assert.fail(`Unsupported source: ${source.format}`);
  }
  for (const layer of project.layers.filter((layer) => layer.legend)) {
    if (layer.legend.type === "image") {
      assert.ok(layer.legend.imageUrl.startsWith("/"));
      assert.ok(layer.legend.imageAlt);
      assert.ok(fs.existsSync(path.join(root, "public", layer.legend.imageUrl)));
      continue;
    }
    assert.ok(layer.legend.max > layer.legend.min);
    assert.ok(layer.legend.tickValues.every((value) => value >= layer.legend.min && value <= layer.legend.max));
    assert.equal(layer.legend.gradientStops[0].position, 0);
    assert.equal(layer.legend.gradientStops.at(-1).position, 100);
  }
  // Generic production code must not contain project-specific IDs/names.
  // A derived project's own config (src/projects/<slug>.ts) and registry are exempt.
  const genericProjectFiles = new Set(["template.ts", "types.ts", "layerVisibility.ts", "drainageStyle.ts"]);
  for (const directory of ["src", "src/projects", "src/components", "src/hooks", "src/cesium"]) {
    for (const file of fs.readdirSync(path.join(root, directory)).filter((name) => /\.tsx?$/.test(name))) {
      if (directory === "src/projects" && !genericProjectFiles.has(file)) continue;
      assert.doesNotMatch(fs.readFileSync(path.join(root, directory, file), "utf8"), /Fazenda[ -]Mel|Soledade|pub-[a-f0-9]+\.r2\.dev/i, `${directory}/${file}`);
    }
  }
  console.log("Projects passed: registry, startup/Home camera, Bing/fallback, TMS levels/bounds/URLs, GeoJSON styling, native 3D Tiles, legends, and ID-independent sparse-tile policy. No remote requests performed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
