# Cesium Vector Tiles 2026 — referência Cardeal Map

Auditoria: 12/10/2026. Escopo: documentação e decisões futuras, sem implementação. O projeto de produção de referência não foi acessado nem modificado. Recursos experimentais devem ser revalidados antes de cada adoção.

## 1. Visão técnica da atualização

O [anúncio de 02/09/2026](https://cesium.com/blog/2026/09/02/vector-tiles-technology-preview-cesium-and-3d-tiles/) apresenta uma Technology Preview de vetores com streaming, LOD hierárquico, atributos e renderização 3D. O caminho disponível usa 3D Tiles 1.1 e extensões glTF. A incorporação em 3D Tiles 2.0 e sua ratificação são planos descritos pelo anúncio; esta auditoria não confirmou a ratificação. Não declarar 2.0 como requisito ou padrão final já adotado.

O payload glTF permite associar geometria e semântica: EXT_mesh_features identifica feições; EXT_structural_metadata armazena propriedades tipadas. São componentes já suportados, distintos das extensões vetoriais ainda em preview. A [especificação glTF de 3D Tiles](https://github.com/CesiumGS/3d-tiles/blob/main/specification/TileFormats/glTF/README.adoc) explica essa separação. IDs locais de renderização não substituem um identificador territorial persistente.

## 2. Funcionalidades disponíveis e grau de maturidade

| Recurso | Situação verificada | Consequência |
| --- | --- | --- |
| GeoJsonDataSource, entidades, Cesium3DTileset e estilo básico | APIs consolidadas presentes no pacote local | Base existente, sem garantia de que todo conteúdo novo seja estável |
| Tiling de vetores pelo ion; LOD por propriedade | Technology Preview | Validar saída, custo e compatibilidade por versão |
| MVTDataProvider | Experimental no JSDoc instalado 1.146.0 | Pode mudar sem política normal de depreciação |
| Clamping vetorial e lineWidth em estilos | Disponíveis no 1.146.0; caminho vetorial experimental | Não confundir com clampToGround de entidades |
| EXT_mesh_features e EXT_structural_metadata | Suporte completo registrado na [discussão técnica oficial](https://github.com/CesiumGS/3d-tiles/issues/825) | Verificar propriedades realmente exportadas e acessíveis |
| EXT_mesh_polygon e 3DTILES_content_gltf_vector | Rascunho/Technology Preview na mesma discussão | Compatibilidade entre produtores e clientes deve ser demonstrada |
| KHR_mesh_primitive_restart | Contribuição citada no anúncio | Confirmar estado e suporte no payload escolhido, sem inferir ratificação pelo prefixo KHR |
| 3D Tiles 2.0; mais simbologia e melhorias para pontos | Futuro no anúncio | Não usar como capacidade garantida |

O [guia de tiling](https://cesium.com/learn/3d-tiling/tiling-vectors/) aceita GeoJSON, GeoPackage, Shapefile e Geodatabase, além de TopoJSON e KML/KMZ. Shapefile requer componentes auxiliares e ZIP; Geodatabase é diretório em ZIP. O importador lê CRS quando disponível, assume EPSG:4326 na ausência e metros para elevação. Geometrias 3D e multipartes são aceitas; M é ignorado; curvas GeoPackage são linearizadas; estilos e conteúdo não vetorial KML não são preservados. Preservar o arquivo mestre e testar a conversão.

## 3. Limitações da Technology Preview

O [tutorial MVT](https://cesium.com/learn/cesiumjs-learn/load-mapbox-vector-tiles-in-cesiumjs/) documenta hierarquia integral criada antes do streaming do conteúdo. Exigir extent regional e maxZoom compatível; aumentar minZoom sozinho não resolve o custo da árvore. Sem limites, o padrão global até zoom 14 pode gerar aproximadamente 358 milhões de nós. A criação preguiçosa é trabalho acompanhado, não capacidade disponível. Estilos Mapbox GL não são aplicados automaticamente. MVT usa XYZ Web Mercator; não reutilizar reverseY de TMS raster. CORS depende do servidor.

A implementação local MVTDataProvider.js confirma fromUrl, minZoom, maxZoom, extent, featureIdProperty, heightReference e scene. O conteúdo é convertido em 3D Tiles durante a execução, com custo adicional de decodificação e geração de geometria. Respostas 204/404 representam tiles ausentes; outros erros requerem diagnóstico. show=false oculta e não destrói recursos. O provider é o objeto adicionado/removido de scene.primitives; seu tileset é acesso à camada interna, não um segundo objeto a adicionar.

Há artefatos possíveis em limites de tiles e refinamento. O [tutorial de clamping](https://cesium.com/learn/cesiumjs-learn/drape-and-style-vector-data-on-terrain-and-3d-tile/) recomenda testar maximumScreenSpaceError menor e reportar problemas persistentes. O [relato oficial de flicker](https://github.com/CesiumGS/cesium/issues/13787) reproduz um problema no 1.145.0: não prova sua permanência ou correção no 1.146.0.

Não prometer consultas globais, edição transacional, topologia integral em cada LOD, traços cartográficos avançados ou equivalência de estilos desktop. Um subconjunto renderizado não é inventário completo para cálculo de drenagem, área ou conservação.

## 4. Compatibilidade com o repositório auditado

### Versões e skills

- package.json: cesium ^1.145.0; package-lock.json e node_modules/cesium/package.json: **1.146.0**. O lock resolve @cesium/engine ^26.4.0 e @cesium/widgets ^16.3.0 como dependências do Cesium. Não foi realizada atualização.
- skills-lock.json: versão 1, 15 entradas com source cesiumgs/cesiumjs-skills, sourceType github, skillPath e computedHash. O lock descreve proveniência; não garante compatibilidade com 1.146.
- agent/skills/ e .agents/skills/: 15 diretórios cada. .claude/skills/: 15 links/junctions que resolvem para .agents/skills/. Estruturas e referências preservadas.
- Inventário comum: cesiumjs-3d-tiles, cesiumjs-camera, cesiumjs-core-utilities, cesiumjs-custom-shader, cesiumjs-entities, cesiumjs-imagery, cesiumjs-interaction, cesiumjs-materials-shaders, cesiumjs-models-particles, cesiumjs-primitives, cesiumjs-spatial-math, cesiumjs-terrain-environment, cesiumjs-time-properties, cesiumjs-viewer-setup e using-cesiumjs-skills.
- As cópias SKILL.md em agent/skills/ e .agents/skills/ têm os mesmos nomes, mas diferem em conteúdo mesmo normalizando BOM e CRLF; não presumir espelhos idênticos nem sincronizá-los nesta tarefa. Os links Claude usam a cópia .agents.
- A orientação e a skill de 3D Tiles lidas declaram baseline 1.144. A afirmação antiga de draping automático não deve substituir as opções explícitas da API 1.146 e dos tutoriais atuais.

### Funcionamento constatado no código

| Área | Implementação atual | Lacuna para vetores tiled |
| --- | --- | --- |
| src/projects/ | index.ts seleciona template.ts; types.ts separa tema e formato; apenas basemap ativo | Sem formato MVT nem opções de estilo/clamping vetorial tiled |
| Terreno | useCesiumViewer usa Terrain.fromWorldTerrain e fallback EllipsoidTerrainProvider | Não carrega terrain derivado de MDT local |
| Rasters | loadLayer cria UrlTemplateImageryProvider, ImageryLayer, WebMercator; XYZ/TMS por URL; basemap ion com fallback OSM | Imagem MDT/MDS é tema raster, não elevação do terreno |
| Vetores | GeoJsonDataSource.load; entidades; classes, contornos auxiliares, opacidade; prepareGeoJson pode remover Z e criar IDs | Não usa MVTDataProvider ou GeoJsonPrimitive |
| Modelos | Cesium3DTileset.fromUrl; ion via IonResource.fromAssetId com token; offset, clipping e recorte de terreno opcionais | Loader não passa scene/heightReference nem aplica Cesium3DTileStyle vetorial |
| Ciclo de camadas | useProjectLayers carrega rasters/vetores mesmo invisíveis; 3d-tiles sob demanda quando visíveis; remove recursos/listeners no cleanup | LoadedLayer não inclui provider MVT; ready atual não significa vista tiled completa |
| Câmera | projectCamera e NavigationControls compartilham initialCamera/Home | Preservar; não copiar zoomTo de tutorial na abertura |
| Interação | VectorPopup observa selectedEntity e resolve sobreposição de Entity | Feição 3D Tiles não é Entity; precisa futuro adaptador sem duplicar popup |
| Medições | useMeasurements; pickPosition e globe.pick; distância cartesiana 3D, desnível elipsoidal e área horizontal | Não representa automaticamente comprimento sobre terreno nem área da superfície |
| UI | LayerPanel, Legend, NavigationControls, MeasurementToolbar, VectorPopup e ferramentas de modelo de desenvolvimento | Preservar português, desktop e drawer/backdrop/header móvel; legends PNG+config |

Também existem public/legends/, scripts de regressão, README e relatórios do template, Vite/TypeScript, node_modules e artefatos locais de build/verificação. Não confundir artefatos com fontes nem incluí-los em commits.

**Conclusão:** a versão atende o pré-requisito 1.145+ dos tutoriais, e as opções foram conferidas no código/tipos instalados. Há compatibilidade de biblioteca para uma POC; não há integração completa da aplicação, validação em navegador ou prova de desempenho dos novos caminhos. O formato 3d-tiles existente pode carregar conteúdo compatível, mas ainda não oferece todo o comportamento temático necessário. Extensões futuras devem ser pequenas e reutilizáveis, sem recriar o viewer ou trocar plataforma.

## 5. GeoJSON × MVT × 3D Tiles vetoriais

Critérios de engenharia para Cardeal Map, não limites absolutos por quantidade de feições. Medir também vértices, bytes, atributos, simultaneidade de camadas e dispositivo.

| Critério | GeoJSON por entidades atual | MVT | 3D Tiles vetoriais |
| --- | --- | --- | --- |
| Uso inicial | Recortes menores, interação e geometria acessível | Grandes conjuntos 2D e serviços já tiled | Volume elevado, Z significativo, LOD semântico e contexto 3D |
| Carregamento | Arquivo e entidades; sem tiling automático neste loader | Conteúdo progressivo; árvore inicial pode ser cara | Refinamento espacial conforme vista/erro; precisa tiler compatível |
| Geometria/edição | Dados fonte acessíveis; edição requer ferramenta ainda não existente | Quantização, clipping e simplificação podem fragmentar feições | Representações por LOD; não é substituto do banco/arquivo mestre |
| Altimetria | Z ou clamping conforme configuração | Geometria 2D; clamping não cria Z topográfico na fonte | Geometria 3D ou draping, conforme significado |
| Atributos | Entity.properties | Somente o que foi codificado no MVT; IDs repetidos entre tiles | Metadados no payload; auditar tipo, unidade e ligação à feição |
| Custo de produção | Baixo para recortes; alto custo cliente quando crescem | Gerar/atualizar pirâmide ou operar serviço | Tiling, LOD, armazenamento, reprocessamento e validação |
| Hospedagem | Arquivo estático + CDN | Tiles estáticos + CDN ou serviço; considerar número de objetos/requisições | tileset e payloads + CDN ou ion; verificar direitos de exportação/hosting |
| Manutenção | Fácil revisão da fonte; arquivo completo muda | Invalidação por versão/zoom; preservar pipeline e IDs | Arquivar fonte, opções do tiler, schema, versão de engine e saída |
| Maturidade no template | Implementado | Ausente; experimental no Cesium | Loader genérico existe; novo uso vetorial ainda não integrado |

Hospedagem exige URLs relativas corretas, HTTPS, MIME adequado, CORS, atribuição, cache versionado e controle de acesso compatível com cliente público. Levantar armazenamento, bytes transferidos, requisições, tempo de tiling, licença/plano e esforço mensal; não estimar preços sem cotação vigente. ion gerencia tiling/hosting, mas acesso e exportação dependem do plano. Auto-hospedagem desloca custo para pipeline e operação; não elimina necessidade de tiler com extensões compatíveis.

GeoJSON não oferece edição só por ser GeoJSON; sua geometria é mais acessível ao fluxo interativo. Não impor migração a dados pequenos que já atendem metas.

## 6. Estratégia de LOD por atributos

O tiler ion oferece simplificação Low/Medium/High, propriedade de prioridade e inversão. Sem propriedade, a prioridade deriva do tamanho da geometria. Valores altos são favorecidos em vistas distantes; isso não estabelece um corte garantido por ordem ou altura de câmera. [Opções oficiais](https://cesium.com/learn/3d-tiling/tiling-vectors/).

Para drenagem, propor strahler inteiro positivo como prioridade, sem inversão: canais principais tendem a persistir longe, tributários aparecem perto. Validar monotonicidade, confluências e continuidade por ordem; não transformar a simplificação visual em nova análise hidrológica. Comparar tiling geométrico e semântico usando a mesma fonte. Um riacho curto importante pode justificar outro atributo de prioridade, com regra explícita e auditável.

Hierarchical LOD descreve representações/refinamento da árvore espacial. Property-based LOD influencia a seleção no processamento. maximumScreenSpaceError regula refinamento no cliente; estilo show regula visibilidade depois do carregamento. São controles distintos. Não há parâmetro público inventado lodProperty em Cesium3DTileset. Alterar prioridade de tiling implica novo processamento, não apenas trocar estilo.

## 7. Estilização temática e consultas

No pacote local Cesium3DTileStyle aceita color, show e lineWidth. O tutorial documenta lineWidth em pixels, não metros. Polígonos têm preenchimento por color/show; não presumir contorno, hachura ou dash pattern equivalente ao Global Mapper. Pontos possuem opções documentadas hoje, enquanto o anúncio de setembro colocava expansão de draping/simbologia para pontos no futuro: conferir comportamento de cada versão.

Exemplo conceitual para execução futura em tileset já carregado; não é configuração aceita hoje por LayerSource. Todos os registros precisam conter strahler numérico validado. Regras e cores abaixo são proposta Cardeal Map, não estilo oficial.

```js
import { Cesium3DTileStyle } from "cesium";

tileset.style = new Cesium3DTileStyle({
  color: {
    conditions: [
      ["${strahler} >= 4", "color('#174A8B')"],
      ["${strahler} >= 2", "color('#287AB8')"],
      ["true", "color('#67BAD1')"],
    ],
  },
  lineWidth: "${strahler} >= 4 ? 4.0 : 2.0",
  show: "${strahler} >= 1",
});
```

Conferir nomes case-sensitive, schema e nulos antes de aplicar expressões. A última condição não torna referências anteriores a atributos ausentes seguras. Legenda deve refletir exatamente classes e filtros. Scene.pick permite acessar getPropertyIds/getProperty quando o resultado os suporta; checar o objeto antes de chamar. Seleção pode desaparecer com descarga/refinamento; persistir seleção por ID fonte, não pela referência transitória. Consulta completa ao conjunto exige fonte mestre/serviço separado; não somar apenas feições visíveis.

show não reduz downloads nem refaz tiling. Atualizar estilo requer respeitar requestRenderMode. Aplicar filtros ambientais somente a atributos disponíveis e coerentes entre versões.

## 8. Clamping e referências altimétricas

O tutorial atual requer scene e heightReference na criação; alvo 3D receptor também deve receber a mesma scene. NONE usa altura original; CLAMP_TO_TERRAIN recebe terreno; CLAMP_TO_3D_TILE recebe conteúdo 3D; CLAMP_TO_GROUND considera ambos. Trocar alvo requer recriar a camada. Essas opções foram conferidas no código/tipos 1.146. [Procedimento oficial](https://cesium.com/learn/cesiumjs-learn/drape-and-style-vector-data-on-terrain-and-3d-tile/).

Preservar quatro objetos distintos: dados altimétricos (cotas/amostras/MDT), superfície de terreno publicada, malha fotogramétrica (pode conter vegetação/edificações) e geometria de projeto (cotas planejadas). Raster de MDT com cores não modifica o relevo. Um terrain model e uma malha 3D Tiles não são intercambiáveis.

Para cada produto, registrar CRS horizontal, eixo/ordem, unidades, datum vertical, geóide, época, resolução e erro conhecido. Não confundir H ortométrica com h elipsoidal; uma transformação documentada pode usar h=H+N conforme convenção do modelo geoidal. Sem referência vertical conhecida, bloquear conclusão de precisão. Um offset constante de modelo não corrige um datum espacialmente variável.

Clamping é alinhamento visual à superfície carregada; depende de LOD e qualidade do receptor. Drenagem sobre copa/ponte pode ficar visualmente correta e hidrologicamente incorreta. Curvas de nível possuem cotas próprias: comparar modo NONE com terreno, preservando elevação de origem. Medições do viewer não certificam levantamento. Fallback elipsoidal invalida a avaliação de relevo e deve ser registrado como falha do cenário altimétrico.

## 9. Aplicações territoriais e cadeia de publicação

| Tema | Hipótese de uso | Cuidado técnico |
| --- | --- | --- |
| Drenagem Strahler | Primeira POC, prioridade por ordem | Confluências, direção, ID, método de extração e permanência dos canais |
| Microbacias | LOD para muitos polígonos, atributos ambientais | Não recalcular área por malha simplificada; limites completos no mestre |
| Curvas de nível | Streaming de linhas densas | Preservar cota/intervalo e separar draping de Z medido |
| APP e conservação | Classes, origem e situação territorial | Sem inferir enquadramento jurídico só pela visualização |
| Recuperação ecológica | Prioridade, estágio e monitoramento | Datas, fonte e indicadores comparáveis |
| Estradas existentes/projetadas | Classe, estado, cenário e integração 3D | Não apagar cotas de projeto com clamping |
| Unidades de manejo | Consulta por ID e atributos operacionais | Limites e relações persistentes, mesmo com LOD |
| Atributos ambientais e modelos | Vetores/metadados associados por ID e contexto | Sobreposição não incorpora automaticamente atributos à malha |

Fluxo proposto: conservar projeto mestre no Global Mapper, inventariar/exportar vetores em formato aceito, verificar CRS/atributos/Z, depois escolher publicação direta GeoJSON, pipeline MVT ou tiling ion. A versão/licença do Global Mapper e suas opções exatas de exportação não foram verificadas nesta tarefa; não prometer exportação nativa de vetores 3D Tiles.

No Metashape, separar produtos previstos: ortomosaico para tiles raster, MDT para processamento/publicação como terreno e malha georreferenciada para tiling 3D. Confirmar formatos e referências na versão instalada antes da execução. Não afirmar que um ZIP ou mesh exportado já constitui terrain ou tileset utilizável. Conservar pontos de controle e relatório de erro para comparar produtos publicados.

## 10. Referências verificadas e limites da consulta

As quatro páginas solicitadas foram acessíveis e lidas, com links nas seções acima. Documentação online evolui; esta referência registra o estado da consulta, não uma garantia permanente.

- [API Cesium3DTileset](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html) e [API Cesium3DTileStyle](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileStyle.html): acessíveis, mas não fixadas em versão. Compatibilidade confirmada também em node_modules/cesium/Source/Cesium.d.ts e node_modules/@cesium/engine/Source/Scene/{MVTDataProvider,UrlTemplate3DTilesDataProvider,Cesium3DTileset,Cesium3DTileStyle}.js.
- [Sandcastle 3D Native Vector Data](https://sandcastle.cesium.com/?id=3d-tiles-3d-native-vector) e [Global Rivers Property-based LOD](https://sandcastle.cesium.com/?id=3d-tiles-property-lod-river): destinos oficiais conferidos pelo anúncio; retornaram aplicativo sem texto/código à ferramenta de consulta. Não foram executados nem inspecionados visualmente. O segundo também está referenciado no relato de flicker citado.
- Links Sandcastle dos dois tutoriais resolveram para a página inicial, sem exemplo identificável. Não inventar IDs. Na futura POC, usar exemplos nomeados acima e registrar engine, asset, token/entitlement e fonte realmente carregada.
- Páginas de API fixadas em /downloads/cesiumjs/releases/1.146/Build/Documentation/ e ref-doc/MVTDataProvider.html não foram acessíveis pela ferramenta. Foi usada a fonte oficial distribuída no pacote instalado, sem supor assinaturas.
- Tentativas de URLs antigas Vendor/EXT_mesh_features e Vendor/EXT_structural_metadata em glTF retornaram erro/404; a especificação glTF de 3D Tiles e a discussão oficial #825 sustentam a descrição de metadados. Não apresentar links quebrados como leitura concluída.

Nenhum teste de aplicação ou benchmark foi executado para esta atualização documental. Revisar a POC antes de implementar qualquer adaptador. Não fazer commits/pushes automaticamente.
