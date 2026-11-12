import { expect, test, vi } from "vitest";
import { createErrorAlerter } from "@/lib/error-alert";

const brevo = { apiKey: "k", senderEmail: "de@x.com", senderName: "Área" };
const req = { path: "/area/conteudo/aula/1?token=segredo&email=a@b.com", method: "GET" };
const ctx = { routePath: "/area/conteudo/aula/[id]", routeType: "render" };

function setup(start = Date.UTC(2026, 9, 31, 12)) {
  let t = start;
  const send = vi.fn(async () => ({ ok: true as const }));
  const alert = createErrorAlerter({ to: "eu@x.com", brevo, send, now: () => new Date(t) });
  return { send, alert, advance: (ms: number) => { t += ms; } };
}

test("alerta: e-mail sem query nem mensagem do erro, com o digest para achar no log", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { send, alert } = setup();
  const err = Object.assign(new Error("falhou com a@b.com e senha 123"), { digest: "123456789" });
  expect(await alert(err, req, ctx)).toBe(true);
  const [msg] = send.mock.calls[0] as unknown as [{ subject: string; html: string; toEmail: string }];
  expect(msg.toEmail).toBe("eu@x.com");
  expect(msg.subject).toBe("Erro no site: /area/conteudo/aula/1");
  expect(msg.html).toContain("123456789");
  expect(msg.html).not.toMatch(/segredo|a@b\.com|senha 123/);
});

test("alerta: ignora redirect/notFound e não repete o mesmo erro em 15 min; teto de 6 por hora", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { send, alert, advance } = setup();
  expect(await alert(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace;/a;307;" }), req, ctx)).toBe(false);
  expect(await alert(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }), req, ctx)).toBe(false);
  expect(await alert(new Error("x"), req, ctx)).toBe(true);
  expect(await alert(new Error("x"), req, ctx)).toBe(false);
  advance(15 * 60_000);
  expect(await alert(new Error("x"), req, ctx)).toBe(true);
  for (let i = 0; i < 6; i++) await alert(new TypeError("y"), req, { ...ctx, routePath: `/r${i}` });
  expect(send).toHaveBeenCalledTimes(6);
  advance(60 * 60_000);
  expect(await alert(new TypeError("y"), req, { ...ctx, routePath: "/nova" })).toBe(true);
});

test("alerta: sem destino ou sem Brevo só registra no log", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const send = vi.fn();
  const alert = createErrorAlerter({ to: null, brevo, send });
  expect(await alert(new Error("x"), req, ctx)).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(log.mock.calls[0][0]).toContain("/area/conteudo/aula/1 ");
  expect(log.mock.calls[0][0]).not.toContain("segredo");
});
