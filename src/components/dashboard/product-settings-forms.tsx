"use client";

import { useContext, useRef, useState } from "react";
import type { ActionResult } from "@/app/dashboard/action-utils";
import {
  saveGeneralAction,
  saveLessonPageAction,
  saveProductPageAction,
  saveTermsAction,
} from "@/app/dashboard/content/product/[id]/settings-actions";
import type { AdminProductSettingsEdit } from "@/lib/admin/content";
import type { ProductSettings } from "@/db/schema";
import { BlockEditor, type BlockEditorHandle } from "./block-editor";
import {
  AppWindowIcon,
  ArrowsLeftRightIcon,
  ColumnsIcon,
  CornerUpRightIcon,
  BanIcon,
  GridIcon,
  ImageIcon,
  ListIcon,
  NewspaperIcon,
  PlayCircleIcon,
  RatioIcon,
  SparklesIcon,
  TimelineIcon,
  TvIcon,
} from "./icons";
import { ImageUpload } from "./image-upload";
import { INPUT_CLASS } from "./input";
import { ColorField } from "./color-picker";
import { Combobox } from "./combobox";
import { isSaveBarOpen, SaveBar, useSaveState } from "./save-bar";
import {
  DirtyContext,
  RadioCards,
  RadioPills,
  Row,
  Section,
  Segmented,
  Switch,
  ToggleRow,
  type CardOption,
} from "./settings-form";
import { useAdminAction } from "./use-admin-action";

type Product = AdminProductSettingsEdit;

/**
 * Formulário de configurações: envia tudo de uma vez (barra de salvar), com `productId`.
 * `beforeSubmit` pode completar o FormData (ex.: blocos do editor do termo).
 */
function SettingsForm({
  productId,
  action,
  beforeSubmit,
  children,
}: {
  productId: number;
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
        className={isSaveBarOpen({ dirty, saved, pending, error }) ? "savebar-aberta" : undefined}
        style={{ "--savebar-altura": "3rem" } as React.CSSProperties}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onChange={markDirty}
      >
        <input type="hidden" name="productId" value={productId} />
        <fieldset className="m-0 border-0 p-0">{children}</fieldset>
        <SaveBar dirty={dirty} saved={saved} pending={pending} error={error} />
      </form>
    </DirtyContext.Provider>
  );
}

// ---------- Geral ----------

const FORMATS: CardOption<string>[] = [
  { value: "curso", label: "Cursos", icon: <PlayCircleIcon className="h-6 w-6" /> },
  { value: "flix", label: "Séries", icon: <ColumnsIcon className="h-6 w-6" />, disabled: true },
  { value: "blog", label: "Blog", icon: <NewspaperIcon className="h-6 w-6" />, disabled: true },
  { value: "atalho", label: "Atalhos", icon: <CornerUpRightIcon className="h-6 w-6" />, disabled: true },
  { value: "iframe", label: "Página incorporada", icon: <AppWindowIcon className="h-6 w-6" />, disabled: true },
];

