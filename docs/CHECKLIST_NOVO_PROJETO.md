# Checklist — novo projeto a partir do template

Roteiro principal, na ordem que funcionou no Cyro: `docs/NOVO-PROJETO.md`. Este checklist guarda os detalhes de referência (token, geoide, ogr2ogr, publicação).

Ordem: preparação → rasters → modelo 3D → vetores → finalização. Comandos em PowerShell, a partir da pasta do projeto.

## 0. Preparação

1. Criar o projeto (Git próprio, sem histórico do template):
   ```powershell
   cd C:\Users\Usuario\Desktop\cardeal-map-template
   npm.cmd run new-project -- -Slug <slug> -Destination C:\Users\Usuario\Desktop\<slug>
   cd C:\Users\Usuario\Desktop\<slug>
   npm.cmd ci
   ```
2. Token ion **do projeto**: criar no painel do Cesium ion um token com escopo apenas nos assets deste projeto (World Terrain, Bing e o modelo 3D) e com *Allowed URLs* `http://127.0.0.1:5173`, `http://127.0.0.1:4173` e o domínio publicado. `copy .env.example .env.local` e preencher `VITE_CESIUM_ION_TOKEN` e `VITE_CESIUM_3D_TOKEN` (pode ser o mesmo token). Tudo que começa com `VITE_` é público no navegador; a restrição por URL é a proteção.
3. `src/projects/<slug>.ts` (gerado pelo script e já registrado em `index.ts`): `name` e `location`. `bounds`, Home e cenas são capturados na etapa 1b; até lá não há limite de navegação. Não coloque dados reais em `template.ts`: ele guarda os exemplos usados pelos checks.
4. CORS do bucket R2: aplicar `docs/r2-cors.json` com o domínio final (ver `docs/R2_CORS.md`).
5. `npm.cmd run typecheck; npm.cmd run check` (o script já fez o primeiro commit na branch `main`).

## 1. Rasters (ortomosaico, MDT/MDS e derivados)

1. Exportar tiles **EPSG:3857/900913** (Global Mapper: EPSG:900913, TMS → `{reverseY}`), PNG 256×256, com `tilemapresource.xml`. JPG não tem transparência (bordas pretas).
2. Upload para o R2:
   ```powershell
   aws s3 sync .\tiles\orto s3://<bucket>/<slug>/orto --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com --cache-control "public, max-age=31536000, immutable"
   ```
3. Gerar a entrada da camada a partir do XML e testar o tile remoto/CORS:
   ```powershell
   npm.cmd run raster-from-xml -- .\tiles\orto\tilemapresource.xml --tiles .\tiles\orto --url https://<dominio-r2>/<slug>/orto --kind orthomosaic --name "Ortomosaico" --credit "Cardeal" --origin https://<dominio-final>
   ```
   `--tiles` confirma TMS/XYZ e níveis pelos arquivos reais. Saída com `FALHA` = URL, caminho ou CORS errados; não ative a camada.
4. Colar o objeto em `layers` de `src/projects/<slug>.ts` (ordem do array = empilhamento; o último fica por cima). `description`, `kind` (`orthomosaic`, `dtm`, `dsm`, `slope`…) e `credit` conforme o produto.
5. **MDT/MDS**: entram só como hipsometria (imagem colorida); o relevo continua sendo o World Terrain. Legenda em gradiente (`min`, `max`, `tickValues`, `gradientStops` com as cores da rampa exportada) ou PNG em `public/legends/` + `legend: { type: "image", … }`. Os valores da legenda são do MDT do projeto; as cotas medidas no mapa vêm do World Terrain e não vão coincidir exatamente.
6. `npm.cmd run dev`: alinhamento sobre o Bing, opacidade, legenda, nenhum aviso de tiles ausentes.

## 1b. Enquadramento: bounds, Home e cenas

Logo depois de os rasters aparecerem no lugar certo:

1. Confirmar `developmentTools.cameraCapture: true` em `src/projects/<slug>.ts` (o script já gera assim) e rodar `npm.cmd run dev`.
2. No painel "Captura de câmera (dev)":
   - Enquadrar a área inteira do projeto vista de cima e clicar **Capturar bounds da vista**; colar `bounds: [...]` no arquivo do projeto. Isso liga o limite de navegação (margem padrão de 25%; ajuste com `navigation` se precisar).
   - Enquadrar a vista de abertura e clicar **Capturar Home**; colar `initialCamera: {...}`.
   - Para cada cena: criar a entrada em `scenes` (`id`, `label`, `layerIds`), recarregar, escolher a cena no seletor, enquadrar e clicar **Capturar cena**; colar `camera: {...}` dentro dela.
   - Com o limite ativo, use **Ignorar limite de navegação** para enquadrar vistas na borda e conferir a margem.
3. Recarregar e conferir: abertura, Home, cada cena, e que arrastar/afastar além da borda traz a câmera de volta. O console de `npm run dev` avisa se alguma vista configurada ficou fora do limite.
4. Desligar a flag: `cameraCapture: false`.

## 2. Modelo 3D (Metashape → Cesium ion)

