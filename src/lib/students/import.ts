import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import type { Database } from "@/db";
import { productAccess, products, studentImports, users, type StudentImportError, type StudentImportRow } from "@/db/schema";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import { initialPasswordFor } from "@/lib/auth/initial-password";
import { hashPassword } from "@/lib/auth/password";
import type { User } from "@/lib/auth/sessions";
import { generateLoginToken, normalizeEmail } from "@/lib/auth/tokens";
import { enqueueEmail } from "@/lib/email/outbox";
import { safeErrorSummary } from "@/lib/log";
import { getPlatformSettings, type PlatformSettings } from "@/lib/settings";

/**
 * Importação de alunos por XLSX (Alunos › Importações).
 *
 * Envio: a planilha é lida e conferida na hora (assinatura ZIP, tamanho descompactado, colunas,
 * até 5.000 linhas, linhas repetidas) e guardada em `student_imports.rows`.
 *
 * Processamento (depois da resposta), em partes de até 25 linhas:
 * 1. fora de transação: lê as linhas, confere produtos/alunos e calcula as senhas (bcrypt) dos
 *    alunos novos, com o hash memorizado por senha (senha padrão = um bcrypt por importação);
 *    o prazo é conferido a cada linha, então nenhuma parte passa do tempo da função;
 * 2. transação curta: trava a importação, confere o cursor, grava alunos/acessos/e-mails e avança
 *    `processed` e os contadores juntos. Parar no meio e continuar (outra chamada, o cron) não
 *    duplica nada.
 * Aluno novo: senha inicial das configurações e e-mail `importacao`. Aluno existente: só o acesso
 * (nome, e-mail e senha intactos). Acesso: `source "import"`, `sale_ref "import:<id>"`.
 */

/** Teto do arquivo enviado: a Vercel recusa corpos acima de 4,5 MB antes da action. */
export const IMPORT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const IMPORT_UPLOAD_TOO_BIG = "Arquivo maior que 4 MB.";
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_CHUNK = 25;
const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;
const MAX_ERRORS = 200;
const STALE_MS = 10 * 60 * 1000;
const TZ = "America/Sao_Paulo";

const REQUIRED = ["status", "produto_id", "cliente_email"] as const;
const OPTIONAL = ["cliente_nome", "cliente_documento", "cliente_celular", "data_expiracao"] as const;
const GRANT = new Set(["ativo", "aprovada", "approved", "1"]);
const IGNORE = new Set(["inativo", "cancelada", "0"]);

export type ImportStatus = "queued" | "processing" | "done" | "failed";
export type ImportListRow = {
  id: number;
  name: string;
  status: ImportStatus;
  total: number;
  processed: number;
  pending: number;
  created: number;
  updated: number;
  failed: number;
  createdAt: Date;
  finishedAt: Date | null;
  deletedAt: Date | null;
};

/* ---------- leitura da planilha ---------- */

type Cell = string | number | boolean | Date | null | undefined;

const ymd = (d: Date) => d.toISOString().slice(0, 10); // datas do Excel vêm em UTC

function text(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : ymd(v);
  if (typeof v === "number") return Number.isFinite(v) ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : "";
  return String(v).trim();
}

/** CPF/CNPJ vindo de célula numérica perde os zeros à esquerda: 9–10 dígitos → 11; 12–13 → 14. */
export function normalizeDocument(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits || !/^[\d.\-/\s]+$/.test(raw.trim())) return digits;
  if (digits.length === 9 || digits.length === 10) return digits.padStart(11, "0");
  if (digits.length === 12 || digits.length === 13) return digits.padStart(14, "0");
  return digits;
}

