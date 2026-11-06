// Browser tab title: "<project name> | Cardeal Map", or the brand alone.
export function appTitle(projectName?: string): string {
  const name = projectName?.trim();
  return name ? `${name} | Cardeal Map` : "Cardeal Map";
}
