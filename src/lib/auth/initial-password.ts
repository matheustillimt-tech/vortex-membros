import type { PlatformSettings } from "@/lib/settings";
import { generatePassword, getPasswordPolicy } from "./password-policy";
import { normalizeEmail } from "./tokens";

/**
 * Senha inicial de um aluno novo (Configurações › Autenticação): o e-mail ou o CPF/documento
 * (só os dígitos) quando escolhido; senão a senha padrão; sem senha padrão, uma senha gerada
 * que atende à política. Documento vazio cai na senha padrão/gerada.
 */
export function initialPasswordFor(user: { email: string; document?: string | null }, settings: PlatformSettings): string {
  const a = settings.auth;
  if (a.initialPasswordFrom === "email") return normalizeEmail(user.email);
  if (a.initialPasswordFrom === "doc") {
    const digits = (user.document ?? "").replace(/\D/g, "");
    if (digits) return digits;
  }
  return a.defaultPassword ?? generatePassword(getPasswordPolicy(settings));
}
