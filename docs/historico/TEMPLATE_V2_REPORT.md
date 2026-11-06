# Cardeal Map Template v2 — promoção de arquitetura

> Registro histórico da v2.0 (04/10/2026), movido para docs/historico. Pode não refletir o estado atual: veja CHANGELOG.md.

A referência de produção foi inspecionada somente para leitura. Nenhum dado de propriedade foi copiado. O alvo preserva React/TypeScript/Vite/CesiumJS e a interface anterior.

Promovidos e adaptados:
- popup Cardeal/posicionamento e seleção vetorial, com resolução no horário do viewer, campos ausentes omitidos, pt-BR, prefix/suffix e precisão;
- classificação genérica por atributo e paleta por índice, fills/opacidades/fallbacks e polylines por classe;
- boundaries PolylineGraphics sem fills duplicados, remoção/reinserção de helpers no toggle;
- GeoJSON preparado em cópia, altitude opcional e IDs únicos;
- URL/ion, token 3D independente, transformação de altura opcional;
- recorte por polígono validado, propriedade exclusiva das coleções, cutout complementar opcional e limpeza;
- autoria de crop/altura/captura atrás de flags e somente no modo DEV;
- 404/410 de tiles recuperáveis, observação de sucesso e diagnóstico de fonte sem cobertura, sem recriar providers.

Preservados câmera/Home, Bing/World Terrain e fallbacks, rasters simultâneos, reverseY, limites de zoom, medições, layout responsivo, atribuição e legendas. Exemplos adicionais são inativos, sintéticos e usam example.invalid; assetId 0 precisa ser substituído. Não foram copiados nomes, R2, tokens, assets, bounds/câmera, crop, paletas ou atributos/valores de levantamento da referência. Skills/junctions e assets preexistentes foram preservados.

A documentação README contém exemplos exatos e convenções TMS/GeoJSON. Os checks existentes são adaptados aos novos imports e à recuperação automática de tiles; check-template-v2 cobre contratos novos com fixtures locais. Validação final e commit/push são relatados na entrega. Não houve testes manuais exaustivos ou publicação.

Limites: clipping exige suporte WebGL 2; prioridades ground dependem do suporte Cesium/plataforma; recorte complementar do globe possui um dono; o guard de clipping para internos Cesium fica restrito à versão 1.146. Validar dados e CORS ao configurar uma propriedade real.

Validação desta atualização: npm ci concluído; TypeScript e build de produção aprovados; todos os checks locais passaram. Diff revisado e varredura contra URLs, paletas, asset e coordenadas da referência sem ocorrências no código/configuração/documentação novos. O bundle de produção exclui ferramentas avançadas e captura. O projeto de referência permanece limpo e inalterado. Nenhum remoto Git está configurado no template; commit mantido localmente.

Arquivos alterados/criados (28):

- Configuração: .env.example, package.json, package-lock.json, src/projects/types.ts, src/projects/template.ts.
- Interface: src/App.tsx, src/components/LayerPanel.tsx, src/components/VectorPopup.tsx, src/components/VectorPopup.css, src/components/popupPosition.ts, src/components/ModelCropDev.tsx, src/components/ModelCropDev.css, src/components/ModelDevelopmentTools.tsx.
- Infraestrutura: src/cesium/loadLayer.ts, src/cesium/imageryTileErrors.ts, src/cesium/prepareGeoJson.ts, src/cesium/vectorPopup.ts, src/cesium/modelClipping.ts, src/cesium/modelHeight.ts, src/cesium/modelTerrainCutout.ts, src/hooks/useCesiumViewer.ts, src/hooks/useProjectLayers.ts.
- Checks/instruções: scripts/capture-camera.cjs, scripts/check-projects.cjs, scripts/check-raster-lifecycle.cjs, scripts/check-template-v2.cjs.
- Documentação: README.md, TEMPLATE_V2_REPORT.md.
