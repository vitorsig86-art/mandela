# Análise do Cardeal Map Template

> **Retrato de 28/10/2026, anterior aos 20 commits de revisão** que se seguiram (mudanças pendentes commitadas, checks corrigidos, Cesium fixado, limpeza, scripts de clonagem/rasters, CORS, checklist, entre outros). Movido para docs/historico; nomes de propriedades e caminhos de projetos anteriores foram trocados por termos genéricos. Para o estado atual, veja README.md, CHANGELOG.md e docs/CHECKLIST_NOVO_PROJETO.md.

Data: 28/10/2026. Escopo: leitura e mapeamento, sem alterar código. Único arquivo criado: este.
Estado analisado: branch `master`, último commit `9144d32 Cardeal Map template v2`, **mais 13 arquivos modificados e 12 novos não commitados** (temporal, GPS, diagnóstico, cenas, drenagem Strahler, diferença de cota). Tudo abaixo descreve o working tree atual, não só o commit.

Comandos executados (somente leitura): `npm run typecheck` (passa) e os 5 scripts de `npm run check` individualmente (3 passam, 2 falham — ver §5.1). `npm run build` **não** foi executado porque escreve em `dist/`.

---

## 0. Documentação existente × código

Documentos lidos: `AGENTS.md`, `README.md`, `SYNC_REPORT.md`, `TEMPLATE_V2_REPORT.md`, `docs/TEMPLATE_FEATURES.md`, `docs/CESIUM_VECTOR_TILES_2026.md`, `docs/POC_DRENAGEM_VECTOR_TILES.md`. Não existe `CLAUDE.md` nem checklist de clonagem dedicado.

| Documento diz | Código mostra |
|---|---|
| README: "Execute typecheck, check e build" — checks passam | `check-workspace.cjs` e `check-measurements.cjs` **falham** contra o working tree atual (não foram atualizados para `layerVisibility.ts` e para o `postRender` novo de `useMeasurements`). `TEMPLATE_FEATURES.md:123` admite que só typecheck foi rodado. |
| README: não menciona temporal, cenas, diagnóstico, GPS, `exclusiveGroup`, `group`/`subsection`, `legendMode`, drenagem, diferença de cota | Tudo isso existe no código (não commitado) e está documentado só em `docs/TEMPLATE_FEATURES.md`. |
| README:13 "Edite template.ts: identificação, localização, **bounds** e initialCamera" | `ProjectConfig.bounds` só é usado se `initialCamera` faltar (`projectCamera.ts:19`), mas `initialCamera` é obrigatório no tipo (`types.ts:121`). Na prática `bounds` do projeto não tem efeito; a constante só alimenta os exemplos. |
| SYNC_REPORT:49 "No target Git repository exists" e "four check scripts" | Há repositório Git com 2 commits e 5 scripts de check. Relatório desatualizado. |
| README "Cenas" / pedido do usuário "cenas de câmera" | `scenes` (`types.ts:129-135`) definem **apenas conjuntos de camadas**; nenhuma cena move a câmera (`TEMPLATE_FEATURES.md:28`). Não há cenas de câmera no template, só abertura/Home. |
| AGENTS/README: "não colocar valores de propriedade no template" | `docs/TEMPLATE_FEATURES.md:53,111` cita nomes de dois WebGIS de produção anteriores; `SYNC_REPORT.md:3` aponta a pasta local do projeto de produção de referência. Resíduos só em docs, não em código. |
| `CESIUM_VECTOR_TILES_2026.md` / AGENTS: skills com baseline 1.144 | Cesium instalado é **1.146.0**. Doc já alerta corretamente. |
| README:102 "proteção pontual usa internos somente no Cesium 1.146" | Verdadeiro para o clipping (`modelClipping.ts:104`). Mas o guard de rasters (`loadLayer.ts:53-73`) também usa internos (`_createTileImagerySkeletons`) e **não** tem trava de versão — README não menciona. |

---

## 1. Estrutura

### 1.1 Árvore relevante

