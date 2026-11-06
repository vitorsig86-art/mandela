# Changelog

Mudanças do Cardeal Map template, da mais recente para a mais antiga. Projetos derivados registram suas próprias mudanças a partir do commit de origem anotado no AGENTS.md do clone.

## [Não lançado] — Popups Macro de Andrelândia/EFAC

### Adicionado
- `src/projects/macroPopups.ts`: curadoria dos popups do Contexto Macro de Andrelândia (reaproveitada e validada na EFAC) como presets genéricos: contexto municipal IBGE, clima, geologia, geomorfologia, pedologia, vegetação, hidrografia ANA, microbacias ANA, microbacias simuladas e drenagem simulada. Campos, rótulos, unidades, casas decimais e seções iguais aos da EFAC; `valueLabels` de UF estendido a todas as UFs; na tipologia, só a tradução confirmada na referência (outros valores aparecem como vieram da fonte).
- `source.macroPopup` (GeoJSON): associa a camada a um preset. `resolveMacroPopup` aplica o preset antes do carregador existente; camada `group: "macro"` sem preset não mostra atributos, e no `npm run dev` mostra "Popup Macro não configurado".
- `src/cesium/curatedPopup.ts` (`popup.presentation: "curated"`): formatação de Andrelândia (só campos curados, ausentes e vazios omitidos, conversão de unidade, `ratioTo`, `valueLabels`, seções). Campos `section`, `unit`, `ratioTo` e `valueLabels` e `notice` em `VectorPopupConfig`.
- `VectorPopup`: título de seção e aviso de configuração.

## [3.1.0] — 2026-10-31 — Consolidação do Ivan

Ajustes genéricos do Ivan (Cruzília-MG) trazidos para o template, para o próximo WebGIS já nascer com eles. Nada do Ivan veio: URLs, camadas, câmera e textos ficaram no clone.

### Adicionado
- `VectorPopupAction.onClose`: `"keep"` (padrão) devolve a câmera à posição de quando a página embutida abriu, sem animação e só se algo a moveu; `"home"` vai direto para a `initialCamera`. `src/cesium/projectCamera.ts`: `captureCamera`, `restoreCamera` e `flyToCameraSettled` (APIs públicas do Cesium 1.146: `positionWC`, `setView`, `cancelFlight`).
- `VectorPopupAction.flyTo: "home"`: voo até a vista Home antes de abrir a página.
- `ProjectLayerConfig.defaultVisibleMobile` (padrão `defaultVisible`): visibilidade na abertura do layout mobile (`max-width: 760px`). `src/projects/layerVisibility.ts`: `defaultLayerIds`; `src/components/mobileTabs.ts`: `MOBILE_MEDIA_QUERY` e `isMobileLayout()` (o `Legend` usa a mesma constante).
- `VectorPopupConfig.openOnHome` (padrão `false`; `true` ou `"desktop"`): sem ele, nenhum popup abre sozinho. Com ele, o popup abre na abertura e ao fim do voo do Home, sobre a primeira feição visível, depois de o terreno da vista carregar (até 5 s); um clique antes cancela. `findHomePopupEntity`, `homePopupPoint` e `opensOnHome` em `src/cesium/vectorPopup.ts`; `NavigationControls` ganhou `onHome`; `initialMobileState(hasCampaigns, homePopup)` abre o celular com o mapa livre quando há popup na abertura e não há campanhas. O popup desvia também da régua, do selo de período, da dica do modelo 3D e da barra inferior.
- `ProjectLayerConfig.panelOrder`: ordem da camada dentro da seção do painel; o empilhamento no mapa continua pela ordem do array `layers`.
- `prepare-geojson --tipo microbacias`: lê `STREAM_ID`, `ENCLOSED_AREA` e `PERIMETER` do Global Mapper e grava `nome` "Microbacia N", `area_ha` e `perimetro_km` como número e `cor` de 0 a 9. Vizinhas (vértice comum) nunca têm a mesma cor; as 10 cores ficam com quantidades parecidas e espalhadas (DSatur). Área e perímetro sem unidade ou ausentes são calculados pela geometria, e diferenças acima de 5% entre atributo e geometria são avisadas.
- Modelos de estilo do Ivan em `thematicExamples` (inativos, URLs de exemplo): microbacias por `cor` com a paleta `microbasinColors`, curvas 2 m e 3 m, drenagem com 5 classes de Strahler, estradas, matrículas e área de estudo com o botão da simulação.
- `docs/NOVO-PROJETO.md`: seção "Padrões visuais e de painel" (estilos, `zIndex` de referência, ordem no painel, abertura, câmera na simulação, `prepare-geojson` antes do R2).
- Checks: `onClose`, `flyTo`, `openOnHome`/`findHomePopupEntity` e `restoreCamera` em `check-embedded-pages.cjs`; `initialMobileState(false, true)` e `defaultLayerIds` em `check-ui.cjs`; `panelOrder` e o padrão de painel/abertura dos exemplos em `check-workspace.cjs`; estilos dos exemplos em `check-template-v2.cjs`; microbacias, unidades e STRAHLER mantido em `check-prepare-geojson.cjs`.

