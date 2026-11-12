import { getDb } from "@/db";
import { StudentProducts } from "@/components/dashboard/student-products";
import { formatDate } from "@/lib/students/format";
import { listStudentProducts } from "@/lib/students/purchases";
import { getStudent, studentId } from "../data";

export const metadata = { title: "Produtos do aluno" };

/** Aba Produtos. */
export default async function StudentProductsPage({ params }: PageProps<"/dashboard/student/[id]/products">) {
  const id = studentId((await params).id);
  const { admin } = await getStudent(id);
  const rows = await listStudentProducts(getDb(), admin, id);
  return (
    <StudentProducts
      key={rows.map((r) => `${r.productId}:${r.until?.getTime()}:${r.immediate}:${r.percent}`).join(";")}
      studentId={id}
      rows={rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        showcase: r.showcase,
        until: r.until ? formatDate(r.until) : "Vitalício",
        current: r.until ? `até ${formatDate(r.until)}` : "sem data definida",
        completed: r.completed,
        total: r.total,
        percent: r.percent,
        immediate: r.immediate,
        scheduleName: r.scheduleName,
      }))}
    />
  );
}
