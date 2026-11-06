# Recursos genéricos do template

A abertura permanece com `layers: [basemap]`, câmera global neutra e nenhuma
camada territorial. Exemplos com `example.invalid` continuam fora da lista ativa.
Não basta marcar um raster ou vetor como invisível: o loader existente inicializa
essas fontes mesmo assim. Configure e valide as fontes antes de incluí-las.

## Configuração em src/projects/

- `group`: `basemap`, `raster`, `vector`, `model` ou `macro`. Sem configuração,
  o painel infere o grupo pelo tipo da camada. Grupos vazios ficam ocultos.
- `subsection`: título livre de subseção, inclusive para Análise Macro. Mantenha
  camadas da mesma subseção contíguas na lista.
- `panel` (opcional, só apresentação; não liga camadas):
  - `showLayerSearch` (padrão `false`): mostra o campo "Buscar camada".
  - `sectionOrder` (padrão Mapa base, Modelo 3D, Rasters, Vetores, Análise
    Macro): seções não listadas seguem na ordem padrão; nenhuma some.
  - `expandedSections` (padrão `["model"]`): seções abertas ao carregar, além
    das que têm camada ativa; `[]` deixa abertas só as ativas.
  - `sectionTitles` (padrão Mapa base, Modelo 3D, Rasters, Vetores, Análise
    Macro): renomeia seções, ex. `{ raster: "Relevo derivado" }`; os ids não mudam.
- Busca (com `showLayerSearch: true`) ignora acentos e considera nome, descrição e subseção. Durante a busca,
  os resultados ficam expandidos; limpar a busca restaura os grupos recolhidos.
  Contadores mostram ativo/total do grupo completo, sem alterar visibilidade.
- `legendMode`: `"embedded"` quando a escala já está nos pixels da fonte e
  `"none"` quando a camada não precisa de legenda; nos dois casos não há cartão
  nem aviso. Sem `legendMode`, `legend` gera o cartão (imagem ou gradiente) no
  canto inferior direito, com o botão "Legenda · N". Raster temático (`dtm`,
  `dsm`, `slope`, `solar-orientation`, `aspect`, `ndvi`, `multispectral`) sem
  `legend` nem `legendMode` mostra "Legenda não fornecida" só em `npm run dev`;
  o build de produção não inclui o texto.
- `source.credit` em GeoJSON (opcional): atribuição nos créditos nativos do
  Cesium. Aparece enquanto a camada estiver carregada, mesmo desligada, porque
  vetores ocultos continuam anexados ao viewer.
- `source.popup` em GeoJSON preserva título, campos, rótulos, unidades e formatos
  numéricos configuráveis. Nenhum atributo de imóvel foi acrescentado.
- Popups Macro: camadas com `group: "macro"` usam a curadoria de Andrelândia (validada na EFAC) por `source.macroPopup`: `municipality` (IBGE), `climate`, `geology`, `geomorphology`, `soils`, `vegetation`, `ana-hydrography`, `ana-basin`, `simulated-basins` e `simulated-drainage`. Presets em `src/projects/macroPopups.ts`; formatação (unidades, casas, seções, `valueLabels`, `ratioTo`, campos ausentes omitidos) em `src/cesium/curatedPopup.ts`. Só os campos curados aparecem, nunca a lista bruta. Camada Macro sem preset não mostra atributos; no `npm run dev` o popup avisa "Popup Macro não configurado". Esquema novo: crie um preset (e o id em `MacroPopupPreset`), não um popup no projeto.
- `source.popup.openOnHome` (padrão `false`): por padrão nenhum popup abre
  sozinho, só ao clicar ou tocar na feição. Com `true`, o popup da camada abre na
  abertura e ao fim do voo do Home, sobre a primeira feição visível, depois de a
  feição e o terreno da vista carregarem (no máximo 5 s); um clique no mapa antes
  disso cancela, e com a camada desligada nada abre. `"desktop"` faz o mesmo só
  fora do layout mobile. Um por projeto: vale a primeira camada configurada.
  No celular, com `openOnHome` e sem campanhas, o mapa abre livre (painel fechado).
- `defaultVisibleMobile` (padrão: `defaultVisible`): visibilidade na abertura do
  layout mobile (`max-width: 760px`, a largura da barra inferior). Só a abertura
  muda; o painel continua ligando e desligando a camada.
- `panelOrder` (opcional): posição da camada dentro da seção do painel, crescente;
  sem ele vale a ordem do array, e empates mantêm a ordem do array. Muda só o
  painel. No mapa, entre GeoJSONs, o Cesium 1.146 desenha na ordem em que as
  camadas são adicionadas (a ordem do array `layers`): cada `DataSource` tem sua
  própria coleção de primitivas no chão, e o `zIndex` ordena só dentro da camada.
  O `zIndex` também decide qual vetor recebe o clique quando há sobreposição.
