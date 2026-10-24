"use client";

import { useEffect, useRef, useState } from "react";

export type FilterOption = { value: string; label: string };
export type FilterGroup = { label?: string; options: FilterOption[] };

/** Short filter lists. Same pill as the public roles page. */
export function FilterPills({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`filter-chip ${selected ? "active" : ""}`}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Long filter lists (vacantes, etapas). A pill opens a list.
 * It is not a native select.
 */
export function FilterMenu({
  value,
  onChange,
  groups,
  ariaLabel,
  idleValue = "all",
}: {
  value: string;
  onChange: (value: string) => void;
  groups: FilterGroup[];
  ariaLabel: string;
  idleValue?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const options = groups.flatMap((group) => group.options);
  const current = options.find((option) => option.value === value)?.label ?? "Elegir";

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={`filter-chip ${value !== idleValue ? "active" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((next) => !next)}
      >
        {current}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 z-40 mt-2 max-h-72 min-w-[220px] max-w-[320px] overflow-auto rounded-ts-md border border-ts-hairline bg-ts-surface py-1 shadow-[var(--ts-shadow)]"
        >
          {groups.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label && (
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-ts-ink-mute">
                  {group.label}
                </div>
              )}
              {group.options.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`block w-full px-3 py-2 text-left text-[13px] hover:bg-ts-canvas ${
                      selected ? "text-ts-accent-deep" : "text-ts-ink"
                    }`}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
