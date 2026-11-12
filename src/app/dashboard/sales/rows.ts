import type { Sale, SaleProcessing, SaleStatus } from "@/db/schema";
import type { ListSalesOptions, SalesSearchField, SalesView } from "@/lib/sales/sales-store";

/** Vendas no painel: filtros da URL/formulário e as linhas já formatadas para a tela (sem o payload). */

export const SALES_GATEWAYS = [{ value: "kiwify", label: "Kiwify" }] as const;
const GATEWAY_LABELS: Record<string, string> = Object.fromEntries(SALES_GATEWAYS.map((g) => [g.value, g.label]));
export const gatewayLabel = (g: string) => GATEWAY_LABELS[g] ?? g;

export const SEARCH_FIELDS: { value: SalesSearchField; label: string; placeholder: string }[] = [
  { value: "email", label: "E-mail", placeholder: "fulano@exemplo.com" },
  { value: "name", label: "Nome", placeholder: "Fulano" },
  { value: "document", label: "CPF ou CNPJ", placeholder: "000.000.000-00" },
  { value: "order", label: "ID da venda", placeholder: "ID da venda" },
  { value: "subscription", label: "ID da recorrência", placeholder: "ID da recorrência" },
];

const VIEWS: SalesView[] = ["latest", "queued", "error"];

export type SalesFilters = { view: SalesView; gateways: string[]; field: SalesSearchField; q: string };

/** Valores fora da lista viram o padrão; gateways desconhecidos são descartados. */
export function parseSalesFilters(get: (k: string) => string | null, getAll: (k: string) => string[]): SalesFilters {
  const view = get("view");
  const field = get("field");
  const known = new Set<string>(SALES_GATEWAYS.map((g) => g.value));
  return {
    view: VIEWS.includes(view as SalesView) ? (view as SalesView) : "latest",
    gateways: [...new Set(getAll("gateways").filter((g) => known.has(g)))],
    field: SEARCH_FIELDS.some((f) => f.value === field) ? (field as SalesSearchField) : "email",
    q: (get("q") ?? "").trim().slice(0, 200),
  };
}

export function listOptions(f: SalesFilters): ListSalesOptions {
  return { view: f.view, gateways: f.gateways.length ? f.gateways : undefined, search: f.q ? { field: f.field, q: f.q } : undefined };
}

export const SALE_STATUS: Record<SaleStatus, { label: string; tone: string }> = {
  approved: { label: "Aprovada", tone: "success" },
  renewed: { label: "Aprovada", tone: "success" },
  refunded: { label: "Reembolso", tone: "warning" },
  chargeback: { label: "Reembolso", tone: "warning" },
  canceled: { label: "Cancelada", tone: "danger" },
  late: { label: "Atrasada", tone: "warning" },
  waiting: { label: "Aguardando", tone: "info" },
  refused: { label: "Recusada", tone: "danger" },
  other: { label: "Outro", tone: "neutral" },
};

export const PROCESSING: Record<SaleProcessing, { label: string; tone: string }> = {
  processed: { label: "Processado", tone: "success" },
  error: { label: "Com erro", tone: "danger" },
  queued: { label: "Na Fila", tone: "info" },
  ignored: { label: "Ignorado", tone: "neutral" },
};

const TZ = "America/Sao_Paulo";
const parts = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hourCycle: "h23", ...opts }).formatToParts(d).map((p) => [p.type, p.value]));

/** "23:12 15/10/26" (coluna Data). */
export function shortDate(d: Date): string {
  const p = parts(d, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "2-digit" });
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}

/** "15/10/2026 18:04" (gaveta, Recebido em). */
export function longDate(d: Date): string {
  const p = parts(d, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** CPF 000.000.000-00, CNPJ 00.000.000/0000-00; outro tamanho fica como veio. */
export function formatDocument(doc: string | null): string {
  if (!doc) return "";
  if (/^\d{11}$/.test(doc)) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (/^\d{14}$/.test(doc)) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return doc;
}

export type SaleRow = {
  id: number;
  gateway: string;
  gatewayLabel: string;
  email: string;
  name: string;
  document: string;
  receivedAt: string;
  processedAt: string;
  status: SaleStatus;
  processing: SaleProcessing;
};

export function toSaleRow(s: Sale): SaleRow {
  return {
    id: s.id,
    gateway: s.gateway,
    gatewayLabel: gatewayLabel(s.gateway),
    email: s.customerEmail ?? "",
    name: s.customerName ?? "",
    document: formatDocument(s.customerDocument),
    receivedAt: shortDate(s.receivedAt),
    processedAt: s.processedAt ? shortDate(s.processedAt) : "",
    status: s.status,
    processing: s.processing,
  };
}

const PAYMENT_METHODS: Record<string, string> = { credit_card: "Cartão de crédito", pix: "Pix", boleto: "Boleto" };

export type SaleDetail = SaleRow & {
  receivedAtLong: string;
  error: string | null;
  notice: string | null;
  offer: string | null;
  orderId: string | null;
  productName: string | null;
  productIds: string[];
  amount: string | null;
  paymentMethod: string | null;
  payloadJson: string;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function toSaleDetail(s: Sale): SaleDetail {
  const product = obj(obj(s.payload).Product);
  return {
    ...toSaleRow(s),
    receivedAtLong: longDate(s.receivedAt),
    error: s.error,
    notice: s.notice,
    offer: str(product.product_offer_name) ?? str(product.product_name),
    orderId: s.orderId,
    productName: str(product.product_name),
    productIds: s.productIds,
    // "11.14": centavos / 100, sem formatação de moeda
    amount: s.amountCents === null ? null : (s.amountCents / 100).toFixed(2),
    paymentMethod: s.paymentMethod ? (PAYMENT_METHODS[s.paymentMethod] ?? s.paymentMethod) : null,
    payloadJson: JSON.stringify(s.payload, null, 2),
  };
}
