import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { deliveryTags, fullAccess, productAccess, userTags } from "@/db/schema";
import { listShowcaseTree } from "@/lib/admin/content";
import { listSchedules } from "@/lib/admin/schedules";
import { getAppUrl } from "@/lib/auth/app-url";
import type { User } from "@/lib/auth/sessions";
import { listTags } from "@/lib/sales/tags";
import { ensureKiwifyWebhookSecret } from "@/lib/sales/kiwify";
import { getPlatformSettings } from "@/lib/settings";

/** Só para quem já passou pela checagem de admin (páginas e actions de Entregas). */


/**
 * Segredo da URL de postback (gerado na primeira vez que Entregas abre). Lê primeiro, sem travar
 * nada; só sem segredo válido abre a transação de `ensureKiwifyWebhookSecret` (lib/sales/kiwify).
 */
export async function ensureWebhookSecret(db: Database): Promise<string> {
  const current = (await getPlatformSettings(db)).kiwify.webhookSecret;
  return current ?? ensureKiwifyWebhookSecret(db);
}

/** Alunos que entraram por esta entrega (acesso por produto ou acesso completo). */
async function deliveryStudentIds(db: Database, deliveryId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: productAccess.userId })
    .from(productAccess)
    .where(eq(productAccess.deliveryId, deliveryId))
    .union(db.select({ userId: fullAccess.userId }).from(fullAccess).where(eq(fullAccess.deliveryId, deliveryId)));
  return rows.map((r) => r.userId);
}

export async function deliveryStudentCount(db: Database, deliveryId: number): Promise<number> {
  return (await deliveryStudentIds(db, deliveryId)).length;
}

/** "Aplicar tags em todos os alunos": as tags salvas da entrega em quem já a possui (acesso não revogado; retroativo, uma consulta). */
export async function applyDeliveryTagsToStudents(db: Database, deliveryId: number): Promise<void> {
  await db.execute(sql`
    insert into ${userTags} (user_id, tag_id)
    select u.user_id, dt.tag_id
    from (
      select ${productAccess.userId} as user_id from ${productAccess} where ${productAccess.deliveryId} = ${deliveryId} and ${productAccess.revokedAt} is null
      union
      select ${fullAccess.userId} from ${fullAccess} where ${fullAccess.deliveryId} = ${deliveryId} and ${fullAccess.revokedAt} is null
    ) u
    cross join ${deliveryTags} dt
    where dt.delivery_id = ${deliveryId}
    on conflict do nothing`);
}

/* ---------- contexto do formulário (nova/editar) ---------- */

type ShowcaseNode = { id: number; name: string; products: { id: number; name: string }[]; children: ShowcaseNode[] };
const toTree = (n: ShowcaseNode): ShowcaseNode => ({
  id: n.id,
  name: n.name,
  products: n.products.map((p) => ({ id: p.id, name: p.name })),
  children: n.children.map(toTree),
});

export async function deliveryFormContext(db: Database, actor: User, headers: Headers) {
  const [tree, schedules, tags, secret, settings] = await Promise.all([
    listShowcaseTree(db, actor),
    listSchedules(db, actor),
    listTags(db, actor),
    ensureWebhookSecret(db),
    getPlatformSettings(db),
  ]);
  return {
    tree: tree.map(toTree),
    schedules: schedules.map((s) => ({ id: s.id, name: s.name, productIds: s.products.map((p) => p.id) })),
    tags,
    postbackUrl: `${getAppUrl(headers)}/api/postback/kiwify/${secret}`,
    signatureToken: settings.kiwify.signatureToken ?? "",
  };
}
