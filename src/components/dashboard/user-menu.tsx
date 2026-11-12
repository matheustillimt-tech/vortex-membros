"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, EyeIcon, LogOutIcon, UserIcon } from "./icons";

const STUDENT_HOME = "/area/vitrine/home";

const itemClass =
  "flex items-center gap-2.5 px-2 py-1.5 w-full focus:outline-hidden select-none rounded-md text-start text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:bg-zinc-50";

function Avatar({ initial, size }: { initial: string; size: "md" | "sm" }) {
  return (
    <div
      className={`relative isolate flex flex-none items-center justify-center rounded-full bg-zinc-200 font-medium text-zinc-800 after:absolute after:inset-0 after:rounded-full after:inset-ring-[1px] after:inset-ring-black/7 ${size === "md" ? "size-10 text-sm coluna:size-8 coluna:text-xs" : "size-8 text-xs"}`}
    >
      <span className="select-none">{initial}</span>
    </div>
  );
}

function Separator() {
  return (
    <div className="-mx-[.3125rem] my-[.3125rem] h-px" role="none">
      <div className="h-px w-full bg-zinc-800/15" />
    </div>
  );
}

/** Menu do usuário: avatar + chevron; nome/e-mail, Acessar como aluno, Perfil, Sair. */
export function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      // ⌥+4 → Acessar como aluno (nova aba).
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === "Digit4") {
        e.preventDefault();
        window.open(STUDENT_HOME, "_blank", "noopener");
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Menu do usuário"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-gray-100"
      >
        <Avatar initial={initial} size="md" />
        <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
      </button>

      {open ? (
        <div
          role="menu"
          data-menu-usuario=""
          className="absolute right-0 top-full z-50 mt-1 min-w-64 rounded-lg border border-zinc-200 bg-white p-[.3125rem] shadow-xs focus:outline-hidden"
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar initial={initial} size="sm" />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-semibold text-gray-800">{name}</span>
              <span className="truncate text-xs text-gray-500">{email}</span>
            </div>
          </div>
          <Separator />
          <a
            href={STUDENT_HOME}
            target="_blank"
            rel="noopener"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <EyeIcon className="h-4 w-4 flex-shrink-0" />
            Acessar como aluno
            <kbd className="busca-tecla ml-auto hidden lg:inline-flex" aria-hidden="true">
              ⌥+4
            </kbd>
          </a>
          <Separator />
          <Link href="/area/aluno/perfil" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <UserIcon className="h-4 w-4 flex-shrink-0" />
            Perfil
          </Link>
          {/* Logout é uma rota GET: navegação completa com <a>, nunca prefetch do <Link> */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/auth/logout" role="menuitem" className={itemClass}>
            <LogOutIcon className="h-4 w-4 flex-shrink-0" />
            Sair
          </a>
        </div>
      ) : null}
    </div>
  );
}
