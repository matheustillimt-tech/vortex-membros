import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { DeliveryForm } from "@/components/dashboard/delivery-form";
import type { ItemsState } from "@/components/dashboard/delivery-content-tree";
import { formatRelative } from "@/lib/admin/administrators";
import { getDelivery } from "@/lib/sales/deliveries";
import { getAdmin } from "../../../../data";
import { deliveryFormContext, deliveryStudentCount } from "../../data";

export const metadata = { title: "Editar entrega" };

const fullDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

/** Editar entrega. */
export default async function EditDeliveryPage({ params }: PageProps<"/dashboard/sales/deliveries/[id]/edit">) {
  const [user, h, { id: raw }] = await Promise.all([getAdmin(), headers(), params]);
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  const db = getDb();
  const delivery = Number.isSafeInteger(id) ? await getDelivery(db, user, id) : null;
  if (!delivery) notFound();
  const [ctx, studentCount] = await Promise.all([deliveryFormContext(db, user, h), deliveryStudentCount(db, delivery.id)]);
  // Itens cujo produto/vitrine foi excluído (ou some da árvore) ficam de fora: não dá para vê-los nem
  // desmarcá-los, e o salvamento os descarta. Programação excluída ou que não é mais do produto vira "-".
  type Node = (typeof ctx.tree)[number];
  const showcaseIds = new Set<number>();
  const productIds = new Set<number>();
  const walk = (n: Node) => {
    showcaseIds.add(n.id);
    for (const p of n.products) productIds.add(p.id);
    n.children.forEach(walk);
  };
  ctx.tree.forEach(walk);
  const items: ItemsState = {};
  for (const i of delivery.items) {
    if (i.targetType === "showcase" && !showcaseIds.has(i.targetId!)) continue;
    if (i.targetType === "product" && !productIds.has(i.targetId!)) continue;
    const schedule = i.scheduleId === null || i.targetType !== "product" ? null : ctx.schedules.find((s) => s.id === i.scheduleId && s.productIds.includes(i.targetId!));
    const key = i.targetType === "all" ? "all" : `${i.targetType === "showcase" ? "s" : "p"}:${i.targetId}`;
    items[key] = { durationType: i.durationType, duration: i.duration === null ? "" : String(i.duration), scheduleId: schedule ? String(schedule.id) : "" };
  }
  return (
    <DeliveryForm
      key={delivery.id}
      {...ctx}
      delivery={{
        id: delivery.id,
        name: delivery.name,
        type: delivery.type,
        codes: delivery.codes,
        tagIds: delivery.tagIds,
        items,
        archived: delivery.archivedAt !== null,
        studentCount,
        lastSale: delivery.lastSaleAt ? { relative: formatRelative(delivery.lastSaleAt), title: fullDate.format(delivery.lastSaleAt).replace(",", "") } : null,
      }}
    />
  );
}
