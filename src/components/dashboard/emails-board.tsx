"use client";

import { useState } from "react";
import type { EmailHealthNotice } from "@/lib/email/health";
import type { EmailSettings } from "@/lib/settings";
import { SettingsHeader } from "./appearance-forms";
import { EmailAppearanceDrawer } from "./email-appearance-drawer";
import { EmailTemplateDrawer, TEMPLATE_INFO, type TemplateKey } from "./email-template-drawer";
import { AlertCircleIcon, ArrowRightIcon, BellIcon, GiftIcon, LockIcon, PaletteIcon, ShoppingCartIcon, UploadIcon } from "./icons";

const CARDS: { key: TemplateKey; Icon: typeof BellIcon }[] = [
  { key: "venda", Icon: ShoppingCartIcon },
  { key: "importacao", Icon: UploadIcon },
  { key: "gratis", Icon: GiftIcon },
  { key: "novoacesso", Icon: BellIcon },
];

type Open = { type: "appearance" } | { type: "template"; key: TemplateKey } | null;

/** E-mails: aviso de envio, card "Aparência dos e-mails" e os 4 modelos. */
export function EmailsBoard({ emails, senderEmail, notice }: { emails: EmailSettings; senderEmail: string | null; notice: EmailHealthNotice | null }) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const c = emails.colors;

  return (
    <div>
      <SettingsHeader title="E-mails" description="Aparência, remetente e modelos dos e-mails" />
      <div data-header-traco="" className="my-6 border-b border-gray-200" />

      {notice ? (
        <div
          role="status"
          className={`mb-6 flex items-start gap-2 rounded-lg border p-3 text-sm ${
            notice.tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="min-w-0 flex-1 text-hint">{notice.text}</div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen({ type: "appearance" })}
        className="mb-6 flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-white px-5 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30"
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <PaletteIcon className="h-5 w-5 text-brand-500" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">Aparência dos e-mails</span>
          <span className="mt-0.5 block text-hint text-gray-500">Cores, logo e remetente que valem para todos os e-mails abaixo.</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-4">
          <span className="flex items-center -space-x-1.5" aria-hidden="true">
            {[c.page, c.content, c.text, c.footer, c.link].map((color, i) => (
              <span key={i} className="h-6 w-6 rounded-full ring-2 ring-white" style={{ background: color }} />
            ))}
          </span>
          {senderEmail ? <span className="hidden max-w-[220px] truncate text-hint text-gray-500 sm:block">{senderEmail}</span> : null}
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600">
            Personalizar
            <ArrowRightIcon className="h-4 w-4" />
          </span>
        </span>
      </button>

      <div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CARDS.map(({ key, Icon }) => {
            const t = emails.templates[key];
            const fixed = key === "novoacesso";
            const custom = !fixed && "message" in t && t.message !== null;
            return (
              <div key={key}>
                <button
                  type="button"
                  data-open-sheet="email-template"
                  onClick={() => setOpen({ type: "template", key })}
                  className="config-card flex h-full w-full flex-col rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:border-gray-300"
                >
                  <span className="flex w-full items-start justify-between gap-3">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100">
                      <Icon className="h-5 w-5 text-gray-500" />
                    </span>
                    {t.enabled ? (
                      <span className="selo selo--success !px-2.5 !py-1 gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Ativado
                      </span>
                    ) : (
                      <span className="selo selo--neutral !px-2.5 !py-1 gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                        Desativado
                      </span>
                    )}
                  </span>
                  <span className="mt-3 block text-[15px] font-semibold leading-snug text-gray-900">{TEMPLATE_INFO[key].title}</span>
                  <span className="mt-1 block flex-1 text-hint leading-relaxed text-gray-500">{TEMPLATE_INFO[key].description}</span>
                  <span className="mt-4 flex w-full flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                    {fixed ? (
                      <span className="selo selo--neutral gap-1">
                        <LockIcon className="h-3 w-3" />
                        Fixo
                      </span>
                    ) : (
                      <span className={`selo ${custom ? "selo--brand" : "selo--neutral"}`}>{custom ? "Personalizado" : "Padrão"}</span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-brand-600">
                      Personalizar
                      <ArrowRightIcon className="h-4 w-4" />
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {open?.type === "appearance" ? <EmailAppearanceDrawer emails={emails} onClose={close} /> : null}
      {open?.type === "template" ? (
        <EmailTemplateDrawer key={open.key} template={open.key} emails={emails} onClose={close} onOpenAppearance={() => setOpen({ type: "appearance" })} />
      ) : null}
    </div>
  );
}
