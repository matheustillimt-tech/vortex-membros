import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "@/db";
import { users, type Address } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validatePassword, type PasswordPolicy } from "@/lib/auth/password-policy";
import { revokeUserSessions, type User } from "@/lib/auth/sessions";
import { generateLoginToken, normalizeEmail } from "@/lib/auth/tokens";
import type { PlatformSettings } from "@/lib/settings";

export type ProfileInput = {
  name?: string;
  email?: string;
  document?: string | null;
  phone?: string | null;
  address?: Address | null;
};

type Result = { ok: true } | { ok: false; error: string };

const EMAIL_IN_USE: Result = { ok: false, error: "Este e-mail já está em uso." };

function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  while (e && typeof e === "object") {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export async function updateProfile(
  db: Database,
  user: User,
  input: ProfileInput,
  settings: PlatformSettings,
): Promise<Result> {
  const { canEditNameAndDocument, canEditEmail } = settings.studentProfile;
  const set: Partial<typeof users.$inferInsert> = {};

  if (canEditNameAndDocument) {
    const name = input.name?.trim();
    if (name) set.name = name;
    if (input.document !== undefined) set.document = input.document;
  }
  if (canEditEmail && input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (email && email !== user.email) {
      const [dup] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), ne(users.id, user.id), isNull(users.deletedAt)))
        .limit(1);
      if (dup) return EMAIL_IN_USE;
      set.email = email;
    }
  }
  if (input.phone !== undefined) set.phone = input.phone;
  if (input.address !== undefined) set.address = input.address;

  if (Object.keys(set).length === 0) return { ok: true };
  try {
    await db.update(users).set(set).where(eq(users.id, user.id));
  } catch (err) {
    if (isUniqueViolation(err)) return EMAIL_IN_USE;
    throw err;
  }
  return { ok: true };
}

/** Troca de senha pelo perfil: segue a política e encerra as outras sessões (a atual continua). */
export async function changePassword(
  db: Database,
  user: User,
  current: string,
  next: string,
  opts: { policy: PasswordPolicy; keepSessionToken?: string },
): Promise<Result> {
  if (!(await verifyPassword(current, user.passwordHash))) return { ok: false, error: "Senha atual incorreta." };
  const weak = validatePassword(next, opts.policy);
  if (weak) return { ok: false, error: weak };
  // Admin também ganha login_token novo; o do aluno fica (links de e-mails antigos seguem valendo).
  const loginToken = user.role === "admin" ? generateLoginToken() : undefined;
  await db.update(users).set({ passwordHash: await hashPassword(next), loginToken }).where(eq(users.id, user.id));
  await revokeUserSessions(db, user.id, { except: opts.keepSessionToken });
  return { ok: true };
}
