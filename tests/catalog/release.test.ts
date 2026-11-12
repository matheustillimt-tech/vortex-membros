import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { lessonProgress, lessons, modules, productAccess, products, showcases, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as sch from "@/lib/admin/schedules";
import { getLessonPage, getProductPage } from "@/lib/catalog/queries";
import { formatReleaseDate, releaseDateFor, spMidnight } from "@/lib/catalog/release";
import { toggleLessonCompleted } from "@/lib/lesson-interactions";

let db: Database;
let admin: User;
let aluno: User;
let ids: { p: number; m1: number; m2: number; l1: number; l2: number; l3: number; schedule: number };

const DAY = 86_400_000;

beforeEach(async () => {
  db = await createTestDb();
  [admin] = (await db.insert(users).values({ email: "adm@x.com", name: "Adm", role: "admin", passwordHash: "x", loginToken: "t1" }).returning()) as User[];
  [aluno] = (await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t2" }).returning()) as User[];
  const [sc] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  const [p] = await db.insert(products).values({ showcaseId: sc.id, name: "Curso", status: "published" }).returning();
  const [m1] = await db.insert(modules).values({ productId: p.id, title: "M1", status: "published", position: 0 }).returning();
  const [m2] = await db.insert(modules).values({ productId: p.id, title: "M2", status: "published", position: 1 }).returning();
  const [l1] = await db.insert(lessons).values({ moduleId: m1.id, title: "L1", status: "published", position: 0, videoUrl: "https://youtu.be/x", contentHtml: "<p>segredo</p>" }).returning();
  const [l2] = await db.insert(lessons).values({ moduleId: m1.id, title: "L2", status: "published", position: 1 }).returning();
  const [l3] = await db.insert(lessons).values({ moduleId: m2.id, title: "L3", status: "published", position: 0 }).returning();
  const s = await sch.createSchedule(db, admin, { name: "Turma", productId: p.id });
  ids = { p: p.id, m1: m1.id, m2: m2.id, l1: l1.id, l2: l2.id, l3: l3.id, schedule: s.id };
});

async function giveAccess(startsAt: Date) {
  await db.insert(productAccess).values({ userId: aluno.id, productId: ids.p, source: "manual", startsAt });
}

test("produto sem programação (ou programação sem regra) → liberado", async () => {
  await giveAccess(new Date());
  expect(await releaseDateFor(db, aluno, ids.l1)).toBeNull();
  await sch.trashSchedule(db, admin, ids.schedule);
  await expect(sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "lesson", targetId: ids.l1, rule: { mode: "days_after_access", days: 3 } })).rejects.toThrow(
    "Não encontrado.",
  );
  expect(await releaseDateFor(db, aluno, ids.l1)).toBeNull();
});

test("Review Focus 5: 7 dias após o acesso, aluno com acesso há 3 dias → bloqueada com data; link direto sem conteúdo; marcar recusado", async () => {
  const now = new Date();
  await giveAccess(new Date(now.getTime() - 3 * DAY));
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "module", targetId: ids.m1, rule: { mode: "days_after_access", days: 7 } });

  const at = await releaseDateFor(db, aluno, ids.l1, now);
  expect(at).not.toBeNull();
  const expected = spMidnight(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(now.getTime() - 3 * DAY)), 7)!;
  expect(at!.getTime()).toBe(expected.getTime());

  const page = await getLessonPage(db, aluno, ids.l1);
  expect(page.status).toBe("scheduled");
  expect(JSON.stringify(page)).not.toMatch(/segredo|youtu/);
  expect(page).toEqual({ status: "scheduled", productId: ids.p, releaseAt: expected });

  const listing = await getProductPage(db, aluno, ids.p);
  const flat = listing!.modules.flatMap((m) => m.lessons);
  expect(flat.find((l) => l.id === ids.l1)!.lockedUntil).toEqual(expected);
  expect(flat.find((l) => l.id === ids.l3)!.lockedUntil).toBeNull(); // M2 sem regra

  expect(await toggleLessonCompleted(db, aluno, ids.l1, true)).toBe(false);
  expect(await db.select().from(lessonProgress)).toHaveLength(0);
  expect(await toggleLessonCompleted(db, aluno, ids.l3, true)).toBe(true);
});

