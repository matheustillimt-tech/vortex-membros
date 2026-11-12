import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import type { Database } from "@/db";
import { STUDENT_NOTE_MAX, studentNotes, tags, userLogs, userTags, users, type UserLogEvent } from "@/db/schema";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import { initialPasswordFor } from "@/lib/auth/initial-password";
import { hashPassword } from "@/lib/auth/password";
import { generatePassword, getPasswordPolicy, validatePassword } from "@/lib/auth/password-policy";
import { revokeUserSessions, type User } from "@/lib/auth/sessions";
import { generateLoginToken, normalizeEmail } from "@/lib/auth/tokens";
import { enqueueEmail } from "@/lib/email/outbox";
import { getPlatformSettings } from "@/lib/settings";
import { EVENT_LABELS, recordEvent } from "./events";
import { formatDateTimeSeconds, formatDocument } from "./format";

/**
 * Alunos no painel (Alunos › perfil do aluno): cadastro, boas-vindas, edição, senha, exclusão
 * (soft delete: os acessos ficam como estão, só as sessões caem), tags, notas, logs e exportações.
 * Toda função exige admin (`assertAdmin`); mensagens de AdminError vão para a interface.
 */

export const STUDENT_NOT_FOUND = "Aluno não encontrado.";
const MAX_NAME = 200;
const LOGS_PAGE = 50;
const LOGS_CSV_MAX = 20_000;

