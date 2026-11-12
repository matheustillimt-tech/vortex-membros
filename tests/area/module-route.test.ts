import { afterEach, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../helpers/db";
import { setDbForTests } from "@/db";
import { lessons, modules, products, showcases, users } from "@/db/schema";
import { createSession } from "@/lib/auth/sessions";
import { GET } from "@/app/area/conteudo/modulo/[id]/route";

afterEach(() => setDbForTests(null));

async function setup() {
  const db = await createTestDb();
  setDbForTests(db);
  const [u] = await db
    .insert(users)
    .values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "abc" })
    .returning();
  const [sc] = await db.insert(showcases).values({ name: "S", status: "published" }).returning();
  const [p] = await db.insert(products).values({ showcaseId: sc.id, name: "P", status: "published", isFree: true }).returning();
  const [m] = await db.insert(modules).values({ productId: p.id, title: "M", status: "published" }).returning();
  const [hidden] = await db
    .insert(lessons)
    .values({ moduleId: m.id, title: "Oculta", position: 0, status: "hidden" })
    .returning();
  const [second] = await db.insert(lessons).values({ moduleId: m.id, title: "L2", position: 2, status: "published" }).returning();
  const [first] = await db.insert(lessons).values({ moduleId: m.id, title: "L1", position: 1, status: "published" }).returning();
  const [empty] = await db.insert(modules).values({ productId: p.id, title: "Vazio", status: "published" }).returning();
  const [locked] = await db.insert(products).values({ showcaseId: sc.id, name: "Pago", status: "published", offerUrl: "https://pay.x/a" }).returning();
  const [lockedModule] = await db.insert(modules).values({ productId: locked.id, title: "ML", status: "published" }).returning();
  await db.insert(lessons).values({ moduleId: lockedModule.id, title: "LL", status: "published" });
  const [hiddenModule] = await db.insert(modules).values({ productId: p.id, title: "MH", status: "hidden" }).returning();
  await db.insert(lessons).values({ moduleId: hiddenModule.id, title: "LH", status: "published" });
  const { token } = await createSession(db, u.id, { remember: false });
  return { token, moduleId: m.id, emptyModuleId: empty.id, first, second, hidden, lockedProductId: locked.id, lockedModuleId: lockedModule.id, hiddenModuleId: hiddenModule.id };
}

const call = (id: string, token?: string) =>
  GET(new NextRequest(`http://x/area/conteudo/modulo/${id}`, { headers: token ? { cookie: `am_session=${token}` } : {} }), {
    params: Promise.resolve({ id }),
  });

test("módulo redireciona para a primeira aula visível", async () => {
  const { token, moduleId, first } = await setup();
  const res = await call(String(moduleId), token);
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toMatch(new RegExp(`/area/conteudo/aula/${first.id}$`));
});

test("módulo inexistente vai para a home", async () => {
  const { token } = await setup();
  const res = await call("123", token);
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toMatch(/\/area\/vitrine\/home$/);
});

test("módulo sem aula visível ou id inválido vai para a home", async () => {
  const { token, emptyModuleId } = await setup();
  for (const id of [String(emptyModuleId), "abc", "99999999999999999999"]) {
    const res = await call(id, token);
    expect(res.headers.get("location"), id).toMatch(/\/area\/vitrine\/home$/);
  }
});

test("módulo de produto sem acesso vai para a listagem do produto (tela de oferta)", async () => {
  const { token, lockedModuleId, lockedProductId } = await setup();
  const res = await call(String(lockedModuleId), token);
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toMatch(new RegExp(`/area/conteudo/listagem/${lockedProductId}$`));
});

test("módulo oculto continua indo para a home", async () => {
  const { token, hiddenModuleId } = await setup();
  const res = await call(String(hiddenModuleId), token);
  expect(res.headers.get("location")).toMatch(/\/area\/vitrine\/home$/);
});

test("sem sessão vai ao login", async () => {
  const { moduleId } = await setup();
  const res = await call(String(moduleId));
  expect(res.headers.get("location")).toMatch(/\/auth\/login$/);
});
