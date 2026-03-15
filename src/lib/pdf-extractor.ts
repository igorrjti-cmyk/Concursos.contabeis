// src/lib/pdf-extractor.ts
//
// Baixa e extrai texto de PDFs de editais de concursos.
// Usa pdf-parse (puro Node.js, sem dependências nativas).
//
// O texto do PDF é MUITO mais rico que o HTML da notícia:
//   - Banca está no cabeçalho/rodapé ou na capa
//   - Cronograma completo com todas as datas
//   - Lista detalhada de cargos com vagas e salários
//   - Requisitos de formação por cargo

import type { DetalhesEdital } from "./scraper";

const TIMEOUT_PDF_MS = 12000;

const MESES: Record<string, string> = {
  janeiro:"01", fevereiro:"02", "março":"03", marco:"03",
  abril:"04", maio:"05", junho:"06", julho:"07",
  agosto:"08", setembro:"09", outubro:"10",
  novembro:"11", dezembro:"12",
};

// ─── Converte datas por extenso → DD/MM/AAAA ─────────────────────────────────
function normalizarDatas(texto: string): string {
  return texto.replace(
    /(\d{1,2})\s+de\s+([a-záéíóúâêîôûãõç]+)\s+de\s+(\d{4})/gi,
    (_, d, mes, y) => {
      const m = MESES[mes.toLowerCase()];
      return m ? d.padStart(2, "0") + "/" + m + "/" + y : _;
    }
  );
}

// ─── Download do PDF ──────────────────────────────────────────────────────────
async function baixarPDF(url: string): Promise<Buffer | null> {
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
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Extração principal ───────────────────────────────────────────────────────
export async function extrairDetalhesDoPDF(pdfUrl: string): Promise<Partial<DetalhesEdital> | null> {
  if (!pdfUrl || !pdfUrl.toLowerCase().endsWith(".pdf")) return null;

  // Baixa o PDF
  const buffer = await baixarPDF(pdfUrl);
  if (!buffer) return null;

  // Extrai texto
  let texto = "";
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data     = await pdfParse(buffer, { max: 0 }); // max:0 = todas as páginas
    texto          = data.text;
  } catch {
    return null;
  }

  if (!texto || texto.length < 100) return null;

  // Normaliza datas por extenso
  const textoNorm = normalizarDatas(texto);

  const resultado: Partial<DetalhesEdital> = {
    cargosContabeis: [],
    requisito: "-",
  };

  // ── 1. BANCA ────────────────────────────────────────────────────────────────
  resultado.banca = extrairBancaDoPDF(texto, textoNorm);

  // ── 2. DATAS ────────────────────────────────────────────────────────────────
  const datas = extrairDatasDoPDF(textoNorm);
  resultado.dataProva     = datas.dataProva;
  resultado.dataResultado = datas.dataResultado;

  // ── 3. CARGOS CONTÁBEIS ─────────────────────────────────────────────────────
  resultado.cargosContabeis = extrairCargosContabeisDoPDF(textoNorm);

  // ── 4. REQUISITO ────────────────────────────────────────────────────────────
  resultado.requisito = extrairRequisitoDoPDF(textoNorm);

  return resultado;
}

// ─── Extração de banca ────────────────────────────────────────────────────────
const BANCAS_LISTA = [
  // Confirmadas em editais reais
  "FADENOR", "CAP CONCURSOS", "NOSSO RUMO", "INSTITUTO NOSSO RUMO",
  "FAFIPA", "FUNDAÇÃO FAFIPA", "IMESO", "ABCP",
  // Nacionais
  "CEBRASPE", "CESPE", "FGV", "FCC", "VUNESP", "IBFC", "IDECAN", "AOCP",
  "FUNDATEC", "FEPESE", "IADES", "QUADRIX", "NUCEPE", "CONSULPLAN",
  // Regionais
  "OBJETIVA", "IBAM", "SELECON", "AVANCASP", "FAFIPE", "FADESP",
  "FUNRIO", "COGNUS", "EXATUS", "LEGALLE", "MOVENS", "FUMARC",
  "COVEST", "COMPERVE", "FUNCAB", "IDIB", "IDCAN", "NOVA CONCURSOS",
  "INTELECTUS", "COTEC", "INSTITUTO MAIS", "RBO", "AMEOSC",
  "INSTITUTO ACESSO", "SOLUÇÃO CONCURSOS", "MAIS CONCURSOS",
];

