"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { blockedByFirstAccessTerms } from "@/lib/catalog/first-access-terms";
import { reactToLesson, toggleLessonCompleted } from "@/lib/lesson-interactions";

// As checagens de acesso ficam em lib/lesson-interactions (testadas sem o contexto do Next).
export async function toggleCompletedAction(lessonId: number, completed: boolean): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (await blockedByFirstAccessTerms(getDb(), user)) return { ok: false };
  const ok = await toggleLessonCompleted(getDb(), user, lessonId, completed);
  if (ok) {
    revalidatePath(`/area/conteudo/aula/${lessonId}`);
    revalidatePath("/area/conteudo/listagem/[id]", "page");
  }
  return { ok };
}

export async function reactAction(lessonId: number, value: 1 | -1 | null): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (await blockedByFirstAccessTerms(getDb(), user)) return { ok: false };
  const ok = await reactToLesson(getDb(), user, lessonId, value);
  if (ok) revalidatePath(`/area/conteudo/aula/${lessonId}`);
  return { ok };
}
