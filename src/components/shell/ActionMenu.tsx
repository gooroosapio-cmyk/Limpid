"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";

export interface ActionItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * Menu « … » (prompt « Fluidité », § 8) : popover ancré à son bouton, bord fin et ombre douce,
 * lignes régulières de 44 px. Fermeture par un toucher extérieur ou Échap (le focus revient au
 * bouton) ; flèches haut/bas entre les actions. Seules les actions destructives sont en rouge.
 */
export function ActionMenu({ label, items, align = "end" }: { label: string; items: ActionItem[]; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="am" ref={root} onKeyDown={open ? onKey : undefined}>
      <button
        ref={trigger}
        type="button"
        className="icon-button am-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" size={20} />
      </button>
      {open && (
        <ul id={id} ref={list} role="menu" aria-label={label} className={`am-list am-${align}`}>
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={`am-item${it.danger ? " is-danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                  it.onSelect();
                }}
              >
                {it.icon && <Icon name={it.icon} size={20} />}
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
