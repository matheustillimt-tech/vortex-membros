/** Conversões do seletor de cor do painel (hex ⇄ HSV). Funções puras, testadas em tests/dashboard. */

export type Hsv = { h: number; s: number; v: number };

/**
 * "#abc", "abc", " #AABBCC " → "#AABBCC"; vazio → ""; inválido → null.
 * O servidor continua validando o valor enviado; isto só arruma o que o usuário digitou.
 */
export function normalizeHex(input: string): string | null {
  const t = input.trim().replace(/^#/, "");
  if (t === "") return "";
  if (/^[0-9a-f]{3}$/i.test(t)) return `#${t.replace(/./g, (c) => c + c)}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(t)) return `#${t}`.toUpperCase();
  return null;
}

export function hexToHsv(hex: string): Hsv {
  const n = normalizeHex(hex) || "#000000";
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  const to = (u: number) =>
    Math.round((u + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}