/** Celular: "+DDI…" fica; 12–13 dígitos começando com 55 já têm o DDI; o resto vale como brasileiro. */
export function normalizePhone(raw: string): string | null {
  const v = raw.trim();
  const digits = v.replace(/\D/g, "");
  if (!digits || digits.length > 20) return null;
  if (v.startsWith("+")) return `+${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  return `+55${digits}`;
}

/** Data de expiração: "AAAA-MM-DD", data do Excel ou número de série (dias desde 30/12/1899). */
function expiryText(v: Cell): string {
  if (typeof v === "number" && Number.isInteger(v) && v > 20000 && v < 80000) return ymd(new Date(Date.UTC(1899, 11, 30) + v * 86_400_000));
  return text(v);
}

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** Soma dos tamanhos descompactados no diretório central do ZIP (barra "zip bomb"); null se ilegível. */
function unzippedSize(b: Uint8Array): number | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // Fim do diretório central: assinatura 0x06054b50 nos últimos 22 + 65535 bytes.
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    const entries = view.getUint16(i + 10, true);
    let p = view.getUint32(i + 16, true);
    let total = 0;
    for (let n = 0; n < entries; n++) {
      if (p + 46 > b.length || view.getUint32(p, true) !== 0x02014b50) return null;
      total += view.getUint32(p + 24, true);
      p += 46 + view.getUint16(p + 28, true) + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    }
    return total;
  }
  return null;
}

async function parseSheet(data: Uint8Array): Promise<{ rows: StudentImportRow[]; errors: StudentImportError[] }> {
  if (!isZip(data)) throw new AdminError("Envie um arquivo XLSX.");
  const size = unzippedSize(data);
  if (size === null || size > MAX_UNZIPPED_BYTES) throw new AdminError("Não foi possível ler a planilha. Envie um arquivo XLSX válido.");
  let sheet: Cell[][];
  try {
    // Sempre Buffer: uma string seria lida como caminho de arquivo.
    sheet = (await readSheet(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) as Cell[][];
  } catch {
    throw new AdminError("Não foi possível ler a planilha. Envie um arquivo XLSX válido.");
  }
  const header = (sheet[0] ?? []).map((c) => text(c).toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (REQUIRED.some((c) => col(c) < 0)) throw new AdminError("A planilha precisa das colunas status, produto_id e cliente_email.");
  const at = Object.fromEntries([...REQUIRED, ...OPTIONAL].map((c) => [c, col(c)])) as Record<(typeof REQUIRED)[number] | (typeof OPTIONAL)[number], number>;

  const body = sheet.slice(1).map((r, i) => ({ r, row: i + 2 })).filter(({ r }) => r.some((c) => text(c) !== ""));
  if (body.length === 0) throw new AdminError("A planilha não tem nenhum registro.");
  if (body.length > IMPORT_MAX_ROWS) throw new AdminError("A planilha pode ter até 5.000 registros.");

  const get = (r: Cell[], i: number) => (i < 0 ? "" : text(r[i]));
  const seen = new Set<string>();
  const rows: StudentImportRow[] = [];
  const errors: StudentImportError[] = [];
  for (const { r, row } of body) {
    const item: StudentImportRow = {
      row,
      status: get(r, at.status).slice(0, 50),
      productId: get(r, at.produto_id).slice(0, 30),
      email: get(r, at.cliente_email).slice(0, 320),
      name: get(r, at.cliente_nome).slice(0, 400),
      document: normalizeDocument(get(r, at.cliente_documento).slice(0, 60)),
      phone: get(r, at.cliente_celular).slice(0, 60),
      expiresOn: (at.data_expiracao < 0 ? "" : expiryText(r[at.data_expiracao])).slice(0, 30),
    };
    const key = `${normalizeEmail(item.email)}|${item.productId}`;
    if (item.email && seen.has(key)) {
      errors.push({ row, message: "Linha repetida (mesmo e-mail e produto)." });
      continue;
    }
    seen.add(key);
    rows.push(item);
  }
  return { rows, errors };
}

/** "Enviar arquivo": confere a planilha e cria a importação na fila. */
export async function createImport(db: Database, actor: User | null, input: { fileName: string; data: Uint8Array }): Promise<{ id: number }> {
  assertAdmin(actor);
  if (input.data.byteLength > IMPORT_UPLOAD_MAX_BYTES) throw new AdminError(IMPORT_UPLOAD_TOO_BIG);
  const { rows, errors } = await parseSheet(input.data);
  const name = (input.fileName || "planilha.xlsx").replace(/[\r\n\t]/g, " ").trim().slice(0, 200) || "planilha.xlsx";
  const [row] = await db
    .insert(studentImports)
    .values({
      name,
      status: "queued",
      total: rows.length + errors.length,
      failed: errors.length,
      errors: errors.slice(0, MAX_ERRORS),
      rows,
      createdBy: actor.id,
    })
    .returning({ id: studentImports.id });
  return { id: row.id };
}

/* ---------- processamento ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const loginLink = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/auth/login?login_token=${encodeURIComponent(token)}`;

/** Deslocamento de São Paulo no instante (ex.: "-03:00"), sem fixar o fuso. */
function spOffset(at: Date): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT-03:00";
  const m = /GMT([+-]\d{2}:\d{2})/.exec(name);
  return m ? m[1] : "+00:00";
}

