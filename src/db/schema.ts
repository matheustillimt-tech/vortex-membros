import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Tipos de JSON (ProductSettings guardado parcial no banco; use resolveProductSettings para ler).
export type ProductSettings = {
  /** "none" (Nenhum): sem listagem, o produto abre direto na primeira aula. */
  listing: "none" | "grid" | "list" | "timeline" | "streaming";
  modulesAsCarousel: boolean;
  showModuleTitles: boolean;
  thumbnailFormat: "auto" | "original" | "16:9" | "1:1" | "4:5" | "4:7";
  showBanner: boolean;
  bannerUrl: string | null;
  lesson: {
    theaterMode: boolean;
    mobileVideoFirst: boolean;
    showModuleBar: boolean;
    compactModuleBar: boolean;
    showLessonNumbers: boolean;
    showTotalProgress: boolean;
    showMarkSeenButton: boolean;
    keepButtonAfterSeen: boolean;
    autoMarkSeen: boolean;
    navigation: "simple" | "thumbnail";
    nextProductId: number | null;
    nextProductButtonText: string | null;
  };
};
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type BannerConfig = {
  logoUrl?: string | null;
  title?: string | null;
  text?: string | null;
  textShadow?: boolean;
  buttonText?: string | null;
  buttonColors?: { text?: string; background?: string; hoverText?: string; hoverBackground?: string };
  action?: { type: "none" | "product" | "external"; productId?: number; url?: string; newTab?: boolean };
  desktopImageUrl?: string | null;
  mobileImageUrl?: string | null;
  videoUrl?: string | null;
  mobileVideoUrl?: string | null;
  heightPercent?: number;
  bottomGradient?: boolean;
};
export type Address = {
  cep: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  district: string;
  city: string;
  state: string;
};

// IDs aceitam valores legados explícitos; novos IDs começam em 900000000.
const id = () =>
  bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ startWith: 900000000 });
const ref = (name: string) => bigint(name, { mode: "number" });
// bytea devolvendo Uint8Array (PGlite devolve Uint8Array; postgres.js devolve Buffer, que é subclasse).
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array | Buffer }>({
  dataType: () => "bytea",
  toDriver: (v) => v,
  fromDriver: (v) => (v instanceof Uint8Array ? v : new Uint8Array(v as ArrayLike<number>)),
});
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const showcases = pgTable("showcases", {
  id: id(),
  parentId: ref("parent_id"),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  status: text("status", { enum: ["published", "unlisted"] }).notNull(),
  deletedAt: tstz("deleted_at"),
});

export const products = pgTable("products", {
  id: id(),
  showcaseId: ref("showcase_id").notNull(),
  name: text("name").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  accentColor: text("accent_color"),
  status: text("status", { enum: ["published", "hidden"] }).notNull(),
  isFree: boolean("is_free").notNull().default(false),
  offerUrl: text("offer_url"),
  defaultAccessDays: integer("default_access_days"), // null = vitalício
  termsHtml: text("terms_html"),
  termsEnabled: boolean("terms_enabled").notNull().default(false),
  position: integer("position").notNull().default(0),
  settings: jsonb("settings").$type<DeepPartial<ProductSettings>>().notNull().default({}),
  deletedAt: tstz("deleted_at"),
});

export const modules = pgTable("modules", {
  id: id(),
  productId: ref("product_id").notNull(),
  title: text("title").notNull(),
  coverUrl: text("cover_url"),
  position: integer("position").notNull().default(0),
  status: text("status", { enum: ["published", "hidden"] }).notNull(),
  deletedAt: tstz("deleted_at"),
}, (t) => [index("modules_product_idx").on(t.productId, t.position)]);

