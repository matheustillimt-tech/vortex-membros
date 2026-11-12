"use client";

import { useEffect, useRef, useState } from "react";
import { saveEmailTemplateAction } from "@/app/dashboard/settings/emails/actions";
import { DEFAULT_MESSAGES, MIGRATION_MESSAGE } from "@/lib/email/defaults";
import type { EmailSettings } from "@/lib/settings";
import { buttonClass } from "./button";
import { Drawer } from "./drawer";
import { AlertCircleIcon, ArrowRightIcon, ArrowsLeftRightIcon, BanIcon, CheckCircleIcon, FileTextIcon, InfoIcon, RotateCcwIcon, SaveIcon } from "./icons";
import { useAdminAction } from "./use-admin-action";

export type TemplateKey = "venda" | "importacao" | "gratis" | "novoacesso";

/** Títulos e descrições dos modelos. */
export const TEMPLATE_INFO: Record<TemplateKey, { title: string; description: string }> = {
  venda: {
    title: "Boas-vindas de compra",
    description: "Assim que o pagamento de uma compra é aprovado e o acesso é liberado. Vai para o comprador.",
  },
  importacao: {
    title: "Boas-vindas de importação",
    description: "Ao cadastrar alunos por importação de planilha. Vai para cada aluno importado.",
  },
  gratis: { title: "Boas-vindas de acesso gratuito", description: "Quando um aluno se cadastra para acessar um conteúdo gratuito." },
  novoacesso: { title: "Aviso de novo acesso", description: "Quando um acesso é adicionado a um aluno que já tem cadastro." },
};

const PREVIEW_WIDTH = 780;
const PREVIEW_HEIGHT = 880;
const PREVIEW_DELAY_MS = 400;
const BOX = "flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 p-4";
const TEXTAREA =
  "w-full resize-y rounded-lg border bg-white px-3 py-2 text-hint text-gray-900 outline-none transition-colors placeholder-gray-400 focus:ring-2 border-gray-200 focus:border-brand-500 focus:ring-brand-500/15";

