// Interface contract of the v3 redesign: local fonts, theme, popup order,
// mobile tabs and Cesium attribution. No browser or network required.
// Run: node scripts/check-ui.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function load(file) {
  const exports = {};
  const source = read(file).replaceAll("import.meta.env.DEV", "false");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name.endsWith(".css") || name.startsWith(".") ? {} : require(name) });
  return exports;
}
function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

// 1. Fonts are local: no external font service anywhere in the app.
const sources = ["index.html", ...walk("src")];
for (const file of sources) assert.doesNotMatch(read(file), /fonts\.(googleapis|gstatic)\.com|@import\s+url\(\s*["']?https?:/, `${file} loads an external font`);
const theme = read("src/theme.css");
const fontUrls = [...theme.matchAll(/url\("(\/fonts\/[^"]+)"\)/g)].map(match => match[1]);
assert.ok(fontUrls.length >= 4, "@font-face for Figtree and Caprasimo");
for (const url of fontUrls) assert.ok(fs.statSync(path.join(root, "public", url)).size > 1000, `${url} exists in public/`);
for (const family of ["Figtree", "Caprasimo"]) {
  assert.match(theme, new RegExp(`font-family: "${family}"`));
  assert.match(read(`public/fonts/OFL-${family}.txt`), /SIL OPEN FONT LICENSE/i, `${family} license`);
}
assert.match(read("src/main.tsx"), /import "\.\/theme\.css";\s*\nimport "\.\/styles\.css";/, "Theme loads before the layout");
for (const token of ["--color-accent", "--color-neutral-100", "--font-heading", "--font-body", "--radius-md", "--shadow-md"]) assert.match(theme, new RegExp(`${token}:`));

// 2. Header and shell.
const styles = read("src/styles.css");
assert.match(styles, /--header-height: 52px;/);
const app = read("src/App.tsx");
assert.match(app, /Sobre os dados/);
assert.match(app, /className="map-tools"/, "One tools column");
assert.match(app, /className="mobile-bar"/);
assert.doesNotMatch(app, /drawer-backdrop|panel-toggle mobile-only/, "The side drawer is gone");

// 3. Popup: readable attributes first, raw source names under "Atributos da fonte".
const { isSourceField } = load("src/components/VectorPopup.tsx");
for (const label of ["STREAM_ID", "COD_2", "ID_ORIGEM"]) assert.equal(isSourceField(label), true, label);
for (const label of ["Área", "Classe", "ID de origem", "NOME", undefined]) assert.equal(isSourceField(label), false, String(label));
const popup = read("src/components/VectorPopup.tsx");
assert.ok(popup.includes("<summary>Atributos da fonte</summary>"));
assert.ok(popup.indexOf("{readable.map(row)}") < popup.indexOf("<summary>Atributos da fonte</summary>"), "Readable rows come first");

// 4. Mobile tabs.
const tabs = load("src/components/mobileTabs.ts");
const ids = (list) => list.map(tab => tab.id).join(",");
assert.equal(ids(tabs.shownMobileTabs(false, 0)), "measure", "No campaigns, no legend: Camadas + Medir");
assert.equal(ids(tabs.shownMobileTabs(true, 0)), "time,measure");
assert.equal(ids(tabs.shownMobileTabs(true, 2)), "time,measure,legend");
assert.equal(JSON.stringify(tabs.initialMobileState(false)), JSON.stringify({ panelOpen: true, view: null }), "Without campaigns the default tab is Camadas");
assert.equal(JSON.stringify(tabs.initialMobileState(true)), JSON.stringify({ panelOpen: false, view: "time" }));
assert.equal(JSON.stringify(tabs.initialMobileState(false, true)), JSON.stringify({ panelOpen: false, view: null }), "popup.openOnHome without campaigns: map starts clear");
assert.equal(JSON.stringify(tabs.initialMobileState(true, true)), JSON.stringify({ panelOpen: false, view: "time" }));
assert.equal(tabs.MOBILE_MEDIA_QUERY, "(max-width: 760px)");
assert.equal(tabs.isMobileLayout(), false, "No window: desktop layout");

// 4b. Opening visibility: defaultVisibleMobile overrides defaultVisible on mobile only.
const { defaultLayerIds } = load("src/projects/layerVisibility.ts");
const opening = [
  { id: "a", defaultVisible: true },
  { id: "b", defaultVisible: true, defaultVisibleMobile: false },
  { id: "c", defaultVisible: false, defaultVisibleMobile: true },
  { id: "d", defaultVisible: false },
];
assert.equal(defaultLayerIds(opening, false).join(","), "a,b", "Desktop uses defaultVisible");
assert.equal(defaultLayerIds(opening, true).join(","), "a,c", "Mobile uses defaultVisibleMobile when set");
assert.equal(tabs.activeMobileView("legend", true, 0), "time", "A vanished tab falls back");
assert.equal(tabs.activeMobileView("legend", false, 0), null);
assert.equal(tabs.activeMobileView("measure", false, 0), "measure");
assert.match(styles, /\.app-shell:not\(\[data-mobile-view="time"\]\) \.temporal-timeline/, "One overlay per tab");

// 5. Cesium attribution: native content kept, compact and readable.
assert.match(styles, /\.cesium-widget-credits \{[^}]*font-size: 10px/);
assert.match(styles, /\.cesium-credit-expand-link/);
assert.doesNotMatch(styles, /\.cesium-widget-credits[^{]*\{[^}]*display: none/, "Attribution is never hidden");

console.log("UI passed: local fonts and licenses, theme tokens, 52px header and tools column, popup source attributes last, mobile tabs (Camadas by default without campaigns) and compact visible attribution.");
