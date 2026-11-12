import Link from "next/link";
import type { User } from "@/lib/auth/sessions";
import type { PlatformSettings } from "@/lib/settings";
import { safeHttpUrl } from "@/lib/theme";
import { HeaderSearch } from "./header-search";
import { BellIcon, ChevronDown, MenuIcon } from "./icons";
import { Logo } from "./logo";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

const panelClass = "absolute right-0 top-[calc(100%+8px)] z-40 w-56 rounded-md border border-line bg-bg p-1";
const itemClass = "block rounded-md px-3 py-2 text-ui text-text-2 hover:bg-field hover:text-hover";

function ProfileLinks({ user, links }: { user: User; links: { label: string; url: string }[] }) {
  return (
    <>
      <p className="truncate px-3 pb-2 pt-1.5 text-fine text-muted">{user.email}</p>
      {links.map((l) => (
        <a key={l.url + l.label} href={l.url} target="_blank" rel="noopener noreferrer" className={itemClass}>
          {l.label}
        </a>
      ))}
      {user.role === "admin" ? (
        <Link href="/dashboard" prefetch={false} className={itemClass}>
          Painel administrativo
        </Link>
      ) : null}
      <Link href="/area/aluno/perfil" className={itemClass}>
        Perfil
      </Link>
      {/* Logout é uma rota GET: navegação completa com <a>, nunca prefetch/navegação do <Link> */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/auth/logout" className={itemClass}>
        Sair
      </a>
    </>
  );
}

/**
 * Cabeçalho (75px, não fixo): logo à esquerda; à direita busca (30×30), notificações
 * (40×30, a partir de 992px) e avatar (62×40); abaixo de 992px, o botão menu (38×38).
 */
/** Faixa da personificação ("Entrar como o aluno"), no estilo discreto do painel. */
function ImpersonationBar({ name }: { name: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[13px] text-gray-600">
      <span className="min-w-0 truncate">
        Você está vendo como <strong className="font-semibold text-gray-900">{name}</strong>
      </span>
      <span aria-hidden="true" className="text-gray-300">
        ·
      </span>
      {/* Rota GET que troca o cookie de sessão: navegação completa, nunca prefetch. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/auth/voltar-ao-painel" className="flex-shrink-0 font-medium text-gray-900 underline underline-offset-2 hover:text-black">
        Voltar ao painel
      </a>
    </div>
  );
}

export function AreaHeader({ user, settings, impersonating = false }: { user: User; settings: PlatformSettings; impersonating?: boolean }) {
  const links = settings.menuLinks
    .map((l) => ({ label: l.label, url: safeHttpUrl(l.url) }))
    .filter((l): l is { label: string; url: string } => Boolean(l.label && l.url));

  return (
    <>
    {impersonating ? <ImpersonationBar name={user.name} /> : null}
    <nav aria-label="Principal" className="vx-nav">
      <Link href="/area/vitrine/home" aria-label={`${settings.siteName}: início`} className="vx-logo">
        <Logo src={settings.logoUrl} siteName={settings.siteName} />
      </Link>

      <div className="vx-nav-right">
        <HeaderSearch />

        <details className="vx-menu vx-bell-wrap relative">
          <summary className="vx-hbtn vx-hbtn--bell" aria-label="Notificações">
            <BellIcon className="size-[11px]" />
            <ChevronDown className="size-[7px]" strokeWidth={4} />
          </summary>
          <div className={panelClass}>
            <p className="px-3 py-2 text-ui text-muted">Nenhuma notificação</p>
          </div>
        </details>

        <details className="vx-menu relative">
          <summary className="vx-hbtn vx-hbtn--avatar" aria-label="Abrir menu do perfil">
            <span className="vx-avatar" aria-hidden>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" /> : initials(user.name)}
            </span>
            <ChevronDown className="size-2" strokeWidth={4} />
          </summary>
          <div className={panelClass}>
            <ProfileLinks user={user} links={links} />
          </div>
        </details>

        <details className="vx-menu vx-menu-mobile relative">
          <summary className="vx-hbtn vx-hbtn--menu" aria-label="Abrir menu">
            <MenuIcon className="size-4" />
          </summary>
          <div className={panelClass}>
            <ProfileLinks user={user} links={links} />
          </div>
        </details>
      </div>
    </nav>
    </>
  );
}