export function GeneralForm({ product }: { product: Product }) {
  const [accessType, setAccessType] = useState<"lifetime" | "days">(product.defaultAccessDays === null ? "lifetime" : "days");
  return (
    <SettingsForm productId={product.id} action={saveGeneralAction}>
      <Section title="Definições" description="Configurações gerais do produto.">
        <Row label="Nome" htmlFor="nome" required>
          <input type="text" name="name" id="nome" required maxLength={200} placeholder="Nome do produto" defaultValue={product.name} className={INPUT_CLASS} />
        </Row>
        <Row label="Miniatura" tip="Imagem exibida no card do produto." hint="Recomendado: 1280x720px — JPG ou PNG até 2MB">
          <div className="flex gap-4 flex-col items-center">
            <ImageUpload name="thumbnailUrl" defaultValue={product.thumbnailUrl} boxClassName="w-44 h-28" />
          </div>
        </Row>
        <Row label="Cor de destaque" tip="Cor do produto na área do aluno.">
          <ColorField name="accentColor" defaultValue={product.accentColor} />
        </Row>
        <Row label="Formato" tip="Como o conteúdo do produto é organizado." wide>
          <RadioCards name="produto-formato" value="curso" options={FORMATS} onChange={() => {}} />
          <p className="mt-3 w-full text-right text-hint text-gray-500">Aulas em módulos</p>
        </Row>
      </Section>

      <Section title="Oferta" description="Para onde o aluno sem acesso é redirecionado ao tentar abrir o produto." className="mt-6">
        <Row label="URL de oferta" htmlFor="ofertaUrl">
          <div className="w-full sm:max-w-xl">
            <input
              type="url"
              name="offerUrl"
              id="ofertaUrl"
              maxLength={2000}
              placeholder="https://exemplo.com/oferta"
              defaultValue={product.offerUrl ?? ""}
              className={INPUT_CLASS}
            />
          </div>
        </Row>
      </Section>

      <Section title="Produto grátis" description="Quando ativado, qualquer aluno terá acesso a este produto." className="mt-6">
        <ToggleRow name="isFree" label="Liberar este produto gratuitamente" defaultChecked={product.isFree} />
        <Row label="Tempo de acesso" htmlFor="tempoAcesso" wide>
          <div className="flex flex-wrap items-start justify-end gap-4">
            {accessType === "days" ? (
              <div className="w-full sm:w-32">
                <input
                  type="number"
                  name="accessDays"
                  aria-label="Dias de acesso"
                  min={1}
                  max={36500}
                  required
                  defaultValue={product.defaultAccessDays ?? 365}
                  className={INPUT_CLASS}
                />
              </div>
            ) : (
              <input type="hidden" name="accessDays" value="" />
            )}
            <div className="w-full sm:w-52">
              <Combobox
                id="tempoAcesso"
                name="accessType"
                value={accessType}
                onChange={(v) => setAccessType(v === "days" ? "days" : "lifetime")}
                options={[
                  { value: "lifetime", label: "Acesso vitalício" },
                  { value: "days", label: "Dias" },
                ]}
              />
            </div>
          </div>
        </Row>
      </Section>
    </SettingsForm>
  );
}

// ---------- Página do produto ----------

const LISTING_OPTIONS: (CardOption<ProductSettings["listing"]> & { description: string })[] = [
  { value: "none", label: "Nenhum", icon: <BanIcon className="h-6 w-6" />, description: "Sem listagem: o produto abre direto na primeira aula." },
  { value: "grid", label: "Grid", icon: <GridIcon className="h-6 w-6" />, description: "Módulos em grade, com as capas lado a lado." },
  { value: "list", label: "Listagem", icon: <ListIcon className="h-6 w-6" />, description: "Módulos e aulas em lista, um abaixo do outro." },
  { value: "timeline", label: "Timeline", icon: <TimelineIcon className="h-6 w-6" />, description: "Aulas em sequência numa linha do tempo." },
  {
    value: "streaming",
    label: "Streaming",
    icon: <TvIcon className="h-6 w-6" />,
    description: "Destaque no topo e os conteúdos em carrosséis, no estilo streaming.",
  },
];

const THUMB_OPTIONS: (CardOption<ProductSettings["thumbnailFormat"]> & { description: string })[] = [
  { value: "auto", label: "Automático", icon: <SparklesIcon className="h-4 w-4" />, description: "Redimensionado de forma inteligente mantendo a proporção original da imagem enviada" },
  { value: "original", label: "Automático Original", icon: <ImageIcon className="w-[18px]" />, description: "Exibe a imagem no tamanho original enviado" },
  { value: "16:9", label: "16:9", icon: <RatioIcon w={16} h={9} className="w-6" />, description: "Capas horizontais (16:9)" },
  { value: "1:1", label: "4:4", icon: <RatioIcon w={4} h={4} className="h-4 w-4" />, description: "Capas quadradas (4:4)" },
  { value: "4:5", label: "4:5", icon: <RatioIcon w={4} h={5} className="h-4 w-4" />, description: "Capas verticais (4:5)" },
  { value: "4:7", label: "4:7", icon: <RatioIcon w={4} h={7} className="h-4 w-4" />, description: "Capas verticais (4:7)" },
];