function expiry(raw: string, now: Date): Date | null | "invalid" | "past" {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return "invalid";
  const back = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // 2027-02-30 vira março: confere se a data é a mesma que foi escrita.
  if (back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) return "invalid";
  const d = new Date(`${raw}T23:59:59.999${spOffset(back)}`); // fim do dia em São Paulo
  if (Number.isNaN(d.getTime())) return "invalid";
  return d.getTime() <= now.getTime() ? "past" : d;
}

type Prepared =
  | { row: number; error: string }
  | { row: number; email: string; productId: number; expiresAt: Date | null; userId: number }
  | { row: number; email: string; productId: number; expiresAt: Date | null; userId: null; name: string; document: string | null; phone: string | null; password: string; hash: string };

type RunCtx = {
  appUrl: string;
  deadline?: number;
  clock: () => number;
  now: () => Date;
  settings: PlatformSettings | null;
  /** Hash por senha (memorizado na execução): a senha padrão custa um bcrypt só. */
  hashes: Map<string, Promise<string>>;
};

const passedDeadline = (ctx: RunCtx) => ctx.deadline !== undefined && ctx.clock() >= ctx.deadline;

/** Fase 1 (sem transação): valida as linhas e calcula as senhas; para no prazo (ao menos uma linha). */
async function prepare(db: Database, rows: StudentImportRow[], ctx: RunCtx): Promise<Prepared[]> {
  const productIds = [...new Set(rows.map((r) => r.productId).filter((p) => /^\d{1,15}$/.test(p)).map(Number))];
  const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter((e) => EMAIL_RE.test(e)))];
  const [found, existing] = await Promise.all([
    productIds.length
      ? db.select({ id: products.id }).from(products).where(and(inArray(products.id, productIds), isNull(products.deletedAt)))
      : Promise.resolve([] as { id: number }[]),
    emails.length
      ? db.select({ id: users.id, email: users.email, role: users.role, deletedAt: users.deletedAt }).from(users).where(inArray(users.email, emails))
      : Promise.resolve([] as { id: number; email: string; role: string; deletedAt: Date | null }[]),
  ]);
  const productSet = new Set(found.map((p) => p.id));
  const byEmail = new Map(existing.map((u) => [u.email, u]));
  const settings = (ctx.settings ??= await getPlatformSettings(db));
  const now = ctx.now();
  const out: Prepared[] = [];

  for (const r of rows) {
    if (out.length > 0 && passedDeadline(ctx)) break;
    const status = r.status.toLowerCase();
    if (IGNORE.has(status)) {
      out.push({ row: r.row, error: "Status inativo: linha ignorada." });
      continue;
    }
    if (!GRANT.has(status)) {
      out.push({ row: r.row, error: "Status inválido." });
      continue;
    }
    const email = normalizeEmail(r.email);
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      out.push({ row: r.row, error: "E-mail inválido." });
      continue;
    }
    const productId = /^\d{1,15}$/.test(r.productId) ? Number(r.productId) : NaN;
    if (!productSet.has(productId)) {
      out.push({ row: r.row, error: "Produto não encontrado." });
      continue;
    }
    const expiresAt = expiry(r.expiresOn, now);
    if (expiresAt === "invalid" || expiresAt === "past") {
      out.push({ row: r.row, error: expiresAt === "past" ? "Data de expiração no passado." : "Data de expiração inválida (use AAAA-MM-DD)." });
      continue;
    }
    const user = byEmail.get(email);
    if (user && user.role !== "student") {
      out.push({ row: r.row, error: "O e-mail é de um administrador." });
      continue;
    }
    if (user?.deletedAt) {
      out.push({ row: r.row, error: "O aluno está na lixeira." });
      continue;
    }
    if (user) {
      out.push({ row: r.row, email, productId, expiresAt, userId: user.id });
      continue;
    }
    const digits = normalizeDocument(r.document);
    const document = digits && digits.length <= 20 ? digits : null;
    const password = initialPasswordFor({ email, document }, settings);
    let hash = ctx.hashes.get(password);
    if (!hash) {
      hash = hashPassword(password);
      ctx.hashes.set(password, hash);
    }
    out.push({
      row: r.row,
      email,
      productId,
      expiresAt,
      userId: null,
      name: r.name.trim().slice(0, 200) || email.split("@")[0],
      document,
      phone: normalizePhone(r.phone),
      password,
      hash: await hash,
    });
  }
  return out;
}

