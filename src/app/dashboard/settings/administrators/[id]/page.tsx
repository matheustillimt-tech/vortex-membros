import { notFound } from "next/navigation";
import { getDb } from "@/db";
import {
  ADMIN_ROLE_LABELS,
  formatDateTime,
  formatLongDate,
  formatRelative,
  getAdministrator,
} from "@/lib/admin/administrators";
import { AdminError } from "@/lib/admin/errors";
import { AdministratorProfile, type DateLabel } from "@/components/dashboard/administrator-profile";
import { getAdmin } from "../../../data";

export const metadata = { title: "Administrador" };

export default async function AdministratorPage({ params }: PageProps<"/dashboard/settings/administrators/[id]">) {
  const [{ id: raw }, user] = await Promise.all([params, getAdmin()]);
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id)) notFound();
  let admin;
  try {
    admin = await getAdministrator(getDb(), user, id);
  } catch (e) {
    if (e instanceof AdminError) notFound();
    throw e;
  }
  const now = new Date();
  const label = (d: Date): DateLabel => ({ long: formatLongDate(d), relative: formatRelative(d, now), title: formatDateTime(d) });
  return (
    <AdministratorProfile
      key={admin.id}
      admin={{
        id: admin.id,
        name: admin.name,
        email: admin.email,
        document: admin.document,
        phone: admin.phone,
        roleLabel: ADMIN_ROLE_LABELS[admin.adminRole],
        lastAccess: admin.lastAccessAt ? label(admin.lastAccessAt) : null,
        created: label(admin.createdAt),
      }}
    />
  );
}
