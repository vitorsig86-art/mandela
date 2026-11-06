import type { ProjectConfig, ProjectLayerConfig } from "../projects/types";
import { isTemporalLayer } from "../projects/layerVisibility";

export const DEFAULT_TIMELINE_TITLE = "Evolução da paisagem";

export interface CampaignEntry {
  id: string;
  label: string;
  description: string;
  year: string;
  period: string;
  eventAfter?: string;
}

// comparisonLabel "2024 — Pré-obra" becomes year "2024" and period "Pré-obra";
// without it the campaign label and description are used as they are.
export function campaignEntries(layers: ProjectLayerConfig[]): CampaignEntry[] {
  return layers.filter(isTemporalLayer).map(layer => {
    const campaign = layer.temporalCampaign;
    const [year, period] = campaign.comparisonLabel?.split(" — ") ?? [];
    return {
      id: layer.id,
      label: campaign.label,
      description: campaign.description,
      year: period ? year : campaign.label,
      period: period ?? campaign.description,
      eventAfter: campaign.eventAfter,
    };
  });
}

// Comparison needs two campaigns and a preset that points at them.
export function canCompare(project: ProjectConfig) {
  const ids = new Set(campaignEntries(project.layers).map(entry => entry.id));
  const preset = project.temporalComparison;
  return ids.size >= 2 && preset !== undefined && ids.has(preset.left) && ids.has(preset.right);
}
