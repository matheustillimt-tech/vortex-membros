"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import type { AdminBannerEdit } from "@/lib/admin/banners";
import { saveBannerAction, setBannerStatusAction, trashBannerAction } from "@/app/dashboard/content/banners/actions";
import { ContentSubnav } from "./banners-board";
import { Button } from "./button";
import { Combobox } from "./combobox";
import { AppWindowIcon, ArrowLeftIcon, BanIcon, CornerUpRightIcon, ExternalLinkIcon, PackageIcon, TrashIcon } from "./icons";
import { ImageUpload } from "./image-upload";
import { INPUT_CLASS } from "./input";
import { Modal, ModalFooter } from "./modal";
import { isSaveBarOpen, SaveBar, useSaveState } from "./save-bar";
import { DirtyContext, RadioCards, Row, Section, type CardOption } from "./settings-form";
import { PRODUCT_STATUS, StatusSelo } from "./status-selo";
import { useAdminAction } from "./use-admin-action";

type ActionType = AdminBannerEdit["action"]["type"];

const ACTIONS: CardOption<ActionType>[] = [
  { value: "none", label: "Não fazer nada", icon: <BanIcon className="h-6 w-6" /> },
  { value: "product", label: "Abrir um produto", icon: <PackageIcon className="h-6 w-6" /> },
  { value: "external", label: "Abrir página externa", icon: <CornerUpRightIcon className="h-6 w-6" /> },
];

const PILL_BTN =
  "relative z-10 flex h-full flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-hint font-medium transition-colors duration-200";

/**
 * "Abrir link em": segmentado com a pílula bg-brand-50 deslizando para o botão ativo
 * (mesmas cores do Padrão/Live da aula). O valor vai no hidden `newTab` ("1"/"0") lido pela action.
 */
