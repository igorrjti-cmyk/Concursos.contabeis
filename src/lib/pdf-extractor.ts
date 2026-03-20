// src/lib/pdf-extractor.ts
// Extrai texto de PDFs de editais usando unpdf (otimizado para Vercel/Node.js)

import type { DetalhesEdital } from "./scraper";

const TIMEOUT_PDF_MS = 20000;

const MESES: Record<string, string> = {
  janeiro:"01", fevereiro:"02", março:"03", marco:"03",
  abril:"04", maio:"05", junho:"06", julho:"07",
  agosto:"08", setembro:"09", outubro:"10",
  novembro:"11", dezembro:"12",
};

function normalizarDatas(texto: string): string {
  return texto.replace(
    /(\d{1,2})\s+de\s+([a-záéíóúâêîôûãõç]+)\s+de\s+(\d{4})/gi,
    (orig, d, mes, y) => {
      const m = MESES[mes.toLowerCase()];
      return m ? d.padStart(2, "0") + "/" + m + "/" + y : orig;
    }
  );
}

const BANCAS_PDF = [
  "AMAUC", "ACESSE CONCURSO", "IBGP", "CONSCAM",
  "INSTITUTO CONSULPLAN", "S. R. DIGITALIZAÇÕES",
  "FADENOR", "CAP CONCURSOS", "NOSSO RUMO", "INSTITUTO NOSSO RUMO",
  "FAFIPA", "FUNDAÇÃO FAFIPA", "IMESO", "ABCP",
  "CEBRASPE", "CESPE", "FGV", "FCC", "VUNESP", "IBFC", "IDECAN", "AOCP",
  "FUNDATEC", "FEPESE", "IADES", "QUADRIX", "NUCEPE", "CONSULPLAN",
  "IBAM", "SELECON", "AVANCASP", "FAFIPE", "FADESP", "FUNRIO",
  "COGNUS", "EXATUS", "LEGALLE", "MOVENS", "FUMARC", "COVEST",
  "COMPERVE", "FUNCAB", "IDIB", "IDCAN", "NOVA CONCURSOS",
  "INTELECTUS", "COTEC", "INSTITUTO MAIS", "RBO", "AMEOSC",
  "SOLUÇÃO CONCURSOS", "MAIS CONCURSOS", "OBJETIVA CONCURSOS",
];

const BANCAS_AMBIGUAS = new Set(["OBJETIVA CONCURSOS", "ACESSO", "NOVA", "MAIS", "RBO"]);  // QUADRIX não é ambíguo
const CTX_BANCA = /\b(?:banca|organiza[cç][aã]o|organizadora|realiza[cç][aã]o|respons[aá]vel|contrat)\b/i;

const KW_CONTABIL = [
  "contador", "contadora", "contábil", "contabilidade", "contab",
  "auditor fiscal", "fiscal de tributos",
  "técnico em contabilidade", "tecnico em contabilidade",
  "analista contábil", "analista de contabilidade",
  "auditor interno",
  "analista contabil",
];

