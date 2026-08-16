// src/app/api/cron/gerar-agendamentos-automaticos/route.ts
// Cron diário — roda LOGO DEPOIS de "atualizar-concursos".
// Detecta concursos novos (mesmo critério do cron de notificações: nunca
// publicados, agendados ou notificados), gera o card (feed + stories) e a
// legenda automaticamente no servidor, e cria o agendamento no Supabase.
// A partir daí, o cron "publicar-agendados" cuida de postar no Instagram —
// sem qualquer clique manual no painel.
//
// Limite diário configurável via env MAX_POSTS_AUTOMATICOS_DIA (padrão: 3),
// para não parecer spam na conta do Instagram.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { renderCardServer } from "@/lib/card-renderer-server";
import { gerarLegenda } from "@/lib/legenda";
import { emailErroCron } from "@/lib/email";
import type { Concurso } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_POSTS_DIA = Number(process.env.MAX_POSTS_AUTOMATICOS_DIA ?? 3);
// Espaçamento entre os posts do dia (em horas) — evita publicar tudo de uma vez.
const INTERVALO_HORAS = Number(process.env.INTERVALO_HORAS_POSTS ?? 4);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase não configurado" });

  const criados: string[] = [];
  const erros: string[] = [];

  try {
    const { data: cacheRow } = await sb
      .from("cache_concursos")
      .select("dados")
      .eq("chave", "concursos:v20")
      .single<{ dados: { concursos: Concurso[] } }>();

    const concursos = cacheRow?.dados?.concursos ?? [];
    if (concursos.length === 0) {
      return NextResponse.json({ ok: true, message: "Cache vazio — nada para agendar" });
    }

    // Mesmo critério de "novo" usado no cron de notificações: nunca visto
    // em historico_posts, agendamentos_posts ou notificacoes_enviadas.
    const [resHistorico, resAgendamentos] = await Promise.all([
      sb.from("historico_posts").select("concurso_id"),
      sb.from("agendamentos_posts").select("concurso_id"),
    ]);

    const idsJaVistos = new Set<string>([
      ...(resHistorico.data ?? []).map(r => r.concurso_id).filter(Boolean),
      ...(resAgendamentos.data ?? []).map(r => r.concurso_id).filter(Boolean),
    ]);

    // Só considera concursos com inscrições realmente abertas — evita
    // agendar posts de concursos já encerrados ou apenas previstos.
    const candidatos = concursos.filter(
      c => !idsJaVistos.has(c.id) && c.status === "Inscricoes Abertas"
    );

    // Prioriza os que encerram mais cedo (mais relevante divulgar primeiro).
    candidatos.sort((a, b) => a.diasRestantes - b.diasRestantes);

    const selecionados = candidatos.slice(0, MAX_POSTS_DIA);

    for (let i = 0; i < selecionados.length; i++) {
      const c = selecionados[i];
      try {
        const feedBase64 = renderCardServer(c, "feed");
        const storiesBase64 = renderCardServer(c, "stories");
        const legenda = gerarLegenda(c);

        const agendadoPara = new Date(Date.now() + i * INTERVALO_HORAS * 60 * 60 * 1000);

        const { error } = await sb.from("agendamentos_posts").insert({
          concurso_id: c.id,
          cargo: c.cargo,
          orgao: c.orgao,
          estado: c.estado,
          cidade: c.cidade ?? "",
          uf: c.uf ?? c.estado,
          modo: "ambos",
          agendado_para: agendadoPara.toISOString(),
          feed_base64: feedBase64,
          stories_base64: storiesBase64,
          legenda,
          publicado: false,
        });

        if (error) {
          erros.push(`${c.id}: ${error.message}`);
        } else {
          criados.push(c.id);
        }
      } catch (e: unknown) {
        erros.push(`${c.id}: ${String(e)}`);
      }
    }
  } catch (e: unknown) {
    erros.push(String(e));
  }

  if (erros.length > 0) {
    await emailErroCron("gerar-agendamentos-automaticos", erros);
  }

  return NextResponse.json({
    ok: erros.length === 0,
    agendamentosCriados: criados.length,
    ids: criados,
    erros: erros.length > 0 ? erros : undefined,
  });
}
