import { getDb } from "@/db";
import type { DeliveryType } from "@/db/schema";
import { DeliveriesBoard, type DeliveriesFilters } from "@/components/dashboard/deliveries-board";
import { listDeliveries } from "@/lib/sales/deliveries";
import { getAdmin } from "../../data";
import { ensureWebhookSecret } from "./data";

export const metadata = { title: "Entregas" };

const TYPES: DeliveryType[] = ["single", "subscription"];

export default async function DeliveriesPage({ searchParams }: PageProps<"/dashboard/sales/deliveries">) {
  const [user, sp] = await Promise.all([getAdmin(), searchParams]);
  const all = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
  };
  const filters: DeliveriesFilters = {
    archived: all("arquivadas")[0] === "1",
    gateways: [...new Set(all("gateway").filter((g) => g === "kiwify"))],
    types: [...new Set(all("tipo").filter((t): t is DeliveryType => TYPES.includes(t as DeliveryType)))],
    q: (all("busca")[0] ?? "").trim().slice(0, 200),
  };
  const db = getDb();
  await ensureWebhookSecret(db); // a URL de postback existe desde a primeira visita a Entregas
  const rows = await listDeliveries(db, user, {
    archived: filters.archived,
    gateway: filters.gateways.length === 1 ? filters.gateways[0] : undefined,
    type: filters.types.length === 1 ? filters.types[0] : undefined,
    search: filters.q || undefined,
  });
  return (
    <DeliveriesBoard
      key={JSON.stringify(filters)}
      filters={filters}
      rows={rows.map((r) => ({ id: r.id, name: r.name, codes: r.codes, type: r.type, access: r.access }))}
    />
  );
}
