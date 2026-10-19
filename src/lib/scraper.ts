import { lerListagemPCI, lerNoticiaPCI } from "./pci-parser";
import { montarConcursos, normalizar, tipoRelevancia, diaNumero, hojeBrasil } from "./concurso-dados";
import { extrairEspecialidadesContabeis, extrairDetalhesEspecialidade } from "./especialidades-contabeis";
// src/lib/scraper.ts
// Nota: extrairDetalhesDoPDF é importado dinamicamente em scrapeDetalhe
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
  estados?: string[];
  inscricaoInicio?: string;
  inscricaoFimHora?: string;
  requisito?: string;
  relevancia?: "cargo-contabil" | "formacao-contabil" | "area-fiscal";
  evidenciaCargo?: string;
  dadosValidados?: boolean;
  cargo: string;          // cargo principal (ex: "Contador")
  cargosContabeis: string[]; // todos os cargos contábeis encontrados no edital
  orgao: string;
  estado: string;         // sigla da UF (ex: "SP")
  cidade: string;         // cidade extraída do órgão ou título (ex: "São Paulo")
  uf: string;             // nome completo do estado (ex: "São Paulo")
  vagas: string;
  salario: string;
  inscricao: string;
  inscricaoAte: string;
  diasRestantes: number;
  linkNoticia: string;
  linkEdital: string;
  linkEditalPdf?: string;
  linkBanca?: string;
  verificacaoProva?: { status: "conferida-pdf" | "pendente" | "divergencia"; conferidoEm?: string; documento?: string; pagina?: number; evidencia?: string; observacao?: string };
  banca: string;
  nivel: string;
  dataProva: string;
  dataResultado: string;
  status: "Inscricoes Abertas" | "Aguardando Prova" | "Previsto" | "Inscricoes em breve" | "Encerrado";
  dataCaptura: string;
}

export function statusDisplay(s: string): string {
  if (s === "Inscricoes Abertas") return "Inscrições Abertas";
  if (s === "Inscricoes em breve") return "Inscrições em breve";
  if (s === "Aguardando Prova")   return "Aguardando Prova";
  return s;
}

const BASE_URL = "https://www.pciconcursos.com.br";

// URLs de vagas ativas (inscrições abertas e previstos)
export const VAGAS_URLS = [
  "/vagas/analista-judiciario",
  "/vagas/contador",
  "/vagas/contadora",
  "/vagas/contabilidade",
  "/vagas/tecnico-em-contabilidade",
  "/vagas/tecnico-contabil",
  "/vagas/analista-contabil",
  "/vagas/auditor-fiscal",
  "/vagas/auditor-fiscal-da-receita-municipal",
  "/vagas/auditor-fiscal-de-tributos",
  "/vagas/contador-municipal",
  "/vagas/contador-publico",
  "/vagas/auditor-de-controle-interno",
  "/vagas/analista-de-controle-interno",
  "/vagas/auditor-fiscal-de-tributos",
  "/vagas/fiscal-de-rendas",
  "/vagas/analista-de-controle",
  "/vagas/sub-contador",
];

// URLs de concursos com inscrições encerradas mas prova futura ("Aguardando Prova").
// O PCI Concursos lista esses concursos em /concursos/ após o encerramento das inscrições.
const CONCURSOS_URLS: string[] = [
  "/concursos/contador",
  "/concursos/contabilidade",
  "/concursos/auditor-fiscal",
  "/concursos/auditor-fiscal-da-receita-municipal",
  "/concursos/auditor-fiscal-de-tributos",
  "/concursos/fiscal-de-tributos",
  "/concursos/tecnico-em-contabilidade",
  "/concursos/analista-contabil",
];

// URLs de notícias por estado — captura concursos com vários cargos (ex: IPAM)
// que não aparecem nas páginas de vagas por cargo específico.
// O scrapeListagem já filtra por palavras-chave contábeis no título ou texto.
export const NOTICIAS_URLS: string[] = [
  "/noticias/sul/",
  "/noticias/sudeste/",
  "/noticias/nordeste/",
  "/noticias/norte/",
  "/noticias/centrooeste/",
  "/noticias/nacional/",
];


const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

const TIMEOUT_MS = 5000;

// ─── Bancas conhecidas (ordem importa: mais específico primeiro) ───────────────
const BANCAS_CONHECIDAS = [
  // ── Nacionais grandes ─────────────────────────────────────────────────────
  "CEBRASPE", "CESPE", "FGV", "FCC", "VUNESP", "IBFC", "IDECAN", "AOCP",
  "FUNDATEC", "FEPESE", "IADES", "QUADRIX", "NUCEPE", "CONSULPLAN",

  // ── Confirmadas nos editais reais dos concursos monitorados ───────────────
  "FADENOR",                   // Prefeitura de Paracatu MG
  "ÁPICE CONSULTORIA",         // Prefeitura de Itatuba PB
  "APICE CONSULTORIA",         // variante sem acento
  "CAP CONCURSOS",             // Câmara de Piedade do Rio Grande MG
  "NOSSO RUMO",                // Prefeitura de São João da Boa Vista SP
  "INSTITUTO NOSSO RUMO",      // variante
  "FAFIPA",                    // Câmara de Tamboara PR
  "IMESO",                     // Câmara de Sabarà MG / Câmara de Lamim MG
  "ABCP",                      // Câmara de Piranguçu MG
  "AMAUC",                     // Câmara de Ipumirim SC
  "ACESSE CONCURSO",           // IPRECAL SC
  "IBGP",                      // Câmara de Igaratinga MG
  "CONSCAM",                   // SAAE de Lençóis Paulista SP
  "CONSULPLAN",                // CRC-CE — Instituto Consulplan
  "INSTITUTO CONSULPLAN",      // variante Consulplan

  // ── Regionais / médias ────────────────────────────────────────────────────
  "IBAM", "SELECON", "AVANCASP",
  "FAFIPE", "FADESP", "FUNRIO",
  "INSTITUTO ACESSO", "ACESSO",
  "CAP", "COPS", "COMVEST",
  "INSTITUTO AOCP", "INSTITUTO MAIS",
  "RBO", "LEGALLE", "AMEOSC",
  "FUMARC", "COVEST", "COMPERVE", "FUNCAB",
  "COGNUS", "ITAME", "EXATUS", "MOVENS",
  "COTEC", "IDIB", "IDCAN", "IFB", "UNIFA",
  "FAURGS", "UFMT", "UFAL", "UFRN", "UFG",
  "SOLUCAO", "NOVA CONCURSOS",
  "INSTITUTO SELECON",
  "MAIS CONCURSOS",
  "INTELECTUS", "UFES", "UFRR",
  // ATENÇÃO: "OBJETIVA" e "CIDADES" removidos — são termos genéricos
  // que aparecem em "prova objetiva" e URLs do PCI, causando falsos positivos.
  // A banca Objetiva Concursos é identificada pelo domínio objetiva.org
];

