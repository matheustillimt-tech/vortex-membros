"use client";

import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from "./color";
import { INPUT_CLASS } from "./input";
import { DirtyContext } from "./settings-form";

const SWATCH_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Valor enviado: o hex normalizado quando válido; senão o texto como está (o servidor recusa). */
export function submittedColor(text: string): string {
  const n = normalizeHex(text);
  return n === null ? text.trim().toUpperCase() : n;
}

/**
 * Seletor de cor do painel: amostra xadrez que abre o painel (saturação/brilho + matiz + hex)
 * e o texto #HEX ao lado. O `name` vai num input hidden. Vazio = sem cor própria.
 */
export function ColorField({
  name,
  defaultValue,
  value: controlled,
  onChange,
}: {
  name: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const markDirty = useContext(DirtyContext);
  const [own, setOwn] = useState(defaultValue ?? "");
  const value = controlled ?? own;
  const [open, setOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);

  function set(next: string) {
    if (controlled === undefined) setOwn(next);
    onChange?.(next);
    markDirty();
  }

  const swatch = SWATCH_RE.test(value) ? value : "transparent";
  return (
    <div className="relative">
      <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
        <button
          ref={swatchRef}
          type="button"
          aria-label="Escolher cor"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="cor-xadrez h-6 w-8 shrink-0 cursor-pointer overflow-hidden rounded border border-black/10 shadow-inner"
        >
          <span className="block h-full w-full" style={{ background: swatch }} />
        </button>
        <input
          type="text"
          value={value}
          maxLength={7}
          placeholder="#E91E63"
          spellCheck={false}
          autoComplete="off"
          aria-label="Cor"
          onChange={(e) => set(e.target.value.toUpperCase())}
          onBlur={() => {
            const n = normalizeHex(value);
            if (n !== null && n !== value) set(n);
          }}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-hint text-gray-600 outline-none focus:ring-0 uppercase"
        />
      </div>
      <input type="hidden" name={name} value={submittedColor(value)} />
      {open ? <ColorPanel anchor={swatchRef} value={value} onPick={set} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ColorPanel({
  anchor,
  value,
  onPick,
  onClose,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  value: string;
  onPick: (hex: string) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(normalizeHex(value) || "#E91E63"));
  const [hex, setHex] = useState(() => normalizeHex(value) || "");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const p = panel.current;
    if (!a || !p) return;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    let top = a.bottom + 8;
    if (top + h > window.innerHeight - 8 && a.top - 8 - h > 8) top = a.top - 8 - h;
    const left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8));
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        anchor.current?.focus();
      }
    }
    function onMove(e: Event) {
      if (e.target instanceof Node && panel.current?.contains(e.target)) return;
      onClose(); // painel é fixed: fecha se a página rolar ou redimensionar
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [anchor, onClose]);

  function apply(next: Hsv) {
    setHsv(next);
    const h = hsvToHex(next);
    setHex(h);
    onPick(h);
  }

  function fromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const r = area.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    apply({ h: hsv.h, s, v });
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Escolher cor"
      className="fixed z-[60] w-60 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
    >
      <div
        ref={area}
        className="relative h-32 w-full cursor-crosshair touch-none rounded-lg"
        style={{ background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${Math.round(hsv.h)},100%,50%))` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
      >
        <span
          className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        aria-label="Matiz"
        value={Math.round(hsv.h)}
        onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })}
        className="cor-matiz mt-3 w-full"
      />
      <label className="mt-3 block">
        <span className="text-micro font-semibold uppercase tracking-wider text-gray-400">Hex</span>
        <input
          type="text"
          value={hex}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            const t = e.target.value.toUpperCase();
            setHex(t);
            const n = normalizeHex(t);
            if (n) {
              setHsv(hexToHsv(n));
              onPick(n);
            }
          }}
          className={`${INPUT_CLASS} mt-1 uppercase`}
        />
      </label>
    </div>
  );
}

const SUGGESTED = ["#ff005c", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#2563eb", "#7c3aed", "#d946ef", "#1f2937"];

/** Seletor de cor + cores sugeridas (telas de aparência). Clicar numa sugestão aplica a cor e marca o form. */
export function ColorWithSuggestions({
  name,
  defaultValue,
  onChange,
}: {
  name: string;
  defaultValue: string | null;
  onChange?: (value: string) => void;
}) {
  const markDirty = useContext(DirtyContext);
  const [value, setValue] = useState(defaultValue ?? "");
  function set(v: string) {
    setValue(v);
    onChange?.(v);
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-56 max-w-full">
        <ColorField name={name} value={value} onChange={set} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Cores sugeridas">
        {SUGGESTED.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={c}
            onClick={() => {
              set(c.toUpperCase());
              markDirty();
            }}
            className="h-6 w-6 rounded-full transition-transform ring-1 ring-inset ring-black/10 hover:scale-110"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
