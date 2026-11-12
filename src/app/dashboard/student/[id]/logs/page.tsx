import { getDb } from "@/db";
import { StudentLogs } from "@/components/dashboard/student-logs";
import { listLogs } from "@/lib/students/admin";
import { formatDateTimeSeconds, formatShortDateTime } from "@/lib/students/format";
import { getStudent, studentId } from "../data";

export const metadata = { title: "Logs do aluno" };

/** Aba Logs. */
export default async function StudentLogsPage({ params }: PageProps<"/dashboard/student/[id]/logs">) {
  const id = studentId((await params).id);
  const { admin } = await getStudent(id);
  const page = await listLogs(getDb(), admin, id, {});
  return (
    <StudentLogs
      key={page.rows[0]?.id ?? 0}
      studentId={id}
      total={page.total}
      nextCursor={page.nextCursor}
      rows={page.rows.map((r) => ({
        id: r.id,
        date: formatShortDateTime(r.createdAt),
        title: formatDateTimeSeconds(r.createdAt),
        label: r.label,
        ip: r.ip ?? "",
        userAgent: r.userAgent ?? "",
      }))}
    />
  );
}
