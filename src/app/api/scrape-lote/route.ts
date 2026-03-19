// src/app/api/scrape-lote/route.ts
// Scraping por lote — cada chamada processa UMA URL da lista e salva no Supabase.
// O frontend chama em sequência: lote=0, lote=1, lote=2... até total de URLs.
// Cada lote termina em ~5-15s, nunca estoura o timeout do Vercel.
//
// Fluxo:
//   GET /api/scrape-lote?lote=0        → scrapa /vagas/contador, salva parcial
//   GET /api/scrape-lote?lote=1        → scrapa /vagas/contadora, merge + salva
//   ...
//   GET /api/scrape-lote?lote=15&fim=1 → último lote, sinaliza conclusão
//
// O cache principal (concursos:v20) é atualizado a cada lote com merge dos
// resultados anteriores — o usuário já vê dados novos enquanto o resto carrega.

import { NextResponse }                          from "next/server";
import { scrapeListagem, scrapeDetalhe, VAGAS_URLS, filtrarCargosContabeis } from "@/lib/scraper";
import { getSupabase }                           from "@/lib/supabase";
import type { Concurso }                         from "@/lib/scraper";

export const runtime     = "nodejs";
export const maxDuration = 60;

const CACHE_KEY      = "concursos:v20"; // v20 = inclui CONCURSOS_URLS
const LOTE_KEY       = "scrape-lote:progresso";
const LIMITE_DETALHE = 8; // máx de detalhes por lote (evita timeout)

// URLs de concursos com inscrições encerradas mas prova futura ("Aguardando Prova")
const CONCURSOS_URLS_LOTE = [
  "/concursos/contador",
  "/concursos/contabilidade",
  "/concursos/auditor-fiscal",
  "/concursos/fiscal-de-tributos",
  "/concursos/tecnico-em-contabilidade",
  "/concursos/analista-contabil",
];

// Todas as URLs a processar em lotes: vagas ativas + concursos em andamento
const TODAS_URLS = [...VAGAS_URLS, ...CONCURSOS_URLS_LOTE];

// Reclassifica status com base nas datas de prova/resultado
function reclassificarStatus(
  status: Concurso["status"],
  dataProva: string,
  dataResultado: string
): Concurso["status"] {
  if (status === "Inscricoes Abertas") return status;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (dataProva && dataProva !== "-") {
    const [d, m, y] = dataProva.split("/").map(Number);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      const dp = new Date(y, m - 1, d);
      if (dp >= hoje) return "Aguardando Prova";
      if (dataResultado && dataResultado !== "-") {
        const [dr, mr, yr] = dataResultado.split("/").map(Number);
        const dRes = new Date(yr, mr - 1, dr);
        if (dRes >= hoje) return "Aguardando Prova";
      }
      return "Encerrado";
    }
  }
  if (dataResultado && dataResultado !== "-") {
    const [dr, mr, yr] = dataResultado.split("/").map(Number);
    if (!isNaN(dr) && !isNaN(mr) && !isNaN(yr)) {
      const dRes = new Date(yr, mr - 1, dr);
      if (dRes >= hoje) return "Aguardando Prova";
    }
  }
  return status;
}

