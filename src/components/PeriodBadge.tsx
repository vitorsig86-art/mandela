import type { LayerStatus, ProjectLayerConfig } from "../projects/types";
import { campaignEntries } from "./temporal";
import "./PeriodBadge.css";

interface Props {
  layers: ProjectLayerConfig[];
  visible: Set<string>;
  statuses: Record<string, LayerStatus>;
  // Name of the temporal switch in the panel (temporalLabels.layerName).
  layerName: string;
}

// Period shown on the map. Reads the visibility and status state only; it
// never changes layers. Without campaigns it renders nothing.
export function PeriodBadge({ layers, visible, statuses, layerName }: Props) {
  const campaigns = campaignEntries(layers);
  if (campaigns.length === 0) return null;
  const active = campaigns.find(campaign => visible.has(campaign.id));
  const status = active ? statuses[active.id] : undefined;
  const tone = status === "error" ? "error" : status === "loading" || (active && !status) ? "loading" : "ready";
  const detail = !active ? `Ative “${layerName}” em Camadas`
    : tone === "loading" ? `Carregando ${active.year}…`
    : tone === "error" ? "Campanha indisponível. Verifique a fonte e a conexão."
    : active.description;

  return (
    <div className="period-badge" role="status" aria-live="polite" aria-atomic="true" data-tone={active ? tone : "empty"}>
      <span className="period-badge-year">{active ? active.year : "—"}</span>
      <span className="period-badge-copy">
        <strong>{active ? active.period : "Nenhum período ativo"}</strong>
        <span className="period-badge-detail">{detail}</span>
      </span>
    </div>
  );
}