As altitudes do Metashape estão em **H ortométrica** (SIRGAS 2000, MAPGEO). O Cesium (World Terrain, posicionamento e medições) trabalha com **h elipsoidal**. Relação: **h = H + N**, onde N é a ondulação geoidal no local. Sem correção, o modelo fica −N metros fora (no Sudeste N é negativo, então o modelo aparece acima do terreno).

1. Obter **N** no centro da área com o modelo do IBGE coerente com as altitudes usadas: MAPGEO2015 (altitudes ortométricas) ou hgeoHNOR2020 (altitudes normais do Reajuste 2018). Anotar valor, modelo, coordenada consultada e data.
2. Corrigir, nesta ordem de preferência:
   1. **No próprio asset** (preferido). Exportar do Metashape já em altura elipsoidal (CRS SIRGAS 2000 com o geoide aplicado, ou geográfico elipsoidal) antes do upload; ou, no ion, ajustar a altura do asset (*Adjust Tileset Location*) somando N. Registrar N e a fonte na descrição do asset no ion.
   2. **No WebGIS**, se o asset não puder ser corrigido:
      ```ts
      source: {
        format: "3d-tiles", source: "ion", assetId: 1234567, tokenEnv: "VITE_CESIUM_3D_TOKEN",
        // Exemplo: N = -5.83 m (MAPGEO2015/IBGE, consultado em <lon>, <lat> em <data>). h = H + N.
        heightOffsetMeters: -5.83,
      },
      ```
      `heightOffsetMeters` recebe **N com o sinal**. O offset é constante: vale para áreas pequenas, onde N quase não varia.
3. O ajuste de altura em desenvolvimento (`developmentTools.modelAlignment`) serve só para conferir visualmente; o valor configurado vem de N, não do ajuste visual.
4. Recorte opcional: `cropAuthoring: true` em dev, desenhar, copiar para `clipping`; decidir `terrainCutout`. Desligar as ferramentas de dev ao final.

## 3. Vetores (SHP/GeoJSON UTM SIRGAS 2000 → EPSG:4326)

GeoJSON exportado do Global Mapper em WGS84: use `npm.cmd run prepare-geojson` (ver `docs/NOVO-PROJETO.md`, etapa 10). Os passos abaixo valem para SHP ou GeoJSON em UTM.

1. Conferir o CRS de origem: `ogrinfo -so entrada.shp <camada>` (ex.: EPSG:31983 = SIRGAS 2000 / UTM 23S).
2. Reprojetar para GeoJSON lon/lat:
   ```powershell
   ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco RFC7946=YES -lco COORDINATE_PRECISION=7 -lco WRITE_NAME=NO saida.geojson entrada.shp
   ```
   - Sem `.prj`, informe a origem: `-s_srs EPSG:31983`.
   - Acentos quebrados em SHP antigo: acrescente `-oo ENCODING=CP1252`.
   - `-dim XY` remove o Z quando ele não for necessário. Curvas de nível guardam a cota em atributo.
   - Mantenha um atributo de ID estável. Use `uniqueFeatureIds: true` só se o `id` de origem se repetir: o template gera um id novo e guarda o original no atributo `source_id`, que pode ir para o popup (`{ property: "source_id", label: "ID de origem" }`).
3. **Simplificação opcional** (drenagem e curvas de nível grandes): simplificar ainda em UTM, onde a tolerância está em metros, e só depois reprojetar:
   ```powershell
   ogr2ogr -f GPKG simplificado.gpkg drenagem.shp -simplify 1
   ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco RFC7946=YES -lco COORDINATE_PRECISION=7 -lco WRITE_NAME=NO drenagem.geojson simplificado.gpkg
   ```
   Tolerância sugerida: 0,5–2 m conforme a escala; confira visualmente e confirme que `STRAHLER`/cota foram preservados. Arquivos acima de ~10 MB: medir tempo de carga no celular.
4. Upload: `aws s3 cp drenagem.geojson s3://<bucket>/<slug>/vetores/ --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com --content-type application/geo+json`.
5. Camada: `format: "geojson"`, `autoZoom: false` (senão o mapa dá zoom no vetor ao abrir), `style` (linhas com `zIndex` acima dos polígonos), `popup.fields`, `opacityControl` se precisar. Drenagem simulada: `kind: "drainage"` + `symbology: "simulated-drainage-strahler"`.

## 4. Finalização

1. Câmera: se o modelo 3D ou os vetores mudarem o enquadramento ideal, repetir a etapa 1b (ligar `cameraCapture`, recapturar, desligar).
2. Opcionais: `scenes`, `diagnostic.steps`, `temporalCampaign`/`temporalComparison`.
3. `npm.cmd run typecheck; npm.cmd run check; npm.cmd run build; npm.cmd run preview` — testar desktop e celular (drawer, legendas, popup, medições; GPS só em HTTPS).
4. Publicação (Vercel ou Cloudflare Pages), na raiz do domínio ou subdomínio: build `npm run build`, saída `dist`. Configurar `VITE_CESIUM_ION_TOKEN` e `VITE_CESIUM_3D_TOKEN` como variáveis de ambiente **de build** na plataforma (o `.env.local` não vai para o Git).
5. Pós-publicação: domínio final no CORS do R2 e nas *Allowed URLs* do token; abrir o site publicado e conferir console sem erros de CORS/token.