// ─── Mapeamento de domínio de site → nome da banca ────────────────────────────
// Quando o PCI linka para o site da banca organizadora, usamos isso para identificá-la
const DOMINIO_BANCA: Record<string, string> = {
  "idecan.org.br":          "IDECAN",
  "cebraspe.org.br":        "CEBRASPE",
  "cespe.unb.br":           "CESPE",
  "fgv.br":                 "FGV",
  "cesgranrio.org.br":      "CESGRANRIO",
  "concursosfcc.com.br":    "FCC",
  "vunesp.com.br":          "VUNESP",
  "ibfc.org.br":            "IBFC",
  "institutoaocp.org.br":   "AOCP",
  "fundatec.org.br":        "FUNDATEC",
  "fepese.org.br":          "FEPESE",
  "iades.org.br":           "IADES",
  "quadrix.org.br":         "QUADRIX",
  "institutoquadrix.org.br": "QUADRIX",
  "nucepe.uespi.br":        "NUCEPE",
  "consulplan.com":         "CONSULPLAN",
  "objetiva.org":           "OBJETIVA CONCURSOS",
  "objetiva.com.br":        "OBJETIVA CONCURSOS",
  "amauc.org.br":           "AMAUC",
  "amauc.selecao.net.br":   "AMAUC",
  "amauc.listaeditais.com.br": "AMAUC",
  "acesseconcurso.com.br":  "ACESSE CONCURSO",
  "ibgp.org.br":            "IBGP",
  "conscam.com.br":         "CONSCAM",
  "consulplan.com.br":      "INSTITUTO CONSULPLAN",
  "srdigitalizacoes.com.br":"S. R. DIGITALIZAÇÕES",
  "imeso.com.br":           "IMESO",
  "fafipa.br":              "FAFIPA",
  "fundacaofafipa.org.br":  "FAFIPA",
  "fafipe.edu.br":          "FAFIPE",
  "fadesp.org.br":          "FADESP",
  "funrio.org.br":          "FUNRIO",
  "institutoibam.com.br":   "IBAM",
  "abcpconcursos.com.br":   "ABCP",
  "capconcursos.com.br":    "CAP CONCURSOS",
  "nossorumo.org.br":       "NOSSO RUMO",
  "institutonossorumo.org": "NOSSO RUMO",
  "fadenor.com.br":         "FADENOR",
  "apiceconsultoria.com":   "ÁPICE CONSULTORIA",
  "apiceconsultoria.com.br":"ÁPICE CONSULTORIA",
  "cognus.org.br":          "COGNUS",
  "exatus.org.br":          "EXATUS",
  "legalle.org.br":         "LEGALLE",
  "movens.org.br":          "MOVENS",
  "fumarc.com.br":          "FUMARC",
  "comperve.ufrn.br":       "COMPERVE",
  "funcab.org":             "FUNCAB",
  "idib.org.br":            "IDIB",
  "idcan.org.br":           "IDCAN",
  "avancasp.org.br":        "AVANCASP",
  "novaconcursos.org.br":   "NOVA CONCURSOS",
  "intelectus.org.br":      "INTELECTUS",
  "institutoselecon.com.br":"SELECON",
  "ibamsp.org.br":          "IBAM",
  "instituto-mais.com":     "INSTITUTO MAIS",
  "cotec.org.br":           "COTEC",
};

// ─── Termos que identificam cargos CONTÁBEIS ─────────────────────────────────
// Nível 1 — palavra-chave direta no nome do cargo
const CARGO_CONTABIL_KW = [
  "contador", "contadora", "contábil", "contabilidade", "contab",
  // Auditores FISCAIS/TRIBUTÁRIOS — diretos (sempre contábeis)
  "auditor fiscal", "auditor-fiscal",
  "auditor fiscal da receita", "auditor-fiscal da receita",
  "auditor da receita municipal", "auditor da receita estadual",
  "auditor de tributos", "auditor tributário", "auditor tributario",
  "auditor de controle interno",
  "auditor municipal", "auditor estadual", "auditor federal",
  // Auditor de Controle Interno — cargo contábil válido
  "auditor de controle", "auditor de controle interno",
  // Auditores genéricos só passam pelo fluxo de detalhe (verificação de CRC/Contábeis no PDF)
  // Fiscais tributários
  "fiscal tribut", "fiscal de tribut", "fiscal contábil",
  "fiscal de rendas", "fiscal de receitas", "fiscal da receita",
  "fiscal da receita municipal", "fiscal municipal de tributos",
  "agente fiscal de rendas",
  "agente fiscal", "agente de tributos", "inspetor fiscal", "fiscal municipal",
  // Analistas contábeis
  "analista contábil", "analista de contabilidade", "analista contabil",
  // Técnicos em contabilidade
  "técnico em contabilidade", "tecnico em contabilidade",
  "técnico contábil", "tecnico contabil",
];

// Nível 2 — cargos genéricos que SÓ entram se o PDF exigir CRC/Ciências Contábeis
// Removidos: "especialista", "assessor", "servidor", "agente administrativo" (genéricos demais)
const CARGO_GENERICO_CONTABIL_KW = [
  "analista judiciário", "analista judiciario",
  // Legislativo com área contábil
  "analista legislativo", "técnico legislativo", "tecnico legislativo",
  // Analistas de áreas financeiras/contábeis
  "analista administrativo", "analista de gestão", "analista de gestao",
  "analista de controle", "analista de finanças", "analista de financas",
  "analista de orçamento", "analista de orcamento",
  "analista de tributos", "analista tributário", "analista tributario",
  "analista de fiscalização", "analista de fiscalizacao",
  // Técnicos de nível superior com área definida
  "técnico de nível superior", "tecnico de nivel superior",
  "profissional de nível superior", "profissional de nivel superior",
  "agente de fiscalização", "agente de fiscalizacao",
  // Auditores genéricos — só aceitos se PDF exigir CRC/Ciências Contábeis
  "auditor interno", "auditor externo", "auditor público", "auditor publico", "auditor",
];