```
index.html                  título, meta, favicon (hardcoded "Cardeal Map Viewer")
vite.config.ts              react() + vite-plugin-cesium; porta 5173 strict; cache em .vite
package.json                scripts dev/typecheck/build/preview/check/capture-camera
.env.example                VITE_CESIUM_ION_TOKEN, VITE_CESIUM_3D_TOKEN (vazios)
tsconfig*.json              strict, bundler resolution
public/
  logo-cardeal.png          logo do header e favicon
  favicon.svg               NÃO usado (index.html aponta para o PNG)
  legends/example.png       legenda ilustrativa
  data/                     pasta vazia
logo-cardeal.png            duplicata idêntica da de public/ (não usada)
src/
  main.tsx                  React root + widgets.css do Cesium + styles.css
  App.tsx                   layout, estado de visibilidade, modos, comparação, montagem dos componentes
  styles.css                layout global desktop/mobile
  vite-env.d.ts             tipa só VITE_CESIUM_ION_TOKEN
  projects/
    index.ts                registry: projects = [templateProject]; App usa projects[0]
    template.ts             ★ configuração do projeto (camadas, câmera, nome, exemplos)
    types.ts                contrato de configuração (LayerSource, ProjectConfig, Legend…)
    layerVisibility.ts      regras de exclusividade e camadas temporais
    drainageStyle.ts        simbologia Strahler opt-in
  cesium/
    createViewer.ts         opções do Viewer + Ion.defaultAccessToken
    loadLayer.ts            loaders: ion imagery, XYZ/TMS, GeoJSON, 3D Tiles; attach/remove
    imageryTileErrors.ts    tratamento de 404/410 e diagnóstico de fonte vazia
    prepareGeoJson.ts       remove Z / gera IDs numa cópia
    vectorPopup.ts          registro e leitura de popups por Entity
    modelClipping.ts        ClippingPolygon do tileset + guard de internos 1.146
    modelHeight.ts          offset vertical do tileset
    modelTerrainCutout.ts   recorte complementar do globo
    projectCamera.ts        abertura e Home
    captureCamera.ts        captura de câmera (dev)
    measurementUtils.ts     picking e cálculos de medição
    measurementGraphics.ts  desenho das medições
  hooks/
    useCesiumViewer.ts      ciclo do Viewer + World Terrain/fallback elipsoide
    useProjectLayers.ts     ciclo das camadas, visibilidade, opacidade, split temporal
    useMeasurements.ts      ferramentas de medição
    useGeolocation.ts       GPS
  components/               LayerPanel, Legend, NavigationControls, MeasurementToolbar,
                            VectorPopup(+popupPosition), TemporalSelector, TemporalComparison,
                            ModeSwitcher, DiagnosticJourney, ModelDevelopmentTools, ModelCropDev
scripts/                    check-*.cjs (testes sintéticos em Node), capture-camera.cjs
docs/                       features, vector tiles, POC de drenagem
.agents/skills, agent/skills, .claude/skills   skills Cesium (as de .claude são junctions)
```

Artefatos locais ignorados pelo Git e presentes na pasta: `node_modules/` (217 MB), `.npm-cache/` (56 MB), `.vite/` (35 MB), `dist/` (14 MB, build de 04/10, anterior às mudanças atuais), `.verification/` (14 MB). Não existe `.env.local`.

### 1.2 Ponto de entrada e carregamento do Cesium

- Stack: React 19 + TypeScript 5.9 + Vite 6 + `vite-plugin-cesium` 1.2.23.
- Cesium: **pacote npm**, `package.json` declara `^1.145.0`; lockfile e `node_modules` resolvem **1.146.0** (`@cesium/engine` 26.x, `@cesium/widgets` 16.x). Nada via CDN.
- Fluxo: `index.html` → `/src/main.tsx` → `App.tsx`. `main.tsx:3` importa `cesium/Build/Cesium/Widgets/widgets.css`.
- No **build**, o plugin trata `cesium` como global externo: copia o `Cesium.js` pré-compilado e os assets/workers para `dist/cesium/` e injeta no `<head>`, **antes** do bundle do app:
  `<link href="/cesium/Widgets/widgets.css">`, `<script src="/cesium/Cesium.js">`, depois `/assets/index-*.js` (confirmado em `dist/index.html`). Ou seja, o Cesium é auto-hospedado junto com o site.
- `CESIUM_BASE_URL` = `/cesium/` relativo ao `base` do Vite (padrão `/`). Logo, legendas (`/legends/...`) e Cesium usam caminhos absolutos: **o site assume ser servido na raiz do domínio**. Para subpasta seria preciso `base` no Vite e revisar paths de legenda/logo.
- Dependências externas em runtime: Cesium ion (api.cesium.com / assets), Bing via ion, `tile.openstreetmap.org` (fallback), e as URLs de dados de cada projeto. Nenhuma fonte web ou CDN extra.
- Não há configuração de deploy no repositório (sem Vercel/Netlify/Cloudflare/GitHub Actions). O `SYNC_REPORT` menciona "R2" como hospedagem de dados do projeto de referência.

