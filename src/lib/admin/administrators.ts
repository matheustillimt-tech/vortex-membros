import { and, asc, desc, eq, ilike, isNotNull, isNull, ne, or } from "drizzle-orm";
import type { Database } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { issueResetToken } from "@/lib/auth/password-reset";
import {
  DEFAULT_PASSWORD_POLICY,
  generatePassword,
  getPasswordPolicy,
  validatePassword,
  type PasswordPolicy,
} from "@/lib/auth/password-policy";
import { revokeUserSessions, type User } from "@/lib/auth/sessions";
import { generateLoginToken, normalizeEmail } from "@/lib/auth/tokens";
import { enqueueEmail } from "@/lib/email/outbox";
import { getPlatformSettings } from "@/lib/settings";
import { AdminError } from "./errors";
import { ADMIN_ONLY_MESSAGE, assertAdmin } from "./guard";

/**
 * Administradores (Configurações › Administradores). Admin = `users.role = "admin"`; o nível fica
 * em `admin_role` (só "root" = Super Admin por enquanto; null em admin antigo vale como root).
 * Excluir um admin não apaga o cadastro: ele volta a ser aluno.
 */

export type AdminRole = "root";
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = { root: "Super Admin" };

export type AdministratorRow = {
  id: number;
  name: string;
  email: string;
  document: string | null;
  phone: string | null;
  adminRole: AdminRole;
  lastAccessAt: Date | null;
  createdAt: Date;
};

const NOT_FOUND = "Administrador não encontrado.";
const INVALID_EMAIL = "Informe um e-mail válido.";
const MAX_NAME = 200;
const MAX_FIELD = 50;
/** 12 caracteres (o mínimo); cresce se a política configurada pedir mais. */
export const GENERATED_PASSWORD_LENGTH = 12;

/**
 * Senha aleatória para o convite/reenvio: 12 caracteres com pelo menos 2 de cada categoria, e
 * também a política configurada, se for mais exigente.
 */
export function generateAdminPassword(policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): string {
  return generatePassword({ ...policy, strong: true }, { length: GENERATED_PASSWORD_LENGTH, atLeast: 2 });
}

function cleanName(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) throw new AdminError("Informe o nome.");
  if (v.length > MAX_NAME) throw new AdminError(`O nome pode ter até ${MAX_NAME} caracteres.`);
  return v;
}

function cleanEmail(raw: unknown): string {
  const v = typeof raw === "string" ? normalizeEmail(raw) : "";
  if (v.length > 254 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v)) throw new AdminError(INVALID_EMAIL);
  return v;
}

function cleanOptional(raw: unknown, label: string): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v.length > MAX_FIELD) throw new AdminError(`${label} pode ter até ${MAX_FIELD} caracteres.`);
  return v || null;
}

function toRow(u: User): AdministratorRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    document: u.document,
    phone: u.phone,
    adminRole: u.adminRole ?? "root",
    lastAccessAt: u.lastAccessAt,
    createdAt: u.createdAt,
  };
}

const activeAdmin = (id: number) => and(eq(users.id, id), eq(users.role, "admin"), isNull(users.deletedAt));

async function findAdmin(db: Database, id: number, opts: { lock?: boolean } = {}): Promise<User> {
  const q = db.select().from(users).where(activeAdmin(id)).limit(1);
  const [u] = opts.lock ? await q.for("update") : await q;
  if (!u) throw new AdminError(NOT_FOUND);
  return u;
}

/** `%`, `_` e `\` da busca valem como texto. */
const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listAdministrators(db: Database, actor: User | null, opts: { search?: string } = {}): Promise<AdministratorRow[]> {
  assertAdmin(actor);
  const q = opts.search?.trim();
  const where = and(
    eq(users.role, "admin"),
    isNull(users.deletedAt),
    q ? or(ilike(users.name, likePattern(q)), ilike(users.email, likePattern(q))) : undefined,
  );
  const rows = await db.select().from(users).where(where).orderBy(asc(users.name), asc(users.id));
  return rows.map(toRow);
}

