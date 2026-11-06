# POC futura — drenagem hierarquizada em Vector Tiles

Plano de 12/10/2026. **Não implementado, não publicado e sem aprovação implícita para alterar produção.** Referência: [Cesium Vector Tiles 2026](CESIUM_VECTOR_TILES_2026.md). Engine auditada: CesiumJS 1.146.0; manter lock e revalidar APIs antes de começar.

## Objetivo e hipótese

Comparar a drenagem GeoJSON atual com uma publicação 3D Tiles vetorial produzida no ion, usando strahler como prioridade de LOD. Hipótese: uma rede regional grande pode reduzir carga inicial e memória, manter canais principais em vistas amplas e permitir estilos/consultas por atributos. Demonstrar o resultado; não assumir benefício para uma microbacia pequena. MVT será uma alternativa posterior, especialmente se já existir serviço tiled 2D.

O experimento começa fora do fluxo ativo do template, em ambiente isolado ou Sandcastle. Só após aprovação dos critérios se planeja um adaptador reutilizável para o mecanismo de camadas existente. Não modificar projetos de produção, adicionar defaults reais ao template ou substituir componentes.

## 1. Amostra e cadeia de custódia

Selecionar uma área com confluências, canais curtos e longos, todas as ordens disponíveis e variação de relevo. Propor um recorte pequeno (1–5 mil trechos) e um regional (50–100 mil, ou o volume real disponível); registrar valores reais, número de vértices, bytes, distribuição de ordens e extensão. São tamanhos de ensaio, não fronteiras universais entre formatos.

Arquivar fonte mestre, hash, CRS horizontal/vertical, unidade Z, geóide, data, resolução do MDT e método/limiar de extração da rede. Drenagem extraída de MDT não é levantamento de cada talvegue. Escolher ao menos 30 pontos de referência, incluindo confluências, extremos, bordas de tiles e trechos de maior declividade. Para terreno versus mesh, escolher pontos efetivamente de solo e marcar copa/ponte/edificação como outra superfície.

Schema proposto de intercâmbio (nomes não são campos presumidos do Global Mapper):

| Campo | Tipo/semântica | Regra |
| --- | --- | --- |
| feature_id | String estável | Único na fonte; manter mesmo valor entre representações/tiles |
| strahler | Inteiro | >=1; sem nulos; auditar domínio e método |
| basin_id | String | Identifica microbacia no mestre |
| length_m | Número | Comprimento original, método e unidade documentados |
| source_name, source_date | Strings | Proveniência e data |
| vertical_ref | String | Referência Z ou indicação explícita de geometria 2D |

Se os campos reais tiverem outros nomes, registrar mapeamento sem perda de informação. Não renomear ou truncar silenciosamente. Atributos ausentes devem ser tratados antes do tiling, não por expressões improvisadas. Preservar originais e tabela de correspondência; evitar depender de FID regenerado na exportação.

## 2. Exportação do Global Mapper

1. Inventariar versão/licença e opções oficiais de exportação disponíveis. Este plano não pressupõe exportação nativa de Vector 3D Tiles.
2. Validar rede, multipartes, direções e confluências na fonte. Registrar como Strahler foi calculado; não derivá-lo apenas da espessura visual.
3. Exportar GeoPackage como candidato mestre de intercâmbio quando suportado, e um GeoJSON do mesmo recorte para baseline. Alternativa: Shapefile com SHX/DBF/PRJ/CPG em ZIP, verificando truncamento de nomes, encoding e Z. Geodatabase também é entrada ion aceita, em diretório ZIP.
4. Para GeoJSON, usar longitude/latitude WGS84 e documentar transformação. Para formatos com CRS explícito, conferir sua leitura pelo ion; nunca confiar na suposição EPSG:4326 para coordenadas UTM. Validar unidades em metros e distinguir h elipsoidal/H ortométrica.
5. Manter duas variantes quando pertinente: rede 2D para draping e geometria 3D com Z da fonte para modo NONE. Não descartar Z da fonte mestre nem usar ignoreAltitude como transformação de datum.
6. Reabrir os arquivos exportados e comparar IDs, campos/tipos, domínio strahler, contagens, bounds e checkpoints. Nenhum upload antes de passar a verificação.

