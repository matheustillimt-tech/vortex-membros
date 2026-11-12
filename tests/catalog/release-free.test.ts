import { eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { lessons, modules, productFirstVisits, products, showcases, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as sch from "@/lib/admin/schedules";

const spy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/catalog/release", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/catalog/release")>();
  return {
    ...real,
    lockedLessonsOfProduct: (...args: Parameters<typeof real.lockedLessonsOfProduct>) => {
      spy.calls++;
      return real.lockedLessonsOfProduct(...args);
    },
  };
});

import { getLessonPage, getProductPage } from "@/lib/catalog/queries";
import { releaseDateFor, spDay, spMidnight } from "@/lib/catalog/release";

const DAY = 86_400_000;
let db: Database;
let admin: User;
let aluno: User;
let ids: { p: number; m: number; l: number; l0: number; schedule: number };

beforeEach(async () => {
  db = await createTestDb();
  spy.calls = 0;
  [admin] = (await db.insert(users).values({ email: "adm@x.com", name: "Adm", role: "admin", passwordHash: "x", loginToken: "t1" }).returning()) as User[];
  // Aluno cadastrado há um ano: os dias NÃO contam do cadastro.
  [aluno] = (await db
    .insert(users)
    .values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t2", createdAt: new Date(Date.now() - 365 * DAY) })
    .returning()) as User[];
  const [sc] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  const [p] = await db.insert(products).values({ showcaseId: sc.id, name: "Grátis", status: "published", isFree: true }).returning();
  const [m] = await db.insert(modules).values({ productId: p.id, title: "M", status: "published" }).returning();
  const [l] = await db.insert(lessons).values({ moduleId: m.id, title: "L", status: "published", position: 1 }).returning();
  const [l0] = await db.insert(lessons).values({ moduleId: m.id, title: "L0", status: "published", position: 0 }).returning();
  const s = await sch.createSchedule(db, admin, { name: "T", productId: p.id });
  await sch.setRule(db, admin, { scheduleId: s.id, targetType: "lesson", targetId: l.id, rule: { mode: "days_after_access", days: 3 } });
  await sch.setRule(db, admin, { scheduleId: s.id, targetType: "lesson", targetId: l0.id, rule: { mode: "days_after_access", days: 0 } });
  ids = { p: p.id, m: m.id, l: l.id, l0: l0.id, schedule: s.id };
});

const visits = () => db.select().from(productFirstVisits).where(eq(productFirstVisits.userId, aluno.id));

test("grátis sem acesso e sem visita: conta de agora (dia 0 libera, dia 3 não); nunca do cadastro", async () => {
  const now = new Date();
  expect(await releaseDateFor(db, aluno, ids.l0, now)).toBeNull();
  expect(await releaseDateFor(db, aluno, ids.l, now)).toEqual(spMidnight(spDay(now), 3));
});

test("primeira visita ao produto grátis é gravada uma vez e é a base dos dias", async () => {
  await getProductPage(db, aluno, ids.p);
  const [first] = await visits();
  expect(first).toBeTruthy();
  await getLessonPage(db, aluno, ids.l0);
  await getProductPage(db, aluno, ids.p);
  expect(await visits()).toEqual([first]); // idempotente

  // visita de 5 dias atrás → regra de 3 dias já liberou
  await db.update(productFirstVisits).set({ firstAt: new Date(Date.now() - 5 * DAY) });
  expect(await releaseDateFor(db, aluno, ids.l)).toBeNull();
  expect((await getLessonPage(db, aluno, ids.l)).status).toBe("ok");
  // visita de 1 dia atrás → ainda bloqueada
  await db.update(productFirstVisits).set({ firstAt: new Date(Date.now() - 1 * DAY) });
  expect((await getLessonPage(db, aluno, ids.l)).status).toBe("scheduled");
});

test("abrir a aula registra a visita; admin não registra", async () => {
  await getLessonPage(db, admin, ids.l);
  await getProductPage(db, admin, ids.p);
  expect(await db.select().from(productFirstVisits)).toHaveLength(0);
  expect((await getLessonPage(db, aluno, ids.l)).status).toBe("scheduled");
  expect(await visits()).toHaveLength(1);
});

test("abrir uma aula calcula a liberação uma vez só (sem consultas extras por aula liberada)", async () => {
  await getLessonPage(db, aluno, ids.l0);
  expect(spy.calls).toBe(1);
  spy.calls = 0;
  await getLessonPage(db, aluno, ids.l);
  expect(spy.calls).toBe(1);
});

test("produto grátis sem regra de dias, ou com termo pendente: nenhuma escrita de primeira visita", async () => {
  // Termo pendente: a aula não carrega a liberação (nem grava a visita) antes do aceite.
  await db.update(products).set({ termsEnabled: true, termsHtml: "<p>Termo</p>" }).where(eq(products.id, ids.p));
  expect((await getLessonPage(db, aluno, ids.l)).status).toBe("terms");
  expect((await getProductPage(db, aluno, ids.p))?.needsTerms).toBe(true);
  expect(await visits()).toHaveLength(0);
  // Sem regra de dias (só data fixa): nada a gravar.
  await db.update(products).set({ termsEnabled: false }).where(eq(products.id, ids.p));
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "lesson", targetId: ids.l, rule: { mode: "fixed_date", date: "2020-01-01" } });
  await sch.setRule(db, admin, { scheduleId: ids.schedule, targetType: "lesson", targetId: ids.l0, rule: { mode: "fixed_date", date: "2020-01-01" } });
  expect((await getLessonPage(db, aluno, ids.l)).status).toBe("ok");
  await getProductPage(db, aluno, ids.p);
  expect(await visits()).toHaveLength(0);
});