### 1.3 Cesium ion e tokens

| Uso | Onde | Token |
|---|---|---|
| Ion.defaultAccessToken | `createViewer.ts:4` | `VITE_CESIUM_ION_TOKEN` |
| Cesium World Terrain | `useCesiumViewer.ts:46` `Terrain.fromWorldTerrain()` | default token |
| Bing Aerial com rótulos | `loadLayer.ts:120` `createWorldImageryAsync({ style: AERIAL_WITH_LABELS })` | default token |
| Modelo 3D ion (opcional) | `loadLayer.ts:93-100` `IonResource.fromAssetId(assetId, { accessToken })` | `VITE_CESIUM_3D_TOKEN` ou `tokenEnv` |

- Tokens ficam em `.env.local` (ignorado pelo Git; hoje inexistente na pasta). `.env.example` está vazio. **Nenhum token commitado.**
- Mas todo `VITE_*` vai para o bundle, legível por qualquer visitante. Além disso, `loadLayer.ts:95` acessa `import.meta.env[tokenEnv]` dinamicamente; isso faz o Vite embutir **todas** as variáveis `VITE_*` no bundle, inclusive tokens não usados pelo projeto. Mitigação: restringir cada token no painel ion aos assets e às URLs permitidas.
- O `Cesium.js` contém o token de demonstração da Cesium (JWT embutido na biblioteca), mas o template sobrescreve com `""` quando a variável falta, então ele não é usado.
- Sem token: terreno vira elipsoide WGS84 e o basemap vira OpenStreetMap, sem quebrar o app.

---

## 2. Configuração do Viewer

`createViewer.ts:6-21`:

| Opção | Valor |
|---|---|
| baseLayer | `false` (basemap entra como camada do projeto) |
| baseLayerPicker, geocoder, animation, timeline, homeButton, navigationHelpButton, fullscreenButton, sceneModePicker | `false` |
| infoBox, selectionIndicator | `false` (popup próprio) |
| scene3DOnly | `true` |
| requestRenderMode | `true`, `maximumRenderTimeChange: Infinity` (só renderiza quando o código chama `requestRender`) |

Não configurado (ficam os defaults do Cesium 1.146): iluminação/`enableLighting`, sombras, `depthTestAgainstTerrain`, `resolutionScale`, MSAA, fog, atmosfera, `maximumScreenSpaceError` do globo, `tileCacheSize`.

- **Terreno**: Cesium World Terrain fixo no hook (`useCesiumViewer.ts:44-62`); se falhar, `EllipsoidTerrainProvider`. **Não é configurável por projeto** e não há loader de terreno próprio (quantized-mesh / `CesiumTerrainProvider` a partir de MDT).
- **Imagery base**: camada `basemap` em `template.ts:5-16` (ion Bing + fallback OSM com `maximumLevel: 19`). O estilo `AERIAL_WITH_LABELS` está fixo em `loadLayer.ts:120`.
- **Câmera inicial**: `template.ts:56` (globo neutro 0,0, 20 000 km, pitch −90). Aplicada com `setView` em `useProjectLayers.ts:40` → `projectCamera.ts:16-29`. Home (`NavigationControls.tsx:75-79`) usa o mesmo `initialCamera` com `flyTo` de 1,2 s.
- **Limites de navegação**: nenhum. Sem `minimumZoomDistance`/`maximumZoomDistance` customizados, sem restrição de área. O usuário pode sair para qualquer lugar do globo.
- **Controles próprios**: bússola/norte, zoom +/−, Home, GPS (`NavigationControls.tsx`), medições (`MeasurementToolbar.tsx`), painel de camadas, legendas, popup, seletor temporal, comparação, modo Diagnóstico. Atribuição nativa do Cesium mantida (CSS compacto no mobile, `styles.css:56-69`).
- Widgets do Cesium visíveis: só o canvas e os créditos.

---

## 3. Pontos de customização por projeto

### 3.1 Centralizados em `src/projects/template.ts`