## 3. Produtos altimétricos e fotogrametria

Usar o mesmo terreno receptor em todas as comparações primárias. Se um MDT local for necessário, confirmar seu pipeline de terrain compatível antes do ensaio; o template atual só oferece World Terrain e fallback elipsoidal. Um PNG colorido do MDT não substitui terrain.

Para Metashape, confirmar versão, georreferenciamento e formatos reais de exportação: ortomosaico, MDT e malha são produtos diferentes. Preparar a malha como conteúdo 3D Tiles em pipeline separado, com controles independentes. Não atribuir precisão de solo à superfície de vegetação. O experimento com malha receptora é secundário, após o terreno, para evitar confundir mudança de superfície com ganho do formato vetorial.

Se faltarem datum vertical ou pontos de controle, o cenário pode validar visualização, mas reprova a afirmação de alinhamento topográfico. Não corrigir todos os dados por offset visual arbitrário.

## 4. Tiling e publicação experimental

No [ion, Tiling Vectors](https://cesium.com/learn/3d-tiling/tiling-vectors/), importar arquivo validado e escolher tile as 3D Tiles. Produzir duas saídas com mesma simplificação Medium: uma sem prioridade semântica e outra com Level of detail property name igual ao campo real strahler, sem Flip priority. Opcionalmente comparar Low/High depois, caso o ensaio primário justifique.

Preservar relatório de ingestão, IDs de assets, opções, versão/data do serviço, tamanhos e schema da saída. O tiler favorece valores altos em distância; não garante faixas exatas por ordem. Não alterar a fonte para forçar aparência antes de entender o resultado.

Publicar apenas em ambiente experimental autorizado. Antes disso, verificar plano/licença, processamento, armazenamento, quotas, eventual exportação e tráfego. Não há preço estimado neste documento. Se houver auto-hospedagem autorizada, validar tileset, payloads e URLs relativas, MIME/CORS, cache e direitos de distribuição. Vetor 3D Tiles não implica acesso público irrestrito aos dados fonte.

Tokens públicos devem ter escopo mínimo conforme serviço; não copiar .env.local, inserir credenciais em docs ou guardar URLs autenticadas em relatórios/prints. Dados técnicos confidenciais exigem política de acesso anterior ao upload.

## 5. Visualização isolada e sequência dos cenários

Consultar os exemplos oficiais [3D Native Vector Data](https://sandcastle.cesium.com/?id=3d-tiles-3d-native-vector) e [Global Rivers Property-based LOD](https://sandcastle.cesium.com/?id=3d-tiles-property-lod-river). Seus destinos foram conferidos, mas execução/código não foram acessíveis na auditoria documental; inspecioná-los na POC e registrar a versão realmente usada. Sandcastle corrente pode diferir da engine do template.

Cenários propostos:

1. GeoJSON atual com todas as feições, como baseline de geometria/atributos e desempenho.
2. 3D Tiles vetorial sem prioridade por Strahler, mesmo terreno e câmeras.
3. 3D Tiles vetorial com prioridade por Strahler, mesmos parâmetros de renderização.
4. Variantes NONE (se Z conhecido) e CLAMP_TO_TERRAIN; depois CLAMP_TO_3D_TILE/CLAMP_TO_GROUND para malha receptora autorizada.

As APIs locais confirmadas são Cesium3DTileset.fromUrl e opções scene/heightReference; aplicar Cesium3DTileStyle ao tileset. Não copiar acesso ion do tutorial se ele perder o token dedicado: o loader atual usa IonResource.fromAssetId e depois fromUrl. O receptor 3D também precisa ser criado com a mesma scene. Troca de alvo exige recriação. Usar uma única engine, o mesmo receptor, viewport, caches e percurso de câmera para comparação.

Aplicar a proposta de cores/larguras da referência técnica e uma legenda coerente. Consultar somente resultado com getPropertyIds/getProperty suportados. Seleção é por feature_id e deve tolerar descarregamento/refinamento. show é filtro visual; não é consulta global nem reduz requisições. Não calcular comprimento total da rede com o subconjunto renderizado.

Ensaio MVT opcional: produzir/obter XYZ binário válido, manter feature_id no payload e usar featureIdProperty. Definir extent mínimo correto e minZoom/maxZoom publicados antes de inicializar MVTDataProvider. Auditar custo da árvore inicial separadamente do streaming. Não usar extensão .pbf como prova de conteúdo válido nem reverseY de TMS.

## 6. Protocolo de medição

Registrar máquina/GPU/RAM, navegador/versão, viewport/DPR, engine, dataset/hash, rede, cache, terreno/mesh e parâmetros. Usar desktop 1440×900 e dispositivo móvel real com viewport próximo de 390×844; emulação sozinha não valida memória/GPU móvel.

Fazer 5 execuções com cache frio e 5 com cache quente por cenário, mesmas vistas regional, intermediária e local. Rede de ensaio proposta: 20 Mbit/s e RTT 50 ms, documentando método de limitação. Fazer percurso repetível de 60 s e 10 ciclos de navegação/ativação/remoção. Separar tempo até primeira rede visível, até vista completa e tempo de inicialização do provider.

Vista completa deve usar tilesLoaded/allTilesLoaded conforme a câmera atual e depois pelo menos dois frames renderizados estáveis; fromUrl resolvida e status ready do template não bastam. Timeout de 30 s é falha observada, não aprovação. Em requestRenderMode, medir frame time durante navegação/alterações, não FPS de cena parada.

Os orçamentos abaixo são **metas propostas da POC**, não promessas do Cesium nem tolerâncias oficiais. Congelar metas e controles antes das medições; qualquer revisão deve ter motivo e novo ensaio.

## 7. Critérios mensuráveis de aprovação

| Critério | Método | Meta proposta |
| --- | --- | --- |
| Posicionamento horizontal | 30 checkpoints em CRS métrico, LOD mais fino; comparar fonte/exportação/publicação, não só pixels | Erro P95 introduzido pela publicação <=0,50 m e máximo <=1 m; erro absoluto deve satisfazer acurácia declarada da fonte |
| Z em modo NONE | Mesmos checkpoints, datum transformado e Z de origem conhecido | Erro P95 introduzido <=0,20 m e máximo <=0,50 m; documentar quantização |
| Draping | Comparar superfície receptora estabilizada com referência independente de mesma classe/datum | P95 <= orçamento de erro vertical previamente fixado a partir de MDT/controle e aplicação; sem orçamento numérico assinado antes do ensaio, não aprovar precisão |
| Alvo altimétrico | Cenários terreno, mesh, ambos e ausência de terreno | Zero casos de receptor incorreto; fallback elipsoidal deve reprovar cenário de relevo |
| Atributos | Auditoria completa do arquivo exportado e amostra >=100 feições tiled, estratificada por ordem/limites de tile | 100% dos campos obrigatórios/valores/IDs preservados; zero strahler inválido; contagem por ID lógico, não fragmentos |
| LOD semântico | Capturar vistas fixas e contar IDs por ordem após estabilização; comparar com tiling geométrico | 100% dos canais de ordem máxima da amostra de referência visíveis na vista regional; todos os IDs da amostra recuperáveis na vista local; falha documentada se a política do tiler não cumprir |
| Continuidade | Inspecionar >=20 confluências/bordas em zoom/refinamento | Zero lacunas persistentes >1 pixel no LOD estabilizado; registrar flicker transitório e duração |
| Streaming | Network panel + eventos de tiles; registrar bytes iniciais e percurso | Não baixar todo o conteúdo para primeira vista; no recorte regional, >=30% menos bytes até primeira vista que GeoJSON e mediana <=3 s para primeira rede visível |
| Vista completa | tilesLoaded/allTilesLoaded por vista | Mediana <=8 s desktop e <=12 s móvel na rede de ensaio |
| Simbologia | Amostra de todas as ordens, filtro e legenda; largura em pixels | 100% de classificação correta e ordem de larguras coerente; zero legenda divergente |
| Consultas | >=30 seleções, inclusive fragmentos, refino e sobreposição | 100% de IDs/valores corretos; latência P95 <=200 ms para feição já carregada |
| Memória | totalMemoryUsageInBytes + heap/processo do navegador; eventos tileLoad/tileUnload | Orçamento incremental da camada: <=256 MiB desktop / <=128 MiB móvel; após 10 ciclos, memória estabilizada <=110% do ciclo 1 equivalente; sem crash/context loss |
| Desempenho | Frame time em navegação, 60 s, 5 rodadas | P95 <=33 ms desktop e <=50 ms móvel; no recorte regional, >=30% menos pico incremental de memória que baseline |
| Arquitetura | Revisão do futuro adaptador e regressão end-to-end | Nenhum ID/tema real em componente genérico; câmera/Home, medição, legendas, português, drawer/backdrop/header, créditos e controles preservados |

Memória do tileset é estimativa de recursos de conteúdo; não inclui toda a árvore MVT, heap JS, workers, terreno ou mesh. cacheBytes e maximumCacheOverflowBytes ajudam a administrar tiles, não limitam toda a memória do aplicativo. Separar baseline viewer+receptor do incremento vetorial. Usar profiler do navegador quando a métrica JS não estiver disponível; registrar método, sem depender de API privada ou universalizar métricas específicas de navegador.

As tolerâncias horizontal/Z avaliam erro introduzido na publicação, não certificam precisão absoluta. Somar orçamento da fonte, transformação e receptor; comparar com controles independentes. Se as metas forem inadequadas ao dado disponível, replanejar antes de executar. Não flexibilizar metas depois de ver resultados para declarar sucesso.

## 8. Integração futura no template, somente após decisão

Reutilizar src/projects/ para fontes, schema, estilo e legendas; src/cesium/ para loader/adaptador; useProjectLayers para visibilidade, status e descarte. Não colocar assetId, Strahler ou nome de propriedade fixo em componente reutilizável. Distinguir vetor tiled de modelo para evitar ferramentas de alinhamento/recorte acionadas apenas pelo transporte 3d-tiles.

Planejar passagem da scene ao loader e suporte ao provider somente se necessário. Reaproveitar a apresentação do VectorPopup com adaptador de feição; selectedEntity e WeakMap<Entity> atuais não atendem diretamente a 3D Tiles. Conservar gestão de inputs de medição e requestRenderMode. Ocultar é diferente de remover; garantir cleanup em StrictMode, troca de projeto e resolução assíncrona tardia.

Verificar arquivo/schema e serviço remoto/CORS antes de ativar entradas. O template carrega rasters/vetores invisíveis; examples devem continuar inativos até configuração completa. Não utilizar autoZoom para substituir câmera inicial/Home. A proposta não muda nenhum desses arquivos agora.

## 9. Decisão, entregáveis e retorno seguro

Entregar matriz de resultados por cenário, cinco rodadas, gráficos/tabelas, logs sem credenciais, screenshots desktop/mobile, manifestos/hash e custo estimado a partir de preços/quotas verificados na data. Registrar links/versionamento de assets e limitações conhecidas.

Aprovar uma futura implementação somente se identidade/atributos e integridade espacial passarem, houver benefício mensurado no recorte regional e não houver regressão arquitetural. Se tiling semântico omitir canais essenciais ou preview apresentar artefatos incompatíveis com o uso, manter GeoJSON nos recortes operacionais; considerar MVT regional após ensaio próprio. Um formato pode vencer para região e perder para uma propriedade pequena.

Primeira implementação recomendada, após a POC: um adaptador genérico de **vetor 3D Tiles por URL/ion**, com estilos por atributos, consulta por ID e lifecycle existente, testado em drenagem Strahler. MVT fica como segunda etapa devido ao custo da hierarquia inicial. Na etapa de código futura, aplicar npm ci, typecheck, check, build, preview e verificação desktop/mobile/URLs/CORS conforme AGENTS.md. Neste planejamento, validar apenas documentação, escopo e diff; não instalar, construir, publicar ou commitar automaticamente.