export async function getAdministrator(db: Database, actor: User | null, id: number): Promise<AdministratorRow> {
  assertAdmin(actor);
  return toRow(await findAdmin(db, id));
}

/**
 * Grava a senha nova, troca o login_token (o link automático antigo deixa de valer), encerra as
 * sessões e manda o e-mail "convite-admin" com usuário e senha.
 */
async function issuePassword(tx: Database, user: User, appUrl: string, keepSessionToken?: string): Promise<void> {
  const settings = await getPlatformSettings(tx);
  const password = generateAdminPassword(getPasswordPolicy(settings));
  await tx
    .update(users)
    .set({ passwordHash: await hashPassword(password), loginToken: generateLoginToken() })
    .where(eq(users.id, user.id));
  await revokeUserSessions(tx, user.id, keepSessionToken ? { except: keepSessionToken } : {});
  await enqueueEmail(tx, {
    toEmail: user.email,
    toName: user.name,
    template: "convite-admin",
    vars: { nome: user.name, email: user.email, senha: password, linkAcesso: `${appUrl.replace(/\/+$/, "")}/auth/login` },
  });
}

/**
 * Promoção de quem já tinha cadastro: a senha e as sessões continuam; vai o convite com o link
 * de redefinição (sem senha). O login_token é trocado: o link automático de aluno, já enviado
 * em e-mails de venda, não pode abrir uma sessão de admin.
 */
async function invitePromoted(tx: Database, user: User, appUrl: string): Promise<void> {
  const base = appUrl.replace(/\/+$/, "");
  const token = await issueResetToken(tx, user.id);
  await enqueueEmail(tx, {
    toEmail: user.email,
    toName: user.name,
    template: "convite-admin",
    vars: { nome: user.name, email: user.email, linkRedefinicao: `${base}/auth/recuperar_senha/${token}`, linkAcesso: `${base}/auth/login` },
  });
}

/**
 * "Salvar e enviar senha": e-mail novo cria o cadastro com uma senha gerada (vai no convite);
 * e-mail de aluno o promove (nome, senha e sessões ficam como estão; o convite leva um link
 * para definir uma nova senha).
 */
export async function createAdministrator(
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
    const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1).for("update");
    if (existing) {
      if (existing.deletedAt) throw new AdminError("Este e-mail pertence a um cadastro excluído.");
      if (existing.role === "admin") throw new AdminError("Este e-mail já é de um administrador.");
      const [promoted] = await tx
        .update(users)
        .set({ role: "admin", adminRole: "root", adminRemovedAt: null, loginToken: generateLoginToken() })
        .where(eq(users.id, existing.id))
        .returning();
      await invitePromoted(tx, promoted, opts.appUrl);
      return { id: promoted.id };
    }
    const [user] = await tx
      .insert(users)
      .values({
        email,
        name,
        role: "admin",
        adminRole: "root",
        passwordHash: "!", // trocada logo abaixo
        loginToken: generateLoginToken(),
      })
      .returning();
    await issuePassword(tx, user, opts.appUrl);
    return { id: user.id };
  });
}

/** "Reenviar acesso": nova senha por e-mail; a anterior e o link automático deixam de valer e as sessões dele caem. */
export async function resendAccess(
  db: Database,
  actor: User | null,
  id: number,
  opts: { appUrl: string; keepSessionToken?: string },
): Promise<void> {
  assertAdmin(actor);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const user = await findAdmin(tx, id, { lock: true });
    await issuePassword(tx, user, opts.appUrl, user.id === actor.id ? opts.keepSessionToken : undefined);
  });
}

