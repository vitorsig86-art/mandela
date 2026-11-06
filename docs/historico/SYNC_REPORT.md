# Template sync report

> Registro histórico da v1.0 (03/10/2026), movido para docs/historico. Pode não refletir o estado atual; nomes do projeto de referência foram substituídos por descrições genéricas.

Reference: production reference project (local folder outside the template)
Target: C:/Users/Usuario/Desktop/cardeal-map-template

## Copied/synchronized

All generic source files were synchronized from the reference: App.tsx, main.tsx, styles.css, vite-env.d.ts; cesium/createViewer.ts, loadLayer.ts, imageryTileErrors.ts, projectCamera.ts, measurementUtils.ts, measurementGraphics.ts; components/LayerPanel.tsx/.css, Legend.tsx/.css, NavigationControls.tsx/.css, MeasurementToolbar.tsx/.css; hooks/useCesiumViewer.ts, useProjectLayers.ts, useMeasurements.ts; projects/types.ts.

Also synchronized package.json/package-lock.json, tsconfig.json/tsconfig.node.json, vite.config.ts, .gitignore, .env.example, index.html, public/logo-cardeal.png, public/favicon.svg and the four scripts/check-*.cjs.

## Template adaptations and additions

- New src/projects/template.ts and replaced src/projects/index.ts: editable project name/location, neutral globe camera and illustrative bounds; reserved raster/GeoJSON/3D URLs in exampleLayers, excluded from active requests. Only basemap enabled in a fresh clone.
- Added generic raster/vector kinds while retaining thematic kind compatibility.
- New public/legends/example.png: synthetic illustrative legend, no reference property values.
- Completed Portuguese app/navigation/legend/error labels and pt-BR document language.
- New src/cesium/captureCamera.ts and scripts/capture-camera.cjs; development-only capture event in viewer hook, absent from production output.
- Genericized project/workspace/lifecycle checks with synthetic fixtures and seam reproduction; measurements check preserved. New npm run check and capture-camera commands.
- Vite cache stored in .vite, ignored alongside other generated folders.
- Replaced README.md and outdated AGENTS.md; added this report.

## Removed stale target files

The reference project's configuration file, src/hooks/useIonConnectionTest.ts and two example boundary GeoJSON files in public/data/.

## Intentionally not copied

Reference project config/registry, README/AGENTS property content, .env.local, property legend PNGs (MDT/MDS/aspect), property/example boundary datasets, .git, node_modules, dist, .npm-cache and .verification. Existing Cesium skill resources/junctions were preserved.

## Features retained

Cesium viewer; ion Bing Aerial with labels and independent World Terrain/fallbacks; camera/Home/north/zoom; measurement tools; grouped raster/vector/3D layers and independent raster opacity; branding and approved desktop/mobile CSS; compact mobile header/drawer/backdrop/sticky heading/cards/controls; native accessible Cesium attribution; configuration-driven image/gradient legends, simultaneous raster legends and mobile tap/keyboard expansion; generic TMS/XYZ/GeoJSON/native 3D Tiles loading; lifecycle/provider reuse/async cleanup and tile-seam protection.

## Property values replaced

No reference R2 URL, municipality, property layer ID/metadata, raster footprint/zoom defaults, final camera coordinates or property legend path/value remains in production configuration. Camera is neutral (0, 0, height 20000000, heading 0, pitch -90, roll 0); illustrative bounds [-1, -1, 1, 1] and levels 0-8 must be replaced with dataset values. The only reference-name match in scripts is an intentional guard against reintroducing property content into generic source.

## Validation

- npm run typecheck: passed both TypeScript configs.
- npm run build: passed; final build used --configLoader runner for this Windows sandbox.
- npm run check: all four checks passed. Lifecycle: two synthetic rasters, four ON/OFF cycles, 682 terrain cases per activation, every opacity 0-100%, independent simultaneous opacity, retained opacity, vector/3D reuse and cleanup. Original Cesium rectangle failure reproduced with synthetic bounds and prevented by the inherited guard.
- Camera conversion/capture round trip: passed. Production bundle has no capture event listener.
- Audit: no property-specific URL or camera in src/public/index.html/.env.example or production JS; .env.example token empty; skills-lock JSON valid.
- Browser: production preview plus disposable local fixture using the actual App/components and two synthetic rasters. Desktop 1440x900 and mobile 390x844/390x640 verified. Multiple image legends loaded; expansion 92px to 144px; Escape collapses; sliders independent; drawer/backdrop; sticky heading; 46px mobile header; credits visible and native attribution dialog usable. Desktop panel 316px/header 76px; legends below navigation and above credits; original viewport restored.
- npm ci could not download packages because this environment blocked network access. Validation used a temporary read-only directory junction to the reference's installed dependencies; no dependency folder was copied, and the junction was removed after checks. A new clone still requires npm ci.
- Reference git status remained clean. No reference source/config/assets were edited.
- No target Git repository exists: no commit, no push, no remote changes.

Ready to reuse for the next property without edits to generic viewer architecture. Final property data/CORS/ion access must be checked using that project's own URLs and restricted public token; this template validation did not authenticate to ion or request property assets.

Generated-folder cleanup was rejected by automatic approval review (sandbox approval is disabled). dist, .npm-cache, .vite and .verification therefore remain as ignored local validation artifacts. They were generated in the target, not copied from the reference, and must be excluded from any manual folder/archive transfer. The temporary node_modules junction was successfully removed.
