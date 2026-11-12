import { expect, test } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect";

test.each([
  ["/area/conteudo/aula/8758718", "/area/conteudo/aula/8758718"],
  ["https://malicioso.com", "/area/vitrine/home"],
  ["//malicioso.com", "/area/vitrine/home"],
  ["/\\malicioso.com", "/area/vitrine/home"],
  [null, "/area/vitrine/home"],
  [undefined, "/area/vitrine/home"],
])("safeRedirectPath(%s) = %s", (raw, esperado) => expect(safeRedirectPath(raw)).toBe(esperado));

test.each(["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\\evil.com", "/%09/evil.com", "/%0a/evil.com"])(
  "safeRedirectPath(%j) nunca sai do site",
  (raw) => {
    const out = safeRedirectPath(raw);
    expect(new URL(out, "http://x").origin).toBe("http://x");
    expect(out.startsWith("//")).toBe(false);
  },
);

test.each(["/\t/evil.com", "/\n/evil.com", "/\\evil.com"])("safeRedirectPath(%j) cai na home", (raw) => {
  expect(safeRedirectPath(raw)).toBe("/area/vitrine/home");
});

test("preserva caminho com query string", () => {
  expect(safeRedirectPath("/area/conteudo/aula/1?x=1&y=2")).toBe("/area/conteudo/aula/1?x=1&y=2");
});