function extrairBancaDoPDF(texto: string, textoNorm: string): string {
  const up = texto.toUpperCase();

  // Estratégia 1: nome exato da banca (mais específico primeiro)
  for (const b of BANCAS_LISTA) {
    if (up.includes(b.toUpperCase())) return b;
  }

  // Estratégia 2: padrões textuais comuns em editais
  const padroes = [
    new RegExp("realizado\\s+(?:pela?|pelo?\\s+(?:instituto|funda[çc][aã]o|empresa))\\s+([A-Za-z\\u00C0-\\u00FF][\\w\\s\\-]{2,45}?)(?:\\s*[,;.\\n])", "i"),
    new RegExp("organizado\\s+(?:pela?|pelo?\\s+(?:instituto|funda[çc][aã]o))\\s+([A-Za-z\\u00C0-\\u00FF][\\w\\s\\-]{2,45}?)(?:\\s*[,;.\\n])", "i"),
    new RegExp("banca\\s+organiz\\w+\\s*[:\\-]\\s*([A-Za-z\\u00C0-\\u00FF][\\w\\s\\-]{2,45}?)(?:\\s*[,;.\\n])", "i"),
    new RegExp("empresa\\s+organiz\\w+\\s*[:\\-]\\s*([A-Za-z\\u00C0-\\u00FF][\\w\\s\\-]{2,45}?)(?:\\s*[,;.\\n])", "i"),
    new RegExp("(?:contrat|conveni)\\w+\\s+(?:com|a)\\s+(?:o\\s+instituto|a\\s+empresa|a\\s+funda[çc][aã]o)\\s+([A-Za-z\\u00C0-\\u00FF][\\w\\s\\-]{2,45}?)(?:\\s*[,;.\\n])", "i"),
  ];

  for (const re of padroes) {
    const m = textoNorm.match(re);
    if (m?.[1]) {
      const candidato = m[1].trim().replace(/\s+/g, " ");
      // Verifica se bate com alguma conhecida
      const match = BANCAS_LISTA.find(b =>
        candidato.toUpperCase().includes(b.toUpperCase()) ||
        b.toUpperCase().includes(candidato.toUpperCase().slice(0, 8))
      );
      if (match) return match;
      if (candidato.length >= 3 && candidato.length <= 50) {
        return candidato.toUpperCase();
      }
    }
  }

  return "-";
}

