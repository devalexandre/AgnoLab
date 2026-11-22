// Shared building blocks for the node inspector panels.

/** A property label with an optional required mark and a "?" help tooltip. */
export function renderInspectorPropertyLabel(label: string, helper: string, required = false) {
  return (
    <span className="field-label-row">
      <span>
        {label}
        {required ? <span className="required-mark">*</span> : null}
      </span>
      <div className="property-help">
        <button type="button" className="help-button" onClick={(event) => event.preventDefault()}>
          ?
        </button>
        <div className="help-tooltip">
          <strong>{label}</strong>
          <p>{helper}</p>
        </div>
      </div>
    </span>
  );
}