| Linha | O quê |
|---|---|
| 4 | `bounds` (só alimenta exemplos; ver §0) |
| 5-16 | camada `basemap` (nome, descrição, fallback OSM) |
| 21-50 | `exampleLayers` — moldes inativos de raster TMS, GeoJSON e 3D Tiles URL |
| 53 | `id`, `name`, `location` (aparecem no topo do painel) |
| 56 | `initialCamera` (abertura e Home) |
| 59 | `layers` — **lista ativa**: só o que estiver aqui é carregado |
| 61-63 | `scenes`, `diagnostic.steps`, `temporalComparison` |
| 65 | `developmentTools` (modelAlignment, cropAuthoring, cameraCapture) |
| 70-105 | `thematicExamples` — moldes de polígonos classificados, linhas classificadas e modelo ion |
| 109-112 | `exampleClipping` — molde de recorte |

Também em `src/projects/`: `index.ts:4` (qual projeto é carregado) e `drainageStyle.ts` (cores Strahler, genéricas).

### 3.2 Hardcoded e espalhados

| Arquivo:linha | Valor | Precisa mudar por projeto? |
|---|---|---|
| `index.html:6-9` | `theme-color`, `description`, `<title>Cardeal Map Viewer</title>`, favicon | Provavelmente (título da aba não usa `project.name`) |
| `App.tsx:84-89` | logo `/logo-cardeal.png`, "CARDEAL / Map Viewer", "Área de trabalho geoespacial", aria-labels | Depende de branding por cliente |
| `App.tsx:79` | aria-label "Mapa 3D interativo do projeto" | Não |
| `public/logo-cardeal.png` | logo | Depende de branding |
| `styles.css:1` e CSS dos componentes | paleta verde Cardeal, larguras 316 px / 76 px | Não (layout aprovado) |
| `useCesiumViewer.ts:46` | World Terrain | Sim, se o projeto tiver terreno próprio |
| `loadLayer.ts:120` | estilo Bing `AERIAL_WITH_LABELS` | Talvez (com/sem rótulos) |
| `loadLayer.ts:132-134` | defaults raster: `maximumLevel` 18, tiles 256 | Só se omitido na config |
| `loadLayer.ts:146` | `WebMercatorTilingScheme` fixo | Sim, se vier TMS em EPSG:4326 |
| `loadLayer.ts:175-178` | defaults de vetor: traço `#d9f18b`, 3 px, fill 18% | Só se `style` omitido |
| `LayerPanel.tsx:26-30` | títulos de seção "Mapa base/Rasters/Vetores/Modelo 3D/Análise Macro" | Não |
| `NavigationControls.tsx:77` | duração do Home 1,2 s | Não |
| `MeasurementToolbar.tsx:35-36` | texto de aviso de referencial vertical | Revisar se o projeto tiver datum conhecido |
| `vite.config.ts:8`, `package.json:7,10` | porta 5173, host 127.0.0.1 | Não (mas impede teste no celular pela rede local) |
| `package.json:2` | `"name": "cardeal-map-template"` | Sim |

---

## 4. Fluxo por etapa

Regra geral: tudo é declarado em `template.ts → layers`. O painel agrupa por `group` ou, sem ele, pelo formato (`LayerPanel.tsx:24`). Rasters e vetores são **carregados no início mesmo invisíveis** (`useProjectLayers.ts:106-180`, em sequência para preservar a ordem de empilhamento); 3D Tiles só carregam quando ativados (`useProjectLayers.ts:44-100`).

### 4.1 Rasters (ortomosaico, MDT/MDS, derivados)

- Declaração: objeto `{ kind, source: { format: "tms" | "xyz", url, credit, bounds, minimumLevel, maximumLevel, tileWidth, tileHeight } }` — molde em `template.ts:21-38`.
- Provider: `UrlTemplateImageryProvider` + `WebMercatorTilingScheme` + `NeverTileDiscardPolicy` → `ImageryLayer` (`loadLayer.ts:128-171`). **Só EPSG:3857.** TMS usa `{reverseY}` na URL.
- Não há suporte a WMS, WMTS, COG, ion imagery asset nem `GeographicTilingScheme`.
- `kind` (`orthomosaic`, `dtm`, `dsm`, `slope`, `ndvi`…) é só rótulo; nenhum código diferencia os tipos temáticos (exceto `basemap` e `drainage`).
- MDT/MDS entram **apenas como imagem colorida**; não mudam o relevo.
- Interface: checkbox, slider de opacidade 0-100% por camada (`LayerPanel.tsx:162-178`), status (carregando/erro), legenda.
- Legenda: `legend: { type: "image", imageUrl: "/legends/x.png" }` ou gradiente (`min/max/tickValues/gradientStops`). `legendMode: "embedded"` quando a legenda já está nos pixels. Legendas aparecem empilhadas no mapa só para camadas visíveis (`App.tsx:115-117`).
- Extras: `temporalCampaign` (seletor de períodos, uma série por projeto) e `temporalComparison` (split-screen com `ImageryLayer.splitDirection`); `exclusiveGroup` para camadas mutuamente exclusivas.
- Erros: 404/410 de tiles isolados são ignorados; 32 tiles faltando sem nenhum sucesso em 15 s → aviso (`imageryTileErrors.ts`).
- Picking: nenhum (sem leitura de valor de pixel/cota do raster).

