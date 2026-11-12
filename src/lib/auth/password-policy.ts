import type { PasswordLevel, PlatformSettings } from "@/lib/settings";

/** Critérios de senha forte (Segurança e autenticação). 0 = não exige a categoria. */
export type PasswordCriteria = {
  minLength: number;
  special: number;
  upper: number;
  lower: number;
  digits: number;
  letters: number;
};
export type PasswordPolicy = { strong: boolean } & PasswordCriteria;

/** Nível "Padrão": 8 caracteres, 1 especial, 1 maiúscula, 1 minúscula, 1 número. */
export const STRONG_CRITERIA: PasswordCriteria = { minLength: 8, special: 1, upper: 1, lower: 1, digits: 1, letters: 0 };
/** Sem senha forte, vale só o mínimo de 6 caracteres. */
export const WEAK_MIN_LENGTH = 6;
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = { strong: false, ...STRONG_CRITERIA };

/**
 * Valores dos botões "Nível de proteção". Padrão = 8/1/1/1/1/0; Reforçada e Máxima são mais exigentes.
 */
export const PASSWORD_LEVELS: Record<Exclude<PasswordLevel, "personalizada">, PasswordCriteria> = {
  padrao: STRONG_CRITERIA,
  reforcada: { minLength: 12, special: 1, upper: 1, lower: 1, digits: 1, letters: 0 },
  maxima: { minLength: 16, special: 2, upper: 2, lower: 2, digits: 2, letters: 0 },
};

/** Política de senha das configurações (`settings.auth`). Único ponto de leitura. */
export function getPasswordPolicy(settings: PlatformSettings): PasswordPolicy {
  const a = settings.auth;
  return {
    strong: a.requireStrongPassword,
    minLength: a.minLength,
    special: a.special,
    upper: a.upper,
    lower: a.lower,
    digits: a.digits,
    letters: a.letters,
  };
}

// Sem caracteres ambíguos (I/O/l/0/1) e sem os que o HTML escapa (& < > " ').
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%*-_+=?";

/** Índice aleatório uniforme em [0, n) com a Web Crypto (servidor e navegador). */
function randomIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}
const pick = (set: string) => set[randomIndex(set.length)];

/**
 * Senha aleatória que atende à política (também a pré-visualização da tela de Autenticação).
 * `length` e `atLeast` pedem um mínimo maior que o da política (ex.: convite de admin: 12 / 2 de cada).
 */
export function generatePassword(policy: PasswordPolicy, opts: { length?: number; atLeast?: number } = {}): string {
  const at = (n: number) => Math.max(policy.strong ? n : 0, opts.atLeast ?? 0);
  const chars: string[] = [];
  const add = (set: string, n: number) => {
    for (let i = 0; i < n; i++) chars.push(pick(set));
  };
  add(UPPER, at(policy.upper));
  add(LOWER, at(policy.lower));
  add(DIGITS, at(policy.digits));
  add(SPECIAL, at(policy.special));
  const letters = () => chars.filter((c) => /[a-z]/i.test(c)).length;
  while (letters() < at(policy.letters)) chars.push(pick(LOWER + UPPER));
  const length = Math.max(policy.strong ? policy.minLength : WEAK_MIN_LENGTH, opts.length ?? 8);
  while (chars.length < length) chars.push(pick(UPPER + LOWER + DIGITS));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const count = (pw: string, re: RegExp) => pw.match(re)?.length ?? 0;

function joinPt(parts: string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

/** Null quando a senha atende à política; senão, a mensagem lista só o que falta. */
export function validatePassword(pw: string, policy: PasswordPolicy): string | null {
  const length = [...pw].length;
  if (!policy.strong) {
    return length >= WEAK_MIN_LENGTH ? null : `A senha precisa ter pelo menos ${WEAK_MIN_LENGTH} caracteres.`;
  }
  const missing: string[] = [];
  if (length < policy.minLength) missing.push(plural(policy.minLength, "caractere", "caracteres"));
  if (count(pw, /[^\p{L}\p{N}]/gu) < policy.special) missing.push(plural(policy.special, "caractere especial", "caracteres especiais"));
  if (count(pw, /\p{Lu}/gu) < policy.upper) missing.push(plural(policy.upper, "letra maiúscula", "letras maiúsculas"));
  if (count(pw, /\p{Ll}/gu) < policy.lower) missing.push(plural(policy.lower, "letra minúscula", "letras minúsculas"));
  if (count(pw, /\p{Nd}/gu) < policy.digits) missing.push(plural(policy.digits, "número", "números"));
  if (count(pw, /\p{L}/gu) < policy.letters) missing.push(plural(policy.letters, "letra", "letras"));
  return missing.length ? `A senha precisa ter pelo menos ${joinPt(missing)}.` : null;
}
