import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, expect, test } from "vitest";
import * as schema from "@/db/schema";
import type { Database } from "@/db";
import {
  deliveries, fullAccess, productAccess, products, showcases, tags, userTags, users,
} from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { listStudents, type ListStudentsOptions } from "@/lib/students/queries";

const counter = { n: 0 };
let db: Database;
let admin: User;
let aluno: User;
const now = new Date("2026-10-16T12:00:00Z");
const H = 3600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(now.getTime() - ms);

// ids dos alunos do cenário
const S = {} as Record<"A" | "B" | "C" | "D" | "E" | "F" | "G", number>;
let P1: number, P2: number, S2: number, D1: number, D2: number, T1: number, T2: number;

beforeAll(async () => {
  const d = drizzle(new PGlite(), { schema, logger: { logQuery: () => void counter.n++ } });
  await migrate(d, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  db = d as unknown as Database;

  [admin] = await db.insert(users).values({ email: "adm@x.com", name: "Adm", role: "admin", adminRole: "root", passwordHash: "x", loginToken: "ta" }).returning();
  const [s1] = await db.insert(showcases).values({ name: "V1", status: "published" }).returning();
  const [s2] = await db.insert(showcases).values({ name: "V2", status: "published" }).returning();
  S2 = s2.id;
  [{ id: P1 }] = await db.insert(products).values({ showcaseId: s1.id, name: "P1", status: "published" }).returning();
  [{ id: P2 }] = await db.insert(products).values({ showcaseId: s2.id, name: "P2", status: "published" }).returning();
  [{ id: D1 }] = await db.insert(deliveries).values({ name: "Entrega 1" }).returning();
  [{ id: D2 }] = await db.insert(deliveries).values({ name: "Entrega 2" }).returning();
  [{ id: T1 }] = await db.insert(tags).values({ name: "GARANTIA" }).returning();
  [{ id: T2 }] = await db.insert(tags).values({ name: "VIP" }).returning();

  const mk = async (key: keyof typeof S, v: { name: string; email: string; document?: string; createdAt: Date; lastAccessAt?: Date | null; deletedAt?: Date }) => {
    const [u] = await db.insert(users).values({ ...v, role: "student", passwordHash: "x", loginToken: `tok-${key}` }).returning();
    S[key] = u.id;
    return u;
  };
  aluno = await mk("A", { name: "Ana Souza", email: "zz-ana@x.com", document: "123.456.789-09", createdAt: ago(10 * D), lastAccessAt: ago(1 * H) });
  await mk("B", { name: "bruno", email: "bruno@x.com", document: "98765432100", createdAt: ago(9 * D), lastAccessAt: ago(10 * D) });
  await mk("C", { name: "Carla", email: "carla@x.com", createdAt: ago(8 * D), lastAccessAt: ago(20 * D) });
  await mk("D", { name: "Davi", email: "davi@x.com", createdAt: ago(7 * D), lastAccessAt: null });
  await mk("E", { name: "Eva", email: "eva@x.com", createdAt: ago(6 * D), lastAccessAt: ago(3 * D) });
  await mk("F", { name: "Fábio", email: "fabio@x.com", createdAt: ago(5 * D), deletedAt: ago(1 * D) });
  await mk("G", { name: "gabi", email: "gabi@x.com", createdAt: ago(4 * D), lastAccessAt: ago(8 * D) });

  const start = ago(30 * D);
  await db.insert(productAccess).values([
    // A: venda ativa de P1 (entrega 1)
    { userId: S.A, productId: P1, source: "sale", saleRef: "o-a", deliveryId: D1, startsAt: start },
    // B: acesso manual ativo de P2
    { userId: S.B, productId: P2, source: "manual", saleRef: "manual:b", startsAt: start },
    // C: venda de P1 revogada (reembolso)
    { userId: S.C, productId: P1, source: "sale", saleRef: "o-c", startsAt: start, revokedAt: ago(2 * D) },
    // D: importação de P2 vencida
    { userId: S.D, productId: P2, source: "import", saleRef: "import:1", startsAt: start, expiresAt: ago(1 * D) },
    // F (excluído): venda ativa
    { userId: S.F, productId: P1, source: "sale", saleRef: "o-f", startsAt: start },
  ]);
  // E: acesso completo por venda (entrega 2)
  await db.insert(fullAccess).values({ userId: S.E, source: "sale", saleRef: "o-e", deliveryId: D2, startsAt: start });
  await db.insert(userTags).values([{ userId: S.A, tagId: T1 }, { userId: S.G, tagId: T2 }]);
});

async function ids(opts: Partial<ListStudentsOptions> = {}): Promise<string[]> {
  const res = await listStudents(db, admin, { sort: "latest", trashed: false, now, ...opts });
  const byId = Object.fromEntries(Object.entries(S).map(([k, v]) => [v, k]));
  return res.rows.map((r) => byId[r.id] ?? `#${r.id}`);
}

test("só admin lista alunos", async () => {
  await expect(listStudents(db, aluno, { sort: "latest", trashed: false })).rejects.toThrow(/administradores/);
  await expect(listStudents(db, null, { sort: "latest", trashed: false })).rejects.toThrow(/administradores/);
});

test("sem filtros: só alunos não excluídos, mais recentes primeiro, com contagem", async () => {
  const res = await listStudents(db, admin, { sort: "latest", trashed: false, now });
  expect(res.total).toBe(6);
  expect(await ids()).toEqual(["G", "E", "D", "C", "B", "A"]);
  const a = res.rows.find((r) => r.id === S.A)!;
  expect(a).toEqual({ id: S.A, name: "Ana Souza", email: "zz-ana@x.com", document: "123.456.789-09", lastAccessAt: ago(1 * H) });
  expect(res.nextCursor).toBeNull();
});

test("lixeira mostra só os excluídos", async () => {
  expect(await ids({ trashed: true })).toEqual(["F"]);
});

test("status: ativo = acesso não revogado e não vencido (ou acesso completo)", async () => {
  expect(await ids({ status: "active" })).toEqual(["E", "B", "A"]);
  expect(await ids({ status: "inactive" })).toEqual(["G", "D", "C"]);
});

test("tipo: pagante = tem acesso de venda não revogado (reembolsado deixa de ser pagante)", async () => {
  expect(await ids({ type: "paying" })).toEqual(["E", "A"]);
  expect(await ids({ type: "free" })).toEqual(["G", "D", "C", "B"]);
});

test("acesso avulso ou importação ignora acessos revogados", async () => {
  await db.insert(productAccess).values({ userId: S.G, productId: P1, source: "manual", saleRef: "manual:g", revokedAt: ago(1 * D) });
  try {
    expect(await ids({ access: "manual-or-import" })).toEqual(["D", "B"]);
  } finally {
    await db.delete(productAccess).where(eq(productAccess.saleRef, "manual:g"));
  }
});

test("acesso: faixas pelo último acesso e acesso avulso ou importação", async () => {
  expect(await ids({ access: "active-7d" })).toEqual(["E", "A"]);
  expect(await ids({ access: "inactive-7d" })).toEqual(["G", "C", "B"]);
  expect(await ids({ access: "inactive-7-15d" })).toEqual(["G", "B"]);
  expect(await ids({ access: "inactive-15d" })).toEqual(["C"]);
  expect(await ids({ access: "never-accessed" })).toEqual(["D"]);
  expect(await ids({ access: "manual-or-import" })).toEqual(["D", "B"]);
});

test("produtos, vitrine e entrega (acesso completo conta para todos os produtos)", async () => {
  expect(await ids({ productIds: [P1] })).toEqual(["E", "A"]);
  expect(await ids({ productIds: [P1, P2] })).toEqual(["E", "D", "B", "A"]);
  expect(await ids({ showcaseId: S2 })).toEqual(["E", "D", "B"]);
  expect(await ids({ deliveryId: D1 })).toEqual(["A"]);
  expect(await ids({ deliveryId: D2 })).toEqual(["E"]);
  expect(await ids({ productIds: [] })).toEqual(["G", "E", "D", "C", "B", "A"]);
});

test("tags: qualquer uma das escolhidas", async () => {
  expect(await ids({ tagIds: [T1] })).toEqual(["A"]);
  expect(await ids({ tagIds: [T1, T2] })).toEqual(["G", "A"]);
});

test("busca por e-mail, nome e ID", async () => {
  expect(await ids({ search: { field: "email", q: " BRU " } })).toEqual(["B"]);
  expect(await ids({ search: { field: "email", q: "ana" } })).toEqual(["A"]);
  expect(await ids({ search: { field: "email", q: "%" } })).toEqual([]);
  expect(await ids({ search: { field: "name", q: "ANA" } })).toEqual(["A"]);
  expect(await ids({ search: { field: "id", q: String(S.B) } })).toEqual(["B"]);
  expect(await ids({ search: { field: "id", q: `#${S.B}` } })).toEqual(["B"]);
  expect(await ids({ search: { field: "id", q: "abc" } })).toEqual([]);
  expect(await ids({ search: { field: "email", q: "  " } })).toEqual(["G", "E", "D", "C", "B", "A"]);
});

test("busca por CPF com ou sem máscara compara só os dígitos", async () => {
  expect(await ids({ search: { field: "document", q: "12345678909" } })).toEqual(["A"]);
  expect(await ids({ search: { field: "document", q: "123.456.789-09" } })).toEqual(["A"]);
  expect(await ids({ search: { field: "document", q: "987.654.321-00" } })).toEqual(["B"]);
  expect(await ids({ search: { field: "document", q: "..." } })).toEqual([]);
});

test("filtros combinados = interseção lógica", async () => {
  expect(await ids({ status: "active", productIds: [P1], tagIds: [T1] })).toEqual(["A"]);
  expect(await ids({ status: "active", productIds: [P1], tagIds: [T2] })).toEqual([]);
  expect(await ids({ status: "inactive", type: "free" })).toEqual(["G", "D", "C"]);
  expect(await ids({ status: "active", type: "free", access: "manual-or-import" })).toEqual(["B"]);
  expect(await ids({ status: "active", search: { field: "document", q: "987.654.321-00" } })).toEqual(["B"]);
  expect(await ids({ status: "inactive", search: { field: "document", q: "98765432100" } })).toEqual([]);
  expect(await ids({ type: "paying", access: "inactive-7d", productIds: [P1] })).toEqual([]);
  expect(await ids({ showcaseId: S2, access: "never-accessed" })).toEqual(["D"]);
  const res = await listStudents(db, admin, { sort: "latest", trashed: false, now, status: "active", type: "paying" });
  expect(res.total).toBe(2);
});

test("ordenação por nome (sem diferenciar maiúsculas) e por e-mail", async () => {
  expect(await ids({ sort: "name" })).toEqual(["A", "B", "C", "D", "E", "G"]);
  expect(await ids({ sort: "email" })).toEqual(["B", "C", "D", "E", "G", "A"]);
});

test("paginação estável de 30 em 30, com empates, em cada ordenação; 2 consultas por página", async () => {
  const local = await (async () => {
    const d = drizzle(new PGlite(), { schema, logger: { logQuery: () => void counter.n++ } });
    await migrate(d, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
    return d as unknown as Database;
  })();
  const [adm] = await local.insert(users).values({ email: "adm@x.com", name: "Adm", role: "admin", passwordHash: "x", loginToken: "ta" }).returning();
  const sameDate = ago(1 * D);
  // 75 alunos com a mesma data de cadastro e nomes repetidos (empates em todas as ordenações).
  await local.insert(users).values(
    Array.from({ length: 75 }, (_, i) => ({
      name: `Aluno ${i % 5}`, email: `a${String(i % 40).padStart(2, "0")}-${i}@x.com`, role: "student" as const,
      passwordHash: "x", loginToken: `t${i}`, createdAt: sameDate,
    })),
  );
  for (const sort of ["latest", "name", "email"] as const) {
    const seen: number[] = [];
    let cursor: string | null | undefined;
    const sizes: number[] = [];
    do {
      counter.n = 0;
      const page = await listStudents(local, adm, { sort, trashed: false, cursor: cursor ?? undefined, now });
      expect(counter.n).toBe(2);
      expect(page.total).toBe(75);
      sizes.push(page.rows.length);
      seen.push(...page.rows.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(sizes).toEqual([30, 30, 15]);
    expect(new Set(seen).size).toBe(75);
    // a sequência paginada é a mesma da lista inteira ordenada
    const all = await local.select().from(users);
    const students = all.filter((u) => u.role === "student");
    const key = (u: (typeof students)[number]): [string | number, number] =>
      sort === "latest" ? [-u.createdAt.getTime(), -u.id] : sort === "name" ? [u.name.toLowerCase(), u.id] : [u.email, u.id];
    const expected = [...students].sort((a, b) => {
      const [ka, ia] = key(a), [kb, ib] = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : ia - ib;
    });
    expect(seen).toEqual(expected.map((u) => u.id));
  }
});

test("cursor inválido é ignorado (volta ao começo)", async () => {
  const forged = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  for (const cursor of ["lixo", forged({ s: "latest", v: "não é data", id: 1 }), forged({ s: "latest", v: "2026-99-99", id: 1 }), forged({ s: "name", v: "x".repeat(5000), id: 1 })]) {
    const res = await listStudents(db, admin, { sort: cursor.length > 1000 ? "name" : "latest", trashed: false, now, cursor });
    expect(res.rows).toHaveLength(6);
  }
});
