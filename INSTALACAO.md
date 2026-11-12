# Instalação do Vórtex Membros

Este guia leva você do zero até a sua área de membros no ar. Reserve cerca de 1 hora. Prefere que o
Claude Code faça com você? Use o [PROMPT-DE-INSTALACAO.md](PROMPT-DE-INSTALACAO.md).

Termos que aparecem aqui:

- **Banco de dados**: onde ficam alunos, cursos e vendas. Aqui é um Postgres no Supabase.
- **Migração**: arquivo que cria ou altera as tabelas do banco. Ficam na pasta `drizzle/` e são
  aplicadas na ordem pelo `drizzle-kit`.
- **Variável de ambiente**: configuração secreta (senha, chave) que fica fora do código, no arquivo
  `.env.local` do seu computador e nas configurações da Vercel.
- **Webhook**: aviso automático que a Kiwify manda para a sua plataforma a cada venda.
- **Cron**: tarefa que roda sozinha de tempos em tempos.

## 1. Contas

| Conta | Pra quê | Custo |
| --- | --- | --- |
| [GitHub](https://github.com) | guardar o código | grátis |
| [Supabase](https://supabase.com) | banco de dados Postgres | plano grátis (sem backup automático) |
| [Vercel](https://vercel.com) | hospedar o site | plano Hobby grátis |
| [Brevo](https://www.brevo.com) | e-mails (acesso, recuperação de senha) | plano grátis, 300 e-mails/dia |
| [Kiwify](https://kiwify.com.br) | vender e liberar o acesso | conta de produtor |
| Domínio próprio | endereço do site e remetente dos e-mails | opcional, pago à parte |

No seu computador: [Node.js](https://nodejs.org) 22 ou mais novo e [Git](https://git-scm.com).
A CLI da Vercel (`npm i -g vercel`) é opcional. A CLI do Supabase **não** é usada neste projeto.

## 2. Baixar o código

```bash
git clone https://github.com/matheustillimt-tech/vortex-membros.git
cd vortex-membros
npm install
cp .env.example .env.local
```

### Testar no seu computador (opcional, sem conta nenhuma)

O `.env.example` já vem com `DATABASE_URL=pglite:./.data/dev`, um banco que roda dentro do próprio
projeto.

```bash
npm run db:dev   # cria o banco local, aplica as migrações e carrega o conteúdo de exemplo
npm run dev      # http://localhost:3000
```

O `db:dev` imprime os acessos de demonstração (aluno e administrador, e-mails `@demo.local`). Eles só
existem nesse banco local. O banco local aceita um programa por vez: pare o `npm run dev` antes de rodar
`npm run db:dev` de novo. Para apagar só o conteúdo de exemplo: `npm run seed:clean`.

## 3. Banco de dados no Supabase

1. Crie um projeto no Supabase (região **South America (São Paulo)**) e guarde a senha do banco.
2. Clique em **Connect** e copie a conexão **Session pooler** (porta `5432`).
3. No `.env.local`, troque a linha do `DATABASE_URL` por essa conexão, com `[YOUR-PASSWORD]` trocado pela
   senha. Se a senha tiver `@`, `#` ou `/`, codifique (`@` vira `%40`, `#` vira `%23`, `/` vira `%2F`).
4. Crie as tabelas:

   ```bash
   npx drizzle-kit migrate
   ```

   O comando lê o `DATABASE_URL` do `.env.local` e aplica todas as migrações da pasta `drizzle/`, na
   ordem. Ele é seguro para rodar de novo: só aplica o que falta. No deploy de produção a Vercel roda
   esse mesmo comando sozinha (veja o passo 6), então este passo é só para conferir que a conexão
   funciona.

> Use a porta **5432** (Session pooler). A porta 6543 (Transaction pooler) travou páginas na Vercel em
> testes; ela só é usada se você puser `DB_POOL_MODE=transaction`.

Se você ligar a integração do Supabase pela Vercel, ela cria `POSTGRES_URL` e
`POSTGRES_URL_NON_POOLING` sozinha e o projeto reconhece as duas (o `DATABASE_URL` continua tendo
prioridade).

> O Supabase grátis **não faz backup automático**. Antes de vender, combine uma rotina de backup (por
> exemplo `pg_dump` agendado, ou o plano pago do Supabase).

## 4. Brevo (e-mails)

1. Crie a conta no Brevo. Em **Senders, Domains & Dedicated IPs**, autentique o seu domínio (registros
   DKIM e SPF no seu provedor de domínio). Sem isso os e-mails caem no spam.
2. Crie um remetente, por exemplo `nao-responda@seudominio.com.br`.
3. Em **SMTP & API → API Keys**, gere uma chave de API.
4. Cole a chave em `BREVO_API_KEY` e o remetente em `EMAIL_FROM_EMAIL` (no `.env.local` e, no passo 6,
   na Vercel).

Sem `BREVO_API_KEY` nada quebra: os e-mails ficam na fila e saem quando a chave for configurada.

## 5. Variáveis de ambiente

Todas ficam no `.env.local` (seu computador) e em **Settings → Environment Variables** da Vercel
(produção). Nunca coloque esses valores no código nem no GitHub.

| Variável | Pra que serve | Onde pegar | Obrigatória? |
| --- | --- | --- | --- |
| `DATABASE_URL` | conexão com o banco | Supabase → Connect → Session pooler (porta 5432). No computador pode ser `pglite:./.data/dev` | sim |
| `APP_URL` | endereço público do site, sem barra no fim (vai nos links dos e-mails) | o endereço da Vercel ou o seu domínio | sim em produção |
| `BOOTSTRAP_ADMIN_EMAIL` | e-mail do primeiro administrador, criado no deploy | o seu e-mail | sim em produção |
| `BOOTSTRAP_ADMIN_NAME` | nome do primeiro administrador | o seu nome | não |
| `CRON_SECRET` | protege a rota que envia os e-mails agendados | gere com `openssl rand -hex 32` | sim |
| `BREVO_API_KEY` | chave para enviar e-mails | Brevo → SMTP & API → API Keys | sim, para enviar e-mails |
| `EMAIL_FROM_EMAIL` | remetente dos e-mails (autenticado no Brevo) | Brevo → Senders | sim, para enviar e-mails |
| `EMAIL_FROM_NAME` | nome do remetente (ex.: `Minha Escola`) | você escolhe | não (padrão: nome do site) |
| `BREVO_DAILY_LIMIT` | limite de envios por dia | o do seu plano Brevo | não (padrão `300`) |
| `ALERT_EMAIL` | recebe aviso por e-mail quando o servidor dá erro | o seu e-mail | não (padrão: o administrador inicial) |
| `SEED_DEMO` | `1` carrega conteúdo de exemplo no deploy | deixe vazio em produção real | não |
| `SEED_ALLOW_DESTRUCTIVE` | `1` deixa o `npm run seed` rodar mesmo com alunos cadastrados | só para testes | não |
| `DB_POOL_MODE` | `transaction` troca a conexão para a porta 6543 | só para testes | não |
| `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` | alternativas ao `DATABASE_URL`, criadas pela integração Supabase da Vercel | criadas sozinhas | não |

A Vercel também fornece sozinha `VERCEL_ENV` e `VERCEL_PROJECT_PRODUCTION_URL` (usada quando `APP_URL`
está vazio). Você não precisa cadastrar.

## 6. Publicar na Vercel

1. Crie um repositório **privado** no seu GitHub e envie o código:

   ```bash
   git remote set-url origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```

   Confira antes com `git status` que o `.env.local` não está indo junto (o `.gitignore` já bloqueia).
2. Na Vercel, **Add New → Project** e importe o repositório. O Next.js é detectado sozinho.
3. Em **Settings → Environment Variables**, cadastre as variáveis do passo 5 no ambiente **Production**.
4. Clique em **Deploy**. No deploy de produção o script `vercel-build` do `package.json`:
   aplica as migrações (`drizzle-kit migrate`), atualiza o conteúdo de exemplo se ele existir
   (`seed:sync`), cria o primeiro administrador (`admin:ensure`) e compila o site.
5. Domínio próprio (opcional): **Settings → Domains**, adicione o domínio, crie o registro DNS indicado e
   confira se `APP_URL` bate com ele. Mudou variável? Faça um novo deploy.

O `vercel.json` já agenda o cron `/api/cron/emails` uma vez por dia (`0 12 * * *`, limite do plano
Hobby). Para enviar a cada 5 minutos, veja a seção 9.

## 7. Primeiro administrador

O administrador de `BOOTSTRAP_ADMIN_EMAIL` é criado no deploy **sem senha conhecida** (nenhum e-mail é
enviado). Para entrar:

1. Abra `APP_URL/auth/login` e clique em **Esqueceu sua senha?**.
2. Informe o e-mail de `BOOTSTRAP_ADMIN_EMAIL` e defina a senha pelo link recebido (precisa do Brevo
   configurado).
3. O painel fica em `/dashboard`. Outros administradores você convida em **Configurações →
   Administradores**.

## 8. Ligar a Kiwify (vendas e liberação de acesso)

1. No painel, abra **Vendas → Entregas → Nova entrega → Kiwify**. A tela mostra a **URL do webhook** da
   sua plataforma. Ela contém um segredo: não divulgue.
2. Na Kiwify, abra **Apps → Webhooks → Criar webhook**, cole essa URL e marque os eventos de compra
   aprovada, reembolso e chargeback (e os de assinatura, se vender recorrência).
3. Salve. A Kiwify mostra um **token**: cole no campo "Token da Kiwify" da entrega, para só aceitar
   avisos assinados pela Kiwify.
4. Na entrega, informe o ID ou o link de checkout do produto na Kiwify e escolha o que ela libera
   (produtos, tempo de acesso, etiquetas).
5. Faça uma compra de teste. Ela aparece em **Vendas** e o aluno recebe o e-mail de acesso. Venda que
   falhar fica na fila e pode ser reprocessada pelo painel.

## 9. E-mails a cada 5 minutos (opcional, recomendado)

A rota `GET /api/cron/emails` envia a fila de e-mails, refaz tentativas e limpa registros antigos. Ela
exige o cabeçalho `Authorization: Bearer <CRON_SECRET>`; sem `CRON_SECRET`, responde 401.

No Supabase, em **Database → Extensions**, ative `pg_cron` e `pg_net`. No **SQL Editor**, guarde o
segredo no Vault (troque o texto pelo mesmo valor de `CRON_SECRET`):

```sql
select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'cron_secret');
```

Depois agende a chamada, trocando `https://seu-dominio.com.br` pelo seu `APP_URL`:

```sql
select cron.schedule(
  'enviar-fila-de-emails',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://seu-dominio.com.br/api/cron/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
```

Para conferir as execuções: `select * from cron.job_run_details order by start_time desc limit 10;`

## 10. Personalizar

Tudo em **Configurações** no painel, sem mexer no código:

- **Área do aluno**: nome do site (padrão "Vórtex Membros", aparece no título das páginas), logo,
  favicon, cor de destaque, tema claro ou escuro, rodapé, termo de primeiro acesso.
- **Telas de acesso**: imagem e cores do login.
- **E-mails**: aparência, assinatura e o texto de cada modelo.
- **Compartilhamento**: prévia dos links nas redes sociais.
- **Segurança**: política de senha e limite de tentativas.

O nome padrão (antes de você mudar no painel) fica em `src/lib/settings.ts` (`siteName`) e em
`src/app/layout.tsx` (`title`).

## 11. Checklist de teste

- [ ] Login no `/dashboard` funciona.
- [ ] Criar uma vitrine, um produto, um módulo e uma aula com vídeo do YouTube, Vimeo ou Panda Video.
- [ ] Cadastrar um aluno manualmente e usar **Acessar como aluno**.
- [ ] Compra de teste na Kiwify aparece em **Vendas** e o aluno recebe o e-mail de acesso.
- [ ] Reembolso de teste retira o acesso.
- [ ] Em **Esqueceu sua senha?** o e-mail chega.
- [ ] Na Vercel, **Settings → Cron Jobs** mostra `/api/cron/emails`.
- [ ] Se usou `SEED_DEMO=1`, apagar o conteúdo de exemplo antes de ter alunos: `npm run seed:clean`.

## 12. Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| Deploy falha com erro de conexão no `drizzle-kit migrate` | confira o `DATABASE_URL` na Vercel (porta 5432, senha codificada) |
| E-mails não chegam | confira `BREVO_API_KEY` e `EMAIL_FROM_EMAIL`; o domínio precisa estar autenticado no Brevo; veja o aviso na tela **Configurações → E-mails** |
| E-mail chega com link para endereço errado | ajuste `APP_URL` (sem barra no fim) e faça novo deploy |
| Venda da Kiwify não libera o acesso | confira se existe entrega com o link de checkout certo; abra a venda em **Vendas** para ver o erro e reprocessar |
| `/api/cron/emails` responde 401 | `CRON_SECRET` vazio ou diferente do usado no cron |
| Não consigo entrar como administrador | use **Esqueceu sua senha?** com o e-mail de `BOOTSTRAP_ADMIN_EMAIL` |
| `npm run db:dev` dá erro de banco em uso | pare o `npm run dev` antes (o banco local aceita um programa por vez) |
| `npm run seed` se recusa a rodar | ele protege bancos com alunos reais; use só em banco de teste |

---

Feito pelo Grupo Vórtex · entregue na Plataforma Vórtex IA