test("days_after_access usa o startsAt do acesso: passado o prazo, libera", async () => {
  await giveAccess(new Date(Date.now() - 10 * DAY));
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "module", targetId: ids.m1, rule: { mode: "days_after_access", days: 7 } });
  expect(await releaseDateFor(db, aluno, ids.l1)).toBeNull();
  expect((await getLessonPage(db, aluno, ids.l1)).status).toBe("ok");
});

test("regra da aula vence a do módulo (nos dois sentidos)", async () => {
  await giveAccess(new Date());
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "module", targetId: ids.m1, rule: { mode: "days_after_access", days: 30 } });
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "lesson", targetId: ids.l1, rule: { mode: "days_after_access", days: 0 } });
  expect(await releaseDateFor(db, aluno, ids.l1)).toBeNull(); // aula: libera no dia do acesso
  expect(await releaseDateFor(db, aluno, ids.l2)).not.toBeNull(); // segue o módulo

  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "module", targetId: ids.m2, rule: { mode: "days_after_access", days: 0 } });
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "lesson", targetId: ids.l3, rule: { mode: "fixed_date", date: "2099-01-01" } });
  expect(await releaseDateFor(db, aluno, ids.l3)).toEqual(spMidnight("2099-01-01"));

  await sch.clearRule(db, admin, { scheduleId: ids.schedule, targetType: "lesson", targetId: ids.l3 });
  expect(await releaseDateFor(db, aluno, ids.l3)).toBeNull();
});

test("data fixa e fronteira de fuso: abre à 00:00 de São Paulo (03:00 UTC)", async () => {
  await giveAccess(new Date("2026-01-01T12:00:00Z"));
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "lesson", targetId: ids.l1, rule: { mode: "fixed_date", date: "2026-10-20" } });
  const before = new Date("2026-10-20T02:59:59Z"); // 19/10 23:59:59 em São Paulo
  const after = new Date("2026-10-20T03:00:00Z");
  expect(await releaseDateFor(db, aluno, ids.l1, before)).toEqual(new Date("2026-10-20T03:00:00Z"));
  expect(await releaseDateFor(db, aluno, ids.l1, after)).toBeNull();
  expect(formatReleaseDate(new Date("2026-10-20T03:00:00Z"))).toBe("20/10/2026");
});

test("dias contam pelo dia do acesso em São Paulo (acesso às 23h30 de SP = 02h30 UTC do dia seguinte)", async () => {
  await giveAccess(new Date("2026-10-11T02:30:00Z")); // 10/10 23:30 em SP
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "module", targetId: ids.m1, rule: { mode: "days_after_access", days: 1 } });
  const at = await releaseDateFor(db, aluno, ids.l1, new Date("2026-10-11T02:31:00Z"));
  expect(at).toEqual(new Date("2026-10-11T03:00:00Z")); // 11/10 00:00 em SP
  expect(formatReleaseDate(at!)).toBe("11/10/2026");
});

test("admin sempre liberado; programação excluída é ignorada; restaurar volta a valer", async () => {
  await giveAccess(new Date());
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "module", targetId: ids.m1, rule: { mode: "fixed_date", date: "2099-01-01" } });
  expect(await releaseDateFor(db, admin, ids.l1)).toBeNull();
  expect((await getLessonPage(db, admin, ids.l1)).status).toBe("ok");
  expect(await releaseDateFor(db, aluno, ids.l1)).not.toBeNull();

  await sch.trashSchedule(db, admin, ids.schedule);
  expect(await releaseDateFor(db, aluno, ids.l1)).toBeNull();
  expect((await getLessonPage(db, aluno, ids.l1)).status).toBe("ok");

  await sch.restoreSchedule(db, admin, ids.schedule);
  expect(await releaseDateFor(db, aluno, ids.l1)).not.toBeNull();
});

test("tirar o produto da programação apaga as regras dele", async () => {
  await giveAccess(new Date());
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "lesson", targetId: ids.l1, rule: { mode: "fixed_date", date: "2099-01-01" } });
  await sch.removeProductFromSchedule(db, admin, ids.schedule, ids.p);
  expect(await releaseDateFor(db, aluno, ids.l1)).toBeNull();
  await sch.addProductToSchedule(db, admin, ids.schedule, ids.p);
  expect(await releaseDateFor(db, aluno, ids.l1)).toBeNull();
  expect((await sch.getProductSchedule(db, admin, ids.p)).rules).toEqual({});
});
