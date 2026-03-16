// src/app/api/cron/notificacoes/route.ts
// Cron diário (08:00) — verifica concursos novos e prazos encerrando
// Configurado em vercel.json: "0 8 * * *"

import { NextResponse }         from "next/server";
import { getSupabase }          from "@/lib/supabase";
import { emailNovoConcurso, emailAlertaPrazo } from "@/lib/email";
import type { Concurso }        from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Segurança: Vercel injeta este header nos cron jobs
  const authHeader = req.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase não configurado" });

  const resultados = { novos: 0, alertas: 0, erros: [] as string[] };

  try {
    // Busca concursos do cache
    const { data: cacheRow } = await sb
      .from("cache_concursos")
      .select("dados")
      .eq("chave", "concursos:v12")
      .single<{ dados: { concursos: Concurso[] } }>();

    if (!cacheRow?.dados?.concursos) {
      return NextResponse.json({ ok: true, message: "Cache vazio — nada a notificar" });
    }

    const concursos = cacheRow.dados.concursos;
    const hoje      = new Date();
    hoje.setHours(0, 0, 0, 0);

    // ── 1. Notificação de concursos NOVOS ──────────────────────────────────
    // "Novo" = foi capturado nas últimas 24h
    const ontemISO = new Date(hoje.getTime() - 86400000).toISOString();

    for (const c of concursos) {
      if (!c.dataCaptura || c.dataCaptura < ontemISO) continue;

      // Verifica se já enviamos notificação para este concurso
      const { data: jaEnviado } = await sb
        .from("notificacoes_enviadas")
        .select("id")
        .eq("tipo", "novo_concurso")
        .eq("concurso_id", c.id)
        .maybeSingle();

      if (jaEnviado) continue;

      const ok = await emailNovoConcurso(c);
      if (ok) {
        await sb.from("notificacoes_enviadas").insert({
          tipo: "novo_concurso",
          concurso_id: c.id,
        });
        resultados.novos++;
      }
    }

    // ── 2. Alerta de prazo (encerrando em até 3 dias) ──────────────────────
    const encerrando = concursos.filter(c =>
      c.status === "Inscricoes Abertas" &&
      c.diasRestantes >= 0 &&
      c.diasRestantes <= 3
    );

    if (encerrando.length > 0) {
      // Verifica se já enviamos alerta hoje
      const inicioHoje = hoje.toISOString();
      const { data: alertaHoje } = await sb
        .from("notificacoes_enviadas")
        .select("id")
        .eq("tipo", "prazo_3dias")
        .gte("enviado_em", inicioHoje)
        .maybeSingle();

      if (!alertaHoje) {
        const ok = await emailAlertaPrazo(encerrando);
        if (ok) {
          await sb.from("notificacoes_enviadas").insert({
            tipo: "prazo_3dias",
            concurso_id: null,
          });
          resultados.alertas++;
        }
      }
    }

  } catch (e) {
    resultados.erros.push(String(e));
  }

  return NextResponse.json({ ok: true, ...resultados });
}
