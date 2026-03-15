// src/lib/pdf-extractor.ts
// Extrai texto de PDFs de editais — usa pdfjs-dist v4 (Node.js only)
// Importado dinamicamente via scrapeDetalhe — nunca pelo bundle do cliente

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

// ─── Bancas (mais específicas primeiro para evitar falsos positivos) ──────────
const BANCAS_PDF = [
  // Confirmadas em editais reais — nomes únicos, sem ambiguidade
  "AMAUC",
  "ACESSE CONCURSO",
  "IBGP",
  "CONSCAM",
  "INSTITUTO CONSULPLAN",
  "S. R. DIGITALIZAÇÕES",
  "FADENOR",
  "CAP CONCURSOS",
  "NOSSO RUMO",
  "INSTITUTO NOSSO RUMO",
  "FAFIPA",
  "FUNDAÇÃO FAFIPA",
  "IMESO",
  "ABCP",
  // Nacionais
  "CEBRASPE", "CESPE", "FGV", "FCC", "VUNESP", "IBFC", "IDECAN", "AOCP",
  "FUNDATEC", "FEPESE", "IADES", "QUADRIX", "NUCEPE", "CONSULPLAN",
  // Regionais — nomes únicos
  "IBAM", "SELECON", "AVANCASP", "FAFIPE", "FADESP", "FUNRIO",
  "COGNUS", "EXATUS", "LEGALLE", "MOVENS", "FUMARC", "COVEST",
  "COMPERVE", "FUNCAB", "IDIB", "IDCAN", "NOVA CONCURSOS",
  "INTELECTUS", "COTEC", "INSTITUTO MAIS", "RBO", "AMEOSC",
  "SOLUÇÃO CONCURSOS", "MAIS CONCURSOS",
  // Nomes ambíguos por último — só aceitos via padrão contextual abaixo
  "OBJETIVA CONCURSOS",
];

// Termos ambíguos que precisam de contexto para não dar falso positivo
const BANCAS_AMBIGUAS = new Set(["OBJETIVA CONCURSOS", "OBJETIVA", "ACESSO", "NOVA", "MAIS", "RBO"]);
const CTX_BANCA = /\b(?:banca|organiza[cç][aã]o|organizadora|realiza[cç][aã]o|respons[aá]vel|contrat)\b/i;

const KW_CONTABIL = [
  "contador", "contadora", "contábil", "contabilidade", "contab",
  "auditor fiscal", "fiscal de tributos",
  "técnico em contabilidade", "tecnico em contabilidade",
  "analista contábil", "analista de contabilidade",
];

