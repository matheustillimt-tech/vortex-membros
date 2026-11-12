"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Item de menu. */
const ITEM =
  "flex items-center gap-2 px-2 py-1.5 w-full focus:outline-hidden select-none rounded-md text-start text-sm font-medium disabled:opacity-50";
const ITEM_TONE = {
  default: "text-zinc-800 hover:bg-zinc-50 focus-visible:bg-zinc-50 [&>svg]:text-zinc-400",
  danger: "text-red-600 hover:bg-red-50 focus-visible:bg-red-50 [&>svg]:text-current",
} as const;

export function MenuItem({
  onSelect,
  icon,
  children,
  tone = "default",
  active = false,
  disabled = false,
}: {
  onSelect: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: keyof typeof ITEM_TONE;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-active={active ? "" : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={`${ITEM} ${ITEM_TONE[tone]} ${active ? "bg-zinc-50" : ""}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

/** Item de menu que navega (Link). */
export function MenuLink({ href, icon, children, active = false }: { href: string; icon?: React.ReactNode; children: React.ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      role="menuitem"
      data-active={active ? "" : undefined}
      aria-current={active ? "page" : undefined}
      className={`${ITEM} ${ITEM_TONE.default} ${active ? "bg-zinc-50" : ""}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

export function MenuSeparator() {
  return (
    <div className="-mx-[.3125rem] my-[.3125rem] h-px" role="none">
      <div className="h-px w-full bg-zinc-800/15" />
    </div>
  );
}

/**
 * Dropdown (min-w-48, p-[.3125rem], rounded-lg, shadow-xs, borda zinc-200).
 * `trigger` recebe as props do botão; os itens fecham o menu ao serem escolhidos.
 */
export function Dropdown({
  trigger,
  children,
  align = "end",
}: {
  trigger: (props: {
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    onClick: (e: React.MouseEvent) => void;
  }) => React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Menu flutuante (position: fixed ancorado no botão), como um menu suspenso: não é cortado
  // por listas com overflow (.lista-corpo usa overflow: clip). Abre para cima se faltar espaço.
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const h = menuRef.current?.offsetHeight ?? 0;
    const below = window.innerHeight - r.bottom;
    const top = below < h + 8 && r.top > below ? r.top - h - 4 : r.bottom + 4;
    setPos(align === "end" ? { top, right: window.innerWidth - r.right } : { top, left: r.left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll(e: Event) {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      {trigger({
        "aria-haspopup": "menu",
        "aria-expanded": open,
        onClick: (e) => {
          e.stopPropagation();
          setPos(null);
          setOpen((v) => !v);
        },
      })}
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          data-menu-flutuante=""
          style={pos ?? { visibility: "hidden" }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false);
          }}
          className="fixed z-50 min-w-48 rounded-lg border border-zinc-200 bg-white p-[.3125rem] shadow-xs focus:outline-hidden"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
