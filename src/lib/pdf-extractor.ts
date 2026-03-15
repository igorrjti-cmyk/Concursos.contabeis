// src/lib/pdf-extractor.ts
// Extrai texto de PDFs de editais usando pdfjs-dist (roda apenas no servidor).
// IMPORTANTE: Este módulo só pode ser importado em Server Components / Route Handlers.
//
// Extrai: banca organizadora, datas (prova/resultado), cargos contábeis, requisitos.

import type { DetalhesEdital } from "./scraper";

const TIMEOUT_PDF_MS = 15000;

// ─── Meses em português ───────────────────────────────────────────────────────
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

// ─── Bancas conhecidas ────────────────────────────────────────────────────────
const BANCAS_PDF = [
  "FADENOR", "CAP CONCURSOS", "NOSSO RUMO", "INSTITUTO NOSSO RUMO",
  "FAFIPA", "FUNDAÇÃO FAFIPA", "IMESO", "ABCP",
  "CEBRASPE", "CESPE", "FGV", "FCC", "VUNESP", "IBFC", "IDECAN", "AOCP",
  "FUNDATEC", "FEPESE", "IADES", "QUADRIX", "NUCEPE", "CONSULPLAN",
  "OBJETIVA", "IBAM", "SELECON", "AVANCASP", "FAFIPE", "FADESP",
  "FUNRIO", "COGNUS", "EXATUS", "LEGALLE", "MOVENS", "FUMARC",
  "COVEST", "COMPERVE", "FUNCAB", "IDIB", "IDCAN", "NOVA CONCURSOS",
  "INTELECTUS", "COTEC", "INSTITUTO MAIS", "RBO", "AMEOSC",
  "SOLUÇÃO CONCURSOS", "MAIS CONCURSOS",
];

const KW_CONTABIL = [
  "contador", "contadora", "contábil", "contabilidade", "contab",
  "auditor fiscal", "fiscal de tributos", "fiscal tributário",
  "técnico em contabilidade", "tecnico em contabilidade",
  "analista contábil", "analista de contabilidade",
];

// ─── Download do PDF ──────────────────────────────────────────────────────────
async function baixarPDF(url: string): Promise<Uint8Array | null> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_PDF_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        "Accept":     "application/pdf,*/*",
        "Referer":    "https://www.pciconcursos.com.br/",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Extrai texto do PDF via pdfjs-dist ───────────────────────────────────────
async function extrairTextoPDF(data: Uint8Array): Promise<string> {
  // pdfjs-dist/legacy funciona em Node.js sem canvas
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);

  // Desabilita worker (não necessário no servidor)
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const doc   = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    const texto   = content.items
      .map((item: { str?: string }) => item.str ?? "")
      .join(" ");
    pages.push(texto);

  }

  return pages.join("\n");
}

// ─── Extração principal ───────────────────────────────────────────────────────
export async function extrairDetalhesDoPDF(pdfUrl: string): Promise<Partial<DetalhesEdital> | null> {
  if (!pdfUrl || !pdfUrl.toLowerCase().endsWith(".pdf")) return null;

  const bytes = await baixarPDF(pdfUrl);
  if (!bytes) return null;

  let textoRaw = "";
  try {
    textoRaw = await extrairTextoPDF(bytes);
  } catch {
    return null;
  }

  if (!textoRaw || textoRaw.length < 100) return null;

  const texto     = textoRaw;
  const textoNorm = normalizarDatas(textoRaw);

  return {
    banca:           extrairBanca(texto),
    dataProva:       extrairDataProva(textoNorm),
    dataResultado:   extrairDataResultado(textoNorm),
    cargosContabeis: extrairCargos(textoNorm),
    requisito:       extrairRequisito(texto),
    linkEdital:      "",
  };
}

