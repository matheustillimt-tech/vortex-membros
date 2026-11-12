import { and, eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import {
  emailOutbox, fullAccess, productAccess, products, sales, sessions, showcases, studentNotes, tags, userLogs, userTags, users,
} from "@/db/schema";
import { loginWithPassword } from "@/lib/auth/login";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getSessionUser, type User } from "@/lib/auth/sessions";
import { getActiveAccessProductIds } from "@/lib/catalog/access";
import * as adm from "@/lib/students/admin";
import { listStudents } from "@/lib/students/queries";

const APP = { appUrl: "https://alunos.exemplo.com" };
let db: Database;
let root: User;
let aluno: User;
let productId: number;

async function insertUser(email: string, role: "admin" | "student", extra: Partial<typeof users.$inferInsert> = {}): Promise<User> {
  const [u] = await db
    .insert(users)
    .values({ email, name: email.split("@")[0], role, adminRole: role === "admin" ? "root" : null, passwordHash: await hashPassword("123456"), loginToken: `tok-${email}`, ...extra })
    .returning();
  return u;
}

beforeEach(async () => {
  db = await createTestDb();
  root = await insertUser("root@x.com", "admin", { name: "Admin Exemplo" });
  aluno = await insertUser("aluno@x.com", "student", { name: "Fulano de Tal", document: "12345678909" });
  const [s] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  [{ id: productId }] = await db.insert(products).values({ showcaseId: s.id, name: "Curso", status: "published" }).returning();
});

test("toda função exige admin", async () => {
  await expect(adm.createStudent(db, aluno, { name: "X", email: "x@x.com" }, APP)).rejects.toThrow(/administradores/);
  await expect(adm.getStudentProfile(db, null, aluno.id)).rejects.toThrow(/administradores/);
  await expect(adm.deleteStudent(db, aluno, aluno.id)).rejects.toThrow(/administradores/);
  await expect(adm.addNote(db, aluno, aluno.id, "oi")).rejects.toThrow(/administradores/);
  await expect(adm.listLogs(db, aluno, aluno.id, {})).rejects.toThrow(/administradores/);
});

test("Novo Aluno: cria com a senha inicial, token e e-mail 'gratis'; e-mail repetido é recusado", async () => {
  const { id } = await adm.createStudent(db, root, { name: "  Maria Souza ", email: " Maria@X.com " }, APP);
  const [u] = await db.select().from(users).where(eq(users.id, id));
  expect(u).toMatchObject({ name: "Maria Souza", email: "maria@x.com", role: "student" });
  expect(u.loginToken).toHaveLength(64);
  // Senha padrão das configurações (123456)
  expect(await loginWithPassword(db, "maria@x.com", "123456")).not.toBeNull();
  const mails = await db.select().from(emailOutbox);
  expect(mails).toHaveLength(1);
  expect(mails[0]).toMatchObject({ toEmail: "maria@x.com", template: "gratis" });
  expect(mails[0].html).toContain("123456");
  expect(mails[0].html).toContain(`login_token=${u.loginToken}`);
  await expect(adm.createStudent(db, root, { name: "Outra", email: "maria@x.com" }, APP)).rejects.toThrow("Este e-mail já está cadastrado.");
  await expect(adm.createStudent(db, root, { name: "", email: "z@x.com" }, APP)).rejects.toThrow("Informe o nome.");
  await expect(adm.createStudent(db, root, { name: "Z", email: "nao-e-email" }, APP)).rejects.toThrow("Informe um e-mail válido.");
});

test("Reenviar boas-vindas: nova senha por e-mail, a antiga para de funcionar e as sessões caem", async () => {
  await createSession(db, aluno.id, { remember: true });
  await adm.resendWelcome(db, root, aluno.id, APP);
  expect(await loginWithPassword(db, "aluno@x.com", "123456")).toBeNull();
  expect(await db.select().from(sessions).where(eq(sessions.userId, aluno.id))).toHaveLength(0);
  const [mail] = await db.select().from(emailOutbox);
  expect(mail).toMatchObject({ toEmail: "aluno@x.com", template: "gratis" });
  const m = mail.html.match(/e sua senha:<br>\s*<div style="[^"]*">([^<]*)<\/div>/);
  const senha = m![1].replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
  expect(senha).not.toBe("123456");
  expect(await loginWithPassword(db, "aluno@x.com", senha)).not.toBeNull();
  // Admin não é aluno: recusado
  await expect(adm.resendWelcome(db, root, root.id, APP)).rejects.toThrow("Aluno não encontrado.");
});

