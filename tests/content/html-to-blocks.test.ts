// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { blocksToHtml } from "@/lib/content/editorjs";
import { htmlToBlocks } from "@/lib/content/html-to-blocks";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";

/** O que o aluno vê, normalizado: strong/em ≡ b/i, sem espaço entre tags, iframe só pelo src. */
function seen(html: string): string {
  return sanitizeLessonHtml(html)
    .replace(/<(\/?)strong>/g, "<$1b>")
    .replace(/<(\/?)em>/g, "<$1i>")
    .replace(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/g, '<iframe src="$1"></iframe>')
    .replace(/>\s+</g, "><")
    .trim();
}
const roundTrip = (html: string) => blocksToHtml(htmlToBlocks(html));

const SEED = [
  "<p>Nesta aula de <strong>X</strong> você vai.</p>",
  "<h3>Prompt</h3>",
  "<pre><code>Aja como &lt;especialista&gt;</code></pre>",
  "<ul><li>a<ul><li>a.1</li></ul></li><li>b</li></ul>",
  "<hr>",
  '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
].join("\n");

const EXTERNAL_HTML = [
  '<h1>Bem-vindo à <u>aula</u></h1>',
  '<p>Texto com <span style="color:#ff7500">destaque</span> e <a href="https://ex.com/a?b=1&amp;c=2">link</a>, <a href="mailto:suporte@ex.com">e-mail</a>, <a href="#topo">âncora</a>.</p>',
  '<p>Imagem no meio <img src="/uploads/x.png" alt="x"> do texto.</p>',
  "<table><thead><tr><th>Plano</th><th>Preço</th></tr></thead><tbody><tr><td>Básico</td><td colspan=\"1\">R$ 10</td></tr></tbody></table>",
  '<div style="text-align:center"><p>Centralizado</p></div>',
  '<iframe src="https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=abc-123" width="720" height="360" allowfullscreen></iframe>',
  '<iframe src="https://evil.com/x"></iframe>',
  "<ol><li>um<ul><li>sub A</li></ul><ul><li>sub B</li></ul></li><li>dois</li></ol>",
  "<blockquote><p>Citação</p><p>Autor</p></blockquote>",
  '<figure><img src="https://cdn.ex.com/a.png" alt="foto"><figcaption>Legenda <b>forte</b></figcaption></figure>',
  "<h5>Pequeno</h5>",
  "<p><s>riscado</s> e <sup>2</sup></p>",
  "texto solto & <solto>",
].join("\n");

test("seed: vira blocos editáveis e o aluno vê o mesmo", () => {
  const data = htmlToBlocks(SEED);
  expect(data.blocks.map((b) => b.type)).toEqual(["paragraph", "header", "code", "list", "delimiter", "embed"]);
  expect(data.blocks[2].data.code).toBe("Aja como <especialista>");
  expect(seen(roundTrip(SEED))).toBe(seen(SEED));
});

test("aula com HTML externo (tabela, span com estilo, iframe Panda, links): nada se perde", () => {
  const data = htmlToBlocks(EXTERNAL_HTML);
  const raws = data.blocks.filter((b) => b.type === "raw").map((b) => String(b.data.html));
  // o que não tem bloco equivalente fica com o HTML original, byte a byte
  for (const piece of [
    '<h1>Bem-vindo à <u>aula</u></h1>',
    '<span style="color:#ff7500">destaque</span>',
    '<a href="#topo">âncora</a>',
    '<img src="/uploads/x.png" alt="x">',
    "<table>",
    '<div style="text-align:center">',
    '<iframe src="https://evil.com/x"></iframe>',
    "<ul><li>sub B</li></ul>",
    "<blockquote><p>Citação</p><p>Autor</p></blockquote>",
    "<figcaption>Legenda <b>forte</b></figcaption>",
    "<h5>Pequeno</h5>",
    "<s>riscado</s>",
  ])
    expect(raws.join("\n")).toContain(piece);
  expect(data.blocks.find((b) => b.type === "embed")?.data.source).toBe("https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=abc-123");

  // o HTML gerado no servidor mostra ao aluno exatamente o que o HTML original mostrava
  expect(seen(roundTrip(EXTERNAL_HTML))).toBe(seen(EXTERNAL_HTML));
  const out = roundTrip(EXTERNAL_HTML);
  for (const t of ["<table>", "<th>Plano</th>", "<u>aula</u>", 'href="mailto:suporte@ex.com"', "pandavideo.com.br/embed/?v=abc-123", "sub A", "sub B", "texto solto &amp;"])
    expect(out).toContain(t);
});

test("HTML não vazio nunca vira conteúdo vazio", () => {
  for (const html of ["<!-- só comentário -->", "<script>x()</script>", "<br>"]) {
    const data = htmlToBlocks(html);
    expect(data.blocks.length).toBeGreaterThan(0);
    expect(seen(blocksToHtml(data))).toBe(seen(html));
  }
  expect(htmlToBlocks("   ").blocks).toEqual([]);
  expect(htmlToBlocks("a < b & c").blocks).toEqual([{ type: "raw", data: { html: "a &lt; b &amp; c" } }]);
});

test("inline com atributo (ex.: onmouseover) não vira parágrafo editável: vai para raw", () => {
  const blocks = htmlToBlocks('<p><b onmouseover="alert(1)">x</b></p>').blocks;
  expect(blocks).toHaveLength(1);
  expect(blocks[0].type).toBe("raw");
  expect(roundTrip('<p><b onmouseover="alert(1)">x</b></p>')).not.toMatch(/onmouseover/);
});
