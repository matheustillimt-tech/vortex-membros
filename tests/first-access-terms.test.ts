import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "./helpers/db";
import { setDbForTests, type Database } from "@/db";
import { platformSettings, platformTermsAcceptance, users } from "@/db/schema";
import { createSession, type User } from "@/lib/auth/sessions";
import { saveFirstAccessTerms } from "@/lib/admin/platform-settings";
import { getCachedPlatformSettings, invalidatePlatformSettingsCache, SETTINGS_TTL_MS } from "@/lib/settings";

const session = vi.hoisted(() => ({ user: null as User | null, impersonatedBy: null as number | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => session.user,
  getCurrentSession: async () => (session.user ? { user: session.user, impersonatedBy: session.impersonatedBy, expiresAt: new Date() } : null),
  requireUser: async () => session.user,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
  notFound: vi.fn(),
}));

import { proxy } from "@/proxy";
import {
  acceptFirstAccessTerms,
  blockedByFirstAccessTerms,
  firstAccessTermsUrl,
  getPendingFirstAccessTerms,
  termsHash,
} from "@/lib/catalog/first-access-terms";
import { acceptFirstAccessTermsAction } from "@/app/area/termo-primeiro-acesso/actions";
import { reactAction, toggleCompletedAction } from "@/app/area/conteudo/aula/[id]/actions";
import { acceptTermsAction } from "@/app/area/conteudo/termo/[productId]/actions";
import { changePasswordAction, updateProfileAction } from "@/app/area/aluno/perfil/actions";

let db: Database;
let student: User;
let admin: User;
let studentToken: string;
let adminToken: string;

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  [student, admin] = await db
    .insert(users)
    .values([
      { email: "s@x.com", name: "S", role: "student", passwordHash: "x", loginToken: "t1" },
      { email: "a@x.com", name: "A", role: "admin", passwordHash: "x", loginToken: "t2" },
    ])
    .returning();
  studentToken = (await createSession(db, student.id, { remember: false })).token;
  adminToken = (await createSession(db, admin.id, { remember: false })).token;
  session.user = student;
  session.impersonatedBy = null;
});
afterEach(() => setDbForTests(null));

async function setTerms(enabled: boolean, html: string | null) {
  await db
    .insert(platformSettings)
    .values({ id: 1, data: { firstAccessTerms: { enabled, html } } })
    .onConflictDoUpdate({ target: platformSettings.id, set: { data: { firstAccessTerms: { enabled, html } } } });
  // Escrita direta no banco: limpa o cache como a action de salvar faz.
  invalidatePlatformSettingsCache(db);
}

function req(path: string, token: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://x${path}`, {
    method: init.method ?? "GET",
    headers: { cookie: `am_session=${token}`, ...(init.headers ?? {}) },
  });
}
function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

// ---------- dados e versão ----------

test("pendente só com termo ligado e com texto; admin nunca", async () => {
  expect(await getPendingFirstAccessTerms(db, student)).toBeNull(); // sem linha de configurações
  await setTerms(false, "<p>Regras</p>");
  expect(await getPendingFirstAccessTerms(db, student)).toBeNull();
  await setTerms(true, "   ");
  expect(await getPendingFirstAccessTerms(db, student)).toBeNull();
  await setTerms(true, "<p>Regras</p><script>x</script>");
  const p = await getPendingFirstAccessTerms(db, student);
  expect(p).toEqual({ html: "<p>Regras</p>", hash: termsHash("<p>Regras</p>") });
  expect(await getPendingFirstAccessTerms(db, admin)).toBeNull();
});

