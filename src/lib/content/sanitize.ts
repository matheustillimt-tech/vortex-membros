import sanitizeHtml from "sanitize-html";

const IFRAME_HOSTS = ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com", "player.vimeo.com"];

export function sanitizeLessonHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "ul", "ol", "li", "a", "strong", "b", "em", "i", "u", "s",
      "img", "blockquote", "code", "pre", "iframe", "mark", "figure", "figcaption",
      // Conteúdo antigo preservado como bloco HTML: tabelas, spans/divs. `style` continua fora
      // (cores fixas quebrariam a leitura no tema escuro da área do aluno).
      "span", "div", "sup", "sub", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "name"],
      img: ["src", "alt", "width", "height"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "title"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"], iframe: ["https"] },
    allowedIframeHostnames: IFRAME_HOSTS,
    allowedIframeDomains: ["pandavideo.com.br"],
    allowIframeRelativeUrls: false,
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.href && /^https?:\/\//i.test(attribs.href)) {
          return { tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } };
        }
        return { tagName, attribs };
      },
    },
  });
}
