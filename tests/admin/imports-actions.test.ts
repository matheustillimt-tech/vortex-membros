import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { buildXlsx } from "../helpers/xlsx";
import { setDbForTests, type Database } from "@/db";
import { productAccess, products, showcases, studentImports, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
const afterFns = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => afterFns.push(fn) }));

import * as a from "@/app/dashboard/students/imports/actions";

let db: Database;
let admin: User;
let P: number;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  [admin] = await db.insert(users).values({ email: "a@x.com", name: "a", role: "admin", passwordHash: "x", loginToken: "ta" }).returning();
  const [s] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  [{ id: P }] = await db.insert(products).values({ showcaseId: s.id, name: "P", status: "published" }).returning();
  session.user = admin;
  afterFns.length = 0;
  revalidatePath.mockClear();
  delete process.env.CRON_SECRET;
});
afterEach(() => setDbForTests(null));

const fileFd = (data: Uint8Array | string, name = "alunos.xlsx") => {
  const fd = new FormData();
  fd.set("file", new File([data as BlobPart], name));
  return fd;
};

test("envio cria a importação, responde e processa depois (after)", async () => {
  const res = await a.uploadImportAction(fileFd(buildXlsx([["status", "produto_id", "cliente_email"], ["ativo", P, "n@x.com"]])));
  expect(res).toMatchObject({ ok: true });
  const [imp] = await db.select().from(studentImports);
  expect(imp).toMatchObject({ status: "queued", total: 1 });
  expect(afterFns).toHaveLength(1);
  await afterFns[0]();
  expect((await db.select().from(studentImports))[0]).toMatchObject({ status: "done", created: 1 });
  expect(await db.select().from(productAccess)).toHaveLength(1);
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/students/imports");
});

test("validação, erros e permissões", async () => {
  expect(await a.uploadImportAction(new FormData())).toEqual({ ok: false, error: "Selecione um arquivo XLSX." });
  expect(await a.uploadImportAction(fileFd("a,b\n1,2", "x.xlsx"))).toEqual({ ok: false, error: "Envie um arquivo XLSX." });
  const { id } = (await a.uploadImportAction(fileFd(buildXlsx([["status", "produto_id", "cliente_email"], ["0", P, "n@x.com"]])))) as { ok: true; id: number };
  await afterFns[0]();
  expect(await a.importErrorsAction(id)).toEqual({ ok: true, errors: [{ row: 2, message: "Status inativo: linha ignorada." }] });
  const fd = new FormData();
  fd.set("id", String(id));
  expect(await a.trashImportAction(fd)).toEqual({ ok: true });
  expect(await a.restoreImportAction(fd)).toEqual({ ok: true });
  expect(await a.restoreImportAction(fd)).toEqual({ ok: false, error: "Importação não encontrada." });

  session.user = { id: 5, role: "student" } as User;
  expect((await a.uploadImportAction(fileFd(buildXlsx([["status", "produto_id", "cliente_email"], ["1", P, "z@x.com"]])))).ok).toBe(false);
  expect((await a.trashImportAction(fd)).ok).toBe(false);
  expect((await a.importErrorsAction(id)).ok).toBe(false);
  expect(await db.select().from(studentImports)).toHaveLength(1);
});

test("continuação: só com o CRON_SECRET; responde 202 e processa no after()", async () => {
  const { POST } = await import("@/app/api/imports/[id]/process/route");
  const { NextRequest } = await import("next/server");
  const res0 = (await a.uploadImportAction(fileFd(buildXlsx([["status", "produto_id", "cliente_email"], ["1", P, "c@x.com"]])))) as { ok: true; id: number };
  afterFns.length = 0;
  const call = (auth?: string, id = String(res0.id)) =>
    POST(new NextRequest(`http://x/api/imports/${id}/process`, { method: "POST", headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({ id }) });
  expect((await call("Bearer s")).status).toBe(401); // sem CRON_SECRET configurado
  process.env.CRON_SECRET = "s";
  expect((await call("Bearer errado")).status).toBe(401);
  expect((await call("Bearer s", "abc")).status).toBe(404);
  expect(afterFns).toHaveLength(0);
  expect((await call("Bearer s")).status).toBe(202);
  await afterFns[0]();
  expect((await db.select().from(studentImports))[0]).toMatchObject({ status: "done", created: 1 });
});
