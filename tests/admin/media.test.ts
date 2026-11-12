import { afterEach, expect, test, vi } from "vitest";

// "use cache"/cacheLife só existem dentro do Next (cacheComponents); aqui a rota roda direto.
vi.mock("next/cache", () => ({ cacheLife: () => {} }));
import { createTestDb } from "../helpers/db";
import { setDbForTests } from "@/db";
import type { User } from "@/lib/auth/sessions";
import { getMedia, saveMedia, sniffImageType, uploadLimitFor } from "@/lib/admin/media";
import { safeImageUrl } from "@/lib/theme";
import { GET } from "@/app/media/[id]/route";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = Uint8Array.from([...Buffer.from("RIFF"), 1, 0, 0, 0, ...Buffer.from("WEBP"), 9]);
const GIF = Uint8Array.from(Buffer.from("GIF89a\x01\x00"));
const SVG = Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
const HTML = Uint8Array.from(Buffer.from("<html><script>alert(1)</script></html>"));

afterEach(() => setDbForTests(null));

test("sniffImageType reconhece pela assinatura dos bytes", () => {
  expect(sniffImageType(JPG)).toBe("image/jpeg");
  expect(sniffImageType(PNG)).toBe("image/png");
  expect(sniffImageType(WEBP)).toBe("image/webp");
  expect(sniffImageType(GIF)).toBe("image/gif");
  expect(sniffImageType(SVG)).toBeNull();
  expect(sniffImageType(HTML)).toBeNull();
  expect(sniffImageType(new Uint8Array())).toBeNull();
});

test("saveMedia grava jpeg e png e devolve /media/<id>", async () => {
  const db = await createTestDb();
  const a = await saveMedia(db, admin, { bytes: JPG });
  const b = await saveMedia(db, admin, { bytes: PNG });
  expect(a.url).toBe(`/media/${a.id}`);
  expect(a.id).toBeGreaterThanOrEqual(900000000);
  expect(b.id).not.toBe(a.id);
  const m = await getMedia(db, a.id);
  expect(m?.mime).toBe("image/jpeg");
  expect(Array.from(m!.bytes)).toEqual(Array.from(JPG));
});

test("recusa SVG/HTML (mesmo que o nome fosse .jpg) pelo tipo real", async () => {
  const db = await createTestDb();
  for (const bytes of [SVG, HTML]) {
    await expect(saveMedia(db, admin, { bytes })).rejects.toThrow("Formato não suportado. Envie JPG, PNG, WebP ou GIF.");
  }
});

test("recusa arquivo acima do limite (2 MB padrão, configurável)", async () => {
  const db = await createTestDb();
  const big = new Uint8Array(2 * 1024 * 1024 + 1);
  big.set(PNG);
  await expect(saveMedia(db, admin, { bytes: big })).rejects.toThrow("Arquivo maior que 2 MB.");
  const ok = new Uint8Array(2 * 1024 * 1024 + 1);
  ok.set(PNG);
  await expect(saveMedia(db, admin, { bytes: ok, maxBytes: 3 * 1024 * 1024 })).resolves.toBeTruthy();
  await expect(saveMedia(db, admin, { bytes: ok, maxBytes: 600 * 1024 })).rejects.toThrow("Arquivo maior que 600 KB.");
});

test("mesmo arquivo duas vezes → mesmo id", async () => {
  const db = await createTestDb();
  const a = await saveMedia(db, admin, { bytes: PNG });
  const b = await saveMedia(db, admin, { bytes: Uint8Array.from(PNG) });
  expect(b.id).toBe(a.id);
});

test("não-admin é recusado e nada é gravado", async () => {
  const db = await createTestDb();
  await expect(saveMedia(db, student, { bytes: PNG })).rejects.toThrow("Acesso restrito a administradores.");
  await expect(saveMedia(db, null as unknown as User, { bytes: PNG })).rejects.toThrow("Acesso restrito a administradores.");
  const again = await saveMedia(db, admin, { bytes: PNG });
  expect(again.id).toBe(900000000);
});

test("rota devolve bytes, mime, cache imutável e nosniff", async () => {
  const db = await createTestDb();
  setDbForTests(db);
  const { id } = await saveMedia(db, admin, { bytes: PNG });
  const res = await GET(new Request(`http://x/media/${id}`), { params: Promise.resolve({ id: String(id) }) });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, s-maxage=31536000, immutable");
  // A CDN da Vercel só guarda resposta de função com s-maxage / CDN-Cache-Control.
  expect(res.headers.get("cdn-cache-control")).toBe("public, max-age=31536000, immutable");
  expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(PNG));
});

test("rota: 404 para id inexistente ou não numérico", async () => {
  setDbForTests(await createTestDb());
  for (const id of ["999", "abc", "1e3", "-1", "12abc", ""]) {
    const res = await GET(new Request("http://x/media/x"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(404);
  }
});

test("safeImageUrl aceita /media/<id>", () => {
  expect(safeImageUrl("/media/900000001")).toBe("/media/900000001");
});

test("uploadLimitFor: kind decide o limite no servidor (desconhecido vale image)", () => {
  expect(uploadLimitFor("image")).toBe(2 * 1024 * 1024);
  expect(uploadLimitFor("banner")).toBe(3 * 1024 * 1024);
  expect(uploadLimitFor("logo")).toBe(600 * 1024);
  expect(uploadLimitFor("icon")).toBe(300 * 1024);
  expect(uploadLimitFor("email")).toBe(200 * 1024);
  for (const k of [undefined, null, "", "x", 99999999, "BANNER"]) expect(uploadLimitFor(k)).toBe(2 * 1024 * 1024);
});
