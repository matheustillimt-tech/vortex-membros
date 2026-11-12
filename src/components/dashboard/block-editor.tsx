"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type EditorJS from "@editorjs/editorjs";
import type { OutputData } from "@editorjs/editorjs";
import { uploadImageAction } from "@/app/dashboard/media-actions";
import type { EditorData } from "@/lib/content/editorjs";
import { htmlToBlocks } from "@/lib/content/html-to-blocks";
import { RawHtmlTool } from "./raw-html-tool";

export type BlockEditorHandle = {
  /**
   * Dados atuais do editor **só se o corpo foi editado** desde que abriu; senão null (e o conteúdo
   * não deve ser enviado: título/resumo/etc. salvam sem tocar no `contentHtml`). Também null se o
   * editor não carregou.
   */
  save: () => Promise<EditorData | null>;
  /**
   * Avisa que estes dados (devolvidos por `save`) foram gravados: passam a ser a referência de
   * "intacto". Sem isso, apagar o que foi salvo e voltar ao texto de quando abriu não seria enviado.
   */
  markSaved: (data: EditorData) => void;
};

/** Forma comparável dos blocos (sem ids nem time/version). */
function snapshotOf(out: Pick<OutputData, "blocks">): string {
  return JSON.stringify(out.blocks.map((b) => ({ type: b.type, data: b.data })));
}

function toData(out: OutputData): EditorData {
  return { time: out.time, version: out.version, blocks: out.blocks.map((b) => ({ id: b.id, type: b.type, data: b.data })) };
}

/** Pt-BR dos nomes de blocos e da interface do Editor.js. */
const I18N = {
  messages: {
    ui: {
      blockTunes: { toggler: { "Click to tune": "Clique para ajustar", "or drag to move": "ou arraste para mover" } },
      inlineToolbar: { converter: { "Convert to": "Converter em" } },
      toolbar: { toolbox: { Add: "Adicionar" } },
      popover: { Filter: "Filtrar", "Nothing found": "Nada encontrado" },
    },
    toolNames: {
      Text: "Texto",
      Heading: "Título",
      "Unordered List": "Lista",
      "Ordered List": "Lista numerada",
      Checklist: "Lista de tarefas",
      Quote: "Citação",
      Code: "Código",
      Delimiter: "Divisor",
      Image: "Imagem",
      Link: "Link",
      Bold: "Negrito",
      Italic: "Itálico",
      Marker: "Marcador",
      InlineCode: "Código",
      HTML: "HTML",
    },
    tools: {
      header: { "Heading 2": "Título 2", "Heading 3": "Título 3", "Heading 4": "Título 4" },
      list: { Unordered: "Lista", Ordered: "Numerada" },
      quote: { "Enter a quote": "Citação", "Enter a caption": "Autor" },
      image: { Caption: "Legenda", "Select an Image": "Selecionar imagem", "With border": "Com borda", "Stretch image": "Esticar", "With background": "Com fundo" },
      link: { "Add a link": "Cole um link" },
    },
    blockTunes: {
      delete: { Delete: "Excluir", "Click to delete": "Clique para confirmar" },
      moveUp: { "Move up": "Mover para cima" },
      moveDown: { "Move down": "Mover para baixo" },
    },
  },
};

/**
 * Editor de blocos (Editor.js, carregado só no navegador). Imagens sobem pelo mesmo caminho do
 * painel (uploadImageAction: admin + saveMedia, 2 MB). Aula antiga sem blocos → HTML convertido.
 */
export const BlockEditor = forwardRef<
  BlockEditorHandle,
  { initialBlocks: unknown; initialHtml: string; placeholder: string; onChange: () => void }