### Alterado
- `VectorPopupAction.flyTo` passou a ter padrão `false`: abrir a página embutida não move a câmera. Projetos que queiram o voo até a feição: `flyTo: true`.
- `prepare-geojson`, em todos os tipos: converte em número os textos com unidade do Global Mapper (`"1080 m"`, `"17.977 ha"`, `"2.339 km"`), quando todos os valores do atributo têm unidade conhecida; troca `KML_STYLE` por `id` e `nome` (de `nome`/`NAME`/`name` ou um padrão por tipo). `curvas` aceita `ELEVATION` com unidade.
- `prepare-geojson --tipo drenagem`: com `STRAHLER` completo na entrada, mantém o atributo e só limpa o arquivo (sem exigir Z nem recalcular); calcula pela topologia só quando ele falta e aborta quando está em parte dos trechos. `comprimento_m` vem do atributo, se existir.

### Corrigido
- Página embutida (simulação) não deixa mais a câmera longe. Causa: o padrão `flyTo: true` rodava `viewer.flyTo` até a feição com `range 0`, e o Cesium escolhia a distância pela esfera envolvente da área, bem mais longe que a vista do usuário. Agora a câmera fica parada ao abrir (`flyTo: false`) e volta ao lugar ao fechar (`onClose: "keep"`).
- `scripts/check-projects.cjs`: `URL` disponível no contexto dos checks (configurações que usam `new URL`).

### Migração de projetos derivados
- Opcional: traga `src/App.tsx`, `src/cesium/projectCamera.ts`, `src/cesium/vectorPopup.ts`, `src/components/{LayerPanel,Legend,NavigationControls,VectorPopup}.tsx`, `src/components/mobileTabs.ts`, `src/projects/{layerVisibility,types}.ts` e `scripts/prepare-geojson.cjs`, e rode os checks.
- Ações de popup sem `flyTo` passam a abrir sem voo. Para manter o comportamento anterior, ponha `flyTo: true`.
- Drenagem com `STRAHLER` parcial agora aborta no `prepare-geojson`: complete o atributo ou remova-o para calcular pela topologia.

## [3.0.0] — 2026-10-30 — Redesign visual do Jurema

A interface do Jurema vira o padrão do template: todo WebGIS novo já nasce com ela. Só o que é genérico veio; textos, camadas, campanhas, URLs e assets do Jurema ficaram no Jurema. Versão maior porque o padrão mobile mudou (barra inferior no lugar da gaveta) e porque `TemporalComparison` e o `LayerPanel` mudaram de props.

