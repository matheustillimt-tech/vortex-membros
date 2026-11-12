import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { banners } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as c from "@/lib/admin/content";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import * as a from "@/app/dashboard/content/banners/actions";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  session.user = admin;
  revalidatePath.mockClear();
});
afterEach(() => setDbForTests(null));

function fd(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}
const all = () => db.select().from(banners).orderBy(asc(banners.position), asc(banners.id));
const save = (id: number, extra: Record<string, string | number> = {}) =>
  a.saveBannerAction(
    fd({ id, name: "Principal", actionType: "none", desktopImageUrl: "/media/7", mobileImageUrl: "", videoUrl: "", mobileVideoUrl: "", heightPercent: "", ...extra }),
  );

test("não-admin (aluno ou sem sessão) é recusado e nada é gravado", async () => {
  const created = (await a.createBannerAction(fd({ name: "A" }))) as { ok: true; id: number };
  const snapshot = await all();
  for (const user of [student, null]) {
    session.user = user;
    const denied = { ok: false, error: "Acesso restrito a administradores." };
    expect(await a.createBannerAction(fd({ name: "X" }))).toEqual(denied);
    expect(await a.renameBannerAction(fd({ id: created.id, name: "X" }))).toEqual(denied);
    expect(await a.setBannerStatusAction(fd({ id: created.id, status: "hidden" }))).toEqual(denied);
    expect(await save(created.id, { name: "X" })).toEqual(denied);
    expect(await a.reorderBannersAction(fd({ ids: String(created.id) }))).toEqual(denied);
    expect(await a.trashBannerAction(fd({ id: created.id }))).toEqual(denied);
    expect(await a.restoreBannerAction(fd({ id: created.id }))).toEqual(denied);
  }
  expect(await all()).toEqual(snapshot);
});

test("CRUD: criar, salvar, status, reordenar, lixeira e restaurar; revalida painel e home", async () => {
  const s = await c.createShowcase(db, admin, { name: "V" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  const x = (await a.createBannerAction(fd({ name: "X" }))) as { ok: true; id: number };
  const y = (await a.createBannerAction(fd({ name: "Y" }))) as { ok: true; id: number };
  expect(x.ok && y.ok).toBe(true);
  expect(revalidatePath).toHaveBeenCalledWith("/area/vitrine/home");
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/content/banners");

  expect(await save(x.id, { actionType: "product", productId: p.id, heightPercent: "80" })).toEqual({ ok: true });
  let [row] = await db.select().from(banners).where(eq(banners.id, x.id));
  expect(row.config).toMatchObject({ action: { type: "product", productId: p.id }, desktopImageUrl: "/media/7", mobileImageUrl: null, heightPercent: 80 });

  expect(await save(x.id, { actionType: "external", linkUrl: "https://exemplo.com", newTab: "1" })).toEqual({ ok: true });
  [row] = await db.select().from(banners).where(eq(banners.id, x.id));
  expect(row.config.action).toEqual({ type: "external", url: "https://exemplo.com/", newTab: true });

  expect(await a.setBannerStatusAction(fd({ id: x.id, status: "hidden" }))).toEqual({ ok: true });
  expect(await a.renameBannerAction(fd({ id: x.id, name: "Renomeado" }))).toEqual({ ok: true });
  expect(await a.reorderBannersAction(fd({ ids: `${y.id},${x.id}` }))).toEqual({ ok: true });
  expect((await all()).map((r) => [r.id, r.name, r.status])).toEqual([
    [y.id, "Y", "hidden"],
    [x.id, "Renomeado", "hidden"],
  ]);

  expect(await a.trashBannerAction(fd({ id: y.id }))).toEqual({ ok: true });
  expect((await all()).find((r) => r.id === y.id)?.deletedAt).toBeInstanceOf(Date);
  expect(await a.restoreBannerAction(fd({ id: y.id }))).toEqual({ ok: true });
  expect((await all()).map((r) => r.id)).toEqual([x.id, y.id]);
});

test("entrada inválida é recusada sem gravar", async () => {
  const x = (await a.createBannerAction(fd({ name: "X" }))) as { ok: true; id: number };
  const y = (await a.createBannerAction(fd({ name: "Y" }))) as { ok: true; id: number };
  await save(x.id);
  const snapshot = await all();
  const cases: [() => Promise<unknown>, string][] = [
    [() => a.createBannerAction(fd({ name: "  " })), "Informe um nome."],
    [() => save(x.id, { actionType: "outro" }), "Requisição inválida."],
    [() => save(x.id, { actionType: "product", productId: "abc" }), "Escolha um produto."],
    [() => save(x.id, { actionType: "product", productId: 424242 }), "Escolha um produto."],
    [() => save(x.id, { actionType: "external", linkUrl: "javascript:alert(1)" }), "Informe um endereço de destino válido (http ou https)."],
    [() => save(x.id, { desktopImageUrl: "javascript:alert(1)" }), "Endereço de imagem inválido."],
    [() => save(x.id, { videoUrl: "ftp://x.com/v.mp4" }), "Endereço de vídeo inválido."],
    [() => save(x.id, { heightPercent: "-5" }), "Informe uma altura de 10 a 100%."],
    [() => save(x.id, { heightPercent: "500" }), "Informe uma altura de 10 a 100%."],
    [() => save(x.id, { id: "1;drop" }), "Requisição inválida."],
    [() => a.setBannerStatusAction(fd({ id: x.id, status: "deleted" })), "Status inválido."],
    [() => a.reorderBannersAction(fd({ ids: String(x.id) })), "Ordem inválida."],
    [() => a.reorderBannersAction(fd({ ids: `${x.id},${y.id},999` })), "Ordem inválida."],
    [() => a.reorderBannersAction(fd({ ids: `${x.id},abc` })), "Requisição inválida."],
    [() => a.restoreBannerAction(fd({ id: x.id })), "Não encontrado."],
  ];
  for (const [call, error] of cases) expect(await call()).toEqual({ ok: false, error });
  expect(await all()).toEqual(snapshot);
});
