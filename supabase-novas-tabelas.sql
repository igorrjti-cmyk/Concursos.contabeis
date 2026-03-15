-- ============================================================
-- Execute no Supabase → SQL Editor → New query → Run
-- Cria apenas as tabelas novas (seguro para rodar)
-- ============================================================

-- ── Favoritos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favoritos (
  id          BIGSERIAL     PRIMARY KEY,
  concurso_id TEXT          NOT NULL UNIQUE,
  cargo       TEXT          NOT NULL,
  orgao       TEXT          NOT NULL,
  estado      TEXT          NOT NULL,
  nota        TEXT,
  criado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Notificações enviadas ────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes_enviadas (
  id          BIGSERIAL     PRIMARY KEY,
  tipo        TEXT          NOT NULL,
  concurso_id TEXT,
  enviado_em  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_tipo_data
  ON notificacoes_enviadas (tipo, enviado_em DESC);

CREATE INDEX IF NOT EXISTS idx_notif_concurso
  ON notificacoes_enviadas (concurso_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE favoritos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes_enviadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny anon favoritos" ON favoritos;
DROP POLICY IF EXISTS "deny anon notif"     ON notificacoes_enviadas;

CREATE POLICY "deny anon favoritos" ON favoritos             FOR ALL TO anon USING (false);
CREATE POLICY "deny anon notif"     ON notificacoes_enviadas FOR ALL TO anon USING (false);
