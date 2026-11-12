# Vórtex Membros

Área de membros para vender e entregar cursos online: o aluno compra na Kiwify, recebe o acesso por e-mail
na hora e assiste às aulas numa área com a sua marca. Você cuida de tudo por um painel.

## O que ele faz

- **Área do aluno** com vitrines, produtos, módulos e aulas, barra de progresso, "próxima aula",
  marcar aula como concluída, reações de gostei e não gostei, perfil com foto e termo de aceite.
- **Player de vídeo** com YouTube, Vimeo e Panda Video (o vídeo fica no serviço que você já usa).
- **Painel do produtor** (`/dashboard`) para montar o conteúdo com editor de blocos, banners,
  liberação programada (aula que abre X dias depois da compra ou numa data) e lixeira.
- **Liberação de acesso por venda**: a Kiwify avisa a plataforma a cada compra, reembolso ou
  chargeback, e o acesso é liberado ou retirado sozinho. Vendas que falharem ficam numa fila e podem
  ser reprocessadas.
- **Alunos**: busca, filtros, etiquetas (tags), notas, histórico de acessos, importação por planilha,
  exportação e o botão "Acessar como aluno".
- **E-mails automáticos** pelo Brevo: acesso liberado, novo acesso, recuperação de senha e convite de
  administrador, com textos editáveis no painel.
- **Relatórios** de alunos, produtos e aulas.
- **Personalização sem código**: nome do site, logo, favicon, cor de destaque, tema claro ou escuro,
  telas de login, prévia dos links nas redes sociais.
- **Segurança**: limite de tentativas de login, política de senha, vários administradores com
  permissões.

## Como funciona (simples)

1. Você cadastra os cursos no painel.
2. Na Kiwify, você aponta o "webhook" (um aviso automático) para a sua plataforma.
3. Quando alguém compra, a Kiwify avisa, a plataforma cria o aluno, libera o curso e manda o e-mail com
   o acesso. Reembolso ou chargeback retiram o acesso.
4. Uma tarefa agendada (cron) envia a fila de e-mails e refaz o que falhou.

## Com o que é feito

Next.js 16 · React 19 · Drizzle ORM (cria e atualiza as tabelas do banco) · Postgres (Supabase em
produção; PGlite, um Postgres que roda dentro do Node, para testar no seu computador) · Tailwind 4 ·
Vitest (testes automáticos).

## De quais contas você precisa

