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
  status: "Inscrições Abertas" | "Em Andamento" | "Previsto" | "Encerrado";
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
  if (dias < 0) return "Em Andamento"; // inscrição encerrou — aguardando resultado
  return "Inscrições Abertas";
}

// Refina o status após ter dataResultado:
// "Em Andamento" → "Encerrado" se resultado já saiu
function refinarStatus(status: Concurso["status"], dataResultado: string): Concurso["status"] {
  if (status !== "Em Andamento") return status;
  if (!dataResultado || dataResultado === "—") return "Em Andamento";
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const m = dataResultado.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return "Em Andamento";
  const dataRes = new Date(+m[3], +m[2]-1, +m[1]);
  return dataRes < hoje ? "Encerrado" : "Em Andamento";
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

  // ── ABORDAGEM DEFINITIVA ─────────────────────────────────────────────────
  //
  // O pciconcursos renderiza cada concurso como um bloco de texto SOLTO,
  // separado por <hr> ou simplesmente adjacente no body. Os dados de cada
  // concurso ficam em nós de texto IRMÃOS do <a>, não em filhos.
  // Por isso subir na DOM nunca funciona — chegamos no body inteiro.
  //
  // Solução: extrair o texto completo da página, dividir em BLOCOS
  // usando os títulos dos links como delimitadores. Cada bloco contém:
  //
  //   [título do link / nome do órgão]
  //   UF
  //   N vagas até R$ X
  //   Cargo
  //   Nível
  //   DD/MM a DD/MM/YYYY  (pode estar quebrado em 2 linhas)
  //
  // O `title` do <a> tem formato "Órgão - UF faz algo" → usamos para
  // extrair orgão e UF com segurança.

  // 1. Coleta todos os links válidos de concurso em ordem de aparição
  type LinkInfo = { href: string; orgao: string; title: string };
  const links: LinkInfo[] = [];

  $("a[href*='/noticias/']").each((_, el) => {
    const href  = $(el).attr("href") || "";
    const title = $(el).attr("title") || "";
    const texto = $(el).text().trim();

    // Slug real: /noticias/nome-longo-com-varios-termos
    if (!href.match(/\/noticias\/[a-z0-9][a-z0-9-]{10,}/)) return;
    // Deve ter title com " - " separando orgão e estado
    if (!title.includes(" - ")) return;
    // Texto do link deve ser o nome do órgão (curto, sem verbos)
    if (!texto || texto.length < 4 || texto.length > 80) return;
    // Exclui links que são claramente notícias laterais (sem dados de vagas)
    // — detectados pelo texto ser igual ao title completo
    if (texto === title) return;

    links.push({
      href: href.startsWith("http") ? href : BASE_URL + href,
      orgao: texto,
      title,
    });
  });

  if (links.length === 0) return [];

  // 2. Extrai o texto completo da área de conteúdo (exclui nav e rodapé)
  //    Usa o seletor mais específico disponível, fallback para body
  const $conteudo = $("main, #content, .content, article, #main").first();
  const textoCompleto = ($conteudo.length ? $conteudo : $("body"))
    .text()
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")   // normaliza espaços horizontais
    .replace(/\n{3,}/g, "\n\n") // máximo 2 quebras seguidas
    .trim();

  const linhasGeral = textoCompleto.split("\n").map(l => l.trim()).filter(Boolean);

  // 3. Para cada link, localiza o bloco correspondente no texto
  for (const { href, orgao, title } of links) {
    // UF vem no title: "Câmara de Sabará - MG abre concurso..."
    const ufDoTitle = title.match(/\s+-\s+([A-Z]{2})\s+/)?.[1] ?? "Nacional";

    // Localiza a linha que contém o nome do órgão
    const idxOrgao = linhasGeral.findIndex(l => l === orgao || l.startsWith(orgao));
    if (idxOrgao === -1) continue;

    // Pega as próximas 10 linhas como bloco deste concurso
    const bloco = linhasGeral.slice(idxOrgao, idxOrgao + 10);
    // Junta tudo em uma string para o regex de data cruzar quebras de linha
    const blocoTexto = bloco.join(" ");

    // ── Vagas e salário ─────────────────────────────────────────────────────
    const vagasMatch = blocoTexto.match(
      /(\d+\s+vagas?\s*(?:\+\s*CR)?|cadastro\s+reserva)\s+até\s+R\$\s*([\d.,]+)/i
    );
    if (!vagasMatch) continue;

    const vagasStr   = vagasMatch[1].replace(/\s+/g, " ").trim();
    const salarioStr = "R$ " + vagasMatch[2];

    // ── Cargo ────────────────────────────────────────────────────────────────
    // Linha logo após "vagas até R$ X" no bloco linha-a-linha
    const vagasLinha = bloco.find(l =>
      /(\d+\s+vagas?|cadastro\s+reserva)\s+até\s+R\$/i.test(l)
    );
    const idxVagasBloco = vagasLinha ? bloco.indexOf(vagasLinha) : -1;
    const cargoLinha    = idxVagasBloco >= 0 ? (bloco[idxVagasBloco + 1] ?? "") : "";
    const ehNivel       = /^(Fundamental|Médio|Superior|Técnico)/i.test(cargoLinha);
    const cargo         = !ehNivel && cargoLinha.length > 1 ? cargoLinha : "Vários Cargos";

    // ── Nível ────────────────────────────────────────────────────────────────
    const nivelLinha = bloco.find(l => /^(Fundamental|Médio|Superior|Técnico)/i.test(l)) ?? "";

    // ── Período de inscrição (regex no texto junto para cruzar quebras) ──────
    const periodoMatch  = blocoTexto.match(
      /(\d{2}\/\d{2}(?:\/\d{4})?)\s+a\s+(\d{2}\/\d{2}\/\d{4})/
    );
    const dataUnicaMatch = blocoTexto.match(/(\d{2}\/\d{2}\/\d{4})/);

    let inscricao    = "—";
    let inscricaoAte = "Ver edital";

    if (periodoMatch) {
      const anoFim = periodoMatch[2].split("/")[2];
      const inicio = periodoMatch[1].includes("/20")
        ? periodoMatch[1]
        : `${periodoMatch[1]}/${anoFim}`;
      inscricao    = `${inicio} a ${periodoMatch[2]}`;
      inscricaoAte = periodoMatch[2];
    } else if (dataUnicaMatch) {
      inscricao    = dataUnicaMatch[1];
      inscricaoAte = dataUnicaMatch[1];
    }

    // ── Filtro contábil ──────────────────────────────────────────────────────
    // Garante que pelo menos o cargo OU o title mencionem contabilidade
    const textoFiltro = (cargo + " " + title + " " + orgao).toLowerCase();
    const ehContabil  = [
      "contab","contador","contadora","fiscal","auditor","tribut","analista contábil"
    ].some(t => textoFiltro.includes(t));

    // "Vários Cargos" pode ser contábil — confia no contexto da URL de busca
    // mas rejeita se o title menciona claramente outra área
    const titleLower = title.toLowerCase();
    const claramenteOutraArea = [
      "fuzileiro","marinheiro","policia","bombeiro","saúde","médic","enferm",
      "professor","magistério","engenheiro","advogad","delegado"
    ].some(t => titleLower.includes(t));

    if (!ehContabil && claramenteOutraArea) continue;

    items.push({
      id: slugify(cargo + "-" + orgao),
      orgao,
      estado: ufDoTitle,
      vagas: vagasStr,
      salario: salarioStr,
      cargo,
      nivel: detectNivel(nivelLinha),
      inscricao,
      inscricaoAte,
      diasRestantes: calcDiasRestantes(inscricaoAte),
      linkNoticia: href,
      linkEdital: href,
      banca: "—",
      dataProva: "—",
      dataResultado: "—",
      status: detectStatus(inscricaoAte),
      dataCaptura: new Date().toISOString(),
    });
  }

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

  // Sequencial com timeout por request — ignora encerrados direto na listagem
  for (const url of VAGAS_URLS) {
    try {
      const items = await scrapeListagem(url);
      for (const item of items) {
        if (item.status === "Encerrado") continue; // descarta antes de entrar no banco
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

    const statusFinal = refinarStatus(item.status || "Inscrições Abertas", det.dataResultado);
    if (statusFinal === "Encerrado") continue; // descarta após saber que resultado já saiu

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
      status: statusFinal,
      dataCaptura: new Date().toISOString(),
    });
  }

  // Ordena: Inscrições Abertas → Em Andamento → Previsto
  return completos.sort((a, b) => {
    const o: Record<string, number> = { "Inscrições Abertas": 0, "Em Andamento": 1, Previsto: 2 };
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