const loginLink = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/auth/login?login_token=${encodeURIComponent(token)}`;

function cleanName(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) throw new AdminError("Informe o nome.");
  if (v.length > MAX_NAME) throw new AdminError(`O nome pode ter até ${MAX_NAME} caracteres.`);
  return v;
}

function cleanEmail(raw: unknown): string {
  const v = typeof raw === "string" ? normalizeEmail(raw) : "";
  if (v.length > 254 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v)) throw new AdminError("Informe um e-mail válido.");
  return v;
}

/** CPF/CNPJ: só os dígitos (como as vendas gravam); vazio = null. */
function cleanDocument(raw: unknown): string | null {
  const digits = (typeof raw === "string" ? raw : "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length > 20) throw new AdminError("CPF ou CNPJ inválido.");
  return digits;
}

/** Celular: "+{DDI}{número}" (só dígitos depois do +); sem "+", vale como brasileiro (+55). */
function cleanPhone(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  const digits = v.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length > 20) throw new AdminError("Celular inválido.");
  return v.startsWith("+") ? `+${digits}` : `+55${digits}`;
}

const activeStudent = (id: number) => and(eq(users.id, id), eq(users.role, "student"), isNull(users.deletedAt));

async function findStudent(db: Database, id: number): Promise<User> {
  const [u] = await db.select().from(users).where(activeStudent(id)).limit(1);
  if (!u) throw new AdminError(STUDENT_NOT_FOUND);
  return u;
}

/* ---------- cadastro ---------- */

/** "Novo Aluno" → "Criar e enviar boas vindas": senha inicial das configurações, e-mail `gratis`. */
export async function createStudent(
  db: Database,
  actor: User | null,
  input: { name: string; email: string },
  opts: { appUrl: string },
): Promise<{ id: number }> {
  assertAdmin(actor);
  const name = cleanName(input.name);
  const email = cleanEmail(input.email);
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1).for("update");
    if (taken) throw new AdminError("Este e-mail já está cadastrado.");
    const settings = await getPlatformSettings(tx);
    const password = initialPasswordFor({ email }, settings);
    const [user] = await tx
      .insert(users)
      .values({ email, name, role: "student", passwordHash: await hashPassword(password), loginToken: generateLoginToken() })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!user) throw new AdminError("Este e-mail já está cadastrado.");
    await enqueueEmail(tx, {
      toEmail: email,
      toName: name,
      template: "gratis",
      vars: { nome: name, email, senha: password, linkAcesso: loginLink(opts.appUrl, user.loginToken) },
    });
    return { id: user.id };
  });
}

/** "Reenviar boas-vindas": nova senha (a atual deixa de funcionar), sessões encerradas, e-mail `gratis`. */
export async function resendWelcome(db: Database, actor: User | null, id: number, opts: { appUrl: string }): Promise<void> {
  assertAdmin(actor);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [user] = await tx.select().from(users).where(activeStudent(id)).limit(1).for("update");
    if (!user) throw new AdminError(STUDENT_NOT_FOUND);
    const password = generatePassword(getPasswordPolicy(await getPlatformSettings(tx)));
    await tx.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id));
    await revokeUserSessions(tx, id);
    await enqueueEmail(tx, {
      toEmail: user.email,
      toName: user.name,
      template: "gratis",
      vars: { nome: user.name, email: user.email, senha: password, linkAcesso: loginLink(opts.appUrl, user.loginToken) },
    });
  });
}

/** "Editar aluno": nome, e-mail (único), CPF/CNPJ e celular. Trocar o e-mail encerra as sessões. */
export async function updateStudent(
  db: Database,
  actor: User | null,
  id: number,
  input: { name: string; email: string; document?: string | null; phone?: string | null },
): Promise<void> {
  assertAdmin(actor);
  const name = cleanName(input.name);
  const email = cleanEmail(input.email);
  const document = cleanDocument(input.document);
  const phone = cleanPhone(input.phone);
  const current = await findStudent(db, id);
  const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, id))).limit(1);
  if (taken) throw new AdminError("Este e-mail já está em uso.");
  await db.update(users).set({ name, email, document, phone }).where(activeStudent(id));
  if (email !== current.email) await revokeUserSessions(db, id);
}

/** "Alterar senha": segue a política; encerra as sessões do aluno e registra "Senha alterada". */
export async function setStudentPassword(
  db: Database,
  actor: User | null,
  id: number,
  password: string,
  ctx: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  assertAdmin(actor);
  await findStudent(db, id);
  const problem = validatePassword(password, getPasswordPolicy(await getPlatformSettings(db)));
  if (problem) throw new AdminError(problem);
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(activeStudent(id));
  await revokeUserSessions(db, id);
  await recordEvent(db, id, "password_changed", ctx);
}

/**
 * "Excluir aluno": some da lista e das áreas (login e sessões recusam `deleted_at`) e as sessões
 * caem. Acessos e vendas ficam como estão: restaurar devolve exatamente o que valia antes.
 */
export async function deleteStudent(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  const done = await db.update(users).set({ deletedAt: new Date() }).where(activeStudent(id)).returning({ id: users.id });
  if (!done.length) throw new AdminError(STUDENT_NOT_FOUND);
  await revokeUserSessions(db, id);
}

/** "Restaurar aluno" (Lixeira). */
export async function restoreStudent(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  const done = await db
    .update(users)
    .set({ deletedAt: null })
    .where(and(eq(users.id, id), eq(users.role, "student"), isNotNull(users.deletedAt)))
    .returning({ id: users.id });
  if (!done.length) throw new AdminError(STUDENT_NOT_FOUND);
}

/* ---------- perfil ---------- */

export type StudentProfile = {
  id: number;
  name: string;
  email: string;
  document: string | null;
  phone: string | null;
  loginToken: string;
  createdAt: Date;
  lastAccessAt: Date | null;
  firstAccessAt: Date | null;
  tags: { id: number; name: string }[];
};

export async function getStudentProfile(db: Database, actor: User | null, id: number): Promise<StudentProfile> {
  assertAdmin(actor);
  const u = await findStudent(db, id);
  const tagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(userTags)
    .innerJoin(tags, eq(tags.id, userTags.tagId))
    .where(eq(userTags.userId, id))
    .orderBy(asc(tags.name), asc(tags.id));
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    document: u.document,
    phone: u.phone,
    loginToken: u.loginToken,
    createdAt: u.createdAt,
    lastAccessAt: u.lastAccessAt,
    firstAccessAt: u.firstAccessAt,
    tags: tagRows,
  };
}

/** "Gerenciar tags": o aluno fica exatamente com estas tags. */
export async function setStudentTags(db: Database, actor: User | null, id: number, tagIds: number[]): Promise<void> {
  assertAdmin(actor);
  await findStudent(db, id);
  const ids = [...new Set(tagIds)];
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    if (ids.length) {
      const found = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, ids));
      if (found.length !== ids.length) throw new AdminError("Tag não encontrada.");
    }
    await tx.delete(userTags).where(eq(userTags.userId, id));
    if (ids.length) await tx.insert(userTags).values(ids.map((tagId) => ({ userId: id, tagId })));
  });
}

/* ---------- notas ---------- */

export type StudentNote = { id: number; body: string; createdAt: Date; author: { id: number; name: string } | null };

export async function listNotes(db: Database, actor: User | null, userId: number): Promise<StudentNote[]> {
  assertAdmin(actor);
  const rows = await db
    .select({ id: studentNotes.id, body: studentNotes.body, createdAt: studentNotes.createdAt, authorId: users.id, authorName: users.name })
    .from(studentNotes)
    .leftJoin(users, eq(users.id, studentNotes.authorId))
    .where(and(eq(studentNotes.userId, userId), isNull(studentNotes.deletedAt)))
    .orderBy(desc(studentNotes.createdAt), desc(studentNotes.id))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    author: r.authorId !== null && r.authorName !== null ? { id: r.authorId, name: r.authorName } : null,
  }));
}

export async function addNote(db: Database, actor: User | null, userId: number, rawBody: string): Promise<{ id: number }> {
  assertAdmin(actor);
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!body) throw new AdminError("Escreva a nota.");
  if (body.length > STUDENT_NOTE_MAX) throw new AdminError(`A nota pode ter até ${STUDENT_NOTE_MAX} caracteres.`);
  await findStudent(db, userId);
  const [row] = await db.insert(studentNotes).values({ userId, authorId: actor.id, body }).returning({ id: studentNotes.id });
  return row;
}

export async function deleteNote(db: Database, actor: User | null, userId: number, noteId: number): Promise<void> {
  assertAdmin(actor);
  const done = await db
    .update(studentNotes)
    .set({ deletedAt: new Date() })
    .where(and(eq(studentNotes.id, noteId), eq(studentNotes.userId, userId), isNull(studentNotes.deletedAt)))
    .returning({ id: studentNotes.id });
  if (!done.length) throw new AdminError("Nota não encontrada.");
}

/* ---------- logs ---------- */

export type StudentLog = { id: number; event: UserLogEvent; label: string; ip: string | null; userAgent: string | null; createdAt: Date };

/** Aba Logs: 50 por página, mais recentes primeiro (cursor = id da última linha). */
export async function listLogs(
  db: Database,
  actor: User | null,
  userId: number,
  opts: { cursor?: number },
): Promise<{ rows: StudentLog[]; total: number; nextCursor: number | null }> {
  assertAdmin(actor);
  const where = and(eq(userLogs.userId, userId), opts.cursor ? lt(userLogs.id, opts.cursor) : undefined);
  const rows = await db.select().from(userLogs).where(where).orderBy(desc(userLogs.id)).limit(LOGS_PAGE + 1);
  const [{ total }] = await db.select({ total: count() }).from(userLogs).where(eq(userLogs.userId, userId));
  const page = rows.slice(0, LOGS_PAGE);
  return {
    rows: page.map((r) => ({ id: r.id, event: r.event, label: EVENT_LABELS[r.event], ip: r.ip, userAgent: r.userAgent, createdAt: r.createdAt })),
    total: Number(total),
    nextCursor: rows.length > LOGS_PAGE ? page[page.length - 1].id : null,
  };
}

/* ---------- CSV ---------- */

const BOM = "﻿";
const EOL = "\r\n";

/**
 * Campo de CSV (separador `;`, como o Excel em português): aspas quando há `;`, aspas ou quebra de
 * linha; valor que começa com = + - @ (fórmula no Excel) ganha um apóstrofo na frente.
 */
export function csvField(value: string | number | null | undefined): string {
  let v = value === null || value === undefined ? "" : String(value);
  // Telefone "+5511…" (só + e dígitos) não é fórmula: fica como está.
  if (/^[=+\-@\t\r]/.test(v) && !/^\+\d+$/.test(v)) v = `'${v}`;
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const csvLine = (fields: (string | number | null | undefined)[]) => fields.map(csvField).join(";") + EOL;

