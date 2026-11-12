import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { userLogs, users } from "@/db/schema";
import { createSession, type User } from "@/lib/auth/sessions";
import { GET as exportStudents } from "@/app/dashboard/students/export/route";
import { GET as exportLogs } from "@/app/dashboard/student/[id]/logs/export/route";

let db: Database;
let root: User;
let aluno: User;

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  [root] = await db.insert(users).values({ email: "root@x.com", name: "Root", role: "admin", adminRole: "root", passwordHash: "x", loginToken: "tr" }).returning();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "Aluno", role: "student", passwordHash: "x", loginToken: "ta" }).returning();
});
afterEach(() => setDbForTests(null));

const tokenOf = async (u: User) => (await createSession(db, u.id, { remember: false })).token;
const req = (path: string, token: string) => new NextRequest(`http://x${path}`, { headers: { cookie: `am_session=${token}` } });

test("exportar alunos: só admin; CSV UTF-8 com BOM, em streaming", async () => {
  expect((await exportStudents(req("/dashboard/students/export", await tokenOf(aluno)))).status).toBe(403);
  const ok = await exportStudents(req("/dashboard/students/export", await tokenOf(root)));
  expect(ok.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(ok.headers.get("content-disposition")).toMatch(/^attachment; filename="alunos-\d{4}-\d{2}-\d{2}\.csv"$/);
  const body = new Uint8Array(await ok.arrayBuffer());
  expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = new TextDecoder().decode(body);
  expect(text).toContain(`${aluno.id};Aluno;a@x.com`);
  expect(text).not.toContain("root@x.com");
});

test("exportar logs do aluno: só admin", async () => {
  await db.insert(userLogs).values({ userId: aluno.id, event: "login", ip: "1.1.1.1", userAgent: "UA" });
  const params = { params: Promise.resolve({ id: String(aluno.id) }) };
  expect((await exportLogs(req(`/dashboard/student/${aluno.id}/logs/export`, await tokenOf(aluno)), params)).status).toBe(403);
  const ok = await exportLogs(req(`/dashboard/student/${aluno.id}/logs/export`, await tokenOf(root)), params);
  const text = await ok.text();
  expect(text).toContain("Data;Evento;IP;Dispositivo");
  expect(text).toContain("Realizou login;1.1.1.1;UA");
});
