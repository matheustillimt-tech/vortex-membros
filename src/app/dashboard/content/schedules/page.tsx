import { getDb } from "@/db";
import { listProductsWithoutSchedule, listSchedules, listScheduleTrash } from "@/lib/admin/schedules";
import { SchedulesBoard } from "@/components/dashboard/schedules-board";
import { getAdmin } from "../../data";

export const metadata = { title: "Conteúdo programado" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function SchedulesPage() {
  const user = await getAdmin();
  const db = getDb();
  const [rows, trash, freeProducts] = await Promise.all([listSchedules(db, user), listScheduleTrash(db, user), listProductsWithoutSchedule(db, user)]);
  return (
    <SchedulesBoard
      rows={rows.map((r) => ({ ...r, createdAt: dateFmt.format(r.createdAt), updatedAt: dateFmt.format(r.updatedAt) }))}
      trash={trash.map((t) => ({ id: t.id, name: t.name, deletedAt: t.deletedAt ? dateFmt.format(t.deletedAt) : "" }))}
      freeProducts={freeProducts}
    />
  );
}