// ─── Extração de datas ────────────────────────────────────────────────────────
function extrairDatasDoPDF(textoNorm: string): { dataProva: string; dataResultado: string } {
  let dataProva     = "-";
  let dataResultado = "-";

  // Padrões para data de prova (do mais específico para genérico)
  const provaRe = [
    // "Aplicação das Provas Objetivas: 17/05/2026"
    /aplica[çc][aã]o\s+das?\s+provas?\s+(?:objetivas?\s*)?[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    // "Data de Realização das Provas: 17/05/2026"
    /data\s+de\s+realiza[çc][aã]o\s+das?\s+provas?\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    // "Provas Objetivas: 17/05/2026"
    /provas?\s+(?:objetivas?|escritas?|pr[áa]ticas?)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    // "previstas para serem aplicadas em 17/05/2026"
    /previstas?\s+para\s+(?:ser(?:em)?\s+)?aplicadas?\s+em\s+(\d{2}\/\d{2}\/\d{4})/i,
    // "aplicadas em 17/05/2026"
    /aplicadas?\s+(?:na\s+data\s+(?:prevista\s+)?de\s+)?(\d{2}\/\d{2}\/\d{4})/i,
    // Linha de cronograma: "Aplicação das Provas ............. 17/05/2026"
    /aplica[çc][aã]o\s+das?\s+provas?[.\s]*(\d{2}\/\d{2}\/\d{4})/i,
    // Genérico
    /(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}prova/i,
    /prova[^\n]{0,40}(\d{2}\/\d{2}\/\d{4})/i,
  ];

  for (const re of provaRe) {
    const m = textoNorm.match(re);
    if (m?.[1]) { dataProva = m[1]; break; }
  }

  // Padrões para data de resultado
  const resRe = [
    /divulga[çc][aã]o\s+(?:do\s+)?(?:resultado|gabarito)\s+(?:definitivo\s+)?[:\-–\s]*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado\s+(?:final|definitivo)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(?:resultado|gabarito)\s+(?:preliminar|oficial)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /homologa[çc][aã]o\s*[:\-–\s]*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado[^\n]{0,60}(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}resultado/i,
  ];

  for (const re of resRe) {
    const m = textoNorm.match(re);
    if (m?.[1] && m[1] !== dataProva) { dataResultado = m[1]; break; }
  }

  return { dataProva, dataResultado };
}

// ─── Extração de cargos contábeis ─────────────────────────────────────────────
const KW_CONTABIL = [
  "contador", "contadora", "contábil", "contabilidade", "contab",
  "auditor fiscal", "fiscal de tributos", "fiscal tributário",
  "técnico em contabilidade", "tecnico em contabilidade",
  "analista contábil", "analista de contabilidade",
];

function extrairCargosContabeisDoPDF(texto: string): string[] {
  const cargos = new Set<string>();
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);

  for (const linha of linhas) {
    const linhaLow = linha.toLowerCase();

    // Verifica se a linha menciona cargo contábil
    if (!KW_CONTABIL.some(kw => linhaLow.includes(kw))) continue;

    // Padrões de linha de cargo em edital
    const padroes = [
      // "Contador .............. 2 vagas ........ R$ 5.000,00"
      /^([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\d]{3,60}?)\s+\d+\s+(?:vaga|CR)/i,
      // "CARGO: Contador"
      /^cargo[:\s]+(.{3,60})/i,
      // "01. Contador"  ou  "I - Contador"
      /^(?:\d+|[IVX]+)[\.\-\s]+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\d]{3,60})/i,
      // Linha com o cargo em maiúsculo/título
      /^([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]{3,50})$/,
    ];

    for (const re of padroes) {
      const m = linha.match(re);
      if (m?.[1]) {
        const candidato = m[1].trim().replace(/\s+/g, " ").replace(/[^\w\sÀ-ÿ\-\/]/g, "").trim();
        if (candidato.length >= 4 && candidato.length <= 60) {
          // Title case
          const normalizado = candidato
            .toLowerCase()
            .replace(/(?:^|\s)\S/g, c => c.toUpperCase());
          cargos.add(normalizado);
        }
        break;
      }
    }

    // Fallback: se a linha inteira for curta e contábil, usa ela
    if (cargos.size === 0 || !Array.from(cargos).some(c => linhaLow.includes(c.toLowerCase()))) {
      if (linha.length >= 4 && linha.length <= 60 && /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]/.test(linha)) {
        const normalizado = linha.trim()
          .toLowerCase()
          .replace(/(?:^|\s)\S/g, c => c.toUpperCase());
        cargos.add(normalizado);
      }
    }
  }

  return Array.from(cargos).slice(0, 8);
}

// ─── Extração de requisito ────────────────────────────────────────────────────
function extrairRequisitoDoPDF(texto: string): string {
  const low = texto.toLowerCase();

  if (low.includes("registro no crc") || low.includes("crc ativo") || low.includes("crc-")) {
    if (low.includes("técnico em contabilidade") || low.includes("tecnico em contabilidade")) {
      return "Técnico + CRC";
    }
    return "Graduação + CRC";
  }
  if (low.includes("ciências contábeis") || low.includes("ciencias contabeis")) {
    return "Graduação - Ciências Contábeis";
  }
  if (low.includes("nível superior") || low.includes("nivel superior")) {
    return "Nível Superior";
  }
  if (low.includes("nível médio") || low.includes("nivel medio")) {
    return "Nível Médio";
  }
  return "-";
}
