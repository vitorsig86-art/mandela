# Repository Guidelines

> **Projeto derivado `campinas-2-webgis`**, criado do Cardeal Map template (commit 109457e, com alterações não commitadas) em 2026-11-06, por cópia manual com robocopy. A seção "Projetos derivados" prevalece sobre as regras exclusivas do template. Configuração real: `src/projects/campinas-2.ts`.

This is the reusable Cardeal Map template: React, TypeScript, Vite and CesiumJS. The approved architecture comes from a production reference project outside this folder; never modify any other project folder while updating this template.

## Structure

- src/projects/: property-specific configuration, source URLs, bounds, zoom levels, labels, legends and opening/Home camera. In the template, template.ts is the entry point and holds only generic examples; in a derived project the real values live in src/projects/<slug>.ts (see "Projetos derivados").
- src/cesium/: reusable viewer, camera, loaders and measurement utilities.
- src/hooks/: viewer, layer and measurement lifecycle.
- src/components/: reusable Portuguese UI and responsive CSS; icons.tsx is the shared icon set.
- src/theme.css: colors, radii, shadows and @font-face; src/styles.css: app shell layout.
- public/legends/: image legend assets; example.png is illustrative.
- public/fonts/: local Figtree and Caprasimo (woff2) with their OFL licenses.
- scripts/: local generic regression checks.
- agent/skills/, .agents/skills/, .claude/skills/: existing Cesium contributor guides; preserve reference files. In the template .claude/skills holds junctions to .agents/skills; in derived projects it is a real folder.

## Validation

Use npm.cmd on PowerShell if npm.ps1 is blocked. Run npm ci, npm run typecheck, npm run check and npm run build. Verify affected interactions in desktop/mobile browser and preview. Tests use synthetic data; validate remote URLs/CORS with the final project configuration.

Use two-space indentation, double-quoted imports, semicolons, PascalCase components, camelCase functions and use-prefixed hooks. Keep generic components independent of layer IDs/themes. Legends require PNG plus config only.

Preserve the approved v3 interface (redesign ported from the Jurema project):
- Theme tokens and local fonts live in src/theme.css (Figtree and Caprasimo in public/fonts, OFL). Components read the tokens only; never load fonts from an external service. A new visual identity changes src/theme.css, not the layout.
- Desktop: 52px header (brand, "Projeto · Município", "Camadas" collapse, "Sobre os dados"), collapsible layer panel on the left, one fixed tools column on the right (compass, zoom, Home, GPS, then measurement with the "Sobre as altitudes" note), legend card bottom-right with "Legenda · N", compact native Cesium attribution bottom-left.
- Time: the timeline, period badge and "Comparar" render only when the project has temporal campaigns; without campaigns the map stays clean. Texts are configurable (temporalLabels); eventAfter is a field, its content belongs to the project.
- Mobile: bottom bar (Camadas, Tempo, Medir, Legenda) and a bottom sheet with a handle (medium/high), replacing the old side drawer. "Tempo" only with campaigns, "Legenda" only with a visible legend; the start tab is "Tempo" with campaigns, otherwise "Camadas". One overlay over the map per tab. Rules live in src/components/mobileTabs.ts.
- Macro context popups (group "macro") use the curated presets in src/projects/macroPopups.ts, set per layer with source.macroPopup (municipality, climate, geology, geomorphology, soils, vegetation, ana-hydrography, ana-basin, simulated-basins, simulated-drainage). The Andrelândia curation is the reference: do not change fields, labels, units, decimals or sections, and never list raw attributes automatically. A new schema gets a new preset (plus its id in MacroPopupPreset), not a per-project popup. A macro layer without a preset shows no attributes (a "not configured" notice in development only). Formatting lives in src/cesium/curatedPopup.ts.
- Popups list readable attributes first and raw source fields under "Atributos da fonte". The 3D model hint appears on the map the first time a model is enabled. "Legenda não fornecida" exists only in development (import.meta.env.DEV); production builds never show it.
- Keep tap-expand legends, 44px touch targets and the native Cesium credit content and dialog.

Do not place real property-specific defaults in the template. Configure exampleLayers before adding entries to the active layers list: invisible rasters/vectors are still loaded. Keep credentials out of commits; VITE_* values are browser visible. Never copy .env.local. Do not commit node_modules, dist, caches or verification artifacts. Do not initialize Git, push or rewrite history unless requested; if this template already has Git, review the diff before committing.