test("aceite guarda o hash; mudar o texto pede de novo; hash de outra versão não vale", async () => {
  await setTerms(true, "<p>Versão 1</p>");
  const v1 = (await getPendingFirstAccessTerms(db, student))!;
  expect(await acceptFirstAccessTerms(db, student, "outro-hash")).toBe(false);
  expect(await acceptFirstAccessTerms(db, student, v1.hash)).toBe(true);
  expect(await getPendingFirstAccessTerms(db, student)).toBeNull();
  expect(await acceptFirstAccessTerms(db, student, v1.hash)).toBe(false); // nada pendente

  await setTerms(true, "<p>Versão 2</p>");
  const v2 = (await getPendingFirstAccessTerms(db, student))!;
  expect(v2.hash).not.toBe(v1.hash);
  expect(await acceptFirstAccessTerms(db, student, v1.hash)).toBe(false); // viu a versão antiga
  expect(await acceptFirstAccessTerms(db, student, v2.hash)).toBe(true);
  const rows = await db.select().from(platformTermsAcceptance);
  expect(rows).toEqual([expect.objectContaining({ userId: student.id, termsHash: v2.hash })]);
  // voltar ao texto 1 também pede de novo
  await setTerms(true, "<p>Versão 1</p>");
  expect(await blockedByFirstAccessTerms(db, student)).toBe(true);
});

test("versão salva pelo painel: o hash vem gravado e é o mesmo do cálculo antigo (aceites antigos valem)", async () => {
  await saveFirstAccessTerms(db, admin, { enabled: true, blocks: { blocks: [{ type: "paragraph", data: { text: "Regras" } }] } });
  const [row] = await db.select().from(platformSettings);
  const stored = (row.data as { firstAccessTerms: { html: string; hash: string } }).firstAccessTerms;
  expect(stored.hash).toBe(termsHash(stored.html));
  expect((await getPendingFirstAccessTerms(db, student))!.hash).toBe(stored.hash);
});

