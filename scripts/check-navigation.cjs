// Navigation limit checks with synthetic bounds. No browser or network.
// Run: node scripts/check-navigation.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const cesium = require("cesium");
const root = path.join(__dirname, "..");

function load(file, dependencies = {}, env = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8").replaceAll("import.meta.env", "__env"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, __env: env, console, ...globals, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}

const limits = load("src/cesium/navigationLimits.ts");
const camera = load("src/cesium/projectCamera.ts", { cesium });
const { templateProject } = load("src/projects/template.ts");

// Synthetic 2 km × 1 km area near the equator.
const bounds = [10, 0, 10 + 2000 / 111320, 1000 / 110574];
const area = limits.navigationArea({ bounds });
const size = limits.boundsSizeMeters(bounds);
assert.ok(Math.abs(size.width - 2000) < 1 && Math.abs(size.height - 1000) < 1);
// 25% of the largest dimension (2000 m = 500 m) on each side.
assert.ok(Math.abs((bounds[0] - area.west) * 111320 - 500) < 1);
assert.ok(Math.abs((area.north - bounds[3]) * 110574 - 500) < 1);
// Default maximum height: twice the largest expanded side (3000 m).
assert.ok(Math.abs(area.maximumHeight - 6000) < 2, `default max height ${area.maximumHeight}`);
assert.equal(limits.navigationArea({ bounds: [10, 0, 10.0001, 0.0001] }).maximumHeight, limits.MINIMUM_DEFAULT_ZOOM_DISTANCE);

const custom = limits.navigationArea({ bounds, navigation: { marginRatio: 0, maximumZoomDistance: 800 } });
assert.equal(custom.west, bounds[0]);
assert.equal(custom.maximumHeight, 800);
assert.equal(limits.navigationArea({ bounds, navigation: { enabled: false } }), null);
assert.equal(limits.navigationArea({}), null, "No bounds, no limit");
assert.equal(limits.navigationArea(templateProject), null, "The template's neutral globe view is not limited");
assert.throws(() => limits.navigationArea({ bounds: [11, 0, 10, 1] }), /W < E/);
assert.throws(() => limits.navigationArea({ bounds, navigation: { marginRatio: -1 } }), /marginRatio/);
assert.throws(() => limits.navigationArea({ bounds, navigation: { maximumZoomDistance: 0 } }), /maximumZoomDistance/);

assert.equal(limits.isInsideArea(10.001, 0.001, area), true);
assert.equal(limits.isInsideArea(11, 0.001, area), false);
let next = limits.clampToArea(11, 0.001, 100, area);
assert.equal(next.changed, true); assert.equal(next.longitude, area.east); assert.equal(next.latitude, 0.001);
next = limits.clampToArea(10.001, 0.001, 50000, area);
assert.equal(next.changed, true); assert.equal(next.heightAboveGround, area.maximumHeight);
assert.equal(limits.clampToArea(10.001, 0.001, 100, area).changed, false);
assert.equal(limits.clampToArea(area.east + 1e-12, 0.001, area.maximumHeight + 0.1, area).changed, false, "Tolerance avoids render loops");

const inside = { longitude: 10.005, latitude: 0.004, height: 500, heading: 0, pitch: -45, roll: 0 };
assert.deepEqual(Array.from(limits.camerasOutsideArea({ initialCamera: inside, scenes: [{ id: "a", label: "A", layerIds: [] }, { id: "b", label: "B", layerIds: [], camera: { ...inside, longitude: 12 } }] }, area)), ['scenes "b".camera']);

// Managed flights suspend the limit until complete/cancel.
const fakeViewer = { isDestroyed: () => false, scene: { requestRender() {} }, camera: {} };
assert.equal(camera.isManagedFlightActive(fakeViewer), false);
const end = camera.beginManagedFlight(fakeViewer);
assert.equal(camera.isManagedFlightActive(fakeViewer), true);
end(); end();
assert.equal(camera.isManagedFlightActive(fakeViewer), false, "Ending twice does not underflow");
let flight;
fakeViewer.camera.flyTo = (options) => flight = options;
camera.flyToCamera(fakeViewer, inside);
assert.equal(camera.isManagedFlightActive(fakeViewer), true);
flight.complete();
assert.equal(camera.isManagedFlightActive(fakeViewer), false);
camera.flyToCamera(fakeViewer, inside); flight.cancel();
assert.equal(camera.isManagedFlightActive(fakeViewer), false);

// Hook: sets maximumZoomDistance, clamps after renders, restores on cleanup.
const effects = [];
const react = { useMemo: (factory) => factory(), useEffect: (effect) => effects.push(effect) };
const { useNavigationLimits } = load("src/hooks/useNavigationLimits.ts", {
  react, cesium, "../cesium/navigationLimits": limits, "../cesium/projectCamera": camera,
}, { DEV: false });
const postRender = new cesium.Event();
let setViewCalls = 0;
const viewerCamera = {
  positionCartographic: cesium.Cartographic.fromDegrees(12, 0.004, 20000),
  heading: 0.5, pitch: -0.7, roll: 0,
  setView({ destination, orientation }) {
    setViewCalls++;
    this.positionCartographic = cesium.Cartographic.fromCartesian(destination);
    assert.equal(orientation.heading, 0.5, "Orientation is preserved");
  },
};
const viewer = {
  isDestroyed: () => false, camera: viewerCamera,
  scene: { postRender, requestRender() {}, screenSpaceCameraController: { maximumZoomDistance: Infinity }, globe: { getHeight: () => 300 } },
};
const project = { ...templateProject, bounds, initialCamera: inside };
const returned = useNavigationLimits(viewer, project);
assert.ok(returned && Math.abs(returned.maximumHeight - area.maximumHeight) < 1e-9);
const cleanups = effects.map((effect) => effect()).filter(Boolean);
assert.equal(viewer.scene.screenSpaceCameraController.maximumZoomDistance, area.maximumHeight);
postRender.raiseEvent();
assert.equal(setViewCalls, 1);
const clamped = viewerCamera.positionCartographic;
assert.ok(Math.abs(cesium.Math.toDegrees(clamped.longitude) - area.east) < 1e-9);
assert.ok(Math.abs(clamped.height - (300 + area.maximumHeight)) < 1e-3, "Height limit is above the ground");
postRender.raiseEvent();
assert.equal(setViewCalls, 1, "Inside the limit nothing changes");
viewerCamera.positionCartographic = cesium.Cartographic.fromDegrees(14, 0.004, 1000);
const flightEnd = camera.beginManagedFlight(viewer);
postRender.raiseEvent();
assert.equal(setViewCalls, 1, "No clamp during a managed flight");
flightEnd(); postRender.raiseEvent();
assert.equal(setViewCalls, 2, "Clamp resumes after the flight");
cleanups.forEach((cleanup) => cleanup());
assert.equal(viewer.scene.screenSpaceCameraController.maximumZoomDistance, Infinity);
assert.equal(postRender.numberOfListeners, 0);
effects.length = 0;
assert.equal(useNavigationLimits(viewer, project, true), null, "Bypass disables the limit");
effects.forEach((effect) => effect());
assert.equal(viewer.scene.screenSpaceCameraController.maximumZoomDistance, Infinity);

// GPS: inside the limit the camera flies to the marker; outside it does not
// move and a short notice is shown. Marker is always shown.
async function checkGeolocation() {
  let state;
  const refs = [];
  const hookEffects = [];
  const geoReact = {
    useState: (initial) => [state ??= initial, (value) => { state = typeof value === "function" ? value(state) : value; }],
    useRef: (value) => { const ref = { current: value }; refs.push(ref); return ref; },
    useEffect: (effect) => hookEffects.push(effect),
  };
  const timers = new Map(); let nextTimer = 0;
  let watchSuccess;
  const navigatorStub = { geolocation: { watchPosition: (success) => { watchSuccess = success; return 1; }, clearWatch() {} } };
  const { useGeolocation } = load("src/hooks/useGeolocation.ts", {
    react: geoReact, cesium, "../cesium/navigationLimits": limits, "../cesium/projectCamera": camera,
  }, {}, {
    navigator: navigatorStub,
    setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  const flights = [];
  const entities = [];
  const gpsViewer = {
    isDestroyed: () => false,
    entities: { add: (entity) => { entities.push(entity); return entity; }, remove() {} },
    camera: { heading: 0, cancelFlight() {} },
    scene: { requestRender() {} },
    flyTo: (target) => { flights.push(target); return Promise.resolve(true); },
  };
  {
    const api = useGeolocation(gpsViewer, area);
    hookEffects.forEach((effect) => effect());
    const position = (longitude, latitude) => ({ coords: { longitude, latitude, accuracy: 8 } });
    api.locate();
    watchSuccess(position(12, 0.004));
    assert.equal(state.status, "active");
    assert.equal(state.outsideArea, true, "Outside: notice");
    assert.equal(flights.length, 0, "Outside: camera does not move");
    assert.ok(entities.some((entity) => entity.point) && entities[0].show !== false, "Marker shown outside the area");
    timers.forEach((callback) => callback()); timers.clear();
    assert.equal(state.outsideArea, false, "Notice is short-lived");
    api.locate();
    assert.equal(state.outsideArea, true, "Tapping again repeats the notice");
    watchSuccess(position(10.005, 0.004));
    api.locate();
    assert.equal(flights.length, 1, "Inside: recenter flies to the marker");
    assert.equal(camera.isManagedFlightActive(gpsViewer), true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(camera.isManagedFlightActive(gpsViewer), false, "GPS flight is released when it ends");
  }
}

checkGeolocation().then(() => {
  console.log("Navigation passed: 25% margin and default height from bounds, custom/disabled/absent limits, validation, clamp with tolerance, ground-relative height, managed flights, out-of-limit views, hook setup/cleanup and bypass. GPS inside/outside the limit.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
