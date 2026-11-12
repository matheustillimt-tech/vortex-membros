import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { deliveries, fullAccess, platformSettings, productAccess, products, schedules, showcases, userTags, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { getDelivery } from "@/lib/sales/deliveries";
import { createTag, listTags } from "@/lib/sales/tags";
import { getPlatformSettings, KIWIFY_SECRET_PATTERN } from "@/lib/settings";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import * as a from "@/app/dashboard/sales/deliveries/actions";
import { deliveryStudentCount, ensureWebhookSecret } from "@/app/dashboard/sales/deliveries/data";

let db: Database;
let admin: User;
let student: User;
let showcaseId: number;
let pA: number;
let pB: number;
let scheduleId: number;

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  [admin] = await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t-ad" }).returning();
  [student] = await db.insert(users).values({ email: "al@x.com", name: "Al", role: "student", passwordHash: "x", loginToken: "t-al" }).returning();
  [{ id: showcaseId }] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  [{ id: pA }, { id: pB }] = await db
    .insert(products)
    .values([
      { showcaseId, name: "A", status: "published" },
      { showcaseId, name: "B", status: "published" },
    ])
    .returning();
  [{ id: scheduleId }] = await db.insert(schedules).values({ name: "Turma" }).returning();
  session.user = admin;
  revalidatePath.mockClear();
});
afterEach(() => setDbForTests(null));

type Item = { targetType: string; targetId: number | null; durationType: string; duration: number | null; scheduleId: number | null };
const item = (over: Partial<Item> = {}): Item => ({ targetType: "product", targetId: pA, durationType: "lifetime", duration: null, scheduleId: null, ...over });

function fd(fields: Record<string, string | number | string[] | Item[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (k === "items") f.set(k, JSON.stringify(v));
    else if (Array.isArray(v)) for (const x of v) f.append(k, String(x));
    else f.set(k, String(v));
  }
  return f;
}
const base = () => ({ name: "Manual", type: "single", codes: ["1f77fba0"], items: [item()] });

test("todas as actions exigem admin", async () => {
  const { id } = (await a.createDeliveryAction(fd(base()))) as { ok: true; id: number };
  const denied = { ok: false, error: "Acesso restrito a administradores." };
  for (const u of [null, student]) {
    session.user = u;
    expect(await a.createDeliveryAction(fd(base()))).toEqual(denied);
    expect(await a.updateDeliveryAction(fd({ id, ...base() }))).toEqual(denied);
    expect(await a.renameDeliveryAction(fd({ id, name: "X" }))).toEqual(denied);
    expect(await a.duplicateDeliveryAction(fd({ id }))).toEqual(denied);
    expect(await a.archiveDeliveryAction(fd({ id }))).toEqual(denied);
    expect(await a.restoreDeliveryAction(fd({ id }))).toEqual(denied);
    expect(await a.createTagAction(fd({ name: "T" }))).toEqual(denied);
    expect(await a.applyDeliveryTagsAction(fd({ id }))).toEqual(denied);
    expect(await a.saveSignatureTokenAction(fd({ token: "x" }))).toEqual(denied);
  }
  session.user = admin;
  expect((await db.select().from(deliveries)).length).toBe(1);
});