export function ProductPageForm({ product }: { product: Product }) {
  const s = product.settings;
  const [listing, setListing] = useState(s.listing);
  const [thumb, setThumb] = useState(s.thumbnailFormat);
  const [showBanner, setShowBanner] = useState(s.showBanner);
  return (
    <SettingsForm productId={product.id} action={saveProductPageAction}>
      <Section title="Listagem" description="Como as aulas e módulos são listados para o aluno.">
        <Row label="Modelo de listagem" wide>
          <RadioCards name="listing" value={listing} options={LISTING_OPTIONS} onChange={setListing} />
          <p className="mt-3 w-full text-right text-hint text-gray-500">{LISTING_OPTIONS.find((o) => o.value === listing)?.description}</p>
        </Row>
        <ToggleRow name="modulesAsCarousel" label="Exibir módulos como carrossel" tip="Módulos lado a lado, rolando na horizontal." defaultChecked={s.modulesAsCarousel} />
        <ToggleRow name="showModuleTitles" label="Exibir título dos módulos" defaultChecked={s.showModuleTitles} />
        <Row label="Formato da miniatura" wide>
          <div>
            <RadioPills name="thumbnailFormat" value={thumb} options={THUMB_OPTIONS} onChange={setThumb} />
            <p className="mt-2 text-hint text-gray-400">{THUMB_OPTIONS.find((o) => o.value === thumb)?.description}</p>
          </div>
        </Row>
      </Section>

      <Section title="Banner" description="Faixa de destaque no topo da página do produto." className="mt-8">
        <ToggleRow name="showBanner" label="Exibir banner" tip="Imagem larga exibida acima dos módulos." defaultChecked={s.showBanner} onChange={setShowBanner} />
        <div className={showBanner ? undefined : "hidden"}>
          <Row label="Imagem do banner" hint="Recomendado: 1920x600px — JPG ou PNG até 3MB">
            <div className="flex gap-4 flex-col items-center">
              <ImageUpload name="bannerUrl" kind="banner" defaultValue={s.bannerUrl} boxClassName="w-60 h-24" />
            </div>
          </Row>
        </div>
      </Section>
    </SettingsForm>
  );
}

// ---------- Página da aula ----------

const NAV_OPTIONS: CardOption<ProductSettings["lesson"]["navigation"]>[] = [
  { value: "simple", label: "Simples", icon: <ArrowsLeftRightIcon className="h-4 w-4" /> },
  { value: "thumbnail", label: "Miniatura", icon: <ImageIcon className="h-4 w-4" /> },
];