test("cache das configurações: velho dizendo 'pendente' confere no banco; termo recém-ligado vale após o TTL", async () => {
  await setTerms(true, "<p>V1</p>");
  await getCachedPlatformSettings(db); // cache com o termo ligado
  // Outra instância desligou o termo (sem limpar o cache desta): não prende o aluno.
  await db.update(platformSettings).set({ data: { firstAccessTerms: { enabled: false, html: "<p>V1</p>" } } });
  expect(await blockedByFirstAccessTerms(db, student)).toBe(false);

  // Cache dizendo "desligado" e termo ligado em outra instância: só vale depois do TTL.
  invalidatePlatformSettingsCache(db);
  await getCachedPlatformSettings(db);
  await db.update(platformSettings).set({ data: { firstAccessTerms: { enabled: true, html: "<p>V1</p>" } } });
  expect(await blockedByFirstAccessTerms(db, student)).toBe(false);
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(Date.now() + SETTINGS_TTL_MS + 1);
    expect(await blockedByFirstAccessTerms(db, student)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

// ---------- proxy ----------

test("proxy: com termo pendente, GET vai à tela do termo e POST/Next-Action levam 403", async () => {
  await setTerms(true, "<p>Regras</p>");
  let res = await proxy(req("/area/vitrine/home?x=1", studentToken));
  expect(res.status).toBe(307);
  const loc = new URL(res.headers.get("location")!);
  expect(loc.pathname).toBe("/area/termo-primeiro-acesso");
  expect(loc.searchParams.get("next")).toBe("/area/vitrine/home?x=1");

  res = await proxy(req("/area/conteudo/aula/1", studentToken, { method: "POST", headers: { "next-action": "abc" } }));
  expect(res.status).toBe(403);
  res = await proxy(req("/area/aluno/perfil", studentToken, { method: "POST" }));
  expect(res.status).toBe(403);
  res = await proxy(req("/area/vitrine/home", studentToken, { headers: { "next-action": "abc" } }));
  expect(res.status).toBe(403);

  // a tela do termo e a action dela ficam livres
  for (const r of [
    req("/area/termo-primeiro-acesso?next=/area/x", studentToken),
    req("/area/termo-primeiro-acesso", studentToken, { method: "POST", headers: { "next-action": "abc" } }),
  ]) {
    res = await proxy(r);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  }
  // admin e painel não são afetados
  res = await proxy(req("/area/vitrine/home", adminToken));
  expect(res.headers.get("x-middleware-next")).toBe("1");
  res = await proxy(req("/dashboard/content/products", adminToken));
  expect(res.headers.get("x-middleware-next")).toBe("1");
});

test("proxy: sem termo (padrão) ou depois do aceite, segue normal", async () => {
  let res = await proxy(req("/area/vitrine/home", studentToken));
  expect(res.headers.get("x-middleware-next")).toBe("1");
  await setTerms(true, "<p>Regras</p>");
  await acceptFirstAccessTerms(db, student, (await getPendingFirstAccessTerms(db, student))!.hash);
  res = await proxy(req("/area/vitrine/home", studentToken));
  expect(res.headers.get("x-middleware-next")).toBe("1");
  res = await proxy(req("/area/aluno/perfil", studentToken, { method: "POST", headers: { "next-action": "abc" } }));
  expect(res.headers.get("x-middleware-next")).toBe("1");
});

test("firstAccessTermsUrl só aceita destino interno", () => {
  expect(firstAccessTermsUrl("/area/x?y=1")).toBe("/area/termo-primeiro-acesso?next=%2Farea%2Fx%3Fy%3D1");
  expect(firstAccessTermsUrl("//evil.com")).toBe("/area/termo-primeiro-acesso?next=%2Farea%2Fvitrine%2Fhome");
});

// ---------- server actions ----------

test("actions da área recusam enquanto o termo está pendente (não só o proxy)", async () => {
  await setTerms(true, "<p>Regras</p>");
  expect(await toggleCompletedAction(1, true)).toEqual({ ok: false });
  expect(await reactAction(1, 1)).toEqual({ ok: false });
  expect(await updateProfileAction(null, fd({ name: "Novo" }))).toEqual({ ok: false, error: "Aceite o termo de uso para continuar." });
  expect(await changePasswordAction(null, fd({ current: "x", next: "y", confirm: "y" }))).toEqual({
    ok: false,
    error: "Aceite o termo de uso para continuar.",
  });
  await expect(acceptTermsAction(fd({ productId: "5", next: "/area/conteudo/listagem/5" }))).rejects.toThrow(
    "redirect:/area/termo-primeiro-acesso?next=%2Farea%2Fconteudo%2Flistagem%2F5",
  );
});

test("acceptFirstAccessTermsAction grava a versão vista e segue para next (seguro)", async () => {
  await setTerms(true, "<p>Regras</p>");
  const { hash } = (await getPendingFirstAccessTerms(db, student))!;
  // hash velho/forjado: volta à tela do termo, nada gravado
  await expect(acceptFirstAccessTermsAction(fd({ hash: "x", next: "/area/aluno/perfil" }))).rejects.toThrow(
    "redirect:/area/termo-primeiro-acesso?next=%2Farea%2Faluno%2Fperfil",
  );
  expect(await db.select().from(platformTermsAcceptance)).toEqual([]);
  await expect(acceptFirstAccessTermsAction(fd({ hash, next: "https://evil.com" }))).rejects.toThrow("redirect:/area/vitrine/home");
  expect(await blockedByFirstAccessTerms(db, student)).toBe(false);
  session.user = null;
  await expect(acceptFirstAccessTermsAction(fd({ hash }))).rejects.toThrow("redirect:/auth/login");
});

test("personificação: o admin vê a área sem o bloqueio do termo e nunca aceita pelo aluno", async () => {
  await setTerms(true, "<p>Regras</p>");
  const imp = (await createSession(db, student.id, { remember: false, impersonatedBy: admin.id })).token;
  const res = await proxy(req("/area/vitrine/home", imp));
  expect(res.headers.get("location")).toBeNull();
  expect(res.headers.get("x-middleware-next")).toBe("1");
  // a sessão normal do aluno continua bloqueada
  expect(new URL((await proxy(req("/area/vitrine/home", studentToken))).headers.get("location")!).pathname).toBe("/area/termo-primeiro-acesso");

  const { hash } = (await getPendingFirstAccessTerms(db, student))!;
  session.impersonatedBy = admin.id;
  await expect(acceptFirstAccessTermsAction(fd({ hash, next: "/area/aluno/perfil" }))).rejects.toThrow("redirect:/area/aluno/perfil");
  expect(await db.select().from(platformTermsAcceptance)).toEqual([]);
  expect(await blockedByFirstAccessTerms(db, student)).toBe(true);
});