## Projetos derivados

Vale quando o repositório foi criado por `scripts/new-project.ps1`: o AGENTS.md do clone começa com o aviso "Projeto derivado". Nesse caso, esta seção prevalece sobre as regras exclusivas do template acima.

- Valores reais da propriedade (nome, município, bounds, câmera, URLs do R2, assetId, legendas, textos) ficam em `src/projects/<slug>.ts`, registrado em `src/projects/index.ts`. `src/projects/template.ts` continua só com exemplos genéricos, usados pelos checks; não coloque dados reais nele nem no código genérico (`src/cesium`, `src/hooks`, `src/components`).
- Roteiro passo a passo do projeto: `docs/NOVO-PROJETO.md` (ordem das etapas, lições do Cyro e exemplo comentado de `src/projects/<slug>.ts`). Siga-o ao montar um novo WebGIS.
- `git init`, a branch `main` e o primeiro commit local são feitos pelo script na criação do projeto. Remoto, push e reescrita de histórico continuam exigindo pedido explícito.
- `.claude/skills` é pasta real, copiada do template; não recrie junctions.
- Correções genéricas descobertas num projeto vão para o template em mudança separada; nunca edite a pasta do template a partir do clone.

## Exceções de internals do Cesium

Validadas no Cesium **1.146.0** (fixado sem `^` no package.json). São as únicas dependências de internals permitidas. **Nenhuma nova exceção entra sem aprovação explícita do responsável pelo template.** Qualquer upgrade do Cesium exige revalidar as três, rodar `npm run check` e atualizar esta lista.

1. `src/cesium/loadLayer.ts` — `guardRasterTileIntersections` envolve, por instância de `ImageryLayer`, o método privado `_createTileImagerySkeletons`. Motivo: no 1.146, um contato de borda por arredondamento entre o tile do terreno e o retângulo do raster gera uma interseção `undefined` que quebra `rectangleToNativeRectangle` e derruba o raster ao ativar. Não tem trava de versão: se o método mudar de nome num upgrade, todos os rasters quebram.
2. `src/cesium/modelClipping.ts` — `guardClippingRectangles` usa `prePassesUpdate`, `_processingQueue`, `_selectedTiles` e `content._model.getRectangle` do `Cesium3DTileset`. Motivo: durante a inicialização do conteúdo, a esfera do modelo glTF pode ter `NaN` e quebrar o recorte por `ClippingPolygon`; o guard usa o volume nativo do tile. Só é ativado quando `VERSION` é 1.146.
3. `src/cesium/imageryTileErrors.ts` — substitui `provider.requestImage` por instância (monkey patch de método público) para observar tiles carregados com sucesso e distinguir lacunas 404/410 de borda de uma fonte inválida. A chamada, os argumentos e a promise originais são preservados, e o método é restaurado no `dispose`.

## Cesium vector scalability and territorial accuracy

- Before using experimental Cesium APIs, read docs/CESIUM_VECTOR_TILES_2026.md, the official documentation and the API/source for the exact installed version. Check package.json, package-lock.json and node_modules; the bundled skills use a 1.144 baseline and are not proof of runtime support. Never invent methods/options or treat a roadmap as shipped functionality.
- Evaluate GeoJSON, MVT and vector 3D Tiles when measured dataset size, loading time or memory establishes a real scalability need. Record the tradeoff, preview status, hosting/tiling cost and fallback. Prefer the simplest format that meets the measured requirements.
- Preserve stable source feature IDs, attribute names/types/units, Strahler order, provenance and technical metadata. Validate missing/null values and tile-boundary representations; visual filtering is not a database query or a guarantee of fewer downloads.
- Budget startup, streaming, CPU/GPU memory and frame time on desktop/mobile. For MVT, explicitly bound extent and zoom range: the current provider builds its full tile hierarchy up front. Use public lifecycle APIs and release resources/listeners; respect requestRenderMode.
- Verify horizontal CRS, coordinate order, units, vertical datum/geoid, acquisition date and spatial/altimetric consistency. Distinguish elevation data, terrain surface, photogrammetric mesh and design geometry. Visual clamping and model offsets do not establish survey accuracy or replace datum transformations.
- Keep thematic choices and source settings in src/projects/, with reusable loaders/hooks/components. Preserve current camera/Home, measurements, legends, Portuguese UI, responsive layout, attribution, navigation, tests and security. Do not introduce Leaflet or another mapping platform. Any architectural change requires a documented need and compatibility assessment; never recreate existing components.
- Vector Tiles support in Cesium does not mean integration exists in this template. Consult docs/POC_DRENAGEM_VECTOR_TILES.md before a future drainage experiment. Documentation/planning requests do not authorize production code, CSS, dependencies, property configuration or deployment changes.

