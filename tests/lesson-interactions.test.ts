import { beforeAll, expect, test } from "vitest";
import { createTestDb } from "./helpers/db";
import { lessons, modules, productAccess, products, showcases, users } from "@/db/schema";
import type { Database } from "@/db";
import type { User } from "@/lib/auth/sessions";
import { getLessonReaction } from "@/lib/progress";
import { getLessonPage } from "@/lib/catalog/queries";
import { reactToLesson, toggleLessonCompleted } from "@/lib/lesson-interactions";

let db: Database;
let aluno: User;
const ids: Record<string, number> = {};

beforeAll(async () => {
  db = await createTestDb();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t" }).returning();
  const [sc] = await db.insert(showcases).values({ name: "S", status: "published" }).returning();
  const pr = async (name: string) => (await db.insert(products).values({ showcaseId: sc.id, name, status: "published" }).returning())[0].id;
  ids.pOk = await pr("Liberado");
  ids.pLocked = await pr("Bloqueado");
  await db.insert(productAccess).values({ userId: aluno.id, productId: ids.pOk, source: "manual" });
  const les = async (productId: number, status: "published" | "hidden" = "published") => {
    const [m] = await db.insert(modules).values({ productId, title: "M", status: "published" }).returning();
    return (await db.insert(lessons).values({ moduleId: m.id, title: "L", status }).returning())[0].id;
  };
  ids.lOk = await les(ids.pOk);
  ids.lLocked = await les(ids.pLocked);
  ids.lHidden = await les(ids.pOk, "hidden");
});

const completed = async (lessonId: number) => {
  const r = await getLessonPage(db, aluno, lessonId);
  return r.status === "ok" && r.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)?.completed;
};

test("marca e desmarca como visto em aula com acesso", async () => {
  expect(await toggleLessonCompleted(db, aluno, ids.lOk, true)).toBe(true);
  expect(await completed(ids.lOk)).toBe(true);
  expect(await toggleLessonCompleted(db, aluno, ids.lOk, false)).toBe(true);
  expect(await completed(ids.lOk)).toBe(false);
});

test("recusa marcar aula de produto sem acesso, oculta ou inexistente", async () => {
  for (const id of [ids.lLocked, ids.lHidden, 987654321]) {
    expect(await toggleLessonCompleted(db, aluno, id, true), String(id)).toBe(false);
  }
  const rows = await db.select().from((await import("@/db/schema")).lessonProgress);
  expect(rows).toHaveLength(0);
});

test("reage e remove a reação em aula com acesso", async () => {
  expect(await reactToLesson(db, aluno, ids.lOk, 1)).toBe(true);
  expect(await getLessonReaction(db, aluno.id, ids.lOk)).toBe(1);
  expect(await reactToLesson(db, aluno, ids.lOk, -1)).toBe(true);
  expect(await getLessonReaction(db, aluno.id, ids.lOk)).toBe(-1);
  expect(await reactToLesson(db, aluno, ids.lOk, null)).toBe(true);
  expect(await getLessonReaction(db, aluno.id, ids.lOk)).toBeNull();
});

test("recusa reação sem acesso ou com valor inválido", async () => {
  expect(await reactToLesson(db, aluno, ids.lLocked, 1)).toBe(false);
  expect(await getLessonReaction(db, aluno.id, ids.lLocked)).toBeNull();
  expect(await reactToLesson(db, aluno, ids.lOk, 5 as never)).toBe(false);
  expect(await toggleLessonCompleted(db, aluno, ids.lOk, "sim" as never)).toBe(false);
  expect(await toggleLessonCompleted(db, aluno, 1.5, true)).toBe(false);
});

test("termo pendente: marcar e reagir recusados até o aceite; admin isento", async () => {
  const { acceptTerms } = await import("@/lib/catalog/terms");
  const { lessonProgress } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(products).set({ termsEnabled: true, termsHtml: "<p>Termo</p>" }).where(eq(products.id, ids.pOk));
  try {
    expect(await toggleLessonCompleted(db, aluno, ids.lOk, true)).toBe(false);
    expect(await reactToLesson(db, aluno, ids.lOk, 1)).toBe(false);
    expect(await db.select().from(lessonProgress).where(eq(lessonProgress.userId, aluno.id))).toHaveLength(0);
    expect(await getLessonReaction(db, aluno.id, ids.lOk)).toBeNull();

    const [admin] = await db
      .insert(users)
      .values({ email: "adm@x.com", name: "Adm", role: "admin", passwordHash: "x", loginToken: "t-adm" })
      .returning();
    expect(await toggleLessonCompleted(db, admin as User, ids.lOk, true)).toBe(true);

    expect(await acceptTerms(db, aluno, ids.pOk)).toBe(true);
    expect(await toggleLessonCompleted(db, aluno, ids.lOk, true)).toBe(true);
    expect(await reactToLesson(db, aluno, ids.lOk, 1)).toBe(true);
  } finally {
    await db.update(products).set({ termsEnabled: false }).where(eq(products.id, ids.pOk));
  }
});
