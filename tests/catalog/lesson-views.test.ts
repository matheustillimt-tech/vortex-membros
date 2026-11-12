import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { lessonViews, sessions, users } from "@/db/schema";
import { createSession } from "@/lib/auth/sessions";
import { recordLessonView } from "@/lib/catalog/lesson-views";

const t0 = new Date("2026-10-16T12:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);

let db: Database;
let student: { id: number; role: string };
let admin: { id: number; role: string };
beforeEach(async () => {
  db = await createTestDb();
  [student] = await db.insert(users).values({ email: "s@x.com", name: "s", role: "student", passwordHash: "x", loginToken: "ts" }).returning();
  [admin] = await db.insert(users).values({ email: "a@x.com", name: "a", role: "admin", passwordHash: "x", loginToken: "ta" }).returning();
});

const rows = () => db.select().from(lessonViews);

test("1ª visualização cria; outra em menos de 30 min não soma; depois de 30 min soma", async () => {
  const { token } = await createSession(db, student.id, { remember: true });
  await recordLessonView(db, { user: student, lessonId: 7, sessionToken: token, now: t0 });
  await recordLessonView(db, { user: student, lessonId: 7, sessionToken: token, now: at(29) });
  expect(await rows()).toEqual([{ userId: student.id, lessonId: 7, views: 1, firstViewedAt: t0, lastViewedAt: t0 }]);
  await recordLessonView(db, { user: student, lessonId: 7, sessionToken: token, now: at(31) });
  await recordLessonView(db, { user: student, lessonId: 8, sessionToken: null, now: at(31) });
  expect(await rows()).toEqual(
    expect.arrayContaining([
      { userId: student.id, lessonId: 7, views: 2, firstViewedAt: t0, lastViewedAt: at(31) },
      { userId: student.id, lessonId: 8, views: 1, firstViewedAt: at(31), lastViewedAt: at(31) },
    ]),
  );
});

test("admin e sessão de 'entrar como o aluno' não contam", async () => {
  await recordLessonView(db, { user: admin, lessonId: 7, sessionToken: null, now: t0 });
  const { token } = await createSession(db, student.id, { remember: false });
  await db.update(sessions).set({ impersonatedBy: admin.id });
  await recordLessonView(db, { user: student, lessonId: 7, sessionToken: token, now: t0 });
  expect(await rows()).toEqual([]);
});
