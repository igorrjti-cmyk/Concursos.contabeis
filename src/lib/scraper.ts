// src/lib/scraper.ts
// Scraper real do pciconcursos.com.br
// Estrutura confirmada pelos logs de debug:
//
// Linha do orgao:  "Prefeitura de Planalto"
// Linha do UF:     "PR"
// Linha colapsada: "76 vagas ate R$ 9.738,75Varios CargosMedio / Tecnico / Superior"
// Linha da data:   "18/03 a" (quebra aqui!)
// Linha da data2:  "26/04/2026"
//
// Tudo numa unica linha colapsada: vagas + cargo + nivel sem separador

export interface Concurso {
  id: string;
  cargo: string;
  orgao: string;
  estado: string;
  vagas: string;
  salario: string;
  inscricao: string;
  inscricaoAte: string;
  diasRestantes: number;
  linkNoticia: string;
  linkEdital: string;
  banca: string;
  nivel: string;
  dataProva: string;
  dataResultado: string;
  status: "Inscricoes Abertas" | "Em Andamento" | "Previsto" | "Encerrado";
  dataCaptura: string;
}

// Display-friendly status label
export function statusDisplay(s: string): string {
  if (s === "Inscricoes Abertas") return "Inscri\u00e7\u00f5es Abertas";
  return s;
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

const TIMEOUT_MS = 8000;

async function fetchComTimeout(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function slugify(t: string) {
  return t.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function detectNivel(t: string) {
  const l = t.toLowerCase();
  const s  = l.includes("superior");
  const m  = l.includes("medio") || l.includes("m\u00e9dio");
  const tc = l.includes("tecnico") || l.includes("t\u00e9cnico");
  if (s && (m || tc)) return "M\u00e9dio/T\u00e9cnico/Superior";
  if (tc) return "M\u00e9dio/T\u00e9cnico";
  if (s) return "Superior";
  if (m) return "M\u00e9dio";
  return "Superior";
}

function calcDiasRestantes(inscricao: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  // Find all DD/MM/YYYY dates and use the last one (end date)
  const matches = [...inscricao.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (matches.length > 0) {
    const u = matches[matches.length - 1];
    const d = new Date(+u[3], +u[2] - 1, +u[1]);
    return Math.ceil((d.getTime() - hoje.getTime()) / 86400000);
  }
  // DD/MM without year - only if future this year
  const mc = inscricao.match(/(\d{2})\/(\d{2})(?!\/)/);
  if (mc) {
    const d = new Date(hoje.getFullYear(), +mc[2] - 1, +mc[1]);
    if (d < hoje) return -1;
    return Math.ceil((d.getTime() - hoje.getTime()) / 86400000);
  }
  return -1;
}

function detectStatus(inscricaoAte: string): Concurso["status"] {
  if (!inscricaoAte || inscricaoAte === "Ver edital") return "Previsto";
  const dias = calcDiasRestantes(inscricaoAte);
  if (dias === -1) return "Previsto";
  if (dias < 0) return "Em Andamento";
  return "Inscricoes Abertas";
}

function refinarStatus(status: Concurso["status"], dataResultado: string): Concurso["status"] {
  if (status !== "Em Andamento") return status;
  if (!dataResultado || dataResultado === "-") return "Em Andamento";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const m = dataResultado.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return "Em Andamento";
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d < hoje ? "Encerrado" : "Em Andamento";
}

function extrairDetalhes(texto: string) {
  const out = { dataProva: "-", dataResultado: "-", banca: "-", linkEdital: "" };

  const provaRe = [
    /provas?\s+(?:objetiva[s]?|escrita[s]?|pratica[s]?)(?:[^.]{0,80}?)(\d{2}\/\d{2}\/\d{4})/i,
    /aplicac[ao]o\s+das?\s+provas?(?:[^.]{0,60}?)(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+(?:prevista\s+)?(?:de\s+)?(?:realiz|aplicac)[^.]{0,40}?(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s*:\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^.]{0,30}?prova/i,
  ];
  for (const re of provaRe) {
    const m = texto.match(re);
    if (m?.[1]) { out.dataProva = m[1]; break; }
  }

  const resRe = [
    /(?:divulg|publica)[^.]{0,50}?(?:resultado|gabarito)[^.]{0,50}?(\d{2}\/\d{2}\/\d{4})/i,
    /(?:resultado|gabarito)[^.]{0,60}?(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^.]{0,30}?(?:resultado|gabarito)/i,
  ];
  for (const re of resRe) {
    const m = texto.match(re);
    if (m?.[1] && m[1] !== out.dataProva) { out.dataResultado = m[1]; break; }
  }

  const bancas = [
    "CESPE","CEBRASPE","FGV","FCC","VUNESP","IBFC","IDECAN","AOCP",
    "FUNDATEC","FEPESE","IADES","QUADRIX","NUCEPE","UFPR","CONSULPLAN",
    "OBJETIVA","IBAM","IMESO","SELECON","FAFIPA","AVANCASP",
  ];
  const up = texto.toUpperCase();
  for (const b of bancas) {
    if (up.includes(b)) { out.banca = b; break; }
  }

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

  // Collect valid concurso links
  type LinkInfo = { href: string; orgao: string; title: string };
  const links: LinkInfo[] = [];

  $("a[href*='/noticias/']").each((_, el) => {
    const href  = $(el).attr("href") || "";
    const title = $(el).attr("title") || "";
    const texto = $(el).text().trim();

    if (!href.match(/\/noticias\/[a-z0-9][a-z0-9-]{10,}/)) return;
    if (!title.includes(" - ")) return;
    if (!texto || texto.length < 4 || texto.length > 80) return;
    if (texto === title) return;

    links.push({
      href: href.startsWith("http") ? href : BASE_URL + href,
      orgao: texto,
      title,
    });
  });

  if (links.length === 0) return [];

  // Extract full page text
  const $conteudo = $("main, #content, .content, article, #main").first();
  const textoCompleto = ($conteudo.length ? $conteudo : $("body"))
    .text()
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const linhasGeral = textoCompleto.split("\n").map(l => l.trim()).filter(Boolean);

  for (const { href, orgao, title } of links) {
    // UF from title: "Camara de Sabara - MG abre concurso..."
    const ufDoTitle = title.match(/\s+-\s+([A-Z]{2})\s+/)?.[1] ?? "Nacional";

    // Extract cargo from title
    // Title patterns: "...publica edital para Contador e Economista"
    //                 "...abre concurso para Auditor Fiscal"
    const cargoDoTitle = (() => {
      // Title: "Camara de Pirangucu - MG abre concurso para Auxiliar de Servicos Gerais, Tecnico Legislativo, Contador"
      // We want to capture ALL cargos listed after "para"
      const m = title.match(/\b(?:para|ao cargo de|vagas?\s+(?:de|para))\s+(.{3,80}?)(?:\s+em\s+|\s+com\s+|\s+no\s+|\s+na\s+|\s+sob\s+|$)/i);
      if (m) {
        const c = m[1].trim().replace(/\s+$/, "");
        if (c.length >= 3 && c.length < 80 && !c.toLowerCase().includes("concurso") && !c.toLowerCase().includes("selecao")) return c;
      }
      return null;
    })();

    // Locate the orgao line in the full text
    const idxOrgao = linhasGeral.findIndex(l => l === orgao);
    if (idxOrgao === -1) continue;

    // Get 5 lines starting from orgao
    const bloco = linhasGeral.slice(idxOrgao, idxOrgao + 5);
    const blocoTexto = bloco.join(" ");

    // ── Vagas e salario ──────────────────────────────────────────────────────
    const vagasMatch = blocoTexto.match(
      /(\d+\s+vagas?\s*(?:\+\s*CR)?|cadastro\s+reserva)\s+at[e\u00e9]\s+R\$\s*([\d.,]+)/i
    );
    if (!vagasMatch) continue;

    const vagasStr   = vagasMatch[1].replace(/\s+/g, " ").trim();
    const salarioStr = "R$ " + vagasMatch[2];

    // ── Cargo ────────────────────────────────────────────────────────────────
    // Priority: (1) from title, (2) from collapsed line after salary, (3) fallback
    let cargo = cargoDoTitle ?? "";

    if (!cargo) {
      // The line is collapsed: "76 vagas ate R$ 9.738,75Varios CargosMedio/Superior"
      // After removing the vagas+salary part, what remains starts with cargo
      const linhaColaps = bloco.find(l => /at[e\u00e9]\s+R\$\s*[\d.,]+/i.test(l)) ?? "";
      if (linhaColaps) {
        const afterSalary = linhaColaps.replace(/^.*?R\$\s*[\d.,]+/i, "").trim();
        // Cargo is the text before the nivel keywords
        const mC = afterSalary.match(/^(.+?)(?=\s*(?:Fundamental|M[e\u00e9]dio|Superior|T[e\u00e9]cnico))/i);
        if (mC && mC[1].trim().length > 1) {
          cargo = mC[1].trim();
        }
      }
    }

    if (!cargo) {
      // Separate line fallback
      const vagasLinha = bloco.find(l => /(\d+\s+vagas?|cadastro\s+reserva)\s+at[e\u00e9]\s+R\$/i.test(l));
      const idxV = vagasLinha ? bloco.indexOf(vagasLinha) : -1;
      const prox = idxV >= 0 ? (bloco[idxV + 1] ?? "") : "";
      const ehNivel = /^(Fundamental|M[e\u00e9]dio|Superior|T[e\u00e9]cnico)/i.test(prox);
      cargo = !ehNivel && prox.length > 1 ? prox : "V\u00e1rios Cargos";
    }

    // ── Nivel ────────────────────────────────────────────────────────────────
    const nivelMatch = blocoTexto.match(
      /((?:Fundamental|M[e\u00e9]dio|Superior|T[e\u00e9]cnico)(?:\s*\/\s*(?:Fundamental|M[e\u00e9]dio|Superior|T[e\u00e9]cnico))*)/i
    );
    const nivelRaw = nivelMatch ? nivelMatch[1] : "";

    // ── Periodo de inscricao ─────────────────────────────────────────────────
    // Join lines so "18/03 a\n26/04/2026" becomes "18/03 a 26/04/2026"
    // Also handles "18/03 a26/04/2026" (no space before second date)
    const periodoMatch = blocoTexto.match(
      /(\d{2}\/\d{2}(?:\/\d{4})?)\s+a\s*(\d{2}\/\d{2}\/\d{4})/
    );
    const dataUnicaMatch = blocoTexto.match(/(\d{2}\/\d{2}\/\d{4})/);

    let inscricao    = "-";
    let inscricaoAte = "Ver edital";

    if (periodoMatch) {
      const anoFim = periodoMatch[2].split("/")[2];
      const inicio = periodoMatch[1].includes("/20") ? periodoMatch[1] : periodoMatch[1] + "/" + anoFim;
      inscricao    = inicio + " a " + periodoMatch[2];
      inscricaoAte = periodoMatch[2];
    } else if (dataUnicaMatch) {
      // Single date — use it regardless of past/future
      // Past = Em Andamento, Future = Inscricoes Abertas
      inscricao    = dataUnicaMatch[1];
      inscricaoAte = dataUnicaMatch[1];
    }

    // ── Filtro contabil ──────────────────────────────────────────────────────
    const textoFiltro = (cargo + " " + title + " " + orgao).toLowerCase();
    const ehContabil  = ["contab","contador","contadora","fiscal","auditor","tribut","analista contabil"]
      .some(t => textoFiltro.includes(t));
    const outraArea = ["fuzileiro","marinheiro","policia","bombeiro","medic","enferm","professor","magisterio","engenheiro","advogad","delegado"]
      .some(t => title.toLowerCase().includes(t));
    if (!ehContabil && outraArea) continue;

    items.push({
      id: slugify(cargo + "-" + orgao),
      orgao,
      estado: ufDoTitle,
      vagas: vagasStr,
      salario: salarioStr,
      cargo,
      nivel: detectNivel(nivelRaw),
      inscricao,
      inscricaoAte,
      diasRestantes: calcDiasRestantes(inscricaoAte),
      linkNoticia: href,
      linkEdital: href,
      banca: "-",
      dataProva: "-",
      dataResultado: "-",
      status: detectStatus(inscricaoAte),
      dataCaptura: new Date().toISOString(),
    });
  }

  return items;
}

async function scrapeDetalhe(url: string) {
  if (!url) return { dataProva: "-", dataResultado: "-", banca: "-", linkEdital: "" };
  const html = await fetchComTimeout(url);
  if (!html) return { dataProva: "-", dataResultado: "-", banca: "-", linkEdital: "" };
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  return extrairDetalhes($("body").text());
}

export async function scrapeAllConcursos(): Promise<Concurso[]> {
  const seen = new Set<string>();
  const brutos: Partial<Concurso>[] = [];

  for (const url of VAGAS_URLS) {
    try {
      const items = await scrapeListagem(url);
      for (const item of items) {
        if (item.status === "Em Andamento" || item.status === "Inscricoes Abertas" || item.status === "Previsto") {
          const key = item.id || slugify((item.cargo || "") + (item.orgao || ""));
          if (!seen.has(key) && item.orgao && item.orgao !== "-") {
            seen.add(key);
            brutos.push({ ...item, id: key });
          }
        }
      }
    } catch {
      continue;
    }
  }

  if (brutos.length === 0) return getFallbackData();

  const LIMITE = 20;
  const completos: Concurso[] = [];

  for (let i = 0; i < brutos.length; i++) {
    const item = brutos[i];
    let det = { dataProva: "-", dataResultado: "-", banca: "-", linkEdital: "" };
    if (i < LIMITE && item.linkNoticia) det = await scrapeDetalhe(item.linkNoticia);

    const statusFinal = refinarStatus(item.status || "Inscricoes Abertas", det.dataResultado);
    if (statusFinal === "Encerrado") continue;

    completos.push({
      id: item.id!,
      cargo:       item.cargo || "-",
      orgao:       item.orgao || "-",
      estado:      item.estado || "Nacional",
      vagas:       item.vagas || "-",
      salario:     item.salario || "A consultar",
      inscricao:   item.inscricao || "-",
      inscricaoAte: item.inscricaoAte || "Ver edital",
      diasRestantes: item.diasRestantes ?? -1,
      linkNoticia: item.linkNoticia || "",
      linkEdital:  det.linkEdital || item.linkNoticia || "",
      banca:       det.banca !== "-" ? det.banca : (item.banca || "-"),
      nivel:       item.nivel || "Superior",
      dataProva:   det.dataProva,
      dataResultado: det.dataResultado,
      status:      statusFinal,
      dataCaptura: new Date().toISOString(),
    });
  }

  return completos.sort((a, b) => {
    const o: Record<string, number> = { "Inscricoes Abertas": 0, "Em Andamento": 1, "Previsto": 2 };
    return (o[a.status] ?? 2) - (o[b.status] ?? 2);
  });
}

export function getFallbackData(): Concurso[] {
  return [
    {
      id: "contador-camara-sabara-mg",
      cargo: "Contador",
      orgao: "Camara de Sabara",
      estado: "MG",
      vagas: "10 vagas",
      salario: "R$ 5.409,87",
      inscricao: "25/05/2026 a 25/06/2026",
      inscricaoAte: "25/06/2026",
      diasRestantes: 102,
      linkNoticia: "https://www.pciconcursos.com.br/noticias/camara-de-sabara-mg-abre-concurso-com-10-vagas-em-diversas-areas",
      linkEdital: "https://www.pciconcursos.com.br/noticias/camara-de-sabara-mg-abre-concurso-com-10-vagas-em-diversas-areas",
      banca: "IMESO",
      nivel: "Superior",
      dataProva: "-",
      dataResultado: "-",
      status: "Inscricoes Abertas",
      dataCaptura: new Date().toISOString(),
    },
    {
      id: "contador-prefeitura-paracatu-mg",
      cargo: "Contador, Economista",
      orgao: "Prefeitura de Paracatu",
      estado: "MG",
      vagas: "4 vagas",
      salario: "R$ 6.093,47",
      inscricao: "09/04/2026 a 11/05/2026",
      inscricaoAte: "11/05/2026",
      diasRestantes: 57,
      linkNoticia: "https://www.pciconcursos.com.br/noticias/prefeitura-de-paracatu-mg-publica-edital-para-contador-e-economista",
      linkEdital: "https://arq.pciconcursos.com.br/prefeitura-de-paracatu-mg-publica-edital-para-contador-e-economista/1694166/2eccd45c85/edital_de_abertura_n_01_2026_1694166.pdf",
      banca: "-",
      nivel: "Superior",
      dataProva: "-",
      dataResultado: "-",
      status: "Inscricoes Abertas",
      dataCaptura: new Date().toISOString(),
    },
  ];
}
