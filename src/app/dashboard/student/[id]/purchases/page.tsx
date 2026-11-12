import { getDb } from "@/db";
import { StudentPurchases } from "@/components/dashboard/student-purchases";
import { formatCents, formatDateTimeSeconds, formatShortDateTime, toSaoPauloLocal } from "@/lib/students/format";
import { listAvailableDeliveries, listPurchases } from "@/lib/students/purchases";
import { getStudent, studentId } from "../data";

export const metadata = { title: "Compras do aluno" };

const GATEWAYS: Record<string, string> = { kiwify: "Kiwify" };

/** Aba Compras; `?new=1` abre "Adicionar entrega". */
export default async function StudentPurchasesPage({ params, searchParams }: PageProps<"/dashboard/student/[id]/purchases">) {
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  const id = studentId(raw);
  const { admin, profile } = await getStudent(id);
  const db = getDb();
  const now = new Date();
  const purchases = await listPurchases(db, admin, id, now);
  const available = await listAvailableDeliveries(db, admin, id);
  return (
    <StudentPurchases
      key={purchases.map((p) => `${p.deliveryId}|${p.saleRef}|${p.active}|${p.expiresAt?.getTime()}`).join(";")}
      studentId={id}
      email={profile.email}
      openNew={sp.new === "1"}
      deliveries={available.map((d) => ({ value: String(d.id), label: d.label }))}
      rows={purchases.map((p) => ({
        deliveryId: p.deliveryId,
        saleRef: p.saleRef,
        date: formatShortDateTime(p.startedAt),
        dateTitle: formatDateTimeSeconds(p.startedAt),
        deliveryName: p.deliveryName ?? (p.source === "import" ? "Importação" : "Acesso avulso"),
        gatewayLabel: GATEWAYS[p.gateway ?? "kiwify"] ?? p.gateway ?? "Kiwify",
        source: p.source,
        amount: p.amountCents !== null ? formatCents(p.amountCents) : null,
        active: p.active,
        endLocal: p.expiresAt ? toSaoPauloLocal(p.expiresAt) : "",
      }))}
    />
  );
}
