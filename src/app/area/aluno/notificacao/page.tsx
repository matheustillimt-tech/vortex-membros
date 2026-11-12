import type { Metadata } from "next";
import { AccountShell } from "@/components/area/account-shell";

export const metadata: Metadata = { title: "Notificações" };

export default function NotificationsPage() {
  return (
    <AccountShell current="/area/aluno/notificacao" title="Notificações">
      <p className="text-ui text-text-2">Nenhuma notificação</p>
    </AccountShell>
  );
}
