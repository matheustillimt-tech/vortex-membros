import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/db";
import { media, users } from "@/db/schema";
import type { Database } from "@/db";
import type { User } from "@/lib/auth/sessions";
import { AVATAR_MAX_BYTES, removeAvatar, setAvatar } from "@/lib/avatar";

let db: Database;
let aluno: User;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]);

beforeAll(async () => {
  db = await createTestDb();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t" }).returning();
});

test("foto do aluno: JPEG/PNG até 1 MB vira /media/<id> no perfil; remover limpa", async () => {
  const r = await setAvatar(db, aluno, png);
  expect(r).toMatchObject({ ok: true, url: expect.stringMatching(/^\/media\/\d+$/) });
  const [u] = await db.select().from(users).where(eq(users.id, aluno.id));
  expect(u.avatarUrl).toBe((r as { url: string }).url);
  const [m] = await db.select().from(media);
  expect(m).toMatchObject({ mime: "image/png", createdBy: aluno.id });
  expect(await removeAvatar(db, aluno)).toEqual({ ok: true, url: null });
  expect((await db.select().from(users).where(eq(users.id, aluno.id)))[0].avatarUrl).toBeNull();
});

test("foto do aluno: recusa GIF, arquivo vazio e acima de 1 MB", async () => {
  expect(await setAvatar(db, aluno, gif)).toEqual({ ok: false, error: "Formato não suportado. Envie JPEG ou PNG." });
  expect(await setAvatar(db, aluno, new Uint8Array())).toEqual({ ok: false, error: "Selecione uma imagem." });
  const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
  big.set(png);
  expect(await setAvatar(db, aluno, big)).toEqual({ ok: false, error: "Arquivo maior que 1 MB." });
});