type ChunkResult = { created: number; updated: number; failed: number; errors: StudentImportError[] };

/** Fase 2 (dentro da transação curta): só gravações. */
async function apply(tx: Database, importId: number, prepared: Prepared[], ctx: RunCtx): Promise<ChunkResult> {
  const out: ChunkResult = { created: 0, updated: 0, failed: 0, errors: [] };
  const createdNow = new Map<string, number>(); // e-mail → id (mesmo aluno em várias linhas do lote)
  const at = ctx.now();
  for (const p of prepared) {
    if ("error" in p) {
      out.failed++;
      out.errors.push({ row: p.row, message: p.error });
      continue;
    }
    let userId = p.userId ?? createdNow.get(p.email) ?? null;
    if (userId !== null) {
      out.updated++;
    } else if (p.userId === null) {
      const [created] = await tx
        .insert(users)
        .values({ email: p.email, name: p.name, role: "student", document: p.document, phone: p.phone, passwordHash: p.hash, loginToken: generateLoginToken(), createdAt: at })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id, loginToken: users.loginToken });
      if (created) {
        userId = created.id;
        out.created++;
        await enqueueEmail(tx, {
          toEmail: p.email,
          toName: p.name,
          template: "importacao",
          vars: { nome: p.name, email: p.email, senha: p.password, linkAcesso: loginLink(ctx.appUrl, created.loginToken) },
          now: at,
        });
      } else {
        // Cadastrado por outro caminho entre a leitura e a gravação: vale como existente.
        const [other] = await tx.select({ id: users.id, role: users.role, deletedAt: users.deletedAt }).from(users).where(eq(users.email, p.email)).limit(1);
        if (!other || other.role !== "student" || other.deletedAt) {
          out.failed++;
          out.errors.push({ row: p.row, message: "Não foi possível cadastrar o aluno." });
          continue;
        }
        userId = other.id;
        out.updated++;
      }
      createdNow.set(p.email, userId);
    }
    await tx
      .insert(productAccess)
      .values({ userId: userId!, productId: p.productId, source: "import", saleRef: `import:${importId}`, startsAt: at, expiresAt: p.expiresAt })
      .onConflictDoNothing();
  }
  return out;
}

/** Uma parte: prepara fora de transação e grava numa transação curta. Devolve "done" | "more" | "stop". */
async function runChunk(db: Database, importId: number, ctx: RunCtx, chunkSize: number): Promise<"done" | "more" | "stop"> {
  const [imp] = await db
    .select({ status: studentImports.status, deletedAt: studentImports.deletedAt, processed: studentImports.processed, rows: studentImports.rows })
    .from(studentImports)
    .where(eq(studentImports.id, importId))
    .limit(1);
  if (!imp || imp.deletedAt || imp.status === "done" || imp.status === "failed") return "done";
  const all = imp.rows ?? [];
  const prepared = await prepare(db, all.slice(imp.processed, imp.processed + chunkSize), ctx);

  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [cur] = await tx.select().from(studentImports).where(eq(studentImports.id, importId)).limit(1).for("update");
    // Outra execução avançou (ou excluiu) enquanto esta preparava: descarta e relê.
    if (!cur || cur.deletedAt || cur.status === "done" || cur.status === "failed") return "done" as const;
    if (cur.processed !== imp.processed) return "more" as const;
    const res = await apply(tx, importId, prepared, ctx);
    const processed = cur.processed + prepared.length;
    const done = processed >= all.length;
    const at = ctx.now();
    await tx
      .update(studentImports)
      .set({
        status: done ? "done" : "processing",
        processed,
        created: cur.created + res.created,
        updated: cur.updated + res.updated,
        failed: cur.failed + res.failed,
        errors: [...cur.errors, ...res.errors].slice(0, MAX_ERRORS),
        heartbeatAt: at,
        ...(done ? { finishedAt: at, rows: null } : {}),
      })
      .where(eq(studentImports.id, importId));
    if (done) return "done" as const;
    return passedDeadline(ctx) ? ("stop" as const) : ("more" as const);
  });
}

