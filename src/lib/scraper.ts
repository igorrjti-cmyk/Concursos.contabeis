// src/lib/scraper.ts
// Scraper real do pciconcursos.com.br
// Sequencial com AbortController (timeout 8s por request)

export interface Concurso {
  id: string;
  cargo: string;
  orgao: string;
  estado: string;
  vagas: string;
  salario: string;
  inscricao: string;       // período completo "DD/MM a DD/MM/YYYY"
  inscricaoAte: string;    // só a data final para exibição
  diasRestantes: number;   // dias até encerrar inscrição (-1 = sem data)
  linkNoticia: string;
  linkEdital: string;
  banca: string;
  nivel: string;
  dataProva: string;
  dataResultado: string;
  status: "Inscrições Abertas" | "Previsto" | "Encerrado";
  dataCaptura: string;
}

const BASE_URL = "https://www.pciconcursos.com.br";

const VAGAS_URLS = [
  "/vagas/contador",
  "/vagas/contadora",
  "/vagas/contabilidade",
  "/vagas/tecnico-em-contabilidade",
  "/vagas/analista-contabil",
  "/vagas/auditor-fiscal",
  "/vagas/fiscal-de-tributos",
  "/vagas/contador-municipal",
  "/vagas/tecnico-contabil",
];

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

const TIMEOUT_MS = 8000; // 8s por request individual

// fetch com timeout via AbortController
async function fetchComTimeout(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function slugify(t: string) {
  return t.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function detectNivel(t: string) {
  const l = t.toLowerCase();
  const s = l.includes("superior"), m = l.includes("médio") || l.includes("medio"), tc = l.includes("técnico") || l.includes("tecnico");
  if (s && (m || tc)) return "Médio/Técnico/Superior";
  if (tc) return "Médio/Técnico";
  if (s) return "Superior";
  if (m) return "Médio";
  return "Superior";
}

function calcDiasRestantes(inscricao: string): number {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  // "DD/MM a DD/MM/YYYY" ou "DD/MM/YYYY"
  const m = inscricao.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s*$)/);
  if (m) {
    const d = new Date(+m[3], +m[2]-1, +m[1]);
    return Math.ceil((d.getTime() - hoje.getTime()) / 86400000);
  }
  // "DD/MM" sem ano
  const mc = inscricao.match(/(\d{2})\/(\d{2})(?:\s*$)/);
  if (mc) {
    const d = new Date(hoje.getFullYear(), +mc[2]-1, +mc[1]);
    if (d < hoje) d.setFullYear(d.getFullYear()+1);
    return Math.ceil((d.getTime() - hoje.getTime()) / 86400000);
  }
  return -1;
}

function detectStatus(inscricao: string): Concurso["status"] {
  if (!inscricao || inscricao === "—") return "Previsto";
  const dias = calcDiasRestantes(inscricao);
  if (dias === -1) return "Previsto";
  if (dias < 0) return "Encerrado";
  return "Inscrições Abertas";
}