/** "Desativar | Ativar" das gavetas de modelo. */
function OnOff({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const option = (on: boolean, text: string, Icon: typeof BanIcon) => (
    <button
      type="button"
      aria-pressed={value === on}
      onClick={() => onChange(on)}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-hint font-medium leading-5 transition-colors ${
        value === on ? "bg-brand-50 text-brand-700" : "text-gray-400 hover:text-gray-700"
      }`}
    >
      <Icon className="h-4 w-4" />
      {text}
    </button>
  );
  return (
    <div className="inline-flex max-w-full flex-shrink-0 flex-wrap rounded-lg border border-gray-200 p-0.5" role="group" aria-label={label}>
      {option(false, "Desativar", BanIcon)}
      {option(true, "Ativar", CheckCircleIcon)}
    </div>
  );
}

/** Pré-visualização: HTML vindo da rota de prévia (POST com o rascunho), num iframe `srcdoc` sem scripts. */
function Preview({ template, message, oneClickButton, enabled }: { template: Exclude<TemplateKey, "novoacesso">; message: string; oneClickButton: boolean; enabled: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(PREVIEW_WIDTH);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || PREVIEW_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/dashboard/settings/emails/preview/${template}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emails: { templates: { [template]: { message: message.trim() || null, oneClickButton } } } }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        setHtml(await res.text());
        setFailed(false);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [template, message, oneClickButton, attempt]);

  const scale = Math.min(1, width / PREVIEW_WIDTH);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Pré-visualização</h3>
      <div className="relative rounded-xl border border-gray-200 bg-white p-2">
        {!enabled ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-hint text-gray-500">
            <BanIcon className="h-3.5 w-3.5 flex-shrink-0" />
            Este e-mail está desligado e não será enviado.
          </div>
        ) : null}
        <div ref={box} data-preview-janela="" className="relative overflow-hidden rounded-lg bg-white" style={{ height: Math.round(PREVIEW_HEIGHT * scale) }}>
          {html !== null ? (
            <iframe
              data-preview-quadro=""
              sandbox=""
              title="Pré-visualização do e-mail"
              className="block border-0"
              srcDoc={html}
              style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, transformOrigin: "left top", transform: `scale(${scale})` }}
            />
          ) : null}
          {loading ? (
            <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-gray-900/70 px-2.5 py-1 text-micro text-white">
              <svg aria-hidden className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" />
              </svg>
              Atualizando
            </div>
          ) : null}
          {failed && !loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-4 text-center">
              <AlertCircleIcon className="h-6 w-6 text-amber-500" />
              <p className="text-hint text-gray-500">Não foi possível carregar a pré-visualização.</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonClass("outline")}>
                Tentar novamente
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Gaveta de modelo de e-mail. */
export function EmailTemplateDrawer({
  template,
  emails,
  onClose,
  onOpenAppearance,
}: {
  template: TemplateKey;
  emails: EmailSettings;
  onClose: () => void;
  onOpenAppearance: () => void;
}) {
  const { pending, error, run } = useAdminAction();
  const saved = emails.templates[template];
  const initial = {
    enabled: saved.enabled,
    oneClickButton: saved.oneClickButton,
    message: "message" in saved ? (saved.message ?? "") : "",
  };
  const [enabled, setEnabled] = useState(initial.enabled);
  const [oneClickButton, setOneClickButton] = useState(initial.oneClickButton);
  const [message, setMessage] = useState(initial.message);
  const dirty = enabled !== initial.enabled || oneClickButton !== initial.oneClickButton || message !== initial.message;
  const formId = "form-email-template";
  const info = TEMPLATE_INFO[template];

  function discard() {
    setEnabled(initial.enabled);
    setOneClickButton(initial.oneClickButton);
    setMessage(initial.message);
  }

  function save(fd: FormData) {
    run(saveEmailTemplateAction, fd, { onOk: onClose });
  }

  return (
    <Drawer
      name="email-template"
      open
      onClose={onClose}
      title={info.title}
      widthClass="max-w-2xl"
      bodyClassName="p-5"
      dirty={dirty}
      onSaveAndExit={() => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <button type="button" onClick={discard} className={buttonClass("outline")}>
              Descartar
            </button>
          ) : null}
          <button type="submit" form={formId} disabled={!dirty || pending} className={buttonClass("primary", "grow justify-center")}>
            <SaveIcon className="h-4 w-4" />
            Salvar alterações
          </button>
        </div>
      }
    >
      <div>
        <form id={formId} action={save} className="space-y-5">
          <input type="hidden" name="template" value={template} />
          <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />
          <input type="hidden" name="oneClickButton" value={oneClickButton ? "1" : "0"} />
          <p className="text-hint text-gray-500">{info.description}</p>
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
              {error}
            </div>
          ) : null}
          <div className={BOX}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700">Enviar este e-mail</p>
              <p className="mt-0.5 text-hint text-gray-500">Quando desativado, ninguém recebe este e-mail.</p>
            </div>
            <OnOff value={enabled} onChange={setEnabled} label="Enviar este e-mail" />
          </div>
          {template === "novoacesso" ? (
            <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-hint text-gray-600">
              <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div>O conteúdo deste e-mail não é editável. Apenas o envio pode ser ativado ou desativado.</div>
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor={`tpl_${template}_body`} className="mb-2 block text-sm font-medium text-gray-700">
                Sua mensagem
              </label>
              <div className="w-full">
                <textarea
                  rows={5}
                  name="message"
                  id={`tpl_${template}_body`}
                  maxLength={5000}
                  placeholder="Escreva uma mensagem personalizada para este e-mail"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={TEXTAREA}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {message.trim() !== "" ? (
                  <button type="button" onClick={() => setMessage("")} className={buttonClass("outline")}>
                    <RotateCcwIcon className="h-4 w-4" />
                    Voltar ao texto padrão
                  </button>
                ) : (
                  <button type="button" onClick={() => setMessage(DEFAULT_MESSAGES[template])} className={buttonClass("outline")}>
                    <FileTextIcon className="h-4 w-4" />
                    Começar a partir do padrão
                  </button>
                )}
                {template === "importacao" ? (
                  <button type="button" onClick={() => setMessage(MIGRATION_MESSAGE)} className={buttonClass("outline")}>
                    <ArrowsLeftRightIcon className="h-4 w-4" />
                    Usar mensagem de migração
                  </button>
                ) : null}
              </div>
            </div>
          )}
          <div className={BOX}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700">Botão de entrar com um clique</p>
              <p className="mt-0.5 text-hint text-gray-500">Adiciona um botão que já leva o aluno logado, sem digitar senha.</p>
            </div>
            <OnOff value={oneClickButton} onChange={setOneClickButton} label="Botão de entrar com um clique" />
          </div>
          {template !== "novoacesso" ? <Preview template={template} message={message} oneClickButton={oneClickButton} enabled={enabled} /> : null}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-hint text-gray-500">Cores, logo e remetente valem para todos os e-mails.</p>
            <button type="button" onClick={onOpenAppearance} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
              Personalizar aparência
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </Drawer>
  );
}
