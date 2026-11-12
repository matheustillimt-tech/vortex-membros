import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { deliveryTags, tags, userTags, users } from "@/db/schema";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import type { User } from "@/lib/auth/sessions";

export type Tag = { id: number; name: string };
export const TAG_NAME_MAX = 60;

export async function listTags(db: Database, actor: User | null): Promise<Tag[]> {
  assertAdmin(actor);
  return db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(asc(sql`lower(${tags.name})`), asc(tags.id));
}

export const TAG_DUPLICATE = "Já existe uma tag com este nome.";
const TAG_NOT_FOUND = "Tag não encontrada.";

/** Violação de unicidade (23505), também quando o driver a embrulha em `cause`. */
function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  while (e && typeof e === "object") {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

function cleanName(rawName: unknown): string {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) throw new AdminError("Informe o nome da tag.");
  if (name.length > TAG_NAME_MAX) throw new AdminError(`O nome da tag pode ter até ${TAG_NAME_MAX} caracteres.`);
  return name;
}

async function findByName(db: Database, name: string, exceptId?: number): Promise<Tag | null> {
  const same = sql`lower(${tags.name}) = lower(${name})`;
  const [row] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(exceptId === undefined ? same : and(same, ne(tags.id, exceptId)))
    .limit(1);
  return row ?? null;
}

/**
 * Cria a tag. Se já existir uma com o mesmo nome (sem diferenciar maiúsculas), devolve a existente
 * (seletor da entrega) ou, com `rejectDuplicate` (tela Tags), recusa.
 */
export async function createTag(db: Database, actor: User | null, rawName: string, opts: { rejectDuplicate?: boolean } = {}): Promise<Tag> {
  assertAdmin(actor);
  const name = cleanName(rawName);
  const existing = await findByName(db, name);
  if (existing) {
    if (opts.rejectDuplicate) throw new AdminError(TAG_DUPLICATE);
    return existing;
  }
  const [row] = await db.insert(tags).values({ name }).onConflictDoNothing().returning({ id: tags.id, name: tags.name });
  if (row) return row;
  if (opts.rejectDuplicate) throw new AdminError(TAG_DUPLICATE);
  return (await findByName(db, name))!;
}

export async function renameTag(db: Database, actor: User | null, id: number, rawName: string): Promise<void> {
  assertAdmin(actor);
  const name = cleanName(rawName);
  if (await findByName(db, name, id)) throw new AdminError(TAG_DUPLICATE);
  // O índice único em lower(name) fecha a corrida entre a checagem acima e a gravação.
  const updated = await db
    .update(tags)
    .set({ name })
    .where(eq(tags.id, id))
    .returning({ id: tags.id })
    .catch((e: unknown) => {
      if (isUniqueViolation(e)) throw new AdminError(TAG_DUPLICATE);
      throw e;
    });
  if (updated.length === 0) throw new AdminError(TAG_NOT_FOUND);
}

/** Exclui a tag e os vínculos (alunos e entregas); os alunos ficam. */
export async function deleteTag(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    // Vínculos antes da tag: nada fica apontando para uma tag que já não existe.
    await tx.delete(userTags).where(eq(userTags.tagId, id));
    await tx.delete(deliveryTags).where(eq(deliveryTags.tagId, id));
    const gone = await tx.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
    if (gone.length === 0) throw new AdminError(TAG_NOT_FOUND);
  });
}

/** Alunos (não excluídos) por tag, numa consulta: `{ [tagId]: n }` (tags sem alunos ficam de fora). */
export async function countStudentsByTag(db: Database, actor: User | null): Promise<Record<number, number>> {
  assertAdmin(actor);
  const rows = await db
    .select({ tagId: userTags.tagId, n: count() })
    .from(userTags)
    .innerJoin(users, eq(users.id, userTags.userId))
    .where(and(eq(users.role, "student"), isNull(users.deletedAt)))
    .groupBy(userTags.tagId);
  return Object.fromEntries(rows.map((r) => [r.tagId, Number(r.n)]));
}

/** Aplica as tags ao aluno (as que ele já tem ficam como estão). */
export async function applyTags(db: Database, userId: number, tagIds: number[]): Promise<void> {
  const ids = [...new Set(tagIds)];
  if (ids.length === 0) return;
  await db
    .insert(userTags)
    .values(ids.map((tagId) => ({ userId, tagId })))
    .onConflictDoNothing();
}
