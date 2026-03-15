// src/lib/scraper.ts
//
// FILTRO DE CARGOS CONTÁBEIS (v3):
//   Aceita concursos que contenham qualquer dos seguintes no cargo/title/texto do edital:
//     1. Palavras-chave diretas: contador, contadora, contábil, contabilidade, fiscal, auditor, tribut...
//     2. "Técnico em Contabilidade" (exige CRC de nível médio)
//     3. Cargos com requisito de GRADUAÇÃO em Ciências Contábeis ou nível Superior
//        mesmo que o cargo se chame genérico (ex: "Analista Legislativo - Contabilidade")
//
// BANCAS: lista expandida com bancas regionais descobertas nos concursos reais.

export interface Concurso {
  id: string;
  cargo: string;          // cargo principal (ex: "Contador")
  cargosContabeis: string[]; // todos os cargos contábeis encontrados no edital
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
  status: "Inscricoes Abertas" | "Previsto" | "Encerrado";
  dataCaptura: string;
}

export function statusDisplay(s: string): string {
  if (s === "Inscricoes Abertas") return "Inscrições Abertas";
  return s;
}

const BASE_URL = "https://www.pciconcursos.com.br";

const VAGAS_URLS = [
  "/vagas/contador",
  "/vagas/contadora",
  "/vagas/contabilidade",
  "/vagas/tecnico-em-contabilidade",
  "/vagas/tecnico-contabil",
  "/vagas/analista-contabil",
  "/vagas/auditor-fiscal",
  "/vagas/fiscal-de-tributos",
  "/vagas/contador-municipal",
];

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

const TIMEOUT_MS = 8000;

// ─── Bancas conhecidas (ordem importa: mais específico primeiro) ───────────────
const BANCAS_CONHECIDAS = [
  // Nacionais grandes
  "CEBRASPE", "CESPE", "FGV", "FCC", "VUNESP", "IBFC", "IDECAN", "AOCP",
  "FUNDATEC", "FEPESE", "IADES", "QUADRIX", "NUCEPE", "CONSULPLAN",
  // Regionais / médias
  "OBJETIVA", "IBAM", "IMESO", "SELECON", "FAFIPA", "AVANCASP",
  "FAFIPE", "FADESP", "FUNRIO", "INSTITUTO ACESSO", "ACESSO",
  "ABCP", "CAP CONCURSOS", "CAP", "COPS", "COMVEST",
  "INSTITUTO AOCP", "INSTITUTO MAIS", "MAIS", "RBO", "LEGALLE",
  "AMEOSC", "FUMARC", "COVEST", "COMPERVE", "FUNCAB",
  "COGNUS", "ITAME", "EXATUS", "COTEC", "MOVENS",
  "IDIB", "IDCAN", "IFB", "IBAM", "UNIFA",
  "FAURGS", "UFMT", "UFAL", "UFRN", "UFG",
  "INSTITUTO CIDADES", "CIDADES",
  "SOLUÇÃO CONCURSOS", "SOLUCAO",
  "NOVA CONCURSOS", "NOVA",
  "INSTITUTO SELECON", "SELECON",
];

// ─── Termos que identificam cargos CONTÁBEIS ─────────────────────────────────
// Nível 1 — palavra-chave direta no nome do cargo
const CARGO_CONTABIL_KW = [
  "contador", "contadora", "contábil", "contabilidade", "contab",
  "auditor fiscal", "auditor-fiscal", "fiscal tribut", "fiscal de tribut",
  "fiscal contábil", "analista contábil", "analista de contabilidade",
  "técnico em contabilidade", "tecnico em contabilidade",
  "técnico contábil", "tecnico contabil",
  "agente fiscal", "agente de tributos",
  "inspetor fiscal",
];

// Nível 2 — cargos genéricos que PODEM ser contábeis se o requisito for CRC/Contábeis
const CARGO_GENERICO_CONTABIL_KW = [
  "analista legislativo",
  "analista administrativo",
  "analista de gestão",
  "especialista",
  "assessor",
  "técnico legislativo",
  "agente administrativo",
  "agente de fiscalização",
];

