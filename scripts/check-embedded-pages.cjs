// Local synthetic contract for popup actions (embedded pages): no browser, tokens, real data or network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const cesium = require("cesium");
const root = path.join(__dirname, "..");

function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require, URL, console });
  return exports;
}

const popup = load("src/cesium/vectorPopup.ts");
const allowed = ["https://sim.example.invalid", "https://other.example.invalid:8443/ignored/path"];

// URL policy: https only, exact origin, no credentials, no other schemes.
assert.equal(popup.allowedPageUrl("https://sim.example.invalid/plot-a?view=top", allowed), "https://sim.example.invalid/plot-a?view=top");
assert.equal(popup.allowedPageUrl(" https://other.example.invalid:8443/x ", allowed), "https://other.example.invalid:8443/x");
assert.equal(popup.allowedPageUrl("https://other.example.invalid/x", allowed), null, "port is part of the origin");
assert.equal(popup.allowedPageUrl("http://sim.example.invalid/plot-a", allowed), null, "http is refused");
assert.equal(popup.allowedPageUrl("https://sim.example.invalid.evil.invalid/", allowed), null, "suffix lookalike is refused");
assert.equal(popup.allowedPageUrl("https://user:pass@sim.example.invalid/", allowed), null, "credentials are refused");
assert.equal(popup.allowedPageUrl("javascript:alert(1)", allowed), null);
assert.equal(popup.allowedPageUrl("data:text/html,x", allowed), null);
assert.equal(popup.allowedPageUrl("/relative", allowed), null);
assert.equal(popup.allowedPageUrl(42, allowed), null);
assert.equal(popup.allowedPageUrl("https://sim.example.invalid/", []), null, "no allowlist, no action");
assert.equal(popup.allowedPageUrl("https://sim.example.invalid/", ["not a url"]), null);

// Actions come from feature properties and respect the allowlist.
const config = { title: "Talhão", titleProperty: "label", fields: [], actions: [
  { label: "Entrar na simulação 3D", urlProperty: "simulation_url" },
  { label: "Nova aba", urlProperty: "simulation_url", target: "tab", flyTo: false },
  { label: "Sem URL", urlProperty: "absent" },
  { label: "Fixa", url: "https://sim.example.invalid/fixed" },
  { label: "Fixa de fora", url: "https://elsewhere.invalid/x" },
] };
const plot = new cesium.Entity({ properties: { label: "A", simulation_url: "https://sim.example.invalid/a" } });
popup.registerVectorPopup(plot, config);
const read = popup.readVectorPopup(plot, cesium.JulianDate.now(), allowed);
assert.deepEqual(read.actions.map(a => [a.label, a.url, a.target, a.flyTo, a.onClose]), [
  ["Entrar na simulação 3D", "https://sim.example.invalid/a", "overlay", false, "keep"],
  ["Nova aba", "https://sim.example.invalid/a", "tab", false, "keep"],
  ["Fixa", "https://sim.example.invalid/fixed", "overlay", false, "keep"],
], "Defaults: the camera stays put on open (flyTo false) and on close (onClose keep)");
const moving = new cesium.Entity({ properties: { label: "D", simulation_url: "https://sim.example.invalid/d" } });
popup.registerVectorPopup(moving, { titleProperty: "label", fields: [], actions: [
  { label: "Feição", urlProperty: "simulation_url", flyTo: true, onClose: "home" },
  { label: "Home", urlProperty: "simulation_url", flyTo: "home" },
] });
assert.deepEqual(popup.readVectorPopup(moving, cesium.JulianDate.now(), allowed).actions.map(a => [a.flyTo, a.onClose]), [[true, "home"], ["home", "keep"]]);
assert.equal(popup.readVectorPopup(plot, cesium.JulianDate.now()).actions.length, 0, "default: no allowed origins");

const foreign = new cesium.Entity({ properties: { label: "B", simulation_url: "https://elsewhere.invalid/b" } });
popup.registerVectorPopup(foreign, config);
assert.equal(popup.readVectorPopup(foreign, cesium.JulianDate.now(), allowed).actions.length, 1, "foreign feature URL hides its button; the fixed allowed URL stays");

