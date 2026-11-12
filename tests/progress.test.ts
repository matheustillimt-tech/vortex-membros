import { beforeAll, expect, test } from "vitest";
import { createTestDb } from "./helpers/db";
import { lessons, modules, products, showcases, users } from "@/db/schema";
import type { Database } from "@/db";
import type { User } from "@/lib/auth/sessions";
import { getLessonReaction, getProductProgress, setLessonCompleted, setLessonReaction } from "@/lib/progress";

let db: Database;
let aluno: User;
let produtoId: number;
let emptyProductId: number;
const aulas: number[] = [];

beforeAll(async () => {
  db = await createTestDb();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t1" }).returning();
  const [sc] = await db.insert(showcases).values({ name: "S", position: 1, status: "published" }).returning();
  const mkProduct = async (name: string) =>
    (await db.insert(products).values({ showcaseId: sc.id, name, status: "published" }).returning())[0].id;
  produtoId = await mkProduct("P");
  emptyProductId = await mkProduct("Vazio");
  const mkMod = async (status: "published" | "hidden", deletedAt?: Date) =>
    (await db.insert(modules).values({ productId: produtoId, title: "M", position: 1, status, deletedAt }).returning())[0].id;
  const m1 = await mkMod("published");
  const mHidden = await mkMod("hidden");
  const mDeleted = await mkMod("published", new Date());
  const mkLesson = async (moduleId: number, status: "published" | "hidden", deletedAt?: Date) =>
    (await db.insert(lessons).values({ moduleId, title: "L", status, deletedAt }).returning())[0].id;
  for (let i = 0; i < 4; i++) aulas.push(await mkLesson(m1, "published"));
  await mkLesson(m1, "hidden");
  await mkLesson(m1, "published", new Date());
  await mkLesson(mHidden, "published");
  await mkLesson(mDeleted, "published");
});

test("progresso conta só aulas publicadas e é idempotente", async () => {
  await setLessonCompleted(db, aluno.id, aulas[0], true);
  await setLessonCompleted(db, aluno.id, aulas[0], true);
  await setLessonCompleted(db, aluno.id, aulas[1], true);
  expect(await getProductProgress(db, aluno.id, produtoId)).toEqual({ completed: 2, total: 4, percent: 50 });
  await setLessonCompleted(db, aluno.id, aulas[0], false);
  await setLessonCompleted(db, aluno.id, aulas[0], false);
  expect((await getProductProgress(db, aluno.id, produtoId)).completed).toBe(1);
});

test("percent arredonda e total 0 dá 0", async () => {
  await setLessonCompleted(db, aluno.id, aulas[2], true);
  expect(await getProductProgress(db, aluno.id, produtoId)).toEqual({ completed: 2, total: 4, percent: 50 });
  await setLessonCompleted(db, aluno.id, aulas[3], true);
  await setLessonCompleted(db, aluno.id, aulas[0], true);
  expect((await getProductProgress(db, aluno.id, produtoId)).percent).toBe(100);
  expect(await getProductProgress(db, aluno.id, emptyProductId)).toEqual({ completed: 0, total: 0, percent: 0 });
});

test("reação: curtir, trocar e remover", async () => {
  expect(await getLessonReaction(db, aluno.id, aulas[0])).toBeNull();
  await setLessonReaction(db, aluno.id, aulas[0], 1);
  expect(await getLessonReaction(db, aluno.id, aulas[0])).toBe(1);
  await setLessonReaction(db, aluno.id, aulas[0], -1);
  expect(await getLessonReaction(db, aluno.id, aulas[0])).toBe(-1);
  await setLessonReaction(db, aluno.id, aulas[0], null);
  expect(await getLessonReaction(db, aluno.id, aulas[0])).toBeNull();
});