test("criar e salvar: valida nome, códigos, itens, prazos, ids e programação", async () => {
  const res = await a.createDeliveryAction(fd({ ...base(), tagIds: [] }));
  expect(res).toMatchObject({ ok: true });
  const id = (res as { id: number }).id;
  expect(await getDelivery(db, admin, id)).toMatchObject({ name: "Manual", type: "single", codes: ["1f77fba0"], items: [{ targetType: "product", targetId: pA }] });

  const err = (error: string) => ({ ok: false, error });
  expect(await a.createDeliveryAction(fd({ ...base(), name: " " }))).toEqual(err("Informe o nome da entrega (até 120 caracteres)."));
  expect(await a.createDeliveryAction(fd({ ...base(), name: "x".repeat(121) }))).toEqual(err("Informe o nome da entrega (até 120 caracteres)."));
  expect(await a.createDeliveryAction(fd({ ...base(), codes: [] }))).toEqual(err("Informe ao menos um código do produto ou plano."));
  expect(await a.createDeliveryAction(fd({ ...base(), items: [] }))).toEqual(err("Selecione ao menos um conteúdo para entregar."));
  expect(await a.createDeliveryAction(fd({ ...base(), items: [item({ durationType: "days", duration: 0 })] }))).toEqual(err("Tempo de acesso deve ser de 1 a 1000."));
  expect(await a.createDeliveryAction(fd({ ...base(), items: [item({ durationType: "days", duration: 1001 })] }))).toEqual(err("Tempo de acesso deve ser de 1 a 1000."));
  expect(await a.createDeliveryAction(fd({ ...base(), items: [item({ targetId: 999999 })] }))).toEqual(err("Produto não encontrado."));
  expect(await a.createDeliveryAction(fd({ ...base(), items: [item({ targetType: "showcase", targetId: 999999 })] }))).toEqual(err("Vitrine não encontrada."));
  expect(await a.createDeliveryAction(fd({ ...base(), items: [item({ scheduleId: 999999 })] }))).toEqual(err("Programação de liberação não encontrada."));
  expect(await a.createDeliveryAction(fd({ ...base(), type: "outro" }))).toEqual(err("Modalidade de venda inválida."));
  // JSON quebrado ou fora do formato
  const bad = fd(base());
  bad.set("items", "{nope");
  expect(await a.createDeliveryAction(bad)).toEqual(err("Requisição inválida."));
  bad.set("items", JSON.stringify({ a: 1 }));
  expect(await a.createDeliveryAction(bad)).toEqual(err("Requisição inválida."));

  // salvar (substitui itens e tags), com prazo, vitrine, acesso completo e programação
  const tag = await createTag(db, admin, "GARANTIA");
  const saved = await a.updateDeliveryAction(
    fd({
      id,
      name: "Manual 2",
      type: "subscription",
      codes: ["c1", "c2"],
      tagIds: [String(tag.id)],
      items: [
        item({ targetId: pB, durationType: "years", duration: 1, scheduleId }),
        item({ targetType: "showcase", targetId: showcaseId }),
        item({ targetType: "all", targetId: null }),
      ],
    }),
  );
  expect(saved).toEqual({ ok: true });
  const d = await getDelivery(db, admin, id);
  expect(d).toMatchObject({ name: "Manual 2", type: "subscription", codes: ["c1", "c2"], tagIds: [tag.id] });
  expect(d!.items.map((i) => [i.targetType, i.targetId, i.durationType, i.duration, i.scheduleId])).toEqual([
    ["product", pB, "years", 1, scheduleId],
    ["showcase", showcaseId, "lifetime", null, null],
    ["all", null, "lifetime", null, null],
  ]);
  // sem `name` (a edição renomeia pelo cabeçalho): o nome fica
  const { name: _n, ...noName } = base();
  void _n;
  expect(await a.updateDeliveryAction(fd({ id, ...noName }))).toEqual({ ok: true });
  expect((await getDelivery(db, admin, id))!.name).toBe("Manual 2");
  expect(await a.updateDeliveryAction(fd({ id: 999999, ...base() }))).toEqual(err("Entrega não encontrada."));
  expect(await a.updateDeliveryAction(fd({ id: "abc", ...base() }))).toEqual(err("Requisição inválida."));
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/sales/deliveries");
});

test("renomear, duplicar (sem códigos), arquivar e restaurar", async () => {
  const { id } = (await a.createDeliveryAction(fd(base()))) as { ok: true; id: number };
  expect(await a.renameDeliveryAction(fd({ id, name: " Novo nome " }))).toEqual({ ok: true });
  expect((await getDelivery(db, admin, id))!.name).toBe("Novo nome");
  const dup = (await a.duplicateDeliveryAction(fd({ id }))) as { ok: true; id: number };
  expect(dup.ok).toBe(true);
  expect(await getDelivery(db, admin, dup.id)).toMatchObject({ name: "Novo nome (cópia)", codes: [], items: [{ targetId: pA }] });
  expect(await a.archiveDeliveryAction(fd({ id }))).toEqual({ ok: true });
  expect((await getDelivery(db, admin, id))!.archivedAt).toBeInstanceOf(Date);
  expect(await a.restoreDeliveryAction(fd({ id }))).toEqual({ ok: true });
  expect((await getDelivery(db, admin, id))!.archivedAt).toBeNull();
});