// Palavras que indicam requisito de contabilidade no texto do edital
const REQUISITO_CONTABIL_KW = [
  "ciências contábeis", "ciencias contabeis",
  "graduação em contábeis", "graduacao em contabeis",
  "bacharel em contábeis", "bacharel em contabilidade",
  "registro no crc", "crc ativo", "crc-",
  "técnico em contabilidade", "tecnico em contabilidade",
  "curso de contabilidade",
];

// Áreas claramente FORA do escopo (para rejeitar falsos positivos)
const AREAS_EXCLUIDAS_TITLE = [
  "fuzileiro", "marinheiro", "policia", "bombeiro",
  "professor", "magisterio", "magistério",
  "engenheiro", "advogad", "delegado",
  "médico", "medico", "enfermeiro", "enfermagem",
  "odontolog", "farmac", "psicolog", "nutricion",
  "veterinário", "veterinario",
  "arquiteto", "urbanista",
];

// Cargos não-contábeis que aparecem misturados em editais de "Vários Cargos"
// Quando o cargo extraído for um desses, descartamos — só ficam os contábeis
const CARGOS_NAO_CONTABEIS = [
  // jurídico
  "advogado", "procurador", "analista de procuradoria", "assistente jurídico",
  "assistente juridico", "assessor jurídico", "assessor juridico",
  "defensor", "promotor",
  // administrativo genérico de nível médio
  "agente administrativo", "agente legislativo", "assistente legislativo",
  "auxiliar administrativo", "auxiliar legislativo", "assistente de serviços",
  "assistente de servicos", "auxiliar de serviços", "auxiliar de servicos",
  "recepcionista", "telefonista", "porteiro", "zelador", "motorista",
  "operador de máquinas", "operador de maquinas", "servente",
  "auxiliar de limpeza", "copeiro", "cozinheiro",
  // saúde
  "médico", "medico", "enfermeiro", "técnico de enfermagem", "tecnico de enfermagem",
  "dentista", "farmacêutico", "farmaceutico", "nutricionista", "fisioterapeuta",
  "psicólogo", "psicologo", "assistente social",
  // educação
  "professor", "pedagogo", "orientador educacional",
  // TI
  "analista de ti", "analista de sistemas", "técnico de informática",
  "tecnico de informatica", "programador",
  // engenharia
  "engenheiro", "arquiteto", "topógrafo", "topografo",
];

/**
 * Dado um cargo extraído (que pode conter múltiplos separados por "e", ",", "/"),
 * retorna apenas as partes que são contábeis.
 * Ex: "Contador e Agente Legislativo" → "Contador"
 * Ex: "Analista de Procuradoria e Contador" → "Contador"
 * Ex: "Contador" → "Contador"
 */
