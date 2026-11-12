import { getDb } from "@/db";
import { StudentNotes } from "@/components/dashboard/student-notes";
import { listNotes } from "@/lib/students/admin";
import { avatarColor, formatDateTime, formatRelative, initials } from "@/lib/students/format";
import { getStudent, studentId } from "./data";

export const metadata = { title: "Aluno" };

/** Aba Resumo: o card Notas. */
export default async function StudentSummaryPage({ params }: PageProps<"/dashboard/student/[id]">) {
  const id = studentId((await params).id);
  const { admin } = await getStudent(id);
  const notes = await listNotes(getDb(), admin, id);
  const now = new Date();
  return (
    <StudentNotes
      studentId={id}
      me={{ initials: initials(admin.name), color: avatarColor(admin.id) }}
      notes={notes.map((n) => ({
        id: n.id,
        body: n.body,
        author: n.author?.name ?? "Administrador",
        initials: n.author ? initials(n.author.name) : "?",
        color: avatarColor(n.author?.id ?? 0),
        when: formatRelative(n.createdAt, now),
        title: formatDateTime(n.createdAt),
      }))}
    />
  );
}
