import { beforeAll, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import { lessons, modules, productAccess, products, showcases, users } from "@/db/schema";
import type { Database } from "@/db";
import type { User } from "@/lib/auth/sessions";
import { getLessonPage } from "@/lib/catalog/queries";

// "Próximo módulo": primeira aula do próximo produto da MESMA vitrine; sem acesso → sem botão.
let db: Database;
let aluno: User;
const ids: Record<string, number> = {};

beforeAll(async () => {
  db = await createTestDb();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t" }).returning();
  const sc = async (name: string) => (await db.insert(showcases).values({ name, status: "published" }).returning())[0].id;
  const formacao = await sc("Formação");
  const outra = await sc("Outra vitrine");
  const pr = async (name: string, showcaseId: number, position: number, extra: Partial<typeof products.$inferInsert> = {}) =>
    (await db.insert(products).values({ name, showcaseId, position, status: "published", ...extra }).returning())[0].id;
  ids.inicio = await pr("INICIO DA JORNADA", formacao, 1);
  ids.vazio = await pr("Sem aulas", formacao, 2);
  ids.comunidade = await pr("COMUNIDADE", formacao, 3);
  ids.oculto = await pr("Oculto", formacao, 4, { status: "hidden" });
  ids.tiktok = await pr("Curso Extra", formacao, 5);
  ids.manual = await pr("Manual", outra, 1);
  await db.insert(productAccess).values(
    [ids.inicio, ids.comunidade, ids.manual].map((productId) => ({ userId: aluno.id, productId, source: "manual" as const })),
  );
  const aula = async (productId: number, title: string, modPos = 1, lessonPos = 1) => {
    const [m] = await db.insert(modules).values({ productId, title: `M-${title}`, position: modPos, status: "published" }).returning();
    return (await db.insert(lessons).values({ moduleId: m.id, title, position: lessonPos, status: "published" }).returning())[0].id;
  };
  ids.lInicio = await aula(ids.inicio, "Boas-vindas");
  ids.lComunidade2 = await aula(ids.comunidade, "Segunda", 2);
  ids.lComunidade1 = await aula(ids.comunidade, "Primeira", 1);
  ids.lOculto = await aula(ids.oculto, "Oculta");
  ids.lTiktok = await aula(ids.tiktok, "Extra 1");
  ids.lManual = await aula(ids.manual, "Manual 1");
});

test("leva à primeira aula do próximo produto da vitrine, pulando produto sem aulas", async () => {
  const r = await getLessonPage(db, aluno, ids.lInicio);
  expect(r).toMatchObject({ status: "ok", nextModule: { productId: ids.comunidade, name: "COMUNIDADE", lessonId: ids.lComunidade1 } });
});

test("próximo produto sem acesso → sem botão (não pula para o seguinte)", async () => {
  // Depois de COMUNIDADE vem Curso Extra (o oculto não conta), e o aluno não tem acesso a ele.
  const r = await getLessonPage(db, aluno, ids.lComunidade1);
  expect(r).toMatchObject({ status: "ok", nextModule: null });
});

test("último produto da vitrine e produto sozinho na vitrine → sem botão; nunca vai para outra vitrine", async () => {
  const [admin] = await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t2" }).returning();
  expect(await getLessonPage(db, admin, ids.lTiktok)).toMatchObject({ status: "ok", nextModule: null });
  expect(await getLessonPage(db, aluno, ids.lManual)).toMatchObject({ status: "ok", nextModule: null });
});