/** "Alterar senha": segue a política; encerra as sessões dele (menos a atual, se for o próprio ator). */
export async function setAdministratorPassword(
  db: Database,
  actor: User | null,
  id: number,
  password: string,
  opts: { keepSessionToken?: string } = {},
): Promise<void> {
  assertAdmin(actor);
  const user = await findAdmin(db, id);
  const problem = validatePassword(password, getPasswordPolicy(await getPlatformSettings(db)));
  if (problem) throw new AdminError(problem);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), loginToken: generateLoginToken() })
    .where(eq(users.id, user.id));
  const keep = user.id === actor.id ? opts.keepSessionToken : undefined;
  await revokeUserSessions(db, user.id, keep ? { except: keep } : {});
}

/** "Editar perfil": nome, e-mail, CPF e celular. Trocar o e-mail de outro admin encerra as sessões dele. */
export async function updateAdministrator(
  db: Database,
  actor: User | null,
  id: number,
  input: { name: string; email: string; document?: string | null; phone?: string | null },
): Promise<void> {
  assertAdmin(actor);
  const name = cleanName(input.name);
  const email = cleanEmail(input.email);
  const document = cleanOptional(input.document, "O CPF");
  const phone = cleanOptional(input.phone, "O celular");
  const current = await findAdmin(db, id);
  const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, id))).limit(1);
  if (taken) throw new AdminError("Este e-mail já está em uso.");
  await db.update(users).set({ name, email, document, phone }).where(activeAdmin(id));
  // O próprio ator não é desconectado (a action não tem como manter só a sessão atual aqui).
  if (email !== current.email && id !== actor.id) await revokeUserSessions(db, id);
}

/**
 * "Excluir administrador": volta a aluno e perde as sessões. Recusa a si mesmo e o último
 * Super Admin. As linhas dos admins ficam travadas na transação: duas exclusões ao mesmo tempo
 * não deixam a conta sem nenhum.
 */
export async function removeAdministrator(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  if (id === actor.id) throw new AdminError("Você não pode excluir a si mesmo.");
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const admins = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
      .for("update");
    if (!admins.some((a) => a.id === id)) throw new AdminError(NOT_FOUND);
    if (admins.length <= 1) throw new AdminError("Não é possível excluir o último Super Admin.");
    // O ator precisa continuar admin agora, com as linhas travadas (pode ter sido rebaixado).
    if (!admins.some((a) => a.id === actor.id)) throw new AdminError(ADMIN_ONLY_MESSAGE);
    await tx.update(users).set({ role: "student", adminRole: null, adminRemovedAt: new Date() }).where(eq(users.id, id));
    await revokeUserSessions(tx, id);
  });
}

export type RemovedAdministratorRow = { id: number; name: string; email: string; removedAt: Date };

/** Lixeira: quem foi excluído de administrador e continua como aluno (cadastro não excluído). */
export async function listRemovedAdministrators(db: Database, actor: User | null): Promise<RemovedAdministratorRow[]> {
  assertAdmin(actor);
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, removedAt: users.adminRemovedAt })
    .from(users)
    .where(and(eq(users.role, "student"), isNull(users.deletedAt), isNotNull(users.adminRemovedAt)))
    .orderBy(desc(users.adminRemovedAt));
  return rows.map((r) => ({ ...r, removedAt: r.removedAt! }));
}

/** "Restaurar": volta a Super Admin com a senha de antes (as sessões já tinham sido encerradas). */
export async function restoreAdministrator(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  const [row] = await db
    .update(users)
    .set({ role: "admin", adminRole: "root", adminRemovedAt: null })
    .where(and(eq(users.id, id), eq(users.role, "student"), isNull(users.deletedAt), isNotNull(users.adminRemovedAt)))
    .returning({ id: users.id });
  if (!row) throw new AdminError(NOT_FOUND);
}

// Datas do painel (puras, usadas também no cliente): ficam em src/lib/students/format.ts.
export { formatDateTime, formatLongDay as formatLongDate, formatRelativeTime as formatRelative } from "@/lib/students/format";