/**
 * Processa a importação até terminar ou passar do `deadline` (epoch ms, conferido a cada linha;
 * sempre avança ao menos uma linha). Erro inesperado: deixa como está ("processing"), e o cron
 * retoma depois de 10 min sem atividade.
 */
export async function processImport(
  db: Database,
  importId: number,
  opts: { appUrl: string; deadline?: number; chunkSize?: number; clock?: () => number; now?: () => Date },
): Promise<{ done: boolean; error?: true }> {
  const ctx: RunCtx = {
    appUrl: opts.appUrl,
    deadline: opts.deadline,
    clock: opts.clock ?? Date.now,
    now: opts.now ?? (() => new Date()),
    settings: null,
    hashes: new Map(),
  };
  try {
    for (;;) {
      const r = await runChunk(db, importId, ctx, opts.chunkSize ?? IMPORT_CHUNK);
      if (r === "done") return { done: true };
      if (r === "stop" || passedDeadline(ctx)) return { done: false };
    }
  } catch (e) {
    console.error("[importação] parte falhou:", safeErrorSummary(e));
    return { done: false, error: true };
  }
}

/** Cron: retoma as importações na fila/processando paradas há mais de 10 min, até o prazo. Devolve quantas. */
export async function resumeStaleImports(db: Database, opts: { appUrl: string; now?: Date; deadline?: number }): Promise<number> {
  const now = opts.now ?? new Date();
  const limit = new Date(now.getTime() - STALE_MS);
  const stale = await db
    .select({ id: studentImports.id })
    .from(studentImports)
    .where(
      and(
        isNull(studentImports.deletedAt),
        inArray(studentImports.status, ["queued", "processing"]),
        or(lt(studentImports.heartbeatAt, limit), and(isNull(studentImports.heartbeatAt), lt(studentImports.createdAt, limit))),
      ),
    )
    .orderBy(studentImports.id)
    .limit(5);
  let n = 0;
  for (const s of stale) {
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) break;
    await processImport(db, s.id, { appUrl: opts.appUrl, deadline: opts.deadline });
    n++;
  }
  return n;
}

/* ---------- tela ---------- */

export async function listImports(db: Database, actor: User | null, opts: { trashed: boolean }): Promise<ImportListRow[]> {
  assertAdmin(actor);
  const rows = await db
    .select({
      id: studentImports.id,
      name: studentImports.name,
      status: studentImports.status,
      total: studentImports.total,
      processed: studentImports.processed,
      pending: sql<number>`coalesce(jsonb_array_length(${studentImports.rows}), 0)`,
      created: studentImports.created,
      updated: studentImports.updated,
      failed: studentImports.failed,
      createdAt: studentImports.createdAt,
      finishedAt: studentImports.finishedAt,
      deletedAt: studentImports.deletedAt,
    })
    .from(studentImports)
    .where(opts.trashed ? isNotNull(studentImports.deletedAt) : isNull(studentImports.deletedAt))
    .orderBy(desc(studentImports.createdAt), desc(studentImports.id))
    .limit(200);
  return rows.map((r) => ({ ...r, pending: Number(r.pending) }));
}

export async function getImportErrors(db: Database, actor: User | null, id: number): Promise<StudentImportError[]> {
  assertAdmin(actor);
  const [row] = await db.select({ errors: studentImports.errors }).from(studentImports).where(eq(studentImports.id, id)).limit(1);
  if (!row) throw new AdminError("Importação não encontrada.");
  return [...row.errors].sort((a, b) => a.row - b.row);
}

export async function trashImport(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  // Excluir no meio interrompe o processamento; as linhas (dados pessoais) não ficam guardadas.
  const r = await db
    .update(studentImports)
    .set({
      deletedAt: new Date(),
      rows: null,
      status: sql`case when ${studentImports.status} = 'done' then 'done' else 'failed' end`,
      finishedAt: sql`coalesce(${studentImports.finishedAt}, now())`,
    })
    .where(and(eq(studentImports.id, id), isNull(studentImports.deletedAt)))
    .returning({ id: studentImports.id });
  if (r.length === 0) throw new AdminError("Importação não encontrada.");
}

export async function restoreImport(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  const r = await db.update(studentImports).set({ deletedAt: null }).where(and(eq(studentImports.id, id), isNotNull(studentImports.deletedAt))).returning({ id: studentImports.id });
  if (r.length === 0) throw new AdminError("Importação não encontrada.");
}
