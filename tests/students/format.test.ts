import { expect, test } from "vitest";
import {
  avatarColor, formatCents, formatDocument, formatLongDate, formatPhone, formatRelative, formatShortDateTime, initials,
  parseSaoPauloLocal, splitPhone, toSaoPauloLocal, whatsappUrl,
} from "@/lib/students/format";
import { COUNTRIES } from "@/lib/students/countries";

const now = new Date("2026-10-16T15:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const M = 60_000, H = 60 * M, D = 24 * H;

test("formatRelative", () => {
  expect(formatRelative(null, now)).toBe("Nunca acessou");
  // mesmo texto do restante do painel (administradores, entregas)
  expect(formatRelative(ago(0), now)).toBe("agora");
  expect(formatRelative(ago(30_000), now)).toBe("agora");
  expect(formatRelative(ago(1 * M), now)).toBe("há 1 minuto");
  expect(formatRelative(ago(5 * M), now)).toBe("há 5 minutos");
  expect(formatRelative(ago(1 * H), now)).toBe("há 1 hora");
  expect(formatRelative(ago(10 * H), now)).toBe("há 10 horas");
  expect(formatRelative(ago(1 * D), now)).toBe("há 1 dia");
  expect(formatRelative(ago(6 * D), now)).toBe("há 6 dias");
  expect(formatRelative(ago(7 * D), now)).toBe("há 1 semana");
  expect(formatRelative(ago(20 * D), now)).toBe("há 2 semanas");
  expect(formatRelative(ago(45 * D), now)).toBe("há 1 mês");
  expect(formatRelative(ago(100 * D), now)).toBe("há 3 meses");
  expect(formatRelative(ago(400 * D), now)).toBe("há 1 ano");
  expect(formatRelative(ago(800 * D), now)).toBe("há 2 anos");
  expect(formatRelative(new Date(now.getTime() + 5000), now)).toBe("agora");
});

test("formatLongDate em America/Sao_Paulo", () => {
  expect(formatLongDate(new Date("2026-10-16T15:59:00Z"))).toBe("Sexta-feira, 16 out 2026 às 12:59");
  expect(formatLongDate(new Date("2026-10-15T21:08:00Z"))).toBe("Quinta-feira, 15 out 2026 às 18:08");
  // 01:30 UTC de 1º de março ainda é 28 de fevereiro em São Paulo
  expect(formatLongDate(new Date("2026-03-01T01:30:00Z"))).toBe("Sábado, 28 fev 2026 às 22:30");
});

test("avatarColor segue o id (as 8 cores)", () => {
  expect(avatarColor(37467078)).toBe("bg-blue-100 text-blue-700");
  expect(avatarColor(37460588)).toBe("bg-amber-100 text-amber-700");
  expect(avatarColor(37459695)).toBe("bg-rose-100 text-rose-700");
  expect(avatarColor(37431602)).toBe("bg-pink-100 text-pink-700");
  expect(avatarColor(37430315)).toBe("bg-emerald-100 text-emerald-700");
  expect(avatarColor(37406848)).toBe("bg-violet-100 text-violet-700");
  expect(avatarColor(37289605)).toBe("bg-red-100 text-red-700");
  expect(avatarColor(37238169)).toBe("bg-cyan-100 text-cyan-700");
});

test("initials e formatDocument", () => {
  expect(initials("Fulano de Tal")).toBe("FT");
  expect(initials("  ana  ")).toBe("A");
  expect(initials("")).toBe("?");
  expect(formatDocument("12345678909")).toBe("123.456.789-09");
  expect(formatDocument("12.345.678/0001-95")).toBe("12.345.678/0001-95");
  expect(formatDocument("12345678000195")).toBe("12.345.678/0001-95");
  expect(formatDocument("123")).toBe("123");
  expect(formatDocument(null)).toBeNull();
});

const DIALS = COUNTRIES.map((c) => c[2]);

test("datas curtas, datetime-local de São Paulo e valor", () => {
  expect(formatShortDateTime(new Date("2026-10-15T21:04:31Z"))).toBe("18:04 15/10/26");
  expect(parseSaoPauloLocal("2026-12-31T23:59")).toEqual(new Date("2027-01-01T02:59:00Z"));
  expect(parseSaoPauloLocal("2026-02-30T10:00")).toBeNull();
  expect(parseSaoPauloLocal("lixo")).toBeNull();
  expect(toSaoPauloLocal(new Date("2027-01-01T02:59:00Z"))).toBe("2026-12-31T23:59");
  expect(formatCents(1114)).toBe("11,14");
  expect(formatCents(123456)).toBe("1.234,56");
});

test("celular: DDI, formato brasileiro e WhatsApp", () => {
  expect(splitPhone("+5511900000000", DIALS)).toEqual({ ddi: "55", number: "11900000000" });
  expect(splitPhone("+351912345678", DIALS)).toEqual({ ddi: "351", number: "912345678" });
  expect(splitPhone("11900000000", DIALS)).toEqual({ ddi: "55", number: "11900000000" });
  expect(splitPhone(null, DIALS)).toEqual({ ddi: "55", number: "" });
  expect(formatPhone("+5511900000000", DIALS)).toBe("(11) 90000-0000");
  expect(formatPhone("1133334444", DIALS)).toBe("(11) 3333-4444");
  expect(formatPhone("+351912345678", DIALS)).toBe("+351 912345678");
  expect(whatsappUrl("11900000000", DIALS)).toBe("https://wa.me/5511900000000");
  expect(whatsappUrl(null, DIALS)).toBeNull();
});