### Adicionado
- Tema em `src/theme.css` (cores creme/terracota/sálvia, raios, sombras) e fontes locais Figtree (variável 400–700) e Caprasimo em `public/fonts`, com as licenças OFL. Nenhum serviço externo de fontes.
- `src/components/icons.tsx`: conjunto único de ícones (Lucide), com marcador genérico de evento.
- Header de 52 px: marca, "Projeto · Município", "Camadas" (recolhe o painel no desktop), "Sobre os dados" e, com etapas de diagnóstico, o seletor Explorar/Diagnóstico.
- Diálogo "Sobre os dados": campanhas e eventos, modelo 3D, camadas por seção, notas de medição e créditos, lidos da configuração.
- Régua do tempo sobre o mapa, selo de período e "Comparar" na própria régua (os marcos escolhem "Antes" e "Depois"). Só aparecem quando há campanhas temporais.
- `temporalCampaign.eventAfter`: marcador de evento entre duas campanhas.
- `ProjectConfig.temporalLabels` (`timelineTitle`, padrão "Evolução da paisagem"; `layerName`, padrão "Ortomosaico").
- `panel.sectionTitles`: nomes das seções, com padrão genérico.
- `legendMode: "none"` e aviso "Legenda não fornecida" para raster temático sem `legend` nem `legendMode`, só em desenvolvimento; o build de produção não inclui o texto.
- Cartão de legenda com botão "Legenda · N".
- Popup com atributos legíveis primeiro e campos técnicos da fonte (ex.: `STREAM_ID`) em "Atributos da fonte".
- Dica de navegação sobre o mapa na primeira vez que o modelo 3D é ligado.
- Celular: barra inferior (Camadas, Tempo, Medir, Legenda) e painel inferior com alça (médio/alto). "Tempo" só com campanhas, "Legenda" só com legenda; aba inicial "Tempo" com campanhas e "Camadas" sem elas. Regras em `src/components/mobileTabs.ts`.
- Checks `scripts/check-temporal.cjs` e `scripts/check-ui.cjs` no `npm run check`.
- Ações em popups de vetor (`VectorPopupConfig.actions`): botão que abre uma página externa indicada por uma propriedade da feição (`urlProperty`) ou fixa na configuração (`url`), sobre o mapa (com voo até a feição) ou em nova aba. Uso previsto: simulação 3D de talhão gerada pelo pipeline de café keyline.
- `ProjectConfig.embeddedPages.allowedOrigins`: lista de origens https permitidas; sem ela nenhum botão aparece.
- Componente `EmbeddedPageOverlay` (carregado sob demanda): página em tela cheia com "Voltar ao mapa", Esc e "Abrir em nova aba".
- Exemplo inativo `plotSimulationExample` e contrato `scripts/check-embedded-pages.cjs` no `npm run check`.

### Alterado
- Padrão mobile: a gaveta lateral com backdrop e o botão "☰ Camadas" saíram; entram a barra inferior e o painel inferior.
- Coluna fixa de ferramentas à direita (bússola, zoom, Home, GPS, medição) em vez de controles reposicionados conforme as legendas. A lógica de navegação do template foi mantida (Home, limite, GPS fora da área, desligar GPS); no celular o zoom por botão some (pinça).
- Painel de camadas: interruptores no checkbox nativo, título "Camadas", busca com ícone (ainda desligada por padrão). Campanhas temporais viram um único interruptor na seção Mapa base, com o período ativo; o período é escolhido na régua. `TemporalSelector` saiu do painel.
- `TemporalComparison` não tem mais seletores próprios (`onChange`/`onExit` removidos); recebe `modelVisible` e avisa que o modelo 3D cobre as duas metades.
- `legendMode: "embedded"` não mostra mais a nota "Legenda incorporada ao mapa".
- Medição: nota "Sobre as altitudes" recolhível, com o texto do template.
- Atribuição do Cesium: conteúdo e diálogo nativos, mais discreta e compacta; no celular, acima da régua na aba "Tempo".
- Modo diagnóstico, cenas, página sobre o mapa e painéis de desenvolvimento no novo tema; o cartão de diagnóstico ocupa o canto do selo de período.
- `scripts/check-workspace.cjs` avalia `import.meta.env.DEV` como build de produção e cobre `sectionTitles`, o interruptor temporal e os modos de legenda.
- `.gitignore` inclui `.codex/`.
- O botão de fechar do popup ganhou a classe `vector-popup-close`; o CSS passou a mirar essa classe em vez de todo `button` do popup.

