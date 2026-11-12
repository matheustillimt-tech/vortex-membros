import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { fullAccess, productAccess, products, showcases, type DeliveryItem, type DurationType } from "@/db/schema";

/**
 * Liberação e remoção dos acessos de uma venda. Todo acesso de venda guarda a venda que o deu
 * (`sale_ref`: order_id, ou subscription_id em assinatura) e a entrega, para o reembolso tirar só
 * o que aquela venda deu. Rodam dentro da transação de processSale.
 */

/** Fim do acesso: vitalício → null; senão N horas/dias/semanas/meses/anos a partir do início (UTC). */
export function accessExpiry(start: Date, durationType: DurationType, duration: number | null): Date | null {
  if (durationType === "lifetime" || duration === null) return null;
  const d = new Date(start.getTime());
  switch (durationType) {
    case "hours":
      d.setUTCHours(d.getUTCHours() + duration);
      break;
    case "days":
      d.setUTCDate(d.getUTCDate() + duration);
      break;
    case "weeks":
      d.setUTCDate(d.getUTCDate() + duration * 7);
      break;
    case "months":
      d.setUTCMonth(d.getUTCMonth() + duration);
      break;
    case "years":
      d.setUTCFullYear(d.getUTCFullYear() + duration);
      break;
  }
  return d;
}

type Duration = { durationType: DurationType; duration: number | null };

/** O maior prazo: vitalício (null) ganha de qualquer data. */
const longer = (a: Date | null, b: Date | null) => (a === null || b === null ? null : a > b ? a : b);

/** Produtos (não excluídos) de cada item da entrega; vitrine = ela e as subvitrines. "all" fica de fora. */
export async function resolveDeliveryProducts(
  tx: Database,
  items: Pick<DeliveryItem, "targetType" | "targetId" | "durationType" | "duration">[],
): Promise<{ products: Map<number, Duration[]>; fullItems: Duration[] }> {
  const byProduct = new Map<number, Duration[]>();
  const fullItems = items.filter((i) => i.targetType === "all");
  const add = (productId: number, i: (typeof items)[number]) => {
    const list = byProduct.get(productId) ?? [];
    list.push({ durationType: i.durationType, duration: i.duration });
    byProduct.set(productId, list);
  };

  const showcaseItems = items.filter((i) => i.targetType === "showcase" && i.targetId !== null);
  const productItems = items.filter((i) => i.targetType === "product" && i.targetId !== null);
  if (showcaseItems.length) {
    const tree = await tx.select({ id: showcases.id, parentId: showcases.parentId }).from(showcases).where(isNull(showcases.deletedAt));
    const children = new Map<number, number[]>();
    for (const s of tree) if (s.parentId !== null) children.set(s.parentId, [...(children.get(s.parentId) ?? []), s.id]);
    const alive = new Set(tree.map((s) => s.id));
    const descendants = (root: number) => {
      const out = new Set<number>();
      const stack = alive.has(root) ? [root] : [];
      while (stack.length) {
        const id = stack.pop()!;
        if (out.has(id)) continue;
        out.add(id);
        stack.push(...(children.get(id) ?? []));
      }
      return out;
    };
    const perItem = showcaseItems.map((i) => ({ item: i, showcaseIds: descendants(i.targetId!) }));
    const allShowcases = [...new Set(perItem.flatMap((p) => [...p.showcaseIds]))];
    const rows = allShowcases.length
      ? await tx
          .select({ id: products.id, showcaseId: products.showcaseId })
          .from(products)
          .where(and(inArray(products.showcaseId, allShowcases), isNull(products.deletedAt)))
      : [];
    for (const { item, showcaseIds } of perItem) for (const p of rows) if (showcaseIds.has(p.showcaseId)) add(p.id, item);
  }
  if (productItems.length) {
    const ids = [...new Set(productItems.map((i) => i.targetId!))];
    const rows = await tx.select({ id: products.id }).from(products).where(and(inArray(products.id, ids), isNull(products.deletedAt)));
    const alive = new Set(rows.map((r) => r.id));
    for (const i of productItems) if (alive.has(i.targetId!)) add(i.targetId!, i);
  }
  return { products: byProduct, fullItems };
}

/**
 * Concede os itens da entrega. Repetir (reprocessar, renovar) não duplica: upsert por
 * usuário + produto + venda; o prazo só cresce (vitalício ganha) e um acesso revogado volta.
 * Devolve os ids dos produtos concedidos e se deu acesso completo.
 */
