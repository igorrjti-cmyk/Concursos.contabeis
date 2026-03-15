// src/app/api/concursos/route.ts
// Cache via Supabase (tabela cache_concursos) — TTL 6h
// Fallback para scraping ao vivo se Supabase não estiver configurado

import { NextResponse } from "next/server";
import { scrapeAllConcursos } from "@/lib/scraper";
import { getSupabase } from "@/lib/supabase";
import type { Concurso } from "@/lib/scraper";

const CACHE_KEY = "concursos:v2";
const CACHE_TTL_HORAS = 6;

interface CacheRow {
  chave: string;
  dados: { concursos: Concurso[]; atualizadoEm: string };
  atualizado: string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  try {
    const sb = getSupabase();

    // ── 1. Tenta ler cache do Supabase ──────────────────────────────────────
    if (sb && !forceRefresh) {
      const { data, error } = await sb
        .from("cache_concursos")
        .select("dados, atualizado")
        .eq("chave", CACHE_KEY)
        .single<CacheRow>();

      if (!error && data) {
        const idadeHoras = (Date.now() - new Date(data.atualizado).getTime()) / 3_600_000;
        if (idadeHoras < CACHE_TTL_HORAS) {
          return NextResponse.json({
            ok: true,
            total: data.dados.concursos.length,
            atualizadoEm: data.dados.atualizadoEm,
            fromCache: true,
            concursos: data.dados.concursos,
          });
        }
      }
    }

    // ── 2. Scraping ao vivo ─────────────────────────────────────────────────
    const concursos = await scrapeAllConcursos();
    const atualizadoEm = new Date().toISOString();

    // ── 3. Persiste no Supabase (upsert) ────────────────────────────────────
    if (sb) {
      await sb.from("cache_concursos").upsert({
        chave: CACHE_KEY,
        dados: { concursos, atualizadoEm },
        atualizado: atualizadoEm,
      });
    }

    return NextResponse.json({
      ok: true,
      total: concursos.length,
      atualizadoEm,
      fromCache: false,
      concursos,
    });
  } catch (err) {
    console.error("Erro no scraping:", err);
    return NextResponse.json(
      { ok: false, error: "Falha ao buscar concursos" },
      { status: 500 }
    );
  }
}