async function baixarPDF(url: string): Promise<ArrayBuffer | null> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_PDF_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
        "Referer": "https://www.pciconcursos.com.br/",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[PDF] HTTP ${res.status} para ${url}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    console.log(`[PDF] Baixado ${Math.round(buf.byteLength / 1024)}KB`);
    return buf;
  } catch (e) {
    console.warn(`[PDF] Erro ao baixar:`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Detalhe de um cargo extraído do edital PDF
export interface CargoDetalhe {
  cargo: string;
  vagas: string;
  salario: string;
  nivel: string;
  requisito: string;
}

/**
 * Extrai tabela de cargos com vagas e salários do texto do PDF.
 * Suporta padrões comuns em editais brasileiros:
 *   "Contador  5 vagas  R$ 5.000,00  Superior"
 *   "01 - Contador | 3 | R$ 4.500,00 | Graduação"
 */
export function extrairTabelaCargos(texto: string): CargoDetalhe[] {
  const resultado: CargoDetalhe[] = [];
  const seen = new Set<string>();
  const linhas = texto.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 3);

  // Padrões para detectar linha de cargo com vagas e salário
  const padroes: RegExp[] = [
    // "Contador  5 vagas  R$ 5.409,87  Superior"
    /^([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\d\n]{3,60}?)\s+(\d+(?:\s+vagas?)?(?:\s*\+\s*CR)?|CR|cadastro\s+reserva)\s+R\$\s*([\d.,]+)/i,
    // "01. Contador | 5 vagas | R$ 5.409,87"
    /^(?:\d+[.\-\s]+)?([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\d|]{3,50}?)\s*\|\s*(\d+(?:\s+vagas?)?|CR)\s*\|\s*R\$\s*([\d.,]+)/i,
    // "Contador: 5 vagas, salário R$ 5.409,87"
    /^([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\d\n]{3,50}?):\s*(\d+)\s*vagas?,\s*(?:salário|remuneração)[:\s]+R\$\s*([\d.,]+)/i,
    // Tabela com espaços duplos
    /^([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç\s]{3,50}?)\s{2,}(\d{1,3}(?:\s+vagas?)?)\s{2,}R\$\s*([\d.,]+)/i,
  ];

  const KW_CONTABIL_LOCAL = [
    "contador", "contadora", "contábil", "contabilidade",
    "auditor", "fiscal", "tribut", "técnico em cont", "tecnico em cont",
    "analista cont", "controle interno",
  ];

  function ehContabil(s: string): boolean {
    const sl = s.toLowerCase();
    return KW_CONTABIL_LOCAL.some(kw => sl.includes(kw));
  }

  function detectNivelLocal(s: string): string {
    const l = s.toLowerCase();
    if (l.includes("superior")) return "Superior";
    if (l.includes("técnico") || l.includes("tecnico")) return "Médio/Técnico";
    if (l.includes("médio") || l.includes("medio")) return "Médio";
    return "Superior";
  }

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!ehContabil(linha)) continue;

    for (const re of padroes) {
      const m = linha.match(re);
      if (m) {
        const cargo = m[1].trim().replace(/\s+/g, " ");
        const vagasRaw = m[2].trim();
        const salarioRaw = m[3].trim();
        const key = cargo.toLowerCase();

        if (seen.has(key)) break;
        seen.add(key);

        const contexto = linhas.slice(i, i + 3).join(" ");
        const nivel = detectNivelLocal(contexto);

        let requisito = "Nível Superior";
        if (contexto.toLowerCase().includes("crc")) requisito = "Graduação + CRC";
        else if (
          contexto.toLowerCase().includes("ciências contábeis") ||
          contexto.toLowerCase().includes("ciencias contabeis")
        ) requisito = "Graduação - Ciências Contábeis";

        resultado.push({
          cargo: cargo.charAt(0).toUpperCase() + cargo.slice(1),
          vagas: vagasRaw.match(/\d/) ? vagasRaw.replace(/vagas?/i, "").trim() + " vagas" : vagasRaw,
          salario: "R$ " + salarioRaw,
          nivel,
          requisito,
        });
        break;
      }
    }
  }

  return resultado.slice(0, 10);
}

async function extrairTextoPDF(buffer: ArrayBuffer): Promise<string> {
  try {
    const { extractText } = await import("unpdf");
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    console.log(`[PDF] unpdf extraiu ${text?.length ?? 0} chars`);
    return text ?? "";
  } catch (e) {
    console.warn("[PDF] unpdf falhou:", e);
    return "";
  }
}

