import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { lessons, modules, productAccess, products, showcases, termsAcceptance, users } from "@/db/schema";
import { createSession, type User } from "@/lib/auth/sessions";
import { acceptTerms, getPendingTerms, needsTermsAcceptance, termsNextPath, termsPagePath } from "@/lib/catalog/terms";

const session = vi.hoisted(() => ({ user: null as User | null, impersonatedBy: null as number | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => session.user,
  getCurrentSession: async () => (session.user ? { user: session.user, impersonatedBy: session.impersonatedBy, expiresAt: new Date() } : null),
}));
class Redirect extends Error {
  constructor(public url: string) {
    super(url);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: vi.fn(),
}));

import { acceptTermsAction } from "@/app/area/conteudo/termo/[productId]/actions";
import { GET as moduleRoute } from "@/app/area/conteudo/modulo/[id]/route";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
});
afterEach(() => setDbForTests(null));

async function setup(opts: { termsEnabled?: boolean; termsHtml?: string | null } = {}) {
  const [student] = await db
    .insert(users)
    .values({ email: "s@x.com", name: "S", role: "student", passwordHash: "x", loginToken: "t1" })
    .returning();
  const [admin] = await db
    .insert(users)
    .values({ email: "a@x.com", name: "A", role: "admin", passwordHash: "x", loginToken: "t2" })
    .returning();
  const [sc] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  const [p] = await db
    .insert(products)
    .values({
      showcaseId: sc.id,
      name: "Curso",
      status: "published",
      termsEnabled: opts.termsEnabled ?? true,
      termsHtml: opts.termsHtml === undefined ? "<p>Regras</p><script>x()</script>" : opts.termsHtml,
    })
    .returning();
  await db.insert(productAccess).values({ userId: student.id, productId: p.id, source: "manual" });
  const [m] = await db.insert(modules).values({ productId: p.id, title: "M", status: "published" }).returning();
  const [l] = await db.insert(lessons).values({ moduleId: m.id, title: "L", status: "published" }).returning();
  return { student: student as User, admin: admin as User, productId: p.id, moduleId: m.id, lessonId: l.id };
}

function fd(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}
async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof Redirect) return e.url;
    throw e;
  }
  throw new Error("sem redirect");
}

test("needsTermsAcceptance: pendente até aceitar; admin nunca; termo desligado ou vazio não bloqueia", async () => {
  const { student, admin, productId } = await setup();
  expect(await needsTermsAcceptance(db, student, productId)).toBe(true);
  expect(await needsTermsAcceptance(db, admin, productId)).toBe(false);
  expect(await acceptTerms(db, student, productId)).toBe(true);
  expect(await needsTermsAcceptance(db, student, productId)).toBe(false);
  expect(await acceptTerms(db, student, productId)).toBe(false); // já aceito: nada a fazer
  expect(await db.select().from(termsAcceptance)).toHaveLength(1);

  await db.update(products).set({ termsEnabled: false });
  await db.delete(termsAcceptance);
  expect(await needsTermsAcceptance(db, student, productId)).toBe(false);
  await db.update(products).set({ termsEnabled: true, termsHtml: "<script>só script</script>" });
  expect(await needsTermsAcceptance(db, student, productId)).toBe(false);
});

test("tela do termo: HTML sanitizado; sem acesso não aceita nem mostra", async () => {
  const { student, productId } = await setup();
  const terms = await getPendingTerms(db, student, productId);
  expect(terms).toEqual({ productId, productName: "Curso", html: "<p>Regras</p>" });
  await db.delete(productAccess);
  expect(await getPendingTerms(db, student, productId)).toBeNull();
  expect(await acceptTerms(db, student, productId)).toBe(false);
  expect(await db.select().from(termsAcceptance)).toHaveLength(0);
});

test("destinos: só caminho interno; sem destino → listagem do produto", () => {
  expect(termsNextPath(5, "/area/conteudo/aula/9")).toBe("/area/conteudo/aula/9");
  expect(termsNextPath(5, "https://evil.com")).toBe("/area/vitrine/home");
  expect(termsNextPath(5, "//evil.com")).toBe("/area/vitrine/home");
  expect(termsNextPath(5, null)).toBe("/area/conteudo/listagem/5");
  expect(termsPagePath(5, "/area/conteudo/aula/9")).toBe("/area/conteudo/termo/5?next=%2Farea%2Fconteudo%2Faula%2F9");
});

const callModule = (id: number, token: string) =>
  moduleRoute(new NextRequest(`http://x/area/conteudo/modulo/${id}`, { headers: { cookie: `am_session=${token}` } }), {
    params: Promise.resolve({ id: String(id) }),
  });

test("aula de produto com termo pendente redireciona ao termo; depois do aceite, abre", async () => {
  const { student, productId, moduleId, lessonId } = await setup();
  const { token } = await createSession(db, student.id, { remember: false });

  const before = await callModule(moduleId, token);
  expect(new URL(before.headers.get("location")!).pathname + new URL(before.headers.get("location")!).search).toBe(
    termsPagePath(productId, `/area/conteudo/aula/${lessonId}`),
  );

  session.user = student;
  const back = await redirectOf(acceptTermsAction(fd({ productId, next: `/area/conteudo/aula/${lessonId}` })));
  expect(back).toBe(`/area/conteudo/aula/${lessonId}`);
  expect(await needsTermsAcceptance(db, student, productId)).toBe(false);

  const after = await callModule(moduleId, token);
  expect(after.headers.get("location")).toMatch(new RegExp(`/area/conteudo/aula/${lessonId}$`));
});

test("aceite: destino externo vira home; admin passa direto sem gravar; sem sessão vai ao login", async () => {
  const { student, admin, productId } = await setup();
  session.user = student;
  expect(await redirectOf(acceptTermsAction(fd({ productId, next: "https://evil.com/x" })))).toBe("/area/vitrine/home");

  await db.delete(termsAcceptance);
  session.user = admin;
  expect(await redirectOf(acceptTermsAction(fd({ productId, next: "/area/conteudo/listagem/1" })))).toBe("/area/conteudo/listagem/1");
  expect(await db.select().from(termsAcceptance)).toHaveLength(0);

  session.user = null;
  expect(await redirectOf(acceptTermsAction(fd({ productId })))).toBe("/auth/login");
  session.user = student;
  expect(await redirectOf(acceptTermsAction(fd({ productId: "1;x" })))).toBe("/area/vitrine/home");
  expect(await db.select().from(termsAcceptance)).toHaveLength(0);
});

test("personificação: o admin 'como o aluno' não aceita o termo do produto pelo aluno", async () => {
  const { student, admin, productId } = await setup();
  session.user = student;
  session.impersonatedBy = admin.id;
  try {
    expect(await redirectOf(acceptTermsAction(fd({ productId, next: "/area/conteudo/listagem/1" })))).toBe("/area/conteudo/listagem/1");
    expect(await db.select().from(termsAcceptance)).toHaveLength(0);
    expect(await needsTermsAcceptance(db, student, productId)).toBe(true);
  } finally {
    session.impersonatedBy = null;
  }
});