export const lessons = pgTable("lessons", {
  id: id(),
  moduleId: ref("module_id").notNull(),
  title: text("title").notNull(),
  videoUrl: text("video_url"),
  contentHtml: text("content_html").notNull().default(""),
  contentBlocks: jsonb("content_blocks").$type<unknown>(),
  summary: text("summary"),
  thumbnailUrl: text("thumbnail_url"),
  format: text("format", { enum: ["standard", "live"] }).notNull().default("standard"),
  liveUrl: text("live_url"),
  position: integer("position").notNull().default(0),
  status: text("status", { enum: ["published", "hidden"] }).notNull(),
  deletedAt: tstz("deleted_at"),
}, (t) => [index("lessons_module_idx").on(t.moduleId, t.position)]);

export const media = pgTable("media", {
  id: id(),
  sha256: text("sha256").notNull().unique(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdBy: ref("created_by"),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const banners = pgTable("banners", {
  id: id(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  status: text("status", { enum: ["published", "hidden"] }).notNull(),
  config: jsonb("config").$type<BannerConfig>().notNull().default({}),
  deletedAt: tstz("deleted_at"),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  document: text("document"),
  phone: text("phone"),
  address: jsonb("address").$type<Address>(),
  /** Foto enviada pelo aluno em Minha conta ("/media/<id>"); null = sem foto. */
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash").notNull(),
  loginToken: text("login_token").notNull().unique(),
  role: text("role", { enum: ["student", "admin"] }).notNull(),
  // Nível do admin (só "root" = Super Admin por enquanto); null para alunos.
  adminRole: text("admin_role", { enum: ["root"] }),
  /** Quando deixou de ser admin ("Excluir administrador"): é a Lixeira de Administradores. */
  adminRemovedAt: tstz("admin_removed_at"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  lastAccessAt: tstz("last_access_at"),
  /** Primeiro login (senha ou link); null = nunca entrou. */
  firstAccessAt: tstz("first_access_at"),
  deletedAt: tstz("deleted_at"),
}, (t) => [
  index("users_created_at_idx").on(t.createdAt),
  index("users_last_access_at_idx").on(t.lastAccessAt),
  index("users_lower_name_idx").on(sql`lower(${t.name})`),
]);

export const productAccess = pgTable(
  "product_access",
  {
    id: id(),
    userId: ref("user_id").notNull(),
    productId: ref("product_id").notNull(),
    startsAt: tstz("starts_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at"),
    revokedAt: tstz("revoked_at"),
    source: text("source", { enum: ["sale", "manual", "import"] }).notNull(),
    /** Venda que deu o acesso: `order_id` (ou `subscription_id` em assinatura). */
    saleRef: text("sale_ref"),
    /** Entrega que deu o acesso (null para manual/importação sem entrega). */
    deliveryId: ref("delivery_id"),
    /** "Excluir compra" (avulsa) no perfil do aluno: revogada e fora da aba Compras. */
    deletedAt: tstz("deleted_at"),
  },
  (t) => [
    // Reprocessar a mesma venda não duplica (sale_ref null nunca conflita).
    uniqueIndex("product_access_user_product_sale_uq").on(t.userId, t.productId, t.saleRef),
    index("product_access_sale_ref_idx").on(t.saleRef),
    index("product_access_delivery_idx").on(t.deliveryId),
    // Filtros da lista de alunos por produto. Por aluno, o índice único acima (user_id primeiro) já serve.
    index("product_access_product_idx").on(t.productId),
  ],
);

/** "Acesso completo a todos os produtos": vale para os produtos existentes e os criados depois. */
export const fullAccess = pgTable(
  "full_access",
  {
    id: id(),
    userId: ref("user_id").notNull(),
    startsAt: tstz("starts_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at"),
    revokedAt: tstz("revoked_at"),
    source: text("source", { enum: ["sale", "manual", "import"] }).notNull(),
    saleRef: text("sale_ref"),
    deliveryId: ref("delivery_id"),
    deletedAt: tstz("deleted_at"),
  },
  (t) => [
    index("full_access_user_idx").on(t.userId),
    uniqueIndex("full_access_user_sale_uq").on(t.userId, t.saleRef),
    index("full_access_sale_ref_idx").on(t.saleRef),
    index("full_access_delivery_idx").on(t.deliveryId),
  ],
);

/** Entrega: liga produtos/planos do gateway (`codes`) ao conteúdo liberado (delivery_items). */
export type DeliveryType = "single" | "subscription";
export const deliveries = pgTable(
  "deliveries",
  {
    id: id(),
    name: text("name").notNull(),
    gateway: text("gateway", { enum: ["kiwify"] }).notNull().default("kiwify"),
    type: text("type", { enum: ["single", "subscription"] }).notNull().default("single"),
    /** Códigos do produto/oferta/plano/link de checkout no gateway. */
    codes: text("codes").array().notNull().default(sql`'{}'::text[]`),
    archivedAt: tstz("archived_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    lastSaleAt: tstz("last_sale_at"),
  },
  (t) => [index("deliveries_codes_idx").using("gin", t.codes)],
);

export type DeliveryTarget = "all" | "showcase" | "product";
export type DurationType = "lifetime" | "hours" | "days" | "weeks" | "months" | "years";
export const deliveryItems = pgTable(
  "delivery_items",
  {
    id: id(),
    deliveryId: ref("delivery_id").notNull(),
    targetType: text("target_type", { enum: ["all", "showcase", "product"] }).notNull(),
    targetId: ref("target_id"), // null para "all"
    durationType: text("duration_type", { enum: ["lifetime", "hours", "days", "weeks", "months", "years"] }).notNull(),
    duration: integer("duration"), // null para vitalício
    /** Liberação: programação aplicada ao produto. */
    scheduleId: ref("schedule_id"),
  },
  (t) => [index("delivery_items_delivery_idx").on(t.deliveryId)],
);

export const tags = pgTable(
  "tags",
  {
    id: id(),
    name: text("name").notNull(),
  },
  // Nome único sem diferenciar maiúsculas ("Turma A" = "turma a").
  (t) => [uniqueIndex("tags_name_lower_uq").on(sql`lower(${t.name})`)],
);

export const userTags = pgTable(
  "user_tags",
  {
    userId: ref("user_id").notNull(),
    tagId: ref("tag_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tagId] })],
);

export const deliveryTags = pgTable(
  "delivery_tags",
  {
    deliveryId: ref("delivery_id").notNull(),
    tagId: ref("tag_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.deliveryId, t.tagId] })],
);

/** Log dos webhooks dos gateways: cada linha é um evento (grava primeiro, processa depois). */
export type SaleStatus = "approved" | "refunded" | "chargeback" | "canceled" | "late" | "renewed" | "waiting" | "refused" | "other";
export type SaleProcessing = "queued" | "processed" | "error" | "ignored";
export const sales = pgTable(
  "sales",
  {
    id: id(),
    gateway: text("gateway").notNull(),
    orderId: text("order_id"),
    event: text("event"),
    status: text("status").$type<SaleStatus>().notNull(),
    processing: text("processing").$type<SaleProcessing>().notNull().default("queued"),
    error: text("error"),
    /** Aviso de conferência (ex.: venda anterior à plataforma). */
    notice: text("notice"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    customerEmail: text("customer_email"),
    customerName: text("customer_name"),
    customerDocument: text("customer_document"),
    productIds: text("product_ids").array().notNull().default(sql`'{}'::text[]`),
    checkoutLink: text("checkout_link"),
    planId: text("plan_id"),
    subscriptionId: text("subscription_id"),
    amountCents: integer("amount_cents"),
    paymentMethod: text("payment_method"),
    deliveryId: ref("delivery_id"),
    userId: ref("user_id"),
    receivedAt: tstz("received_at").notNull().defaultNow(),
    processedAt: tstz("processed_at"),
    deletedAt: tstz("deleted_at"),
    dedupeKey: text("dedupe_key").notNull().unique(),
  },
  (t) => [
    index("sales_processing_idx").on(t.processing, t.receivedAt),
    index("sales_order_idx").on(t.orderId),
    index("sales_subscription_idx").on(t.subscriptionId),
    index("sales_customer_email_idx").on(t.customerEmail),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: ref("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    /** Admin que abriu esta sessão "como o aluno" (personificação); null = sessão normal. */
    impersonatedBy: ref("impersonated_by"),
  },
  (t) => [index("sessions_expires_at_idx").on(t.expiresAt)],
);

/** Eventos do aluno (aba Logs do perfil). Nunca guarda senha nem token. */
export type UserLogEvent = "login" | "login_link" | "first_access" | "new_device" | "password_changed" | "impersonated";
export const userLogs = pgTable(
  "user_logs",
  {
    id: id(),
    userId: ref("user_id").notNull(),
    event: text("event", {
      enum: ["login", "login_link", "first_access", "new_device", "password_changed", "impersonated"],
    }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("user_logs_user_created_idx").on(t.userId, t.createdAt)],
);

/** "Liberação imediata" (perfil do aluno › Produtos): o conteúdo programado não vale para este aluno no produto. */
export const userReleaseOverrides = pgTable(
  "user_release_overrides",
  {
    userId: ref("user_id").notNull(),
    productId: ref("product_id").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

/** Linha da planilha já lida e conferida no envio (processada depois, em lotes). */
export type StudentImportRow = {
  /** Número da linha na planilha (cabeçalho = 1). */
  row: number;
  status: string;
  productId: string;
  email: string;
  name: string;
  document: string;
  phone: string;
  /** "AAAA-MM-DD" ou "" (vitalício). */
  expiresOn: string;
};
export type StudentImportError = { row: number; message: string };

/** Importação de alunos por XLSX (Alunos › Importações). `rows` some ao terminar; `processed` é o cursor. */
export const studentImports = pgTable(
  "student_imports",
  {
    id: id(),
    name: text("name").notNull(),
    status: text("status", { enum: ["queued", "processing", "done", "failed"] }).notNull().default("queued"),
    total: integer("total").notNull().default(0),
    processed: integer("processed").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    /** Até 200 linhas com erro (as demais só contam em `failed`). */
    errors: jsonb("errors").$type<StudentImportError[]>().notNull().default([]),
    rows: jsonb("rows").$type<StudentImportRow[] | null>(),
    createdBy: ref("created_by"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    /** Último lote gravado: o cron retoma as paradas há mais de 10 min. */
    heartbeatAt: tstz("heartbeat_at"),
    finishedAt: tstz("finished_at"),
    deletedAt: tstz("deleted_at"),
  },
  (t) => [index("student_imports_created_idx").on(t.createdAt), index("student_imports_status_idx").on(t.status)],
);

/** Notas internas do produtor sobre o aluno (soft delete). */
export const STUDENT_NOTE_MAX = 2000;
export const studentNotes = pgTable(
  "student_notes",
  {
    id: id(),
    userId: ref("user_id").notNull(),
    authorId: ref("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    deletedAt: tstz("deleted_at"),
  },
  (t) => [index("student_notes_user_created_idx").on(t.userId, t.createdAt)],
);

// Pedidos de redefinição de senha: só o sha256 do token; uso único, 1 h (src/lib/auth/password-reset.ts).
export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: ref("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("password_resets_user_created_idx").on(t.userId, t.createdAt)],
);

// Falhas de login por sha256(e-mail normalizado + "|" + ip); ver src/lib/auth/rate-limit.ts.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    windowStart: tstz("window_start").notNull(),
  },
  (t) => [index("login_attempts_window_start_idx").on(t.windowStart)],
);

/** Fila de e-mails: grava primeiro, envia depois (after() da requisição e cron diário). */
export type EmailStatus = "queued" | "sent" | "failed" | "dead";
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    toEmail: text("to_email").notNull(),
    toName: text("to_name").notNull(),
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    status: text("status").$type<EmailStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sendAfter: tstz("send_after").notNull().defaultNow(),
    sentAt: tstz("sent_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    dedupeKey: text("dedupe_key").unique(),
  },
  (t) => [
    index("email_outbox_status_send_after_idx").on(t.status, t.sendAfter),
    index("email_outbox_sent_at_idx").on(t.sentAt),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: ref("user_id").notNull(),
    lessonId: ref("lesson_id").notNull(),
    completedAt: tstz("completed_at").notNull().defaultNow(),
  },
  // Relatórios agregam por aula/produto: o PK (user_id primeiro) não serve.
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] }), index("lesson_progress_lesson_idx").on(t.lessonId)],
);

/** Visualizações da aula (relatórios): no máximo 1 a cada 30 min por aluno e aula; admins e personificação não contam. */
export const lessonViews = pgTable(
  "lesson_views",
  {
    userId: ref("user_id").notNull(),
    lessonId: ref("lesson_id").notNull(),
    views: integer("views").notNull().default(1),
    firstViewedAt: tstz("first_viewed_at").notNull().defaultNow(),
    lastViewedAt: tstz("last_viewed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] }), index("lesson_views_lesson_idx").on(t.lessonId)],
);

export const lessonReactions = pgTable(
  "lesson_reactions",
  {
    userId: ref("user_id").notNull(),
    lessonId: ref("lesson_id").notNull(),
    value: smallint("value").notNull(), // 1 ou -1
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] }), index("lesson_reactions_lesson_idx").on(t.lessonId)],
);

/** Conteúdo programado: uma programação vale para os produtos ligados a ela (um produto em no máx. uma ativa). */
export const schedules = pgTable("schedules", {
  id: id(),
  name: text("name").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
  /** Última mudança no nome, nos produtos ou nas regras (coluna "Atualizado em"). */
  updatedAt: tstz("updated_at").notNull().defaultNow(),
  deletedAt: tstz("deleted_at"),
});

export const scheduleProducts = pgTable(
  "schedule_products",
  {
    scheduleId: ref("schedule_id").notNull(),
    productId: ref("product_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scheduleId, t.productId] }), index("schedule_products_product_idx").on(t.productId)],
);

/** Primeira visita do aluno a um produto grátis (sem registro de acesso): início dos "dias após o acesso". */
export const productFirstVisits = pgTable(
  "product_first_visits",
  {
    userId: ref("user_id").notNull(),
    productId: ref("product_id").notNull(),
    firstAt: tstz("first_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

/** Regra de liberação de um módulo ou aula: N dias após o início do acesso, ou numa data fixa. */
export const scheduleRules = pgTable(
  "schedule_rules",
  {
    id: id(),
    scheduleId: ref("schedule_id").notNull(),
    targetType: text("target_type", { enum: ["module", "lesson"] }).notNull(),
    targetId: ref("target_id").notNull(),
    mode: text("mode", { enum: ["days_after_access", "fixed_date"] }).notNull(),
    days: integer("days"),
    date: tstz("date"),
  },
  (t) => [uniqueIndex("schedule_rules_target_uq").on(t.scheduleId, t.targetType, t.targetId)],
);

/**
 * Aceite do termo de primeiro acesso da plataforma: uma linha por aluno, com o sha256 do HTML
 * aceito. Texto alterado → hash diferente → o aluno aceita de novo.
 */
export const platformTermsAcceptance = pgTable("platform_terms_acceptance", {
  userId: ref("user_id").primaryKey(),
  termsHash: text("terms_hash").notNull().default(""),
  acceptedAt: tstz("accepted_at").notNull().defaultNow(),
});

/** Aceite do termo do produto (uma vez por aluno e produto). */
export const termsAcceptance = pgTable(
  "terms_acceptance",
  {
    userId: ref("user_id").notNull(),
    productId: ref("product_id").notNull(),
    acceptedAt: tstz("accepted_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1), // sempre 1
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
});

export type Product = typeof products.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type DeliveryItem = typeof deliveryItems.$inferSelect;
export type Sale = typeof sales.$inferSelect;
