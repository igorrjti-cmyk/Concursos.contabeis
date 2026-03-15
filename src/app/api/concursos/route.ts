// src/app/api/concursos/route.ts
// Cache via Supabase (tabela cache_concursos) - TTL 6h
// Fallback para scraping ao vivo se Supabase nao estiver configurado

import { NextResponse } from "next/server";
import { scrapeAllConcursos } from "@/lib/scraper";
import { getSupabase } from "@/lib/supabase";
import type { Concurso } from "@/lib/scraper";

// Reclassifica status baseado na data atual — corrige cache desatualizado
function reclassificarCache(concursos: Concurso[]): Concurso[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return concursos
    .map(c => {
      // Recalcula diasRestantes sempre (data pode ter mudado desde o cache)
      let diasRestantes = c.diasRestantes;
      if (c.inscricaoAte && c.inscricaoAte !== "Ver edital" && c.inscricaoAte !== "-") {
        const partes = c.inscricaoAte.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (partes) {
          const ate = new Date(+partes[3], +partes[2] - 1, +partes[1]);
          diasRestantes = Math.ceil((ate.getTime() - hoje.getTime()) / 86_400_000);
        }
      }

      // Reclassifica status
      let status = c.status;

      // Descarta imediatamente concursos muito antigos (ano < ano atual - 1)
      const anoAtual = hoje.getFullYear();
      const inscricaoStr = c.inscricao || c.inscricaoAte || "";
      const anoEdital = inscricaoStr.match(/(\d{4})/g)?.map(Number).find(a => a > 2000);
      if (anoEdital && anoEdital < anoAtual - 1) {
        status = "Encerrado";
      }

      // Inscrições abertas → verifica se prazo passou
      if (status === "Inscricoes Abertas" && diasRestantes < 0) {
        status = "Previsto";
      }

      // Previsto/Aguardando Prova → verifica datas do edital
      if (status === "Previsto" || status === "Aguardando Prova") {
        if (c.dataProva && c.dataProva !== "-") {
          const [d, m, y] = c.dataProva.split("/").map(Number);
          if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            const dp = new Date(y, m - 1, d);
            if (dp >= hoje) {
              status = "Aguardando Prova";
            } else {
              // Prova passou — verifica resultado
              if (c.dataResultado && c.dataResultado !== "-") {
                const [dr, mr, yr] = c.dataResultado.split("/").map(Number);
                const dRes = new Date(yr, mr - 1, dr);
                if (dRes >= hoje) {
                  status = "Aguardando Prova";
                } else {
                  status = "Encerrado";
                }
              } else {
                status = "Encerrado";
              }
            }
          }
        } else {
          // Sem data de prova: descarta se inscrição encerrou há mais de 180 dias
          // Evita concursos antigos sem cronograma aparecerem como "Previsto"
          if (diasRestantes < -180) {
            status = "Encerrado";
          }
        }
      }

      return { ...c, status, diasRestantes };
    })
    .filter(c => c.status !== "Encerrado");
}

const CACHE_KEY = "concursos:v10"; // v4 = nova chave, invalida cache antigo
const CACHE_TTL_HORAS = 6;

interface CacheRow {
  chave: string;
  dados: { concursos: Concurso[]; atualizadoEm: string };
  atualizado: string;
}

// GET - retorna concursos (do cache ou scraping ao vivo)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    const sb = getSupabase();

    // 1. Tenta ler cache do Supabase
    if (sb && !forceRefresh) {
      const { data, error } = await sb
        .from("cache_concursos")
        .select("dados, atualizado")
        .eq("chave", CACHE_KEY)
        .single<CacheRow>();

      if (!error && data) {
        const idadeHoras = (Date.now() - new Date(data.atualizado).getTime()) / 3_600_000;
        if (idadeHoras < CACHE_TTL_HORAS) {
          const concursosReclassificados = reclassificarCache(data.dados.concursos);
          return NextResponse.json({
            ok: true,
            total: concursosReclassificados.length,
            atualizadoEm: data.dados.atualizadoEm,
            fromCache: true,
            concursos: concursosReclassificados,
          });
        }
      }
    }

    // 2. Scraping ao vivo
    const concursos = await scrapeAllConcursos();
    const atualizadoEm = new Date().toISOString();

    // 3. Persiste no Supabase (upsert)
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

// DELETE - limpa o cache do Supabase
export async function DELETE() {
  try {
    const sb = getSupabase();
    if (!sb) {
      return NextResponse.json(
        { ok: false, error: "Supabase nao configurado" },
        { status: 503 }
      );
    }
    const { error } = await sb
      .from("cache_concursos")
      .delete()
      .eq("chave", CACHE_KEY);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Cache limpo com sucesso" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
