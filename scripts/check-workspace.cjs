// Local panel rendering and interaction checks. No browser or network required.
// Run: node scripts/check-workspace.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.join(__dirname, "..");

// Components are called as plain functions to inspect their element trees.
// Hooks therefore run outside a React renderer: state keeps its initial value.
const react = require("react");
const reactShim = {
  ...react,
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useId: () => "test-id",
};
const modules = new Map();
function resolveLocal(from, name) {
  const base = path.join(path.dirname(from), name);
  const match = ["", ".ts", ".tsx"].map((extension) => base + extension).find((candidate) => fs.existsSync(path.join(root, candidate)) && fs.statSync(path.join(root, candidate)).isFile());
  if (!match) throw new Error(`Cannot resolve ${name} from ${from}`);
  return match;
}
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  // import.meta does not exist in this CommonJS sandbox: development-only UI
  // is evaluated as a production build (import.meta.env.DEV === false).
  const source = fs.readFileSync(path.join(root, file), "utf8").replaceAll("import.meta.env.DEV", "false");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => name.endsWith(".css") ? {}
    : name === "react" ? reactShim
    : name.startsWith(".") ? load(resolveLocal(file, name))
    : require(name) });
  return exports;
}

function elements(node, parents = []) {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, parents));
  if (!node || typeof node !== "object" || !node.props) return [];
  return [{ node, parents }, ...elements(node.props.children, [...parents, node])];
}

const { templateProject, exampleLayers } = load("src/projects/template.ts");
const project = { ...templateProject, layers: [...templateProject.layers.filter(layer => layer.kind === "basemap"), ...exampleLayers] };
const { LayerPanel, getWorkspaceSections } = load("src/components/LayerPanel.tsx");
const sections = getWorkspaceSections(project.layers);
assert.equal(JSON.stringify(sections.map((section) => [section.title, section.layers.length])), JSON.stringify([
  ["Mapa base", 1], ["Modelo 3D", 1], ["Rasters", 2], ["Vetores", 1], ["Análise Macro", 0],
]));
assert.equal(new Set(sections.flatMap((section) => section.layers.map((layer) => layer.id))).size, project.layers.length);
let visible = new Set(project.layers.filter((layer) => layer.defaultVisible).map((layer) => layer.id));
const opacities = {};
const toggles = [];
const opacityChanges = [];
const render = () => LayerPanel({
  project, visible, statuses: {}, rasterOpacities: opacities,
  onToggle: (id) => { toggles.push(id); if (visible.has(id)) visible.delete(id); else visible.add(id); },
  onOpacityChange: (id, value) => { opacityChanges.push([id, value]); opacities[id] = value; },
  onClose() {},
});
const initialTree = render();
const markup = renderToStaticMarkup(initialTree);
assert.doesNotMatch(markup, /<select|<option/);
assert.doesNotMatch(markup.replace(/<[^>]*>/g, " "), /PROJECT WORKSPACE|\bProject\b|\bLayers\b|\bactive\b|Choose what/);
assert.ok(markup.includes(project.name));
assert.ok(markup.includes(project.location));
assert.equal(elements(initialTree).filter(({ node }) => node.type === "input" && node.props.type === "range").length, 0);

for (const section of sections) {
  for (const layer of section.layers) {
    const row = elements(render()).find(({ node }) => node.key === layer.id).node;
    const checkbox = elements(row).find(({ node }) => node.type === "input" && node.props.type === "checkbox").node;
    const initial = visible.has(layer.id);
    assert.equal(checkbox.props.checked, initial);
    checkbox.props.onChange();
    assert.equal(visible.has(layer.id), !initial);
    checkbox.props.onChange();
    assert.equal(visible.has(layer.id), initial);
    assert.equal(toggles.at(-1), layer.id);
  }
}