### 4.2 Modelo 3D

- Declaração: `{ kind: "3d-tiles", source: { format: "3d-tiles", source: "url", url } }` ou `{ source: "ion", assetId, tokenEnv }` (`types.ts:22-23`).
- Provider: `Cesium3DTileset.fromUrl(url)` ou `IonResource.fromAssetId` + `fromUrl` (`loadLayer.ts:91-116`). Sem opções de tileset (SSE, cache, `dynamicScreenSpaceError` etc. ficam no default).
- Ajustes: `heightOffsetMeters` (translação ao longo da normal do elipsoide no centro do bounding sphere, `modelHeight.ts`); `clipping` (polígono lon/lat, `ClippingPolygonCollection`, exige WebGL 2); `terrainCutout` (recorta o globo com o polígono complementar).
- Interface: card na seção "Modelo 3D" com ícone e dica de navegação; sem slider de opacidade, sem legenda.
- **Terrain como "modelo"**: não existe. Para um MDT como relevo real seria preciso funcionalidade nova (ver pergunta 6).
- Picking: features de 3D Tiles **não** abrem popup (o popup só lê `Entity`).
- Ferramentas de desenvolvimento (só `npm run dev` + flag): ajuste de altura ±100 m (`ModelDevelopmentTools.tsx`), editor de recorte com exportação de coordenadas (`ModelCropDev.tsx`). O ajuste de altura **não exporta** o valor: é preciso copiar à mão para `heightOffsetMeters`, somando ao valor já configurado (o slider é relativo à transformação já carregada).

### 4.3 Vetores

- Declaração: `{ kind: "vector" | "property-boundary" | "drainage" | "contours" …, source: { format: "geojson", url, style, popup, ignoreAltitude, uniqueFeatureIds, autoZoom, symbology } }`.
- Provider: `GeoJsonDataSource.load` (Entities) (`loadLayer.ts:172-262`). Só GeoJSON em **lon/lat WGS84**; sem reprojeção.
- Estilo: `stroke`, `strokeWidth`, `fill`, `fillOpacity`, `zIndex`, `clampToGround`, `classification` por atributo, `outline` por índice de paleta, `polygonOutline`. Contornos de polígono são redesenhados como polylines (largura em pixel). Pontos **não** têm estilo configurável (ficam com o pin padrão do Cesium).
- Drenagem: `kind: "drainage"` + `symbology: "simulated-drainage-strahler"` aplica 5 classes pelo atributo `STRAHLER`.
- Interface: checkbox; opacidade só se `opacityControl: true`; legenda opcional.
- Popup: `popup: { title, titleProperty, fields: [{ property, label, decimals, suffix… }] }`; componente próprio (`VectorPopup.tsx`) com resolução de sobreposição por `zIndex`.
- `autoZoom` é `true` por padrão (`useProjectLayers.ts:164-166`): se omitido, o mapa dá zoom no vetor visível ao carregar, sobrepondo a câmera inicial. Os exemplos sempre usam `false`.

### 4.4 Finalização

- Textos: `name`/`location` (painel), `description` de cada camada, `diagnostic.steps` (título, texto, fatos, referências), `index.html` e `App.tsx` (ver §3.2).
- Câmera: captura com `developmentTools.cameraCapture: true` + `npm run dev` + `window.dispatchEvent(new Event("cardeal:capture-camera"))` no console → colar o JSON em `initialCamera`.
- "Cenas rápidas" (`scenes`): botões que trocam o conjunto de camadas visíveis; **sem câmera**.
- Modo Diagnóstico: narrativa por etapas, cada uma podendo trocar camadas; aparece só se houver etapas.
- Publicação: `npm run build` gera `dist/` estático (app + `dist/cesium/`). Não há script de deploy.