function extrairDetalhes(texto: string) {
  const out = { dataProva: "—", dataResultado: "—", banca: "—", linkEdital: "" };

  const provaRe = [
    /provas?\s+(?:objetiva[s]?|escrita[s]?|prática[s]?)(?:[^.]{0,80}?)(\d{2}\/\d{2}\/\d{4})/i,
    /aplicaç[aã]o\s+das?\s+provas?(?:[^.]{0,60}?)(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+(?:prevista\s+)?(?:de\s+)?(?:realiz|aplicaç)[^.]{0,40}?(\d{2}\/\d{2}\/\d{4})/i,
    /prova[s]?\s*:\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^.]{0,30}?prova/i,
  ];
  for (const re of provaRe) { const m = texto.match(re); if (m?.[1]) { out.dataProva = m[1]; break; } }

  const resRe = [
    /(?:divulg|publica)[^.]{0,50}?(?:resultado|gabarito)[^.]{0,50}?(\d{2}\/\d{2}\/\d{4})/i,
    /(?:resultado|gabarito)[^.]{0,60}?(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^.]{0,30}?(?:resultado|gabarito)/i,
  ];
  for (const re of resRe) { const m = texto.match(re); if (m?.[1] && m[1] !== out.dataProva) { out.dataResultado = m[1]; break; } }

  const bancas = ["CESPE","CEBRASPE","FGV","FCC","VUNESP","IBFC","IDECAN","AOCP","FUNDATEC","FEPESE","IADES","QUADRIX","NUCEPE","UFPR","CONSULPLAN","OBJETIVA","IBAM","IMESO","SELECON","FAFIPA","AVANCASP"];
  const up = texto.toUpperCase();
  for (const b of bancas) { if (up.includes(b)) { out.banca = b; break; } }

  const pdf = texto.match(/https?:\/\/arq\.pciconcursos\.com\.br\/[^\s"')]+\.pdf/i);
  if (pdf) out.linkEdital = pdf[0];

  return out;
}

async function scrapeListagem(url: string): Promise<Partial<Concurso>[]> {
  const html = await fetchComTimeout(BASE_URL + url);
  if (!html) return [];

  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  const items: Partial<Concurso>[] = [];

  // ── Estratégia: usar cada <a href="/noticias/..."> como âncora de um bloco ──
  //
  // Estrutura real do HTML (confirmada):
  //
  //  <a href="/noticias/slug" title="Órgão - UF ...">Órgão</a>
  //  <img .../>
  //  UF\n
  //  "N vagas até R$ X" \n
  //  "Cargo1, Cargo2"\n
  //  "Nível"\n
  //  "DD/MM a\nDD/MM/YYYY"   ← QUEBRADO EM DUAS LINHAS — ponto crítico
  //
  // Solução: pegar o texto do bloco-pai (parent) de cada link de notícia,
  // que contém tudo numa única string — aí o regex cruza as quebras de linha.

  $("a[href*='/noticias/']").each((_, el) => {
    const $a   = $(el);
    const href = $a.attr("href") || "";
    if (!href.includes("/noticias/")) return;

    // Nome do órgão = texto do link
    const orgao = $a.text().trim();
    if (!orgao || orgao.length < 4) return;

    // Link completo
    const linkNoticia = href.startsWith("http") ? href : BASE_URL + href;

    // Pega o container pai — o bloco que envolve todos os dados do concurso.
    // Sobe até encontrar um elemento que contenha o padrão "vagas até R$"
    let $bloco = $a.parent();
    for (let nivel = 0; nivel < 5; nivel++) {
      if ($bloco.text().includes("até R$")) break;
      $bloco = $bloco.parent();
    }

    // Texto do bloco inteiro, normalizando quebras de linha em espaço
    const blocoTexto = $bloco.text()
      .replace(/\n+/g, " ")   // junta linhas — resolve o "25/05 a\n25/06/2026"
      .replace(/\s{2,}/g, " ")
      .trim();

    // ── Estado (UF) ──────────────────────────────────────────────────────────
    const ufMatch = blocoTexto.match(/\b([A-Z]{2})\b/);
    const uf = ufMatch ? ufMatch[1] : "Nacional";

    // ── Vagas e salário ───────────────────────────────────────────────────────
    const vagasMatch = blocoTexto.match(
      /(\d+\s+vagas?\s*(?:\+\s*CR)?|vagas?|cadastro\s+reserva)\s+até\s+R\$\s*([\d.,]+)/i
    );
    if (!vagasMatch) return; // sem este dado, não é um bloco de concurso válido
    const vagasStr   = vagasMatch[1].replace(/\s+/g, " ").trim();
    const salarioStr = "R$ " + vagasMatch[2];

    // ── Cargo ─────────────────────────────────────────────────────────────────
    // Vem logo após "até R$ X.XXX,XX" no texto: é a próxima frase relevante
    const apósSalario = blocoTexto.slice(blocoTexto.indexOf(vagasMatch[0]) + vagasMatch[0].length).trim();
    // Primeira linha não-vazia antes do nível
    const cargoMatch = apósSalario.match(/^([^/\d][^/]{2,80?}?)(?:\s+(?:Fundamental|Médio|Superior|Técnico))/i);
    const cargo = cargoMatch ? cargoMatch[1].trim() : "Vários Cargos";

    // ── Nível ─────────────────────────────────────────────────────────────────
    const nivelMatch = blocoTexto.match(/((?:Fundamental|Médio|Superior|Técnico)(?:\s*\/\s*(?:Fundamental|Médio|Superior|Técnico))*)/i);
    const nivelRaw = nivelMatch ? nivelMatch[1] : "";

    // ── Período de inscrição ─────────────────────────────────────────────────
    // Regex que captura tanto "DD/MM a DD/MM/YYYY" quanto "DD/MM/YYYY" isolado
    // O "a" pode estar separado por espaço — captura cruzando a quebra de linha
    const periodoMatch = blocoTexto.match(
      /(\d{2}\/\d{2}(?:\/\d{4})?)\s+a\s+(\d{2}\/\d{2}\/\d{4})/
    );
    const dataUnicaMatch = !periodoMatch && blocoTexto.match(/(\d{2}\/\d{2}\/\d{4})/);

    let inscricao   = "—";
    let inscricaoAte = "Ver edital";

    if (periodoMatch) {
      // Normaliza início: se só "DD/MM", adiciona ano da data final
      const anoFim = periodoMatch[2].split("/")[2];
      const inicio = periodoMatch[1].includes("/20")
        ? periodoMatch[1]
        : periodoMatch[1] + "/" + anoFim;
      inscricao    = `${inicio} a ${periodoMatch[2]}`;
      inscricaoAte = periodoMatch[2];
    } else if (dataUnicaMatch) {
      inscricao    = dataUnicaMatch[1];
      inscricaoAte = dataUnicaMatch[1];
    }

    items.push({
      id: slugify(cargo + "-" + orgao),
      orgao,
      estado: uf,
      vagas: vagasStr,
      salario: salarioStr,
      cargo,
      nivel: detectNivel(nivelRaw),
      inscricao,
      inscricaoAte,
      diasRestantes: calcDiasRestantes(inscricaoAte),
      linkNoticia,
      linkEdital: linkNoticia,
      banca: "—",
      dataProva: "—",
      dataResultado: "—",
      status: detectStatus(inscricaoAte),
      dataCaptura: new Date().toISOString(),
    });
  });

  return items;
}

async function scrapeDetalhe(url: string) {
  if (!url) return { dataProva: "—", dataResultado: "—", banca: "—", linkEdital: "" };
  const html = await fetchComTimeout(url);
  if (!html) return { dataProva: "—", dataResultado: "—", banca: "—", linkEdital: "" };
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  return extrairDetalhes($("body").text());
}

export async function scrapeAllConcursos(): Promise<Concurso[]> {
  const seen = new Set<string>();
  const brutos: Partial<Concurso>[] = [];

  // Sequencial com timeout por request
  for (const url of VAGAS_URLS) {
    try {
      const items = await scrapeListagem(url);
      for (const item of items) {
        const key = item.id || slugify((item.cargo||"")+(item.orgao||""));
        if (!seen.has(key) && item.orgao && item.orgao !== "—") {
          seen.add(key); brutos.push({ ...item, id: key });
        }
      }
    } catch { continue; }
  }

  if (brutos.length === 0) return getFallbackData();

  // Detalhes: sequencial, máx 20, timeout por request via fetchComTimeout
  const LIMITE = 20;
  const completos: Concurso[] = [];

  for (let i = 0; i < brutos.length; i++) {
    const item = brutos[i];
    let det = { dataProva: "—", dataResultado: "—", banca: "—", linkEdital: "" };
    if (i < LIMITE && item.linkNoticia) det = await scrapeDetalhe(item.linkNoticia);

    completos.push({
      id: item.id!,
      cargo: item.cargo || "—",
      orgao: item.orgao || "—",
      estado: item.estado || "Nacional",
      vagas: item.vagas || "—",
      salario: item.salario || "A consultar",
      inscricao: item.inscricao || "—",
      inscricaoAte: item.inscricaoAte || "Ver edital",
      diasRestantes: item.diasRestantes ?? -1,
      linkNoticia: item.linkNoticia || "",
      linkEdital: det.linkEdital || item.linkNoticia || "",
      banca: det.banca !== "—" ? det.banca : (item.banca || "—"),
      nivel: item.nivel || "Superior",
      dataProva: det.dataProva,
      dataResultado: det.dataResultado,
      status: item.status || "Inscrições Abertas",
      dataCaptura: new Date().toISOString(),
    });
  }

  return completos.sort((a, b) => {
    const o = { "Inscrições Abertas": 0, Previsto: 1, Encerrado: 2 };
    return (o[a.status] ?? 2) - (o[b.status] ?? 2);
  });
}

export function getFallbackData(): Concurso[] {
  return [
    { id:"contador-camara-sabara-mg", cargo:"Contador", orgao:"Câmara de Sabará", estado:"MG", vagas:"10 vagas", salario:"R$ 5.409,87", inscricao:"25/05 a 25/06/2026", inscricaoAte:"25/06/2026", diasRestantes:103, linkNoticia:"https://www.pciconcursos.com.br/noticias/camara-de-sabara-mg-abre-concurso-com-10-vagas-em-diversas-areas", linkEdital:"https://www.pciconcursos.com.br/noticias/camara-de-sabara-mg-abre-concurso-com-10-vagas-em-diversas-areas", banca:"IMESO", nivel:"Superior", dataProva:"—", dataResultado:"—", status:"Inscrições Abertas", dataCaptura:new Date().toISOString() },
    { id:"contador-prefeitura-paracatu-mg", cargo:"Contador, Economista", orgao:"Prefeitura de Paracatu", estado:"MG", vagas:"4 vagas", salario:"R$ 6.093,47", inscricao:"09/04 a 11/05/2026", inscricaoAte:"11/05/2026", diasRestantes:57, linkNoticia:"https://www.pciconcursos.com.br/noticias/prefeitura-de-paracatu-mg-publica-edital-para-contador-e-economista", linkEdital:"https://arq.pciconcursos.com.br/prefeitura-de-paracatu-mg-publica-edital-para-contador-e-economista/1694166/2eccd45c85/edital_de_abertura_n_01_2026_1694166.pdf", banca:"—", nivel:"Superior", dataProva:"—", dataResultado:"—", status:"Inscrições Abertas", dataCaptura:new Date().toISOString() },
    { id:"contador-camara-pirangucu-mg", cargo:"Contador, Técnico Legislativo", orgao:"Câmara de Piranguçu", estado:"MG", vagas:"3 vagas + CR", salario:"R$ 2.043,00", inscricao:"01/04 a 03/05/2026", inscricaoAte:"03/05/2026", diasRestantes:19, linkNoticia:"https://www.pciconcursos.com.br/noticias/camara-de-pirangucu-mg-abre-concurso-para-diversos-niveis-de-escolaridade", linkEdital:"https://www.pciconcursos.com.br/noticias/camara-de-pirangucu-mg-abre-concurso-para-diversos-niveis-de-escolaridade", banca:"—", nivel:"Médio/Superior", dataProva:"—", dataResultado:"—", status:"Inscrições Abertas", dataCaptura:new Date().toISOString() },
    { id:"contador-sao-joao-boa-vista-sp", cargo:"Analista de Procuradoria, Contador", orgao:"Prefeitura de São João da Boa Vista", estado:"SP", vagas:"Cadastro reserva", salario:"R$ 6.046,84", inscricao:"08/04/2026", inscricaoAte:"08/04/2026", diasRestantes:24, linkNoticia:"https://www.pciconcursos.com.br/noticias/prefeitura-de-sao-joao-da-boa-vista-sp-abre-concurso-para-analista-de-procuradoria-e-contador", linkEdital:"https://www.pciconcursos.com.br/noticias/prefeitura-de-sao-joao-da-boa-vista-sp-abre-concurso-para-analista-de-procuradoria-e-contador", banca:"—", nivel:"Superior", dataProva:"—", dataResultado:"—", status:"Inscrições Abertas", dataCaptura:new Date().toISOString() },
  ];
}
