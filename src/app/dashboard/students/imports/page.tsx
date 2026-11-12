import { getDb } from "@/db";
import { listImports, type ImportListRow } from "@/lib/students/import";
import { ImportsBoard, type ImportRow } from "@/components/dashboard/imports-board";
import { getAdmin } from "../../data";

export const metadata = { title: "Importações" };
// O envio (server action desta página) lê a planilha; o processamento continua no after().
export const maxDuration = 60;

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const toRow = (r: ImportListRow): ImportRow => ({
  id: r.id,
  name: r.name,
  status: r.status,
  total: r.total,
  processed: r.processed,
  created: r.created,
  updated: r.updated,
  failed: r.failed,
  createdAt: dateFmt.format(r.createdAt).replace(",", ""),
});

export default async function ImportsPage() {
  const user = await getAdmin();
  const db = getDb();
  const [rows, trash] = await Promise.all([listImports(db, user, { trashed: false }), listImports(db, user, { trashed: true })]);
  return <ImportsBoard rows={rows.map(toRow)} trash={trash.map(toRow)} />;
}