### 4.5 Ferramentas sempre ativas

- Medições (`useMeasurements.ts`): coordenadas, distância 3D (linha reta), área horizontal (projeção equal-area no elipsoide, até 100 km), diferença de cota A→B (ΔZ, distância horizontal, inclinação, com procedência da superfície). Picking por `scene.pickPosition` com fallback `globe.pick`. **Alturas são elipsoidais WGS84**, sem conversão geoidal (o próprio UI avisa).
- GPS (`useGeolocation.ts`): marcador + círculo de precisão presos ao terreno; exige HTTPS ou localhost.

---

## 5. Problemas e riscos

### 5.1 Testes e estado do repositório

1. **Mudanças não commitadas**: as funcionalidades de temporal, GPS, diagnóstico, cenas, drenagem e diferença de cota não estão em nenhum commit. Se o próximo projeto for clonado do Git, elas não vão junto.
2. **`npm run check` falha**: `check-workspace.cjs` (não resolve `../projects/layerVisibility`) e `check-measurements.cjs` (mock do viewer sem `scene.postRender`). Como `check` encadeia com `&&`, os checks seguintes nem rodam pelo script npm. São testes desatualizados, não bugs do app, mas a rede de segurança está quebrada.
3. `dist/` é de 04/10, anterior às mudanças; não serve como referência de publicação.

### 5.2 Código morto e resíduos

- `ProjectConfig.bounds` e o ramo de abertura por retângulo em `projectCamera.ts:19-23` (inalcançáveis porque `initialCamera` é obrigatório).
- `allowMissingTiles` (`types.ts:39`): mantido "por compatibilidade", sem efeito.
- `Legend.formatValue` nunca é passado.
- CSS sem uso em `styles.css`: `.field-label`, `.section-heading`, `.section-description`, `.data-note`, `.note-icon`, `.panel-footer`, `.demo-badge`.
- `ModelCropDev.tsx:96` procura `.measurement-controls [role="checkbox"]`, que não existe (metade do seletor é inócua).
- `public/favicon.svg` não usado; `logo-cardeal.png` duplicado na raiz; `public/data/` vazio.
- Valores de `LayerKind` como `orthomosaic`, `dtm`, `ndvi`… sem comportamento associado (só rótulo).
- Três cópias das skills (`agent/`, `.agents/`, `.claude/`); `agent/` e `.agents/` diferem em conteúdo.
- Nomes de projetos anteriores em docs (WebGIS de produção e projeto de referência).

### 5.3 CRS e altura

- Rasters: só EPSG:3857. Um TMS em 4326 vai aparecer deslocado/distorcido sem erro.
- GeoJSON: só lon/lat. UTM (SIRGAS 2000 / 23S etc.) não é detectado nem convertido; o arquivo carrega em lugar errado ou não aparece.
- **Altura elipsoidal × ortométrica**: World Terrain e as medições usam altura elipsoidal (WGS84). Modelos fotogramétricos exportados com altitude ortométrica (Imbituba/MAPGEO) vão flutuar ou afundar pela ondulação geoidal N do local. `heightOffsetMeters` aplica um offset constante, que é só um ajuste visual. As "cotas" medidas não vão bater com a legenda de um MDT ortométrico.
- Se o World Terrain falhar (token ausente), o globo vira elipsoide e modelo/vetores parecem flutuar.
- `ignoreAltitude: true` descarta o Z do GeoJSON (útil para clamp, mas perde curvas de nível 3D).
- `uniqueFeatureIds: true` **substitui** o `id` original da feição por `camada:índice` (atributos preservados). Conflita com a regra do AGENTS de preservar IDs estáveis.

### 5.4 CORS e hospedagem

- Rasters usam `fetch` de blob (por causa do `NeverTileDiscardPolicy`), GeoJSON usa `Resource.fetchJson`, 3D Tiles faz XHR: **todas as origens de dados precisam de CORS** liberado para o domínio do site.
- Fallback em `tile.openstreetmap.org`: sujeito à política de uso da OSM (não é para produção com tráfego).
- Paths absolutos (`/cesium/`, `/legends/`, `/logo-cardeal.png`): o site precisa ficar na raiz do domínio.

### 5.5 Segredos

