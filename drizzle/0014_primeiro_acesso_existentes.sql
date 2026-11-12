-- Alunos que já entraram antes de first_access_at existir: o último acesso é a melhor aproximação.
-- Sem isso, o próximo login gravaria um "Primeiro acesso à plataforma" falso.
UPDATE "users" SET "first_access_at" = "last_access_at" WHERE "last_access_at" IS NOT NULL AND "first_access_at" IS NULL;
