import type { EditorBlock, EditorData } from "./editorjs";

/**
 * Aulas antigas (importadas ou do seed) têm só `contentHtml`. Para abri-las no editor, o HTML vira
 * blocos do Editor.js no navegador (<template>, inerte). Regra: **nada se perde**. Só vira bloco editável o que
 * `blocksToHtml` reproduz igual; todo o resto (tabelas, estilos, spans, u/s, h1/h5/h6, imagem no meio
 * do texto, iframes fora da lista, links `#`…) vira um bloco `raw` com o HTML original daquele elemento,
 * que o servidor renderiza com `sanitizeLessonHtml`. Não é fronteira de segurança: ao salvar, o servidor
 * gera o HTML de novo a partir dos blocos.
 */

const INLINE_TAGS = new Set(["B", "STRONG", "I", "EM", "A", "CODE", "MARK", "BR"]);

/** Mesmo critério de `inlineHtml`: http(s) absoluto, mailto:, tel: ou caminho relativo "/…". */
export function isInlineHref(href: string): boolean {
  const h = href.trim();
  return /^https?:\/\/[^\s]+$/i.test(h) || /^(mailto|tel):[^\s]+$/i.test(h) || /^\/(?!\/)[^\s]*$/.test(h);
}

/** O conteúdo do elemento é só texto + inline que o editor reproduz sem perda? */
function inlineOnly(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (!INLINE_TAGS.has(child.tagName)) return false;
    if (child.hasAttribute("style")) return false;
    if (child.tagName === "A") {
      const href = child.getAttribute("href");
      if (!href || !isInlineHref(href) || !onlyAttrs(child, ["href", "target", "rel"])) return false;
    } else if (!onlyAttrs(child, [])) {
      // <b onmouseover=…>: o Editor.js monta o texto com innerHTML; com atributo, vira `raw` (sanitizado).
      return false;
    }
    if (!inlineOnly(child)) return false;
  }
  return true;
}

/** Atributos que não mudam o que o aluno vê (o sanitizador remove os demais ou o editor os recria). */
function onlyAttrs(el: Element, allowed: string[]): boolean {
  return Array.from(el.attributes).every((a) => allowed.includes(a.name.toLowerCase()));
}

type ListItem = { content: string; meta: object; items: ListItem[] };

/**
 * Lista que o editor reproduz igual: cada <li> é inline e tem no máximo uma sublista, do mesmo tipo
 * da lista raiz e no fim do <li>. Qualquer outra forma → null (vira `raw`).
 */
function listItems(list: Element, rootTag: string): ListItem[] | null {
  if (!onlyAttrs(list, [])) return null;
  const items: ListItem[] = [];
  for (const li of Array.from(list.children)) {
    if (li.tagName !== "LI" || !onlyAttrs(li, [])) return null;
    const subs = Array.from(li.children).filter((c) => c.tagName === "UL" || c.tagName === "OL");
    if (subs.length > 1) return null;
    const sub = subs[0];
    if (sub && (sub.tagName !== rootTag || li.lastElementChild !== sub || (sub.nextSibling?.textContent ?? "").trim())) return null;
    const clone = li.cloneNode(true) as Element;
    if (sub) clone.removeChild(clone.lastElementChild!);
    if (!inlineOnly(clone)) return null;
    const nested = sub ? listItems(sub, rootTag) : [];
    if (nested === null) return null;
    items.push({ content: clone.innerHTML.trim(), meta: {}, items: nested });
  }
  return items;
}

const EMBED_ATTRS = ["src", "allow", "allowfullscreen", "frameborder", "width", "height", "title"];

export function htmlToBlocks(html: string, doc: Document = document): EditorData {
  // <template> é inerte: nada carrega (img/iframe) nem executa enquanto analisamos.
  const template = doc.createElement("template");
  template.innerHTML = html;
  const blocks: EditorBlock[] = [];
  const raw = (el: Element) => blocks.push({ type: "raw", data: { html: el.outerHTML } });

  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType === 3) {
      // Texto solto fora de <p>: fica como está (bloco HTML com o texto escapado), sem ganhar um <p>.
      const text = node.textContent ?? "";
      if (text.trim()) blocks.push({ type: "raw", data: { html: text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!) } });
      continue;
    }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    const tag = el.tagName;

    if (tag === "P" && onlyAttrs(el, []) && inlineOnly(el)) {
      if (el.innerHTML.trim()) blocks.push({ type: "paragraph", data: { text: el.innerHTML.trim() } });
    } else if (/^H[234]$/.test(tag) && onlyAttrs(el, []) && inlineOnly(el) && el.innerHTML.trim()) {
      blocks.push({ type: "header", data: { text: el.innerHTML.trim(), level: Number(tag[1]) } });
    } else if (tag === "UL" || tag === "OL") {
      const items = listItems(el, tag);
      if (items && items.length) blocks.push({ type: "list", data: { style: tag === "OL" ? "ordered" : "unordered", meta: {}, items } });
      else raw(el);
    } else if (
      tag === "PRE" &&
      onlyAttrs(el, []) &&
      (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild!.tagName === "CODE" && onlyAttrs(el.firstElementChild!, []) && el.firstElementChild!.children.length === 0 && el.childNodes.length === 1))
    ) {
      blocks.push({ type: "code", data: { code: el.textContent ?? "" } });
    } else if (tag === "HR" && onlyAttrs(el, [])) {
      blocks.push({ type: "delimiter", data: {} });
    } else if (tag === "IFRAME" && onlyAttrs(el, EMBED_ATTRS) && isCanonicalEmbed(el.getAttribute("src") ?? "")) {
      const src = el.getAttribute("src")!;
      blocks.push({ type: "embed", data: { service: "custom", source: src, embed: src, width: 580, height: 320, caption: "" } });
    } else {
      raw(el); // tabelas, div, figure, blockquote, imagens, spans, h1/h5/h6, estilos…: HTML original
    }
  }

  // Nunca transformar HTML não vazio em conteúdo vazio.
  if (blocks.length === 0 && html.trim()) blocks.push({ type: "raw", data: { html } });
  return { blocks };
}

/** Iframe que o bloco embed reproduz igual (mesmo src que o servidor geraria). */
function isCanonicalEmbed(src: string): boolean {
  return (
    /^https:\/\/www\.youtube\.com\/embed\/[\w-]+$/.test(src) ||
    /^https:\/\/player\.vimeo\.com\/video\/\d+$/.test(src) ||
    /^https:\/\/([\w-]+\.)*pandavideo\.com\.br\/[^\s"'<>]*$/.test(src)
  );
}
