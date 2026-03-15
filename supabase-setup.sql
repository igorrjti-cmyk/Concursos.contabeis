-- ============================================================
-- SETUP DO BANCO — execute no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New query → cole e Execute)
-- ============================================================

-- ── 1. Tabela de cache dos concursos scrapeados ─────────────
CREATE TABLE IF NOT EXISTS cache_concursos (
  chave       TEXT PRIMARY KEY,          -- ex: 'concursos:v2'
  dados       JSONB         NOT NULL,    -- array de Concurso[]
  atualizado  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 2. Tabela de histórico de posts ────────────────────────
CREATE TABLE IF NOT EXISTS historico_posts (
  id          BIGSERIAL     PRIMARY KEY,
  concurso_id TEXT          NOT NULL,   -- slug do concurso
  cargo       TEXT          NOT NULL,
  orgao       TEXT          NOT NULL,
  estado      TEXT          NOT NULL,
  posted_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índice para busca rápida por concurso_id
CREATE INDEX IF NOT EXISTS idx_historico_concurso_id
  ON historico_posts (concurso_id, posted_at DESC);

-- ── 3. Row Level Security (RLS) ────────────────────────────
-- Bloqueamos acesso público — só a service_role key pode ler/gravar
ALTER TABLE cache_concursos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_posts  ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para a service_role (usada pelo servidor Next.js)
-- A service_role bypassa RLS por padrão no Supabase — não é necessário
-- criar políticas explícitas para ela. Mas criamos deny-all para anon:
CREATE POLICY "deny anon cache"    ON cache_concursos  FOR ALL TO anon USING (false);
CREATE POLICY "deny anon historico" ON historico_posts FOR ALL TO anon USING (false);
