# Cardeal Map Template

Template reutilizável React, TypeScript, Vite, vite-plugin-cesium e CesiumJS. Dados, URLs, estilos e câmera pertencem à configuração; componentes e loaders não dependem de uma propriedade.

## Começar

Use Node.js 22.14+. Execute `npm.cmd ci`, copie `.env.example` para `.env.local` e configure seus próprios tokens com restrições de assets e origens. Valores VITE_* são públicos no navegador. `.env` e `.env.local` permanecem ignorados pelo Git.

Dev usa http://127.0.0.1:5173; preview usa http://127.0.0.1:4173. Em ambientes Windows restritos, use `-- --configLoader runner` se o carregamento da configuração Vite falhar.

Comandos: `npm.cmd run dev`, `npm.cmd run typecheck`, `npm.cmd run check`, `npm.cmd run build`, `npm.cmd run preview`.

Novo projeto: siga o roteiro `docs/NOVO-PROJETO.md` (passo a passo na ordem que funcionou no Cyro, com as lições e um exemplo comentado); detalhes de geoide, ogr2ogr e publicação em `docs/CHECKLIST_NOVO_PROJETO.md`. `npm.cmd run new-project -- -Slug <slug> -Destination <pasta>` cria a cópia com Git próprio, branch `main` e primeiro commit; `npm.cmd run raster-from-xml -- <tilemapresource.xml> --tiles <pasta> --url <base>` gera a entrada de cada raster e testa o CORS (`docs/R2_CORS.md`); `npm.cmd run prepare-geojson -- <entrada> <saida> --tipo curvas|drenagem|microbacias|generico` prepara os GeoJSON do Global Mapper para o R2 (sem Z, 7 casas, `id` e `nome`, textos como "17.977 ha" em número, `cota_m`/`mestra`, `STRAHLER` mantido ou calculado e `comprimento_m`, microbacias com `area_ha`, `perimetro_km` e `cor` 0–9 sem vizinhas iguais). Cesium está fixo em 1.146.0: os guards de raster e de clipping dependem de internos dessa versão.

No template, `src/projects/template.ts` guarda só exemplos genéricos (usados pelos checks). Num projeto criado pelo script, edite `src/projects/<slug>.ts`: identificação, localização, `bounds`, initialCamera e camadas. `bounds` ([W, S, E, N] em graus) é a área do projeto e define o limite de navegação; sem `bounds` não há limite (é o caso do template, com vista global neutra). A configuração ativa contém somente Bing Aerial com rótulos, com vista global neutra. World Terrain e Bing usam VITE_CESIUM_ION_TOKEN; fallbacks são elipsoide WGS84 e OpenStreetMap. Exemplos usam example.invalid e ficam fora de layers: rasters/vetores são carregados mesmo invisíveis. Nunca ative placeholders antes de substituir URLs, níveis de tiles, rótulos e créditos. O assetId 0 é um marcador inválido a substituir, não um asset real.

## Recursos

Além de rasters, vetores, modelo 3D, legendas, popups e medições (detalhados abaixo), o template traz recursos opcionais, todos desligados enquanto não configurados. Configuração completa em `docs/TEMPLATE_FEATURES.md`.

- **Série temporal**: `temporalCampaign` em overlays XYZ/TMS cria um interruptor único no Mapa base, a régua do tempo sobre o mapa (um período por vez) e o selo de período no canto superior esquerdo. `eventAfter` marca um evento entre duas campanhas. `temporalComparison: { left, right }` mostra "Comparar" na régua: divisor arrastável, marcos escolhem "Antes" e "Depois". Textos em `temporalLabels` (padrão "Evolução da paisagem" e "Ortomosaico"). Sem campanhas, nada disso aparece.
- **Minha localização (GPS)**: botão na navegação; marcador e círculo de precisão sobre o terreno, sem gravar a posição. Fora do limite de navegação, o marcador aparece, a câmera não sai do limite e surge o aviso "Sua posição está fora da área do projeto". Exige HTTPS ou localhost.
- **Modo Diagnóstico**: `diagnostic.steps` com título, texto, fatos e referências; cada etapa pode aplicar um conjunto de camadas. Sem etapas, o seletor Explorar/Diagnóstico não aparece.
- **Cenas rápidas**: `scenes` com botões que aplicam um conjunto exato de camadas visíveis e, se tiverem `camera` (mesmo formato de `initialCamera`), voam até essa vista.
- **Limite de navegação**: com `bounds`, a câmera fica dentro da área mais uma margem e abaixo de uma altura máxima sobre o terreno (ver abaixo).
- **Título da aba**: "<nome do projeto> | Cardeal Map".
- **Drenagem simulada (Strahler)**: `kind: "drainage"` + `source.symbology: "simulated-drainage-strahler"` em GeoJSON com atributo `STRAHLER`.
- **Diferença de cota**: ferramenta de medição A→B com ΔZ, distâncias horizontal e 3D, inclinação e declividade. Cotas elipsoidais do World Terrain ou do modelo 3D, não do MDT do projeto.
- **Painel**: `group`, `subsection`, `panel` (busca opcional, ordem, seções abertas e `sectionTitles`; padrão sem busca, Modelo 3D logo após o Mapa base e aberto), contadores por grupo e `exclusiveGroup`. Recolhível no desktop pelo botão "Camadas" do header.
- **Legendas**: cartão no canto inferior direito com "Legenda · N". `legendMode: "embedded"` (escala desenhada no raster) e `"none"` não mostram cartão nem aviso. Raster temático sem `legend` nem `legendMode` mostra "Legenda não fornecida" só em desenvolvimento.
- **Popups**: atributos legíveis primeiro; campos com nome técnico da fonte (ex.: `STREAM_ID`) ficam em "Atributos da fonte".
- **Sobre os dados**: diálogo no header com campanhas, modelo 3D, camadas por seção, notas de medição e créditos, tudo lido da configuração.