export async function extrairDetalhesDoPDF(pdfUrl: string): Promise<Partial<DetalhesEdital> | null> {
  if (!pdfUrl || !pdfUrl.toLowerCase().endsWith(".pdf")) return null;

  const buffer = await baixarPDF(pdfUrl);
  if (!buffer) return null;

  const textoRaw = await extrairTextoPDF(buffer);
  if (!textoRaw || textoRaw.trim().length < 50) {
    console.warn("[PDF] Texto extraído vazio ou muito curto");
    return null;
  }

  const textoNorm = normalizarDatas(textoRaw);

  const banca           = extrairBanca(textoRaw);
  const dataProva       = extrairDataProva(textoNorm);
  const dataResultado   = extrairDataResultado(textoNorm, dataProva);
  const cargosContabeis = extrairCargos(textoNorm);
  const requisito       = extrairRequisito(textoRaw);

  console.log(`[PDF] banca=${banca} prova=${dataProva} resultado=${dataResultado}`);

  const cargosDetalhados = extrairTabelaCargos(texto);
  console.log(`[PDF] cargosDetalhados=${cargosDetalhados.length}`);

  return { banca, dataProva, dataResultado, cargosContabeis, requisito, linkEdital: "", cargosDetalhados };
}

function extrairBanca(texto: string): string {
  const up = texto.toUpperCase();
  for (const b of BANCAS_PDF) {
    if (!up.includes(b.toUpperCase())) continue;
    if (BANCAS_AMBIGUAS.has(b)) {
      const idx = up.indexOf(b.toUpperCase());
      const ctx = texto.substring(Math.max(0, idx - 150), idx + b.length + 150);
      if (CTX_BANCA.test(ctx)) return b;
    } else {
      return b;
    }
  }
  const padroes = [
    /realizado\s+(?:pela?|pelo?\s+(?:instituto|fundação|empresa))\s+([\w\s.\-]{3,50}?)(?:\s*[,;.\n])/i,
    /organizado\s+(?:pela?|pelo?\s+(?:instituto|fundação))\s+([\w\s.\-]{3,50}?)(?:\s*[,;.\n])/i,
    /banca\s+organiz\w*\s*[:\-]\s*([\w\s.\-]{3,50}?)(?:\s*[,;.\n])/i,
    /responsável\s+pela?\s+organiz\w*\s*[:\-]?\s*([\w\s.\-]{3,50}?)(?:\s*[,;.\n])/i,
  ];
  for (const re of padroes) {
    const m = texto.match(re);
    if (m?.[1]) {
      const c = m[1].trim().replace(/\s+/g, " ");
      const match = BANCAS_PDF.find(b =>
        c.toUpperCase().includes(b.toUpperCase()) ||
        b.toUpperCase().includes(c.toUpperCase().slice(0, 8))
      );
      if (match) return match;
      if (c.length >= 3 && c.length <= 50) return c.toUpperCase();
    }
  }
  return "-";
}

// Valida se a data extraída faz sentido para concurso atual (2024 em diante)
function dataValidaPDF(d: string): boolean {
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return false;
  const ano = parseInt(m[3]);
  const anoAtual = new Date().getFullYear();
  return ano >= 2024 && ano <= anoAtual + 2;
}

