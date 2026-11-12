import { expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import { productAccess, products, showcases, users } from "@/db/schema";
import { buildOfferUrl } from "@/lib/catalog/offer";
import { hasActiveAccess } from "@/lib/catalog/access";

test("acesso vitalício, expirado, revogado, futuro e produto gratuito", async () => {
  const db = await createTestDb();
  const now = new Date("2026-10-14T12:00:00Z");
  const [aluno] = await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t1" }).returning();
  const [admin] = await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t2" }).returning();
  const [sc] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  const base = { showcaseId: sc.id, name: "P", status: "published" as const };
  await db.insert(products).values([
    { ...base, id: 1 }, { ...base, id: 2 }, { ...base, id: 3 }, { ...base, id: 4 }, { ...base, id: 5, isFree: true },
  ]);
  const a = { userId: aluno.id, source: "manual" as const };
  await db.insert(productAccess).values([
    { ...a, productId: 1, startsAt: new Date("2026-01-01Z"), expiresAt: null },
    { ...a, productId: 2, startsAt: new Date("2026-01-01Z"), expiresAt: new Date("2026-10-01Z") },
    { ...a, productId: 3, startsAt: new Date("2026-01-01Z"), revokedAt: new Date("2026-09-01Z") },
    { ...a, productId: 4, startsAt: new Date("2026-11-01Z") },
  ]);
  expect(await hasActiveAccess(db, aluno, 1, now)).toBe(true);
  expect(await hasActiveAccess(db, aluno, 2, now)).toBe(false);
  expect(await hasActiveAccess(db, aluno, 3, now)).toBe(false);
  expect(await hasActiveAccess(db, aluno, 4, now)).toBe(false);
  expect(await hasActiveAccess(db, aluno, 5, now)).toBe(true);
  expect(await hasActiveAccess(db, admin, 2, now)).toBe(true);
});

test("buildOfferUrl", () => {
  expect(buildOfferUrl("https://pay.kiwify.com.br/abc", "a+b@x.com")).toBe("https://pay.kiwify.com.br/abc?email=a%2Bb%40x.com");
  expect(buildOfferUrl("https://pay.kiwify.com.br/abc?x=1", "a@x.com")).toBe("https://pay.kiwify.com.br/abc?x=1&email=a%40x.com");
  expect(buildOfferUrl(null, "a@x.com")).toBeNull();
});
