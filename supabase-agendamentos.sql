-- Execute no SQL Editor do Supabase
-- Cria (ou atualiza) a tabela de agendamentos com suporte a imagens base64

CREATE TABLE IF NOT EXISTS agendamentos_posts (
  id               BIGSERIAL     PRIMARY KEY,
  concurso_id      TEXT          NOT NULL,
  cargo            TEXT          NOT NULL,
  orgao            TEXT          NOT NULL,
  estado           TEXT          NOT NULL,
  modo             TEXT          NOT NULL CHECK (modo IN ('feed','stories','ambos')),
  agendado_para    TIMESTAMPTZ   NOT NULL,
  -- Imagens geradas no navegador (base64 PNG) — limpas após publicação
  feed_base64      TEXT,
  stories_base64   TEXT,
  legenda          TEXT,
  -- Resultado da publicação
  publicado        BOOLEAN       NOT NULL DEFAULT false,
  publicado_em     TIMESTAMPTZ,
  post_id_feed     TEXT,
  post_id_stories  TEXT,
  criado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Se a tabela já existe, adiciona as colunas que faltam
ALTER TABLE agendamentos_posts ADD COLUMN IF NOT EXISTS feed_base64     TEXT;
ALTER TABLE agendamentos_posts ADD COLUMN IF NOT EXISTS stories_base64  TEXT;
ALTER TABLE agendamentos_posts ADD COLUMN IF NOT EXISTS legenda         TEXT;

CREATE INDEX IF NOT EXISTS idx_agendamentos_data      ON agendamentos_posts (agendado_para);
CREATE INDEX IF NOT EXISTS idx_agendamentos_publicado ON agendamentos_posts (publicado);

ALTER TABLE agendamentos_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access agendamentos" ON agendamentos_posts;
CREATE POLICY "service role full access agendamentos"
  ON agendamentos_posts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