/** "Exportar logs": todos os logs do aluno (até 20 mil), mais recentes primeiro. */
export async function logsCsv(db: Database, actor: User | null, userId: number): Promise<string> {
  assertAdmin(actor);
  const rows = await db.select().from(userLogs).where(eq(userLogs.userId, userId)).orderBy(desc(userLogs.id)).limit(LOGS_CSV_MAX);
  let out = BOM + csvLine(["Data", "Evento", "IP", "Dispositivo"]);
  for (const r of rows) out += csvLine([formatDateTimeSeconds(r.createdAt), EVENT_LABELS[r.event], r.ip, r.userAgent]);
  return out;
}

/**
 * "Exportar alunos": todos os alunos não excluídos, em lotes por id (streaming, memória constante).
 * Colunas: ID, Nome, E-mail, CPF/CNPJ, Celular, Cadastrado em, Último acesso.
 */
export async function* studentsCsv(db: Database, actor: User | null, opts: { batchSize?: number } = {}): AsyncGenerator<string> {
  assertAdmin(actor);
  const size = opts.batchSize ?? 1000;
  yield BOM + csvLine(["ID", "Nome", "E-mail", "CPF/CNPJ", "Celular", "Cadastrado em", "Último acesso"]);
  let after = 0;
  for (;;) {
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, document: users.document, phone: users.phone, createdAt: users.createdAt, lastAccessAt: users.lastAccessAt })
      .from(users)
      .where(and(eq(users.role, "student"), isNull(users.deletedAt), gt(users.id, after)))
      .orderBy(asc(users.id))
      .limit(size);
    if (!rows.length) return;
    let chunk = "";
    for (const r of rows) {
      chunk += csvLine([
        r.id,
        r.name,
        r.email,
        formatDocument(r.document),
        r.phone,
        formatDateTimeSeconds(r.createdAt),
        r.lastAccessAt ? formatDateTimeSeconds(r.lastAccessAt) : "",
      ]);
    }
    yield chunk;
    after = rows[rows.length - 1].id;
    if (rows.length < size) return;
  }
}

/** Pesquisa usada em outros módulos: o aluno existe (não excluído)? */
export async function assertStudentExists(db: Database, id: number): Promise<User> {
  return findStudent(db, id);
}
