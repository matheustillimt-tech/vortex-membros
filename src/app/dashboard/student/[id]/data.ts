import { cache } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { AdminError } from "@/lib/admin/errors";
import { getStudentProfile } from "@/lib/students/admin";
import { getAdmin } from "../../data";

/** Id da rota (`/dashboard/student/[id]`): número válido, senão 404. */
export function studentId(raw: string): number {
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id)) notFound();
  return id;
}

/** Perfil do aluno (uma consulta por requisição para layout e abas); aluno inexistente ou excluído → 404. */
export const getStudent = cache(async (id: number) => {
  const admin = await getAdmin();
  try {
    return { admin, profile: await getStudentProfile(getDb(), admin, id) };
  } catch (e) {
    if (e instanceof AdminError) notFound();
    throw e;
  }
});
