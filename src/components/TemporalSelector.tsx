import { Fragment, useId, useState, type KeyboardEvent } from "react";
import type { LayerStatus, ProjectLayerConfig, TemporalComparisonSelection } from "../projects/types";
import { Icon } from "./icons";
import { campaignEntries, DEFAULT_TIMELINE_TITLE } from "./temporal";
import "./TemporalSelector.css";

interface Props {
  layers: ProjectLayerConfig[];
  visible: Set<string>;
  statuses: Record<string, LayerStatus>;
  onToggle: (id: string) => void;
  // While comparing, the markers choose the "Antes" (left) and "Depois" (right) periods.
  comparison?: TemporalComparisonSelection | null;
  onComparisonChange?: (selection: TemporalComparisonSelection) => void;
  onCompare?: () => void;
  onExitComparison?: () => void;
  // Heading (temporalLabels.timelineTitle); default "Evolução da paisagem".
  title?: string;
}

// Timeline over the map; renders nothing without campaigns. Markers call onToggle
// (one period at a time) or, while comparing, onComparisonChange. Spacing is
// uniform because campaigns are identified by year, without exact dates.
export function TemporalSelector({ layers, visible, statuses, onToggle, comparison, onComparisonChange, onCompare, onExitComparison, title = DEFAULT_TIMELINE_TITLE }: Props) {
  const headingId = useId();
  const [editing, setEditing] = useState<"left" | "right">("right");
  const campaigns = campaignEntries(layers);
  if (campaigns.length === 0) return null;
  const comparing = Boolean(comparison);

  function select(id: string) {
    if (comparison) {
      onComparisonChange?.({ ...comparison, [editing]: id });
      return;
    }
    // Selecting the active campaign keeps it on; the layer switch can turn it off.
    if (!visible.has(id)) onToggle(id);
  }

  function moveFocus(event: KeyboardEvent<HTMLOListElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".temporal-marker")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, index + (event.key === "ArrowRight" ? 1 : -1)))]?.focus();
  }

  return (
    <section className="temporal-timeline" aria-labelledby={headingId} data-comparing={comparing || undefined}>
      <div className="temporal-timeline-head">
        <h2 id={headingId}>{title}</h2>
        {comparison && <div className="temporal-edit" role="radiogroup" aria-label="Período definido pelos marcos">
          <span className="temporal-edit-label">Definir</span>
          <span className="temporal-seg">
            {(["left", "right"] as const).map(side => <label key={side} className="temporal-seg-opt">
              <input type="radio" name={headingId + "-edit"} checked={editing === side} onChange={() => setEditing(side)} />
              {side === "left" ? "Antes" : "Depois"}
            </label>)}
          </span>
        </div>}
        {(comparing || onCompare) && <button type="button" className="temporal-compare-button" aria-pressed={comparing}
          onClick={comparing ? onExitComparison : onCompare}>
          <Icon name="compare" size={16} />
          <span className="temporal-compare-long">{comparing ? "Sair da comparação" : "Comparar"}</span>
          <span className="temporal-compare-short">{comparing ? "Sair" : "Comparar"}</span>
        </button>}
      </div>
      <ol className="temporal-track" aria-label="Períodos disponíveis" onKeyDown={moveFocus}>
        {campaigns.map(campaign => {
          const isLeft = comparison?.left === campaign.id;
          const isRight = comparison?.right === campaign.id;
          const on = comparison ? isLeft || isRight : visible.has(campaign.id);
          const badge = isLeft && isRight ? "A·B" : isLeft ? "Antes" : isRight ? "Depois" : "";
          const status = statuses[campaign.id];
          return (
            <Fragment key={campaign.id}>
              <li className="temporal-stop">
                <button type="button" className="temporal-marker" aria-pressed={on} data-status={on ? status : undefined}
                  aria-label={`${campaign.year} — ${campaign.period}${badge ? ` (${badge})` : ""}`} title={campaign.description}
                  onClick={() => select(campaign.id)}>
                  <span className="temporal-marker-badge" aria-hidden="true">{badge}</span>
                  <span className="temporal-marker-dot" aria-hidden="true" />
                  <span className="temporal-marker-year" aria-hidden="true">{campaign.year}</span>
                  <span className="temporal-marker-period" aria-hidden="true">{campaign.period}</span>
                </button>
              </li>
              {campaign.eventAfter && <li className="temporal-event" title={campaign.eventAfter}>
                <Icon name="event" size={14} />
                <span className="visually-hidden">{campaign.eventAfter}</span>
              </li>}
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}
