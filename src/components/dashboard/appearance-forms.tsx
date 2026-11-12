"use client";

import Link from "next/link";
import { useContext, useEffect, useState, useRef } from "react";
import type { ActionResult } from "@/app/dashboard/action-utils";
import {
  saveAccessScreensAction,
  saveAdminAreaAction,
  saveFirstAccessTermsAction,
  saveSharingAction,
  saveStudentAppearanceAction,
  saveStudentFooterAction,
  saveStudentGeneralAction,
} from "@/app/dashboard/settings/actions";
import { SHARE_DESCRIPTION_MAX, SHARE_TITLE_MAX } from "@/lib/sharing-limits";
import type { PlatformSettings } from "@/lib/settings";
import { BlockEditor, type BlockEditorHandle } from "./block-editor";
import { buttonClass } from "./button";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowLeftIcon,
  CheckIcon,
  ColumnsSplitIcon,
  ExternalLinkIcon,
  ImageIcon,
  InfoIcon,
  LayoutIcon,
  LogInIcon,
  MonitorIcon,
  KeyIcon,
  MailIcon,
  PaletteIcon,
  ShieldIcon,
  UsersIcon,
  MoonIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PencilIcon,
  PlusIcon,
  ShareIcon,
  SunIcon,
  TypeIcon,
} from "./icons";
import { ImageUpload } from "./image-upload";
import { INPUT_CLASS } from "./input";
import { ColorWithSuggestions } from "./color-picker";
import { isSaveBarOpen, SaveBar, useSaveState } from "./save-bar";
import { DirtyContext, Row, Section, Segmented, Switch, ToggleRow, type CardOption } from "./settings-form";
import { useAdminAction } from "./use-admin-action";

/**
 * Configurações › Personalização: Área do aluno (abas Geral, Aparência,
 * Rodapé), termo de primeiro acesso, Telas de acesso e Painel administrativo. Opções que não existem
 * neste projeto (como idioma e modelo de navegação) ficam de fora.
 */

const BACK = "/dashboard/settings#personalization";

