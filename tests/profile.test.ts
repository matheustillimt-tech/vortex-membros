import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/db";
import { users } from "@/db/schema";
import type { Database } from "@/db";
import { createSession, getSessionUser, type User } from "@/lib/auth/sessions";
import { STRONG_CRITERIA, DEFAULT_PASSWORD_POLICY } from "@/lib/auth/password-policy";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { hashPassword } from "@/lib/auth/password";
import { loginWithPassword } from "@/lib/auth/login";
import { changePassword, updateProfile } from "@/lib/profile";

let db: Database;
let aluno: User;
const reload = async () => (await db.select().from(users).where(eq(users.id, aluno.id)))[0];
const withProfile = (p: Partial<typeof DEFAULT_SETTINGS.studentProfile>) => ({
  ...DEFAULT_SETTINGS,
  studentProfile: { ...DEFAULT_SETTINGS.studentProfile, ...p },
});

beforeAll(async () => {
  db = await createTestDb();
  [aluno] = await db.insert(users).values({
    email: "aluno@x.com", name: "Aluno", document: "111", role: "student",
    passwordHash: await hashPassword("segredo1"), loginToken: "t1",
  }).returning();
  await db.insert(users).values({ email: "outro@x.com", name: "Outro", role: "student", passwordHash: "x", loginToken: "t2" });
});

test("perfil respeita permissões e e-mail duplicado", async () => {
  const s = withProfile({ canEditNameAndDocument: false });
  expect(await updateProfile(db, aluno, { name: "Outro", document: "999", phone: "11999999999" }, s)).toEqual({ ok: true });
  let u = await reload();
  expect(u.name).toBe("Aluno");
  expect(u.document).toBe("111");
  expect(u.phone).toBe("11999999999");

  // e-mail não editável por padrão: ignorado
  await updateProfile(db, aluno, { email: "novo@x.com" }, DEFAULT_SETTINGS);
  expect((await reload()).email).toBe("aluno@x.com");

  const canEmail = withProfile({ canEditEmail: true });
  const r = await updateProfile(db, aluno, { email: "Outro@X.com" }, canEmail);
  expect(r).toEqual({ ok: false, error: "Este e-mail já está em uso." });

  // o próprio e-mail (com caixa diferente) é permitido
  expect(await updateProfile(db, aluno, { email: " ALUNO@x.com " }, canEmail)).toEqual({ ok: true });
  expect(await updateProfile(db, aluno, { email: " Novo@X.com " }, canEmail)).toEqual({ ok: true });
  u = await reload();
  expect(u.email).toBe("novo@x.com");
});

test("nome vazio não é salvo e endereço é gravado", async () => {
  const address = { cep: "01000", street: "Rua A", number: "1", complement: "", reference: "", district: "Centro", city: "SP", state: "SP" };
  expect(await updateProfile(db, aluno, { name: "   ", address }, DEFAULT_SETTINGS)).toEqual({ ok: true });
  const u = await reload();
  expect(u.name).toBe("Aluno");
  expect(u.address).toEqual(address);
  await updateProfile(db, aluno, { name: "  Novo Nome ", document: null }, DEFAULT_SETTINGS);
  const u2 = await reload();
  expect(u2.name).toBe("Novo Nome");
  expect(u2.document).toBeNull();
});

test("troca de senha usa a política e encerra as outras sessões", async () => {
  const atual = await createSession(db, aluno.id, { remember: true });
  const outra = await createSession(db, aluno.id, { remember: true });
  const opts = { policy: DEFAULT_PASSWORD_POLICY, keepSessionToken: atual.token };
  expect(await changePassword(db, aluno, "errada", "novasenha", opts)).toEqual({ ok: false, error: "Senha atual incorreta." });
  expect(await changePassword(db, aluno, "segredo1", "123", opts)).toEqual({
    ok: false, error: "A senha precisa ter pelo menos 6 caracteres.",
  });
  const forte = { strong: true, ...STRONG_CRITERIA };
  expect((await changePassword(db, aluno, "segredo1", "novasenha", { ...opts, policy: forte })).ok).toBe(false);
  expect(await getSessionUser(db, outra.token)).not.toBeNull();
  expect(await changePassword(db, aluno, "segredo1", "novasenha", opts)).toEqual({ ok: true });
  expect(await loginWithPassword(db, "novo@x.com", "novasenha")).not.toBeNull();
  expect(await loginWithPassword(db, "novo@x.com", "segredo1")).toBeNull();
  expect(await getSessionUser(db, atual.token)).not.toBeNull();
  expect(await getSessionUser(db, outra.token)).toBeNull();
});

test("troca de senha no perfil: token do aluno fica; o do admin é trocado", async () => {
  const opts = { policy: DEFAULT_PASSWORD_POLICY };
  const [a] = await db.insert(users).values({ email: "p-aluno@x.com", name: "A", role: "student",
    passwordHash: await hashPassword("senhaA1"), loginToken: "tok-pa" }).returning();
  expect(await changePassword(db, a, "senhaA1", "senhaA2", opts)).toEqual({ ok: true });
  expect((await db.select().from(users).where(eq(users.id, a.id)))[0].loginToken).toBe("tok-pa");
  const [ad] = await db.insert(users).values({ email: "p-adm@x.com", name: "D", role: "admin", adminRole: "root",
    passwordHash: await hashPassword("senhaD1"), loginToken: "tok-pd" }).returning();
  expect(await changePassword(db, ad, "senhaD1", "senhaD2", opts)).toEqual({ ok: true });
  expect((await db.select().from(users).where(eq(users.id, ad.id)))[0].loginToken).not.toBe("tok-pd");
});
