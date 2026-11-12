import { and, eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { buildXlsx } from "../helpers/xlsx";
import type { Database } from "@/db";
import { emailOutbox, productAccess, products, showcases, studentImports, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { hashPassword } from "@/lib/auth/password";
import {
  createImport, getImportErrors, IMPORT_MAX_ROWS, IMPORT_UPLOAD_MAX_BYTES, listImports, normalizeDocument, normalizePhone, processImport, restoreImport,
  resumeStaleImports, trashImport,
} from "@/lib/students/import";

vi.mock("@/lib/auth/password", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/password")>();
  return { ...real, hashPassword: vi.fn(real.hashPassword) };
});

const appUrl = "https://area.test";
const HEADER = ["status", "produto_id", "cliente_email", "cliente_nome", "cliente_documento", "cliente_celular", "data_expiracao"];

let db: Database;
let admin: User;
let P1: number;
let P2: number;
const student = { id: 999, role: "student" } as User;

beforeEach(async () => {
  db = await createTestDb();
  [admin] = await db.insert(users).values({ email: "adm@x.com", name: "Adm", role: "admin", passwordHash: "x", loginToken: "ta" }).returning();
  const [s] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  [{ id: P1 }] = await db.insert(products).values({ showcaseId: s.id, name: "P1", status: "published" }).returning();
  [{ id: P2 }] = await db.insert(products).values({ showcaseId: s.id, name: "P2", status: "published" }).returning();
});

const upload = (rows: (string | number | null)[][], fileName = "alunos.xlsx") =>
  createImport(db, admin, { fileName, data: buildXlsx(rows) });
const outbox = () => db.select().from(emailOutbox);
const imp = async (id: number) => (await db.select().from(studentImports).where(eq(studentImports.id, id)))[0];

test("envio recusa o que não é XLSX, sem as colunas obrigatórias, vazio ou acima de 5.000 linhas", async () => {
  await expect(createImport(db, admin, { fileName: "a.xlsx", data: Buffer.from("nome,email\n") })).rejects.toThrow("Envie um arquivo XLSX.");
  await expect(upload([["status", "cliente_email"], ["ativo", "a@x.com"]])).rejects.toThrow(
    "A planilha precisa das colunas status, produto_id e cliente_email.",
  );
  await expect(upload([HEADER])).rejects.toThrow("A planilha não tem nenhum registro.");
  const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ["ativo", P1, `a${i}@x.com`]);
  await expect(upload([HEADER, ...many])).rejects.toThrow("A planilha pode ter até 5.000 registros.");
  await expect(createImport(db, student, { fileName: "a.xlsx", data: buildXlsx([HEADER, ["ativo", P1, "a@x.com"]]) })).rejects.toThrow();
  expect(await db.select().from(studentImports)).toEqual([]);
});

