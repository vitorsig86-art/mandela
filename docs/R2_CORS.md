# CORS do Cloudflare R2

O WebGIS lê rasters (tiles PNG via fetch de blob) e GeoJSON (`Resource.fetchJson`) direto do R2. O navegador só entrega essas respostas ao Cesium se o bucket devolver `Access-Control-Allow-Origin` para a origem do site. Sem isso, a camada fica vazia e o console mostra erro de CORS.

## Política

`docs/r2-cors.json` libera leitura (`GET`, `HEAD`) para:

- `http://127.0.0.1:5173` — `npm run dev`
- `http://127.0.0.1:4173` — `npm run preview`
- `https://SEU-DOMINIO-FINAL` — **substitua** pelo domínio publicado, sem barra no final (ex.: `https://fazenda.cardeal.com.br`).

Se for testar deploys de preview (URLs temporárias da Vercel/Pages), acrescente essas origens ou use um bucket de teste. Não use `"*"` em `AllowedOrigins` para buckets com dados de cliente.

## Aplicar com a AWS CLI

```powershell
aws s3api put-bucket-cors `
  --bucket NOME-DO-BUCKET `
  --cors-configuration file://docs/r2-cors.json `
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com

aws s3api get-bucket-cors --bucket NOME-DO-BUCKET --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Use o mesmo perfil/credenciais do upload (`--profile` se aplicável). A política vale para o bucket inteiro, inclusive o domínio público personalizado.

## Pelo painel da Cloudflare (alternativa)

R2 → bucket → Settings → CORS Policy aceita o mesmo conteúdo **sem** o invólucro `CORSRules`, ou seja, apenas o array:

```json
[
  {
    "AllowedOrigins": ["http://127.0.0.1:5173", "http://127.0.0.1:4173", "https://SEU-DOMINIO-FINAL"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Verificar

```powershell
node scripts/raster-from-xml.cjs caminho\tilemapresource.xml --url https://DOMINIO-R2/projeto/orto --origin https://SEU-DOMINIO-FINAL
```

O script busca um tile do nível mínimo como cada origem e falha se não houver HTTP 200, `Content-Type` de imagem e `Access-Control-Allow-Origin` correspondente. Para GeoJSON:

```powershell
curl.exe -sI -H "Origin: http://127.0.0.1:5173" https://DOMINIO-R2/projeto/vetor.geojson
```

A resposta deve conter `access-control-allow-origin: http://127.0.0.1:5173`. Se arquivos já tinham sido acessados antes da política e a resposta em cache não traz o cabeçalho, limpe o cache do domínio na Cloudflare.