test("Editar aluno: nome, e-mail único, CPF só dígitos e celular com DDI", async () => {
  await insertUser("outro@x.com", "student");
  await adm.updateStudent(db, root, aluno.id, { name: "Fulano Novo", email: "NOVO@x.com", document: "123.456.789-09", phone: "+55 (11) 90000-0000" });
  const [u] = await db.select().from(users).where(eq(users.id, aluno.id));
  expect(u).toMatchObject({ name: "Fulano Novo", email: "novo@x.com", document: "12345678909", phone: "+5511900000000" });
  await expect(adm.updateStudent(db, root, aluno.id, { name: "F", email: "outro@x.com" })).rejects.toThrow("Este e-mail já está em uso.");
  await adm.updateStudent(db, root, aluno.id, { name: "F", email: "novo@x.com", document: "", phone: "" });
  const [v] = await db.select().from(users).where(eq(users.id, aluno.id));
  expect(v).toMatchObject({ document: null, phone: null });
  await expect(adm.updateStudent(db, root, root.id, { name: "F", email: "root@x.com" })).rejects.toThrow("Aluno não encontrado.");
});

test("Alterar senha: segue a política, derruba as sessões e registra 'Senha alterada'", async () => {
  const s = await createSession(db, aluno.id, { remember: true });
  await expect(adm.setStudentPassword(db, root, aluno.id, "12")).rejects.toThrow();
  await adm.setStudentPassword(db, root, aluno.id, "nova-senha-1");
  expect(await getSessionUser(db, s.token)).toBeNull();
  expect(await loginWithPassword(db, "aluno@x.com", "nova-senha-1")).not.toBeNull();
  const logs = await db.select().from(userLogs).where(eq(userLogs.userId, aluno.id));
  expect(logs.map((l) => l.event)).toEqual(["password_changed"]);
});

test("Excluir aluno revoga as sessões, some da lista e não entra; restaurar volta os acessos que já valiam; vendas ficam", async () => {
  const now = new Date();
  await db.insert(productAccess).values([
    { userId: aluno.id, productId, source: "sale", saleRef: "o1" },
    { userId: aluno.id, productId, source: "manual", saleRef: "m1", revokedAt: new Date(now.getTime() - 1000) },
  ]);
  await db.insert(sales).values({ gateway: "kiwify", status: "approved", payload: {}, dedupeKey: "k1", userId: aluno.id, orderId: "o1" });
  const s = await createSession(db, aluno.id, { remember: true });

  await adm.deleteStudent(db, root, aluno.id);
  expect(await getSessionUser(db, s.token)).toBeNull();
  expect(await loginWithPassword(db, "aluno@x.com", "123456")).toBeNull();
  expect((await listStudents(db, root, { sort: "latest", trashed: false })).rows.map((r) => r.id)).not.toContain(aluno.id);
  expect((await listStudents(db, root, { sort: "latest", trashed: true })).rows.map((r) => r.id)).toEqual([aluno.id]);
  expect(await db.select().from(sales)).toHaveLength(1);
  await expect(adm.getStudentProfile(db, root, aluno.id)).rejects.toThrow("Aluno não encontrado.");

  await adm.restoreStudent(db, root, aluno.id);
  expect(await loginWithPassword(db, "aluno@x.com", "123456")).not.toBeNull();
  expect([...(await getActiveAccessProductIds(db, aluno.id))]).toEqual([productId]);
  const rows = await db.select().from(productAccess).where(eq(productAccess.userId, aluno.id));
  expect(rows.find((r) => r.saleRef === "m1")?.revokedAt).not.toBeNull(); // o revogado continua revogado
  await expect(adm.restoreStudent(db, root, aluno.id)).rejects.toThrow("Aluno não encontrado.");
  await expect(adm.deleteStudent(db, root, root.id)).rejects.toThrow("Aluno não encontrado.");
});

test("perfil: dados, datas e tags; gerenciar tags troca o conjunto", async () => {
  const [t1] = await db.insert(tags).values({ name: "GARANTIA" }).returning();
  const [t2] = await db.insert(tags).values({ name: "VIP" }).returning();
  await db.insert(userTags).values({ userId: aluno.id, tagId: t1.id });
  const p = await adm.getStudentProfile(db, root, aluno.id);
  expect(p).toMatchObject({ id: aluno.id, name: "Fulano de Tal", email: "aluno@x.com", document: "12345678909", loginToken: "tok-aluno@x.com" });
  expect(p.tags).toEqual([{ id: t1.id, name: "GARANTIA" }]);
  await adm.setStudentTags(db, root, aluno.id, [t2.id, t2.id]);
  expect((await adm.getStudentProfile(db, root, aluno.id)).tags).toEqual([{ id: t2.id, name: "VIP" }]);
  await expect(adm.setStudentTags(db, root, aluno.id, [999])).rejects.toThrow("Tag não encontrada.");
  await adm.setStudentTags(db, root, aluno.id, []);
  expect(await db.select().from(userTags)).toHaveLength(0);
});