- Sliders continuam disponíveis para XYZ/TMS e vetores com `opacityControl`.
  Os estados do hook existente agora são apresentados no painel: carregamento,
  erro de inicialização e mapa base alternativo. Isso não representa progresso
  individual dos tiles nem acrescenta retentativa automática para vetores/rasters.
- `scenes`: lista opcional de `{ id, label, description?, layerIds, camera? }`. Cada
  cena define o conjunto exato de camadas visíveis; inclua o mapa base se desejado.
  IDs desconhecidos são ignorados. Com `camera` (formato de `initialCamera`,
  capturável no painel de captura), a cena também voa até a vista salva.
- `diagnostic.steps`: etapas opcionais com `title`, `text`, `layerIds?`, `facts?`
  e `references?`. Sem etapas, o seletor Explorar/Diagnóstico não aparece.
  Cada etapa pode aplicar um conjunto exato de camadas; omitir `layerIds`
  preserva a seleção atual. Voltar a Explorar mantém a última seleção.
- `exclusiveGroup`: permite exclusividade entre camadas. Vale para a abertura,
  seleção manual, cenas e etapas; a última camada solicitada do grupo prevalece.
- `temporalCampaign: { label, description, comparisonLabel?, eventAfter? }` em
  overlays XYZ/TMS habilita a série temporal: um interruptor único na seção
  Mapa base (ou no `group` da campanha), a régua do tempo sobre o mapa e o selo
  de período no canto superior esquerdo. Há uma única série por projeto, com um
  período visível de cada vez no modo simples, mesmo sem `exclusiveGroup`.
  `comparisonLabel: "2024 — Pré-obra"` vira ano e período na régua.
  `eventAfter` desenha um marcador de evento entre a campanha e a seguinte e
  entra em "Sobre os dados". Sem campanhas, régua, selo e "Comparar" não
  aparecem e, no celular, não há aba "Tempo".
- `temporalLabels: { timelineTitle?, layerName? }`: título da régua (padrão
  "Evolução da paisagem") e nome do interruptor (padrão "Ortomosaico").
- `temporalComparison: { left, right }` habilita o comparador somente quando os
  IDs apontam para períodos configurados e existem pelo menos duas campanhas.
  A comparação permite dois períodos simultâneos, inclusive o mesmo em ambos
  os lados. Sair restaura a seleção temporal simples; alterações em outras
  camadas e opacidades permanecem. Cenas e diagnóstico encerram a comparação.
  "Comparar" fica na régua; durante a comparação, os marcos escolhem "Antes" ou
  "Depois" e o mesmo botão sai.
  Rasters acima dos períodos podem cobrir a imagem; o controle avisa sobre eles.
  O divisor responde a toque, mouse, setas e teclas Home/End.

GPS é iniciado apenas pelo botão Minha localização. Recentrar, precisão estimada,
erros de permissão e desativação são tratados sem gravar a posição. Requer
geolocalização do navegador e contexto seguro (HTTPS ou localhost). Com limite de
navegação (`bounds`), uma posição fora da área mostra o marcador, não move a câmera
e exibe por 5 s "Sua posição está fora da área do projeto".

## Página sobre o mapa (simulação 3D de talhão)

Um popup de vetor pode ter botões que abrem uma página externa, como a simulação
3D de um talhão gerada pelo pipeline de café keyline. A URL vem de uma propriedade
da feição (`urlProperty`), então só os talhões que têm simulação mostram o botão,
ou é fixa na configuração (`url`), quando a camada tem um único estudo.

```ts
popup: {
  title: "Talhão", titleProperty: "nome",
  fields: [{ property: "area_ha", label: "Área", decimals: 2, suffix: " ha" }],
  actions: [{ label: "Entrar na simulação 3D", urlProperty: "simulacao_url" }],
},
// no ProjectConfig:
embeddedPages: { allowedOrigins: ["https://<simulacao>.vercel.app"] },
```

- `target: "overlay"` (padrão): a página abre em tela cheia num iframe com
  "Voltar ao mapa" (ou Esc) e "Abrir em nova aba". `target: "tab"` abre só em
  nova aba.
- `flyTo` (só overlay): `false` (padrão) abre sem mover a câmera; `true` voa até
  a feição (`viewer.flyTo`, num voo gerenciado do limite de navegação); `"home"`
  voa até a vista Home antes de abrir. O antigo padrão `true` deixava a câmera
  longe: com `range 0`, o Cesium escolhe a distância pela esfera envolvente da
  área, bem mais longe que a vista do usuário.
- `onClose` (só overlay): `"keep"` (padrão) devolve a câmera exatamente à posição
  de quando a página abriu, sem animação e só se algo a moveu; `"home"` vai direto
  para a `initialCamera`. Usa só APIs públicas (`positionWC`, `setView`,
  `cancelFlight`).
