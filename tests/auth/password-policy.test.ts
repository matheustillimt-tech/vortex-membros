import { expect, test } from "vitest";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/settings";
import {
  STRONG_CRITERIA, DEFAULT_PASSWORD_POLICY, getPasswordPolicy, validatePassword, type PasswordPolicy,
} from "@/lib/auth/password-policy";

const forte: PasswordPolicy = { strong: true, ...STRONG_CRITERIA };

test("padrão para senha forte: 8/1/1/1/1/0", () => {
  expect(STRONG_CRITERIA).toEqual({ minLength: 8, special: 1, upper: 1, lower: 1, digits: 1, letters: 0 });
});

test("senha forte recusa 'abcdefgh' listando o que falta e aceita 'Abcdef1!'", () => {
  expect(validatePassword("abcdefgh", forte)).toBe(
    "A senha precisa ter pelo menos 1 caractere especial, 1 letra maiúscula e 1 número.",
  );
  expect(validatePassword("Abcdef1!", forte)).toBeNull();
  expect(validatePassword("Ab1!", forte)).toBe("A senha precisa ter pelo menos 8 caracteres.");
});

test("critério 0 não é exigido; plural e letras no total", () => {
  const p: PasswordPolicy = { strong: true, minLength: 4, special: 0, upper: 0, lower: 0, digits: 2, letters: 3 };
  expect(validatePassword("1@@@", p)).toBe("A senha precisa ter pelo menos 2 números e 3 letras.");
  expect(validatePassword("ab12", p)).toBe("A senha precisa ter pelo menos 3 letras.");
  expect(validatePassword("abc12", p)).toBeNull();
});

test("sem senha forte: só o mínimo de 6 caracteres", () => {
  expect(DEFAULT_PASSWORD_POLICY.strong).toBe(false);
  expect(validatePassword("12345", DEFAULT_PASSWORD_POLICY)).toBe("A senha precisa ter pelo menos 6 caracteres.");
  expect(validatePassword("123456", DEFAULT_PASSWORD_POLICY)).toBeNull();
  expect(validatePassword("abcdef", { ...forte, strong: false })).toBeNull();
});

test("getPasswordPolicy: padrão das configurações; usa settings.auth", () => {
  expect(getPasswordPolicy(DEFAULT_SETTINGS)).toEqual(DEFAULT_PASSWORD_POLICY);
  const { strong, ...criteria } = forte;
  const comAuth = { ...DEFAULT_SETTINGS, auth: { ...DEFAULT_SETTINGS.auth, ...criteria, requireStrongPassword: strong } } as PlatformSettings;
  expect(getPasswordPolicy(comAuth)).toEqual(forte);
});
