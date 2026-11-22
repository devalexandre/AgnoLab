import { useEffect, useId, useRef, useState } from "react";
import { THEMES, getThemeDefinition, type ThemeId } from "./themes";

export interface ThemePickerProps {
  value: ThemeId;
  onChange: (themeId: ThemeId) => void;
  /** Opens the menu upward/left-aligned when the trigger sits at the bottom of the screen. */
  placement?: "bottom-end" | "top-start";
}

function ThemeSwatch({ themeId }: { themeId: ThemeId }) {
  const { tokens } = getThemeDefinition(themeId);
  return (
    <span
      className="theme-swatch"
      aria-hidden="true"
      style={{ background: `rgb(${tokens.backgroundRgb})`, borderColor: tokens.border }}
    >
      <span style={{ background: tokens.primary }} />
      <span style={{ background: tokens.accents[1] }} />
      <span style={{ background: tokens.accents[2] }} />
      <span style={{ background: tokens.accents[3] }} />
    </span>
  );
}

export default function ThemePicker({ value, onChange, placement = "bottom-end" }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const active = getThemeDefinition(value);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function handleListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div className={`theme-picker is-${placement}`} ref={rootRef}>
      <button
        type="button"
        className="secondary-button theme-picker-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="Change theme"
        onClick={() => setOpen((current) => !current)}
      >
        <ThemeSwatch themeId={active.id} />
        <span>{active.label}</span>
      </button>
      {open ? (
        <ul className="theme-picker-menu" id={menuId} role="menu" aria-label="Theme" ref={listRef} onKeyDown={handleListKeyDown}>
          {THEMES.map((theme) => (
            <li key={theme.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={theme.id === value}
                className={`theme-picker-option${theme.id === value ? " is-active" : ""}`}
                onClick={() => {
                  onChange(theme.id);
                  setOpen(false);
                }}
              >
                <ThemeSwatch themeId={theme.id} />
                <span className="theme-picker-option-text">
                  <strong>{theme.label}</strong>
                  <small>{theme.description}</small>
                </span>
                {theme.id === value ? <span className="theme-picker-check" aria-hidden="true">✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
