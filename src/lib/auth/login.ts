import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "./password";
import type { User } from "./sessions";
import { normalizeEmail, normalizeLoginToken } from "./tokens";

// Login sempre conta como acesso (sem o limite de 1x/h do toque por visita, em src/lib/students/events.ts).
async function stampLastAccess(db: Database, user: User): Promise<User> {
  const now = new Date();
  await db.update(users).set({ lastAccessAt: now }).where(eq(users.id, user.id));
  return { ...user, lastAccessAt: now };
}

// Hash bcrypt fictício (custo 10, como os reais; senha aleatória descartada) para e-mail
// inexistente custar o mesmo tempo que senha errada, inclusive na primeira requisição.
const DUMMY_HASH = "$2b$10$TxFcB4h1oJOzBcNbPKc1.u4tDV1htm0Y3GztotDWTffETHutBaMFu";

export async function loginWithPassword(db: Database, email: string, password: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, normalizeEmail(email)), isNull(users.deletedAt)))
    .limit(1);
  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  return stampLastAccess(db, user);
}

/** Link automático (login_token): só alunos. Admin nunca entra sem senha; o link dele dá "link inválido". */
export async function loginWithToken(db: Database, rawToken: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.loginToken, normalizeLoginToken(rawToken)), eq(users.role, "student"), isNull(users.deletedAt)))
    .limit(1);
  return user ? stampLastAccess(db, user) : null;
}
