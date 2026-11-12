import { expect, test } from "vitest";
import { safeHttpUrl, safeImageUrl } from "@/lib/theme";

test("safeHttpUrl só aceita http(s) absoluto", () => {
  expect(safeHttpUrl("https://x.com/a")).toBe("https://x.com/a");
  expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
  expect(safeHttpUrl("/demo/capa.jpg")).toBeNull();
  expect(safeHttpUrl(null)).toBeNull();
});

test("safeImageUrl aceita http(s) e caminhos do próprio site", () => {
  expect(safeImageUrl("/demo/capa.jpg")).toBe("/demo/capa.jpg");
  expect(safeImageUrl("  /demo/a b.jpg ")).toBe("/demo/a b.jpg");
  expect(safeImageUrl("https://placehold.co/400x700/png")).toBe("https://placehold.co/400x700/png");
});

test("safeImageUrl recusa outro domínio disfarçado e esquemas perigosos", () => {
  for (const bad of ["//evil.com/x.jpg", "/\\evil.com/x.jpg", "/a\nb.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "demo/capa.jpg", "", null, undefined]) {
    expect(safeImageUrl(bad)).toBeNull();
  }
});
