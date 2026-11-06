import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LegendConfig } from "../projects/types";
import { MOBILE_MEDIA_QUERY } from "./mobileTabs";
import "./Legend.css";

type LegendProps = LegendConfig & {
  visibility: boolean;
};

function LegendFrame({ title, image = false, children }: { title: string; image?: boolean; children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_MEDIA_QUERY);
    function updateMobile() {
      setMobile(query.matches);
      if (!query.matches) setExpanded(false);
    }
    updateMobile();
    query.addEventListener("change", updateMobile);
    return () => query.removeEventListener("change", updateMobile);
  }, []);

  useEffect(() => {
    if (!mobile || !expanded) return;
    function collapseOutside(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setExpanded(false);
    }
    function collapseOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    document.addEventListener("pointerdown", collapseOutside, true);
    document.addEventListener("keydown", collapseOnEscape);
    return () => {
      document.removeEventListener("pointerdown", collapseOutside, true);
      document.removeEventListener("keydown", collapseOnEscape);
    };
  }, [mobile, expanded]);

  const action = expanded ? "Toque para reduzir a legenda" : "Toque para ampliar a legenda";
  return (
    <section
      ref={containerRef}
      className={`raster-legend${image ? " raster-legend-image" : ""}${mobile && expanded ? " is-expanded" : ""}`}
      aria-label={mobile ? `${action}: ${title}` : `Legenda: ${title}`}
      role={mobile ? "button" : undefined}
      tabIndex={mobile ? 0 : undefined}
      aria-expanded={mobile ? expanded : undefined}
      title={mobile ? action : undefined}
      onClick={mobile ? () => setExpanded((current) => !current) : undefined}
      onKeyDown={mobile ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setExpanded((current) => !current);
        }
      } : undefined}
    >
      {children}
    </section>
  );
}

// Development only (see legendStatus.ts): a visible thematic raster without a
// supplied scale says so instead of showing nothing.
export function MissingLegend({ title, message }: { title: string; message: string }) {
  return (
    <section className="raster-legend raster-legend-missing" aria-label={`Legenda: ${title}`}>
      <h2 className="raster-legend-title">{title}</h2>
      <p>{message}</p>
    </section>
  );
}

export function Legend(props: LegendProps) {
  if (!props.visibility) return null;
  if (props.type === "image") {
    return (
      <LegendFrame title={props.title} image>
        <img src={props.imageUrl} alt={props.imageAlt} />
      </LegendFrame>
    );
  }

  const { title, min, max, tickValues, gradientStops, decimalPlaces } = props;
  const formatValue = (value: number) => decimalPlaces === undefined ? String(value) : value.toFixed(decimalPlaces);
  if (max <= min) return null;

  const gradient = [...gradientStops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(", ");

  return (
    <LegendFrame title={title}>
      <h2 className="raster-legend-title">{title}</h2>
      <div className="raster-legend-scale">
        <div className="raster-legend-gradient" aria-hidden="true" style={{ background: `linear-gradient(to top, ${gradient})` }} />
        {tickValues.filter((value) => value >= min && value <= max).map((value) => (
          <div key={value} className="raster-legend-tick" style={{ top: `${(max - value) / (max - min) * 100}%` }}>
            <span className="raster-legend-mark" aria-hidden="true" />
            <span>{formatValue(value)}</span>
          </div>
        ))}
      </div>
    </LegendFrame>
  );
}