// ─── Download ─────────────────────────────────────────────────────────────────
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
    if (!res.ok) {
      console.warn(`[PDF] HTTP ${res.status} para ${url}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    console.log(`[PDF] Baixado ${Math.round(buf.byteLength / 1024)}KB de ${url}`);
    return new Uint8Array(buf);
  } catch (e) {
    console.warn(`[PDF] Erro ao baixar ${url}:`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Extração de texto via pdfjs-dist v4 ─────────────────────────────────────
async function extrairTextoPDF(data: Uint8Array): Promise<string> {
  try {
    // pdfjs-dist v4 — import correto para Node.js
    const pdfjs = await import("pdfjs-dist");

    // Desabilita worker para Node.js
    pdfjs.GlobalWorkerOptions.workerSrc = "";

    const loadingTask = pdfjs.getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const doc = await loadingTask.promise;
    console.log(`[PDF] ${doc.numPages} páginas`);

    const paginas: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const page    = await doc.getPage(i);
        const content = await page.getTextContent();
        const texto   = content.items
          .map((item: Record<string, unknown>) => (item.str as string) ?? "")
          .join(" ");
        paginas.push(texto);
      } catch {
        continue;
      }
    }

    return paginas.join("\n");
  } catch (e) {
    console.warn("[PDF] Erro no pdfjs:", e);
    return "";
  }
}

// ─── Extração principal ───────────────────────────────────────────────────────
export async function extrairDetalhesDoPDF(pdfUrl: string): Promise<Partial<DetalhesEdital> | null> {
  if (!pdfUrl || !pdfUrl.toLowerCase().endsWith(".pdf")) return null;

  const bytes = await baixarPDF(pdfUrl);
  if (!bytes) return null;

  const textoRaw = await extrairTextoPDF(bytes);
  if (!textoRaw || textoRaw.trim().length < 50) {
    console.warn("[PDF] Texto extraído vazio ou muito curto");
    return null;
  }

  console.log(`[PDF] Texto extraído: ${textoRaw.length} chars`);

  const textoNorm = normalizarDatas(textoRaw);

  const banca          = extrairBanca(textoRaw);
  const dataProva      = extrairDataProva(textoNorm);
  const dataResultado  = extrairDataResultado(textoNorm, dataProva);
  const cargosContabeis = extrairCargos(textoNorm);
  const requisito      = extrairRequisito(textoRaw);

  console.log(`[PDF] banca=${banca} prova=${dataProva} resultado=${dataResultado} cargos=${cargosContabeis.join(",")}`);

  return { banca, dataProva, dataResultado, cargosContabeis, requisito, linkEdital: "" };
}

// ─── Banca ────────────────────────────────────────────────────────────────────
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

  // Padrões de frase como fallback
  const padroes = [
    /realizado\s+(?:pela?|pelo?\s+(?:instituto|fundação|empresa))\s+([\w\s.\-]{3,50}?)(?:\s*[,;.\n])/i,
    /organizado\s+(?:pela?|pelo?\s+(?:instituto|fundação))\s+([\w\s.\-]{3,50}?)(?:\s*[,;.\n])/i,
    /banca\s+organiz\w*\s*[:\-]\s*([\w\s.\-]{3,50}?)(?:\s*[,;.\n])/i,
    /empresa\s+organiz\w*\s*[:\-]\s*([\w\s.\-]{3,50}?)(?:\s*[,;.\n])/i,
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

// ─── Extrai cronograma completo da seção CRONOGRAMA do edital ────────────────
// Editais geralmente têm uma tabela como:
// "CRONOGRAMA DO CONCURSO PÚBLICO"
// "Aplicação das Provas Objetivas ............. 29/03/2026"
// "Divulgação do Resultado Final .............. 15/04/2026"
function extrairCronograma(textoNorm: string): { dataProva: string; dataResultado: string } {
  let dataProva = "-";
  let dataResultado = "-";

  // Localiza seção de cronograma
  const idxCrono = textoNorm.search(/cronograma\s+do\s+concurso/i);
  if (idxCrono === -1) return { dataProva, dataResultado };

  // Pega até 2000 chars após "CRONOGRAMA DO CONCURSO"
  const secao = textoNorm.substring(idxCrono, idxCrono + 2000);

  // Padrões de linhas de cronograma (com ou sem pontinhos)
  const provaReCrono = [
    /aplica[cç][aã]o\s+das?\s+provas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s+objetivas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /realiza[cç][aã]o\s+das?\s+provas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+das?\s+provas?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /prova\s+escrita[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
  ];

  for (const re of provaReCrono) {
    const m = secao.match(re);
    if (m?.[1]) { dataProva = m[1]; break; }
  }

  const resReCrono = [
    /divulga[cç][aã]o\s+(?:do\s+)?resultado\s+(?:final|definitivo)[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado\s+(?:final|definitivo)[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /homologa[cç][aã]o[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
    /gabarito\s+(?:oficial\s+)?(?:definitivo\s+)?[.\s\-]*(\d{2}\/\d{2}\/\d{4})/i,
  ];

  for (const re of resReCrono) {
    const m = secao.match(re);
    if (m?.[1] && m[1] !== dataProva) { dataResultado = m[1]; break; }
  }

  return { dataProva, dataResultado };
}

// ─── Data de prova ────────────────────────────────────────────────────────────
function extrairDataProva(textoNorm: string): string {
  // Tenta cronograma primeiro (mais preciso)
  const crono = extrairCronograma(textoNorm);
  if (crono.dataProva !== "-") return crono.dataProva;

  const padroes = [
    /aplica[cç][aã]o\s+das?\s+provas?\s*(?:objetivas?)?\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+de\s+realiza[cç][aã]o\s+das?\s+provas?\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /provas?\s+(?:objetivas?|escritas?|pr[áa]ticas?)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /previstas?\s+para\s+(?:ser(?:em)?\s+)?aplicadas?\s+em\s+(\d{2}\/\d{2}\/\d{4})/i,
    /aplicadas?\s+na\s+cidade\s+de\s+[^,]{1,40},\s+no\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
    /no\s+dia\s+(\d{2}\/\d{2}\/\d{4})[\s\S]{0,60}prova/i,
    /prova[\s\S]{0,60}no\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i,
    /aplicadas?\s+(?:na\s+data\s+de\s+)?(\d{2}\/\d{2}\/\d{4})/i,
    /data\s+prov[aá]vel\s+(?:da\s+prova\s+)?[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    /provas?[.\s\-]{2,}(\d{2}\/\d{2}\/\d{4})/i,
    /prova[^\n]{0,40}(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}prova/i,
  ];
  for (const re of padroes) {
    const m = textoNorm.match(re);
    if (m?.[1]) return m[1];
  }
  return "-";
}

// ─── Data de resultado ────────────────────────────────────────────────────────
function extrairDataResultado(textoNorm: string, dataProva: string): string {
  // Tenta cronograma primeiro
  const crono = extrairCronograma(textoNorm);
  if (crono.dataResultado !== "-" && crono.dataResultado !== dataProva) return crono.dataResultado;

  const padroes = [
    /divulga[cç][aã]o\s+(?:do\s+)?(?:resultado|gabarito)\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado\s+(?:final|definitivo)\s*[:\-–]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /gabarito\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /homologa[cç][aã]o\s*[:\-–.]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    /resultado[^\n]{0,60}(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}resultado/i,
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

// ─── Requisito ────────────────────────────────────────────────────────────────
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
