import type { DiagnosticStep } from "../projects/types";
import "./DiagnosticJourney.css";

interface Props {
  steps: DiagnosticStep[];
  stepIndex: number;
  onStepChange: (index: number) => void;
  onExplore: () => void;
}

export function DiagnosticJourney({ steps, stepIndex, onStepChange, onExplore }: Props) {
  const step = steps[stepIndex];
  const lastStep = stepIndex === steps.length - 1;
  if (!step) return null;

  return (
    <section className="diagnostic-journey" aria-label="Diagnóstico do projeto">
      <div className="diagnostic-content" tabIndex={0} aria-live="polite" aria-atomic="true">
        <p className="diagnostic-progress">Etapa {stepIndex + 1} de {steps.length}</p>
        <h2>{step.title}</h2>
        <p className="diagnostic-text">{step.text}</p>
        {step.facts && <dl className="diagnostic-facts">
          {step.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
        </dl>}
        {step.references && <div className="diagnostic-references">
          <p>Referências</p>
          <ul>{step.references.map(reference => <li key={reference}>{reference}</li>)}</ul>
        </div>}
      </div>
      <div className="diagnostic-actions">
        <button type="button" disabled={stepIndex === 0} onClick={() => onStepChange(stepIndex - 1)}>Anterior</button>
        <button type="button" className="diagnostic-next" onClick={() => lastStep ? onExplore() : onStepChange(stepIndex + 1)}>
          {lastStep ? "Explorar livremente" : "Próximo"}
        </button>
      </div>
    </section>
  );
}