// Palavras que indicam requisito de contabilidade no texto do edital / PDF
const REQUISITO_CONTABIL_KW = [
  "ciências contábeis", "ciencias contabeis",
  "graduação em contábeis", "graduacao em contabeis",
  "graduação em ciências contábeis", "graduacao em ciencias contabeis",
  "bacharel em contábeis", "bacharel em contabilidade",
  "bacharelado em ciências contábeis",
  "diploma de contador", "curso de ciências contábeis",
  "registro no crc", "crc ativo", "crc-", "inscrito no crc",
  "técnico em contabilidade", "tecnico em contabilidade",
  "curso de contabilidade",
  "formação em contabilidade", "formacao em contabilidade",
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

// ─── Mapa UF → nome completo do estado ───────────────────────────────────────
export { UF_NOMES } from "./ufs";
import { UF_NOMES } from "./ufs";

/**
 * Extrai a cidade a partir do nome do órgão ou do título da notícia.
 *
 * Estratégias (em ordem de prioridade):
 *   1. Padrão " de CidadeNome" no órgão   → ex: "Câmara de São Paulo" → "São Paulo"
 *   2. Padrão " de CidadeNome" no título   → ex: "Prefeitura de Campinas - SP" → "Campinas"
 *   3. Padrão " do/da CidadeNome"          → ex: "Câmara Municipal do Rio" → "Rio"
 *   4. Siglas de municípios conhecidos     → fallback para nome do órgão abreviado
 *   5. "" (vazio) se não encontrado        → frontend exibe só a UF
 */
export function extrairCidade(orgao: string, title: string, uf: string): string {
  // Órgãos federais / nacionais — sem cidade específica
  const orgaoLow = orgao.toLowerCase();
  if (
    orgaoLow.includes("receita federal") ||
    orgaoLow.includes("tribunal federal") ||
    orgaoLow.includes("ministério") ||
    orgaoLow.includes("ministerio") ||
    uf === "Nacional"
  ) return "";

  // ── Estratégia 1: "Órgão [Municipal] de/do/da CIDADE" ────────────────────
  // Captura até " - UF" ou vírgula/ponto/parêntese ou fim da string.
  // O .+? (lazy) garante que paramos no primeiro separador encontrado.
  // Aceita nomes compostos com preposições internas:
  //   "Altamira do Paraná", "Rio das Ostras", "São José dos Campos",
  //   "Feira de Santana", "Vitória da Conquista"
  const reOrgao = /(?:prefeitura|c[aâ]mara(?:\s+municipal)?|município|municipio|saae|sanep|sabesp|crc-?\w*|sefaz|sesmet|autarquia|fundação|fundacao|conselho|instituto)\s+(?:municipal\s+)?(?:de|do|da|dos|das)\s+(.+?)(?:\s+-\s+[A-Z]{2}\b|\s*[,.([/]|$)/i;

  for (const fonte of [orgao, title]) {
    const m = fonte.match(reOrgao);
    if (m?.[1]) {
      let cidade = m[1].trim();
      // Remove " - UF" ou " UF" colado no final
      cidade = cidade.replace(/\s*[-–]?\s*[A-Z]{2}$/, "").trim();
      if (cidade.length >= 2 && cidade.length <= 60) return cidade;
    }
  }

  // ── Estratégia 2: padrão de título PCI "de CIDADE - UF" ──────────────────
  // Ex: "Câmara de Mara Rosa - GO abre concurso público..."
  const rePCI = /\bde\s+(.+?)\s+-\s+[A-Z]{2}\b/i;
  const mPCI = title.match(rePCI);
  if (mPCI?.[1]) {
    const candidata = mPCI[1].trim();
    const genericas = new Set([
      "abre", "publica", "edital", "concurso", "para", "cargo", "vagas",
      "prefeitura", "camara", "câmara", "governo", "secretaria", "instituto",
      "fundacao", "fundação",
    ]);
    if (!genericas.has(candidata.toLowerCase()) && candidata.length >= 2 && candidata.length <= 60) {
      return candidata.replace(/\s*[-–]?\s*[A-Z]{2}$/, "").trim();
    }
  }

  return "";
}

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
  // controle interno (cargo diferente de Contador/Auditor Contábil)
  "controlador interno", "controller",
];

/**
 * Dado um cargo extraído (que pode conter múltiplos separados por "e", ",", "/"),
 * retorna apenas as partes que são contábeis.
 * Ex: "Contador e Agente Legislativo" → "Contador"
 * Ex: "Analista de Procuradoria e Contador" → "Contador"
 * Ex: "Contador" → "Contador"
 */
export function filtrarCargosContabeis(cargo: string): string {
  // Remove prefixos genéricos de descrição de escolaridade
  // Ex: "diversos níveis de escolaridade" → descarta, usa cargosContabeis do edital
  const cargoLow = cargo.toLowerCase().trim();
  if (
    cargoLow.startsWith("diversos") ||
    cargoLow.startsWith("vários") ||
    cargoLow.startsWith("varios") ||
    cargoLow === "cargos de nível médio e superior" ||
    cargoLow === "cargos de nivel medio e superior" ||
    /^cargos? de n[íi]vel/i.test(cargoLow)
  ) {
    return "Vários Cargos"; // será substituído pelos cargosContabeis do edital
  }

  // Separa por vírgula, " e ", " E ", "/"
  const partes = cargo
    .split(/,|\s+e\s+|\//)
    .map(p => p.trim())
    .filter(p => p.length > 1);

  if (partes.length <= 1) {
    // Cargo simples — normaliza capitalização
    return normalizarNomeCargo(cargo);
  }

  const contabeis = partes.filter(p => {
    const pLow = p.toLowerCase();
    const temContabil = CARGO_CONTABIL_KW.some(kw => pLow.includes(kw));
    const ehNaoContabil = CARGOS_NAO_CONTABEIS.some(nc => pLow.includes(nc.toLowerCase()));
    return temContabil && !ehNaoContabil;
  });

  if (contabeis.length === 0) return normalizarNomeCargo(cargo);
  return contabeis.map(normalizarNomeCargo).join(" e ");
}

/**
 * Normaliza o nome do cargo para exibição:
 * - Title case correto para nomes de cargos
 * - Remove sufixos desnecessários
 */
function normalizarNomeCargo(cargo: string): string {
  // Remove prefixos como "O Cargo de", "Cargo:", "o cargo de"
  const prefixos = [
    /^o\s+cargo\s+de\s+/i,
    /^cargo\s*[:\-]\s*/i,
    /^cargo\s+de\s+/i,
    /^função\s+de\s+/i,
    /^funcao\s+de\s+/i,
    /^vaga\s+(?:de\s+|para\s+)?/i,
  ];
  let c = cargo.trim();
  for (const re of prefixos) {
    c = c.replace(re, "");
  }
  // Remove prefixo solto "de/do/da/para" no início (ex: "de Contador" → "Contador")
  c = c.replace(/^(de|do|da|para)\s+/i, "").trim();

  // Title case respeitando preposições
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o", "as", "os"]);
  return c
    .toLowerCase()
    .split(" ")
    .map((word, idx) => {
      if (idx === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      if (minusculas.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Faz fetch com timeout + retry automático (backoff exponencial).
 * Tentativas: 1ª imediata → 2ª após 300ms → 3ª após 600ms.
 * Retorna null somente se todas as tentativas falharem.
 */
async function fetchComTimeout(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS, cache: "no-store", signal: ctrl.signal });
      if (res.ok) return await res.text();
      // Status 4xx não adianta tentar novamente
      if (res.status >= 400 && res.status < 500) return null;
    } catch {
      // timeout ou erro de rede — vai tentar novamente
    } finally {
      clearTimeout(timer);
    }
    // Aguarda antes da próxima tentativa (backoff: 300ms, 600ms)
    if (attempt < retries - 1) await sleep(300 * (attempt + 1));
  }
  return null;
}

function slugify(t: string) {
  return t.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 80);
}

function detectNivel(t: string, cargo = "") {
  const l = t.toLowerCase();
  const cargoLow = cargo.toLowerCase();
  const s  = l.includes("superior");
  const m  = l.includes("medio") || l.includes("médio");
  const tc = l.includes("tecnico") || l.includes("técnico");

  // Se o cargo é explicitamente "Técnico em Contabilidade", nível é Médio/Técnico
  if (cargoLow.includes("técnico em contabilidade") || cargoLow.includes("tecnico em contabilidade")) {
    return s ? "Médio/Técnico/Superior" : "Médio/Técnico";
  }

  // Cargos contábeis de nível superior por definição (contador, auditor, analista, fiscal)
  const ehCargoSuperior = [
    "contador", "contadora", "auditor", "analista contábil", "analista contabil",
    "fiscal de tribut", "fiscal de rendas", "fiscal de receitas",
  ].some(kw => cargoLow.includes(kw));

  if (ehCargoSuperior) {
    // Mesmo que a linha diga "Médio/Superior", o cargo contábil é Superior
    return "Superior";
  }

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
  // Bug 8 fix: data no formato dd/mm sem ano — se já passou neste ano, tenta ano seguinte
  const mc = inscricao.match(/(\d{2})\/(\d{2})(?!\/)/);
  if (mc) {
    let d = new Date(hoje.getFullYear(), +mc[2] - 1, +mc[1]);
    if (d < hoje) d = new Date(hoje.getFullYear() + 1, +mc[2] - 1, +mc[1]);
    return Math.ceil((d.getTime() - hoje.getTime()) / 86400000);
  }
  return -1;
}

function detectStatus(inscricaoAte: string): Concurso["status"] {
  if (!inscricaoAte || inscricaoAte === "Ver edital") return "Encerrado";
  const dias = calcDiasRestantes(inscricaoAte);
  if (dias < 0) return "Encerrado";
  return "Inscricoes Abertas";
}

/**
 * Reclassifica o status levando em conta data de prova e resultado.
 * - "Inscricoes Abertas" → mantém (inscrições ainda abertas)
 * - "Encerrado" (inscrições fechadas) + prova futura → "Aguardando Prova"
 * - "Previsto" + prova futura → "Aguardando Prova"
 * - Prova e resultado já passaram → "Encerrado"
 */
function reclassificarStatus(
  status: Concurso["status"],
  dataProva: string,
  dataResultado: string
): Concurso["status"] {
  // Inscrições abertas: mantém como está
  if (status === "Inscricoes Abertas") return status;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Verifica se há prova futura
  if (dataProva && dataProva !== "-") {
    const [d, m, y] = dataProva.split("/").map(Number);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      const dp = new Date(y, m - 1, d);
      if (dp >= hoje) return "Aguardando Prova";
      // Prova já passou — verifica resultado
      if (dataResultado && dataResultado !== "-") {
        const [dr, mr, yr] = dataResultado.split("/").map(Number);
        if (!isNaN(dr) && !isNaN(mr) && !isNaN(yr)) {
          const dRes = new Date(yr, mr - 1, dr);
          if (dRes >= hoje) return "Aguardando Prova";
        }
      }
      return "Encerrado";
    }
  }

  // Sem data de prova — verifica só resultado
  if (dataResultado && dataResultado !== "-") {
    const [dr, mr, yr] = dataResultado.split("/").map(Number);
    if (!isNaN(dr) && !isNaN(mr) && !isNaN(yr)) {
      const dRes = new Date(yr, mr - 1, dr);
      if (dRes >= hoje) return "Aguardando Prova";
    }
  }

  // Sem datas futuras: mantém o status original (Previsto ou Encerrado)
  return status;
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

  // Rejeita processo seletivo simplificado/temporário (não concurso público)
  // Mas mantém se o cargo contábil for explícito no título
  const textoTudo = (cargo + " " + title + " " + orgao).toLowerCase();
  const temCargoContabilExplicito = CARGO_CONTABIL_KW.some(kw => titLow.includes(kw));
  if (!temCargoContabilExplicito && (
    textoTudo.includes("seleção simplificada") ||
    textoTudo.includes("selecao simplificada") ||
    textoTudo.includes("seletivo simplificado") ||
    textoTudo.includes("contratação temporária") ||
    / pss[\s,.]/.test(textoTudo) ||
    / pst[\s,.]/.test(textoTudo)
  )) return false;

  // Rejeita se title é claramente outra área
  if (AREAS_EXCLUIDAS_TITLE.some(t => titLow.includes(t))) return false;

  const orgaoLow = orgao.toLowerCase();
  // NÃO filtra por órgão — qualquer órgão pode abrir concurso para Contador.
  // Ex: CAU, CREA, OAB, CRM — todos podem ter cargos contábeis internos.
  // O filtro é sempre pelo CARGO, nunca pelo órgão.

  // Aceita se cargo tem palavra-chave direta
  const cargoLow = cargo.toLowerCase();
  if (CARGO_CONTABIL_KW.some(kw => cargoLow.includes(kw))) return true;

  // Aceita se title/texto do edital menciona contabilidade diretamente
  if (CARGO_CONTABIL_KW.some(kw => tudo.includes(kw))) return true;

  // Aceita se o texto do edital/PDF exige explicitamente Ciências Contábeis ou CRC
  // Independente do nome do cargo — ex: "Analista de Nível Superior - Área: Contábil"
  const temRequisitoContabil = REQUISITO_CONTABIL_KW.some(kw => tudo.includes(kw));
  if (temRequisitoContabil) {
    // Rejeita apenas se for cargo claramente de outra área específica
    const outraAreaEspecifica = [
      "médico", "medico", "enfermeiro", "engenheiro", "advogado",
      "professor", "psicólogo", "psicologo", "arquiteto",
    ].some(t => cargoLow.includes(t));
    if (!outraAreaEspecifica) return true;
  }

  return false;
}

/**
 * Extrai todos os cargos contábeis listados no texto do edital.
 * Útil quando o concurso tem "Vários Cargos" — lista quais são contábeis.
 */
function extrairCargosContabeisDoEdital(texto: string): string[] {
  const especialidades = extrairEspecialidadesContabeis(texto);
  if (especialidades.length) return especialidades;
  const cargos: string[] = [];
  const linhas = texto.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Busca rápida por menções diretas de cargos contábeis no texto
  // Ex: "vagas para Contador" / "cargo de Técnico em Contabilidade"
  const mencoesDiretas = [
    /\b(Contador(?:a)?)\b/gi,
    /\b(T[eé]cnico\s+em\s+Contabilidade)\b/gi,
    /\b(Auditor(?:[-\s]Fiscal)?(?:\s+(?:da\s+Receita(?:\s+Municipal)?|Interno|de\s+Controle(?:\s+Interno)?|Municipal|Estadual|Federal|de\s+Tributos|Tribut[aá]rio))?)/gi,
    /\b(Fiscal\s+(?:de\s+Tribut\w*|da\s+Receita(?:\s+Municipal)?|de\s+Rendas|Contábil))/gi,
    /\b(Analista\s+(?:de\s+)?Cont[aá]b(?:il|ilidade))\b/gi,
  ];
  for (const re of mencoesDiretas) {
    const matches = [...texto.matchAll(re)];
    for (const m of matches) {
      const c = m[1].trim().replace(/\s+/g, " ");
      if (!cargos.some(x => x.toLowerCase() === c.toLowerCase())) {
        cargos.push(c);
      }
    }
  }
  if (cargos.length > 0) return cargos.slice(0, 10);

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
  inscricao?: string;
  inscricaoInicio?: string;
  inscricaoAte?: string;
  inscricaoFimHora?: string;
  dataProva: string;
  dataResultado: string;
  banca: string;
  linkEdital: string;
  cargosContabeis: string[];
  requisito: string;
  ehProcessoSeletivo: boolean;
  linkEditalPdf?: string;
  linkBanca?: string;
  cargosDetalhados?: { cargo: string; vagas: string; salario: string; nivel: string; requisito: string; evidencia?: string; estados?: string[] }[];
  textoHtml?: string; // texto completo do HTML da notícia para fallback de cargo
}

export function extrairDetalhes(texto: string): DetalhesEdital {
  const out: DetalhesEdital = {
    dataProva: "-", dataResultado: "-", banca: "-",
    linkEdital: "", cargosContabeis: [], requisito: "-",
    ehProcessoSeletivo: false, cargosDetalhados: [], textoHtml: "",
  };

  // Valida se uma data extraída faz sentido para um concurso público atual
  // Bug 9 fix: era >= 2024 hardcoded — agora usa anoAtual - 1 para não quebrar em 2027+
  function dataValida(d: string): boolean {
    const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return false;
    const ano = parseInt(m[3]);
    const anoAtual = new Date().getFullYear();
    return ano >= anoAtual - 1 && ano <= anoAtual + 2;
  }

  // ── Converte datas por extenso para DD/MM/AAAA ──────────────────────────────
  // Ex: "17 de maio de 2026" → "17/05/2026"
  // Ex: "24 DE MAIO DE 2026" → "24/05/2026" (editais em caixa alta)
  const MESES: Record<string, string> = {
    janeiro:"01", fevereiro:"02", março:"03", marco:"03",
    abril:"04", maio:"05", junho:"06", julho:"07",
    agosto:"08", setembro:"09", outubro:"10",
    novembro:"11", dezembro:"12",
  };
  function converterDataExtenso(t: string): string {
    let r = t;
    // 1. Ordinais: "1º/3/2026" | "1°/3/2026" → "01/03/2026"
    r = r.replace(
      /(\d{1,2})[º°o]\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/gi,
      (_, d, m, y) => d.padStart(2,"0") + "/" + m.padStart(2,"0") + "/" + y
    );
    // 2. Por extenso (minúsculo ou MAIÚSCULO): "17 de maio de 2026" ou "24 DE MAIO DE 2026"
    // Fix: o charset original [a-záéíóúâêîôûãõç] não pegava letras maiúsculas acentuadas
    r = r.replace(
      /(\d{1,2})\s+de\s+([a-záéíóúâêîôûãõçA-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]+)\s+de\s+(\d{4})/gi,
      (orig, d, mes, y) => {
        const m = MESES[mes.toLowerCase()];
        return m ? d.padStart(2, "0") + "/" + m + "/" + y : orig;
      }
    );
    return r;
  }
  const textoNorm = converterDataExtenso(texto);

  // Tenta primeiro na seção de cronograma (mais preciso)
  const idxCrono = textoNorm.search(/cronograma\s+do\s+concurso/i);
  if (idxCrono !== -1) {
    const secaoCrono = textoNorm.substring(idxCrono, idxCrono + 2000);
    const resCronoPro = [
      /aplica[cç][aã]o\s+das?\s+provas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
      /provas?\s+objetivas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
      /realiza[cç][aã]o\s+das?\s+provas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
      /prova\s+escrita[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    ];
    for (const re of resCronoPro) {
      const m = secaoCrono.match(re);
      if (m?.[1] && dataValida(m[1])) { out.dataProva = m[1]; break; }
    }
    if (out.dataProva === "-") {
      // fallback: primeira data na seção cronograma após "prova"
      const mCrono = secaoCrono.match(/prova[^.]{0,60}(\d{2}\/\d{2}\/\d{4})/i);
      if (mCrono?.[1] && dataValida(mCrono[1])) out.dataProva = mCrono[1];
    }
  }

  // Extrai data de encerramento das inscrições para usar como limite mínimo da prova.
  // Bug fix: impede que data de inscrição seja confundida com data de prova.
  // IMPORTANTE: usar regex específica para não capturar a data da prova como "inscricaoAte"
  const inscricaoAteMatch = textoNorm.match(
    /inscri[cç][oõ]es?\s+(?:at[eé]|encerr\w+|v[aá]lid\w*|prazo)[^.]{0,80}?(\d{2}\/\d{2}\/\d{4})/i
  ) || textoNorm.match(
    /(?:per[íi]odo\s+de\s+inscri[cç][oõ]es?|prazo\s+(?:final\s+)?das?\s+inscri[cç][oõ]es?)[^.]{0,80}?(\d{2}\/\d{2}\/\d{4})/i
  );
  // Só usa a data se for claramente de inscrição (não captura data de prova)
  const tsInscricaoAte = inscricaoAteMatch?.[1]
    ? (() => { const [d,m,y] = inscricaoAteMatch[1].split("/").map(Number); return new Date(y,m-1,d).getTime(); })()
    : 0;

  // Testa no texto com datas convertidas (pega "17 de maio de 2026")
  // As primeiras regex da lista são mais confiáveis (explícitas) — não aplicar validação de tsInscricaoAte nelas
  const provaReConfiavel = [
    /provas?\s+objetivas?\s+e\s+discursivas?\s+(?:est[aã]o\s+)?previstas?\s+para\s+o\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
    /aplica[cç][aã]o\s+das?\s+provas?\s*(?:objetivas?)?\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+de\s+realiza[cç][aã]o\s+das?\s+provas?\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s+(?:objetivas?|escritas?|pr[áa]ticas?)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /previstas?\s+para\s+(?:ser(?:em)?\s+)?aplicadas?\s+(?:em|no\s+dia)\s+(\d{2}\/\d{2}\/\d{4})/i,
    /previstas?\s+para\s+sua\s+realiza[cç][aã]o\s+(?:em|no\s+dia)\s+(\d{2}\/\d{2}\/\d{4})/i,
    /aplica[cç][aã]o\s+prevista\s+para\s+o\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s+objetivas?\s+(?:est[aã]o\s+)?marcadas?\s+para\s+o\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
  ];
  for (const re of provaReConfiavel) {
    const m = textoNorm.match(re);
    if (m?.[1] && dataValida(m[1])) { out.dataProva = m[1]; break; }
  }

  // Se não encontrou nas confiáveis, tenta regex menos específicas com validação de data
  if (out.dataProva === "-") {
    const provaReFallback = [
      /ser[aã]o\s+aplicadas?\s+(?:em|no\s+dia)\s+(\d{2}\/\d{2}\/\d{4})/i,
      /aplicadas?\s+na\s+cidade\s+de\s+[^,]{1,40},\s+no\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
      /no\s+dia\s+(\d{2}\/\d{2}\/\d{4})[^\n]{0,60}prova/i,
      /prova[^\n]{0,60}no\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
      /data\s+prov[aá]vel\s+(?:da\s+prova\s+)?[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /provas?[.\s\-]{2,}(\d{2}\/\d{2}\/\d{4})/i,
      /provas?\s*:\s*(\d{2}\/\d{2}\/\d{4})/i,
    ];
    for (const re of provaReFallback) {
      const m = textoNorm.match(re);
      if (!m?.[1] || !dataValida(m[1])) continue;
      // Validação extra: data de prova deve ser POSTERIOR ao encerramento das inscrições
      if (tsInscricaoAte > 0) {
        const [dp, mp, yp] = m[1].split("/").map(Number);
        const tsProva = new Date(yp, mp - 1, dp).getTime();
        if (tsProva <= tsInscricaoAte) continue;
      }
      out.dataProva = m[1];
      break;
    }
  }

  // Data do resultado — também usa textoNorm (datas por extenso convertidas)
  const resRe = [
    /(?:divulg|publica)[^.]{0,50}?(?:resultado|gabarito)[^.]{0,50}?(\d{2}\/\d{2}\/\d{4})/i,
    /(?:resultado|gabarito)[^.]{0,60}?(\d{2}\/\d{2}\/\d{4})/i,
    /homologa[^.]{0,60}?(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^.]{0,30}?(?:resultado|gabarito|homologa)/i,
  ];
  // Helper: converte dd/mm/yyyy em timestamp para comparar datas
  const toTs = (d: string) => { const [dd,mm,yy] = d.split("/").map(Number); return new Date(yy,mm-1,dd).getTime(); };
  for (const re of resRe) {
    const m = textoNorm.match(re);
    if (!m?.[1] || m[1] === out.dataProva) continue;
    if (!dataValida(m[1])) continue; // rejeita datas absurdas
    // Só aceita se não houver data de prova, ou se resultado for POSTERIOR à prova
    if (out.dataProva && out.dataProva !== "-" && toTs(m[1]) <= toTs(out.dataProva)) continue;
    out.dataResultado = m[1];
    break;
  }

  // Banca — múltiplas estratégias de detecção
  const textoUp = texto.toUpperCase();

  // Estratégia 1: nome exato da banca, mas com contexto (não detecta "objetiva" em "prova objetiva")
  // Termos ambíguos precisam de contexto; termos únicos podem ser buscados diretamente
  const BANCAS_AMBIGUAS = new Set(["OBJETIVA", "CIDADES", "ACESSO", "NOVA", "MAIS", "CAP", "RBO", "IFB"]);
  const CONTEXTO_BANCA = /(?:banca|organiza[çc][aã]o|organizadora|realiza[çc][aã]o|respons[aá]vel|execu[çc][aã]o|contrat|inscri[çc][oõ]es?\s+(?:pelo?|pela?))/i;

  for (const b of BANCAS_CONHECIDAS) {
    const bUp = b.toUpperCase();
    if (!textoUp.includes(bUp)) continue;

    if (BANCAS_AMBIGUAS.has(b)) {
      // Para termos ambíguos: só aceita se aparecer próximo de palavra de contexto de banca
      const idx = textoUp.indexOf(bUp);
      const contexto = texto.substring(Math.max(0, idx - 120), idx + bUp.length + 120);
      if (CONTEXTO_BANCA.test(contexto)) { out.banca = b; break; }
    } else {
      // Termos únicos (AMAUC, IDECAN, FAFIPA, etc.): aceita diretamente
      out.banca = b; break;
    }
  }

  // Estratégia 2: padrões de frases que indicam a banca organizadora
  if (out.banca === "-") {
    const padroesBanca: RegExp[] = [
      new RegExp("organiza(?:do|cao)\\s+(?:pela?|pelo?\\s+instituto)\\s+([A-Za-z\\u00C0-\\u00FF][A-Za-z\\u00C0-\\u00FF\\s\\-]{2,40}?)(?:\\s*[,.\\n]|$)", "i"),
      new RegExp("banca\\s+organiz\\w+\\s*[:\\-]\\s*([A-Za-z\\u00C0-\\u00FF][A-Za-z\\u00C0-\\u00FF\\s\\-]{2,40}?)(?:\\s*[,.\\n]|$)", "i"),
      new RegExp("(?:realiz\\w+|execut\\w+)\\s+(?:pela?|pelo?)\\s+([A-Za-z\\u00C0-\\u00FF][A-Za-z\\u00C0-\\u00FF\\s\\-]{2,40}?)(?:\\s*[,.\\n]|$)", "i"),
      new RegExp("empresa\\s+organiz\\w+\\s*[:\\-]\\s*([A-Za-z\\u00C0-\\u00FF][A-Za-z\\u00C0-\\u00FF\\s\\-]{2,40}?)(?:\\s*[,.\\n]|$)", "i"),
    ];
    for (const re of padroesBanca) {
      const m = texto.match(re);
      if (m?.[1]) {
        const candidato = m[1].trim().replace(/\s+/g, " ");
        const bancaMatch = BANCAS_CONHECIDAS.find(b =>
          candidato.toUpperCase().includes(b.toUpperCase()) ||
          b.toUpperCase().includes(candidato.toUpperCase().slice(0, 6))
        );
        if (bancaMatch) { out.banca = bancaMatch; break; }
        // Rejeita palavras genéricas que não são nomes de banca
        const TERMOS_GENERICOS_BANCA = new Set([
          "ORGANIZADORA", "ORGANIZACAO", "ORGANIZAÇÃO", "EMPRESA", "INSTITUTO",
          "FUNDACAO", "FUNDAÇÃO", "SECRETARIA", "PREFEITURA", "CAMARA", "CÂMARA",
          "COMISSAO", "COMISSÃO", "CONCURSO", "PUBLICA", "PÚBLICA", "A EMPRESA",
          "ENTIDADE", "CONTRATADA", "RESPONSAVEL", "RESPONSÁVEL",
        ]);
        const primeiraPalavra = candidato.toUpperCase().split(" ")[0];
        if (
          candidato.length >= 3 &&
          candidato.length <= 40 &&
          !TERMOS_GENERICOS_BANCA.has(candidato.toUpperCase()) &&
          !TERMOS_GENERICOS_BANCA.has(primeiraPalavra)
        ) {
          out.banca = candidato.toUpperCase();
          break;
        }
      }
    }
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

  // Detecta se o texto indica processo seletivo (não concurso público)
  const textoNormPS = textoLow.toLowerCase();
  if (
    textoNormPS.includes("processo seletivo simplificado") ||
    textoNormPS.includes("seleção simplificada") ||
    textoNormPS.includes("selecao simplificada") ||
    textoNormPS.includes("contratação temporária") ||
    /\bpss\b/.test(textoNormPS) ||
    (textoNormPS.includes("processo seletivo") && !textoNormPS.includes("concurso público"))
  ) {
    out.ehProcessoSeletivo = true;
  }

  return out;
}

// ─── Scraping da listagem ─────────────────────────────────────────────────────

export async function scrapeListagem(url: string, _ehPaginaDeNoticias = false): Promise<Partial<Concurso>[]> {
  const html = await fetchComTimeout(BASE_URL + url);
  if (!html) throw new Error("PCI indisponível: " + url);
  return lerListagemPCI(html);
}

// ─── Scraping de detalhe ──────────────────────────────────────────────────────

export async function scrapeDetalhe(url: string): Promise<DetalhesEdital> {
  const empty: DetalhesEdital = {
    dataProva: "-", dataResultado: "-", banca: "-",
    linkEdital: "", cargosContabeis: [], requisito: "-",
    ehProcessoSeletivo: false, textoHtml: "",
  };
  if (!url) return empty;
  const html = await fetchComTimeout(url);
  if (!html) throw new Error("Notícia PCI indisponível: " + url);
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  // ── Extrai link PDF diretamente dos elementos <a href> ────────────────────
  let pdfHref = "";
  $("a[href]").each((_, el) => {
    if (pdfHref) return;
    const h = ($(el).attr("href") || "").trim();
    if (h.match(/\.pdf(?:[?#]|$)/i) && (h.includes("arq.pciconcursos") || h.includes("pciconcursos"))) {
      pdfHref = h.startsWith("http") ? h : "https://arq.pciconcursos.com.br" + h;
    }
  });
  if (!pdfHref) {
    $("[itemprop=articleBody] a[href]").each((_, el) => {
      if (pdfHref) return;
      const h = ($(el).attr("href") || "").trim();
      if (/\.pdf(?:[?#]|$)/i.test(h)) pdfHref = new URL(h, url).href;
    });
  }

  // ── Fallback: site oficial do concurso ────────────────────────────────────
  // A PCI Concursos passou a esconder o link do PDF do edital atrás de uma
  // verificação anti-bot em JavaScript (href="javascript:void(0)" no HTML puro),
  // então o scraper (sem execução de JS) não consegue mais capturá-lo na maioria
  // dos casos. Como alternativa, tenta achar o site oficial de inscrição citado
  // no texto da notícia (ex.: "exclusivamente pelo site www.inepam.org.br") —
  // mais útil para o candidato do que só o link da notícia do PCI.
  let siteOficialHref = "";
  let prioridadeSite = -1;
  {
    const DOMINIOS_IGNORADOS = [
      "pciconcursos.com.br", "facebook.com", "instagram.com", "twitter.com",
      "x.com", "linkedin.com", "t.me", "telegram", "whatsapp.com", "youtube.com",
    ];
    $("[itemprop=articleBody] a[href^='http']").each((_, el) => {
      const h = ($(el).attr("href") || "").trim();
      try {
        const host = new URL(h).hostname.replace(/^www\./, "");
        if (DOMINIOS_IGNORADOS.some(d => host.includes(d)) || /\.pdf(?:[?#]|$)/i.test(h)) return;
        const contexto = ($(el).parent().text() || "").toLowerCase();
        if (contexto.includes("site") || contexto.includes("inscri") || contexto.includes("edital")) {
          const prioridade = contexto.includes("inscri") ? 2 : 1;
          if(prioridade > prioridadeSite) { siteOficialHref = h; prioridadeSite = prioridade; }
        }
      } catch { /* URL inválida, ignora */ }
    });
  }

  // ── Verifica data de publicação da notícia ───────────────────────────────
  const bodyText = $("body").text();
  const anoAtualCheck = new Date().getFullYear();

  // Extrai TODOS os anos de 4 dígitos encontrados na página
  const anosNaPagina = (bodyText.match(/(20\d{2})/g) || [])
    .map(Number)
    .filter(a => a >= 2010 && a <= anoAtualCheck + 2);

  if (anosNaPagina.length > 0) {
    const anoMaisRecente = Math.max(...anosNaPagina);
    if (anoMaisRecente < anoAtualCheck - 1) {
      // Todos os anos mencionados são antigos — notícia velha
      console.log("[SCRAPER] Notícia antiga descartada:", url, "- ano mais recente:", anoMaisRecente);
      return empty;
    }
  }

  // ── Extrai do HTML da notícia (base) ──────────────────────────────────────
  // Remove navegação e notícias relacionadas antes de procurar cargos e datas.
  const $artigo = $("[itemprop=articleBody]").first().clone();
  $artigo.find("nav, aside, script, style").remove();
  const texto = $artigo.length ? $artigo.text() : bodyText.split(/Veja também:|Destaques:/i)[0];
  const det = extrairDetalhes(texto);
  const especialidades = extrairDetalhesEspecialidade(texto);
  if (especialidades.length) {
    det.cargosContabeis = especialidades.map(c => c.cargo);
    det.cargosDetalhados = especialidades;
  }
  if (pdfHref) det.linkEdital = pdfHref;
  else if (siteOficialHref) det.linkEdital = siteOficialHref;

  // ── Tenta banca pelos links externos ─────────────────────────────────────
  if (det.banca === "-") {
    $("a[href]").each((_, el) => {
      if (det.banca !== "-") return;
      const href = ($(el).attr("href") || "").toLowerCase();
      for (const [dominio, nome] of Object.entries(DOMINIO_BANCA)) {
        if (href.includes(dominio)) { det.banca = nome; return false; }
      }
    });
  }
  if (det.banca === "-") {
    $("a").each((_, el) => {
      if (det.banca !== "-") return;
      const textoLink = ($(el).text() || "").toUpperCase();
      for (const b of BANCAS_CONHECIDAS) {
        if (textoLink.includes(b.toUpperCase())) { det.banca = b; return false; }
      }
    });
  }

  const pdfConfirmados: NonNullable<DetalhesEdital["cargosDetalhados"]> = [];
  // ── Extrai do PDF (fonte mais rica) ──────────────────────────────────────
  // Sobrescreve campos do HTML com dados do PDF quando disponíveis e melhores
  if (pdfHref) {
    try {
      const { extrairDetalhesDoPDF } = await import("./pdf-extractor");
      const pdf = await extrairDetalhesDoPDF(pdfHref);
      if (pdf) {
        // PDF tem prioridade sobre HTML para todos os campos
        if (pdf.banca          && pdf.banca          !== "-") det.banca          = pdf.banca;
        if (pdf.dataProva      && pdf.dataProva      !== "-") det.dataProva      = pdf.dataProva;
        if (pdf.dataResultado && pdf.dataResultado !== "-") {
          // Só aceita resultado se for POSTERIOR à prova (evita datas de publicação do edital)
          const toTs = (d: string) => {
            const [dd,mm,yy] = d.split("/").map(Number);
            return new Date(yy, mm-1, dd).getTime();
          };
          const provaTs = det.dataProva && det.dataProva !== "-" ? toTs(det.dataProva) : 0;
          if (provaTs === 0 || toTs(pdf.dataResultado) > provaTs) {
            det.dataResultado = pdf.dataResultado;
          }
        }
        if (pdf.requisito      && pdf.requisito      !== "-") det.requisito      = pdf.requisito;
        if (pdf.cargosContabeis && pdf.cargosContabeis.length > 0) {
          det.cargosContabeis = pdf.cargosContabeis;
        }
        if (pdf.cargosDetalhados && pdf.cargosDetalhados.length > 0) {
          det.cargosDetalhados = pdf.cargosDetalhados;
          pdfConfirmados.push(...pdf.cargosDetalhados);
        }
      }
    } catch {
      // PDF indisponível ou erro — mantém dados do HTML
    }
  }

  const estruturado = lerNoticiaPCI(html, url);
  const bancasFonte=new Set<string>();
  $("[itemprop=articleBody] a[href]").each((_,el)=>{
    try {
      const host=new URL($(el).attr("href") || "").hostname.replace(/^www\./,"");
      for(const [dominio,banca] of Object.entries(DOMINIO_BANCA)) if(host===dominio || host.endsWith("."+dominio)) bancasFonte.add(banca);
    } catch { /* relative/non-web link */ }
  });
  if(bancasFonte.size) det.banca=bancasFonte.size===1 ? [...bancasFonte][0] : "-";
  const confirmados = estruturado.cargosDetalhados || [];
  // Only an exact role match may inherit values from an accessible PDF table.
  for (const cd of confirmados) {
    const pdfCargo = pdfConfirmados.find(p => normalizar(p.cargo) === normalizar(cd.cargo));
    if (pdfCargo) {
      if (pdfCargo.salario && pdfCargo.salario !== "Ver edital") cd.salario = pdfCargo.salario;
      if (pdfCargo.vagas && pdfCargo.vagas !== "Ver edital") cd.vagas = pdfCargo.vagas;
    }
  }
  for (const cd of pdfConfirmados) {
    if ((["formacao-contabil","cargo-contabil"].includes(tipoRelevancia(cd.cargo,cd.requisito) || "")) && !confirmados.some(c=>normalizar(c.cargo)===normalizar(cd.cargo))) confirmados.push(cd);
  }
  return { ...det, ...estruturado, dataProva: estruturado.dataProva || "-",
    linkEditalPdf: pdfHref || undefined, linkBanca: siteOficialHref || undefined,
    linkEdital: pdfHref || siteOficialHref || estruturado.linkEdital || url, banca: det.banca, cargosDetalhados: confirmados, cargosContabeis: confirmados.map(c => c.cargo) };

}

// ─── Principal ────────────────────────────────────────────────────────────────

export async function descobrirConcursos(): Promise<Partial<Concurso>[]> {
  // The general index discovers jobs whose titles do not mention Accounting.
  // The dedicated lists also retain contests waiting for their exam.
  const urls = [...new Set(["/concursos/", ...VAGAS_URLS, ...CONCURSOS_URLS])];
  const candidatos = new Map<string, Partial<Concurso>>();
  for (let i=0;i<urls.length;i+=5) {
    const resultados = await Promise.allSettled(urls.slice(i,i+5).map(u=>scrapeListagem(u)));
    for (let j=0;j<resultados.length;j++) {
      const r=resultados[j];
      if (r.status === "rejected") {
        if (urls[i+j] === "/concursos/") throw r.reason;
        continue;
      }
      for(const item of r.value) {
        const fim = diaNumero(item.inscricaoAte);
        if (fim !== null && fim < hojeBrasil()-180) continue;
        if (item.linkNoticia && !candidatos.has(item.linkNoticia)) candidatos.set(item.linkNoticia,item);
      }
    }
  }
  return [...candidatos.values()];
}

export async function scrapeAllConcursos(): Promise<Concurso[]> {
  const items=await descobrirConcursos();
  const concursos: Concurso[]=[];
  for(let i=0;i<items.length;i+=5) {
    const lote=items.slice(i,i+5);
    const detalhes=await Promise.all(lote.map(c=>scrapeDetalhe(c.linkNoticia || "")));
    for(let j=0;j<lote.length;j++) concursos.push(...montarConcursos(lote[j],detalhes[j]));
  }
  return concursos;
}

function getFallbackData(): Concurso[] {
  return [
    {
      id: "contador-camara-tamboara-pr",
      cargo: "Contador",
      cargosContabeis: ["Contador"],
      orgao: "Câmara de Tamboara",
      estado: "PR",
      cidade: "Tamboara",
      uf: "Paraná",
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
      cidade: "Sabarà",
      uf: "Minas Gerais",
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
      cidade: "Goiânia",
      uf: "Goiás",
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
