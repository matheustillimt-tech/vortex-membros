import type { EditableTemplate } from "@/lib/settings";

export type { EditableTemplate };
/** Modelos que o painel não deixa editar (só `novoacesso` pode ser desativado). */
export type FixedTemplate = "novoacesso" | "recuperacao" | "convite-admin" | "novo-link";
export type EmailTemplateKey = EditableTemplate | FixedTemplate;

export const EDITABLE_TEMPLATES: readonly EditableTemplate[] = ["venda", "importacao", "gratis"];
export const EMAIL_TEMPLATE_KEYS: readonly EmailTemplateKey[] = [...EDITABLE_TEMPLATES, "novoacesso", "recuperacao", "convite-admin", "novo-link"];

const VENDA =
  "Obrigado pela sua compra, seja muito bem vindo(a)!\n\n" +
  "Abaixo você encontra os seus dados de acesso para nossa área de membros, onde você encontrará o conteúdo que acabou de adquirir.";

/** Textos padrão: usados quando "Sua mensagem" está vazia. */
export const DEFAULT_MESSAGES: Record<EditableTemplate, string> = {
  venda: VENDA,
  importacao: VENDA,
  gratis:
    "Obrigado por se cadastrar! Estamos muito felizes por ter você com a gente.\n\n" +
    "Aqui estão os seus dados de acesso à nossa área de membros:",
};

/** "Usar mensagem de migração" do modelo de importação . */
export const MIGRATION_MESSAGE =
  "Você está recebendo este e-mail porque o seu acesso está sendo migrado para uma nova plataforma muito mais prática e didática!\n\n" +
  "Suas compras estão em perfeito estado, ok?! Não precisa se preocupar...\n\n" +
  "Para acessar seus conteúdos você não usará mais seus dados e links antigos, use agora os dados de acesso abaixo (salve esse e-mail, se quiser)";

/** Textos dos modelos fixos . */
export const FIXED_MESSAGES = {
  novoacesso: (produto: string) => `Um novo acesso foi liberado para você: ${produto}.`,
  recuperacao:
    "Recebemos um pedido para criar uma nova senha. Clique no link abaixo para definir sua nova senha. O link vale por 1 hora.",
  "convite-admin": "Você recebeu acesso ao painel administrativo. Aqui estão os seus dados de acesso:",
  /** Convite de quem já tinha cadastro (aluno promovido): a senha não muda, vai só o link. */
  "convite-admin-senha-atual": "Use a senha que você já tem ou defina uma nova pelo link abaixo (vale por 1 hora).",
  "novo-link": "Aqui está o seu novo link de acesso:",
} as const;

/** Assuntos (o assunto não aparece no painel). */
export const SUBJECTS: Record<EmailTemplateKey, string> = {
  venda: "Seus dados de acesso",
  importacao: "Seus dados de acesso",
  gratis: "Seus dados de acesso",
  novoacesso: "Novo acesso liberado",
  recuperacao: "Recuperação de senha",
  "convite-admin": "Seu acesso ao painel",
  "novo-link": "Seu novo link de acesso",
};
