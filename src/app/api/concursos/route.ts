// src/app/api/concursos/route.ts
// Cache via Supabase (tabela cache_concursos) - TTL 6h
// CORREÇÃO: GET nunca faz scraping ao vivo — retorna cache mesmo expirado (stale).
// O scraping fica exclusivamente no cron ou no fluxo scrape-lote iniciado pelo admin.

import { NextResponse } from "next/server";
import { scrapeAllConcursos } from "@/lib/scraper";
import { getSupabase } from "@/lib/supabase";
import type { Concurso } from "@/lib/scraper";

export const runtime     = "nodejs";
export const maxDuration = 300;

// Reclassifica status baseado na data atual — corrige cache desatualizado
function reclassificarCache(concursos: Concurso[]): Concurso[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return concursos
    .map(c => {
      let diasRestantes = c.diasRestantes;
      if (c.inscricaoAte && c.inscricaoAte !== "Ver edital" && c.inscricaoAte !== "-") {
        const partes = c.inscricaoAte.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (partes) {
          const ate = new Date(+partes[3], +partes[2] - 1, +partes[1]);
          diasRestantes = Math.ceil((ate.getTime() - hoje.getTime()) / 86_400_000);
        }
      }

      let status = c.status;
      const anoAtual = hoje.getFullYear();

      if (c.dataProva && c.dataProva !== "-") {
        const provaParts = c.dataProva.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (provaParts) {
          const dtProva = new Date(
            parseInt(provaParts[3]),
            parseInt(provaParts[2]) - 1,
            parseInt(provaParts[1])
          );
          dtProva.setHours(0, 0, 0, 0);
          if (dtProva < hoje) {
            return { ...c, status: "Encerrado" as const, diasRestantes };
          }
        }
      }

      const todasDatas = [
        c.inscricao || "",
        c.inscricaoAte || "",
        c.dataProva || "",
        c.dataResultado || "",
      ].join(" ");

      const anosEncontrados = (todasDatas.match(/\d{4}/g) || [])
        .map(Number)
        .filter(a => a >= 2010 && a <= anoAtual + 2);

      if (anosEncontrados.length > 0) {
        const anoMaisRecente = Math.max(...anosEncontrados);
        if (anoMaisRecente < anoAtual) {
          status = "Encerrado";
        }
      } else {
        if (diasRestantes < -30) {
          status = "Encerrado";
        }
      }

      if (status === "Inscricoes Abertas" && diasRestantes < 0) {
        if (c.dataProva && c.dataProva !== "-") {
          const [dp, mp, yp] = c.dataProva.split("/").map(Number);
          if (!isNaN(dp) && !isNaN(mp) && !isNaN(yp)) {
            const dtProva = new Date(yp, mp - 1, dp);
            if (dtProva >= hoje) {
              status = "Aguardando Prova";
            } else {
              status = "Encerrado";
            }
          } else {
            status = "Encerrado";
          }
        } else {
          status = "Encerrado";
        }
      }

      if (status === "Aguardando Prova") {
        if (c.dataProva && c.dataProva !== "-") {
          const [d, m, y] = c.dataProva.split("/").map(Number);
          if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            const dp = new Date(y, m - 1, d);
            if (dp >= hoje) {
              status = "Aguardando Prova";
            } else {
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
          if (diasRestantes < -14) {
            status = "Encerrado";
          }
        }
      }

      return { ...c, status, diasRestantes };
    })
    .filter(c => c.status !== "Encerrado");
}

const CACHE_KEY = "concursos:v20";
const CACHE_TTL_HORAS = 6;

interface CacheRow {
  chave: string;
  dados: { concursos: Concurso[]; atualizadoEm: string };
  atualizado: string;
}

// GET - retorna concursos do cache (válido ou stale).
// NUNCA faz scraping ao vivo — evita travar o admin no loading.
// Se não houver cache nenhum, retorna ok: false para o admin iniciar scrape-lote.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    const sb = getSupabase();

    if (sb && !forceRefresh) {
      const { data, error } = await sb
        .from("cache_concursos")
        .select("dados, atualizado")
        .eq("chave", CACHE_KEY)
        .single<CacheRow>();

      if (!error && data) {
        const idadeHoras = (Date.now() - new Date(data.atualizado).getTime()) / 3_600_000;
        const stale = idadeHoras >= CACHE_TTL_HORAS;
        const concursosReclassificados = reclassificarCache(data.dados.concursos);

        // Retorna cache mesmo expirado — nunca trava aqui fazendo scraping
        return NextResponse.json({
          ok: true,
          total: concursosReclassificados.length,
          atualizadoEm: data.dados.atualizadoEm,
          fromCache: true,
          stale,           // true = cache expirado, admin pode atualizar em background
          concursos: concursosReclassificados,
        });
      }
    }

    // Sem cache nenhum no Supabase: informa o admin para iniciar scrape-lote
    // (não fazemos scraping ao vivo aqui para não travar)
    return NextResponse.json({
      ok: false,
      semCache: true,
      error: "Sem cache disponível",
    });

  } catch (err: unknown) {
    console.error("Erro ao buscar cache:", err);
    return NextResponse.json(
      { ok: false, error: "Falha ao acessar cache" },
      { status: 500 }
    );
  }
}

// POST - scraping ao vivo e persistência no cache (usado pelo cron)
export async function POST() {
  try {
    const concursos = await scrapeAllConcursos();
    const atualizadoEm = new Date().toISOString();
    const sb = getSupabase();

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
  } catch (err: unknown) {
    console.error("Erro no scraping (POST):", err);
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
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
