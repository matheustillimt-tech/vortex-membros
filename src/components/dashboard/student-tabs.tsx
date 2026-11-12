"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, LayoutIcon, PackageIcon, ShoppingCartIcon } from "./icons";

/** Abas do perfil do aluno: Resumo · Compras · Produtos · Logs. */
export function StudentTabs({ id }: { id: number }) {
  const pathname = usePathname();
  const base = `/dashboard/student/${id}`;
  const tabs = [
    { href: base, label: "Resumo", Icon: LayoutIcon },
    { href: `${base}/purchases`, label: "Compras", Icon: ShoppingCartIcon },
    { href: `${base}/products`, label: "Produtos", Icon: PackageIcon },
    { href: `${base}/logs`, label: "Logs", Icon: ActivityIcon },
  ];
  return (
    <nav data-subnav="" aria-label="Submenu da seção" className="relative z-30 my-6 mt-0 border-b border-gray-200 has-[[aria-expanded=true]]:z-[31] max-sm:mb-4 max-sm:border-b-0">
      <div className="flex min-h-11 flex-wrap items-end justify-start gap-x-1">
        <div className="min-w-0 flex-1">
          <div className="relative">
            <div className="subnav-pista flex flex-wrap items-end gap-x-1 max-sm:flex-nowrap max-sm:gap-x-1.5 max-sm:overflow-x-auto max-sm:overscroll-x-contain">
              {tabs.map(({ href, label, Icon }) => {
                const on = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    data-nav="sub"
                    data-current={on ? "" : undefined}
                    aria-current={on ? "page" : undefined}
                    className="nav-aba -mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-2.5 text-hint text-gray-600 transition-colors hover:text-gray-900"
                  >
                    <Icon className="nav-icone h-4 w-4 flex-shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
