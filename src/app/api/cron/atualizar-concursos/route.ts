// src/app/api/cron/atualizar-concursos/route.ts
// Cron diário (06:00) — força atualização do cache de concursos
// Configurado em vercel.json: "0 6 * * *"
// Roda ANTES do cron de notificações (08:00) para garantir dados frescos

import { NextResponse }       from "next/server";
import { scrapeAllConcursos } from "@/lib/scraper";
import { getSupabase }        from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 300;

const CACHE_KEY = "concursos:v19";

export async function GET(req: Request) {
  // Segurança: Vercel injeta este header nos cron jobs
  const authHeader = req.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const inicio = Date.now();

  try {
    // Scraping ao vivo — ignora cache existente
    const concursos = await scrapeAllConcursos();
    const atualizadoEm = new Date().toISOString();

    // Persiste no Supabase
    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.from("cache_concursos").upsert({
        chave: CACHE_KEY,
        dados: { concursos, atualizadoEm },
        atualizado: atualizadoEm,
      });

      if (error) {
        console.error("[CRON] Erro ao salvar cache:", error.message);
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    const duracaoMs = Date.now() - inicio;
    console.log(`[CRON] Cache atualizado: ${concursos.length} concursos em ${duracaoMs}ms`);

    return NextResponse.json({
      ok: true,
      total: concursos.length,
      atualizadoEm,
      duracaoMs,
    });
  } catch (err) {
    console.error("[CRON] Erro no scraping:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
