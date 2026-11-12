"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { saveAuthSettingsAction } from "@/app/dashboard/settings/security/auth/actions";
import { generatePassword, PASSWORD_LEVELS, type PasswordCriteria } from "@/lib/auth/password-policy";
import type { AuthSettings, PasswordLevel } from "@/lib/settings";
import { SettingsHeader } from "./appearance-forms";
import { buttonClass } from "./button";
import { Combobox } from "./combobox";
import { AlertCircleIcon, CheckIcon, EyeIcon, EyeOffIcon, RefreshIcon, ShieldIcon, SlidersIcon } from "./icons";
import { INPUT_CLASS } from "./input";
import { isSaveBarOpen, SaveBar, useSaveState } from "./save-bar";
import { DirtyContext, Row, Section, Switch } from "./settings-form";
import { useAdminAction } from "./use-admin-action";

/** Espera depois da última mudança antes de salvar sozinho (a tela salva sozinha). */
export const AUTOSAVE_DELAY_MS = 800;

const LEVELS: { value: PasswordLevel; label: string }[] = [
  { value: "padrao", label: "Padrão" },
  { value: "reforcada", label: "Reforçada" },
  { value: "maxima", label: "Máxima" },
  { value: "personalizada", label: "Personalizada" },
];

const CRITERIA: { key: keyof PasswordCriteria; label: string; suffix: string; min: number }[] = [
  { key: "minLength", label: "Tamanho mínimo", suffix: "caracteres", min: 6 },
  { key: "special", label: "Caracteres especiais", suffix: "mínimo", min: 0 },
  { key: "upper", label: "Letras maiúsculas", suffix: "mínimo", min: 0 },
  { key: "lower", label: "Letras minúsculas", suffix: "mínimo", min: 0 },
  { key: "digits", label: "Números", suffix: "mínimo", min: 0 },
  { key: "letters", label: "Letras no total", suffix: "mínimo", min: 0 },
];

const INITIAL_OPTIONS = [
  { value: "none", label: "Não usar dados do aluno" },
  { value: "email", label: "Usar e-mail como senha inicial" },
  { value: "doc", label: "Usar CPF/documento como senha inicial" },
];

type CriteriaText = Record<keyof PasswordCriteria, string>;
const toText = (c: PasswordCriteria): CriteriaText =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])) as CriteriaText;

/** Cor de cada caractere da pré-visualização por tipo (números em sky, como na captura). */
function charClass(ch: string): string {
  if (/\p{Nd}/u.test(ch)) return "text-sky-600";
  if (/\p{Lu}/u.test(ch)) return "text-brand-600";
  if (/\p{Ll}/u.test(ch)) return "text-gray-900";
  return "text-amber-600";
}

const noSubscribe = () => () => {};

