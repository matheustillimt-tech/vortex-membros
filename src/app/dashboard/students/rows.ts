import type {
  ListStudentsOptions, StudentAccessFilter, StudentRow, StudentSearchField, StudentSort, StudentStatusFilter, StudentTypeFilter,
} from "@/lib/students/queries";
import { avatarColor, formatDocument, formatRelative, initials } from "@/lib/students/format";

/** Alunos no painel: filtros da URL/formulário e as linhas já formatadas para a tela. */

export const SEARCH_FIELDS: { value: StudentSearchField; label: string; placeholder: string }[] = [
  { value: "email", label: "E-mail", placeholder: "nome@exemplo.com" },
  { value: "name", label: "Nome", placeholder: "Nome do aluno" },
  { value: "document", label: "CPF ou CNPJ", placeholder: "000.000.000-00" },
  { value: "id", label: "ID", placeholder: "ID do aluno" },
];
export const STATUS_OPTIONS: { value: StudentStatusFilter; label: string }[] = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
];
export const TYPE_OPTIONS: { value: StudentTypeFilter; label: string }[] = [
  { value: "paying", label: "Pagante" },
  { value: "free", label: "Gratuito" },
];
export const ACCESS_OPTIONS: { value: StudentAccessFilter; label: string }[] = [
  { value: "active-7d", label: "Acessou nos últimos 7 dias" },
  { value: "inactive-7d", label: "Sem acesso há 7 dias" },
  { value: "inactive-7-15d", label: "Sem acesso entre 7 e 15 dias" },
  { value: "inactive-15d", label: "Sem acesso há 15 dias" },
  { value: "never-accessed", label: "Nunca acessou" },
  { value: "manual-or-import", label: "Acesso avulso ou importação" },
];
export const SORT_OPTIONS: { value: StudentSort; label: string }[] = [
  { value: "latest", label: "Últimos" },
  { value: "name", label: "Nome" },
  { value: "email", label: "E-mail" },
];

export type StudentFilters = {
  field: StudentSearchField;
  q: string;
  status: StudentStatusFilter | null;
  type: StudentTypeFilter | null;
  access: StudentAccessFilter | null;
  products: number[];
  showcase: number | null;
  delivery: number | null;
  tags: number[];
  sort: StudentSort;
  trash: boolean;
};

const pick = <T extends string>(options: { value: T }[], v: string | null): T | null =>
  options.some((o) => o.value === v) ? (v as T) : null;
const id = (v: string | null) => (v && /^\d{1,15}$/.test(v) ? Number(v) : null);
const ids = (vs: string[]) => [...new Set(vs.map(id).filter((n): n is number => n !== null))].slice(0, 200);

/** Valores fora da lista viram "sem filtro"; ids inválidos são descartados. */
export function parseStudentFilters(get: (k: string) => string | null, getAll: (k: string) => string[]): StudentFilters {
  return {
    field: pick(SEARCH_FIELDS, get("field")) ?? "email",
    q: (get("q") ?? "").trim().slice(0, 200),
    status: pick(STATUS_OPTIONS, get("status")),
    type: pick(TYPE_OPTIONS, get("type")),
    access: pick(ACCESS_OPTIONS, get("access")),
    products: ids(getAll("products")),
    showcase: id(get("showcase")),
    delivery: id(get("delivery")),
    tags: ids(getAll("tags")),
    sort: pick(SORT_OPTIONS, get("sort")) ?? "latest",
    trash: get("trash") === "1",
  };
}

export function listOptions(f: StudentFilters, cursor?: string): ListStudentsOptions {
  return {
    search: f.q ? { field: f.field, q: f.q } : undefined,
    status: f.status ?? undefined,
    type: f.type ?? undefined,
    access: f.access ?? undefined,
    productIds: f.products.length ? f.products : undefined,
    showcaseId: f.showcase ?? undefined,
    deliveryId: f.delivery ?? undefined,
    tagIds: f.tags.length ? f.tags : undefined,
    sort: f.sort,
    trashed: f.trash,
    cursor,
  };
}

/** Querystring da lista (mesmos nomes que o parse lê). */
export function studentsQuery(f: StudentFilters): string {
  const qs = new URLSearchParams();
  if (f.q) {
    if (f.field !== "email") qs.set("field", f.field);
    qs.set("q", f.q);
  }
  if (f.status) qs.set("status", f.status);
  if (f.type) qs.set("type", f.type);
  if (f.access) qs.set("access", f.access);
  for (const p of f.products) qs.append("products", String(p));
  if (f.showcase !== null) qs.set("showcase", String(f.showcase));
  if (f.delivery !== null) qs.set("delivery", String(f.delivery));
  for (const t of f.tags) qs.append("tags", String(t));
  if (f.sort !== "latest") qs.set("sort", f.sort);
  if (f.trash) qs.set("trash", "1");
  return qs.toString();
}

export type StudentListRow = {
  id: number;
  name: string;
  email: string;
  document: string | null;
  lastAccess: string;
  initials: string;
  color: string;
};

export function toStudentRow(r: StudentRow, now: Date = new Date()): StudentListRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    document: formatDocument(r.document),
    lastAccess: formatRelative(r.lastAccessAt, now),
    initials: initials(r.name),
    color: avatarColor(r.id),
  };
}

export type FilterKind = "products" | "showcases" | "deliveries" | "tags";
export const FILTER_KINDS: FilterKind[] = ["products", "showcases", "deliveries", "tags"];
