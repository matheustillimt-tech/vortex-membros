import type { User } from "@/lib/auth/sessions";
import { TopMenu } from "./top-menu";
import { UserMenu } from "./user-menu";

/** Logo do painel: imagem (configuração do painel) ou o nome do site. */
function DashboardLogo({ logoUrl, siteName }: { logoUrl: string | null; siteName: string }) {
  if (logoUrl) {
    // logo configurável (/media/<id> ou https)
    return <img src={logoUrl} alt={siteName} className="h-7 w-auto" />;
  }
  return <span className="truncate text-lg font-semibold leading-7 text-gray-900">{siteName}</span>;
}

/**
 * Cabeçalho do painel no layout de menu lateral: no desktop, barra fixa de 56px ao lado da
 * coluna (botão de recolher + caminho da página + avatar); no celular, 72px com hambúrguer e logo.
 */
export function DashboardHeader({
  user,
  siteName,
  logoUrl,
  collapsedIcon,
}: {
  user: User;
  siteName: string;
  logoUrl: string | null;
  collapsedIcon: string | null;
}) {
  return (
    <header data-topbar="" className="relative border-b border-gray-200 bg-white">
      <div className="flex h-18 items-center gap-3 px-4 lg:px-6">
        <TopMenu
          logo={<DashboardLogo logoUrl={logoUrl} siteName={siteName} />}
          collapsedIcon={collapsedIcon}
          siteName={siteName}
        />
        <div className="flex-1" />
        <div className="flex flex-shrink-0 items-center gap-2">
          <UserMenu name={user.name} email={user.email} />
        </div>
      </div>
    </header>
  );
}
