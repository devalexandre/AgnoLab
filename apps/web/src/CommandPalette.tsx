import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  /** Extra words matched by the search but not shown (e.g. aliases, descriptions). */
  keywords?: string;
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}

/**
 * Subsequence fuzzy score: every query character must appear in order. Consecutive matches
 * and matches at word starts score higher, so "addag" ranks "Add Agent" above "Add Tag".
 * Returns -1 for no match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  let score = 0;
  let textIndex = 0;
  let previousMatch = -2;
  for (const char of q) {
    if (char === " ") continue;
    const found = t.indexOf(char, textIndex);
    if (found === -1) return -1;
    score += found === previousMatch + 1 ? 3 : 1;
    if (found === 0 || t[found - 1] === " " || t[found - 1] === ":") score += 2;
    previousMatch = found;
    textIndex = found + 1;
  }
  return score - t.length * 0.01;
}

export default function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const scored = commands
      .filter((command) => !command.disabled)
      .map((command) => ({
        command,
        score: query.trim()
          ? Math.max(fuzzyScore(query, command.label), fuzzyScore(query, `${command.group} ${command.label} ${command.keywords ?? ""}`) - 1)
          : 0,
      }))
      .filter((entry) => entry.score >= 0);
    if (query.trim()) {
      scored.sort((left, right) => right.score - left.score);
    }
    return scored.slice(0, 60).map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) {
    return null;
  }

  function runCommand(command: PaletteCommand | undefined) {
    if (!command) return;
    onClose();
    command.run();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  let previousGroup = "";
  return (
    <div className="command-palette-backdrop" onMouseDown={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command or search nodes and tools…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        />
        <ul className="command-palette-list" id={listId} role="listbox" ref={listRef}>
          {results.length === 0 ? <li className="command-palette-empty">No matching commands.</li> : null}
          {results.map((command, index) => {
            const showGroup = !query.trim() && command.group !== previousGroup;
            previousGroup = command.group;
            return (
              <li key={command.id} role="presentation">
                {showGroup ? <p className="command-palette-group">{command.group}</p> : null}
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-index={index}
                  className={`command-palette-item${index === activeIndex ? " is-active" : ""}`}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  tabIndex={-1}
                >
                  {command.icon ? <span className="command-palette-icon">{command.icon}</span> : null}
                  <span className="command-palette-label">
                    {query.trim() ? <small>{command.group}</small> : null}
                    {command.label}
                  </span>
                  {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="command-palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </footer>
      </div>
    </div>
  );
}
