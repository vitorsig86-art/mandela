import type { ImageryProvider, TileProviderError } from "cesium";
import type { ProjectLayerConfig } from "../projects/types";

function getHttpStatus(error: unknown): number | undefined {
  const pending = [error];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const value = pending.shift();
    if (typeof value !== "object" || value === null || visited.has(value)) continue;
    visited.add(value);
    for (const key of ["statusCode", "status"] as const) {
      if (!(key in value)) continue;
      const status = (value as Record<string, unknown>)[key];
      const code = typeof status === "number" ? status
        : typeof status === "string" && /^\d{3}$/.test(status) ? Number(status) : undefined;
      if (code !== undefined && Number.isInteger(code) && code >= 100 && code <= 599) return code;
    }
    for (const key of ["error", "cause", "response"] as const) {
      if (key in value) pending.push((value as Record<string, unknown>)[key]);
    }
  }
  return undefined;
}

export function createImageryTileErrorHandler(
  layer: ProjectLayerConfig,
  onWarning: (message: string) => void,
  development: boolean,
  provider?: ImageryProvider,
) {
  let reportedMissingTile = false;
  const isRaster = layer.source.format === "xyz" || layer.source.format === "tms";
  let hasUsableTile = false;
  let disposed = false;
  let missingTimer: ReturnType<typeof setTimeout> | undefined;
  const missingTiles = new Set<string>();
  const originalRequestImage = provider?.requestImage;

  // Error events alone cannot distinguish a sparse footprint from a URL that
  // returns 404 for every tile. Observe success without changing the request,
  // its arguments, returned promise, throttling, or Cesium's rejection path.
  const observeRequestImage: ImageryProvider["requestImage"] = function (this: ImageryProvider, ...args) {
    const result = originalRequestImage!.apply(this, args);
    if (result) void Promise.resolve(result).then((image) => {
      if (disposed || !image) return;
      hasUsableTile = true;
      missingTiles.clear();
      if (missingTimer !== undefined) clearTimeout(missingTimer);
      missingTimer = undefined;
    }, () => { /* Cesium still handles the original rejection. */ });
    return result;
  };
  if (isRaster && provider) provider.requestImage = observeRequestImage;

  const handleError = (tileError: TileProviderError) => {
    if (disposed) return;
    if (layer.source.format === "ion-world-imagery") {
      // Basemap fallback is handled by useProjectLayers. Avoid logging URLs/errors
      // from authenticated providers, which may contain credentials.
      console.warn("Basemap tile request failed", { x: tileError.x, y: tileError.y, level: tileError.level });
      onWarning("Não foi possível carregar os tiles do OpenStreetMap. Verifique a conexão.");
      return;
    }
    const statusCode = getHttpStatus(tileError.error);

    // A confirmed missing *tile* is recoverable, regardless of layer ID.
    // Provider-level/opaque errors must not enter this path.
    if (isRaster && (statusCode === 404 || statusCode === 410)
      && Number.isInteger(tileError.x) && tileError.x >= 0
      && Number.isInteger(tileError.y) && tileError.y >= 0
      && Number.isInteger(tileError.level) && tileError.level >= 0) {
      tileError.retry = false;
      if (development && !reportedMissingTile) {
        console.debug(`${layer.name}: missing footprint tile (HTTP ${statusCode}); additional misses are suppressed.`, {
          x: tileError.x,
          y: tileError.y,
          level: tileError.level,
          urlTemplate: ("url" in layer.source ? layer.source.url : undefined),
        });
        reportedMissingTile = true;
      }
      if (provider && !hasUsableTile && missingTiles.size < 32) {
        missingTiles.add(`${tileError.level}/${tileError.x}/${tileError.y}`);
        // Thirty-two distinct missing tiles and a 15-second grace period with
        // zero successful images indicate an unusable source, not one edge gap.
        // Any successful tile cancels this diagnostic for the provider's life.
        if (missingTiles.size === 32 && missingTimer === undefined) {
          missingTimer = setTimeout(() => {
            missingTimer = undefined;
            if (disposed || hasUsableTile) return;
            console.warn(`No usable imagery loaded for ${layer.name} after repeated missing tiles.`);
            onWarning(`Nenhum tile de ${layer.name} foi carregado após repetidas respostas 404/410. Verifique a URL, o endereçamento dos tiles e a cobertura da fonte.`);
          }, 15000);
        }
      }
      return;
    }

    console.warn(`Tile loading failed for ${layer.name}`, {
      urlTemplate: ("url" in layer.source ? layer.source.url : undefined),
      x: tileError.x,
      y: tileError.y,
      level: tileError.level,
      statusCode,
      message: tileError.message,
      error: tileError.error,
    });
    onWarning(`Não foi possível carregar ${layer.name}. Verifique a URL, o endereçamento dos tiles, a conexão e o CORS do servidor.`);
  };

  return Object.assign(handleError, {
    dispose() {
      disposed = true;
      if (missingTimer !== undefined) clearTimeout(missingTimer);
      if (provider && provider.requestImage === observeRequestImage) provider.requestImage = originalRequestImage!;
      missingTiles.clear();
    },
  });
}
