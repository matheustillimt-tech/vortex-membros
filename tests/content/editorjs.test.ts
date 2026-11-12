import { expect, test } from "vitest";
import { blocksToHtml, parseEditorData } from "@/lib/content/editorjs";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";

const b = (type: string, data: Record<string, unknown>) => ({ blocks: [{ type, data }] });

test("parágrafo com inline permitido; strong/em viram b/i", () => {
  expect(blocksToHtml(b("paragraph", { text: 'Olá <b>mundo</b> <strong>forte</strong> <em>x</em> <i>y</i> <code class="inline-code">c</code> <mark class="cdx-marker">m</mark><br>fim' }))).toBe(
    "<p>Olá <b>mundo</b> <b>forte</b> <i>x</i> <i>y</i> <code>c</code> <mark>m</mark><br />fim</p>",
  );
  expect(blocksToHtml(b("paragraph", { text: "   " }))).toBe("");
});

test("links: http(s) em nova aba; mailto/tel/relativo mantidos; javascript:, //host e # viram texto", () => {
  expect(blocksToHtml(b("paragraph", { text: '<a href="https://x.com/a?b=1&amp;c=2" onclick="evil()">site</a>' }))).toBe(
    '<p><a href="https://x.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">site</a></p>',
  );
  expect(
    blocksToHtml(b("paragraph", { text: '<a href="mailto:a@b.com">m</a> <a href="tel:+5511">t</a> <a href="/area/vitrine/home">r</a>' })),
  ).toBe('<p><a href="mailto:a@b.com">m</a> <a href="tel:+5511">t</a> <a href="/area/vitrine/home">r</a></p>');
  expect(
    blocksToHtml(b("paragraph", { text: '<a href="javascript:alert(1)">x</a> <a href="//evil.com">y</a> <a href="#topo">z</a> <a href=" JaVaScRiPt:x">w</a> <a href="/ok">k</a>' })),
  ).toBe('<p>x y z w <a href="/ok">k</a></p>');
});

test("script, onerror e tags estranhas: texto escapado, nada executável", () => {
  // O Editor.js guarda o que o usuário digitou como entidades: continuam escapadas.
  const typed = blocksToHtml(b("paragraph", { text: "&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt;" }));
  expect(typed).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt;</p>");
  // HTML cru forjado no JSON: removido.
  const forged = blocksToHtml({
    blocks: [
      { type: "paragraph", data: { text: '<script>alert(1)</script>ok<img src=x onerror="alert(1)"><iframe src="https://evil"></iframe><b onmouseover="x">b</b>' } },
      { type: "header", data: { text: "<style>*{}</style>T<svg onload=alert(1)>", level: 2 } },
    ],
  });
  expect(forged).toBe("<p>ok<b>b</b></p>\n<h2>T</h2>");
  expect(forged).not.toMatch(/<script|onerror|onload|onmouseover|<iframe|<img|<svg|<style/i);
});

test("header: h2–h4 (fora da faixa é ajustado)", () => {
  expect(blocksToHtml(b("header", { text: "A", level: 2 }))).toBe("<h2>A</h2>");
  expect(blocksToHtml(b("header", { text: "A", level: 3 }))).toBe("<h3>A</h3>");
  expect(blocksToHtml(b("header", { text: "A", level: 4 }))).toBe("<h4>A</h4>");
  expect(blocksToHtml(b("header", { text: "A", level: 1 }))).toBe("<h2>A</h2>");
  expect(blocksToHtml(b("header", { text: "A", level: 6 }))).toBe("<h4>A</h4>");
  expect(blocksToHtml(b("header", { text: "A", level: "x" }))).toBe("<h2>A</h2>");
});

test("listas: ordenada/não ordenada, formatos v1 e v2, aninhada", () => {
  expect(blocksToHtml(b("list", { style: "unordered", items: ["um", "<b>dois</b>"] }))).toBe("<ul><li>um</li><li><b>dois</b></li></ul>");
  expect(
    blocksToHtml(
      b("list", {
        style: "ordered",
        meta: {},
        items: [
          { content: "a", meta: {}, items: [{ content: "a.1", meta: {}, items: [{ content: "a.1.i", items: [] }] }] },
          { content: "b<script>x</script>", meta: {}, items: [] },
        ],
      }),
    ),
  ).toBe("<ol><li>a<ol><li>a.1<ol><li>a.1.i</li></ol></li></ol></li><li>b</li></ol>");
  expect(blocksToHtml(b("list", { style: "unordered", items: [] }))).toBe("");
});

test("citação, código e delimitador", () => {
  expect(blocksToHtml(b("quote", { text: "Frase <i>boa</i>", caption: "Autor" }))).toBe("<blockquote><p>Frase <i>boa</i></p><p>— Autor</p></blockquote>");
  expect(blocksToHtml(b("quote", { text: "Só", caption: "" }))).toBe("<blockquote><p>Só</p></blockquote>");
  expect(blocksToHtml(b("code", { code: 'const a = "<b>" && 1 < 2;\n<script>' }))).toBe(
    "<pre><code>const a = &quot;&lt;b&gt;&quot; &amp;&amp; 1 &lt; 2;\n&lt;script&gt;</code></pre>",
  );
  expect(blocksToHtml(b("delimiter", {}))).toBe("<hr>");
});