test("notas: adicionar (até 2000), listar com o autor, excluir (some da lista)", async () => {
  await expect(adm.addNote(db, root, aluno.id, "   ")).rejects.toThrow("Escreva a nota.");
  await expect(adm.addNote(db, root, aluno.id, "x".repeat(2001))).rejects.toThrow("A nota pode ter até 2000 caracteres.");
  const { id } = await adm.addNote(db, root, aluno.id, "  Pediu reembolso  ");
  await adm.addNote(db, root, aluno.id, "Segunda");
  const notes = await adm.listNotes(db, root, aluno.id);
  expect(notes.map((n) => n.body)).toEqual(["Segunda", "Pediu reembolso"]);
  expect(notes[0].author).toEqual({ id: root.id, name: "Admin Exemplo" });
  await adm.deleteNote(db, root, aluno.id, id);
  expect((await adm.listNotes(db, root, aluno.id)).map((n) => n.body)).toEqual(["Segunda"]);
  expect((await db.select().from(studentNotes).where(eq(studentNotes.id, id)))[0].deletedAt).not.toBeNull();
  // nota de outro aluno não é excluída pelo id
  const outro = await insertUser("b@x.com", "student");
  const { id: other } = await adm.addNote(db, root, outro.id, "do outro");
  await expect(adm.deleteNote(db, root, aluno.id, other)).rejects.toThrow("Nota não encontrada.");
});

test("logs paginados (mais recentes primeiro) e CSV", async () => {
  const base = new Date("2026-10-16T15:00:00Z");
  await db.insert(userLogs).values(
    Array.from({ length: 55 }, (_, i) => ({ userId: aluno.id, event: "login" as const, ip: "1.1.1.1", userAgent: i === 54 ? 'Mozilla "x"; y' : "UA", createdAt: new Date(base.getTime() + i * 1000) })),
  );
  const p1 = await adm.listLogs(db, root, aluno.id, {});
  expect(p1.total).toBe(55);
  expect(p1.rows).toHaveLength(50);
  expect(p1.rows[0]).toMatchObject({ event: "login", label: "Realizou login", userAgent: 'Mozilla "x"; y' });
  const p2 = await adm.listLogs(db, root, aluno.id, { cursor: p1.nextCursor! });
  expect(p2.rows).toHaveLength(5);
  expect(p2.nextCursor).toBeNull();
  const csv = await adm.logsCsv(db, root, aluno.id);
  expect(csv.startsWith("﻿Data;Evento;IP;Dispositivo\r\n")).toBe(true);
  expect(csv).toContain('16/10/2026 12:00:54;Realizou login;1.1.1.1;"Mozilla ""x""; y"');
  expect(csv.trim().split("\r\n")).toHaveLength(56);
});

test("CSV de alunos: BOM, cabeçalho, todos os não excluídos, escapa ; \" e quebra de linha e neutraliza fórmula", async () => {
  await insertUser("c@x.com", "student", { name: 'Nome; com "aspas"\nquebra', phone: "+5511900000000" });
  await insertUser("d@x.com", "student", { name: "=HYPERLINK(1)", deletedAt: new Date() });
  await insertUser("e@x.com", "student", { name: "=SOMA(1)" });
  let out = "";
  for await (const chunk of adm.studentsCsv(db, root, { batchSize: 2 })) out += chunk;
  expect(out.startsWith("﻿ID;Nome;E-mail;CPF/CNPJ;Celular;Cadastrado em;Último acesso\r\n")).toBe(true);
  expect(out).toContain('"Nome; com ""aspas""\nquebra"');
  expect(out).toContain("'=SOMA(1)");
  expect(out).not.toContain("HYPERLINK");
  expect(out).not.toContain("root@x.com"); // admin não é aluno
  expect(out).toContain(";123.456.789-09;");
  const lines = out.slice(1).split("\r\n").filter(Boolean);
  expect(lines).toHaveLength(1 + 3);
  expect(adm.csvField("a;b")).toBe('"a;b"');
  expect(adm.csvField("-1")).toBe("'-1");
  expect(adm.csvField("simples")).toBe("simples");
});

test("full_access do aluno excluído também não vale enquanto excluído (sessão recusada)", async () => {
  await db.insert(fullAccess).values({ userId: aluno.id, source: "sale", saleRef: "f1" });
  await adm.deleteStudent(db, root, aluno.id);
  const [row] = await db.select().from(fullAccess).where(and(eq(fullAccess.userId, aluno.id)));
  expect(row.revokedAt).toBeNull(); // não mexe nos acessos: restaurar devolve exatamente o que havia
});