export async function grantDeliveryItems(
  tx: Database,
  input: {
    userId: number;
    deliveryId: number;
    saleRef: string;
    startsAt: Date;
    items: Pick<DeliveryItem, "targetType" | "targetId" | "durationType" | "duration">[];
    /** "manual" no "Adicionar entrega" do perfil do aluno; vendas usam o padrão. */
    source?: "sale" | "manual";
  },
): Promise<{ productIds: number[]; full: boolean }> {
  const { userId, deliveryId, saleRef, startsAt } = input;
  const source = input.source ?? "sale";
  const resolved = await resolveDeliveryProducts(tx, input.items);
  const values = [...resolved.products].map(([productId, durations]) => ({
    userId,
    productId,
    deliveryId,
    saleRef,
    startsAt,
    source,
    expiresAt: durations.map((d) => accessExpiry(startsAt, d.durationType, d.duration)).reduce(longer),
  }));
  const mergeExpiry = (t: typeof productAccess | typeof fullAccess) =>
    sql`case when ${t.expiresAt} is null or excluded.expires_at is null then null else greatest(${t.expiresAt}, excluded.expires_at) end`;
  if (values.length) {
    await tx
      .insert(productAccess)
      .values(values)
      .onConflictDoUpdate({
        target: [productAccess.userId, productAccess.productId, productAccess.saleRef],
        set: {
          revokedAt: null,
          deliveryId: sql`excluded.delivery_id`,
          startsAt: sql`least(${productAccess.startsAt}, excluded.starts_at)`,
          expiresAt: mergeExpiry(productAccess),
        },
      });
  }
  if (resolved.fullItems.length) {
    const expiresAt = resolved.fullItems.map((i) => accessExpiry(startsAt, i.durationType, i.duration)).reduce(longer);
    await tx
      .insert(fullAccess)
      .values({ userId, deliveryId, saleRef, startsAt, expiresAt, source })
      .onConflictDoUpdate({
        target: [fullAccess.userId, fullAccess.saleRef],
        set: {
          revokedAt: null,
          deliveryId: sql`excluded.delivery_id`,
          startsAt: sql`least(${fullAccess.startsAt}, excluded.starts_at)`,
          expiresAt: mergeExpiry(fullAccess),
        },
      });
  }
  return { productIds: values.map((v) => v.productId), full: resolved.fullItems.length > 0 };
}

/**
 * Revoga o que a venda deu (por `sale_ref`): acessos de venda e importados ligados a ela; manual
 * nunca sai. `found` diz se a venda tinha dado algum acesso (mesmo já revogado: reprocessar um
 * reembolso não cai na regra de venda desconhecida).
 */
export async function revokeSaleAccess(tx: Database, saleRef: string, now: Date): Promise<{ found: boolean; userIds: number[] }> {
  const ofSale = <T extends typeof productAccess | typeof fullAccess>(t: T) => and(eq(t.saleRef, saleRef), ne(t.source, "manual"));
  const pa = await tx.select({ userId: productAccess.userId }).from(productAccess).where(ofSale(productAccess));
  const fa = await tx.select({ userId: fullAccess.userId }).from(fullAccess).where(ofSale(fullAccess));
  if (pa.length + fa.length === 0) return { found: false, userIds: [] };
  await tx.update(productAccess).set({ revokedAt: now }).where(and(ofSale(productAccess), isNull(productAccess.revokedAt)));
  await tx.update(fullAccess).set({ revokedAt: now }).where(and(ofSale(fullAccess), isNull(fullAccess.revokedAt)));
  return { found: true, userIds: [...new Set([...pa, ...fa].map((r) => r.userId))] };
}

/**
 * Venda desconhecida (anterior à plataforma): tira do aluno os produtos da entrega casada nas
 * linhas de venda ou importação sem referência de venda (da entrega ou sem entrega). Acessos
 * manuais e os de outra venda (outro `sale_ref`) ficam: o aluno continua com o produto por eles.
 */
export async function revokeLegacyDeliveryAccess(
  tx: Database,
  input: {
    userId: number;
    deliveryId: number;
    items: Pick<DeliveryItem, "targetType" | "targetId" | "durationType" | "duration">[];
    now: Date;
  },
): Promise<void> {
  const { userId, deliveryId, now } = input;
  const resolved = await resolveDeliveryProducts(tx, input.items);
  const productIds = [...resolved.products.keys()];
  const legacy = <T extends typeof productAccess | typeof fullAccess>(t: T) =>
    and(eq(t.userId, userId), inArray(t.source, ["sale", "import"]), isNull(t.saleRef), isNull(t.revokedAt), or(eq(t.deliveryId, deliveryId), isNull(t.deliveryId)));
  if (productIds.length) {
    await tx
      .update(productAccess)
      .set({ revokedAt: now })
      .where(and(legacy(productAccess), inArray(productAccess.productId, productIds)));
  }
  if (resolved.fullItems.length) await tx.update(fullAccess).set({ revokedAt: now }).where(legacy(fullAccess));
}
