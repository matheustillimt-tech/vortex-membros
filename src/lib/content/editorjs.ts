import sanitizeHtml from "sanitize-html";
import { sanitizeLessonHtml } from "./sanitize";
import { toEmbedUrl } from "./video";

/**
 * Conversão dos blocos do Editor.js em HTML da aula (`lessons.contentHtml`).
 * Roda sempre no servidor, a partir dos blocos: o HTML vindo do cliente nunca é usado.
 * O resultado ainda passa por `sanitizeLessonHtml` na exibição (defesa em profundidade).
 */

export type EditorBlock = { id?: string; type: string; data: Record<string, unknown> };
export type EditorData = { time?: number; version?: string; blocks: EditorBlock[] };

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa texto puro (para conteúdo e atributos). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/**
 * HTML inline do Editor.js (negrito, itálico, link, código, marcador, quebra de linha).
 * Só `<b><i><a href><code><mark><br>` sobrevivem; `<strong>/<em>` viram `<b>/<i>`. Links: http(s)
 * (abrem em nova aba), mailto:, tel: e caminhos relativos "/…" — os mesmos que o sanitizeLessonHtml aceita.
 * Todo o resto é removido (o texto fica, escapado); script/style somem inteiros.
 */
export function inlineHtml(value: unknown): string {
  return sanitizeHtml(str(value), {
    allowedTags: ["b", "i", "a", "code", "mark", "br"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      strong: "b",
      em: "i",
      a: (tagName, attribs): sanitizeHtml.Tag => {
        const href = (attribs.href ?? "").trim();
        if (/^https?:\/\/\S+$/i.test(href)) return { tagName, attribs: { href, target: "_blank", rel: "noopener noreferrer" } };
        if (/^(mailto|tel):\S+$/i.test(href) || /^\/(?!\/)\S*$/.test(href)) return { tagName, attribs: { href } };
        // javascript:, //host, #…: link some e o texto fica (exclusiveFilter → "excludeTag").
        // Não trocar o nome da tag aqui: o sanitize-html reaproveita a troca no fechamento das tags seguintes.
        return { tagName, attribs: {} as sanitizeHtml.Attributes };
      },
    },
    exclusiveFilter: (frame) => (frame.tag === "a" && !frame.attribs.href ? "excludeTag" : false),
  }).trim();
}

