import type { Database } from "@/db";
import type { User } from "@/lib/auth/sessions";
import { getLessonPage } from "@/lib/catalog/queries";
import { setLessonCompleted, setLessonReaction } from "@/lib/progress";

// Ações do aluno numa aula. Server actions recebem dados de qualquer cliente: valida os tipos
// e só grava se a aula estiver visível, o aluno tiver acesso ao produto e já tiver aceitado o termo
// (mesmas regras da página).
async function canInteract(db: Database, user: User, lessonId: unknown): Promise<boolean> {
  if (typeof lessonId !== "number" || !Number.isSafeInteger(lessonId) || lessonId <= 0) return false;
  // "terms" (termo pendente), "locked", "scheduled" e "not_found" barram.
  return (await getLessonPage(db, user, lessonId)).status === "ok";
}

export async function toggleLessonCompleted(db: Database, user: User, lessonId: number, completed: boolean): Promise<boolean> {
  if (typeof completed !== "boolean" || !(await canInteract(db, user, lessonId))) return false;
  await setLessonCompleted(db, user.id, lessonId, completed);
  return true;
}

export async function reactToLesson(db: Database, user: User, lessonId: number, value: 1 | -1 | null): Promise<boolean> {
  if (value !== 1 && value !== -1 && value !== null) return false;
  if (!(await canInteract(db, user, lessonId))) return false;
  await setLessonReaction(db, user.id, lessonId, value);
  return true;
}
