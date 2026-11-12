import { Suspense } from "react";
import { after } from "next/server";
import { getDb } from "@/db";
import { AreaFooter } from "@/components/area/footer";
import { AreaHeader } from "@/components/area/header";
import { platformIdentity, themeProps } from "@/lib/theme";
import { PlatformIdentity } from "@/components/platform-identity";
import { safeErrorSummary } from "@/lib/log";
import { lastAccessIsFresh, touchLastAccess } from "@/lib/students/events";
import { getSettings, getViewerSession } from "./data";

async function AreaShell({ children }: { children: React.ReactNode }) {
  const [{ user, impersonatedBy }, settings] = await Promise.all([getViewerSession(), getSettings()]);
  const identity = platformIdentity(settings);
  // Último acesso por visita (no máx. 1x/h), depois da resposta: sem custo no caminho do aluno.
  // O admin "entrando como o aluno" não conta como acesso do aluno.
  if (impersonatedBy === null && !lastAccessIsFresh(user.lastAccessAt)) {
    after(() =>
      touchLastAccess(getDb(), user.id).catch((err) => console.error("[alunos] falha ao gravar o último acesso:", safeErrorSummary(err))),
    );
  }
  return (
    <div {...themeProps(settings)} className="vx-area flex min-h-svh flex-1 flex-col bg-bg">
      <AreaHeader user={user} settings={settings} impersonating={impersonatedBy !== null} />
      <main className="flex-1">{children}</main>
      {/* Sem configurações próprias, a árvore é a mesma de sempre (mesmos useId e HTML). */}
      {identity ? (
        <>
          <AreaFooter settings={settings} />
          <PlatformIdentity {...identity} />
        </>
      ) : (
        <AreaFooter settings={settings} />
      )}
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="vx-area flex min-h-svh flex-1 flex-col bg-bg" aria-busy="true">
      <div className="h-[75px] border-b border-line" />
    </div>
  );
}

export default function AreaLayout({ children }: LayoutProps<"/area">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AreaShell>{children}</AreaShell>
    </Suspense>
  );
}