function OpenInSegmented({ newTab, onChange }: { newTab: boolean; onChange: (v: boolean) => void }) {
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ width: number; left: number } | null>(null);
  useLayoutEffect(() => {
    function measure() {
      const b = btns.current[newTab ? 1 : 0];
      if (b) setPill({ width: b.offsetWidth, left: b.offsetLeft });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [newTab]);
  const items = [
    { value: false, label: "Mesma janela", Icon: AppWindowIcon },
    { value: true, label: "Nova aba", Icon: ExternalLinkIcon },
  ];
  return (
    <div className="relative flex items-center h-[38px] p-0.5 rounded-lg border border-gray-200 select-none sm:max-w-xs">
      <input type="hidden" name="newTab" value={newTab ? "1" : "0"} />
      {items.map(({ value, label, Icon }, i) => {
        const on = value === newTab;
        return (
          <button
            key={label}
            ref={(el) => {
              btns.current[i] = el;
            }}
            type="button"
            aria-label={label}
            aria-pressed={on}
            onClick={() => onChange(value)}
            className={`${PILL_BTN} ${on ? "text-brand-700" : "text-gray-400 hover:text-gray-700"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0.5 top-0.5 rounded-md ease-in-out bg-brand-50 transition-all duration-200"
        style={pill ? { width: pill.width, left: pill.left } : { width: "calc(50% - 2px)", left: newTab ? "50%" : "2px" }}
      />
    </div>
  );
}

/**
 * Editor do banner. A seção "Conteúdo do banner" (logo, título, texto, botão)
 * e os controles de vídeo/aparência sem campo no BannerConfig ficam de fora: a área do aluno mostra
 * só a imagem (decisão de produto).
 */
export function BannerEditor({ banner, products }: { banner: AdminBannerEdit; products: { id: number; name: string }[] }) {
  const router = useRouter();
  const { pending, error, run } = useAdminAction();
  const form = useRef<HTMLFormElement>(null);
  const [actionType, setActionType] = useState<ActionType>(banner.action.type);
  const [newTab, setNewTab] = useState(banner.action.type === "external" ? banner.action.newTab : false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const { dirty, saved, markDirty, markSaved } = useSaveState(() => save());
  const open = isSaveBarOpen({ dirty, saved, pending, error });

  function save() {
    if (!form.current) return;
    run(saveBannerAction, new FormData(form.current), { onOk: markSaved });
  }

  const contextActions = (
    <>
      <StatusSelo value={banner.status} options={PRODUCT_STATUS} onChange={(status) => run(setBannerStatusAction, { id: banner.id, status })} />
      <Button variant="dangerGhost" onClick={() => setConfirmTrash(true)}>
        <TrashIcon className="h-4 w-4" />
        Excluir
      </Button>
    </>
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="">
              <Link href="/dashboard/content/banners" className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                Voltar para Banners
              </Link>
            </div>
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">{banner.name}</h1>
          </div>
        </div>
      </div>

      <ContentSubnav current="banners" actions={contextActions} />

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      <DirtyContext.Provider value={markDirty}>
        <form
          ref={form}
          className={`space-y-6${open ? " savebar-aberta" : ""}`}
          style={{ "--savebar-altura": "3rem" } as React.CSSProperties}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          onChange={markDirty}
        >
          <input type="hidden" name="id" value={banner.id} />
          <input type="hidden" name="actionType" value={actionType} />

          <Section title="Identificação e formato" description="Identifique o banner e escolha como ele será criado.">
            <Row label="Nome" htmlFor="nome" tip="Nome interno, usado só no painel.">
              <input
                type="text"
                name="name"
                id="nome"
                required
                maxLength={200}
                placeholder="Ex.: Banner de lançamento"
                defaultValue={banner.name}
                className={INPUT_CLASS}
              />
            </Row>
          </Section>

          <Section title="Ação ao clicar" description="Defina o que acontece quando o aluno clicar no banner.">
            <Row label="Ao clicar no banner" tip="O banner inteiro vira um link." wide>
              <RadioCards
                name="banner-acao"
                value={actionType}
                options={ACTIONS}
                onChange={(v) => {
                  setActionType(v);
                  markDirty();
                }}
              />
            </Row>
            {actionType === "product" ? (
              <Row label="Produto" htmlFor="produto" tip="Produto aberto ao clicar.">
                <Combobox
                  id="produto"
                  name="productId"
                  required
                  defaultValue={banner.action.type === "product" ? String(banner.action.productId) : ""}
                  options={products.map((p) => ({ value: String(p.id), label: p.name }))}
                />
              </Row>
            ) : null}
            {actionType === "external" ? (
              <>
                <Row label="Endereço de destino" htmlFor="link_url" tip="Página aberta ao clicar.">
                  <input
                    type="url"
                    name="linkUrl"
                    id="link_url"
                    required
                    maxLength={2000}
                    placeholder="https://exemplo.com"
                    defaultValue={banner.action.type === "external" ? banner.action.url : ""}
                    className={INPUT_CLASS}
                  />
                </Row>
                <Row label="Abrir link em" tip="Na mesma janela ou numa nova aba do navegador.">
                  <OpenInSegmented
                    newTab={newTab}
                    onChange={(v) => {
                      setNewTab(v);
                      markDirty();
                    }}
                  />
                </Row>
              </>
            ) : null}
          </Section>

          <Section title="Imagens de fundo" description="Defina as imagens usadas em telas grandes e celulares.">
            <Row label="Imagem para desktop" tip="Exibida a partir de 768px de largura." hint="JPG de até 3 MB — 1920 × 1080 px — 16:9">
              <ImageUpload name="desktopImageUrl" kind="banner" defaultValue={banner.desktopImageUrl} boxClassName="w-48 h-28" onChange={markDirty} />
            </Row>
            <Row label="Imagem para celular" tip="Exibida em telas menores; sem ela, usa a de desktop." hint="JPG de até 3 MB — 600 × 1050 px — 4:7">
              <ImageUpload name="mobileImageUrl" kind="banner" defaultValue={banner.mobileImageUrl} boxClassName="w-28 h-48" onChange={markDirty} />
            </Row>
          </Section>

          {/* Vídeo de fundo: a área do aluno ainda não reproduz, então os campos ficam fora da tela
              (valores já salvos seguem no formulário para não se perderem). */}
          <input type="hidden" name="videoUrl" value={banner.videoUrl ?? ""} />
          <input type="hidden" name="mobileVideoUrl" value={banner.mobileVideoUrl ?? ""} />

          <Section title="Aparência" description="Ajuste o tamanho do banner e seu comportamento durante a reprodução do vídeo.">
            <Row label="Altura do banner" htmlFor="altura" tip="Em porcentagem da altura da tela (10 a 100). Vazio = 75%.">
              <div className="flex h-9 w-32 items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
                <input
                  id="altura"
                  name="heightPercent"
                  type="number"
                  min={10}
                  max={100}
                  step={1}
                  placeholder="75"
                  defaultValue={banner.heightPercent ?? ""}
                  className="min-w-0 flex-1 bg-transparent px-3 text-center text-hint text-gray-900 outline-none placeholder-gray-400"
                />
                <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-hint text-gray-500">%</span>
              </div>
            </Row>
          </Section>

          <SaveBar dirty={dirty} saved={saved} pending={pending} error={error} />
        </form>
      </DirtyContext.Provider>

      <Modal
        open={confirmTrash}
        onClose={() => setConfirmTrash(false)}
        title="Excluir banner?"
        description={`"${banner.name}" vai para a Lixeira e sai da área do aluno. Você pode restaurar depois.`}
      >
        <ModalFooter>
          <Button variant="outline" onClick={() => setConfirmTrash(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => run(trashBannerAction, { id: banner.id }, { onOk: () => router.push("/dashboard/content/banners") })}
          >
            <TrashIcon className="h-4 w-4" />
            Excluir
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
