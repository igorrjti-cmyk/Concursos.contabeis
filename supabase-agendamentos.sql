-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS agendamentos_posts (
  id               BIGSERIAL     PRIMARY KEY,
  concurso_id      TEXT          NOT NULL,
  cargo            TEXT          NOT NULL,
  orgao            TEXT          NOT NULL,
  estado           TEXT          NOT NULL,
  modo             TEXT          NOT NULL CHECK (modo IN ('feed','stories','ambos')),
  agendado_para    TIMESTAMPTZ   NOT NULL,
  publicado        BOOLEAN       NOT NULL DEFAULT false,
  publicado_em     TIMESTAMPTZ,
  post_id_feed     TEXT,
  post_id_stories  TEXT,
  criado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos_posts (agendado_para);
CREATE INDEX IF NOT EXISTS idx_agendamentos_publicado ON agendamentos_posts (publicado);

ALTER TABLE agendamentos_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access agendamentos" ON agendamentos_posts;
CREATE POLICY "service role full access agendamentos"
  ON agendamentos_posts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
