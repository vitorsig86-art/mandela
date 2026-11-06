import "./ModeSwitcher.css";

export type MapMode = "explore" | "diagnostic";

interface Props {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
}

export function ModeSwitcher({ mode, onChange }: Props) {
  return (
    <div className="mode-switcher" role="group" aria-label="Modo de uso do mapa">
      <button type="button" aria-pressed={mode === "explore"} onClick={() => onChange("explore")}>Explorar</button>
      <button type="button" aria-pressed={mode === "diagnostic"} onClick={() => onChange("diagnostic")}>Diagnóstico</button>
    </div>
  );
}