test("imagem: /media/<id> ou http(s); outros esquemas descartados; alt escapado", () => {
  expect(blocksToHtml(b("image", { file: { url: "/media/900000001" }, caption: 'Foto "x" <b>1</b>' }))).toBe(
    '<figure><img src="/media/900000001" alt="Foto &quot;x&quot; 1"><figcaption>Foto "x" <b>1</b></figcaption></figure>',
  );
  expect(blocksToHtml(b("image", { file: { url: "https://cdn.x.com/a.png?x=1&y=2" }, caption: "" }))).toBe(
    '<figure><img src="https://cdn.x.com/a.png?x=1&amp;y=2" alt=""></figure>',
  );
  for (const url of ["javascript:alert(1)", "data:image/png;base64,AAAA", "/media/abc", "//evil.com/x.png", '" onerror="x'])
    expect(blocksToHtml(b("image", { file: { url } }))).toBe("");
});

test("embed: só YouTube/Vimeo/Panda via toEmbedUrl; domínio estranho descartado", () => {
  expect(blocksToHtml(b("embed", { service: "youtube", source: "https://www.youtube.com/watch?v=abc_123", embed: "https://www.youtube.com/embed/abc_123" }))).toBe(
    '<iframe src="https://www.youtube.com/embed/abc_123" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="" frameborder="0"></iframe>',
  );
  expect(blocksToHtml(b("embed", { source: "https://vimeo.com/12345" }))).toContain('src="https://player.vimeo.com/video/12345"');
  expect(blocksToHtml(b("embed", { source: "https://player-vz-1.tv.pandavideo.com.br/embed/?v=abc" }))).toContain(
    'src="https://player-vz-1.tv.pandavideo.com.br/embed/?v=abc"',
  );
  for (const source of ["https://evil.com/embed", "javascript:alert(1)", "http://player.vimeo.com/video/1", "https://www.youtube.com/channel/x", "https://pandavideo.com.br.evil.com/x"])
    expect(blocksToHtml(b("embed", { source, embed: source }))).toBe("");
});

test("bloco desconhecido e entrada inválida são ignorados", () => {
  expect(blocksToHtml({ blocks: [{ type: "raw", data: { html: "<script>x</script>" } }, { type: "paragraph", data: { text: "ok" } }] })).toBe("<p>ok</p>");
  expect(blocksToHtml(null)).toBe("");
  expect(blocksToHtml({})).toBe("");
  expect(blocksToHtml({ blocks: [null, 1, { data: {} }] })).toBe("");
});

test("o HTML gerado sobrevive ao sanitizeLessonHtml da área do aluno", () => {
  const html = blocksToHtml({
    blocks: [
      { type: "header", data: { text: "Título", level: 2 } },
      { type: "paragraph", data: { text: 'a <mark>m</mark> <a href="https://x.com">l</a>' } },
      { type: "image", data: { file: { url: "/media/900000001" }, caption: "c" } },
      { type: "embed", data: { source: "https://youtu.be/abc" } },
      { type: "code", data: { code: "prompt" } },
    ],
  });
  const safe = sanitizeLessonHtml(html);
  expect(safe).toContain("<h2>Título</h2>");
  expect(safe).toContain("<mark>m</mark>");
  expect(safe).toContain('<img src="/media/900000001" alt="c" />');
  expect(safe).toContain("<figcaption>c</figcaption>");
  expect(safe).toContain('src="https://www.youtube.com/embed/abc"');
  expect(safe).toContain("<pre><code>prompt</code></pre>");
});

test("parseEditorData: JSON válido com blocks; resto → null", () => {
  expect(parseEditorData('{"time":1,"blocks":[{"type":"paragraph","data":{"text":"a"}},{"type":1}]}')).toEqual({
    time: 1,
    blocks: [{ type: "paragraph", data: { text: "a" } }],
  });
  expect(parseEditorData("nope")).toBeNull();
  expect(parseEditorData('{"blocks":"x"}')).toBeNull();
  expect(parseEditorData("[]")).toBeNull();
});

test("bloco raw (HTML preservado) passa pelo sanitizeLessonHtml", () => {
  expect(blocksToHtml(b("raw", { html: '<table><tr><td onclick="x">a</td></tr></table><script>alert(1)</script><span style="color:red">s</span>' }))).toBe(
    "<table><tr><td>a</td></tr></table><span>s</span>",
  );
  expect(blocksToHtml(b("raw", { html: "" }))).toBe("");
});

test("parseEditorData limpa o texto dos blocos (volta ao editor por innerHTML)", () => {
  const raw = JSON.stringify({
    blocks: [
      { type: "paragraph", data: { text: '<b onmouseover="x()">a</b><img src=x onerror=y()>' } },
      { type: "list", data: { style: "unordered", items: [{ content: "<i onclick=z()>c</i>", items: ["<script>1</script>d"] }] } },
      { type: "raw", data: { html: "<table><tr><td>t</td></tr></table>" } },
    ],
  });
  const data = parseEditorData(raw)!;
  expect(data.blocks[0].data.text).toBe("<b>a</b>");
  expect(JSON.stringify(data.blocks[1].data.items)).not.toMatch(/onclick|script/);
  expect(data.blocks[2].data.html).toBe("<table><tr><td>t</td></tr></table>"); // raw é sanitizado na renderização
});
