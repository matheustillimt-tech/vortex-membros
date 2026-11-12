import { getDb } from "@/db";
import { StudentsBoard } from "@/components/dashboard/students-board";
import { listStudents } from "@/lib/students/queries";
import { getAdmin } from "../data";
import { filterOptions } from "./data";
import { listOptions, parseStudentFilters, toStudentRow, type FilterKind } from "./rows";

export const metadata = { title: "Alunos" };

export default async function StudentsPage({ searchParams }: PageProps<"/dashboard/students">) {
  const [user, sp] = await Promise.all([getAdmin(), searchParams]);
  const first = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? null) : null;
  };
  const all = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
  };
  const filters = parseStudentFilters(first, all);
  const db = getDb();
  const page = await listStudents(db, user, listOptions(filters));
  // Rótulos dos chips já aplicados (as opções em si só carregam quando o dropdown abre).
  const labels: Record<FilterKind, Record<string, string>> = { products: {}, showcases: {}, deliveries: {}, tags: {} };
  const used: [FilterKind, number[]][] = [
    ["products", filters.products],
    ["showcases", filters.showcase !== null ? [filters.showcase] : []],
    ["deliveries", filters.delivery !== null ? [filters.delivery] : []],
    ["tags", filters.tags],
  ];
  for (const [kind, ids] of used) {
    if (!ids.length) continue;
    for (const o of await filterOptions(db, kind)) if (ids.includes(Number(o.value))) labels[kind][o.value] = o.label;
  }
  const now = new Date();
  return (
    <StudentsBoard
      key={JSON.stringify(filters)}
      filters={filters}
      labels={labels}
      data={{ rows: page.rows.map((r) => toStudentRow(r, now)), total: page.total, nextCursor: page.nextCursor }}
    />
  );
}
