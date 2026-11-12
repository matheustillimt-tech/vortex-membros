import { beforeAll, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { deliveries, fullAccess, productAccess, products, sales, showcases, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { abbreviateName, getHomeMetrics, greeting, homeDate, variation } from "@/lib/dashboard/metrics";

// Sexta, 16/10/2026 09:00 em São Paulo
const now = new Date("2026-10-16T12:00:00Z");
const sp = (iso: string) => new Date(`${iso}-03:00`);

let db: Database;
let admin: User;
const ids: Record<string, number> = {};

async function mk(key: string, v: { createdAt: Date; lastAccessAt?: Date | null; deletedAt?: Date | null; name?: string; role?: "student" | "admin" }) {
  const [u] = await db
    .insert(users)
    .values({ email: `${key}@x.com`, name: v.name ?? key, role: v.role ?? "student", passwordHash: "x", loginToken: `t-${key}`, createdAt: v.createdAt, lastAccessAt: v.lastAccessAt ?? null, deletedAt: v.deletedAt ?? null })
    .returning();
  ids[key] = u.id;
}

beforeAll(async () => {
  db = await createTestDb();
  await mk("adm", { role: "admin", createdAt: sp("2026-10-05T10:00:00"), lastAccessAt: now });
  admin = (await db.select().from(users))[0];
  // Cadastros: 3 em outubro (um à 00:00 do dia 1º), 4 em setembro (um às 23:59 do dia 30), 1 em agosto
  await mk("o1", { createdAt: sp("2026-10-01T00:00:00"), lastAccessAt: sp("2026-10-16T08:00:00"), name: "Ana Maria Souza" }); // hoje
  await mk("o2", { createdAt: sp("2026-10-10T12:00:00"), lastAccessAt: sp("2026-10-15T23:59:00"), name: "bruno" }); // ontem
  await mk("o3", { createdAt: sp("2026-10-15T12:00:00") }); // nunca acessou
  await mk("s1", { createdAt: sp("2026-09-30T23:59:00"), lastAccessAt: sp("2026-10-14T10:00:00") }); // 2 dias
  await mk("s2", { createdAt: sp("2026-09-20T12:00:00"), lastAccessAt: sp("2026-10-09T10:00:00") }); // 7 dias
  await mk("s3", { createdAt: sp("2026-09-10T12:00:00"), lastAccessAt: sp("2026-10-08T10:00:00") }); // 8 dias
  await mk("s4", { createdAt: sp("2026-09-02T12:00:00"), lastAccessAt: sp("2026-09-16T10:00:00") }); // 30 dias
  await mk("a1", { createdAt: sp("2026-08-15T12:00:00"), lastAccessAt: sp("2026-09-15T10:00:00") }); // 31 dias: fora
  await mk("del", { createdAt: sp("2026-10-02T12:00:00"), lastAccessAt: now, deletedAt: now });

  // Conteúdo e vendas
  const [v] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  const [vGone] = await db.insert(showcases).values({ name: "X", status: "published", deletedAt: now }).returning();
  const [p1] = await db.insert(products).values({ showcaseId: v.id, name: "Com oferta", status: "published", offerUrl: "https://pay/x" }).returning();
  await db.insert(products).values([
    { showcaseId: v.id, name: "Sem oferta", status: "published" },
    { showcaseId: v.id, name: "Oferta vazia", status: "hidden", offerUrl: "  " },
    { showcaseId: v.id, name: "Grátis", status: "published", isFree: true },
    { showcaseId: v.id, name: "Excluído", status: "published", deletedAt: now },
    { showcaseId: vGone.id, name: "Vitrine excluída", status: "published" },
  ]);
  const [d1] = await db.insert(deliveries).values({ name: "Curso de Exemplo" }).returning();
  const [d2] = await db.insert(deliveries).values({ name: "Clube" }).returning();
  const base = { gateway: "kiwify", status: "approved" as const, payload: {}, receivedAt: now };
  await db.insert(sales).values([
    { ...base, dedupeKey: "e1", processing: "error" },
    { ...base, dedupeKey: "e2", processing: "error" },
    { ...base, dedupeKey: "e3", processing: "error", deletedAt: now },
    { ...base, dedupeKey: "ok", processing: "processed" },
  ] as never);

  // Matrículas por venda: grupos (aluno, venda) com source "sale" no mês do início
  await db.insert(productAccess).values([
    { userId: ids.o1, productId: p1.id, source: "sale", saleRef: "v1", deliveryId: d1.id, startsAt: sp("2026-10-03T10:00:00") },
    { userId: ids.o1, productId: p1.id + 1, source: "sale", saleRef: "v1", deliveryId: d1.id, startsAt: sp("2026-10-03T10:00:00") }, // mesmo grupo
    { userId: ids.s1, productId: p1.id, source: "sale", saleRef: "v2", deliveryId: d2.id, startsAt: sp("2026-09-30T23:00:00") },
    { userId: ids.o2, productId: p1.id, source: "manual", saleRef: "manual:1", deliveryId: d2.id, startsAt: sp("2026-10-12T10:00:00") }, // não é venda
    { userId: ids.del, productId: p1.id, source: "sale", saleRef: "v3", deliveryId: d1.id, startsAt: sp("2026-10-13T10:00:00") }, // excluído
  ]);
  await db.insert(fullAccess).values([
    { userId: ids.s2, source: "sale", saleRef: "v4", deliveryId: d2.id, startsAt: sp("2026-10-14T10:00:00") },
    // a mesma venda v1 de o1 também deu acesso completo: continua sendo uma matrícula
    { userId: ids.o1, source: "sale", saleRef: "v1", deliveryId: d1.id, startsAt: sp("2026-10-03T10:00:00") },
  ]);
});

test("saudação e data em São Paulo", () => {
  expect(greeting(sp("2026-10-16T05:59:00"))).toBe("Boa noite");
  expect(greeting(sp("2026-10-16T06:00:00"))).toBe("Bom dia");
  expect(greeting(sp("2026-10-16T11:59:00"))).toBe("Bom dia");
  expect(greeting(sp("2026-10-16T12:00:00"))).toBe("Boa tarde");
  expect(greeting(sp("2026-10-16T18:00:00"))).toBe("Boa noite");
  expect(homeDate(now)).toBe("Sexta-feira, 16 de outubro");
  expect(homeDate(new Date("2026-10-17T02:30:00Z"))).toBe("Sexta-feira, 16 de outubro");
  expect(abbreviateName("Ana Maria Souza")).toBe("Ana S.");
  expect(abbreviateName("  bruno ")).toBe("bruno");
  expect(variation(19, 254)).toBe(-93);
  expect(variation(5, 0)).toBeNull();
  expect(variation(0, 0)).toBeNull();
});

test("cards, gráfico, atenção, acessos e atividade", async () => {
  const m = await getHomeMetrics(db, admin, now);
  expect(m.totalStudents).toBe(8);
  expect(m.active7d).toBe(4); // o1, o2, s1, s2 (09/10 10:00 está a menos de 7×24h)
  expect(m.newThisMonth).toBe(3);
  expect(m.newPrevMonth).toBe(4);
  expect(m.newVariation).toBe(-25);
  expect(m.accessesToday).toBe(1);
  expect(m.weeklySignups).toHaveLength(8);
  expect(m.weeklySignups.reduce((a, b) => a + b, 0)).toBe(7); // a1 (15/08) fica antes das 8 semanas
  expect(m.weeklySignups.at(-1)).toBe(2); // o2 (10/10) e o3 (15/10) nos últimos 7 dias

  expect(m.chart.labels).toEqual(["nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out"]);
  expect(m.chart.signups.slice(-3)).toEqual([1, 4, 3]);
  expect(m.chart.enrollments.slice(-3)).toEqual([0, 1, 2]); // set: s1; out: o1 (1 grupo) + s2 (acesso completo)
  expect(m.last4Weeks).toBe(5); // 18/09 em diante: o1, o2, o3, s1, s2
  expect(m.prev4Weeks).toBe(2); // s3, s4
  expect(m.last4Variation).toBe(150);

  expect(m.attention).toEqual({ saleErrors: 2, productsWithoutOffer: 2, neverAccessed: 1 });
  expect(m.access30).toEqual({ today: 1, yesterday: 1, d2to7: 2, d8to14: 1, d15to30: 1 });

  expect(m.recent.map((r) => [r.name, r.deliveryName])).toEqual([
    ["s2", "Clube"],
    ["bruno", "Clube"],
    ["Ana S.", "Curso de Exemplo"],
    ["s1", "Clube"],
  ]);
  expect(m.recent[0]).toMatchObject({ userId: ids.s2, at: sp("2026-10-14T10:00:00") });
});

test("só admin", async () => {
  await expect(getHomeMetrics(db, { id: 9, role: "student" } as User, now)).rejects.toThrow();
});