visible = new Set(project.layers.map((layer) => layer.id));
assert.equal(elements(render()).filter(({ node }) => node.type === "input" && node.props.type === "range").length, 2);
for (const layer of sections.find((section) => section.id === "raster").layers) {
  const row = elements(render()).find(({ node }) => node.key === layer.id).node;
  const slider = elements(row).find(({ node }) => node.type === "input" && node.props.type === "range");
  assert.ok(!slider.parents.some((parent) => parent.type === "label"), "Moving opacity must not activate the checkbox label");
  assert.equal(slider.node.props.value, 100);
  assert.equal(slider.node.props.min, 0);
  assert.equal(slider.node.props.max, 100);
  slider.node.props.onChange({ currentTarget: { value: "65" } });
  assert.equal(JSON.stringify(opacityChanges.at(-1)), JSON.stringify([layer.id, 65]));
  assert.ok(visible.has(layer.id), "Opacity must not change visibility");
  const updatedRow = elements(render()).find(({ node }) => node.key === layer.id).node;
  assert.match(renderToStaticMarkup(updatedRow), /65%/);
}
for (const layer of sections.filter((section) => section.id !== "raster").flatMap((section) => section.layers)) {
  const row = elements(render()).find(({ node }) => node.key === layer.id).node;
  assert.ok(!elements(row).some(({ node }) => node.type === "input" && node.props.type === "range"));
}
assert.match(renderToStaticMarkup(render()), /model-layer-card/);
const { Legend } = load("src/components/Legend.tsx");
for (const layer of project.layers.filter(layer => layer.legend)) {
  assert.equal(Legend({ ...layer.legend, visibility: false }), null);
  const markup = renderToStaticMarkup(Legend({ ...layer.legend, visibility: true }));
  assert.ok(markup.includes(layer.legend.imageUrl));
  assert.ok(markup.includes(layer.legend.imageAlt));
  assert.doesNotMatch(markup, /raster-legend-gradient/);
  assert.match(renderToStaticMarkup(Legend({ ...layer.legend, imageUrl: "/future-legend.png", visibility: true })), /future-legend\.png/);
}
const gradientLegend = { title: "Gradient", min: 0, max: 10, tickValues: [0, 10], gradientStops: [{ position: 0, color: "blue" }, { position: 100, color: "red" }], visibility: true };
assert.match(renderToStaticMarkup(Legend(gradientLegend)), /raster-legend-gradient/);
assert.equal(Legend({ ...gradientLegend, max: 0 }), null);
assert.doesNotMatch(renderToStaticMarkup(render()), /Análise Macro/, "Empty sections stay hidden");
assert.doesNotMatch(renderToStaticMarkup(render()), /Cenas rápidas/, "No scenes, no scene block");
const scenes = [{ id: "s1", label: "Cena 1", layerIds: ["basemap"] }];
let applied = null;
const withScenes = LayerPanel({ project, visible: new Set(["basemap"]), statuses: {}, rasterOpacities: {}, onToggle() {}, onOpacityChange() {}, onClose() {}, scenes, onApplyScene: (scene) => applied = scene });
const sceneButton = elements(withScenes).find(({ node }) => node.type === "button" && node.props.className === "workspace-scene").node;
assert.equal(sceneButton.props["aria-pressed"], true);
sceneButton.props.onClick();
assert.equal(applied, scenes[0]);
assert.match(renderToStaticMarkup(withScenes), />0\/2</, "Raster counter is active/total of the whole group");
// panel options. Template defaults: no search, Mapa base, Modelo 3D, Rasters,
// Vetores, with Modelo 3D open. Configured values change only presentation.
const sectionIds = (tree) => elements(tree).filter(({ node }) => node.type === "section" && node.props.className === "workspace-section").map(({ node }) => node.key);
const openIds = (tree) => elements(tree).filter(({ node }) => node.type === "button" && node.props.className === "workspace-section-toggle" && node.props["aria-expanded"]).map(({ node }) => node.props["aria-controls"].replace("workspace-list-", ""));
const defaultVisible = new Set(["basemap"]);
const panelProps = { visible: defaultVisible, statuses: {}, rasterOpacities: {}, onToggle() {}, onOpacityChange() {}, onClose() {} };
const defaultPanel = LayerPanel({ project, ...panelProps });
assert.doesNotMatch(renderToStaticMarkup(defaultPanel), /Buscar camada|workspace-search/);
assert.equal(JSON.stringify(sectionIds(defaultPanel)), JSON.stringify(["basemap", "model", "raster", "vector"]));
assert.equal(JSON.stringify(openIds(defaultPanel)), JSON.stringify(["basemap", "model"]));
assert.equal(JSON.stringify([...defaultVisible]), JSON.stringify(["basemap"]), "Opening Modelo 3D does not turn the model on");
const configured = LayerPanel({ project: { ...project, panel: { showLayerSearch: true, sectionOrder: ["vector", "raster", "raster", "basemap"], expandedSections: ["raster"] } }, ...panelProps });
assert.match(renderToStaticMarkup(configured), /Buscar camada/);
assert.equal(JSON.stringify(sectionIds(configured)), JSON.stringify(["vector", "raster", "basemap", "model"]), "Unlisted sections follow in default order; duplicates ignored");
assert.equal(JSON.stringify(openIds(configured)), JSON.stringify(["raster", "basemap"]));
const none = LayerPanel({ project: { ...project, panel: { expandedSections: [] } }, ...panelProps });
assert.equal(JSON.stringify(openIds(none)), JSON.stringify(["basemap"]), "expandedSections: [] keeps only active sections open");
assert.equal(JSON.stringify([...defaultVisible]), JSON.stringify(["basemap"]), "Expanding a section does not turn its layers on");
assert.equal(JSON.stringify(getWorkspaceSections(project.layers, ["macro", "vector"]).map((section) => section.id)), JSON.stringify(["macro", "vector", "basemap", "model", "raster"]));
// panelOrder sorts inside a section; without it the array order stays.
const vectorIds = (layers) => getWorkspaceSections(layers).find(section => section.id === "vector").layers.map(layer => layer.id).join(",");
const vector = (id, panelOrder) => ({ id, name: id, description: id, kind: "vector", defaultVisible: false, panelOrder, source: { format: "geojson", url: `https://example.invalid/${id}.geojson` } });
assert.equal(vectorIds([vector("a"), vector("b"), vector("c")]), "a,b,c", "Without panelOrder: array order");
assert.equal(vectorIds([vector("a", 3), vector("b"), vector("c", 1), vector("d", 2), vector("e")]), "c,d,a,b,e", "panelOrder first, the rest in array order");
assert.equal(vectorIds([vector("a", 1), vector("b", 1)]), "a,b", "Ties keep array order");
const ordered = [vector("a", 2), vector("b", 1)];
getWorkspaceSections(ordered);
assert.equal(ordered.map(layer => layer.id).join(","), "a,b", "The layers array (map stacking) is not reordered");
const { configuredVisibility } = load("src/projects/layerVisibility.ts");
// Template vector pattern: panel shows Área de Estudo and Matrículas first; the
// layers array (drawing order) is untouched. Mobile opening keeps only Matrículas.
const { thematicExamples } = load("src/projects/template.ts");
const patternVectors = thematicExamples.filter(layer => layer.source.format === "geojson" && layer.panelOrder !== undefined);
assert.equal(vectorIds(patternVectors), "study-area-example,parcels-example,microbasins-example,contours-2m-example,contours-3m-example,drainage-example,roads-example");
const { defaultLayerIds: openingIds } = load("src/projects/layerVisibility.ts");
assert.equal(openingIds(patternVectors, false).join(","), "parcels-example,study-area-example");
assert.equal(openingIds(patternVectors, true).join(","), "parcels-example");
const exclusive = [
  { ...project.layers[1], exclusiveGroup: "x" }, { ...project.layers[2], exclusiveGroup: "x" }, project.layers[0],
];
assert.equal(JSON.stringify([...configuredVisibility(exclusive, [exclusive[0].id, exclusive[1].id, "basemap", "unknown"])]), JSON.stringify([exclusive[1].id, "basemap"]));

