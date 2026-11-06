import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import "./EmbeddedPageOverlay.css";

interface Props {
  url: string;
  title: string;
  onClose: () => void;
}

// Full-screen page over the map (e.g. a 3D plot simulation). The URL was
// already checked against ProjectConfig.embeddedPages.allowedOrigins.
export default function EmbeddedPageOverlay({ url, title, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [onClose]);
  return (
    <section className="embedded-page" role="dialog" aria-modal="true" aria-label={title}>
      <header className="embedded-page-bar">
        <button ref={closeRef} type="button" className="embedded-page-back" onClick={onClose}><Icon name="chevronLeft" size={16} />Voltar ao mapa</button>
        <strong>{title}</strong>
        <a className="embedded-page-tab" href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em nova aba">Abrir em nova aba ↗</a>
      </header>
      {!loaded && <p className="embedded-page-loading" role="status">Carregando…</p>}
      <iframe src={url} title={title} onLoad={() => setLoaded(true)} allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />
    </section>
  );
}
