import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { platformSettings, type SaleStatus } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/tokens";
import { invalidatePlatformSettingsCache, KIWIFY_SECRET_PATTERN } from "@/lib/settings";

/**
 * Leitura do payload do webhook da Kiwify.
 * Nunca lança: campo ausente ou com tipo errado vira null/[].
 */

export type ParsedSale = {
  orderId: string | null;
  event: string | null;
  status: SaleStatus;
  /** `Product.product_id` e, se houver, `Product.product_offer_id`. */
  productIds: string[];
  checkoutLink: string | null;
  planId: string | null;
  subscriptionId: string | null;
  /** Cobranças concluídas da assinatura (diferencia renovações do mesmo pedido). */
  chargesCompleted: number | null;
  customer: { email: string | null; name: string | null; document: string | null };
  phone: string | null;
  amountCents: number | null;
  paymentMethod: string | null;
  /** `approved_date` (ou `created_at`) no horário de Brasília. */
  approvedAt: Date | null;
};

/** Evento (`webhook_event_type`) ou `order_status` → status da venda. */
const STATUS_MAP: Record<string, SaleStatus> = {
  order_approved: "approved",
  paid: "approved",
  approved: "approved",
  order_refunded: "refunded",
  refunded: "refunded",
  chargeback: "chargeback",
  chargedback: "chargeback",
  subscription_canceled: "canceled",
  subscription_late: "late",
  subscription_renewed: "renewed",
  waiting_payment: "waiting",
  pix_created: "waiting",
  billet_created: "waiting",
  order_rejected: "refused",
  refused: "refused",
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, max = 500): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function cents(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && Math.abs(n) <= 2_000_000_000 ? n : null;
}

/** "AAAA-MM-DD HH:MM" (ou com segundos) em Brasília (UTC-3 fixo desde 2019) → instante. ISO também vale. */
export function parseKiwifyDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (m) {
    const [, y, mo, d, h, mi, s] = m.map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d, h + 3, mi, s || 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = new Date(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(iso.getTime()) ? iso : null;
}

export function mapKiwifyStatus(event: string | null, orderStatus: string | null): SaleStatus {
  const own = (k: string | null) => (k && Object.prototype.hasOwnProperty.call(STATUS_MAP, k) ? STATUS_MAP[k] : undefined);
  return own(event) ?? own(orderStatus) ?? "other";
}

export function parseKiwify(payload: unknown): ParsedSale {
  const p = isObj(payload) ? payload : {};
  const product = isObj(p.Product) ? p.Product : {};
  const customer = isObj(p.Customer) ? p.Customer : {};
  const sub = isObj(p.Subscription) ? p.Subscription : null;
  const plan = sub && isObj(sub.plan) ? sub.plan : {};
  const charges = sub && isObj(sub.charges) ? sub.charges : {};
  const commissions = isObj(p.Commissions) ? p.Commissions : {};

  const event = str(p.webhook_event_type, 100);
  const productIds = [str(product.product_id, 100), str(product.product_offer_id, 100)].filter((v): v is string => v !== null);
  const email = str(customer.email, 254);
  const doc = (str(customer.CPF) ?? str(customer.cpf) ?? str(customer.cnpj) ?? str(customer.CNPJ) ?? "").replace(/\D/g, "");

  return {
    orderId: str(p.order_id, 100),
    event,
    status: mapKiwifyStatus(event, str(p.order_status, 100)),
    productIds: [...new Set(productIds)],
    checkoutLink: str(p.checkout_link, 100),
    planId: str(plan.id, 100),
    subscriptionId: str(p.subscription_id, 100) ?? (sub ? str(sub.id, 100) : null),
    chargesCompleted: Array.isArray(charges.completed) ? charges.completed.length : null,
    customer: {
      email: email ? normalizeEmail(email) : null,
      name: str(customer.full_name, 200) ?? str(customer.first_name, 200),
      document: doc ? doc.slice(0, 20) : null,
    },
    phone: str(customer.mobile, 50),
    amountCents: cents(commissions.charge_amount),
    paymentMethod: str(p.payment_method, 50),
    approvedAt: parseKiwifyDate(p.approved_date) ?? parseKiwifyDate(p.created_at),
  };
}

/** Compara duas strings em tempo constante (pelo sha256 das duas, que têm o mesmo tamanho). */
export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/** `signature` = HMAC-SHA1 (hex) de `rawBody` com o token da Kiwify. */
export function verifyKiwifySignature(rawBody: string, signature: string | null | undefined, token: string): boolean {
  if (typeof signature !== "string" || !/^[0-9a-fA-F]{40}$/.test(signature)) return false;
  const expected = createHmac("sha1", token).update(rawBody).digest("hex");
  return safeEqual(expected, signature.toLowerCase());
}

/**
 * Segredo da URL de postback: gerado (32 bytes em base64url) e guardado na primeira vez; depois,
 * sempre o mesmo. Linha de configurações travada para duas abas não gerarem segredos diferentes.
 */
export async function ensureKiwifyWebhookSecret(db: Database): Promise<string> {
  const secret = await db.transaction(async (tx) => {
    await tx.insert(platformSettings).values({ id: 1, data: {} }).onConflictDoNothing();
    const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.id, 1)).for("update");
    const data = isObj(row?.data) ? row.data : {};
    const kiwify = isObj(data.kiwify) ? data.kiwify : {};
    if (typeof kiwify.webhookSecret === "string" && KIWIFY_SECRET_PATTERN.test(kiwify.webhookSecret)) return kiwify.webhookSecret;
    const fresh = randomBytes(32).toString("base64url");
    await tx
      .update(platformSettings)
      .set({ data: { ...data, kiwify: { ...kiwify, webhookSecret: fresh } } })
      .where(eq(platformSettings.id, 1));
    return fresh;
  });
  invalidatePlatformSettingsCache(db);
  return secret;
}
