import { expect, test } from "vitest";
import { hexToHsv, hsvToHex, normalizeHex } from "@/components/dashboard/color";
import { submittedColor } from "@/components/dashboard/color-picker";

test("normaliza hex digitado: #, 3 dígitos, caixa e espaços", () => {
  expect(normalizeHex("#e91e63")).toBe("#E91E63");
  expect(normalizeHex("e91e63")).toBe("#E91E63");
  expect(normalizeHex(" #abc ")).toBe("#AABBCC");
  expect(normalizeHex("")).toBe("");
  expect(normalizeHex("#12")).toBeNull();
  expect(normalizeHex("#GGGGGG")).toBeNull();
});

test("valor enviado: hex normalizado quando válido, senão o texto (servidor recusa)", () => {
  expect(submittedColor("#abc")).toBe("#AABBCC");
  expect(submittedColor("")).toBe("");
  expect(submittedColor("#12")).toBe("#12");
});

test("hex ⇄ HSV ida e volta", () => {
  for (const hex of ["#E91E63", "#FF7500", "#000000", "#FFFFFF", "#2563EB", "#1F2937"]) {
    expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  }
  expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#FF0000");
  expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00FF00");
  expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#FF0000");
  const { h, s, v } = hexToHsv("#0000FF");
  expect([Math.round(h), s, v]).toEqual([240, 1, 1]);
});
