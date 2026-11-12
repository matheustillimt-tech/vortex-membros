import type { BlockTool, BlockToolConstructorOptions } from "@editorjs/editorjs";

type RawData = { html: string };

/**
 * Bloco "HTML" mínimo para o Editor.js: guarda HTML como texto (textarea). É onde fica o conteúdo
 * antigo que não tem bloco equivalente (tabelas, estilos…). Na exibição o servidor passa esse HTML
 * pelo `sanitizeLessonHtml`, como qualquer conteúdo de aula.
 */
export class RawHtmlTool implements BlockTool {
  private data: RawData;
  private textarea: HTMLTextAreaElement | null = null;
  private readOnly: boolean;

  static get toolbox() {
    return {
      title: "HTML",
      icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>',
    };
  }
  static get isReadOnlySupported() {
    return true;
  }
  static get enableLineBreaks() {
    return true;
  }

  constructor({ data, readOnly }: BlockToolConstructorOptions<RawData>) {
    this.data = { html: typeof data?.html === "string" ? data.html : "" };
    this.readOnly = readOnly;
  }

  render(): HTMLElement {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.textContent = "HTML";
    label.className = "mb-1 text-label font-semibold uppercase tracking-wider text-gray-400";
    const ta = document.createElement("textarea");
    ta.value = this.data.html;
    ta.readOnly = this.readOnly;
    ta.spellcheck = false;
    ta.rows = Math.min(16, Math.max(3, this.data.html.split("\n").length + 1));
    ta.placeholder = "<p>HTML…</p>";
    ta.className =
      "w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15";
    this.textarea = ta;
    wrap.append(label, ta);
    return wrap;
  }

  save(): RawData {
    return { html: this.textarea ? this.textarea.value : this.data.html };
  }
}
