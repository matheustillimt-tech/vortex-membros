import { expect, test } from "vitest";
import { matchesSearch, normalizeSearch, progressPercent, progressTitle } from "@/lib/cover-progress";

test("título do trilho no formato: N de M - X%", () => {
  expect(progressTitle(3, 6)).toBe("3 de 6 - 50%");
  expect(progressTitle(1, 3)).toBe("1 de 3 - 33%");
  expect(progressTitle(0, 0)).toBe("0 de 0 - 0%");
  expect(progressTitle(6, 6)).toBe("6 de 6 - 100%");
});

test("percentual limitado a 0–100 e zero sem aulas", () => {
  expect(progressPercent(2, 3)).toBe(67);
  expect(progressPercent(0, 0)).toBe(0);
  expect(progressPercent(5, 4)).toBe(100);
});

test("busca de capas ignora acentos, caixa e espaços extras", () => {
  expect(normalizeSearch("  Vídeos   com IA ")).toBe("videos com ia");
  expect(matchesSearch("Curso de Exemplo", "curso")).toBe(true);
  expect(matchesSearch("Vídeos Práticos", "VIDEOS")).toBe(true);
  expect(matchesSearch("Mentoria", "extra")).toBe(false);
  expect(matchesSearch("Qualquer", "   ")).toBe(true);
});
