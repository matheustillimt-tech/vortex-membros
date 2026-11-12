import { getDb } from "@/db";
import { ADMIN_ROLE_LABELS, formatDateTime, formatRelative, listAdministrators, listRemovedAdministrators } from "@/lib/admin/administrators";
import { AdministratorsBoard } from "@/components/dashboard/administrators-board";
import { getAdmin } from "../../data";

export const metadata = { title: "Administradores" };

export default async function AdministratorsPage({ searchParams }: PageProps<"/dashboard/settings/administrators">) {
  const [user, sp] = await Promise.all([getAdmin(), searchParams]);
  const search = typeof sp.busca === "string" ? sp.busca.slice(0, 200) : "";
  const [rows, removed] = await Promise.all([listAdministrators(getDb(), user, { search }), listRemovedAdministrators(getDb(), user)]);
  const now = new Date();
  return (
    <AdministratorsBoard
      key={search}
      search={search}
      rows={rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        roleLabel: ADMIN_ROLE_LABELS[r.adminRole],
        lastAccess: r.lastAccessAt ? formatRelative(r.lastAccessAt, now) : "Nunca acessou",
      }))}
      trash={removed.map((r) => ({ id: r.id, name: r.name, email: r.email, removedAt: formatDateTime(r.removedAt) }))}
    />
  );
}