// v3: section titles, single temporal switch, legend modes.
const titled = getWorkspaceSections(project.layers, [], { raster: "Relevo derivado", vector: "Levantamento" });
assert.equal(JSON.stringify(titled.map(section => [section.id, section.title])), JSON.stringify([
  ["basemap", "Mapa base"], ["model", "Modelo 3D"], ["raster", "Relevo derivado"], ["vector", "Levantamento"], ["macro", "Análise Macro"],
]), "sectionTitles changes only the visible text");
const titledPanel = renderToStaticMarkup(LayerPanel({ project: { ...project, panel: { sectionTitles: { raster: "Relevo derivado" } } }, ...panelProps }));
assert.match(titledPanel, /Relevo derivado/);
assert.doesNotMatch(titledPanel, />Rasters</);

const campaignSource = (name) => ({ format: "tms", url: `https://example.invalid/${name}/{z}/{x}/{reverseY}.png`, credit: "Exemplo", minimumLevel: 0, maximumLevel: 8 });
const campaignLayers = [
  { id: "c2020", name: "Campanha 2020", description: "Campanha", kind: "orthomosaic", source: campaignSource("2020"), defaultVisible: false, temporalCampaign: { label: "2020", description: "Primeira" } },
  { id: "c2024", name: "Campanha 2024", description: "Campanha", kind: "orthomosaic", source: campaignSource("2024"), defaultVisible: true, temporalCampaign: { label: "2024", description: "Atual" } },
];
const temporalProject = { ...project, layers: [project.layers[0], ...campaignLayers, ...project.layers.slice(1)] };
assert.equal(JSON.stringify(getWorkspaceSections(temporalProject.layers)[0].layers.map(layer => layer.id)), JSON.stringify(["basemap", "c2020", "c2024"]), "Campaigns sit with the basemap by default");
const temporalToggles = [];
const temporalPanel = (props = {}) => LayerPanel({ project: temporalProject, ...panelProps, visible: new Set(["basemap", "c2024"]), onToggle: id => temporalToggles.push(id), ...props });
const temporalMarkup = renderToStaticMarkup(temporalPanel());
assert.equal((temporalMarkup.match(/Ortomosaico/g) ?? []).length >= 1, true, "Default campaign switch name");
assert.doesNotMatch(temporalMarkup.replace(/<[^>]*>/g, " "), /Campanha 2020|Campanha 2024/, "Campaigns are not listed one by one");
assert.match(temporalMarkup, />2\/2</, "The series counts as one layer in its section");
assert.match(temporalMarkup, /layer-period-tag">2024</);
const campaignSwitch = elements(temporalPanel()).find(({ node }) => node.type === "input" && node.props.className === "layer-switch" && String(node.props["aria-label"]).startsWith("Ortomosaico")).node;
campaignSwitch.props.onChange();
assert.equal(temporalToggles.at(-1), "c2024", "Switching the series off turns the active campaign off");
assert.match(renderToStaticMarkup(LayerPanel({ project: { ...temporalProject, temporalLabels: { layerName: "Imagem de drone" } }, ...panelProps })), /Imagem de drone/);
assert.equal(elements(temporalPanel({ comparing: true })).find(({ node }) => node.props?.className === "layer-switch" && String(node.props["aria-label"]).includes("Ortomosaico")).node.props.disabled, true, "Comparison owns the periods");

const { legendMissing } = load("src/components/legendStatus.ts");
const thematic = { ...project.layers.find(layer => layer.id === "raster-example-a"), kind: "slope", legend: undefined };
assert.equal(legendMissing(thematic), false, "Production build never shows the missing-legend notice");
assert.equal(legendMissing(thematic, true), true, "Development shows it for a thematic raster without legend or legendMode");
assert.equal(legendMissing({ ...thematic, legendMode: "embedded" }, true), false, "embedded: no notice");
assert.equal(legendMissing({ ...thematic, legendMode: "none" }, true), false, "none: no notice");
assert.equal(legendMissing({ ...thematic, kind: "raster" }, true), false, "Only thematic kinds");
const embeddedPanel = renderToStaticMarkup(LayerPanel({ project: { ...project, layers: [project.layers[0], { ...thematic, legendMode: "embedded" }] }, ...panelProps, visible: new Set(["basemap", thematic.id]) }));
assert.doesNotMatch(embeddedPanel, /Legenda não fornecida|Legenda incorporada/, "Embedded legends show no notice in the panel");
assert.doesNotMatch(renderToStaticMarkup(LayerPanel({ project: { ...project, layers: [project.layers[0], thematic] }, ...panelProps, visible: new Set(["basemap", thematic.id]) })), /Legenda não fornecida/, "No notice in production");

console.log("Workspace passed: Portuguese sections, checkbox callbacks, independent sliders, 3D card, reusable image legends, hidden legends, gradient compatibility, hidden empty sections, scenes, exclusive groups and panel options (search, section order, expanded sections, section titles), single temporal switch and legend modes (embedded, none, development-only missing notice).");