export function filtrarCargosContabeis(cargo: string): string {
  // Separa por vírgula, " e ", " E ", "/"
  const partes = cargo
    .split(/,|\s+e\s+|\//)
    .map(p => p.trim())
    .filter(p => p.length > 1);

  if (partes.length <= 1) return cargo; // cargo simples, não altera

  const contabeis = partes.filter(p => {
    const pLow = p.toLowerCase();
    // Tem palavra-chave contábil?
    const temContabil = CARGO_CONTABIL_KW.some(kw => pLow.includes(kw));
    // É claramente não-contábil?
    const ehNaoContabil = CARGOS_NAO_CONTABEIS.some(nc => pLow.includes(nc.toLowerCase()));
    return temContabil && !ehNaoContabil;
  });

  if (contabeis.length === 0) return cargo; // não conseguiu filtrar, mantém original
  return contabeis.join(" e ");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchComTimeout(url: string): Promise<string | null> {
  const ctrl  = new AbortController();
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
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 80);
}

function detectNivel(t: string) {
  const l = t.toLowerCase();
  const s  = l.includes("superior");
  const m  = l.includes("medio") || l.includes("médio");
  const tc = l.includes("tecnico") || l.includes("técnico");
  if (s && (m || tc)) return "Médio/Técnico/Superior";
  if (tc) return "Médio/Técnico";
  if (s) return "Superior";
  if (m) return "Médio";
  return "Superior";
}

function calcDiasRestantes(inscricao: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const matches = [...inscricao.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (matches.length > 0) {
    const u = matches[matches.length - 1];
    const d = new Date(+u[3], +u[2] - 1, +u[1]);
    return Math.ceil((d.getTime() - hoje.getTime()) / 86400000);
  }
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
  if (dias < 0) return "Previsto";
  return "Inscricoes Abertas";
}

// ─── Filtro contábil robusto ──────────────────────────────────────────────────

/**
 * Retorna true se o concurso é relevante para a área contábil.
 * Aceita:
 *   - Cargo com palavra-chave direta de contabilidade
 *   - Cargo genérico MAS com requisito de CRC / Ciências Contábeis no texto do edital
 *   - "Técnico em Contabilidade" explícito
 * Rejeita:
 *   - Title claramente de outra área (médico, professor, etc.)
 */
function ehConcursoContabil(
  cargo: string,
  title: string,
  orgao: string,
  textoEdital: string = ""
): boolean {
  const tudo   = (cargo + " " + title + " " + orgao + " " + textoEdital).toLowerCase();
  const titLow = title.toLowerCase();

  // Rejeita se title é claramente outra área
  if (AREAS_EXCLUIDAS_TITLE.some(t => titLow.includes(t))) return false;

  // Aceita se cargo tem palavra-chave direta
  const cargoLow = cargo.toLowerCase();
  if (CARGO_CONTABIL_KW.some(kw => cargoLow.includes(kw))) return true;

  // Aceita se title/texto do edital menciona contabilidade diretamente
  if (CARGO_CONTABIL_KW.some(kw => tudo.includes(kw))) return true;

  // Aceita cargo genérico SE o texto do edital pede CRC ou Ciências Contábeis
  const temRequisitoContabil = REQUISITO_CONTABIL_KW.some(kw => tudo.includes(kw));
  if (temRequisitoContabil) {
    // Só aceita se o cargo é potencialmente contábil (não apenas qualquer cargo)
    const cargoGenericoCompativel = CARGO_GENERICO_CONTABIL_KW.some(kw => cargoLow.includes(kw));
    if (cargoGenericoCompativel) return true;
  }

  return false;
}

/**
 * Extrai todos os cargos contábeis listados no texto do edital.
 * Útil quando o concurso tem "Vários Cargos" — lista quais são contábeis.
 */
function extrairCargosContabeisDoEdital(texto: string): string[] {
  const cargos: string[] = [];
  const linhas = texto.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Padrões de linhas que listam cargos em editais
  // Ex: "Contador ...... 1 vaga ...... R$ 5.000"
  // Ex: "CARGO: Técnico em Contabilidade"
  // Ex: "01 - Contador"
  const padroesCargo = [
    /^(?:\d+[\s\-\.]+)?(?:cargo[:\s]+)?(.{4,60}?)(?:\s*\.{2,}|\s{3,}|\t)/i,
    /cargo[:\s]+([^\n\r]{4,60})/i,
    /^([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇÀÜ][^\n\r]{3,50}?)\s+(?:\d+\s+vaga|\d+\s+CR|cadastro\s+reserva)/i,
  ];

  for (const linha of linhas) {
    for (const re of padroesCargo) {
      const m = linha.match(re);
      if (m?.[1]) {
        const candidato = m[1].trim();
        const candidatoLow = candidato.toLowerCase();
        // Verifica se é contábil
        const ehContabil = CARGO_CONTABIL_KW.some(kw => candidatoLow.includes(kw))
          || REQUISITO_CONTABIL_KW.some(kw => texto.substring(
              texto.indexOf(candidato),
              texto.indexOf(candidato) + 500
            ).toLowerCase().includes(kw));
        if (ehContabil && candidato.length > 3 && candidato.length < 60) {
          // Normaliza o nome
          const normalizado = candidato
            .replace(/\s+/g, " ")
            .replace(/[^a-zA-ZÀ-ÿ0-9\s\-\/]/g, "")
            .trim();
          if (normalizado && !cargos.includes(normalizado)) {
            cargos.push(normalizado);
          }
        }
        break;
      }
    }
  }

  return cargos.slice(0, 10); // máximo 10 cargos por concurso
}

// ─── Extração de detalhes do edital ───────────────────────────────────────────

export interface DetalhesEdital {
  dataProva: string;
  dataResultado: string;
  banca: string;
  linkEdital: string;
  cargosContabeis: string[];
  requisito: string; // "CRC" | "Superior - Ciências Contábeis" | "Técnico CRC" | "-"
}

export function extrairDetalhes(texto: string): DetalhesEdital {
  const out: DetalhesEdital = {
    dataProva: "-", dataResultado: "-", banca: "-",
    linkEdital: "", cargosContabeis: [], requisito: "-",
  };

  // Data da prova
  const provaRe = [
    /provas?\s+(?:objetiva[s]?|escrita[s]?|pratica[s]?)(?:[^.]{0,80}?)(\d{2}\/\d{2}\/\d{4})/i,
    /aplicac[aã]o\s+das?\s+provas?(?:[^.]{0,60}?)(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+(?:prevista\s+)?(?:de\s+)?(?:realiz|aplicac)[^.]{0,40}?(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s*:\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^.]{0,30}?prova/i,
  ];
  for (const re of provaRe) {
    const m = texto.match(re);
    if (m?.[1]) { out.dataProva = m[1]; break; }
  }

  // Data do resultado
  const resRe = [
    /(?:divulg|publica)[^.]{0,50}?(?:resultado|gabarito)[^.]{0,50}?(\d{2}\/\d{2}\/\d{4})/i,
    /(?:resultado|gabarito)[^.]{0,60}?(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^.]{0,30}?(?:resultado|gabarito)/i,
  ];
  for (const re of resRe) {
    const m = texto.match(re);
    if (m?.[1] && m[1] !== out.dataProva) { out.dataResultado = m[1]; break; }
  }

  // Banca — percorre da mais específica para genérica
  const textoUp = texto.toUpperCase();
  for (const b of BANCAS_CONHECIDAS) {
    if (textoUp.includes(b.toUpperCase())) { out.banca = b; break; }
  }

  // Link do edital PDF
  const pdf = texto.match(/https?:\/\/arq\.pciconcursos\.com\.br\/[^\s"')]+\.pdf/i);
  if (pdf) out.linkEdital = pdf[0];

  // Cargos contábeis no edital
  out.cargosContabeis = extrairCargosContabeisDoEdital(texto);

  // Requisito de formação
  const textoLow = texto.toLowerCase();
  if (textoLow.includes("crc") && textoLow.includes("técnico")) {
    out.requisito = "Técnico + CRC";
  } else if (textoLow.includes("ciências contábeis") || textoLow.includes("ciencias contabeis")) {
    out.requisito = "Graduação - Ciências Contábeis";
  } else if (textoLow.includes("crc")) {
    out.requisito = "CRC ativo";
  } else if (textoLow.includes("nível superior") || textoLow.includes("nivel superior")) {
    out.requisito = "Nível Superior";
  }

  return out;
}

// ─── Scraping da listagem ─────────────────────────────────────────────────────

async function scrapeListagem(url: string): Promise<Partial<Concurso>[]> {
  const html = await fetchComTimeout(BASE_URL + url);
  if (!html) return [];

  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  const items: Partial<Concurso>[] = [];

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

    // ── Aceita apenas CONCURSO PÚBLICO — descarta processo seletivo ──────────
    const titleLow = title.toLowerCase();
    const hrefLow  = href.toLowerCase();
    const ehPS =
      titleLow.includes("processo seletivo") ||
      titleLow.includes("processo simplificado") ||
      titleLow.includes("sele\u00e7\u00e3o simplificada") ||
      titleLow.includes("selecao simplificada") ||
      / pss[\s,.]/.test(titleLow) || titleLow.endsWith(" pss") ||
      / pst[\s,.]/.test(titleLow) || titleLow.endsWith(" pst") ||
      hrefLow.includes("processo-seletivo") ||
      hrefLow.includes("selecao-simplificada");
    if (ehPS) return;

    links.push({ href: href.startsWith("http") ? href : BASE_URL + href, orgao: texto, title });
  });

  if (links.length === 0) return [];

  const $conteudo = $("main, #content, .content, article, #main").first();
  const textoCompleto = ($conteudo.length ? $conteudo : $("body"))
    .text().replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  const linhasGeral = textoCompleto.split("\n").map(l => l.trim()).filter(Boolean);

  for (const { href, orgao, title } of links) {
    const ufDoTitle = title.match(/\s+-\s+([A-Z]{2})\s+/)?.[1] ?? "Nacional";

    const cargoDoTitle = (() => {
      const m = title.match(/\b(?:para|ao cargo de|vagas?\s+(?:de|para))\s+(.{3,80}?)(?:\s+em\s+|\s+com\s+|\s+no\s+|\s+na\s+|\s+sob\s+|$)/i);
      if (m) {
        const c = m[1].trim().replace(/\s+$/, "");
        if (c.length >= 3 && c.length < 80
          && !c.toLowerCase().includes("concurso")
          && !c.toLowerCase().includes("selecao")) return c;
      }
      return null;
    })();

    const idxOrgao = linhasGeral.findIndex(l => l === orgao);
    if (idxOrgao === -1) continue;

    const bloco     = linhasGeral.slice(idxOrgao, idxOrgao + 5);
    const blocoTexto = bloco.join(" ");

    const vagasMatch = blocoTexto.match(
      /(\d+\s+vagas?\s*(?:\+\s*CR)?|cadastro\s+reserva)\s+at[eé]\s+R\$\s*([\d.,]+)/i
    );
    if (!vagasMatch) continue;

    const vagasStr   = vagasMatch[1].replace(/\s+/g, " ").trim();
    const salarioStr = "R$ " + vagasMatch[2];

    // Cargo
    let cargo = cargoDoTitle ?? "";
    if (!cargo) {
      const linhaColaps = bloco.find(l => /at[eé]\s+R\$\s*[\d.,]+/i.test(l)) ?? "";
      if (linhaColaps) {
        const afterSalary = linhaColaps.replace(/^.*?R\$\s*[\d.,]+/i, "").trim();
        const mC = afterSalary.match(/^(.+?)(?=\s*(?:Fundamental|M[eé]dio|Superior|T[eé]cnico))/i);
        if (mC && mC[1].trim().length > 1) cargo = mC[1].trim();
      }
    }
    if (!cargo) {
      const vagasLinha = bloco.find(l => /(\d+\s+vagas?|cadastro\s+reserva)\s+at[eé]\s+R\$/i.test(l));
      const idxV = vagasLinha ? bloco.indexOf(vagasLinha) : -1;
      const prox = idxV >= 0 ? (bloco[idxV + 1] ?? "") : "";
      const ehNivel = /^(Fundamental|M[eé]dio|Superior|T[eé]cnico)/i.test(prox);
      cargo = !ehNivel && prox.length > 1 ? prox : "Vários Cargos";
    }

    // Nível
    const nivelMatch = blocoTexto.match(
      /((?:Fundamental|M[eé]dio|Superior|T[eé]cnico)(?:\s*\/\s*(?:Fundamental|M[eé]dio|Superior|T[eé]cnico))*)/i
    );
    const nivelRaw = nivelMatch ? nivelMatch[1] : "";

    // Período de inscrição
    const periodoMatch   = blocoTexto.match(/(\d{2}\/\d{2}(?:\/\d{4})?)\s+a\s*(\d{2}\/\d{2}\/\d{4})/);
    const dataUnicaMatch = blocoTexto.match(/(\d{2}\/\d{2}\/\d{4})/);

    let inscricao    = "-";
    let inscricaoAte = "Ver edital";

    if (periodoMatch) {
      const anoFim = periodoMatch[2].split("/")[2];
      const inicio = periodoMatch[1].includes("/20") ? periodoMatch[1] : periodoMatch[1] + "/" + anoFim;
      inscricao    = inicio + " a " + periodoMatch[2];
      inscricaoAte = periodoMatch[2];
    } else if (dataUnicaMatch) {
      inscricao    = dataUnicaMatch[1];
      inscricaoAte = dataUnicaMatch[1];
    }

    // Filtro contábil — pré-check na listagem (sem texto do edital ainda)
    if (!ehConcursoContabil(cargo, title, orgao)) continue;

    items.push({
      id:            slugify(cargo + "-" + orgao),
      orgao, estado: ufDoTitle, vagas: vagasStr, salario: salarioStr,
      cargo, nivel: detectNivel(nivelRaw), inscricao, inscricaoAte,
      diasRestantes: calcDiasRestantes(inscricaoAte),
      linkNoticia: href, linkEdital: href, banca: "-",
      dataProva: "-", dataResultado: "-",
      cargosContabeis: [],
      status: detectStatus(inscricaoAte),
      dataCaptura: new Date().toISOString(),
    });
  }

  return items;
}

// ─── Scraping de detalhe ──────────────────────────────────────────────────────

async function scrapeDetalhe(url: string): Promise<DetalhesEdital> {
  const empty: DetalhesEdital = {
    dataProva: "-", dataResultado: "-", banca: "-",
    linkEdital: "", cargosContabeis: [], requisito: "-",
  };
  if (!url) return empty;
  const html = await fetchComTimeout(url);
  if (!html) return empty;
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  // ── Extrai link PDF diretamente dos elementos <a href> ────────────────────
  // Prioridade: href do link que aponta para PDF no domínio arq.pciconcursos
  let pdfHref = "";
  $("a[href]").each((_, el) => {
    if (pdfHref) return; // já encontrou
    const h = ($(el).attr("href") || "").trim();
    if (
      h.match(/\.pdf$/i) &&
      (h.includes("arq.pciconcursos") || h.includes("pciconcursos"))
    ) {
      pdfHref = h.startsWith("http") ? h : "https://arq.pciconcursos.com.br" + h;
    }
  });

  // Fallback: qualquer link .pdf na página
  if (!pdfHref) {
    $("a[href$='.pdf'], a[href$='.PDF']").each((_, el) => {
      if (pdfHref) return;
      const h = ($(el).attr("href") || "").trim();
      if (h) pdfHref = h.startsWith("http") ? h : url.replace(/\/[^\/]*$/, "/") + h;
    });
  }

  const texto = $("body").text();
  const det = extrairDetalhes(texto);

  // Sobrescreve link do edital com o href real (mais confiável que regex no texto)
  if (pdfHref) det.linkEdital = pdfHref;

  return det;
}

// ─── Principal ────────────────────────────────────────────────────────────────

export async function scrapeAllConcursos(): Promise<Concurso[]> {
  const seen   = new Set<string>();
  const brutos: Partial<Concurso>[] = [];

  for (const url of VAGAS_URLS) {
    try {
      const items = await scrapeListagem(url);
      for (const item of items) {
        if (item.status === "Encerrado") continue;
        const key = item.id || slugify((item.cargo || "") + (item.orgao || ""));
        if (!seen.has(key) && item.orgao && item.orgao !== "-") {
          seen.add(key);
          brutos.push({ ...item, id: key });
        }
      }
    } catch {
      continue;
    }
  }

  if (brutos.length === 0) return getFallbackData();

  const LIMITE_DETALHE = 25; // busca detalhes dos primeiros 25
  const completos: Concurso[] = [];

  for (let i = 0; i < brutos.length; i++) {
    const item = brutos[i];
    let det: DetalhesEdital = {
      dataProva: "-", dataResultado: "-", banca: "-",
      linkEdital: "", cargosContabeis: [], requisito: "-",
    };

    if (i < LIMITE_DETALHE && item.linkNoticia) {
      det = await scrapeDetalhe(item.linkNoticia);
    }

    // Segunda chance no filtro: "Vários Cargos" com cargosContabeis no edital = válido
    // Sem cargos contábeis encontrados E cargo genérico = pula
    const cargoFinal = item.cargo || "-";
    if (
      cargoFinal === "Vários Cargos" &&
      det.cargosContabeis.length === 0 &&
      !ehConcursoContabil(cargoFinal, item.linkNoticia || "", item.orgao || "", "")
    ) {
      continue;
    }

    // Filtra só a parte contábil do cargo (ex: "Contador e Agente Legislativo" → "Contador")
    let cargoDisplay = filtrarCargosContabeis(cargoFinal);

    // Se ainda é "Vários Cargos" e o edital tem cargos contábeis específicos, usa eles
    if (
      (cargoDisplay === "Vários Cargos" || cargoDisplay === cargoFinal) &&
      det.cargosContabeis.length > 0
    ) {
      cargoDisplay = det.cargosContabeis.join(", ");
    }

    completos.push({
      id:             item.id!,
      cargo:          cargoDisplay,
      cargosContabeis: det.cargosContabeis.length > 0
        ? det.cargosContabeis
        : cargoFinal !== "Vários Cargos" ? [cargoFinal] : [],
      orgao:          item.orgao || "-",
      estado:         item.estado || "Nacional",
      vagas:          item.vagas || "-",
      salario:        item.salario || "A consultar",
      inscricao:      item.inscricao || "-",
      inscricaoAte:   item.inscricaoAte || "Ver edital",
      diasRestantes:  item.diasRestantes ?? -1,
      linkNoticia:    item.linkNoticia || "",
      linkEdital:     det.linkEdital || item.linkNoticia || "",
      banca:          det.banca !== "-" ? det.banca : (item.banca || "-"),
      nivel:          item.nivel || "Superior",
      dataProva:      det.dataProva,
      dataResultado:  det.dataResultado,
      status:         item.status as Concurso["status"],
      dataCaptura:    new Date().toISOString(),
    });
  }

  // Inscrições abertas primeiro (por prazo crescente), depois Previstos
  return completos.sort((a, b) => {
    if (a.status === b.status) {
      if (a.status === "Inscricoes Abertas") return a.diasRestantes - b.diasRestantes;
      return 0;
    }
    return a.status === "Inscricoes Abertas" ? -1 : 1;
  });
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

export function getFallbackData(): Concurso[] {
  return [
    {
      id: "contador-camara-tamboara-pr",
      cargo: "Contador",
      cargosContabeis: ["Contador"],
      orgao: "Câmara de Tamboara",
      estado: "PR",
      vagas: "Cadastro Reserva",
      salario: "R$ 5.864,79",
      inscricao: "Ver edital",
      inscricaoAte: "Ver edital",
      diasRestantes: -1,
      linkNoticia: "https://www.pciconcursos.com.br/noticias/camara-de-tamboara-pr-abre-concurso-publico-com-salarios-de-ate-5864",
      linkEdital: "https://arq.pciconcursos.com.br/camara-de-tamboara-pr-abre-concurso-publico-com-salarios-de-ate-5864/1694782/17d1997958/edital_de_abertura_n_01_002_2026_1694782.pdf",
      banca: "FAFIPA", nivel: "Superior", dataProva: "-", dataResultado: "-",
      status: "Previsto", dataCaptura: new Date().toISOString(),
    },
    {
      id: "contador-camara-sabara-mg",
      cargo: "Contador",
      cargosContabeis: ["Contador"],
      orgao: "Câmara de Sabarà",
      estado: "MG",
      vagas: "10 vagas",
      salario: "R$ 5.409,87",
      inscricao: "25/05/2026 a 25/06/2026",
      inscricaoAte: "25/06/2026",
      diasRestantes: 102,
      linkNoticia: "https://www.pciconcursos.com.br/noticias/camara-de-sabara-mg",
      linkEdital: "https://www.pciconcursos.com.br/noticias/camara-de-sabara-mg",
      banca: "IMESO", nivel: "Superior", dataProva: "-", dataResultado: "-",
      status: "Inscricoes Abertas", dataCaptura: new Date().toISOString(),
    },
    {
      id: "auditor-fiscal-sefaz-go",
      cargo: "Auditor Fiscal",
      cargosContabeis: ["Auditor Fiscal"],
      orgao: "SEFAZ Goiás",
      estado: "GO",
      vagas: "50 vagas",
      salario: "R$ 21.000,00",
      inscricao: "Ver edital",
      inscricaoAte: "Ver edital",
      diasRestantes: -1,
      linkNoticia: "https://www.pciconcursos.com.br",
      linkEdital: "https://www.pciconcursos.com.br",
      banca: "CESPE", nivel: "Superior", dataProva: "15/08/2026", dataResultado: "-",
      status: "Previsto", dataCaptura: new Date().toISOString(),
    },
  ];
}