test("cada linha tem resultado; existente fica intacto; boas-vindas só para aluno novo; lotes", async () => {
  await db.insert(users).values({ email: "velho@x.com", name: "Nome Antigo", role: "student", passwordHash: "h", loginToken: "tv" });
  const { id } = await upload([
    [" Status ", "PRODUTO_ID", "cliente_email", "cliente_nome", "cliente_documento", "cliente_celular", "data_expiracao"],
    ["ativo", P1, "Nova@X.com", "Ana Nova", "123.456.789-09", "(11) 90000-7777", ""], // 2: criado
    ["approved", P2, "nova@x.com", "Outro Nome", "", "", "2027-01-31"], // 3: mesma aluna, outro produto: atualizado
    ["1", P1, "velho@x.com", "Nome Novo", "", "", ""], // 4: existente: atualizado, nome intacto
    ["cancelada", P1, "c@x.com", "", "", "", ""], // 5: ignorada
    ["ativo", P1, "nao-e-email", "", "", "", ""], // 6: e-mail inválido
    ["ativo", 123456789, "d@x.com", "", "", "", ""], // 7: produto inexistente
    ["ativo", P1, "NOVA@x.com", "", "", "", ""], // 8: repetida (mesmo e-mail e produto da linha 2)
    ["ativo", P1, "e@x.com", "", "", "", "31/01/2027"], // 9: data inválida
    ["ativo", P1, "adm@x.com", "", "", "", ""], // 10: administrador
    ["talvez", P1, "f@x.com", "", "", "", ""], // 11: status inválido
    ["aprovada", P2, "g@x.com", "", "", "", ""], // 12: criado, nome = parte do e-mail
  ]);
  let state = await imp(id);
  expect(state).toMatchObject({ name: "alunos.xlsx", status: "queued", total: 11, failed: 1, createdBy: admin.id });

  expect(await processImport(db, id, { appUrl, chunkSize: 3 })).toEqual({ done: true });
  state = await imp(id);
  expect(state).toMatchObject({ status: "done", total: 11, processed: 10, created: 2, updated: 2, failed: 7, rows: null });
  expect(state.finishedAt).toBeInstanceOf(Date);
  expect(await getImportErrors(db, admin, id)).toEqual([
    { row: 5, message: "Status inativo: linha ignorada." },
    { row: 6, message: "E-mail inválido." },
    { row: 7, message: "Produto não encontrado." },
    { row: 8, message: "Linha repetida (mesmo e-mail e produto)." },
    { row: 9, message: "Data de expiração inválida (use AAAA-MM-DD)." },
    { row: 10, message: "O e-mail é de um administrador." },
    { row: 11, message: "Status inválido." },
  ]);

  const [ana] = await db.select().from(users).where(eq(users.email, "nova@x.com"));
  expect(ana).toMatchObject({ name: "Ana Nova", document: "12345678909", phone: "+5511900007777", role: "student" });
  const [velho] = await db.select().from(users).where(eq(users.email, "velho@x.com"));
  expect(velho).toMatchObject({ name: "Nome Antigo", passwordHash: "h" });
  const [g] = await db.select().from(users).where(eq(users.email, "g@x.com"));
  expect(g.name).toBe("g");

  const access = await db.select().from(productAccess);
  expect(access).toHaveLength(4);
  for (const a of access) expect(a).toMatchObject({ source: "import", saleRef: `import:${id}`, revokedAt: null });
  const anaP2 = access.find((a) => a.userId === ana.id && a.productId === P2)!;
  expect(anaP2.expiresAt).toEqual(new Date("2027-02-01T02:59:59.999Z")); // fim do dia 31/01 em São Paulo
  expect(access.find((a) => a.userId === velho.id)!.expiresAt).toBeNull();

  const mails = await outbox();
  expect(mails.map((m) => m.toEmail).sort()).toEqual(["g@x.com", "nova@x.com"]);
  expect(mails.every((m) => m.template === "importacao")).toBe(true);
});

test("retomável: parar entre lotes e continuar dá o mesmo resultado, sem duplicar acessos nem e-mails", async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ["ativo", P1, `r${i}@x.com`]);
  const { id } = await upload([HEADER, ...rows]);
  // prazo já vencido: avança uma linha só e para
  expect(await processImport(db, id, { appUrl, chunkSize: 3, deadline: 0 })).toEqual({ done: false });
  expect(await imp(id)).toMatchObject({ status: "processing", processed: 1, created: 1 });
  expect(await processImport(db, id, { appUrl, chunkSize: 3 })).toEqual({ done: true });
  expect(await processImport(db, id, { appUrl, chunkSize: 3 })).toEqual({ done: true });
  expect(await imp(id)).toMatchObject({ status: "done", processed: 7, created: 7, updated: 0, failed: 0 });
  expect(await db.select().from(productAccess)).toHaveLength(7);
  expect(await outbox()).toHaveLength(7);
});

test("cron retoma só as paradas há mais de 10 min", async () => {
  const a = await upload([HEADER, ["ativo", P1, "a@x.com"]]);
  const b = await upload([HEADER, ["ativo", P1, "b@x.com"]]);
  const now = new Date();
  await db.update(studentImports).set({ status: "processing", heartbeatAt: new Date(now.getTime() - 11 * 60_000) }).where(eq(studentImports.id, a.id));
  await db.update(studentImports).set({ status: "processing", heartbeatAt: new Date(now.getTime() - 60_000) }).where(eq(studentImports.id, b.id));
  expect(await resumeStaleImports(db, { appUrl, now })).toBe(1);
  expect((await imp(a.id)).status).toBe("done");
  expect((await imp(b.id)).status).toBe("processing");
});

