import { sql } from "drizzle-orm";
import type { Database } from "@/db";
import { lessonViews, sessions } from "@/db/schema";
import { hashToken } from "@/lib/auth/sessions";

/** Intervalo mínimo entre duas visualizações contadas do mesmo aluno na mesma aula. */
export const LESSON_VIEW_DEDUPE_MINUTES = 30;

/**
 * Conta a abertura da aula (relatório de aulas, "visualizações"). Uma consulta só: insere a 1ª
 * visualização ou soma 1 se a última foi há mais de 30 min. Admin não conta; sessão de
 * "entrar como o aluno" (`sessions.impersonated_by`) também não, conferido na mesma consulta.
 */
export async function recordLessonView(
  db: Database,
  input: { user: { id: number; role: string }; lessonId: number; sessionToken: string | null; now?: Date },
): Promise<void> {
  if (input.user.role !== "student") return;
  const now = (input.now ?? new Date()).toISOString();
  const impersonated = input.sessionToken
    ? sql`exists (select 1 from ${sessions} where ${sessions.tokenHash} = ${hashToken(input.sessionToken)} and ${sessions.impersonatedBy} is not null)`
    : sql`false`;
  await db.execute(sql`
    insert into ${lessonViews} (user_id, lesson_id, views, first_viewed_at, last_viewed_at)
    select ${input.user.id}, ${input.lessonId}, 1, ${now}::timestamptz, ${now}::timestamptz
    where not ${impersonated}
    on conflict (user_id, lesson_id) do update
      set views = ${lessonViews}.views + 1, last_viewed_at = excluded.last_viewed_at
      where ${lessonViews}.last_viewed_at < excluded.last_viewed_at - ${sql.raw(`interval '${LESSON_VIEW_DEDUPE_MINUTES} minutes'`)}`);
}