| Conta | Pra quê | Tem plano grátis? |
| --- | --- | --- |
| [GitHub](https://github.com) | guardar o seu código | sim |
| [Supabase](https://supabase.com) | banco de dados | sim (sem backup automático) |
| [Vercel](https://vercel.com) | colocar o site no ar | sim (plano Hobby) |
| [Brevo](https://www.brevo.com) | enviar os e-mails | sim (300 e-mails por dia) |
| [Kiwify](https://kiwify.com.br) | vender e liberar o acesso | conta de produtor (a Kiwify cobra por venda) |
| Domínio próprio | endereço tipo `alunos.seusite.com.br` | opcional, pago à parte |

Para enviar e-mail sem cair no spam você precisa de um domínio próprio autenticado no Brevo.

## Instalar com o Claude Code

Abra o Claude Code (aba **Code**) numa pasta vazia, cole o texto abaixo e siga com ele:

```text
Você vai instalar o Vórtex Membros comigo, do zero, nesta pasta (que está vazia). O Vórtex Membros é uma
área de membros para cursos online: painel do produtor, área do aluno, liberação de acesso automática
quando alguém compra na Kiwify, e-mails pelo Brevo e relatórios.
Repositório: https://github.com/matheustillimt-tech/vortex-membros
O passo a passo completo está no arquivo INSTALACAO.md do repositório: leia-o depois de baixar o código
e siga a mesma ordem.

Eu não sou programador. Explique cada passo em português simples, com frases curtas, e espere eu
confirmar antes de ir pro próximo.

REGRAS (siga sempre):
1. NUNCA me peça pra colar chave, senha, token ou segredo aqui no chat. Quando eu precisar colocar um
   valor secreto, abra o arquivo .env.local pra mim (ex.: `open -e .env.local` no Mac,
   `notepad .env.local` no Windows) e me diga em qual linha colar. Segredos que você mesmo gerar
   (com openssl) escreva direto no arquivo, sem mostrar o valor na tela. Na Vercel, use
   `vercel env add NOME production` lendo o valor do arquivo, sem imprimir.
2. As variáveis ficam no .env.local. Nunca faça commit do .env.local.
3. Uma conta por vez: me diga o site, o que clicar e o que copiar, e espere eu dizer "pronto".
4. Se der erro, me explique o erro numa frase e proponha a correção antes de tentar de novo.
5. Nunca rode `npm run seed` num banco que já tem alunos de verdade, nem apague tabelas, sem me perguntar.
6. O banco deste projeto é criado pelo drizzle-kit (pasta drizzle/). Não use `supabase db push` nem
   migrações do Supabase.

PASSOS:
1. Pré-requisitos: confira se tenho Node.js 22 ou mais novo (`node -v`), Git (`git --version`) e a CLI
   da Vercel (`vercel --version`). Instale o que faltar (Mac: Homebrew; Windows: me passe o instalador
   oficial e espere). A CLI do Supabase não é necessária.
2. Baixe o código nesta pasta: `git clone https://github.com/matheustillimt-tech/vortex-membros.git .`
   e depois `npm install`.
3. Teste local primeiro, sem conta nenhuma: `cp .env.example .env.local` (já vem com o banco local
   DATABASE_URL=pglite:./.data/dev), rode `npm run db:dev` e depois `npm run dev`. Abra
   http://localhost:3000 e me mostre a área do aluno e o painel (/dashboard) com os acessos de
   demonstração que o db:dev imprimiu. Depois pare o servidor (Ctrl+C).
4. Supabase (o banco de dados, plano grátis): me guie pra criar a conta em supabase.com e um projeto
   novo (região São Paulo). Eu escolho e guardo a senha do banco. Depois me mostre onde fica a conexão
   (botão "Connect" → "Session pooler", porta 5432). Abra o .env.local pra eu colar em DATABASE_URL,
   trocando [YOUR-PASSWORD] pela senha (se a senha tiver @, # ou /, me ajude a codificar: @ vira %40).
   Guarde a linha antiga do pglite comentada.
5. Crie as tabelas no Supabase: `npx drizzle-kit migrate`. Confira que terminou sem erro.
6. Segredos: gere CRON_SECRET (`openssl rand -hex 32`) e escreva direto no .env.local, sem mostrar.
   Pergunte o meu e-mail e nome e coloque em BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_NAME.
7. Brevo (e-mails, plano grátis de 300 por dia): me guie pra criar a conta em brevo.com, autenticar o
   meu domínio (registros DKIM e SPF), criar um remetente e gerar uma chave de API (SMTP & API → API
   Keys). Abra o .env.local pra eu colar em BREVO_API_KEY e preencher EMAIL_FROM_EMAIL e EMAIL_FROM_NAME.
   Se eu ainda não tiver domínio, pule: os e-mails ficam na fila e saem quando a chave for configurada.
8. GitHub: crie um repositório PRIVADO na minha conta e suba o código (use `gh` se eu tiver; se não,
   me guie pelo site). Antes do push, confira com `git status` que o .env.local NÃO está indo junto.
9. Vercel: me guie pra criar a conta (entrar com o GitHub) e importar o repositório. Cadastre as
   variáveis de produção: DATABASE_URL, APP_URL (o endereço que a Vercel der, ou meu domínio, sem barra
   no fim), BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, CRON_SECRET, BREVO_API_KEY, EMAIL_FROM_EMAIL,
   EMAIL_FROM_NAME. Use `vercel link` e `vercel env add NOME production` lendo do .env.local sem
   imprimir, ou me guie pela tela de variáveis. NÃO cadastre SEED_DEMO (ele carrega conteúdo de exemplo).
   Publique e me dê o link. No deploy de produção a Vercel aplica as migrações e cria o meu usuário de
   administrador sozinha.
10. Primeiro acesso: abra APP_URL/auth/login, clique em "Esqueceu sua senha?", eu informo o meu e-mail
    e defino a senha pelo link que chegar. O painel fica em /dashboard. (Sem o Brevo configurado o
    e-mail não sai: nesse caso volte ao passo 7.)
11. Personalização: me mostre Configurações no painel (nome do site, logo, favicon, cores, telas de
    acesso, e-mails, termo de aceite). O nome padrão é "Vórtex Membros" e eu troco por lá.
12. Kiwify (vendas): no painel, abra Vendas → Entregas → Nova entrega → Kiwify e copie a URL do webhook
    (ela tem um segredo: abra num arquivo pra eu copiar, não cole no chat). Me guie na Kiwify em
    Apps → Webhooks → Criar webhook, com os eventos de compra aprovada, reembolso e chargeback (e os de
    assinatura, se eu vender recorrência). O token que a Kiwify mostrar eu colo no campo "Token da
    Kiwify" da entrega. Na entrega, eu informo o link de checkout do produto e escolho o que ele libera.
13. E-mails agendados: o vercel.json já agenda o envio da fila uma vez por dia (limite do plano Hobby).
    Pergunte se eu quero o envio a cada 5 minutos pelo pg_cron do Supabase e, se sim, siga a seção
    "E-mails a cada 5 minutos" do INSTALACAO.md, guardando o CRON_SECRET no Vault do Supabase sem
    mostrar o valor.
14. Checklist final, comigo, no endereço publicado:
    - login no /dashboard funciona;
    - criar uma vitrine, um produto, um módulo e uma aula com vídeo do YouTube;
    - cadastrar um aluno manualmente e entrar como ele ("Acessar como aluno");
    - fazer uma compra de teste na Kiwify: ela aparece em Vendas e o aluno recebe o e-mail de acesso;
    - na Vercel, em Settings → Cron Jobs, aparece o /api/cron/emails.
15. No fim, lembre: o Supabase grátis não faz backup automático. Me explique em duas frases como
    fazer um backup (pg_dump) antes de vender.
```

## Instalar na mão

O passo a passo completo está no [INSTALACAO.md](INSTALACAO.md).

Para só conhecer no seu computador, sem criar conta nenhuma:

```bash
git clone https://github.com/matheustillimt-tech/vortex-membros.git
cd vortex-membros
npm install
cp .env.example .env.local   # já vem com o banco local (PGlite)
npm run db:dev               # cria o banco local e o conteúdo de exemplo
npm run dev                  # abra http://localhost:3000
```

O `db:dev` mostra os acessos de demonstração (aluno e administrador, e-mails `@demo.local`). Eles só
existem no banco local.

## Estrutura de pastas

```
src/
  app/
    area/            área do aluno (vitrines, aulas, perfil)
    auth/            login, recuperação de senha, link automático
    dashboard/       painel do produtor (conteúdo, alunos, vendas, relatórios, configurações)
    api/postback/    webhook da Kiwify
    api/cron/        envio da fila de e-mails
    media/           imagens enviadas pelo painel
  components/        telas e peças visuais
  db/                tabelas (schema.ts) e conexão com o banco
  lib/
    sales/           vendas, entregas e liberação de acesso
    email/           e-mails (Brevo), modelos e fila
    catalog/         o que cada aluno pode ver
    settings.ts      configurações padrão (nome do site, cores)
drizzle/             migrações do banco, na ordem
scripts/             banco local, conteúdo de exemplo e primeiro administrador
tests/               testes automáticos (npm test)
vercel.json          agendamento (cron) do envio de e-mails
```

## Licença

[MIT](LICENSE): pode usar, mudar e vender o que você construir com ele.

---

Feito pelo Grupo Vórtex · entregue na Plataforma Vórtex IA