## Rasters e convenção TMS

Exporte TMS em **EPSG:3857**, **PNG 256×256**, arquivos **{z}/{x}/{y}.png**. No Cesium, o endereço TMS é **{z}/{x}/{reverseY}.png**. XYZ usa {z}/{x}/{y}.png. Bounds são [west, south, east, north] em graus; níveis de tiles são independentes da câmera.

```ts
{
  id: "raster", name: "Raster", description: "Seu levantamento", kind: "raster", defaultVisible: false,
  source: { format: "tms", url: "https://example.invalid/raster/{z}/{x}/{reverseY}.png",
    credit: "Seu projeto", bounds: [-1, -1, 1, 1], minimumLevel: 0, maximumLevel: 8,
    tileWidth: 256, tileHeight: 256 },
  legend: { type: "image", title: "Raster", imageUrl: "/legends/example.png", imageAlt: "Escala ilustrativa" },
}
```

404/410 confirmados em tiles individuais são recuperáveis automaticamente: não geram alerta fatal, não desativam a camada nem recriam provider. Logs próprios de borda aparecem no máximo uma vez em desenvolvimento. O browser pode registrar 404 no DevTools. Erros opacos/CORS, rede, autenticação e provider continuam detectáveis. Após 32 tiles ausentes distintos e 15 segundos sem nenhum tile válido, há aviso de possível fonte/endereço incorreto. Uma imagem válida cancela esse diagnóstico; cleanup restaura requestImage e cancela timers.

## GeoJSON e popups

Exporte ou reprojete antes do upload para **longitude, latitude** em WGS84/CRS84, num fluxo compatível com EPSG:4326. Exemplo geográfico sintético: [0.01, -0.02]. Coordenadas UTM como [466000, 7639000] não são lon/lat. O template não reprojeta UTM automaticamente. URLs devem permitir CORS.

```ts
source: {
  format: "geojson", url: "https://example.invalid/areas.geojson", autoZoom: false,
  popup: { title: "Área", titleProperty: "label", titlePrefix: "Unidade ", fields: [
    { property: "size", label: "Área", decimals: 2, suffix: " ha" },
    { property: "value_count", label: "Quantidade", format: "integer" },
    { property: "class_code", label: "Classe", prefix: "Código " },
  ] },
}
```

Entity.properties/PropertyBag.getValue(viewer.clock.currentTime) resolve as propriedades dinamicamente. O popup customizado Cardeal mantém posicionamento e não usa InfoBox. Campos null, undefined, ausentes e números não finitos são omitidos; zero permanece. Números usam pt-BR, format integer ou decimals; numberFormat { locale, decimalPlaces } permite personalizar. Prefix/suffix não são adicionados automaticamente: dados que já trazem unidades devem ficar sem suffix. Títulos aceitam titleProperty, titlePrefix/titleSuffix e title de fallback. O relógio atualiza valores temporais; seleção por prioridade considera zIndex sem substituir ferramentas de medição.

