import { useEffect, useState } from "react";
import { listScheduleStatuses } from "../api";
import type { ScheduleStatus } from "../types";
import { fieldValueAsString } from "../utils";
import { renderInspectorPropertyLabel } from "./fields";

const CRON_PRESETS = [
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 09:00", value: "0 9 * * *" },
  { label: "Weekdays at 09:00", value: "0 9 * * 1-5" },
  { label: "Mondays at 08:00", value: "0 8 * * 1" },
  { label: "First day of the month", value: "0 9 1 * *" },
];

const COMMON_TIMEZONES = ["UTC", "America/Sao_Paulo", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Lisbon", "Europe/Berlin", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney"];

export interface ScheduleInputInspectorProps {
  nodeId: string;
  flowName: string;
  extras: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}

function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Input node settings for a cron-scheduled flow, with the live status of the saved schedule. */
export default function ScheduleInputInspector({ nodeId, flowName, extras, onChange }: ScheduleInputInspectorProps) {
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const cron = fieldValueAsString(extras.scheduleCron);
  const timezone = fieldValueAsString(extras.scheduleTimezone) || "UTC";
  const enabled = extras.scheduleEnabled !== false;
  const timezones = COMMON_TIMEZONES.includes(timezone) ? COMMON_TIMEZONES : [timezone, ...COMMON_TIMEZONES];

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listScheduleStatuses(flowName)
        .then((statuses) => {
          if (cancelled) return;
          setStatus(statuses.find((candidate) => candidate.node_id === nodeId) ?? null);
          setStatusError(null);
        })
        .catch((error: unknown) => !cancelled && setStatusError(error instanceof Error ? error.message : String(error)));
    void load();
    const interval = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [flowName, nodeId]);

  return (
    <>
      <label>
        {renderInspectorPropertyLabel("Run Input", "Text sent to the flow on every scheduled run (and when you run it from the canvas).")}
        <textarea value={fieldValueAsString(extras.inputText)} onChange={(event) => onChange({ inputText: event.target.value })} />
      </label>
      <label>
        {renderInspectorPropertyLabel("Cron Expression", "Five fields: minute hour day-of-month month day-of-week. Example: 0 9 * * 1-5 runs weekdays at 09:00.", true)}
        <input className="code-input-inline" value={cron} placeholder="0 9 * * 1-5" onChange={(event) => onChange({ scheduleCron: event.target.value })} />
      </label>
      <div className="preset-chips" role="group" aria-label="Cron presets">
        {CRON_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={`chip-button${cron === preset.value ? " is-active" : ""}`}
            onClick={() => onChange({ scheduleCron: preset.value })}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label>
        {renderInspectorPropertyLabel("Time Zone", "IANA time zone the cron expression is evaluated in.")}
        <select value={timezone} onChange={(event) => onChange({ scheduleTimezone: event.target.value })}>
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={enabled} onChange={(event) => onChange({ scheduleEnabled: event.target.checked })} />
        {renderInspectorPropertyLabel("Enabled", "Pause the schedule without deleting it.")}
      </label>

      <div className={`info-note schedule-status is-${status?.status ?? "unsaved"}`}>
        <p>
          <strong>Schedule status</strong>
        </p>
        {status ? (
          <>
            <p>
              {status.status === "invalid" ? "Invalid: " : ""}
              {status.status === "invalid" ? status.last_error : `Status: ${status.status}`}
            </p>
            {status.status !== "invalid" ? (
              <>
                <p>Next run: {status.enabled ? formatWhen(status.next_run_at) : "paused"}</p>
                <p>
                  Last run: {formatWhen(status.last_run_at)} · runs: {status.run_count}
                </p>
                {status.last_error ? <p className="schedule-error">Last error: {status.last_error}</p> : null}
              </>
            ) : null}
          </>
        ) : (
          <p>{statusError ? `Could not load status: ${statusError}` : "Save the flow to start this schedule. The API runs it in the background."}</p>
        )}
      </div>
    </>
  );
}