### Migração de projetos derivados
- Atualizar um projeto existente é opcional e manual: traga `src/theme.css`, `public/fonts`, `src/styles.css`, `src/App.tsx`, `src/components/` e os tipos novos de `src/projects/types.ts`, e rode os checks.
- Quem usava `TemporalComparison` com `onChange`/`onExit` ou o `TemporalSelector` dentro do painel deve seguir o novo `App.tsx`.
- Rasters temáticos sem legenda: defina `legend`, `legendMode: "embedded"` ou `legendMode: "none"` para não ver o aviso em desenvolvimento.

## Consolidação do Cyro — 2026-10-28

Lições do primeiro projeto derivado (Cyro) trazidas para o template.

### Adicionado
- `docs/NOVO-PROJETO.md`: roteiro passo a passo de um WebGIS (clonar → `.env.local` → rasters do XML do Global Mapper → teste de tile → Home com `cameraCapture` → modelo do ion → `modelAlignment` → `cropAuthoring` → desligar `developmentTools` → vetores com `prepare-geojson` → repositório privado e push), com as lições do Cyro e um exemplo comentado de `src/projects/<slug>.ts`. Referenciado no AGENTS.md (Projetos derivados), no README e no checklist.
- `scripts/prepare-geojson.cjs` (`npm run prepare-geojson`): GeoJSON do Global Mapper pronto para o R2 (sem Z, 7 casas, `KML_STYLE` → `id` sequencial); curvas com `cota_m` e `mestra` (a cada 15 m, configurável); drenagem com `STRAHLER` pela topologia e `comprimento_m`, abortando em trecho com mais de uma saída ou rede sem sentido definido. Teste sintético em `scripts/check-prepare-geojson.cjs`, incluído no `npm run check`.
- Opções de painel `ProjectConfig.panel` (portadas do Cyro): `showLayerSearch`, `sectionOrder`, `expandedSections`.
- `kind: "aspect"` (orientação de vertentes); o Cyro precisou usar `solar-orientation`.
- `credit` opcional em camadas GeoJSON (`GeoJsonDataSource` `credit`); aparece enquanto a camada estiver carregada, mesmo desligada.

### Alterado
- Padrão do painel: sem busca de camadas, ordem Mapa base, Modelo 3D, Rasters, Vetores (e Análise Macro), com Modelo 3D aberto. Projetos que queiram o comportamento anterior: `panel: { showLayerSearch: true, sectionOrder: ["basemap", "raster", "vector", "model"], expandedSections: [] }`.
- `scripts/new-project.ps1`: robocopy exclui por nome `node_modules`, `.git`, `dist`, `.vercel`, `.npm-cache`, `.vite`, `.verification`, `.env` e `.env.local` (exit code < 8 = sucesso); cria a branch `main` com o primeiro commit e lembra, no final, de preencher o `.env.local` e criar o repositório privado no GitHub.

### Corrigido
- `scripts/raster-from-xml.cjs`: o tile de teste é o do centro do BoundingBox, não o da borda. Com o BoundingBox de tiles inteiros do Global Mapper, a faixa de tiles ganhava uma linha/coluna vizinha (2×2 contado como 9). A saída avisa que esses bounds não são os do projeto.

## [Não lançado] — 2026-10-28

