-- ============================================================
-- SETUP DO BANCO — execute no SQL Editor do Supabase
-- Seguro para rodar múltiplas vezes (idempotente)
-- ============================================================

-- ── 1. Cache dos concursos scrapeados ──────────────────────
CREATE TABLE IF NOT EXISTS cache_concursos (
  chave       TEXT PRIMARY KEY,
  dados       JSONB         NOT NULL,
  atualizado  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 2. Histórico de posts publicados ───────────────────────
CREATE TABLE IF NOT EXISTS historico_posts (
  id          BIGSERIAL     PRIMARY KEY,
  concurso_id TEXT          NOT NULL,
  cargo       TEXT          NOT NULL,
  orgao       TEXT          NOT NULL,
  estado      TEXT          NOT NULL,
  posted_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_concurso_id
  ON historico_posts (concurso_id, posted_at DESC);

-- ── 3. Favoritos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favoritos (
  id          BIGSERIAL     PRIMARY KEY,
  concurso_id TEXT          NOT NULL UNIQUE,
  cargo       TEXT          NOT NULL,
  orgao       TEXT          NOT NULL,
  estado      TEXT          NOT NULL,
  nota        TEXT,                          -- anotação opcional
  criado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 4. Notificações por e-mail (controle de envios) ─────────
--   tipo: 'novo_concurso' | 'prazo_3dias' | 'resumo_semanal'
CREATE TABLE IF NOT EXISTS notificacoes_enviadas (
  id            BIGSERIAL     PRIMARY KEY,
  tipo          TEXT          NOT NULL,
  concurso_id   TEXT,                        -- NULL para resumo semanal
  enviado_em    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_tipo_data
  ON notificacoes_enviadas (tipo, enviado_em DESC);

CREATE INDEX IF NOT EXISTS idx_notif_concurso
  ON notificacoes_enviadas (concurso_id);

-- ── 5. Row Level Security ────────────────────────────────────
ALTER TABLE cache_concursos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE favoritos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes_enviadas    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny anon cache"      ON cache_concursos;
DROP POLICY IF EXISTS "deny anon historico"  ON historico_posts;
DROP POLICY IF EXISTS "deny anon favoritos"  ON favoritos;
DROP POLICY IF EXISTS "deny anon notif"      ON notificacoes_enviadas;

CREATE POLICY "deny anon cache"      ON cache_concursos       FOR ALL TO anon USING (false);
CREATE POLICY "deny anon historico"  ON historico_posts        FOR ALL TO anon USING (false);
CREATE POLICY "deny anon favoritos"  ON favoritos              FOR ALL TO anon USING (false);
CREATE POLICY "deny anon notif"      ON notificacoes_enviadas  FOR ALL TO anon USING (false);