export function LessonPageForm({ product, products }: { product: Product; products: { id: number; name: string }[] }) {
  const l = product.settings.lesson;
  const [navigation, setNavigation] = useState(l.navigation);
  return (
    <SettingsForm productId={product.id} action={saveLessonPageAction}>
      <Section title="Página da aula" description="Como a tela onde o aluno assiste se organiza.">
        <ToggleRow name="mobileVideoFirst" label="Vídeo em destaque no celular" tip="No celular, o vídeo aparece antes da trilha." defaultChecked={l.mobileVideoFirst} />
        <ToggleRow name="theaterMode" label="Player em modo teatro" tip="O vídeo ocupa toda a largura, acima da barra lateral." defaultChecked={l.theaterMode} />
      </Section>

      <Section title="Barra lateral" description="Exibição da navegação dentro do produto." className="mt-6">
        <ToggleRow name="showModuleBar" label="Exibir barra de módulos" defaultChecked={l.showModuleBar} />
        <ToggleRow name="compactModuleBar" label="Exibir lista de módulos reduzida" tip="Só o módulo da aula atual fica aberto." defaultChecked={l.compactModuleBar} />
        <ToggleRow name="showLessonNumbers" label="Exibir numeração das aulas" tip="Número de cada aula na lista." defaultChecked={l.showLessonNumbers} />
      </Section>

      <Section title="Progresso" description="Como o avanço do aluno é exibido." className="mt-6">
        <ToggleRow name="showTotalProgress" label="Exibir progresso total do aluno" tip="Barra com as aulas vistas do produto." defaultChecked={l.showTotalProgress} />
      </Section>

      <Section title="Marcação" description="Como as aulas são marcadas como vistas." className="mt-6">
        <ToggleRow name="showMarkSeenButton" label="Exibir botão de marcar como visto" defaultChecked={l.showMarkSeenButton} />
        <ToggleRow name="keepButtonAfterSeen" label="Exibir o botão após marcado" tip="Permite desmarcar a aula." defaultChecked={l.keepButtonAfterSeen} />
        <Row label="Marcação automática" htmlFor="marcacaoAuto" tip="Marca a aula como vista sem o aluno clicar.">
          <div className="w-full sm:w-52">
            <Combobox
              id="marcacaoAuto"
              name="autoMarkSeen"
              defaultValue={l.autoMarkSeen ? "open" : "default"}
              options={[
                { value: "default", label: "Padrão" },
                { value: "open", label: "Ao abrir a aula" },
              ]}
            />
          </div>
        </Row>
      </Section>

      <Section title="Navegação" description="Navegação (anterior e próximo) localizada abaixo de cada aula." className="mt-6">
        <Row label="Tipo" wide>
          <Segmented name="navigation" value={navigation} options={NAV_OPTIONS} onChange={setNavigation} />
        </Row>
      </Section>

      <Section title="Próximo Produto" description="Produto sugerido ao final do conteúdo" className="mt-6">
        <Row label="Produto" htmlFor="proximoProduto">
          <div className="w-full sm:max-w-sm">
            <Combobox
              id="proximoProduto"
              name="nextProductId"
              defaultValue={l.nextProductId ? String(l.nextProductId) : ""}
              options={[
                { value: "", label: "Nenhum" },
                ...products.filter((p) => p.id !== product.id).map((p) => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </div>
        </Row>
        <Row label="Texto do botão" htmlFor="textoBotao" tip="Vazio = “Continuar em” + nome do produto.">
          <div className="w-full sm:max-w-xs">
            <input
              type="text"
              id="textoBotao"
              name="nextProductButtonText"
              maxLength={60}
              placeholder="Nome do produto"
              defaultValue={l.nextProductButtonText ?? ""}
              className={INPUT_CLASS}
            />
          </div>
        </Row>
      </Section>
    </SettingsForm>
  );
}

// ---------- Termo de aceite ----------

export function TermsForm({ product }: { product: Product }) {
  const editor = useRef<BlockEditorHandle>(null);
  const [enabled, setEnabled] = useState(product.termsEnabled);
  return (
    <SettingsForm
      productId={product.id}
      action={saveTermsAction}
      beforeSubmit={async (fd) => {
        const data = await editor.current?.save(); // null = texto intacto (não reenviado)
        if (data) fd.set("blocks", JSON.stringify(data));
      }}
    >
      <TermsCard enabled={enabled} setEnabled={setEnabled} html={product.termsHtml ?? ""} editor={editor} />
    </SettingsForm>
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
          <p className="mt-0.5 text-hint text-gray-500">Termo que o aluno precisa aceitar antes de acessar o conteúdo.</p>
        </div>
        <Switch name="termsEnabled" checked={enabled} label="Exigir aceite do termo" onChange={setEnabled} />
      </div>
      <BlockEditor ref={editor} initialBlocks={null} initialHtml={html} placeholder="Escreva aqui… (use / para blocos)" onChange={markDirty} />
    </div>
  );
}