- Nenhum segredo commitado; `.env.local` não existe na pasta.
- Tokens `VITE_*` ficam públicos no bundle; acesso dinâmico `import.meta.env[tokenEnv]` embute todos. Restrição por URL no ion é obrigatória.

### 5.6 Versão do Cesium e internals

- 1.146.0 é recente (lançada em 2026); não está desatualizada.
- Dependências de internals: `ImageryLayer._createTileImagerySkeletons` (`loadLayer.ts:58-72`, **sem trava de versão**: num upgrade em que o método mude de nome, `createSkeletons.call` quebra todos os rasters); `prePassesUpdate`, `_processingQueue`, `_selectedTiles`, `content._model` (`modelClipping.ts`, com trava 1.146); `provider.requestImage` substituído por instância (`imageryTileErrors.ts:53`). Qualquer upgrade do Cesium exige revalidar esses três pontos.
- `^1.145.0` no `package.json` permite que um `npm install` (não `npm ci`) suba para 1.147+, que desativa silenciosamente o guard de clipping e pode quebrar o guard de raster.

### 5.7 Performance

- Todos os rasters e vetores da lista ativa são criados no início, mesmo invisíveis. Rasters invisíveis não baixam tiles, mas GeoJSON é baixado e convertido em Entities inteiro no startup.
- GeoJSON via Entities + polylines auxiliares de contorno: pesado para drenagem/curvas de nível grandes (milhares de feições), principalmente no celular.
- `VectorPopup` escuta `clock.onTick` (todo frame, mesmo com `requestRenderMode`) e faz `JSON.stringify` do popup a cada tick. Custo baixo, mas constante.
- Tilesets com opções default (sem limite de memória/SSE para mobile).
- Bundle de produção inclui o Cesium inteiro (~14 MB em `dist/` com workers/assets).

### 5.8 Clonagem

- `.claude/skills/*` são junctions com **caminho absoluto** para `cardeal-map-template/.agents/skills`. Numa cópia, as skills do clone podem continuar apontando para o template.
- Copiar a pasta inteira leva junto ~320 MB de artefatos (`node_modules`, `.npm-cache`, `.vite`, `dist`, `.verification`) e o histórico Git do template.

---

## 6. Checklist de clonagem (sugestão)

**Preparação**
1. Decidir a linha de base: commitar (ou descartar) as mudanças pendentes do template e fazer os 5 checks passarem.
2. Copiar a pasta **sem** `node_modules`, `.npm-cache`, `.vite`, `dist`, `.verification`, `.env.local` e (decidir) `.git`. Conferir se `.claude/skills` virou pasta real ou junction apontando para o template.
3. No clone: `package.json:name`, `npm.cmd ci`, `npm.cmd run typecheck`, `npm.cmd run check`.
4. Criar `.env.local` com `VITE_CESIUM_ION_TOKEN` (e `VITE_CESIUM_3D_TOKEN` se houver modelo ion), restritos no painel ion.
5. Em `template.ts:53`: `id`, `name`, `location`. Ativar `developmentTools.cameraCapture: true`.

**Etapa 1 — Rasters**
6. Exportar cada raster como TMS **EPSG:3857**, PNG 256, `{z}/{x}/{y}.png`; anotar bounds (W,S,E,N em graus) e níveis mín./máx. reais.
7. Subir para a hospedagem de dados e configurar CORS para `http://127.0.0.1:5173`, `:4173` e o domínio final.
8. Copiar o molde `template.ts:21-29` para cada raster: `id` único, `name`, `description`, `kind`, URL com `{reverseY}`, `credit`, bounds, níveis. Se houver legenda, PNG em `public/legends/` + `legend`.
9. Ordem no array `layers` = ordem de empilhamento (o último fica por cima). Ortomosaico antes dos derivados.
10. `npm run dev`; verificar alinhamento com o Bing, opacidade, legenda, ausência de aviso de 404.

**Etapa 2 — Modelo 3D**
11. Definir referência vertical do modelo (ortométrica ou elipsoidal) antes de publicar.
12. URL própria (`tileset.json` com CORS) ou asset ion. Adicionar entrada `kind: "3d-tiles"`.
13. Com `modelAlignment: true` em dev, achar o offset visual; somar em `heightOffsetMeters`. Com `cropAuthoring: true`, desenhar e copiar o recorte para `clipping`; decidir sobre `terrainCutout`.
14. Desligar `modelAlignment`/`cropAuthoring`.

