import type { Viewer } from "cesium";
import { useMeasurements } from "../hooks/useMeasurements";
import type { MeasurementTool } from "../cesium/measurementUtils";
import { Icon, type IconName } from "./icons";
import "./MeasurementToolbar.css";

const tools: { id: MeasurementTool; label: string; icon: IconName; help: string }[] = [
  { id: "coordinates", label: "Coordenadas", icon: "coordinates", help: "Clique numa superfície para obter as coordenadas." },
  { id: "distance", label: "Distância", icon: "ruler", help: "Clique para adicionar pontos. Enter ou duplo clique finaliza." },
  { id: "area", label: "Área", icon: "area", help: "Selecione pelo menos 3 pontos. Enter ou duplo clique finaliza." },
  { id: "height", label: "Diferença de cota", icon: "height", help: "Selecione os pontos A e B para medir ΔZ = B − A." },
];

// Datum notes, kept complete but one tap away ("Sobre as altitudes").
export const heightNote = "Cotas: alturas elipsoidais WGS84 obtidas das posições cartesianas do Cesium, sem conversão geoidal. No terreno, vêm do Cesium World Terrain, não do MDT do projeto (o MDT é só uma imagem colorida); no modelo 3D, da malha exibida. Referencial vertical do modelo não confirmado; sem garantia de precisão altimétrica absoluta. Horizontal: plano ENU no ponto médio (até 10 km). 3D: linha reta, sem acompanhar o relevo.";
export const altitudeNote = "Altitudes elipsoidais (m) do Cesium World Terrain ou do modelo 3D, não do MDT do projeto. Área horizontal geográfica, sem relevo.";

export function MeasurementToolbar({ viewer, disabled = false }: { viewer: Viewer | null; disabled?: boolean }) {
  const measurements = useMeasurements(viewer);
  const unavailable = disabled || !measurements.ready || !viewer || viewer.isDestroyed();
  const selected = tools.find((tool) => tool.id === measurements.active);
  return (
    <section className="measurement-controls" aria-label="Medições">
      <div className="measurement-toolbar" role="group" aria-label="Ferramentas de medição">
        {tools.map((tool) => <button key={tool.id} type="button" title={tool.label} aria-label={tool.label} aria-pressed={measurements.active === tool.id} disabled={unavailable} onClick={() => measurements.select(tool.id)}>
          <Icon name={tool.icon} />
        </button>)}
        <button type="button" title="Limpar medições" aria-label="Limpar medições" disabled={unavailable} onClick={measurements.clear}>
          <Icon name="trash" />
        </button>
      </div>
      {(selected || measurements.message || measurements.result) && <div className="measurement-readout">
        {selected && <><strong>{selected.label}</strong><p className="measurement-help">{selected.help} Esc cancela.</p></>}
        {measurements.result && <output>{measurements.result}</output>}
        <p className="measurement-message" role="status">{measurements.message}</p>
        <p className="measurement-count">
          {measurements.pointCount > 0 && <span>{measurements.pointCount} ponto(s) · </span>}
          <span>{measurements.completed} medição(ões)</span>
        </p>
        <details className="measurement-notes">
          <summary><Icon name="info" size={16} />Sobre as altitudes</summary>
          <small>{selected?.id === "height" || measurements.result.startsWith("Cota A:") ? heightNote : altitudeNote}</small>
        </details>
        {selected && <div className="measurement-actions">
          {(selected.id === "distance" || selected.id === "area") && <button type="button" onClick={measurements.finish} disabled={unavailable}>Finalizar</button>}
          <button type="button" onClick={measurements.cancel}>Cancelar</button>
        </div>}
      </div>}
    </section>
  );
}
