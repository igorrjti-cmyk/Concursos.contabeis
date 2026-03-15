-- ============================================================
-- SETUP DO BANCO — execute no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New query → cole e Execute)
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

-- ── 3. Fila de agendamentos para o Instagram ───────────────
--   status: 'pendente' | 'publicando' | 'publicado' | 'erro'
--   formato: 'feed' | 'stories'
--   agendado_para: NULL = publicar o quanto antes
CREATE TABLE IF NOT EXISTS agendamentos (
  id              BIGSERIAL     PRIMARY KEY,
  concurso_id     TEXT          NOT NULL,
  cargo           TEXT          NOT NULL,
  orgao           TEXT          NOT NULL,
  estado          TEXT          NOT NULL,
  legenda         TEXT          NOT NULL,
  formato         TEXT          NOT NULL DEFAULT 'feed',
  status          TEXT          NOT NULL DEFAULT 'pendente',
  agendado_para   TIMESTAMPTZ,
  publicado_em    TIMESTAMPTZ,
  erro_msg        TEXT,
  tentativas      INT           NOT NULL DEFAULT 0,
  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_status
  ON agendamentos (status, agendado_para ASC NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_agendamentos_concurso
  ON agendamentos (concurso_id);

-- ── 4. Row Level Security ───────────────────────────────────
ALTER TABLE cache_concursos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_posts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos     ENABLE ROW LEVEL SECURITY;

-- service_role bypassa RLS — bloqueamos apenas anon
CREATE POLICY "deny anon cache"
  ON cache_concursos FOR ALL TO anon USING (false);
CREATE POLICY "deny anon historico"
  ON historico_posts FOR ALL TO anon USING (false);
CREATE POLICY "deny anon agendamentos"
  ON agendamentos FOR ALL TO anon USING (false);
