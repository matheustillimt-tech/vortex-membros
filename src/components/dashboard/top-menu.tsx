"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { caminhoDoPainel } from "./caminho";
import { ChevronDownIcon, ChevronRightIcon, MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, XIcon } from "./icons";
import {
  MenuBarChartIcon,
  MenuBlocksIcon,
  MenuCalendarClockIcon,
  MenuDollarIcon,
  MenuHomeIcon,
  MenuImageIcon,
  MenuPackageIcon,
  MenuPaletteIcon,
  MenuSettingsIcon,
  MenuTagIcon,
  MenuUploadIcon,
  MenuUsersIcon,
} from "./menu-icons";
import { usePainel } from "./painel-raiz";

type SubItem = {
  label: string;
  href: string;
  icon?: (p: { className?: string }) => React.ReactNode;
  /** Sub-item filho (recuado, sem ícone), como "Área do aluno" sob "Personalização". */
  child?: boolean;
  kbd?: string;
};
type Group = { id: string; label: string; icon: (p: { className?: string }) => React.ReactNode; items: SubItem[] };

// Ordem do menu, sem Atendimento. Relatórios é um link direto (só Alunos e Produtos).
const GROUPS: Group[] = [
  {
    id: "conteudo",
    label: "Conteúdo",
    icon: MenuBlocksIcon,
    items: [
      { label: "Produtos", href: "/dashboard/content/products", icon: MenuBlocksIcon, kbd: "⌥+1" },
      { label: "Conteúdo programado", href: "/dashboard/content/schedules", icon: MenuCalendarClockIcon },
      { label: "Banners", href: "/dashboard/content/banners", icon: MenuImageIcon },
    ],
  },
  {
    id: "alunos",
    label: "Alunos",
    icon: MenuUsersIcon,
    items: [
      { label: "Alunos", href: "/dashboard/students", icon: MenuUsersIcon, kbd: "⌥+2" },
      { label: "Tags", href: "/dashboard/students/tags", icon: MenuTagIcon },
      { label: "Importações", href: "/dashboard/students/imports", icon: MenuUploadIcon },
    ],
  },
  {
    id: "vendas",
    label: "Vendas",
    icon: MenuDollarIcon,
    items: [
      { label: "Vendas", href: "/dashboard/sales", icon: MenuDollarIcon, kbd: "⌥+3" },
      { label: "Entregas", href: "/dashboard/sales/deliveries", icon: MenuPackageIcon },
    ],
  },
  {
    id: "configuracoes",
    label: "Configurações",
    icon: MenuSettingsIcon,
    items: [
      { label: "Personalização", href: "/dashboard/settings", icon: MenuPaletteIcon },
      { label: "Área do aluno", href: "/dashboard/settings/student-area", child: true },
      { label: "Telas de acesso", href: "/dashboard/settings/access-screens", child: true },
      { label: "Painel administrativo", href: "/dashboard/settings/admin-area", child: true },
    ],
  },
];

/** Grupos antes do link "Relatórios"; o resto (Configurações) vem depois dele. */
const GROUPS_BEFORE_REPORTS = 3;
const REPORTS_HREF = "/dashboard/reports";

const SHORTCUTS: Record<string, string> = {
  Digit1: "/dashboard/content/products",
  Digit2: "/dashboard/students",
  Digit3: "/dashboard/sales",
};

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/dashboard/settings") return pathname === href;
  // Lista de alunos e perfil (/dashboard/student/{id}); Tags e Importações têm item próprio.
  if (href === "/dashboard/students") return pathname === href || pathname.startsWith("/dashboard/student/");
  if (href === "/dashboard/sales") return pathname === href;
  // Páginas de um produto ficam sob "Produtos".
  if (href === "/dashboard/content/products") return pathname === href || pathname.startsWith("/dashboard/content/product/");
  return pathname === href || pathname.startsWith(href + "/");
}