function slugify(t: string) {
  return t.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const loteIdx = parseInt(searchParams.get("lote") ?? "0", 10);
  const isFim   = searchParams.get("fim") === "1";

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado" }, { status: 503 });
  }

  const urls = TODAS_URLS;
  const total = urls.length;

  if (loteIdx >= total) {
    return NextResponse.json({ ok: true, fim: true, total, lote: loteIdx });
  }

  const urlPath = urls[loteIdx];

  // ── 1. Carrega resultados parciais já salvos ──────────────────────────────
  let concursosAcumulados: Concurso[] = [];
  try {
    const { data: progData } = await sb
      .from("cache_concursos")
      .select("dados")
      .eq("chave", LOTE_KEY)
      .single();
    if (progData?.dados?.concursos) {
      concursosAcumulados = progData.dados.concursos;
    }
  } catch {
    // sem progresso anterior — começa do zero
  }

  // ── 2. Scrapa a URL deste lote ────────────────────────────────────────────
  const seen = new Set(concursosAcumulados.map(c => c.id));
  const novos: Concurso[] = [];

  try {
    const items = await scrapeListagem(urlPath);

    // Filtra antigos rapidamente (sem HTTP extra)
    const anoAtual = new Date().getFullYear();
    const candidatos = items.filter(item => {
      if (item.status === "Encerrado" && (item.diasRestantes ?? -999) < -60) return false;
      const key = item.id || slugify((item.cargo || "") + (item.orgao || ""));
      if (seen.has(key)) return false;
      // Descarta por ano rápido
      const inscricaoCheck = item.inscricao || item.inscricaoAte || "";
      if (inscricaoCheck && inscricaoCheck !== "Ver edital") {
        const anos = (inscricaoCheck.match(/\d{4}/g) || []).map(Number).filter(a => a > 2000);
        if (anos.length > 0 && Math.max(...anos) < anoAtual) return false;
      }
      return true;
    });

    // Busca detalhes dos candidatos (até LIMITE_DETALHE em paralelo)
    const lote = candidatos.slice(0, LIMITE_DETALHE);
    const detalhes = await Promise.all(
      lote.map(item =>
        item.linkNoticia
          ? scrapeDetalhe(item.linkNoticia)
          : Promise.resolve({ dataProva: "-", dataResultado: "-", banca: "-", linkEdital: "", cargosContabeis: [], requisito: "-", ehProcessoSeletivo: false })
      )
    );

    for (let i = 0; i < lote.length; i++) {
      const item = lote[i];
      const det  = detalhes[i];

      if (det.ehProcessoSeletivo) continue;

      // Descarta se a data de prova já passou (ano anterior ao atual)
      const anoLote = new Date().getFullYear();
      const dataProvaFinal = det.dataProva !== "-" ? det.dataProva : item.dataProva ?? "-";
      if (dataProvaFinal && dataProvaFinal !== "-") {
        const mPv = dataProvaFinal.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (mPv) {
          const anoPv = parseInt(mPv[3]);
          const dtPv = new Date(anoPv, parseInt(mPv[2]) - 1, parseInt(mPv[1]));
          const hojeL = new Date(); hojeL.setHours(0,0,0,0);
          if (dtPv < hojeL && anoPv <= anoLote - 1) continue;
        }
      }

      // "Vários Cargos" — passa sempre que veio de URL contábil (urlPath já é /vagas/contador etc.)
      // O filtro fino já foi feito pelo scrapeListagem + scrapeDetalhe do scraper.ts
      // Aqui só rejeitamos se NÃO tem cargo contábil E o título não menciona nenhuma área contábil
      const CONTABIL_KW = ["contador", "contabil", "contábil", "fiscal", "auditor", "tribut", "contabilidade"];
      const tituloOuCargo = ((item.cargo || "") + " " + (item.linkNoticia || "")).toLowerCase();
      const temKwContabil = CONTABIL_KW.some(kw => tituloOuCargo.includes(kw));
      // Concursos de URLs contábeis sempre passam (urlPath = /vagas/contador, etc.)
      const urlEContabil = CONTABIL_KW.some(kw => urlPath.includes(kw));
      if (
        (item.cargo === "Vários Cargos" || item.cargo === "varios cargos") &&
        det.cargosContabeis.length === 0 &&
        !temKwContabil &&
        !urlEContabil
      ) continue;

      const key = item.id || slugify((item.cargo || "") + (item.orgao || ""));
      if (seen.has(key)) continue;
      seen.add(key);

      const cargoDisplay = det.cargosContabeis.length > 0 && item.cargo === "Vários Cargos"
        ? det.cargosContabeis.join(", ")
        : filtrarCargosContabeis(item.cargo || "-");

      // Itens vindos de /concursos/ (inscrições encerradas) começam como "Previsto"
      // e são reclassificados para "Aguardando Prova" se tiverem prova futura
      const ehUrlConcursos = CONCURSOS_URLS_LOTE.some(u => urlPath.startsWith(u));
      const statusBase = ehUrlConcursos ? "Previsto" : (item.status as Concurso["status"]);
      const statusFinal = reclassificarStatus(
        statusBase,
        det.dataProva !== "-" ? det.dataProva : item.dataProva ?? "-",
        det.dataResultado !== "-" ? det.dataResultado : item.dataResultado ?? "-"
      );

      // Descarta encerrados que vieram de /concursos/ sem prova futura
      if (statusFinal === "Encerrado") continue;

      // Recalcula nível: cargos de Contador/Auditor são sempre Superior
      const nivelContabil = (() => {
        const cd = cargoDisplay.toLowerCase();
        const ehSuperiorKw = ["contador", "contadora", "auditor", "analista contábil",
          "analista contabil", "fiscal de tribut", "fiscal de rendas"].some(kw => cd.includes(kw));
        if (ehSuperiorKw) return "Superior";
        if (cd.includes("técnico em contabilidade") || cd.includes("tecnico em contabilidade")) return "Médio/Técnico";
        return item.nivel || "Superior";
      })();

      novos.push({
        ...item,
        id:             key,
        cargo:          cargoDisplay,
        nivel:          nivelContabil,
        status:         statusFinal,
        banca:          det.banca !== "-" ? det.banca : item.banca ?? "-",
        dataProva:      det.dataProva !== "-" ? det.dataProva : item.dataProva ?? "-",
        dataResultado:  det.dataResultado !== "-" ? det.dataResultado : item.dataResultado ?? "-",
        linkEdital:     det.linkEdital || item.linkEdital || item.linkNoticia || "",
        cargosContabeis: det.cargosContabeis,
      } as Concurso);
    }
  } catch (err) {
    console.error(`[LOTE ${loteIdx}] Erro em ${urlPath}:`, err);
    // Não falha — apenas continua sem os itens deste lote
  }

  // ── 3. Merge e salva progresso ────────────────────────────────────────────
  const merged = [...concursosAcumulados, ...novos];
  const atualizadoEm = new Date().toISOString();

  // Salva progresso parcial
  await sb.from("cache_concursos").upsert({
    chave:      LOTE_KEY,
    dados:      { concursos: merged, atualizadoEm, loteAtual: loteIdx + 1, totalLotes: total },
    atualizado: atualizadoEm,
  });

  // Se é o último lote (ou &fim=1), promove para o cache principal
  const ehUltimo = isFim || loteIdx === total - 1;
  if (ehUltimo) {
    await sb.from("cache_concursos").upsert({
      chave:      CACHE_KEY,
      dados:      { concursos: merged, atualizadoEm },
      atualizado: atualizadoEm,
    });
    // Limpa progresso
    await sb.from("cache_concursos").delete().eq("chave", LOTE_KEY);
  }

  return NextResponse.json({
    ok:          true,
    lote:        loteIdx,
    totalLotes:  total,
    novosNesteLote: novos.length,
    totalAcumulado: merged.length,
    fim:         ehUltimo,
    atualizadoEm,
  });
}
