export const DEFAULT_HOME = "/area/vitrine/home";

const BASE = "http://x";

/** Aceita só caminhos internos ("/x"); qualquer outra coisa cai na home. */
export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_HOME;
  // Tab/newline e outros controles são removidos pelo parser de URL ("/\t/evil.com" viraria //evil.com)
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_HOME;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return DEFAULT_HOME;
  }
  if (url.origin !== BASE) return DEFAULT_HOME;
  const out = url.pathname + url.search + url.hash;
  if (!out.startsWith("/") || out.startsWith("//")) return DEFAULT_HOME;
  return out;
}