/** Grupo da página atual (fica aberto no menu lateral). Configurações cobre todas as subpáginas. */
function currentGroupId(pathname: string): string | null {
  if (pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/")) return "configuracoes";
  return GROUPS.find((g) => g.items.some((i) => isCurrent(pathname, i.href)))?.id ?? null;
}

const desktop = () => window.matchMedia("(min-width: 64rem)").matches;

const topLinkClass =
  "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900";
const groupButtonClass =
  "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900";

/** Caminho da página no topo (breadcrumb). */
function Caminho() {
  const pathname = usePathname();
  const { nomes } = usePainel();
  const passos = caminhoDoPainel(pathname, nomes);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-hint">
      {passos.map((p, i) => {
        const ultimo = i === passos.length - 1;
        return (
          <div key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <ChevronRightIcon className="h-3 w-3 flex-shrink-0 text-gray-300" /> : null}
            {ultimo ? (
              <span aria-current="page" className="truncate font-medium text-gray-900">
                {p.label}
              </span>
            ) : p.href ? (
              <Link href={p.href} className="truncate text-gray-400 transition-colors hover:text-gray-600">
                {p.label}
              </Link>
            ) : (
              <span className="truncate text-gray-400">{p.label}</span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Menu principal do painel no layout de menu lateral: o MESMO <div data-menu> é drawer no
 * celular (< 64rem) e coluna fixa à esquerda no desktop (coluna:), que pode ser recolhida só com
 * ícones (recolhido:). No topo ficam o botão de recolher e o caminho da página.
 */
export function TopMenu({
  logo,
  collapsedIcon,
  siteName,
}: {
  logo: React.ReactNode;
  collapsedIcon: string | null;
  siteName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { recolhido, alternarRecolhido } = usePainel();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(() => (recolhido ? null : currentGroupId(pathname)));
  const navRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A cada página (e ao expandir o menu), abre o grupo da página atual; recolhido, nenhum painel fica aberto.
  const [visto, setVisto] = useState({ pathname, recolhido });
  if (visto.pathname !== pathname || visto.recolhido !== recolhido) {
    setVisto({ pathname, recolhido });
    setOpenGroup(recolhido ? null : currentGroupId(pathname));
  }

  const closeAll = useCallback(() => {
    if (recolhido) setOpenGroup(null);
    setDrawerOpen(false);
  }, [recolhido]);

  // Fecha ao clicar fora e com Esc. Atalhos ⌥+1 → Produtos, ⌥+2 → Alunos e ⌥+3 → Vendas.
  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (recolhido && navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAll();
      const shortcut = e.altKey && !e.metaKey && !e.ctrlKey ? SHORTCUTS[e.code] : undefined;
      if (shortcut) {
        e.preventDefault();
        closeAll();
        router.push(shortcut);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [closeAll, recolhido, router]);

  // Recolhido (desktop): os grupos abrem ao passar o mouse, num painel ao lado da coluna.
  function hover(id: string | null) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (!recolhido || !desktop()) return;
    hoverTimer.current = setTimeout(() => setOpenGroup(id), id ? 0 : 120);
  }

  const homeCurrent = pathname === "/dashboard";
  const reportsCurrent = pathname === REPORTS_HREF || pathname.startsWith(REPORTS_HREF + "/");

  function renderGroup(g: Group) {
    const open = openGroup === g.id;
    const groupCurrent = currentGroupId(pathname) === g.id;
    const Icon = g.icon;
    return (
      <li
        key={g.id}
        data-grupo-nav=""
        className="mt-1"
        onMouseEnter={() => hover(g.id)}
        onMouseLeave={() => hover(null)}
      >
        <button
          data-nav="topo"
          data-navega-pai=""
          data-current={groupCurrent ? "" : undefined}
          type="button"
          aria-expanded={open}
          aria-controls={`painel-grupo-${g.id}`}
          onClick={() => setOpenGroup(open ? null : g.id)}
          className={groupButtonClass}
        >
          <Icon className="h-[18px] w-[18px] flex-shrink-0 nav-icone" />
          <span className="flex-1 truncate text-left">{g.label}</span>
          <ChevronDownIcon className="nav-grupo-chevron h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform duration-200" />
        </button>
        <div
          id={`painel-grupo-${g.id}`}
          data-grupo-painel=""
          className="mt-0.5 space-y-0.5 pl-7"
          style={open ? undefined : { display: "none" }}
        >
          <div className="hidden px-2.5 py-1.5 text-label font-semibold uppercase tracking-wider text-gray-400 recolhido:block">
            {g.label}
          </div>
          {g.items.map((item) => {
            const current = isCurrent(pathname, item.href);
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                data-nav="sub"
                data-current={current ? "" : undefined}
                aria-current={current ? "page" : undefined}
                href={item.href}
                onClick={closeAll}
                className={item.child ? "nav-sub-item nav-sub-item--filho" : "nav-sub-item"}
              >
                {ItemIcon ? <ItemIcon className="h-4 w-4 flex-shrink-0 nav-icone" /> : null}
                <span className="truncate text-hint">{item.label}</span>
                {item.kbd ? (
                  <kbd className="busca-tecla ml-auto hidden lg:inline-flex" aria-hidden="true">
                    {item.kbd}
                  </kbd>
                ) : null}
              </Link>
            );
          })}
        </div>
      </li>
    );
  }

  return (
    <>
      {/* botão hambúrguer (só < lg) */}
      <button
        type="button"
        aria-label="Abrir menu"
        aria-expanded={drawerOpen}
        aria-controls="painel-menu"
        onClick={() => setDrawerOpen(true)}
        className="-ml-3 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:hidden"
      >
        <MenuIcon className="h-[18px] w-[18px]" />
      </button>

      {/* logo no topo só no celular; no desktop ela fica no alto da coluna */}
      <Link href="/dashboard" className="flex flex-shrink-0 items-center coluna:hidden">
        {logo}
      </Link>

      {/* recolher/expandir a coluna (desktop) */}
      <button
        type="button"
        onClick={alternarRecolhido}
        title={recolhido ? "Expandir menu" : "Recolher menu"}
        aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
        className="-ml-1 hidden flex-shrink-0 cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 coluna:block"
      >
        {recolhido ? <PanelLeftOpenIcon className="h-4 w-4" /> : <PanelLeftCloseIcon className="h-4 w-4" />}
      </button>

      <div className="hidden min-w-0 coluna:flex">
        <Caminho />
      </div>

      <div className="hidden flex-1 lg:block" />

      {/* véu do drawer (celular) */}
      <div
        data-menu-veu=""
        aria-hidden
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity lg:hidden ${drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      {/* ===== DRAWER (celular) / COLUNA (desktop) ===== */}
      <div
        id="painel-menu"
        data-menu=""
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200 bg-white shadow-2xl transition-[translate,visibility] duration-200 focus:outline-none ${drawerOpen ? "translate-x-0" : "invisible -translate-x-full"}`}
      >
        {/* logo no alto da coluna (desktop); recolhido, mostra o ícone do menu recolhido */}
        <Link
          href="/dashboard"
          aria-label={siteName}
          className="hidden h-[calc(3.5rem+1px)] flex-shrink-0 items-center border-b border-gray-200 px-4 coluna:flex recolhido:justify-center recolhido:px-0"
        >
          <span className="flex min-w-0 items-center recolhido:hidden">{logo}</span>
          <span className="hidden items-center recolhido:flex">
            {collapsedIcon ? (
              <img src={collapsedIcon} alt="Ícone" className="h-6 max-h-6 w-auto object-contain" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-md bg-brand-500 text-xs font-semibold text-white">
                {(siteName.trim()[0] ?? "?").toUpperCase()}
              </span>
            )}
          </span>
        </Link>

        {/* topo do drawer (celular) */}
        <div className="flex h-[calc(4.5rem+1px)] flex-shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 lg:hidden">
          <Link href="/dashboard" onClick={closeAll} className="flex min-w-0 items-center pl-1">
            {logo}
          </Link>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <XIcon className="h-[18px] w-[18px]" />
          </button>
        </div>

        <nav ref={navRef} aria-label="Menu principal" className="scroll-fino flex-1 overflow-y-auto px-2 py-2">
          <ul>
            <li>
              <Link
                data-nav="topo"
                data-current={homeCurrent ? "" : undefined}
                aria-current={homeCurrent ? "page" : undefined}
                data-dica="Início"
                href="/dashboard"
                onClick={closeAll}
                className={topLinkClass}
              >
                <MenuHomeIcon className="h-[18px] w-[18px] flex-shrink-0 nav-icone" />
                <span className="truncate">Início</span>
              </Link>
            </li>
            {GROUPS.slice(0, GROUPS_BEFORE_REPORTS).map(renderGroup)}
            <li className="mt-1">
              <Link
                data-nav="topo"
                data-current={reportsCurrent ? "" : undefined}
                aria-current={reportsCurrent ? "page" : undefined}
                data-dica="Relatórios"
                href={REPORTS_HREF}
                onClick={closeAll}
                className={topLinkClass}
              >
                <MenuBarChartIcon className="h-[18px] w-[18px] flex-shrink-0 nav-icone" />
                <span className="truncate">Relatórios</span>
              </Link>
            </li>
            {GROUPS.slice(GROUPS_BEFORE_REPORTS).map(renderGroup)}
          </ul>
        </nav>

        {/* recolher menu (rodapé da coluna, desktop) */}
        <div className="hidden w-full flex-shrink-0 px-2 pb-2 coluna:block">
          <button
            type="button"
            data-menu-util=""
            data-dica={recolhido ? "Expandir menu" : undefined}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            onClick={alternarRecolhido}
            className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            {recolhido ? (
              <PanelLeftOpenIcon className="h-4 w-4 flex-shrink-0" />
            ) : (
              <PanelLeftCloseIcon className="h-4 w-4 flex-shrink-0" />
            )}
            <span className="truncate">Recolher menu</span>
          </button>
        </div>
      </div>
    </>
  );
}