>(function BlockEditor({ initialBlocks, initialHtml, placeholder, onChange }, ref) {
  const holder = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorJS | null>(null);
  const snapshot = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const initial = useRef({ initialBlocks, initialHtml, onChange });
  // Último conteúdo do editor. A tela escondida pelo Next (voltar/avançar do navegador) desmonta
  // o Editor.js; ao reaparecer ele recomeça daqui, e não do texto de quando a aula abriu.
  const latest = useRef<OutputData | null>(null);
  useEffect(() => {
    initial.current.onChange = onChange;
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    async save() {
      if (!editor.current || !ready || snapshot.current === null) return null;
      const out = await editor.current.save();
      latest.current = out;
      if (snapshotOf(out) === snapshot.current) return null; // corpo intacto
      return toData(out);
    },
    markSaved(data) {
      if (snapshot.current !== null) snapshot.current = snapshotOf(data as Pick<OutputData, "blocks">);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let instance: EditorJS | null = null;
    (async () => {
      try {
        const [
          { default: Editor },
          { default: Header },
          { default: List },
          { default: Quote },
          { default: Code },
          { default: Delimiter },
          { default: ImageTool },
          { default: Embed },
          { default: Marker },
          { default: InlineCode },
        ] = await Promise.all([
          import("@editorjs/editorjs"),
          import("@editorjs/header"),
          import("@editorjs/list"),
          import("@editorjs/quote"),
          import("@editorjs/code"),
          import("@editorjs/delimiter"),
          import("@editorjs/image"),
          import("@editorjs/embed"),
          import("@editorjs/marker"),
          import("@editorjs/inline-code"),
        ]);
        if (cancelled || !holder.current) return;
        const { initialBlocks: blocks, initialHtml: html } = initial.current;
        const data: OutputData = latest.current
          ? latest.current
          : blocks && typeof blocks === "object" && Array.isArray((blocks as OutputData).blocks)
            ? (blocks as OutputData)
            : html.trim()
              ? (htmlToBlocks(html) as OutputData)
              : { blocks: [] };

        instance = new Editor({
          holder: holder.current,
          data,
          placeholder,
          minHeight: 120,
          i18n: I18N,
          inlineToolbar: ["bold", "italic", "link", "marker", "inlineCode"],
          tools: {
            header: { class: Header as never, config: { levels: [2, 3, 4], defaultLevel: 2 } },
            list: { class: List as never, inlineToolbar: true, config: { defaultStyle: "unordered" } },
            quote: { class: Quote as never, inlineToolbar: true },
            code: Code as never,
            delimiter: Delimiter as never,
            marker: Marker,
            inlineCode: InlineCode as never,
            image: {
              class: ImageTool as never,
              config: {
                types: "image/jpeg,image/png,image/webp,image/gif",
                captionPlaceholder: "Legenda",
                buttonContent: "Selecionar imagem",
                uploader: {
                  async uploadByFile(file: File) {
                    const fd = new FormData();
                    fd.set("file", file);
                    fd.set("kind", "image");
                    const res = await uploadImageAction(fd);
                    if (!res.ok) {
                      window.alert(res.error);
                      return { success: 0, file: { url: "" } };
                    }
                    return { success: 1, file: { url: res.url } };
                  },
                  async uploadByUrl(url: string) {
                    // Link de imagem colado: aceito se http(s); o servidor valida de novo ao gerar o HTML.
                    return /^https?:\/\//i.test(url) ? { success: 1, file: { url } } : { success: 0, file: { url: "" } };
                  },
                },
              },
            },
            raw: RawHtmlTool as never,
            embed: {
              class: Embed as never,
              inlineToolbar: true,
              config: {
                services: {
                  youtube: true,
                  vimeo: true,
                  pandavideo: {
                    regex: /https?:\/\/(player-[\w-]+\.tv\.pandavideo\.com\.br\/embed\/\?v=[\w-]+)/,
                    embedUrl: "https://<%= remote_id %>",
                    html: '<iframe style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen></iframe>',
                    height: 320,
                    width: 580,
                  },
                },
              },
            },
          },
          // Eventos de mudança só contam depois da foto inicial (o Editor.js pode disparar ao montar).
          onChange: () => {
            const ed = instance;
            if (!ed || editor.current !== ed) return;
            void ed.save().then((out) => {
              if (editor.current === ed) latest.current = out;
            });
            initial.current.onChange();
          },
        });
        await instance.isReady;
        if (cancelled) {
          instance.destroy();
          return;
        }
        // A referência de "intacto" é o texto gravado: só na primeira abertura (ou depois de salvar).
        if (snapshot.current === null) snapshot.current = snapshotOf(await instance.save());
        editor.current = instance;
        setReady(true);
      } catch (e) {
        console.error("[editor] falhou ao carregar:", e);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      editor.current = null;
      setReady(false);
      if (instance && typeof instance.destroy === "function") {
        try {
          instance.destroy();
        } catch {
          // já destruído
        }
      }
    };
  }, [placeholder]);

  return (
    <div data-rich-editor="">
      <div
        className="editorjs-holder min-h-[260px] rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900"
        style={{ "--editor-link": "#f06e00", "--editor-link-dark": "#ff7500" } as React.CSSProperties}
      >
        <div ref={holder} />
        {!ready && !failed ? <p className="py-2 text-hint text-gray-400">Carregando editor…</p> : null}
        {failed ? (
          <p role="alert" className="py-2 text-hint text-red-600">
            Não foi possível carregar o editor. Recarregue a página.
          </p>
        ) : null}
      </div>
    </div>
  );
});
