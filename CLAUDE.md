# CLAUDE.md: Vórtex Membros

Guia para o Claude Code mexer neste template. Leia também o `AGENTS.md` (regras do Next.js 16: esta
versão tem mudanças; consulte `node_modules/next/dist/docs/` antes de escrever código de rota ou cache).

## O que é

Área de membros para cursos online: área do aluno (`/area`), painel do produtor (`/dashboard`),
login (`/auth`), liberação de acesso por venda da Kiwify (`/api/postback/kiwify/[secret]`), fila de
e-mails pelo Brevo (`/api/cron/emails`) e relatórios. Quem usa costuma ser dono de negócio, não
programador: explique em português simples.

## Onde está cada coisa

- `src/app/` rotas (App Router). `area/` aluno, `dashboard/` painel, `auth/` login, `api/` webhook e cron,
  `media/` imagens enviadas pelo painel (guardadas no banco).
- `src/components/` telas. `area/` aluno, `dashboard/` painel, `auth/` login.
- `src/db/schema.ts` tabelas (Drizzle). `src/db/index.ts` conexão (Postgres ou PGlite).
- `src/lib/sales/` Kiwify, entregas e liberação de acesso. `src/lib/email/` Brevo, modelos e fila.
  `src/lib/catalog/` regras de acesso e liberação programada. `src/lib/settings.ts` configurações padrão.
- `drizzle/` migrações SQL em ordem + `drizzle/meta/` (snapshots e `_journal.json` do drizzle-kit).
- `scripts/` banco local (`db:dev`), conteúdo de exemplo (`seed`, `seed:sync`, `seed:clean`) e primeiro
  administrador (`admin:ensure`).
- `tests/` Vitest com PGlite em memória (não precisa de banco externo).
- Classes CSS próprias da área do aluno usam o prefixo `vx-` (em `src/app/globals.css`).

## Como rodar

```bash
npm install
cp .env.example .env.local      # DATABASE_URL=pglite:./.data/dev
npm run db:dev                  # banco local + conteúdo de exemplo (pare o dev antes)
npm run dev                     # http://localhost:3000
npm test                        # testes
npx next typegen && npx tsc --noEmit   # checagem de tipos num clone novo
npm run lint
npm run build
```

Em máquina com pouca memória: `npx vitest run --maxWorkers=1 --no-file-parallelism` e
`NODE_OPTIONS=--max-old-space-size=1536 npm run build` (nunca os dois ao mesmo tempo).

## Personalizar marca e textos

- O nome do site, logo, favicon, cores, tema, telas de login, e-mails e termo de aceite se mudam no
  painel em **Configurações** (ficam no banco, tabela `platform_settings`). Prefira isso a mudar código.
- Valores padrão (antes de o dono configurar): `src/lib/settings.ts` (`DEFAULT_SETTINGS`, `siteName`
  "Vórtex Membros"), `src/app/layout.tsx` (`title`), `src/components/platform-identity.tsx`
  (`DEFAULT_DOCUMENT_TITLE`). Mudou o padrão? Atualize `tests/__snapshots__/` com `npx vitest run -u`
  depois de conferir que a diferença é só essa.
- Textos padrão dos e-mails: `src/lib/email/defaults.ts`. Layout dos e-mails: `src/lib/email/layout.ts`.
- Ícone do navegador padrão: `src/app/favicon.ico`.

## Regras

- Nunca versionar `.env`, `.env.local` nem chaves. Variável nova lida no código vai também no
  `.env.example` (com comentário) e na tabela do `INSTALACAO.md`.
- Banco: mudou `src/db/schema.ts`? Gere a migração com `npx drizzle-kit generate --name descricao`.
  Migração nova vai sempre **no fim da fila**; nunca edite nem reordene uma migração que já foi aplicada.
  Não use migrações do Supabase CLI.
- No deploy de produção (`vercel-build`) a Vercel roda `drizzle-kit migrate`: um push na `main` com a
  Vercel ligada aplica migrações e publica o site. Teste antes no banco local.
- `npm run seed` é destrutivo (recusa rodar com alunos reais). Não rode em produção.
- Server actions recebem dados de qualquer cliente: valide tipos e confira permissão (`src/lib/admin/guard.ts`,
  `src/lib/auth/guard.ts`).
- Rode `npm test` depois de qualquer mudança.
