// Prints the development-only capture workflow, never reads credentials.
console.log(`Set developmentTools.cameraCapture: true in src/projects/<slug>.ts (template: template.ts).
Start npm run dev. The "Captura de câmera (dev)" panel copies ready-to-paste snippets:
  Capturar Home              -> initialCamera
  Capturar cena              -> camera of the selected scene
  Capturar bounds da vista   -> bounds [W, S, E, N] (navigation limit)
"Ignorar limite de navegação" lets you frame views at the edge of the limit.
Console alternative (prints initialCamera JSON):
  window.dispatchEvent(new Event("cardeal:capture-camera"))
Angles are degrees; height is meters above the ellipsoid. Turn the flag off when done.
The panel and the console listener are excluded from production builds.`);
