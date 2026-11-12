import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import { fullAccess, productAccess, products, userTags, users } from "@/db/schema";
import { assertAdmin } from "@/lib/admin/guard";
import type { User } from "@/lib/auth/sessions";

export const STUDENTS_PAGE_SIZE = 30;

export type StudentSearchField = "email" | "name" | "document" | "id";
export type StudentStatusFilter = "active" | "inactive";
export type StudentTypeFilter = "paying" | "free";
export type StudentAccessFilter =
  | "active-7d"
  | "inactive-7d"
  | "inactive-7-15d"
  | "inactive-15d"
  | "never-accessed"
  | "manual-or-import";
export type StudentSort = "latest" | "name" | "email";

export type ListStudentsOptions = {
  search?: { field: StudentSearchField; q: string };
  status?: StudentStatusFilter;
  type?: StudentTypeFilter;
  access?: StudentAccessFilter;
  productIds?: number[];
  showcaseId?: number;
  deliveryId?: number;
  tagIds?: number[];
  sort: StudentSort;
  /** true = só os excluídos (Lixeira). */
  trashed: boolean;
  cursor?: string;
  /** Relógio das definições de "ativo" e das faixas de acesso (testes). */
  now?: Date;
};

export type StudentRow = { id: number; name: string; email: string; document: string | null; lastAccessAt: Date | null };
export type StudentPage = { rows: StudentRow[]; total: number; nextCursor: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_IDS = 200;

const never = sql`false`;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const cleanIds = (ids: number[] | undefined) =>
  [...new Set((ids ?? []).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, MAX_IDS);

// Subconsultas correlacionadas (EXISTS) sobre os acessos do aluno: uma consulta só, sem N+1.
const paFor = (...conds: SQL[]) =>
  sql`exists (select 1 from ${productAccess} where ${productAccess.userId} = ${users.id} and ${and(...conds)})`;
const faFor = (...conds: SQL[]) =>
  sql`exists (select 1 from ${fullAccess} where ${fullAccess.userId} = ${users.id} and ${and(...conds)})`;

function activeAccess(now: Date): SQL {
  const pa = paFor(
    isNull(productAccess.revokedAt),
    lte(productAccess.startsAt, now),
    or(isNull(productAccess.expiresAt), gt(productAccess.expiresAt, now))!,
  );
  const fa = faFor(
    isNull(fullAccess.revokedAt),
    lte(fullAccess.startsAt, now),
    or(isNull(fullAccess.expiresAt), gt(fullAccess.expiresAt, now))!,
  );
  return or(pa, fa)!;
}

function searchCondition(field: StudentSearchField, raw: string): SQL | undefined {
  const q = raw.trim().slice(0, 200);
  if (!q) return undefined;
  switch (field) {
    case "email":
      return ilike(users.email, `%${escapeLike(q)}%`);
    case "name":
      return ilike(users.name, `%${escapeLike(q)}%`);
    case "document": {
      // Compara só os dígitos dos dois lados: "123.456.789-09" = "12345678909".
      const digits = q.replace(/\D/g, "");
      return digits ? sql`regexp_replace(coalesce(${users.document}, ''), ${"\\D"}, '', 'g') = ${digits}` : never;
    }
    case "id": {
      const m = /^#?\s*(\d{1,15})$/.exec(q);
      return m ? eq(users.id, Number(m[1])) : never;
    }
  }
}

function accessCondition(access: StudentAccessFilter, now: Date): SQL {
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);
  switch (access) {
    case "active-7d":
      return gte(users.lastAccessAt, daysAgo(7));
    case "inactive-7d":
      return lt(users.lastAccessAt, daysAgo(7));
    case "inactive-7-15d":
      return and(lt(users.lastAccessAt, daysAgo(7)), gte(users.lastAccessAt, daysAgo(15)))!;
    case "inactive-15d":
      return lt(users.lastAccessAt, daysAgo(15));
    case "never-accessed":
      return isNull(users.lastAccessAt);
    case "manual-or-import":
      return or(
        paFor(inArray(productAccess.source, ["manual", "import"]), isNull(productAccess.revokedAt)),
        faFor(inArray(fullAccess.source, ["manual", "import"]), isNull(fullAccess.revokedAt)),
      )!;
  }
}

function filters(opts: ListStudentsOptions, now: Date): SQL[] {
  const where: SQL[] = [eq(users.role, "student"), opts.trashed ? isNotNull(users.deletedAt) : isNull(users.deletedAt)];
  if (opts.search) {
    const c = searchCondition(opts.search.field, opts.search.q);
    if (c) where.push(c);
  }
  if (opts.status === "active") where.push(activeAccess(now));
  if (opts.status === "inactive") where.push(sql`not ${activeAccess(now)}`);

  // Pagante = acesso de venda não revogado (reembolso tira o aluno do grupo).
  const paying = or(
    paFor(eq(productAccess.source, "sale"), isNull(productAccess.revokedAt)),
    faFor(eq(fullAccess.source, "sale"), isNull(fullAccess.revokedAt)),
  )!;
  if (opts.type === "paying") where.push(paying);
  if (opts.type === "free") where.push(sql`not ${paying}`);

  if (opts.access) where.push(accessCondition(opts.access, now));

  // Produtos/vitrine/entrega: acessos não revogados (vencidos contam: o aluno "é" daquele produto).
  // Acesso completo vale para todos os produtos e vitrines.
  const productIds = cleanIds(opts.productIds);
  const anyFull = faFor(isNull(fullAccess.revokedAt));
  if (productIds.length > 0) {
    where.push(or(paFor(isNull(productAccess.revokedAt), inArray(productAccess.productId, productIds)), anyFull)!);
  }
  if (opts.showcaseId !== undefined) {
    const inShowcase = sql`${productAccess.productId} in (select ${products.id} from ${products} where ${products.showcaseId} = ${opts.showcaseId})`;
    where.push(or(paFor(isNull(productAccess.revokedAt), inShowcase), anyFull)!);
  }
  if (opts.deliveryId !== undefined) {
    where.push(
      or(
        paFor(isNull(productAccess.revokedAt), eq(productAccess.deliveryId, opts.deliveryId)),
        faFor(isNull(fullAccess.revokedAt), eq(fullAccess.deliveryId, opts.deliveryId)),
      )!,
    );
  }
  const tagIds = cleanIds(opts.tagIds);
  if (tagIds.length > 0) {
    where.push(sql`exists (select 1 from ${userTags} where ${userTags.userId} = ${users.id} and ${inArray(userTags.tagId, tagIds)})`);
  }
  return where;
}

// Ordenação + chave do cursor (valor lido do próprio banco como texto, para não perder os
// microssegundos de created_at; desempate pelo id).
const SORTS: Record<StudentSort, { key: SQL; dir: "asc" | "desc" }> = {
  latest: { key: sql`${users.createdAt}`, dir: "desc" },
  name: { key: sql`lower(${users.name})`, dir: "asc" },
  email: { key: sql`${users.email}`, dir: "asc" },
};

type Cursor = { s: StudentSort; v: string; id: number };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(raw: string | undefined, sort: StudentSort): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    if (c.s !== sort || typeof c.v !== "string" || c.v.length > 1000 || !Number.isSafeInteger(c.id)) return null;
    // Cursor adulterado não pode virar erro de SQL (cast de timestamptz): vale como primeira página.
    if (sort === "latest" && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/.test(c.v)) return null;
    if (sort === "latest" && Number.isNaN(Date.parse(c.v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")))) return null;
    return c as Cursor;
  } catch {
    return null;
  }
}

/** Lista de alunos do painel: filtros combinados (E entre filtros, OU dentro de um filtro múltiplo), 30 por página. */
export async function listStudents(db: Database, actor: User | null, opts: ListStudentsOptions): Promise<StudentPage> {
  assertAdmin(actor);
  const now = opts.now ?? new Date();
  const where = filters(opts, now);
  const { key, dir } = SORTS[opts.sort] ?? SORTS.latest;
  const sort: StudentSort = SORTS[opts.sort] ? opts.sort : "latest";

  const cursor = decodeCursor(opts.cursor, sort);
  const pageWhere = [...where];
  if (cursor) {
    const cast = sort === "latest" ? sql`${cursor.v}::timestamptz` : sql`${cursor.v}`;
    pageWhere.push(dir === "desc" ? sql`(${key}, ${users.id}) < (${cast}, ${cursor.id})` : sql`(${key}, ${users.id}) > (${cast}, ${cursor.id})`);
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      document: users.document,
      lastAccessAt: users.lastAccessAt,
      sortValue: sql<string>`(${key})::text`,
    })
    .from(users)
    .where(and(...pageWhere))
    .orderBy(dir === "desc" ? desc(key) : asc(key), dir === "desc" ? desc(users.id) : asc(users.id))
    .limit(STUDENTS_PAGE_SIZE + 1);

  const [{ total }] = await db.select({ total: count() }).from(users).where(and(...where));

  const hasMore = rows.length > STUDENTS_PAGE_SIZE;
  const page = rows.slice(0, STUDENTS_PAGE_SIZE);
  const last = page.at(-1);
  return {
    rows: page.map((r) => ({ id: r.id, name: r.name, email: r.email, document: r.document, lastAccessAt: r.lastAccessAt })),
    total: Number(total),
    nextCursor: hasMore && last ? encodeCursor({ s: sort, v: last.sortValue, id: last.id }) : null,
  };
}