## CESIUMJS — COMPATIBILIDADE E USO DE APIs OFICIAIS

Este protocolo é obrigatório antes de implementar, alterar, refatorar ou substituir qualquer funcionalidade relacionada ao CesiumJS e constitui orientação permanente para todos os futuros projetos derivados deste template.

1. Consultar primeiro as skills oficiais relevantes disponíveis no ambiente e, quando necessário, a documentação oficial do Cesium correspondente ao recurso utilizado.

2. Confrontar qualquer exemplo encontrado com a versão REAL do Cesium instalada neste projeto:
   - verificar `package.json`;
   - verificar `package-lock.json` ou lockfile equivalente;
   - verificar exports e tipos TypeScript efetivamente disponíveis;
   - não assumir compatibilidade apenas porque um exemplo aparece em documentação ou material oficial.

3. Não assumir que exemplos de outras versões do Cesium continuam válidos.

4. Priorizar sempre:
   - APIs públicas;
   - APIs documentadas;
   - APIs não depreciadas;
   - recursos compatíveis com a versão instalada no projeto.

5. Evitar dependências de:
   - propriedades privadas;
   - propriedades ou métodos iniciados por `_` quando representarem internals;
   - estruturas internas do engine;
   - métodos não documentados;
   - APIs deprecated;
   - monkey patches;
   - hacks dependentes da implementação interna do Cesium.

6. Não utilizar uma propriedade privada apenas porque ela resolve rapidamente um problema se existir uma alternativa pública suportada.

7. Se uma implementação existente no template já estiver validada e funcionando:
   - preservá-la por padrão;
   - adaptar ao redor dela quando possível;
   - não substituí-la apenas por existir uma abordagem diferente em documentação ou exemplo recente.

8. Antes de substituir uma implementação Cesium existente, confirmar:
   - que a nova API existe na versão instalada;
   - que não está deprecated;
   - que atende ao mesmo comportamento;
   - que não causa regressão em desktop, mobile, câmera, layers, interação ou performance.

9. Se a documentação, skill ou exemplo oficial entrar em conflito com a versão instalada:
   - NÃO forçar a implementação;
   - NÃO alterar silenciosamente dependências;
   - NÃO quebrar o comportamento existente;
   - preservar a implementação funcional;
   - explicar a incompatibilidade;
   - apresentar uma proposta compatível antes de modificar o código.

10. Não fazer upgrade ou downgrade do CesiumJS para resolver uma funcionalidade sem autorização explícita.

11. Não alterar dependências Cesium relacionadas apenas para seguir um exemplo mais recente sem primeiro informar o motivo e o impacto.

12. Quando houver mais de uma solução possível, preferir nesta ordem:
    a. API pública já utilizada e validada no template;
    b. API pública oficial compatível com a versão instalada;
    c. adaptação arquitetural sem uso de internals;
    d. somente após discussão explícita, qualquer solução excepcional.

13. Para recursos como:
    - `Cesium3DTileset`;
    - `IonResource`;
    - imagery providers;
    - terrain;
    - `ClippingPolygon` / clipping;
    - `GeoJsonDataSource`;
    - `Entity`;
    - `Primitive`;
    - `ScreenSpaceEventHandler`;
    - câmera;
    - geolocation;
    - lifecycle de `Viewer`;
    conferir a API efetivamente disponível antes de implementar alterações estruturais.

14. TypeScript deve ser usado também como fonte de verdade de compatibilidade: se um método, propriedade, overload ou opção não existir nos tipos da versão instalada, não contornar imediatamente com `any` ou cast apenas para fazer o exemplo compilar.

15. Não usar `as any`, `@ts-ignore` ou `@ts-expect-error` para esconder incompatibilidade com Cesium sem necessidade técnica claramente justificada.

16. Em caso de dúvida sobre uma API Cesium: parar antes da alteração destrutiva, preservar o comportamento existente e relatar a dúvida/proposta.

**PRINCÍPIO CENTRAL:**

> Documentação e exemplos orientam a implementação, mas a versão instalada e as APIs públicas efetivamente disponíveis no projeto determinam o que pode ser usado.