// ─── Banca ────────────────────────────────────────────────────────────────────
function extrairBanca(texto: string): string {
  const up = texto.toUpperCase();
  for (const b of BANCAS_PDF) {
    if (up.includes(b.toUpperCase())) return b;
  }

  // Padrões de frase
  const padroes = [
    /realizado\s+(?:pela?|pelo?\s+(?:instituto|fundação|empresa))\s+([\w\s\-]{3,50}?)(?:\s*[,;.\n])/i,
    /organizado\s+(?:pela?|pelo?\s+(?:instituto|fundação))\s+([\w\s\-]{3,50}?)(?:\s*[,;.\n])/i,
    /banca\s+organiz\w+\s*[:\-]\s*([\w\s\-]{3,50}?)(?:\s*[,;.\n])/i,
    /contrat\w+\s+(?:com|a)\s+(?:o\s+)?(?:instituto|empresa|fundação)\s+([\w\s\-]{3,50}?)(?:\s*[,;.\n])/i,
  ];

  for (const re of padroes) {
    const m = texto.match(re);
    if (m?.[1]) {
      const candidato = m[1].trim().replace(/\s+/g, " ");
      const match = BANCAS_PDF.find(b =>
        candidato.toUpperCase().includes(b) ||
        b.includes(candidato.toUpperCase().slice(0, 8))
      );
      if (match) return match;
      if (candidato.length >= 3 && candidato.length <= 50) {
        return candidato.toUpperCase();
      }
    }
  }
  return "-";
}

// ─── Data de prova ────────────────────────────────────────────────────────────
function extrairDataProva(textoNorm: string): string {
  const padroes = [
    /aplica[çc][aã]o\s+das?\s+provas?\s*(?:objetivas?)?\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+de\s+realiza[çc][aã]o\s+das?\s+provas?\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s+(?:objetivas?|escritas?|pr[áa]ticas?)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /previstas?\s+para\s+(?:ser(?:em)?\s+)?aplicadas?\s+em\s+(\d{2}\/\d{2}\/\d{4})/i,
    /aplicadas?\s+(?:na\s+data\s+de\s+)?(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+prov[aá]vel\s+(?:da\s+prova\s+)?[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}prova/i,
    /prova[^\n]{0,40}(\d{2}\/\d{2}\/\d{4})/i,
  ];
  for (const re of padroes) {
    const m = textoNorm.match(re);
    if (m?.[1]) return m[1];
  }
  return "-";
}

// ─── Data de resultado ────────────────────────────────────────────────────────
function extrairDataResultado(textoNorm: string): string {
  const dataProva = extrairDataProva(textoNorm);
  const padroes = [
    /divulga[çc][aã]o\s+(?:do\s+)?(?:resultado|gabarito)\s+(?:definitivo\s+)?[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado\s+(?:final|definitivo)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(?:resultado|gabarito)\s+(?:preliminar|oficial)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /homologa[çc][aã]o\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado\s+final\s+[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}resultado/i,
    /resultado[^\n]{0,40}(\d{2}\/\d{2}\/\d{4})/i,
  ];
  for (const re of padroes) {
    const m = textoNorm.match(re);
    if (m?.[1] && m[1] !== dataProva) return m[1];
  }
  return "-";
}

// ─── Cargos contábeis ─────────────────────────────────────────────────────────
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

    let encontrou = false;
    for (const re of padroes) {
      const m = linha.match(re);
      if (m?.[1]) {
        const c = m[1].trim().replace(/\s+/g, " ").replace(/[^\w\sÀ-ÿ\-\/]/g, "").trim();
        if (c.length >= 4 && c.length <= 60) {
          cargos.add(c.replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()));
          encontrou = true;
        }
        break;
      }
    }

    if (!encontrou && linha.length >= 4 && linha.length <= 60) {
      const c = linha.replace(/\s+/g, " ").replace(/[^\w\sÀ-ÿ\-\/]/g, "").trim();
      if (c.length >= 4) cargos.add(c.replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()));
    }
  }

  return Array.from(cargos).slice(0, 8);
}

// ─── Requisito ────────────────────────────────────────────────────────────────
function extrairRequisito(texto: string): string {
  const low = texto.toLowerCase();
  if (low.includes("registro no crc") || low.includes("crc ativo") || low.includes("crc-")) {
    return low.includes("técnico") || low.includes("tecnico") ? "Técnico + CRC" : "Graduação + CRC";
  }
  if (low.includes("ciências contábeis") || low.includes("ciencias contabeis")) return "Graduação - Ciências Contábeis";
  if (low.includes("nível superior") || low.includes("nivel superior")) return "Nível Superior";
  if (low.includes("nível médio") || low.includes("nivel medio")) return "Nível Médio";
  return "-";
}
