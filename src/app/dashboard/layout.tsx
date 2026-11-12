import { cookies } from "next/headers";
import { DashboardHeader } from "@/components/dashboard/header";
import { MENU_COOKIE } from "@/components/dashboard/caminho";
import { PainelRaiz } from "@/components/dashboard/painel-raiz";
import { PlatformIdentity } from "@/components/platform-identity";
import { safeImageUrl } from "@/lib/theme";
import { dashboardBrandStyle, dashboardLogoUrl, getAdmin, getDashboardSettings } from "./data";

export const metadata = { title: "Painel" };
// Painel entregue de uma vez (sem casca + streaming): os dados ficam prontos em ~100 ms, e o
// React segura a troca do fallback por 300 ms após a primeira pintura (o texto só aparecia em ~400 ms).
export const instant = false;

async function DashboardShell({ children }: { children: React.ReactNode }) {
  // O proxy já barrou deslogados e alunos com 307; isto é a segunda camada.
  const [user, settings, jar] = await Promise.all([getAdmin(), getDashboardSettings(), cookies()]);
  const icon = safeImageUrl(settings.adminArea.collapsedIconUrl);
  // Menu lateral recolhido: lido no servidor para a página já chegar com a coluna estreita.
  const recolhido = jar.get(MENU_COOKIE)?.value === "recolhido";
  return (
    // Cor de destaque própria: tons brand-* no wrapper (sem caixa); com a cor padrão, sem estilo.
    <PainelRaiz recolhidoInicial={recolhido} style={dashboardBrandStyle(settings)}>
      {/* Ícone do menu recolhido (Painel administrativo) vira o ícone da aba do painel. */}
      {icon ? <PlatformIdentity title={null} icon={icon} /> : null}
      <DashboardHeader
        user={user}
        siteName={settings.siteName}
        logoUrl={dashboardLogoUrl(settings)}
        collapsedIcon={icon}
      />
      <main data-main="" className="flex-1">
        <div className="px-6 lg:px-8 pb-6 sm:pb-10 pt-6 sm:pt-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </div>
      </main>
    </PainelRaiz>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="dash flex min-h-svh flex-1 flex-col">
      <DashboardShell>{children}</DashboardShell>
    </div>
  );
}
