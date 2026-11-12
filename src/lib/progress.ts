import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { lessonProgress, lessonReactions, lessons, modules } from "@/db/schema";

export async function setLessonCompleted(db: Database, userId: number, lessonId: number, completed: boolean): Promise<void> {
  if (completed) {
    await db.insert(lessonProgress).values({ userId, lessonId }).onConflictDoNothing();
  } else {
    await db.delete(lessonProgress).where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)));
  }
}

export async function getProductProgress(
  db: Database,
  userId: number,
  productId: number,
): Promise<{ completed: number; total: number; percent: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(${lessons.id})::int`,
      completed: sql<number>`count(${lessonProgress.lessonId})::int`,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)))
    .where(
      and(
        eq(modules.productId, productId),
        eq(modules.status, "published"),
        isNull(modules.deletedAt),
        eq(lessons.status, "published"),
        isNull(lessons.deletedAt),
      ),
    );
  const total = row?.total ?? 0;
  const completed = row?.completed ?? 0;
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

export async function setLessonReaction(db: Database, userId: number, lessonId: number, value: 1 | -1 | null): Promise<void> {
  if (value === null) {
    await db.delete(lessonReactions).where(and(eq(lessonReactions.userId, userId), eq(lessonReactions.lessonId, lessonId)));
    return;
  }
  await db
    .insert(lessonReactions)
    .values({ userId, lessonId, value })
    .onConflictDoUpdate({ target: [lessonReactions.userId, lessonReactions.lessonId], set: { value } });
}

export async function getLessonReaction(db: Database, userId: number, lessonId: number): Promise<1 | -1 | null> {
  const [row] = await db
    .select({ value: lessonReactions.value })
    .from(lessonReactions)
    .where(and(eq(lessonReactions.userId, userId), eq(lessonReactions.lessonId, lessonId)))
    .limit(1);
  return row ? (row.value === 1 ? 1 : -1) : null;
}