function extrairCronograma(textoNorm: string): { dataProva: string; dataResultado: string } {
  let dataProva = "-";
  let dataResultado = "-";
  const idx = textoNorm.search(/cronograma\s+do\s+concurso/i);
  if (idx === -1) return { dataProva, dataResultado };
  const secao = textoNorm.substring(idx, idx + 2000);
  const provaPatterns = [
    /aplica[cç][aã]o\s+das?\s+provas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s+objetivas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /realiza[cç][aã]o\s+das?\s+provas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+das?\s+provas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
  ];
  for (const re of provaPatterns) {
    const m = secao.match(re);
    if (m?.[1] && dataValidaPDF(m[1])) { dataProva = m[1]; break; }
  }
  const resPatterns = [
    /divulga[cç][aã]o\s+(?:do\s+)?resultado[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado\s+(?:final|definitivo)[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /homologa[cç][aã]o[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
  ];
  for (const re of resPatterns) {
    const m = secao.match(re);
    if (m?.[1] && m[1] !== dataProva && dataValidaPDF(m[1])) { dataResultado = m[1]; break; }
  }
  return { dataProva, dataResultado };
}

function extrairDataProva(textoNorm: string): string {
  const crono = extrairCronograma(textoNorm);
  if (crono.dataProva !== "-") return crono.dataProva;
  const padroes = [
    /aplica[cç][aã]o\s+das?\s+provas?\s*(?:objetivas?)?\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+de\s+realiza[cç][aã]o\s+das?\s+provas?\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s+(?:objetivas?|escritas?)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /previstas?\s+para\s+(?:ser(?:em)?\s+)?aplicadas?\s+(?:em|no\s+dia)\s+(\d{2}\/\d{2}\/\d{4})/i,
    /ser[aã]o\s+aplicadas?\s+(?:em|no\s+dia)\s+(\d{2}\/\d{2}\/\d{4})/i,
    /aplicadas?\s+na\s+cidade\s+de\s+[^,]{1,40},\s+no\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
    /no\s+dia\s+(\d{2}\/\d{2}\/\d{4})[\s\S]{0,60}prova/i,
    /prova[\s\S]{0,60}no\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
    /prova[^\n]{0,40}(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}prova/i,
  ];
  for (const re of padroes) {
    const m = textoNorm.match(re);
    if (m?.[1]) return m[1];
  }
  return "-";
}

function extrairDataResultado(textoNorm: string, dataProva: string): string {
  const crono = extrairCronograma(textoNorm);
  if (crono.dataResultado !== "-" && crono.dataResultado !== dataProva) return crono.dataResultado;
  const padroes = [
    /divulga[cç][aã]o\s+(?:do\s+)?(?:resultado|gabarito)\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado\s+(?:final|definitivo)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /homologa[cç][aã]o\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado[^\n]{0,60}(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}resultado/i,
  ];
  for (const re of padroes) {
    const m = textoNorm.match(re);
    if (m?.[1] && m[1] !== dataProva && dataValidaPDF(m[1])) return m[1];
  }
  return "-";
}

function extrairCargos(texto: string): string[] {
  const cargos = new Set<string>();
  const linhas = texto.split(/\n/).map(l => l.trim()).filter(Boolean);
  for (const linha of linhas) {
    if (!KW_CONTABIL.some(kw => linha.toLowerCase().includes(kw))) continue;
    const padroes = [
      /^([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\d\n]{3,60}?)\s+\d+\s+(?:vaga|CR)/i,
      /^cargo\s*[:\-]\s*(.{3,60})/i,
      /^(?:\d+|[IVX]+)[\.\-\s]+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\d\n]{3,60})/i,
    ];
    let found = false;
    for (const re of padroes) {
      const m = linha.match(re);
      if (m?.[1]) {
        const c = m[1].trim().replace(/\s+/g, " ").replace(/[^\w\sÀ-ÿ\-\/]/g, "").trim();
        if (c.length >= 4 && c.length <= 60) {
          cargos.add(c.replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()));
          found = true;
        }
        break;
      }
    }
    if (!found && linha.length >= 4 && linha.length <= 60) {
      const c = linha.replace(/\s+/g, " ").replace(/[^\w\sÀ-ÿ\-\/]/g, "").trim();
      if (c.length >= 4) cargos.add(c.replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()));
    }
  }
  return Array.from(cargos).slice(0, 8);
}

function extrairRequisito(texto: string): string {
  const low = texto.toLowerCase();
  if (low.includes("registro no crc") || low.includes("crc ativo")) {
    return low.includes("técnico") || low.includes("tecnico") ? "Técnico + CRC" : "Graduação + CRC";
  }
  if (low.includes("ciências contábeis") || low.includes("ciencias contabeis")) return "Graduação - Ciências Contábeis";
  if (low.includes("nível superior") || low.includes("nivel superior")) return "Nível Superior";
  if (low.includes("nível médio") || low.includes("nivel medio")) return "Nível Médio";
  return "-";
}
