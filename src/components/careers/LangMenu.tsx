"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "@/i18n/context";
import { LOCALE_CHOICES, type Locale } from "@/i18n/locales";

export default function LangMenu({ placement = "down" }: { placement?: "down" | "up" }) {
  const { locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = LOCALE_CHOICES.find((choice) => choice.id === locale) ?? LOCALE_CHOICES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (id: Locale) => {
    setLocale(id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onListKey = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
    if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    }
    if (event.key === "End") {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  };

  return (
    <div className={`ts-lang${placement === "up" ? " ts-lang-up" : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ts-lang-btn"
        aria-label={t.ui.language}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        {current.label}
      </button>
      {open ? (
        <ul id={listId} className="ts-lang-menu" role="listbox" aria-label={t.ui.language} onKeyDown={onListKey}>
          {LOCALE_CHOICES.map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                role="option"
                aria-selected={choice.id === locale}
                lang={choice.htmlLang}
                onClick={() => choose(choice.id)}
              >
                {choice.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
