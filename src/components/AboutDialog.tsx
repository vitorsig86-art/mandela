import { useEffect, useRef } from "react";
import type { ProjectConfig } from "../projects/types";
import { Icon } from "./icons";
import { getWorkspaceSections } from "./LayerPanel";
import { legendMissing } from "./legendStatus";
import { altitudeNote, heightNote } from "./MeasurementToolbar";
import { campaignEntries, canCompare } from "./temporal";

interface Props {
  project: ProjectConfig;
  open: boolean;
  onClose: () => void;
}

// "Sobre os dados": notes that would otherwise be spread over the interface.
// Everything here is read from the project configuration; nothing is inferred
// from the imagery.
export function AboutDialog({ project, open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const campaigns = campaignEntries(project.layers);
  const models = project.layers.filter(layer => layer.source.format === "3d-tiles");
  const withoutLegend = project.layers.filter(layer => legendMissing(layer));
  const sections = getWorkspaceSections(project.layers, project.panel?.sectionOrder, project.panel?.sectionTitles).filter(section => section.layers.length > 0);

  return (
    <dialog ref={dialogRef} className="about-dialog" aria-labelledby="about-title" onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="about-dialog-body">
        <header>
          <h2 id="about-title">Sobre os dados</h2>
          <button type="button" className="about-close" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
        </header>
        <p>{project.name} — {project.location}. Visualização geoespacial 3D com {project.layers.length} {project.layers.length === 1 ? "camada" : "camadas"}.</p>

        {campaigns.length > 0 && <>
          <h3>Registros temporais</h3>
          <ul>{campaigns.map(campaign => <li key={campaign.id}><strong>{campaign.year}</strong> · {campaign.period} — {campaign.description}</li>)}</ul>
          {campaigns.some(campaign => campaign.eventAfter) && <p>{campaigns.filter(campaign => campaign.eventAfter).map(campaign => campaign.eventAfter).join(". ")}.</p>}
          <p>A régua usa espaçamento uniforme: as campanhas são identificadas pelo ano, sem data exata.</p>
        </>}

        {models.length > 0 && <>
          <h3>Modelo 3D</h3>
          <ul>{models.map(layer => <li key={layer.id}>{layer.name} — {layer.description}</li>)}</ul>
          {canCompare(project) && <p>Na comparação temporal, só as imagens são divididas; o modelo, quando ligado, cobre as duas metades.</p>}
        </>}

        <h3>Camadas</h3>
        <ul>{sections.map(section => <li key={section.id}>{section.title}: {section.layers.length} {section.layers.length === 1 ? "camada" : "camadas"}</li>)}</ul>
        {import.meta.env.DEV && withoutLegend.length > 0 && <p>Sem legenda fornecida: {withoutLegend.map(layer => layer.name).join(", ")}.</p>}

        <h3>Medições</h3>
        <p>{altitudeNote}</p>
        <p>{heightNote}</p>

        <h3>Créditos</h3>
        <p>As atribuições de imagens e dados aparecem no rodapé do mapa, junto aos créditos do Cesium.</p>
      </div>
    </dialog>
  );
}