/** Autenticação: só a aba Senhas. Salva sozinha. */
export function AuthSettingsForm({ auth }: { auth: AuthSettings }) {
  const form = useRef<HTMLFormElement>(null);
  const { pending, error, run } = useAdminAction();
  const { dirty, saved, markDirty, markSaved } = useSaveState(() => submit());
  const [changes, setChanges] = useState(0);

  const [strong, setStrong] = useState(auth.requireStrongPassword);
  const [level, setLevel] = useState<PasswordLevel>(auth.level);
  const [criteria, setCriteria] = useState<CriteriaText>(() => toText(auth));
  const [initialFrom, setInitialFrom] = useState(auth.initialPasswordFrom);
  const [defaultPassword, setDefaultPassword] = useState(auth.defaultPassword ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [seed, setSeed] = useState(0);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  function touch() {
    markDirty();
    setChanges((n) => n + 1);
  }

  function submit() {
    if (!form.current) return;
    run(saveAuthSettingsAction, new FormData(form.current), { onOk: markSaved });
  }

  // Salva sozinha AUTOSAVE_DELAY_MS depois da última mudança.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    if (changes === 0) return;
    const t = window.setTimeout(() => submitRef.current(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [changes]);

  function applyLevel(l: Exclude<PasswordLevel, "personalizada">) {
    setLevel(l);
    setCriteria(toText(PASSWORD_LEVELS[l]));
    touch();
  }

  function setCriterion(key: keyof PasswordCriteria, value: string) {
    setCriteria((c) => ({ ...c, [key]: value }));
    setLevel("personalizada");
    touch();
  }

  // Pré-visualização: a senha padrão, se houver; senão um exemplo gerado com os critérios atuais.
  const policy = useMemo(() => {
    const num = (v: string, min: number) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= min && n <= 64 ? n : min;
    };
    return {
      strong,
      minLength: num(criteria.minLength, 6),
      special: num(criteria.special, 0),
      upper: num(criteria.upper, 0),
      lower: num(criteria.lower, 0),
      digits: num(criteria.digits, 0),
      letters: num(criteria.letters, 0),
    };
  }, [strong, criteria]);
  const example = useMemo(
    () => (mounted ? generatePassword(policy) : ""),
    // seed: "Gerar outro exemplo"
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mounted, policy, seed],
  );
  const preview = defaultPassword.trim() || example;

  return (
    <div>
      <SettingsHeader
        title="Autenticação"
        description="Defina como alunos e administradores acessam a plataforma, com regras de senha e proteções de login."
        back="/dashboard/settings#access"
      />
      <DirtyContext.Provider value={touch}>
        <form
          ref={form}
          className={isSaveBarOpen({ dirty, saved, pending, error }) ? "savebar-aberta" : undefined}
          style={{ "--savebar-altura": "3rem" } as React.CSSProperties}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onChange={touch}
        >
          <div className="relative z-30 my-6 border-b border-gray-200">
            <div className="flex min-h-11 select-none flex-wrap items-end gap-x-1">
              <button
                type="button"
                aria-pressed="true"
                className="-mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-brand-500 px-2.5 text-hint text-brand-600 transition-colors disabled:cursor-wait disabled:opacity-60"
              >
                Senhas
              </button>
            </div>
          </div>

          {error ? (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
              {error}
            </div>
          ) : null}

          <div className="space-y-6">
            <Section title="Senhas" description="Defina os requisitos de senha que serão aplicados a alunos e administradores.">
              <Row
                label="Exigir senha forte"
                tip="Aplica os critérios configurados a todas as senhas criadas ou alteradas."
                onClick={() => {
                  setStrong(!strong);
                  touch();
                }}
              >
                <Switch name="requireStrongPassword" checked={strong} label="Exigir senha forte" onChange={setStrong} />
              </Row>
              <input type="hidden" name="level" value={level} />
              {CRITERIA.map(({ key }) => (strong ? null : <input key={key} type="hidden" name={key} value={criteria[key]} />))}
              {strong ? (
                <>
                  <Row
                    label="Nível de proteção"
                    tip="Escolha uma configuração sugerida. Ao ajustar qualquer critério, a opção muda para “Personalizada”."
                  >
                    <div className="inline-flex max-w-full flex-wrap rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Nível de proteção">
                      {LEVELS.map((l) => {
                        const on = l.value === level;
                        const Icon = l.value === "personalizada" ? SlidersIcon : ShieldIcon;
                        return (
                          <button
                            key={l.value}
                            type="button"
                            aria-pressed={on}
                            disabled={on || l.value === "personalizada"}
                            onClick={() => l.value !== "personalizada" && applyLevel(l.value)}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-hint font-medium transition-colors disabled:cursor-not-allowed ${
                              on ? "cursor-default bg-brand-50 text-brand-700" : "cursor-pointer text-gray-400 hover:text-gray-700"
                            }`}
                          >
                            {on ? <CheckIcon className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                            {l.label}
                          </button>
                        );
                      })}
                    </div>
                  </Row>
                  <Row label="Critérios da senha" tip="Defina os requisitos mínimos. Informe 0 para não exigir uma categoria." wide>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {CRITERIA.map(({ key, label, suffix, min }) => (
                        <div key={key} className="min-w-0">
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <label htmlFor={`auth-${key}`} className="block text-xs font-medium text-gray-500">
                              {label}
                            </label>
                          </div>
                          <div className="flex h-9 w-44 items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
                            <input
                              id={`auth-${key}`}
                              name={key}
                              type="number"
                              min={min}
                              max={64}
                              step={1}
                              required
                              value={criteria[key]}
                              onChange={(e) => setCriterion(key, e.target.value)}
                              className="min-w-0 flex-1 bg-transparent px-3 text-center text-hint text-gray-900 outline-none placeholder-gray-400"
                            />
                            <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-hint text-gray-500">{suffix}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Row>
                </>
              ) : null}
              <div className="scroll-mt-24 p-5 md:grid md:grid-cols-[2fr_3fr] md:items-start md:gap-8" id="senha-inicial">
                <div className="mb-2 flex items-center gap-1.5 md:mb-0 md:pt-2">
                  <span className="text-sm text-gray-700">Usar um dado do aluno como senha inicial</span>
                  <span className="tooltip">
                    <span
                      tabIndex={0}
                      title="Opcional. Escolha e-mail ou CPF/documento; para definir uma senha temporária ou gerar uma senha automática, selecione “Não usar dados do aluno”."
                      className="inline-flex rounded-full text-gray-300 hover:text-gray-400"
                    >
                      <AlertCircleIcon className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </div>
                <div className="min-w-0 md:flex md:flex-col md:items-end">
                  <div className="w-full">
                    <Combobox
                      name="initialPasswordFrom"
                      aria-label="Usar um dado do aluno como senha inicial"
                      options={INITIAL_OPTIONS}
                      value={initialFrom}
                      onChange={(v) => setInitialFrom(v as AuthSettings["initialPasswordFrom"])}
                    />
                    {initialFrom !== "none" ? (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-hint text-amber-800">
                        <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div>Não recomendado: e-mail e CPF/documento podem ser informações fáceis de descobrir.</div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <Row
                label="Senha padrão"
                htmlFor="default_password"
                tip="Todos os novos alunos receberão esta mesma senha. Deixe em branco para gerar uma senha individual automaticamente."
              >
                <div className="relative w-full">
                  <input
                    name="defaultPassword"
                    id="default_password"
                    autoComplete="new-password"
                    maxLength={128}
                    placeholder="Gerar senha automaticamente"
                    type={showPassword ? "text" : "password"}
                    value={defaultPassword}
                    onChange={(e) => setDefaultPassword(e.target.value)}
                    className={`${INPUT_CLASS} pr-10`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 transition-colors hover:text-gray-600"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </Row>
            </Section>

            <div className="painel-aside grid items-start gap-3 md:grid-cols-[280px_1fr] md:gap-8">
              <div className="min-w-0 painel-titulo-desc">
                <h2 className="text-sm font-semibold text-gray-900">Pré-visualização</h2>
                <p className="mt-1 text-hint text-gray-500">Um exemplo de senha que atende aos critérios configurados.</p>
                {defaultPassword.trim() === "" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setSeed((n) => n + 1)} className={buttonClass("outline")}>
                      <RefreshIcon className="h-4 w-4" />
                      Gerar outro exemplo
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 rounded-lg border border-gray-200 bg-white">
                <div className="painel-linhas">
                  <div className="p-5">
                    <div className="flex min-h-28 items-center justify-center">
                      <p className="break-all text-center font-mono text-3xl font-semibold tracking-widest" aria-live="polite">
                        {showPassword || defaultPassword.trim() === ""
                          ? [...preview].map((ch, i) => (
                              <span key={i} className={charClass(ch)}>
                                {ch}
                              </span>
                            ))
                          : [...preview].map((_, i) => (
                              <span key={i} className="text-gray-400">
                                •
                              </span>
                            ))}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <SaveBar dirty={dirty} saved={saved} pending={pending} error={error} />
        </form>
      </DirtyContext.Provider>
    </div>
  );
}