- Só URLs `https` com origem exata (esquema, host e porta) em
  `embeddedPages.allowedOrigins` viram botão. Sem a lista, nenhum botão aparece.
  O iframe usa `sandbox` (scripts, mesma origem do próprio site e pop-ups).
- O componente da página é carregado só no primeiro uso. Com
  `requestRenderMode`, o Cesium fica parado enquanto a página está aberta.
- Exemplo inativo: `plotSimulationExample` em `src/projects/template.ts`.
  Contrato sintético: `scripts/check-embedded-pages.cjs`.

## Drenagem simulada por Strahler

A simbologia genérica fica em `src/projects/drainageStyle.ts`, reproduzindo a
classificação já validada em produção, inspirada na hierarquia do Global
Mapper. A função `resolveDrainageStyle` fornece a configuração ao loader
existente, sem duplicar a aplicação de estilo nas entidades.

- Ordem 1: `#15DEEF`, **1.2 px**, `zIndex: 20`.
- Ordem 2: `#08B5ED`, **1.8 px**, `zIndex: 21`.
- Ordem 3: `#0087EB`, **2.6 px**, `zIndex: 22`.
- Ordem 4: `#0062E8`, **3.8 px**, `zIndex: 23`.
- Ordem 5: `#003DE0`, **5.2 px**, `zIndex: 24`.

As larguras usam `PolylineGraphics.width`, em pixels de tela. Atributos,
geometria, IDs, popup e seleção seguem o fluxo existente. O estilo não transforma
coordenadas nem ignora altitudes por conta própria.

Para habilitar, configure explicitamente `kind: "drainage"` e
`source.symbology: "simulated-drainage-strahler"` em uma fonte GeoJSON cujos
segmentos tenham o atributo `STRAHLER`. Exemplo de configuração futura em
`src/projects/` (substitua a URL antes de incluir na lista ativa):

```ts
{
  id: "simulated-drainage",
  name: "Drenagem simulada",
  description: "Rede simulada; não confirmada em campo",
  kind: "drainage",
  defaultVisible: false,
  source: {
    format: "geojson",
    url: "https://example.invalid/drainage.geojson",
    autoZoom: false,
    symbology: "simulated-drainage-strahler",
    popup: { fields: [{ property: "STRAHLER", label: "Ordem de Strahler", format: "integer" }] },
  },
}
```

O loader existente compara as chaves textuais das classes: números `1` a `5`
e strings exatas `"1"` a `"5"` recebem as respectivas classes. Ordens acima de
5, ausentes, nulas ou valores sem correspondência (inclusive strings vazias,
fracionários e strings como `"01"`) recebem o fallback da referência:
`#2457B2`, **1.2 px**, `zIndex: 20`. Nenhuma feição é ocultada ou tem seu atributo
normalizado/modificado. A classificação pressupõe dados estáticos no GeoJSON.

Para personalizar, forneça `source.style` no projeto: seus campos substituem os
defaults. Por exemplo, `style: { stroke: "#226699", strokeWidth: 2 }` altera o
fallback e mantém as cinco classes padrão. Para mudar as classes, forneça
`style.classification: { property: "STRAHLER", classes: { ... } }` junto com
`stroke` e `strokeWidth`: essa classificação substitui **toda** a classificação
padrão; declare todas as ordens desejadas. Classes omitidas usam o fallback.
Também é possível omitir `symbology` e fornecer um estilo inteiramente próprio.

O opt-in não é inferido por LineString, nome, ID ou presença de atributo.
Curvas de nível e hidrografia oficial da ANA mantêm sua simbologia. Nenhuma
camada foi adicionada ao template: a abertura continua somente com o mapa base.

## Compatibilidade e escopo

Comparados os módulos de painel, navegação/GPS, temporalidade e diagnóstico de
projetos de produção anteriores. Sliders, popups, legendas externas e estrutura responsiva
já existiam e foram preservados. Nenhum App.tsx foi transplantado integralmente.

`package.json` declara `^1.145.0`; lockfile e pacote instalado registram Cesium
**1.146.0**. Os tipos locais confirmam `ImageryLayer.splitDirection`,
`Scene.splitPosition`, propriedades de entidades e `HeightReference.CLAMP_TO_TERRAIN`.
Referências públicas: [ImageryLayer](https://cesium.com/learn/cesiumjs/ref-doc/ImageryLayer.html)
e [Scene](https://cesium.com/learn/cesiumjs/ref-doc/Scene.html).
Não foram alterados dependências, loaders, viewer, Home, medições ou tratamentos
de compatibilidade. A única adaptação no hook existente aplica/remove o split
das camadas temporais, inclusive quando terminam de carregar assincronamente.

Validação desta atualização: somente `npm.cmd run typecheck`. Build, testes de
navegador, Playwright, auditorias gerais, commit e push não foram executados.
Interações em navegador e URLs de futuros projetos ainda devem ser validadas
quando suas fontes reais forem configuradas.