### Adicionado
- Limite de navegação a partir de `bounds` (margem `navigation.marginRatio`, padrão 25%; altura máxima `navigation.maximumZoomDistance`, padrão derivado dos bounds); `bounds` passa a ser opcional e sem ele não há limite.
- GPS fora da área: marcador visível, câmera mantida no limite e aviso curto.
- Cenas com `camera` opcional (voam até a vista salva).
- Painel de captura de câmera em DEV: Home, cena e bounds da vista, com chave para ignorar o limite.
- Título da aba "<nome do projeto> | Cardeal Map".
- Painel de camadas: `group`, `subsection`, busca sem acentos, seções recolhíveis com contadores ativo/total, mensagens de status, `legendMode: "embedded"` e `exclusiveGroup`.
- Cenas rápidas (`scenes`): botões que aplicam um conjunto exato de camadas.
- Série temporal (`temporalCampaign`) e comparação lado a lado (`temporalComparison`).
- Modo Diagnóstico (`diagnostic.steps`).
- Botão "Minha localização" (GPS).
- Ferramenta "Diferença de cota" (ΔZ, distâncias, inclinação e declividade, com procedência da superfície).
- Simbologia de drenagem simulada por Strahler (`symbology: "simulated-drainage-strahler"`).
- `uniqueFeatureIds` preserva o id original no atributo `source_id`, exibível no popup.
- `scripts/new-project.ps1`: cria um projeto derivado (cópia sem artefatos/segredos, skills como pasta real, `src/projects/<slug>.ts`, aviso no AGENTS.md, `git init`).
- `scripts/raster-from-xml.cjs`: gera a entrada de raster a partir do `tilemapresource.xml` e testa tile/CORS remotos.
- Documentação: `docs/CHECKLIST_NOVO_PROJETO.md`, `docs/R2_CORS.md` + `docs/r2-cors.json`, `docs/TEMPLATE_FEATURES.md`, pesquisa de Vector Tiles e plano da POC de drenagem.
- `CLAUDE.md` (importa o AGENTS.md); AGENTS.md com protocolo de compatibilidade Cesium, "Projetos derivados" e a lista de exceções de internals.

### Alterado
- Cesium fixado em `1.146.0` (sem `^`).
- Avisos de medição: cotas vêm do World Terrain ou do modelo 3D, não do MDT do projeto.
- Checks: `check-workspace` e `check-measurements` atualizados, `.env.example` tolerante a CRLF, `check-projects` aceita projetos derivados, novo `check-raster-xml`.
- README com os recursos novos; relatórios antigos movidos para `docs/historico/`.

### Removido
- `allowMissingTiles` (sem efeito), abertura por `bounds` inalcançável, prop `formatValue` da legenda, CSS sem uso, `public/favicon.svg`, logo duplicado na raiz e nomes de projetos anteriores nos docs.

## [2.0.0] — 2026-10-04 (`9144d32`)

Promoção da arquitetura de produção para o template. Detalhes em `docs/historico/TEMPLATE_V2_REPORT.md`.

- Popup Cardeal com seleção por prioridade, formatação pt-BR e campos ausentes omitidos.
- Classificação de polígonos/linhas por atributo, paleta de contorno por índice e bordas como polylines.
- `prepareGeoJson`: `ignoreAltitude` e `uniqueFeatureIds`.
- Modelo 3D por URL ou ion com token dedicado, `heightOffsetMeters`, recorte por polígono e `terrainCutout`.
- Ferramentas de desenvolvimento (altura, recorte, captura de câmera) só em DEV.
- Lacunas 404/410 de tiles recuperáveis e diagnóstico de fonte sem cobertura.

## [1.0.0] — 2026-10-03 (`d84948b`)

Template genérico sincronizado do projeto de referência. Detalhes em `docs/historico/SYNC_REPORT.md`.

- Viewer Cesium com Bing Aerial e World Terrain via ion, com fallback OpenStreetMap e elipsoide.
- Câmera inicial/Home, bússola e zoom; medições de coordenadas, distância e área.
- Rasters TMS/XYZ com opacidade, GeoJSON, 3D Tiles, legendas em imagem/gradiente.
- Layout desktop e mobile (drawer, backdrop, cabeçalho compacto) e atribuição nativa do Cesium.
- Skills CesiumJS para agentes.
