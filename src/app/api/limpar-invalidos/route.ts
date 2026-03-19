// src/app/api/limpar-invalidos/route.ts
// Endpoint de emergência: lê o cache atual do Supabase,
// remove concursos com dataProva já passada, e salva de volta.
// Chamar: GET /api/limpar-invalidos
// Não precisa de novo scraping — apenas limpa o cache existente.

import { NextResponse } from "next/server";
import { getSupabase }  from "@/lib/supabase";
import type { Concurso } from "@/lib/scraper";

export const runtime     = "nodejs";
export const maxDuration = 30;

const CACHE_KEY = "concursos:v20";

function provaPassou(dataProva: string): boolean {
  if (!dataProva || dataProva === "-") return false;
  const m = dataProva.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return false;
  const dt = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  dt.setHours(0, 0, 0, 0);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return dt < hoje;
}

export async function GET() {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado" }, { status: 503 });
  }

  // 1. Lê o cache atual
  const { data, error } = await sb
    .from("cache_concursos")
    .select("dados, atualizado")
    .eq("chave", CACHE_KEY)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Cache não encontrado" }, { status: 404 });
  }

  const concursosAntes: Concurso[] = data.dados?.concursos ?? [];

  // 2. Filtra inválidos
  const removidos: string[] = [];
  const concursosDepois = concursosAntes.filter(c => {
    if (provaPassou(c.dataProva)) {
      removidos.push(`${c.cargo} - ${c.orgao} (prova: ${c.dataProva})`);
      return false;
    }
    // Remove também se status Encerrado
    if (c.status === "Encerrado") {
      removidos.push(`${c.cargo} - ${c.orgao} (status: Encerrado)`);
      return false;
    }
    return true;
  });

  if (removidos.length === 0) {
    return NextResponse.json({
      ok: true,
      mensagem: "Nenhum concurso inválido encontrado no cache",
      total: concursosAntes.length,
    });
  }

  // 3. Salva de volta sem os inválidos
  const atualizadoEm = new Date().toISOString();
  const { error: saveError } = await sb.from("cache_concursos").upsert({
    chave:      CACHE_KEY,
    dados:      { concursos: concursosDepois, atualizadoEm },
    atualizado: atualizadoEm,
  });

  if (saveError) {
    return NextResponse.json({ ok: false, error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:       true,
    antes:    concursosAntes.length,
    depois:   concursosDepois.length,
    removidos,
    atualizadoEm,
  });
}