ignoreAltitude: true remove altitude de uma cópia em memória antes do GeoJsonDataSource.load, sem alterar atributos/arquivos. uniqueFeatureIds: true gera IDs por camada/posição da feição para evitar perda de trechos que compartilham identificadores (o Cesium descarta entidades com id repetido). Use só quando o `id` de origem se repetir. Antes de substituir, o `id` original é copiado para o atributo `source_id` (um `source_id` já existente nos dados não é sobrescrito); para exibi-lo, inclua `{ property: "source_id", label: "ID de origem" }` em `popup.fields`. Nenhuma geometria é simplificada.

## Polígonos por atributos e bordas espessas

```ts
style: {
  stroke: "#32404A", strokeWidth: 3, fill: "#B6C3CF", fillOpacity: 0.35,
  clampToGround: true, zIndex: 1,
  classification: { property: "class_code", classes: {
    A: { fill: "#285F9E" }, B: { fill: "#C68524", fillOpacity: 0.5 },
  } },
  outline: { property: "color_index", colors: ["#285F9E", "#C68524", "#6B4E99"],
    width: 3, fallbackColor: "#32404A" },
}
```

classification usa chaves String do atributo, sem ordem de feições ou sorteio. fill/stroke/strokeWidth são fallback; fillOpacity multiplica o alpha da cor (0–1). Classes podem alterar fill, fillOpacity, stroke, strokeWidth e zIndex. Outline usa índice inteiro da paleta, com fallback explícito. Para ocultar contornos, use polygonOutline: false. opacityControl: true na camada habilita o slider existente, multiplicando o alpha inicial sem acumular mudanças.

O polígono original mantém fill e picking. Anéis exteriores e buracos recebem helpers PolylineGraphics fechados, com largura em pixels e clampToGround configurável, sem preencher outra vez. Helpers compartilham atributos/popup e pertencem ao mesmo DataSource; ao desativar são removidos da coleção, ao reativar são reinseridos sem duplicações, e descarte da camada remove seus recursos.

## Linhas por classes

```ts
style: {
  stroke: "#32404A", strokeWidth: 1, clampToGround: true, zIndex: 10,
  classification: { property: "level_code", classes: {
    minor: { stroke: "#34B3C8", strokeWidth: 1, zIndex: 10 },
    major: { stroke: "#2457B2", strokeWidth: 3.5, zIndex: 11 },
  } },
}
```

O mesmo mecanismo aceita propriedades numéricas/categóricas. Polylines usam as cores, larguras e prioridades configuradas; ground zIndex prevalece quando suportado. Para sobrepor linhas a polígonos, configure prioridades superiores e valide visualmente nos dados finais.

## Modelos URL/ion e clipping

```ts
// Duas alternativas independentes. Os modelos carregam ao ativar, sem mover a câmera.
source: { format: "3d-tiles", source: "url", url: "https://example.invalid/tileset.json", heightOffsetMeters: 0 }
source: { format: "3d-tiles", source: "ion", assetId: 0, tokenEnv: "VITE_CESIUM_3D_TOKEN" }
// assetId 0 deve ser substituído pelo asset da nova propriedade.
```

URL preserva transformação/georreferenciamento nativo e resolução de conteúdo relativo. Ion usa IonResource.fromAssetId com token dedicado opcional no ambiente VITE_CESIUM_3D_TOKEN, seguido de Cesium3DTileset.fromUrl. tokenEnv pode ser omitido para usar esse nome padrão; não herda automaticamente o token do viewer. Sem token configurado, o carregamento ion sinaliza erro sem expor credenciais. heightOffsetMeters é opcional e desloca o modelo relativamente à transformação original.

```ts
// Dentro de source do modelo: apenas exemplo sintético próximo de 0°.
clipping: {
  enabled: true, inverse: true,
  positions: [[-0.01, -0.01], [0.01, -0.01], [0.01, 0.01], [-0.01, 0.01]],
}
```

Recorte opcional validado, via ClippingPolygon/ClippingPolygonCollection exclusiva do tileset. Sem config ou enabled: false não se aplica. inverse: true mantém o interior. Exige WebGL 2; coordenadas em graus, ao menos três vértices, sem repetir o primeiro no fim. Coleções são descartadas com o dono. A proteção pontual de volumes inválidos usa internos somente no Cesium 1.146 e deve ser revista em upgrades.

terrainCutout: true é uma opção separada: aplica no globe uma coleção independente de recorte complementar enquanto o modelo carregado está visível. Não compartilha a coleção do tileset; desligar restaura terreno/imagens e cleanup libera o recorte. Por padrão clipping afeta somente o modelo e terrainCutout fica ausente. Havendo outro recorte do globe, ele é preservado; apenas um cutout pode possuir o globe por vez.

## Limite de navegação

