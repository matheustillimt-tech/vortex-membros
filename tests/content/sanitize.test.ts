import { expect, test } from "vitest";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";

test("remove script e onclick e mantém link com target _blank", () => {
  const out = sanitizeLessonHtml('<p onclick="x()">Prompt <a href="https://a.com">aqui</a></p><script>alert(1)</script>');
  expect(out).not.toContain("script");
  expect(out).not.toContain("onclick");
  expect(out).toContain('target="_blank"');
  expect(out).toContain('rel="noopener noreferrer"');
});

test("mantém iframe do Panda/YouTube/Vimeo e remove iframe de outro domínio", () => {
  const panda = '<iframe src="https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=1"></iframe>';
  const yt = '<iframe src="https://www.youtube.com/embed/abc"></iframe>';
  const vimeo = '<iframe src="https://player.vimeo.com/video/1"></iframe>';
  const evil = '<iframe src="https://evil.com/x"></iframe>';
  const out = sanitizeLessonHtml(panda + yt + vimeo + evil);
  expect(out).toContain("pandavideo.com.br");
  expect(out).toContain("youtube.com/embed/abc");
  expect(out).toContain("player.vimeo.com");
  expect(out).not.toContain("evil.com");
});

test("remove style e mantém formatação básica", () => {
  const out = sanitizeLessonHtml(
    '<h2 style="color:red">T</h2><ul><li><strong>a</strong> <em>b</em></li></ul><blockquote>q</blockquote><pre><code>c</code></pre><img src="https://a.com/i.png" onerror="x()">',
  );
  expect(out).not.toContain("style");
  expect(out).not.toContain("onerror");
  for (const t of ["<h2>", "<ul>", "<strong>", "<em>", "<blockquote>", "<pre>", "<code>", "<img"]) expect(out).toContain(t);
});

test("bloqueia href javascript:", () => {
  expect(sanitizeLessonHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript");
});