**Etapa 3 — Vetores**
15. Reprojetar para lon/lat WGS84 (GeoJSON RFC 7946); decidir sobre Z (`ignoreAltitude`).
16. Para cada camada: `kind`, `autoZoom: false`, `style` (classes, `zIndex` acima dos polígonos para linhas), `popup.fields`, `opacityControl` se precisar.
17. Medir tamanho/tempo de carga no celular; arquivos grandes são candidatos a simplificação ou formato tiled (ver docs de vector tiles).

**Etapa 4 — Finalização**
18. Capturar a câmera final e colar em `initialCamera`; desligar `cameraCapture`.
19. `scenes`, `diagnostic.steps`, `temporalCampaign`/`temporalComparison` se aplicável.
20. Textos: `index.html` (título/descrição), `App.tsx` (header) se o branding mudar.
21. `npm run typecheck`, `npm run check`, `npm run build`, `npm run preview`; testar desktop e mobile (drawer, legendas, popup, GPS em HTTPS).
22. Publicar `dist/` na raiz do domínio; validar CORS e restrição do token com o domínio final.

### Vale centralizar a configuração num único arquivo?

Em grande parte já está: `template.ts` concentra dados, câmera e textos do painel. O que ainda fica fora:

- branding (título da aba, header, logo, `theme-color`) em `index.html` e `App.tsx`;
- terreno (World Terrain fixo no hook) e estilo do basemap (fixo no loader);
- nome do pacote.

Sugestão (não implementada): renomear `template.ts` para um arquivo por projeto (ex.: `src/projects/<slug>.ts`) e registrá-lo em `index.ts`; acrescentar ao `ProjectConfig` um bloco `branding` (título, subtítulo, logo) e um `terrain` opcional (`world` | `ellipsoid` | ion asset | URL); declarar uma constante `DATA_BASE_URL` no topo para não repetir o domínio em cada camada. O tipo `ProjectConfig` já força os campos obrigatórios via TypeScript. Isso mexe em `App.tsx`, `index.html` e `useCesiumViewer.ts` e, pelas regras do `AGENTS.md`, precisa de aprovação antes.

---

## 7. Dúvidas

1. As mudanças não commitadas (temporal, GPS, diagnóstico, cenas, drenagem, diferença de cota) fazem parte do template aprovado? Posso commitá-las e corrigir os 2 checks quebrados antes de clonar?
2. Como você clona: copiando a pasta pelo Explorer, `git clone`, ou outro? O novo projeto deve ter Git próprio (sem o histórico do template)?
3. Onde ficam hospedados os dados (rasters, GeoJSON, 3D Tiles)? É Cloudflare R2? Qual domínio, e quem configura o CORS?
4. Onde o site é publicado (Cloudflare Pages, Vercel, servidor próprio…) e em qual caminho? Na raiz do domínio ou em subpasta?
5. Qual software gera seus tiles raster, e eles saem sempre em EPSG:3857? Algum projeto vai precisar de WMS/WMTS, COG ou imagens hospedadas no ion?
6. Para MDT/MDS, basta o raster colorido, ou você quer o relevo real (terreno próprio no lugar do World Terrain)? Isso exigiria funcionalidade nova.
7. O modelo 3D vem de qual software, e vai ser servido por URL própria ou pelo ion? As altitudes exportadas são ortométricas (SIRGAS 2000/Imbituba) ou elipsoidais?
8. Os vetores chegam em qual formato/CRS (SHP, KML, GeoJSON UTM…)? Existem camadas de pontos que precisem de símbolo próprio? Há arquivos grandes (drenagem, curvas de nível com milhares de feições)?
9. Por "cenas de câmera" você quer botões que movem a câmera para vistas salvas? Hoje as cenas só trocam camadas; isso seria funcionalidade nova.
10. O branding é sempre Cardeal (logo e header iguais em todos os projetos) ou muda por cliente? O título da aba deve trazer o nome do projeto?
11. Quer limitar a navegação (zoom mínimo/máximo, impedir sair da área do projeto)?
12. Um token ion por projeto ou um token compartilhado com restrição de URLs?
13. Posso limpar o código morto e os resíduos de nomes de projetos anteriores nos docs, ou prefere não mexer no template agora?
14. Qual é o próximo projeto (nome, município) e quais dados já estão prontos para a etapa 1?