test("lista, lixeira e restaurar; importação excluída não continua", async () => {
  const a = await upload([HEADER, ["ativo", P1, "a@x.com"]], "um.xlsx");
  const b = await upload([HEADER, ["ativo", P1, "b@x.com"]], "dois.xlsx");
  expect((await listImports(db, admin, { trashed: false })).map((r) => r.name)).toEqual(["dois.xlsx", "um.xlsx"]);
  await trashImport(db, admin, a.id);
  expect(await imp(a.id)).toMatchObject({ rows: null, status: "failed" });
  expect((await listImports(db, admin, { trashed: false })).map((r) => r.id)).toEqual([b.id]);
  expect((await listImports(db, admin, { trashed: true })).map((r) => r.id)).toEqual([a.id]);
  expect(await processImport(db, a.id, { appUrl })).toEqual({ done: true });
  expect(await db.select().from(productAccess).where(and(eq(productAccess.saleRef, `import:${a.id}`)))).toEqual([]);
  await restoreImport(db, admin, a.id);
  expect((await listImports(db, admin, { trashed: true }))).toEqual([]);
  await expect(listImports(db, student, { trashed: false })).rejects.toThrow();
  await expect(trashImport(db, student, a.id)).rejects.toThrow();
  await expect(getImportErrors(db, student, a.id)).rejects.toThrow();
});

test("5.000 linhas com a senha padrão: um bcrypt só, em partes curtas", async () => {
  vi.mocked(hashPassword).mockClear();
  const rows = Array.from({ length: IMPORT_MAX_ROWS }, (_, i) => ["ativo", i % 2 ? P1 : P2, `aluno${i}@x.com`, `Aluno ${i}`]);
  const t0 = Date.now();
  const { id } = await upload([HEADER, ...rows], "grande.xlsx");
  const parseMs = Date.now() - t0;
  expect(await processImport(db, id, { appUrl })).toEqual({ done: true });
  expect(await imp(id)).toMatchObject({ status: "done", total: 5000, processed: 5000, created: 5000, failed: 0 });
  expect(await db.$count(productAccess)).toBe(5000);
  expect(await db.$count(emailOutbox)).toBe(5000);
  expect(parseMs).toBeLessThan(5000);
  expect(vi.mocked(hashPassword).mock.calls.length).toBeLessThanOrEqual(2);
}, 240_000);

test("prazo conferido a cada linha: para no meio da parte e retoma sem duplicar", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ["ativo", P1, `t${i}@x.com`]);
  const { id } = await upload([HEADER, ...rows]);
  let t = 0;
  const clock = () => (t += 1000); // cada consulta ao relógio "gasta" 1 s
  expect(await processImport(db, id, { appUrl, chunkSize: 25, clock, deadline: 4500 })).toEqual({ done: false });
  const mid = await imp(id);
  expect(mid.processed).toBeGreaterThan(0);
  expect(mid.processed).toBeLessThan(10);
  expect(mid.created).toBe(mid.processed);
  expect(await processImport(db, id, { appUrl })).toEqual({ done: true });
  expect(await imp(id)).toMatchObject({ status: "done", processed: 10, created: 10 });
  expect(await db.$count(productAccess)).toBe(10);
  expect(await db.$count(emailOutbox)).toBe(10);
});

test("células numéricas: CPF/CNPJ com zeros à esquerda, celular com 55, data de série; data passada recusada", async () => {
  expect(normalizeDocument("1234567890")).toBe("01234567890");
  expect(normalizeDocument("123456789")).toBe("00123456789");
  expect(normalizeDocument("1234567000199")).toBe("01234567000199");
  expect(normalizeDocument("123.456.789-09")).toBe("12345678909");
  expect(normalizePhone("5511900000000")).toBe("+5511900000000");
  expect(normalizePhone("11900000000")).toBe("+5511900000000");
  expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
  const { id } = await upload([
    HEADER,
    ["ativo", P1, "num@x.com", "Num", 1234567890, 5511900000000, 46418], // 46418 = 31/01/2027
    ["ativo", P1, "cnpj@x.com", "Cnpj", 1234567000199, 11900007777, "2020-01-01"],
  ]);
  expect(await processImport(db, id, { appUrl })).toEqual({ done: true });
  const [num] = await db.select().from(users).where(eq(users.email, "num@x.com"));
  expect(num).toMatchObject({ document: "01234567890", phone: "+5511900000000" });
  const [acc] = await db.select().from(productAccess).where(eq(productAccess.userId, num.id));
  expect(acc.expiresAt).toEqual(new Date("2027-02-01T02:59:59.999Z"));
  expect(await getImportErrors(db, admin, id)).toEqual([{ row: 3, message: "Data de expiração no passado." }]);
});

test("envio acima de 4 MB é recusado com mensagem clara", async () => {
  const big = new Uint8Array(IMPORT_UPLOAD_MAX_BYTES + 1);
  big.set([0x50, 0x4b, 0x03, 0x04]);
  await expect(createImport(db, admin, { fileName: "g.xlsx", data: big })).rejects.toThrow("Arquivo maior que 4 MB.");
});