const legacy = new cesium.Entity({ properties: { label: "C" } });
popup.registerVectorPopup(legacy, { titleProperty: "label", fields: [] });
assert.equal(popup.readVectorPopup(legacy, cesium.JulianDate.now(), allowed).actions.length, 0, "popups without actions keep working");

// popup.openOnHome: never by default; true always, "desktop" outside mobile only.
assert.equal(popup.opensOnHome(undefined, false), false);
assert.equal(popup.opensOnHome({ fields: [] }, false), false, "Default: the popup never opens on its own");
assert.equal(popup.opensOnHome({ fields: [], openOnHome: false }, false), false);
assert.equal(popup.opensOnHome({ fields: [], openOnHome: true }, true), true);
assert.equal(popup.opensOnHome({ fields: [], openOnHome: "desktop" }, false), true);
assert.equal(popup.opensOnHome({ fields: [], openOnHome: "desktop" }, true), false);

// findHomePopupEntity: first visible feature of a visible layer with openOnHome; outline helpers skipped.
const source = (show, entities) => ({ show, entities: { values: entities } });
const fakeViewer = (sources) => ({ isDestroyed: () => false, dataSources: { length: sources.length, get: index => sources[index] } });
const plain = new cesium.Entity();
popup.registerVectorPopup(plain, { fields: [] });
const home = new cesium.Entity();
popup.registerVectorPopup(home, { fields: [], openOnHome: true });
const homeDesktop = new cesium.Entity();
popup.registerVectorPopup(homeDesktop, { fields: [], openOnHome: "desktop" });
const helper = new cesium.Entity({ parent: home });
popup.registerVectorPopup(helper, { fields: [], openOnHome: true });
const hidden = new cesium.Entity({ show: false });
popup.registerVectorPopup(hidden, { fields: [], openOnHome: true });
assert.equal(popup.findHomePopupEntity(fakeViewer([source(true, [plain])])), undefined, "No openOnHome: nothing opens");
assert.equal(popup.findHomePopupEntity(fakeViewer([source(false, [home])])), undefined, "Layer off: nothing opens");
assert.equal(popup.findHomePopupEntity(fakeViewer([source(true, [helper, hidden, plain, home])])), home, "Helpers and hidden features are skipped");
assert.equal(popup.findHomePopupEntity(fakeViewer([source(true, [homeDesktop])]), false), homeDesktop);
assert.equal(popup.findHomePopupEntity(fakeViewer([source(true, [homeDesktop])]), true), undefined, "desktop-only popup stays closed on mobile");

// Camera kept around the page: restoreCamera only moves a camera that moved.
const projectCamera = load("src/cesium/projectCamera.ts");
const views = [];
const start = cesium.Cartesian3.fromDegrees(-45, -21, 1500);
const cameraViewer = { isDestroyed: () => false, scene: { requestRender() {} },
  camera: { positionWC: start, heading: 1, pitch: -0.6, roll: 0, cancelFlight() {}, setView: view => views.push(view) } };
const snapshot = projectCamera.captureCamera(cameraViewer);
assert.notEqual(snapshot.position, start, "captureCamera clones the position");
assert.equal(projectCamera.restoreCamera(cameraViewer, snapshot), false, "Unmoved camera is left alone");
cameraViewer.camera.heading = 1 + 2 * Math.PI;
assert.equal(projectCamera.restoreCamera(cameraViewer, snapshot), false, "A full turn is the same heading");
cameraViewer.camera.positionWC = cesium.Cartesian3.fromDegrees(-45.1, -21, 9000);
assert.equal(projectCamera.restoreCamera(cameraViewer, snapshot), true);
assert.ok(cesium.Cartesian3.equals(views[0].destination, start));
assert.equal(JSON.stringify(views[0].orientation), JSON.stringify({ heading: 1, pitch: -0.6, roll: 0 }));

// The template keeps the feature inactive: no real origins or URLs.
const template = fs.readFileSync(path.join(root, "src/projects/template.ts"), "utf8");
assert.ok(!/allowedOrigins:\s*\[\s*"https:\/\/(?!your-simulation\.example\.invalid)/.test(template.replace(/\/\/.*$/gm, "")), "no real origin in the template");

console.log("embedded pages: ok");
