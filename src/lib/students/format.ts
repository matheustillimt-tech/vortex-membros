// Datas do painel, sempre no fuso de São Paulo. Módulo puro (sem banco): serve também no cliente.
const TZ = "America/Sao_Paulo";
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Sexta-feira, 18 set 2026" (data longa do perfil, fuso de São Paulo). */
export function formatLongDay(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "short", year: "numeric" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${capitalize(p.weekday)}, ${p.day} ${p.month.replace(".", "")} ${p.year}`;
}

/** "18/09/2026 16:01" (dica ao passar o mouse). */
export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(d).replace(",", "");
}

/** "há 3 semanas", "há 5 meses"… */
export function formatRelativeTime(d: Date, now: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "always" });
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "agora";
  const min = Math.floor(s / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const days = Math.floor(h / 24);
  if (days < 7) return rtf.format(-days, "day");
  if (days < 30) return rtf.format(-Math.floor(days / 7), "week");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

/** "há 10 horas", "há 1 dia", "há 1 semana"…; sem data, "Nunca acessou". */
export function formatRelative(date: Date | null, now: Date = new Date()): string {
  return date ? formatRelativeTime(date, now) : "Nunca acessou";
}

/** "Sexta-feira, 16 out 2026 às 12:59". */
export function formatLongDate(date: Date): string {
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `${formatLongDay(date)} às ${time}`;
}

/**
 * Cor do avatar de iniciais. A cor sai do id do aluno (id % 8).
 * Classes literais para o Tailwind encontrá-las.
 */
const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700",
  "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-red-100 text-red-700",
  "bg-blue-100 text-blue-700",
  "bg-rose-100 text-rose-700",
] as const;

export function avatarColor(id: number): string {
  return AVATAR_COLORS[((id % 8) + 8) % 8];
}

/** Iniciais do avatar: primeira letra do primeiro e do último nome. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** CPF (11 dígitos) ou CNPJ (14) com máscara; outros valores ficam como estão. */
export function formatDocument(document: string | null): string | null {
  if (document === null) return null;
  const d = document.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return document;
}

const parts = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hourCycle: "h23", ...opts }).formatToParts(d).map((p) => [p.type, p.value]));

/** "12:59 16/10/26" (colunas de data das abas Compras e Logs). */
export function formatShortDateTime(d: Date): string {
  const p = parts(d, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "2-digit" });
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}

/** "16/10/2026 12:59:15" (tooltip das datas curtas e CSV). */
export function formatDateTimeSeconds(d: Date): string {
  const p = parts(d, { hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** "16/10/2026" (Liberado até). */
export function formatDate(d: Date): string {
  const p = parts(d, { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${p.day}/${p.month}/${p.year}`;
}

/** Valor de `<input type="datetime-local">` (horário de São Paulo) para o instante; null se o texto não for uma data. */
export function parseSaoPauloLocal(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (h > 23 || mi > 59) return null;
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) return null;
  // São Paulo está em UTC-3 fixo desde 2019; o deslocamento sai do próprio Intl (vale para datas antigas também).
  const asSp = parts(utc, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const shown = Date.UTC(Number(asSp.year), Number(asSp.month) - 1, Number(asSp.day), Number(asSp.hour), Number(asSp.minute));
  return new Date(utc.getTime() + (utc.getTime() - shown));
}

/** O inverso: instante → "AAAA-MM-DDTHH:MM" em São Paulo (valor inicial do datetime-local). */
export function toSaoPauloLocal(d: Date): string {
  const p = parts(d, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "11,14" (valor da venda em centavos). */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------- celular ---------- */

const PREFERRED_DIAL = ["55", "1", "34"];

/**
 * Celular guardado como "+{DDI}{número}" (ex.: "+5511900000000"); valores antigos sem "+" (Kiwify)
 * são tratados como brasileiros. Devolve DDI e número (só dígitos) para o formulário.
 */
export function splitPhone(stored: string | null, dialCodes: readonly string[]): { ddi: string; number: string } {
  if (!stored) return { ddi: "55", number: "" };
  const digits = stored.replace(/\D/g, "");
  if (!stored.trim().startsWith("+")) return { ddi: "55", number: digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits };
  const preferred = PREFERRED_DIAL.find((d) => digits.startsWith(d));
  if (preferred) return { ddi: preferred, number: digits.slice(preferred.length) };
  const match = [...dialCodes].sort((a, b) => b.length - a.length).find((d) => digits.startsWith(d));
  return match ? { ddi: match, number: digits.slice(match.length) } : { ddi: "55", number: digits };
}

const brPhone = (n: string) =>
  n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n.length === 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}` : n;

/** "(11) 90000-0000" para Brasil; outros países, "+{DDI} {número}". */
export function formatPhone(stored: string | null, dialCodes: readonly string[]): string | null {
  if (!stored) return null;
  const { ddi, number } = splitPhone(stored, dialCodes);
  if (!number) return null;
  return ddi === "55" ? brPhone(number) : `+${ddi} ${number}`;
}

/** Link do WhatsApp ("Chamar Whatsapp"). */
export function whatsappUrl(stored: string | null, dialCodes: readonly string[]): string | null {
  if (!stored) return null;
  const { ddi, number } = splitPhone(stored, dialCodes);
  return number ? `https://wa.me/${ddi}${number}` : null;
}