test("tags: criar (reaproveita pelo nome) e aplicar a todos os alunos da entrega", async () => {
  const t1 = (await a.createTagAction(fd({ name: " Turma A " }))) as { ok: true; id: number };
  expect(t1.ok).toBe(true);
  expect(await a.createTagAction(fd({ name: "turma a" }))).toEqual({ ok: true, id: t1.id });
  expect(await a.createTagAction(fd({ name: "" }))).toEqual({ ok: false, error: "Informe o nome da tag." });
  expect((await listTags(db, admin)).map((t) => t.name)).toEqual(["Turma A"]);

  const { id } = (await a.createDeliveryAction(fd({ ...base(), tagIds: [String(t1.id)] }))) as { ok: true; id: number };
  const [s2] = await db.insert(users).values({ email: "b@x.com", name: "B", role: "student", passwordHash: "x", loginToken: "t-b" }).returning();
  const [s3] = await db.insert(users).values({ email: "c@x.com", name: "C", role: "student", passwordHash: "x", loginToken: "t-c" }).returning();
  await db.insert(productAccess).values({ userId: student.id, productId: pA, source: "sale", saleRef: "o1", deliveryId: id });
  await db.insert(fullAccess).values({ userId: s2.id, source: "sale", saleRef: "o2", deliveryId: id });
  await db.insert(productAccess).values({ userId: s3.id, productId: pA, source: "manual" }); // outra origem
  expect(await deliveryStudentCount(db, id)).toBe(2);

  expect(await a.applyDeliveryTagsAction(fd({ id }))).toEqual({ ok: true });
  const tagged = await db.select().from(userTags);
  expect(tagged.map((r) => r.userId).sort()).toEqual([student.id, s2.id].sort());
  expect(await a.applyDeliveryTagsAction(fd({ id }))).toEqual({ ok: true }); // de novo: sem duplicar
  expect((await db.select().from(userTags)).length).toBe(2);
});

test("token da Kiwify: grava aparado, vazio limpa, limite de 200", async () => {
  expect(await a.saveSignatureTokenAction(fd({ token: "  abc  " }))).toEqual({ ok: true });
  expect((await getPlatformSettings(db)).kiwify.signatureToken).toBe("abc");
  expect(await a.saveSignatureTokenAction(fd({ token: "" }))).toEqual({ ok: true });
  expect((await getPlatformSettings(db)).kiwify.signatureToken).toBeNull();
  expect(await a.saveSignatureTokenAction(fd({ token: "x".repeat(201) }))).toEqual({ ok: false, error: "O token pode ter até 200 caracteres." });
});

test("segredo da URL de postback: gerado uma vez e mantido", async () => {
  const s1 = await ensureWebhookSecret(db);
  expect(s1).toMatch(KIWIFY_SECRET_PATTERN);
  expect(await ensureWebhookSecret(db)).toBe(s1);
  expect((await getPlatformSettings(db)).kiwify.webhookSecret).toBe(s1);
  // não apaga as outras configurações
  await a.saveSignatureTokenAction(fd({ token: "tok" }));
  expect(await ensureWebhookSecret(db)).toBe(s1);
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  expect((row.data as { kiwify: Record<string, unknown> }).kiwify).toMatchObject({ webhookSecret: s1, signatureToken: "tok" });
});

test("produto, vitrine ou programação excluídos depois não travam o salvamento da entrega", async () => {
  const { id } = (await a.createDeliveryAction(
    fd({ ...base(), items: [item({ scheduleId }), item({ targetId: pB }), item({ targetType: "showcase", targetId: showcaseId })] }),
  )) as { ok: true; id: number };
  const NOW = new Date();
  await db.update(products).set({ deletedAt: NOW }).where(eq(products.id, pB));
  await db.update(schedules).set({ deletedAt: NOW }).where(eq(schedules.id, scheduleId));
  // a tela manda de volta o que estava salvo; os alvos excluídos caem e a programação vira nula
  const res = await a.updateDeliveryAction(
    fd({ id, type: "single", codes: ["novo"], items: [item({ scheduleId }), item({ targetId: pB }), item({ targetType: "showcase", targetId: showcaseId })] }),
  );
  expect(res).toEqual({ ok: true });
  const d = await getDelivery(db, admin, id);
  expect(d!.codes).toEqual(["novo"]);
  expect(d!.items.map((i) => [i.targetType, i.targetId, i.scheduleId])).toEqual([
    ["product", pA, null],
    ["showcase", showcaseId, null],
  ]);
  // alvo excluído que não estava na entrega continua recusado
  const [{ id: other }] = await db.insert(products).values({ showcaseId, name: "C", status: "published", deletedAt: NOW }).returning();
  expect(await a.updateDeliveryAction(fd({ id, type: "single", codes: ["novo"], items: [item({ targetId: other })] }))).toEqual({
    ok: false,
    error: "Produto não encontrado.",
  });
});

test("aplicar tags ignora alunos com o acesso revogado", async () => {
  const tag = await createTag(db, admin, "VIP");
  const { id } = (await a.createDeliveryAction(fd({ ...base(), tagIds: [String(tag.id)] }))) as { ok: true; id: number };
  await db.insert(productAccess).values({ userId: student.id, productId: pA, source: "sale", saleRef: "o1", deliveryId: id, revokedAt: new Date() });
  expect(await a.applyDeliveryTagsAction(fd({ id }))).toEqual({ ok: true });
  expect(await db.select().from(userTags)).toEqual([]);
});
