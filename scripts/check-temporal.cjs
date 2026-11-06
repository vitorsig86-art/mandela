// Timeline, period badge and comparison entry with synthetic campaigns.
// No browser or network required. Run: node scripts/check-temporal.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const react = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.join(__dirname, "..");

// Components are called as plain functions; hooks keep their initial value.
const reactShim = {
  ...react,
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useId: () => "test-id",
};
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const source = fs.readFileSync(path.join(root, file), "utf8").replaceAll("import.meta.env.DEV", "false");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (name.endsWith(".css")) return {};
    if (name === "react") return reactShim;
    if (!name.startsWith(".")) return require(name);
    const base = path.join(path.dirname(file), name);
    const target = [base + ".ts", base + ".tsx"].find(candidate => fs.existsSync(path.join(root, candidate)));
    assert.ok(target, "Module exists: " + name);
    return load(target);
  } });
  return exports;
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !node.props) return [];
  // Function components (Fragment children included) are expanded by React only at render time.
  return [node, ...elements(node.props.children)];
}
const text = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const { templateProject } = load("src/projects/template.ts");
const { TemporalSelector } = load("src/components/TemporalSelector.tsx");
const { PeriodBadge } = load("src/components/PeriodBadge.tsx");
const { campaignEntries, canCompare, DEFAULT_TIMELINE_TITLE } = load("src/components/temporal.ts");
const { configuredVisibility } = load("src/projects/layerVisibility.ts");

// 1. Without campaigns the map stays clean: no timeline, badge or comparison.
const noop = () => {};
assert.equal(campaignEntries(templateProject.layers).length, 0);
assert.equal(TemporalSelector({ layers: templateProject.layers, visible: new Set(["basemap"]), statuses: {}, onToggle: noop, onCompare: noop }), null);
assert.equal(PeriodBadge({ layers: templateProject.layers, visible: new Set(["basemap"]), statuses: {}, layerName: "Ortomosaico" }), null);
assert.equal(canCompare(templateProject), false);

// 2. Synthetic series: three campaigns, one event between the first two.
const source = (name) => ({ format: "tms", url: `https://example.invalid/${name}/{z}/{x}/{reverseY}.png`, credit: "Exemplo", minimumLevel: 0, maximumLevel: 8 });
const layers = [
  templateProject.layers[0],
  { id: "a", name: "A", description: "", kind: "orthomosaic", source: source("a"), defaultVisible: false, temporalCampaign: { label: "2020", description: "Antes da obra", comparisonLabel: "2020 — Pré-obra", eventAfter: "Obra concluída em 2022" } },
  { id: "b", name: "B", description: "", kind: "orthomosaic", source: source("b"), defaultVisible: false, temporalCampaign: { label: "2023", description: "Depois da obra" } },
  { id: "c", name: "C", description: "", kind: "orthomosaic", source: source("c"), defaultVisible: true, temporalCampaign: { label: "2025", description: "Levantamento atual", comparisonLabel: "2025 — Atual" } },
  { id: "overlay", name: "Raster", description: "", kind: "raster", source: source("r"), defaultVisible: true },
];
const project = { ...templateProject, layers, temporalComparison: { left: "a", right: "c" } };
const entries = campaignEntries(layers);
assert.equal(JSON.stringify(entries.map(entry => [entry.year, entry.period])), JSON.stringify([["2020", "Pré-obra"], ["2023", "Depois da obra"], ["2025", "Atual"]]));
assert.equal(canCompare(project), true);
assert.equal(canCompare({ ...project, temporalComparison: { left: "a", right: "missing" } }), false, "Preset must point at campaigns");
assert.equal(canCompare({ ...project, temporalComparison: undefined }), false);

// One period at a time, other layers preserved.
assert.equal(JSON.stringify([...configuredVisibility(layers, ["basemap", "c", "overlay", "a"])]), JSON.stringify(["basemap", "overlay", "a"]));

const toggles = [];
let compared = 0, exited = 0;
const changes = [];
const timeline = (props = {}) => TemporalSelector({ layers, visible: new Set(["basemap", "c", "overlay"]), statuses: { c: "ready" },
  onToggle: id => toggles.push(id), onCompare: () => compared++, onExitComparison: () => exited++, onComparisonChange: s => changes.push(s), ...props });
const markup = renderToStaticMarkup(timeline());
assert.match(markup, new RegExp(DEFAULT_TIMELINE_TITLE));
assert.equal(DEFAULT_TIMELINE_TITLE, "Evolução da paisagem");
assert.match(renderToStaticMarkup(timeline({ title: "Evolução da obra" })), /Evolução da obra/);
assert.equal((markup.match(/class="temporal-marker"/g) ?? []).length, 3);
assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1, "One marker pressed");
assert.match(text(markup), /Obra concluída em 2022/, "eventAfter is rendered on the timeline");
assert.equal((markup.match(/class="temporal-event"/g) ?? []).length, 1);
assert.match(markup, /Comparar/);
assert.doesNotMatch(renderToStaticMarkup(timeline({ onCompare: undefined })), /Comparar/, "No preset, no Comparar");

const markers = elements(timeline()).filter(node => node.props.className === "temporal-marker");
markers[2].props.onClick();
assert.equal(toggles.length, 0, "Selecting the active period keeps it on");
markers[0].props.onClick();
assert.equal(toggles.at(-1), "a");
elements(timeline()).find(node => node.props.className === "temporal-compare-button").props.onClick();
assert.equal(compared, 1);

// Comparing: markers choose "Depois" by default; the button exits.
const comparing = timeline({ comparison: { left: "a", right: "c" } });
const comparingMarkup = renderToStaticMarkup(comparing);
assert.match(comparingMarkup, /Antes/); assert.match(comparingMarkup, /Depois/);
assert.match(comparingMarkup, /Sair da comparação/);
elements(comparing).filter(node => node.props.className === "temporal-marker")[1].props.onClick();
assert.equal(JSON.stringify(changes.at(-1)), JSON.stringify({ left: "a", right: "b" }));
assert.equal(toggles.length, 1, "Comparison never toggles layers");
elements(comparing).find(node => node.props.className === "temporal-compare-button").props.onClick();
assert.equal(exited, 1);

// Period badge.
const badge = (visible, statuses = {}) => text(renderToStaticMarkup(PeriodBadge({ layers, visible, statuses, layerName: "Ortomosaico" })));
assert.match(badge(new Set(["c"]), { c: "ready" }), /2025 Atual Levantamento atual/);
assert.match(badge(new Set(["c"]), { c: "loading" }), /Carregando 2025/);
assert.match(badge(new Set(["basemap"])), /Nenhum período ativo/);
assert.match(badge(new Set(["basemap"])), /Ative “Ortomosaico” em Camadas/);

// App wiring: the badge gives way to the comparison labels.
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
assert.match(app, /\{!comparison && <PeriodBadge/);
assert.match(app, /canCompare\(project\)/);

console.log("Temporal passed: clean map without campaigns, timeline title, one period at a time, eventAfter marker, Comparar only with a valid preset, Antes/Depois selection, exit, and period badge states.");