export function SettingsHeader({
  title,
  description,
  back = BACK,
  backLabel = "Voltar para Configurações",
}: {
  title: string;
  description?: string;
  back?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div data-backlink="">
            <Link href={back} data-navega="" className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          </div>
          <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Formulário com a barra de salvar; envia tudo de uma vez. `beforeSubmit` completa o FormData (editor). */
function AppearanceForm({
  action,
  beforeSubmit,
  children,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  beforeSubmit?: (fd: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const { pending, error, run } = useAdminAction();
  const { dirty, saved, markDirty, markSaved } = useSaveState(() => submit());

  async function submit() {
    if (!form.current) return;
    const fd = new FormData(form.current);
    await beforeSubmit?.(fd);
    run(action, fd, { onOk: markSaved });
  }

  return (
    <DirtyContext.Provider value={markDirty}>
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}
      <form
        ref={form}
        className={`space-y-6${isSaveBarOpen({ dirty, saved, pending, error }) ? " savebar-aberta" : ""}`}
        style={{ "--savebar-altura": "3rem" } as React.CSSProperties}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onChange={markDirty}
      >
        {children}
        <SaveBar dirty={dirty} saved={saved} pending={pending} error={error} />
      </form>
    </DirtyContext.Provider>
  );
}

/** Upload que avisa o formulário (o hidden input não dispara `change`). */
function Upload(props: React.ComponentProps<typeof ImageUpload>) {
  const markDirty = useContext(DirtyContext);
  return (
    <div className="flex gap-4 flex-col items-center">
      <ImageUpload {...props} onChange={markDirty} />
    </div>
  );
}

function Color({ name, defaultValue }: { name: string; defaultValue: string | null }) {
  return <ColorWithSuggestions name={name} defaultValue={defaultValue} />;
}

// ---------- Área do aluno ----------

type StudentTab = "geral" | "aparencia" | "rodape";
const STUDENT_TABS: { id: StudentTab; label: string }[] = [
  { id: "geral", label: "Geral" },
  { id: "aparencia", label: "Aparência" },
  { id: "rodape", label: "Rodapé" },
];
const TAB_ON =
  "-mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2.5 text-hint transition-colors disabled:cursor-wait disabled:opacity-60 border-brand-500 text-brand-600";
const TAB_OFF =
  "-mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2.5 text-hint transition-colors disabled:cursor-wait disabled:opacity-60 border-transparent text-gray-600 hover:text-gray-900";

export function StudentAreaSettings({ settings }: { settings: PlatformSettings }) {
  const [tab, setTab] = useState<StudentTab>("geral");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    // Abre a aba do link (#aparencia, #rodape) depois de hidratar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (h === "aparencia" || h === "rodape") setTab(h);
  }, []);

  return (
    <div>
      <SettingsHeader title="Área do aluno" description="Aparência, cores e identidade visual da plataforma" />
      <div>
        <div className="relative z-30 my-6 border-b border-gray-200">
          <div className="flex min-h-11 select-none flex-wrap items-end gap-x-1">
            {STUDENT_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                className={tab === t.id ? TAB_ON : TAB_OFF}
                onClick={() => {
                  setTab(t.id);
                  window.history.replaceState(null, "", t.id === "geral" ? window.location.pathname : `#${t.id}`);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tab === "geral" ? <StudentGeneralForm settings={settings} /> : null}
        {tab === "aparencia" ? <StudentAppearanceForm settings={settings} /> : null}
        {tab === "rodape" ? <StudentFooterForm settings={settings} /> : null}
      </div>
    </div>
  );
}

function StudentGeneralForm({ settings }: { settings: PlatformSettings }) {
  const termsOn = settings.firstAccessTerms.enabled && !!settings.firstAccessTerms.html;
  return (
    <AppearanceForm action={saveStudentGeneralAction}>
      <Section title="Geral" description="Configurações gerais da experiência do aluno." className="scroll-mt-24">
        <Row label="Título das páginas" htmlFor="page_title" tip="Nome da plataforma: título da aba do navegador, rodapé e telas de acesso.">
          <div className="w-full sm:max-w-xs">
            <input
              type="text"
              name="siteName"
              id="page_title"
              required
              maxLength={120}
              placeholder="Ex.: Minha Escola"
              defaultValue={settings.siteName}
              className={INPUT_CLASS}
            />
          </div>
        </Row>
        <ToggleRow
          name="showcaseAutoScroll"
          label="Rolagem automática das vitrines"
          tip="Na página inicial, as vitrines com mais conteúdos do que cabem na tela avançam sozinhas, uma capa por vez."
          defaultChecked={settings.showcaseAutoScroll}
        />
        <Row label="Termo de aceite no primeiro acesso" tip="Texto que o aluno precisa aceitar antes de usar a área do aluno.">
          <div className="flex w-full flex-wrap items-center justify-end gap-3">
            <span className="text-hint text-gray-400">
              {termsOn ? "Os alunos aceitam um termo no primeiro acesso." : "Nenhum termo é exigido no primeiro acesso."}
            </span>
            <Link href="/dashboard/settings/student-area/terms" className={buttonClass("outline")}>
              {settings.firstAccessTerms.html ? <PencilIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
              {settings.firstAccessTerms.html ? "Editar termo" : "Adicionar termo"}
            </Link>
          </div>
        </Row>
      </Section>
    </AppearanceForm>
  );
}

const THEME_OPTIONS: CardOption<"light" | "dark">[] = [
  { value: "light", label: "Claro", icon: <SunIcon className="h-4 w-4" /> },
  { value: "dark", label: "Escuro", icon: <MoonIcon className="h-4 w-4" /> },
];
const FONT_OPTIONS: CardOption<"default" | "large">[] = [
  { value: "default", label: "Padrão", icon: <TypeIcon className="h-4 w-4" /> },
  { value: "large", label: "Ampliado", icon: <TypeIcon className="h-4 w-4" /> },
];

function StudentAppearanceForm({ settings }: { settings: PlatformSettings }) {
  const [theme, setTheme] = useState(settings.theme);
  const [fontSize, setFontSize] = useState(settings.fontSize);
  return (
    <AppearanceForm action={saveStudentAppearanceAction}>
      <Section title="Aparência" description="Defina a identidade visual da área do aluno." className="scroll-mt-24">
        <Row label="Cor de destaque">
          <Color name="accentColor" defaultValue={settings.accentColor} />
        </Row>
        <Row label="Modo de exibição">
          <Segmented name="theme" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
        </Row>
        <Row label="Tamanho da fonte" tip="Ampliado aumenta os textos da área do aluno em 12,5%.">
          <Segmented name="fontSize" value={fontSize} options={FONT_OPTIONS} onChange={setFontSize} />
        </Row>
        <Row label="Logo" tip="Exibido no topo da área do aluno." hint="PNG — até 600kb">
          <Upload name="logoUrl" kind="logo" defaultValue={settings.logoUrl} boxClassName="w-44 h-28" />
        </Row>
        <Row label="Ícone de Favorito (Favicon)" tip="Ícone da aba do navegador." hint="PNG — 150x150 — até 300kb">
          <Upload name="faviconUrl" kind="icon" defaultValue={settings.faviconUrl} boxClassName="w-20 h-20" />
        </Row>
      </Section>
    </AppearanceForm>
  );
}

/** Toggle + link (termos/privacidade): o link só aparece e só é enviado com o toggle ligado. */
function LinkToggleRow({
  label,
  tip,
  toggleName,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  tip: string;
  toggleName: string;
  name: string;
  defaultValue: string | null;
  placeholder: string;
}) {
  const [on, setOn] = useState(!!defaultValue);
  const [value, setValue] = useState(defaultValue ?? "");
  const href = /^https?:\/\//i.test(value) ? value : undefined;
  return (
    <Row label={label} tip={tip}>
      <div className="flex w-full flex-wrap items-start justify-end gap-x-3 gap-y-2">
        <Switch name={toggleName} checked={on} label={label} onChange={setOn} />
        {on ? (
          <div className="w-72 max-w-full">
            <div className="flex h-9 w-full items-stretch rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
              <input
                type="url"
                name={name}
                aria-label={label}
                required
                maxLength={2000}
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full min-w-0 bg-transparent px-3 text-hint text-gray-900 outline-none placeholder-gray-400"
              />
              <span className="tooltip flex-shrink-0">
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={-1}
                  aria-label="Abrir link"
                  href={href}
                  className="flex h-full w-10 flex-shrink-0 items-center justify-center border-l border-gray-200 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 rounded-r-[calc(var(--radius-lg)-1px)]"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              </span>
            </div>
          </div>
        ) : (
          <input type="hidden" name={name} value="" />
        )}
      </div>
    </Row>
  );
}

function StudentFooterForm({ settings }: { settings: PlatformSettings }) {
  const f = settings.footer;
  return (
    <AppearanceForm action={saveStudentFooterAction}>
      <Section title="Rodapé" description="Defina o rodapé da área do aluno e das telas de acesso." className="scroll-mt-24">
        <ToggleRow name="footerShow" label="Exibir rodapé" tip="Mostra o rodapé no fim das páginas da área do aluno." defaultChecked={f.show} />
        <ToggleRow name="legalNotice" label="Exibir aviso legal" tip="Linha de copyright com o nome da plataforma." defaultChecked={f.legalNotice} />
        <LinkToggleRow
          label="Exibir link de termos de uso"
          tip="Link para os termos de uso no rodapé."
          toggleName="termsOn"
          name="termsUrl"
          defaultValue={f.termsUrl}
          placeholder="https://exemplo.com/termos-de-uso"
        />
        <LinkToggleRow
          label="Exibir link da política de privacidade"
          tip="Link para a política de privacidade no rodapé."
          toggleName="privacyOn"
          name="privacyUrl"
          defaultValue={f.privacyUrl}
          placeholder="https://exemplo.com/politica-de-privacidade"
        />
      </Section>
    </AppearanceForm>
  );
}

// ---------- Termo de primeiro acesso ----------

export function FirstAccessTermsForm({ enabled: initialEnabled, html }: { enabled: boolean; html: string }) {
  const editor = useRef<BlockEditorHandle>(null);
  const [enabled, setEnabled] = useState(initialEnabled);
  return (
    <div>
      <SettingsHeader
        title="Termo de aceite no primeiro acesso"
        description="Texto que o aluno precisa aceitar antes de usar a área do aluno."
        back="/dashboard/settings/student-area"
        backLabel="Voltar para Área do aluno"
      />
      <div data-header-traco="" className="my-6 border-b border-gray-200" />
      <AppearanceForm
        action={saveFirstAccessTermsAction}
        beforeSubmit={async (fd) => {
          const data = await editor.current?.save(); // null = texto intacto (não reenviado)
          if (data) fd.set("blocks", JSON.stringify(data));
        }}
      >
        <TermsCard enabled={enabled} setEnabled={setEnabled} html={html} editor={editor} />
      </AppearanceForm>
    </div>
  );
}

function TermsCard({
  enabled,
  setEnabled,
  html,
  editor,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  html: string;
  editor: React.RefObject<BlockEditorHandle | null>;
}) {
  const markDirty = useContext(DirtyContext);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Termo de Aceite Inicial</h3>
          <p className="mt-0.5 text-hint text-gray-500">Termo que o aluno precisa aceitar no primeiro acesso à área do aluno.</p>
        </div>
        <Switch name="termsEnabled" checked={enabled} label="Exigir aceite do termo" onChange={setEnabled} />
      </div>
      <BlockEditor ref={editor} initialBlocks={null} initialHtml={html} placeholder="Escreva aqui… (use / para blocos)" onChange={markDirty} />
    </div>
  );
}

// ---------- Telas de acesso (15) ----------

const ALIGN_OPTIONS: CardOption<"left" | "center" | "right">[] = [
  { value: "left", label: "Esquerda", icon: <AlignLeftIcon className="h-4 w-4" /> },
  { value: "center", label: "Centro", icon: <AlignCenterIcon className="h-4 w-4" /> },
  { value: "right", label: "Direita", icon: <AlignRightIcon className="h-4 w-4" /> },
];
const SIDE_OPTIONS: CardOption<"left" | "right">[] = [
  { value: "left", label: "Esquerda", icon: <PanelLeftIcon className="h-4 w-4" /> },
  { value: "right", label: "Direita", icon: <PanelRightIcon className="h-4 w-4" /> },
];
const LOGIN_THEME_OPTIONS: CardOption<"area" | "light" | "dark">[] = [
  { value: "area", label: "Seguir a área do aluno", icon: <MonitorIcon className="h-4 w-4" /> },
  { value: "light", label: "Claro", icon: <SunIcon className="h-4 w-4" /> },
  { value: "dark", label: "Escuro", icon: <MoonIcon className="h-4 w-4" /> },
];
const WIDTH_OPTIONS: CardOption<PlatformSettings["loginScreen"]["panelWidth"]>[] = [
  { value: "narrow", label: "Estreita", icon: <ColumnsSplitIcon className="h-4 w-4" /> },
  { value: "default", label: "Padrão", icon: <ColumnsSplitIcon className="h-4 w-4" /> },
  { value: "medium", label: "Média", icon: <ColumnsSplitIcon className="h-4 w-4" /> },
  { value: "wide", label: "Larga", icon: <ColumnsSplitIcon className="h-4 w-4" /> },
  { value: "extraWide", label: "Muito larga", icon: <ColumnsSplitIcon className="h-4 w-4" /> },
];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Cor de destaque do login: vazio = segue a área do aluno; prévia do botão "Entrar". */
function LoginAccent({ defaultValue, areaAccent }: { defaultValue: string | null; areaAccent: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const color = HEX.test(value.trim()) ? value.trim() : areaAccent;
  return (
    <div className="w-full space-y-4 sm:max-w-[456px]">
      <div className="space-y-1.5">
        <ColorWithSuggestions name="accentColor" defaultValue={defaultValue} onChange={setValue} />
        <p className="text-xs text-gray-500">
          <span>{value.trim() === "" ? "Seguindo a cor de destaque da área do aluno." : "Cor própria das telas de acesso. Apague para seguir a área do aluno."}</span>
        </p>
      </div>
      <div>
        <span className="block text-xs font-medium text-gray-500">Prévia</span>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-6 rounded-lg border border-dashed border-gray-200 p-5">
          <span
            className="inline-flex cursor-pointer select-none items-center rounded-lg px-5 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200"
            style={{ backgroundColor: color, color: "#fff", boxShadow: `0 4px 12px color-mix(in srgb, ${color} 20%, transparent)` }}
          >
            Entrar
          </span>
          <span className="cursor-pointer select-none text-sm font-semibold text-gray-800 underline underline-offset-2 transition-colors duration-200">
            Esqueci minha senha
          </span>
        </div>
      </div>
    </div>
  );
}

export function AccessScreensForm({ settings }: { settings: PlatformSettings }) {
  const l = settings.loginScreen;
  const [logoAlign, setLogoAlign] = useState(l.logoAlign);
  const [formSide, setFormSide] = useState(l.formSide);
  const [theme, setTheme] = useState(l.theme);
  const [imagePosition, setImagePosition] = useState(l.imagePosition);
  const [panelWidth, setPanelWidth] = useState(l.panelWidth);
  return (
    <div>
      <SettingsHeader title="Telas de acesso" description="Aparência das telas de login e cadastro" />
      <div data-header-traco="" className="my-6 border-b border-gray-200" />
      <AppearanceForm action={saveAccessScreensAction}>
        <Section title="Modelo" description="Escolha o visual das telas de login, cadastro e recuperação de senha." className="scroll-mt-24">
          <div className="px-5 py-8">
            <div className="flex items-center gap-1.5 justify-center mb-5">
              <span className="text-sm text-gray-700">
                Qual modelo esta plataforma usa? <span className="text-red-500">*</span>
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap justify-center gap-2">
                <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border px-2.5 py-2.5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/30 bg-white w-36 border-brand-500">
                  <input type="radio" name="auth_modelo" value="classico" className="sr-only" checked readOnly />
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white">
                    <CheckIcon className="h-2.5 w-2.5" />
                  </span>
                  <span className="flex h-9 items-center justify-center text-brand-500">
                    <LayoutIcon className="h-9 w-auto" />
                  </span>
                  <span className="mt-2 flex items-center justify-center gap-1 text-[13px] font-medium text-gray-900">Clássico</span>
                </label>
              </div>
              <p className="mt-3 text-center text-hint text-gray-500">O layout atual, com painel de imagem ao lado do formulário.</p>
            </div>
          </div>
        </Section>

        <Section title="Logo" description="Defina como a marca aparece nas telas de acesso." className="scroll-mt-24">
          <Row label="Imagem" tip="Sem imagem, vale o logo da área do aluno (ou o nome da plataforma)." hint="JPG ou PNG — até 600kb">
            <Upload name="logoUrl" kind="logo" defaultValue={l.logoUrl} boxClassName="w-44 h-28" />
          </Row>
          <Row label="Alinhamento">
            <Segmented name="logoAlign" value={logoAlign} options={ALIGN_OPTIONS} onChange={setLogoAlign} />
          </Row>
          <Row label="Altura" htmlFor="auth_logo_height">
            <div className="flex h-9 w-36 items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
              <input
                id="auth_logo_height"
                name="logoHeight"
                type="number"
                min={20}
                max={120}
                step={1}
                placeholder="45"
                defaultValue={l.logoHeight}
                className="min-w-0 flex-1 bg-transparent px-3 text-center text-hint text-gray-900 outline-none placeholder-gray-400"
              />
              <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-hint text-gray-500">px</span>
            </div>
          </Row>
        </Section>

        <Section title="Formulário e botões" description="Ajuste a posição do formulário e a cor de destaque usada nas telas de acesso." className="scroll-mt-24">
          <Row label="Lado do formulário" tip="Em telas grandes, de que lado da imagem o formulário fica.">
            <Segmented name="formSide" value={formSide} options={SIDE_OPTIONS} onChange={setFormSide} />
          </Row>
          <Row label="Modo claro ou escuro" tip="Seguir a área do aluno usa o mesmo modo configurado em Área do aluno › Aparência.">
            <Segmented name="loginTheme" value={theme} options={LOGIN_THEME_OPTIONS} onChange={setTheme} />
          </Row>
          <Row label="Cor de destaque" tip="Cor do botão Entrar e dos detalhes do formulário." wide>
            <LoginAccent defaultValue={l.accentColor} areaAccent={settings.accentColor} />
          </Row>
        </Section>

        <Section title="Painel visual" description="Personalize o painel exibido ao lado do formulário em telas maiores." className="scroll-mt-24">
          <Row label="Imagem do painel visual" tip="Imagem ao lado do formulário (abaixo dele no celular)." hint="JPG — 1280x1024 — até 2MB">
            <Upload name="imageUrl" kind="image" defaultValue={l.imageUrl} boxClassName="w-48 h-28" />
          </Row>
          <Row label="Posição da imagem">
            <Segmented name="imagePosition" value={imagePosition} options={ALIGN_OPTIONS} onChange={setImagePosition} />
          </Row>
          <Row label="Largura do painel">
            <Segmented name="panelWidth" value={panelWidth} options={WIDTH_OPTIONS} onChange={setPanelWidth} />
          </Row>
        </Section>
      </AppearanceForm>
    </div>
  );
}

// ---------- Painel administrativo (16) ----------

export function AdminAreaForm({ settings }: { settings: PlatformSettings }) {
  const a = settings.adminArea;
  return (
    <div>
      <SettingsHeader title="Painel administrativo" description="Aparência do painel administrativo" />
      <div data-header-traco="" className="my-6 border-b border-gray-200" />
      <AppearanceForm action={saveAdminAreaAction}>
        <div className="flex rounded-lg border text-sm items-start gap-3 p-4 border-sky-200 bg-sky-50 text-sky-800 text-hint">
          <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div>O painel será atualizado após salvar para aplicar a nova identidade visual.</div>
          </div>
        </div>
        <Section title="Identidade do painel" description="Defina os elementos exibidos na navegação administrativa." className="scroll-mt-24">
          <Row label="Cor de destaque" tip="Cor dos botões, abas e destaques do painel.">
            <Color name="accentColor" defaultValue={a.accentColor.toUpperCase()} />
          </Row>
          <Row label="Logo do painel" tip="Exibido no topo do painel; sem logo, aparece o nome da plataforma." hint="PNG — 350x100 — até 600kb">
            <Upload name="logoUrl" kind="logo" defaultValue={a.logoUrl} boxClassName="w-44 h-28" />
          </Row>
          <Row label="Ícone do menu recolhido" tip="Ícone quadrado; também usado como ícone da aba do painel." hint="PNG quadrado — 64x64 — até 300kb">
            <Upload name="collapsedIconUrl" kind="icon" defaultValue={a.collapsedIconUrl} boxClassName="w-20 h-20" />
          </Row>
        </Section>
      </AppearanceForm>
    </div>
  );
}

// ---------- índice (13) ----------

const CARD =
  "group flex items-start gap-4 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
const CARD_ICON = "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-white text-brand-600";

const SETTINGS_CARDS = [
  { href: "/dashboard/settings/student-area", title: "Área do aluno", text: "Aparência, cores e identidade visual da plataforma", Icon: MonitorIcon },
  { href: "/dashboard/settings/access-screens", title: "Telas de acesso", text: "Aparência das telas de login e cadastro", Icon: LogInIcon },
  { href: "/dashboard/settings/admin-area", title: "Painel administrativo", text: "Aparência do painel administrativo", Icon: LayoutIcon },
  { href: "/dashboard/settings/emails", title: "E-mails", text: "Aparência, remetente e modelos dos e-mails", Icon: MailIcon },
  { href: "/dashboard/settings/sharing", title: "Compartilhamento", text: "Como seus links aparecem nas redes sociais", Icon: ShareIcon },
];

const ACCESS_CARDS = [
  { href: "/dashboard/settings/administrators", title: "Administradores", text: "Quem entra no painel e o que pode fazer", Icon: UsersIcon },
  {
    href: "/dashboard/settings/security/auth",
    title: "Autenticação",
    text: "Regras de senha e proteções de login de alunos e administradores",
    Icon: KeyIcon,
  },
];

function SettingsSection({ id, title, Icon, cards, className = "" }: {
  id: string;
  title: string;
  Icon: (p: { className?: string }) => React.ReactNode;
  cards: typeof SETTINGS_CARDS;
  className?: string;
}) {
  return (
    <section className={`scroll-mt-24${className ? ` ${className}` : ""}`} id={id}>
      <h2 className="mb-5 flex items-center gap-2 text-sm text-gray-400">
        <Icon className="h-4 w-4 text-gray-400" />
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ href, title: cardTitle, text, Icon: CardIcon }) => (
          <Link key={href} href={href} className={CARD}>
            <span className={CARD_ICON}>
              <CardIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <h3 className="text-base text-gray-900">{cardTitle}</h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">{text}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Configurações: seções Personalização e Acessos e segurança, com os cards implementados. */
export function SettingsIndex() {
  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Configurações</h1>
            <p className="mt-1 text-sm text-gray-500">Tudo que define como a sua plataforma funciona e com que cara ela fica.</p>
          </div>
        </div>
      </div>
      <div data-header-traco="" className="my-6 border-b border-gray-200" />
      <div>
        <SettingsSection id="personalization" title="Personalização" Icon={PaletteIcon} cards={SETTINGS_CARDS} />
        <SettingsSection id="access" title="Acessos e segurança" Icon={ShieldIcon} cards={ACCESS_CARDS} className="mt-8" />
      </div>
    </div>
  );
}

// ---------- Compartilhamento ----------

/** Configurações → Compartilhamento: título, descrição, imagem e a prévia. */
export function SharingSettings({ settings }: { settings: PlatformSettings }) {
  const { sharing, siteName } = settings;
  const [title, setTitle] = useState(sharing.title);
  const [description, setDescription] = useState(sharing.description);
  const [image, setImage] = useState(sharing.imageUrl);
  const counter = "mt-2 text-hint text-gray-500";
  return (
    <div>
      <SettingsHeader title="Compartilhamento" description="Como seus links aparecem nas redes sociais" />
      <div data-header-traco="" className="my-6 border-b border-gray-200" />
      <AppearanceForm action={saveSharingAction}>
        <Section title="Informações do link" description="Título, descrição e imagem exibidos na prévia do link.">
          <Row label="Título" htmlFor="share_title" tip="Aparece em destaque na prévia. Sem título, vale o nome da plataforma.">
            <div className="w-full">
              <input
                type="text"
                name="shareTitle"
                id="share_title"
                maxLength={SHARE_TITLE_MAX}
                placeholder={siteName}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={INPUT_CLASS}
              />
              <p className={counter}>{title.length} caracteres · Recomendado: até 60 caracteres.</p>
            </div>
          </Row>
          <Row label="Descrição" htmlFor="share_description" tip="Texto curto abaixo do título na prévia.">
            <div className="w-full">
              <textarea
                name="shareDescription"
                id="share_description"
                rows={3}
                maxLength={SHARE_DESCRIPTION_MAX}
                placeholder="Ex.: Conheça nossos conteúdos."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={INPUT_CLASS}
              />
              <p className={counter}>{description.length} caracteres · Recomendado: até 160 caracteres.</p>
            </div>
          </Row>
          <Row label="Imagem" tip="Imagem grande da prévia." hint="JPG ou PNG — 1200 × 630 px — até 600 KB">
            <SharingImage defaultValue={sharing.imageUrl} onChange={setImage} />
          </Row>
        </Section>
        <Section title="Prévia" description="Uma visualização aproximada de como suas informações podem aparecer nas redes sociais.">
          <div className="max-w-xl space-y-4">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              {image ? (
                <img src={image} alt="" className="aspect-[1200/630] w-full object-cover" />
              ) : (
                <div className="flex aspect-[1200/630] w-full flex-col items-center justify-center gap-3 bg-gray-100 text-hint text-gray-400">
                  <ImageIcon className="h-7 w-7" />
                  Adicione uma imagem para vê-la aqui.
                </div>
              )}
              <div className="space-y-1 px-4 py-4">
                <p className="text-sm font-semibold text-gray-900">{title.trim() || siteName}</p>
                {description.trim() ? <p className="line-clamp-2 text-hint text-gray-500">{description.trim()}</p> : null}
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-hint text-sky-800">
              <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Após salvar, a atualização pode levar algum tempo para aparecer nas redes sociais.
            </div>
          </div>
        </Section>
      </AppearanceForm>
    </div>
  );
}

/** Upload da imagem da prévia: avisa o formulário e atualiza o cartão. */
function SharingImage({ defaultValue, onChange }: { defaultValue: string | null; onChange: (url: string | null) => void }) {
  const markDirty = useContext(DirtyContext);
  return (
    <ImageUpload
      name="shareImageUrl"
      kind="logo"
      defaultValue={defaultValue}
      boxClassName="w-60 h-32"
      onChange={(url) => {
        markDirty();
        onChange(url);
      }}
    />
  );
}