```ts
bounds: [W, S, E, N],
navigation: { marginRatio: 0.25, maximumZoomDistance: 5000 }, // opcional
```

Com `bounds`, a posição da câmera fica dentro da área ampliada por uma margem em cada lado (`marginRatio`, padrão 0,25 = 25% da maior dimensão da área) e abaixo de `maximumZoomDistance` metros sobre o terreno (padrão: o dobro do maior lado da área com margem, no mínimo 2000 m). `navigation: { enabled: false }` desliga o limite mantendo `bounds`. A restrição é aproximada: vale para a posição da câmera, então uma vista inclinada ainda enxerga além da borda. Voos do app (Home, cenas, GPS) não são interrompidos; se o destino estiver fora, a câmera volta ao limite ao chegar, e em `npm run dev` o console avisa quais vistas configuradas estão fora. Usa apenas APIs públicas (`ScreenSpaceCameraController.maximumZoomDistance`, `Scene.postRender`, `Camera.setView`).

## Produção e ferramentas de desenvolvimento

```ts
developmentTools: { modelAlignment: false, cropAuthoring: false, cameraCapture: false }
```

Produção mostra apenas o controle principal na seção Modelo 3D. Ferramentas avançadas dependem de import.meta.env.DEV **e** opt-in: modelAlignment habilita altura relativa com restauração; cropAuthoring habilita autoria, undo, preview, validação e exportação do polígono; cameraCapture habilita captura. Elas não aparecem no build de produção, mesmo com flags true. Editores limpam handlers/helpers e restauram transformação/recorte ao desmontar; o editor de crop modifica apenas o modelo, não redesenha o cutout do globe.

Captura de câmera: com `cameraCapture: true` e `npm run dev`, o painel "Captura de câmera (dev)" tem **Capturar Home** (`initialCamera`), **Capturar cena** (`camera` da cena escolhida no seletor) e **Capturar bounds da vista** (`bounds` W,S,E,N do terreno visível). Cada botão copia para a área de transferência o trecho pronto para colar em `src/projects/<slug>.ts` e o mostra no painel. A chave **Ignorar limite de navegação** desliga o limite enquanto o painel está aberto, para enquadrar vistas na borda e testar a margem. Fluxo: subir os rasters, ligar `cameraCapture`, capturar bounds, Home e cenas, colar no arquivo do projeto e desligar a flag. O evento de console `window.dispatchEvent(new Event("cardeal:capture-camera"))` continua imprimindo o JSON de `initialCamera`. Longitude/latitude, heading/pitch/roll são graus; height é metros acima do elipsoide. Home e abertura compartilham a configuração; ativar o modelo não reposiciona câmera.

## Interface e validação

Interface v3 (redesign vindo do Jurema): tema em `src/theme.css` (cores, raios, sombras) com Figtree e Caprasimo locais em `public/fonts` (licença OFL, sem serviço externo de fontes); header de 52 px com marca, "Projeto · Município", "Camadas" e "Sobre os dados"; painel recolhível à esquerda; coluna fixa de ferramentas à direita (bússola, zoom, Home, GPS e medição, com a nota "Sobre as altitudes"); régua do tempo, selo e "Comparar" só com campanhas; cartão de legenda; dica de navegação na primeira vez que o modelo 3D é ligado; atribuição nativa do Cesium compacta. No celular, barra inferior (Camadas, Tempo, Medir, Legenda) com painel inferior de duas alturas no lugar da gaveta lateral: "Tempo" só com campanhas, "Legenda" só com legenda visível, e a aba inicial é "Tempo" com campanhas ou "Camadas" sem elas. Preservados os grupos do painel, sliders independentes, medições, navegação/Home/limite, legendas com expansão por toque e a atribuição nativa. Componentes leem só os tokens do tema: para outra identidade visual, mude `src/theme.css`, não o layout.

Checks locais usam dados sintéticos, sem assets reais/tokens/rede. Execute typecheck, check e build. Para cada propriedade final, valide URLs/CORS, georreferenciamento, prioridades de linhas, seleção, opacidade e desktop/mobile com seus dados.

src/projects mantém configuração; src/cesium contém infraestrutura; src/hooks cuida do lifecycle; src/components contém UI genérica; public/legends recebe PNGs; scripts contém checks e ferramentas; docs contém checklist, CORS, recursos e pesquisas (relatórios antigos em docs/historico). Mudanças por versão: CHANGELOG.md. Regras para agentes: AGENTS.md (CLAUDE.md o importa). Não versionar .env/.env.local, node_modules, dist, caches ou .verification.