/** Texto puro (sem tags) escapado para uso em atributo (`alt`). */
function attrText(value: unknown): string {
  // sanitize-html já escapa & < > no texto; aspas também precisam sair escapadas no atributo.
  return sanitizeHtml(str(value), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** URL de imagem aceita: `/media/<id>` (upload do painel) ou https absoluto. */
function imageUrl(value: unknown): string | null {
  const v = str(value).trim();
  if (/^\/media\/\d{1,15}$/.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Embeds aceitos: YouTube, Vimeo e Panda Video (sempre via `toEmbedUrl`, sempre https). */
function embedSrc(data: Record<string, unknown>): string | null {
  for (const candidate of [data.source, data.embed]) {
    const e = toEmbedUrl(str(candidate));
    if (!e) continue;
    let u: URL;
    try {
      u = new URL(e.src);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase();
    const ok =
      u.protocol === "https:" &&
      (host === "www.youtube.com" ||
        host === "youtube.com" ||
        host === "www.youtube-nocookie.com" ||
        host === "player.vimeo.com" ||
        host === "pandavideo.com.br" ||
        host.endsWith(".pandavideo.com.br"));
    // youtube.com só na forma /embed/<id> (o toEmbedUrl devolve a página original quando não reconhece).
    if (ok && (!host.includes("youtube") || u.pathname.startsWith("/embed/"))) return u.toString();
  }
  return null;
}

type ListItem = { content: string; items: ListItem[] };

/** Aceita os formatos do @editorjs/list v1 (strings), nested-list e v2 ({ content, items, meta }). */
function listItems(value: unknown, depth = 0): ListItem[] {
  if (!Array.isArray(value) || depth > 10) return [];
  return value.flatMap((item): ListItem[] => {
    if (typeof item === "string") return [{ content: item, items: [] }];
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      return [{ content: str(o.content ?? o.text), items: listItems(o.items, depth + 1) }];
    }
    return [];
  });
}

function renderList(items: ListItem[], tag: "ul" | "ol"): string {
  if (items.length === 0) return "";
  const lis = items
    .map((it) => `<li>${inlineHtml(it.content)}${it.items.length ? renderList(it.items, tag) : ""}</li>`)
    .join("");
  return `<${tag}>${lis}</${tag}>`;
}

function renderBlock(block: EditorBlock): string {
  const data = block.data && typeof block.data === "object" ? block.data : {};
  switch (block.type) {
    case "paragraph": {
      const html = inlineHtml(data.text);
      return html ? `<p>${html}</p>` : "";
    }
    case "header": {
      const html = inlineHtml(data.text);
      if (!html) return "";
      const n = Math.trunc(Number(data.level));
      const level = Number.isFinite(n) ? Math.min(4, Math.max(2, n)) : 2;
      return `<h${level}>${html}</h${level}>`;
    }
    case "list": {
      const tag = data.style === "ordered" ? "ol" : "ul";
      return renderList(listItems(data.items), tag);
    }
    case "quote": {
      const text = inlineHtml(data.text);
      if (!text) return "";
      const caption = inlineHtml(data.caption);
      return `<blockquote><p>${text}</p>${caption ? `<p>— ${caption}</p>` : ""}</blockquote>`;
    }
    case "code": {
      const code = str(data.code);
      return code.trim() ? `<pre><code>${escapeHtml(code)}</code></pre>` : "";
    }
    case "delimiter":
      return "<hr>";
    case "image": {
      const file = data.file && typeof data.file === "object" ? (data.file as Record<string, unknown>) : {};
      const src = imageUrl(file.url ?? data.url);
      if (!src) return "";
      const caption = inlineHtml(data.caption);
      const img = `<img src="${escapeHtml(src)}" alt="${attrText(data.caption)}">`;
      return `<figure>${img}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
    }
    case "embed": {
      const src = embedSrc(data);
      if (!src) return "";
      const caption = inlineHtml(data.caption);
      const iframe = `<iframe src="${escapeHtml(src)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="" frameborder="0"></iframe>`;
      return caption ? `<figure>${iframe}<figcaption>${caption}</figcaption></figure>` : iframe;
    }
    case "raw": {
      // HTML preservado (conteúdo antigo ou bloco HTML): mesmo sanitizador da área do aluno.
      return sanitizeLessonHtml(str(data.html)).trim();
    }
    default:
      return ""; // bloco desconhecido: ignorado
  }
}

/** Blocos → HTML. Entrada inválida (não-objeto, sem `blocks`) → "". */
export function blocksToHtml(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const blocks = (data as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b): b is EditorBlock => !!b && typeof b === "object" && typeof (b as EditorBlock).type === "string")
    .map(renderBlock)
    .filter(Boolean)
    .join("\n");
}

/** Valida o JSON recebido do editor: objeto com `blocks` (array, até 2000 blocos). */
export function parseEditorData(raw: string): EditorData | null {
  if (raw.length > 2_000_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const blocks = (parsed as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks) || blocks.length > 2000) return null;
  const clean = blocks
    .filter(
      (b): b is EditorBlock =>
        !!b && typeof b === "object" && typeof (b as EditorBlock).type === "string" && !!(b as EditorBlock).data && typeof (b as EditorBlock).data === "object",
    )
    .map(cleanBlockText);
  return { ...(parsed as EditorData), blocks: clean };
}

/** Blocos guardados no banco (podem ser de antes da limpeza no save) prontos para voltar ao editor. */
export function cleanStoredBlocks(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as { blocks?: unknown }).blocks)) return value;
  const data = value as EditorData;
  return {
    ...data,
    blocks: data.blocks
      .filter((b): b is EditorBlock => !!b && typeof b === "object" && typeof b.type === "string" && !!b.data && typeof b.data === "object")
      .map(cleanBlockText),
  };
}

/** Lista com o texto de cada item limpo (strings ou { content|text, items }), mesma forma. */
function cleanListItems(value: unknown, depth = 0): unknown {
  if (!Array.isArray(value) || depth > 10) return [];
  return value.map((item) => {
    if (typeof item === "string") return inlineHtml(item);
    if (item && typeof item === "object") {
      const o = { ...(item as Record<string, unknown>) };
      if ("content" in o) o.content = inlineHtml(o.content);
      if ("text" in o) o.text = inlineHtml(o.text);
      if ("items" in o) o.items = cleanListItems(o.items, depth + 1);
      return o;
    }
    return item;
  });
}

/**
 * O JSON dos blocos é guardado e volta para o Editor.js (que monta o texto com innerHTML no navegador
 * do admin): os campos de texto com marcação saem pelo mesmo `inlineHtml` da renderização.
 */
function cleanBlockText(block: EditorBlock): EditorBlock {
  const data = { ...(block.data as Record<string, unknown>) };
  for (const k of ["text", "caption"]) if (typeof data[k] === "string") data[k] = inlineHtml(data[k]);
  if (block.type === "list" && "items" in data) data.items = cleanListItems(data.items);
  return { ...block, data };
}
