"use client";

import { useState } from "react";
import { saveEmailAppearanceAction } from "@/app/dashboard/settings/emails/actions";
import type { EmailSettings } from "@/lib/settings";
import { buttonClass } from "./button";
import { ColorField } from "./color-picker";
import { Drawer } from "./drawer";
import { InfoIcon, MoonIcon, SaveIcon, SunIcon } from "./icons";
import { ImageUpload } from "./image-upload";
import { INPUT_CLASS } from "./input";
import { DirtyContext } from "./settings-form";
import { useAdminAction } from "./use-admin-action";

type Colors = EmailSettings["colors"];

/** "Tema claro" = cores padrão. "Tema escuro" não existe. */
export const EMAIL_THEMES: Record<"light" | "dark", Colors> = {
  light: { page: "#fafafb", content: "#ffffff", text: "#212121", footer: "#212121", link: "#0c92f0" },
  dark: { page: "#09090b", content: "#18181b", text: "#f4f4f5", footer: "#a1a1aa", link: "#38bdf8" },
};

const COLOR_FIELDS: { key: keyof Colors; name: string; label: string }[] = [
  { key: "page", name: "colorPage", label: "Fundo da página" },
  { key: "content", name: "colorContent", label: "Fundo do conteúdo" },
  { key: "text", name: "colorText", label: "Texto" },
  { key: "footer", name: "colorFooter", label: "Rodapé" },
  { key: "link", name: "colorLink", label: "Link" },
];

const FIELD_LABEL = "block text-xs font-medium text-gray-500";
const HELP = "mt-1.5 text-hint text-gray-400";
const FORM_ID = "form-email-aparencia";

function Field({ label, htmlFor, help, children }: { label: string; htmlFor?: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor={htmlFor} className={FIELD_LABEL}>
          {label}
        </label>
      </div>
      {children}
      {help ? <p className={HELP}>{help}</p> : null}
    </div>
  );
}

/** Gaveta "Aparência dos e-mails". */
export function EmailAppearanceDrawer({ emails, onClose }: { emails: EmailSettings; onClose: () => void }) {
  const { pending, error, run } = useAdminAction();
  const [dirty, setDirty] = useState(false);
  const [colors, setColors] = useState<Colors>(() => ({
    page: emails.colors.page.toUpperCase(),
    content: emails.colors.content.toUpperCase(),
    text: emails.colors.text.toUpperCase(),
    footer: emails.colors.footer.toUpperCase(),
    link: emails.colors.link.toUpperCase(),
  }));
  const markDirty = () => setDirty(true);

  function applyTheme(theme: "light" | "dark") {
    const t = EMAIL_THEMES[theme];
    setColors({ page: t.page.toUpperCase(), content: t.content.toUpperCase(), text: t.text.toUpperCase(), footer: t.footer.toUpperCase(), link: t.link.toUpperCase() });
    markDirty();
  }

  return (
    <Drawer
      name="email-appearance"
      open
      onClose={onClose}
      title="Aparência dos e-mails"
      widthClass="max-w-2xl"
      bodyClassName="p-5"
      dirty={dirty}
      onSaveAndExit={() => (document.getElementById(FORM_ID) as HTMLFormElement | null)?.requestSubmit()}
      footer={
        <button type="submit" form={FORM_ID} disabled={pending} className={buttonClass("primary", "w-full justify-center")}>
          <SaveIcon className="h-4 w-4" />
          Salvar
        </button>
      }
    >
      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50/60 p-3 text-sm text-brand-800">
        <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-hint leading-relaxed text-gray-600">Estas definições valem para todos os e-mails que a plataforma envia.</p>
        </div>
      </div>
      <DirtyContext.Provider value={markDirty}>
        <form id={FORM_ID} action={(fd) => run(saveEmailAppearanceAction, fd, { onOk: onClose })} onChange={markDirty} className="space-y-5">
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Cores</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => applyTheme("light")} className={buttonClass("outline")}>
                <SunIcon className="h-4 w-4" />
                Tema claro
              </button>
              <button type="button" onClick={() => applyTheme("dark")} className={buttonClass("outline")}>
                <MoonIcon className="h-4 w-4" />
                Tema escuro
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {COLOR_FIELDS.map(({ key, name, label }) => (
              <Field key={key} label={label}>
                <ColorField name={name} value={colors[key]} onChange={(v) => setColors((c) => ({ ...c, [key]: v }))} />
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Logo">
              <div className="flex flex-wrap items-start gap-4">
                <ImageUpload name="logoUrl" kind="email" defaultValue={emails.logoUrl} boxClassName="w-32 h-20" onChange={markDirty} />
                <p className="text-hint text-gray-400">JPG ou PNG — até 200 KB</p>
              </div>
            </Field>
            <Field label="Altura da logo" htmlFor="email_logo_height" help="Altura em pixels com que a logo será exibida nos e-mails.">
              <div className="flex h-9 w-32 items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
                <input
                  id="email_logo_height"
                  name="logoHeight"
                  inputMode="numeric"
                  placeholder="35"
                  defaultValue={emails.logoHeight}
                  className="min-w-0 flex-1 bg-transparent px-3 text-center text-hint text-gray-900 outline-none placeholder-gray-400"
                />
                <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-hint text-gray-500">px</span>
              </div>
            </Field>
          </div>
          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">Remetente</h3>
          </div>
          <Field label="Nome do remetente" htmlFor="email_sender_name" help="Nome exibido como remetente nos e-mails enviados.">
            <input
              type="text"
              name="senderName"
              id="email_sender_name"
              maxLength={100}
              placeholder="Ex.: Minha Escola"
              defaultValue={emails.senderName ?? ""}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="E-mail de resposta" htmlFor="email_reply_to" help="Endereço para o qual os alunos respondem ao receber um e-mail da plataforma.">
            <input
              type="email"
              name="replyTo"
              id="email_reply_to"
              maxLength={254}
              placeholder="contato@exemplo.com"
              defaultValue={emails.replyTo ?? ""}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Assinatura" htmlFor="email_signature" help="Texto exibido ao final de todos os e-mails enviados.">
            <div className="w-full">
              <textarea
                rows={3}
                name="signature"
                id="email_signature"
                maxLength={500}
                placeholder="Equipe Minha Escola"
                defaultValue={emails.signature ?? ""}
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-hint text-gray-900 outline-none transition-colors placeholder-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </div>
          </Field>
        </form>
      </DirtyContext.Provider>
    </Drawer>
  );
}
