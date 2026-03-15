// src/lib/legenda.ts
import { Concurso, statusDisplay } from "./scraper";

const EMOJI_BANCA: Record<string, string> = {
  CESPE: "\u26a1", CEBRASPE: "\u26a1", FGV: "\u{1f3db}", FCC: "\u{1f4d8}",
  VUNESP: "\u{1f4d7}", IBFC: "\u{1f4d9}", IDECAN: "\u{1f4d5}", AOCP: "\u{1f4d4}",
  FUNDATEC: "\u{1f4d2}", FEPESE: "\u{1f4d3}", IADES: "\u{1f4c3}", QUADRIX: "\u{1f5c2}",
  IMESO: "\u{1f4cb}", CONSULPLAN: "\u{1f4d1}",
};

const ESTADO_HASHTAG: Record<string, string> = {
  SP: "#concursosp", MG: "#concursomg", RJ: "#concursorj", RS: "#concursors",
  PR: "#concursopr", SC: "#concursosc", BA: "#concursoba", GO: "#concursogo",
  DF: "#concursodf", PE: "#concursope", CE: "#concursoce", AM: "#concursoam",
  MT: "#concursomato", MS: "#concursoms", PA: "#concursopa", ES: "#concursoes",
  Nacional: "#concursonacional",
};

function categoriaPost(c: Concurso): "federal" | "estadual" | "municipal" {
  const org = c.orgao.toUpperCase();
  if (org.includes("FEDERAL") || org.includes("TCU") || org.includes("CGU") ||
      org.includes("STF") || org.includes("STJ") || org.includes("RECEITA FEDERAL") ||
      c.estado === "Nacional") return "federal";
  if (org.includes("SEFAZ") || org.includes("ESTADO") || org.includes("GOVERNO DO") ||
      org.includes("TRIBUNAL DE JUSTICA") || org.includes("TJ") || org.includes("TRF") ||
      org.includes("TCE")) return "estadual";
  return "municipal";
}

function chamadaParaAcao(c: Concurso): string {
  const cat   = categoriaPost(c);
  const cargo = c.cargo.toLowerCase();
  const dias  = c.diasRestantes;

  if (cargo.includes("auditor") || cargo.includes("fiscal")) {
    return "Auditor Fiscal e um dos cargos mais cobicados da Contabilidade. Nao perca esse edital!";
  }
  if (cat === "federal") {
    return "Concurso Federal com excelente remuneracao e estabilidade. Vale muito a preparacao!";
  }
  if (dias >= 0 && dias <= 7) {
    return "ATENCAO! Apenas " + dias + " dia(s) para encerrar as inscricoes. Corra!";
  }
  if (cat === "estadual") {
    return "Oportunidade estadual com boa remuneracao. Confira os requisitos no edital!";
  }
  return "Boa oportunidade para quem tem formacao em Ciencias Contabeis. Compartilhe com quem precisa!";
}

function gerarHashtags(c: Concurso): string {
  const tags = new Set<string>([
    "#concursospublicos", "#contabilidade", "#contador", "#contadora",
    "#cienciascontabeis", "#concursocontabilidade",
  ]);

  const cargo = c.cargo.toLowerCase();
  if (cargo.includes("tecnico") || cargo.includes("t\u00e9cnico")) tags.add("#tecnicoemcontabilidade");
  if (cargo.includes("auditor")) tags.add("#auditorfiscal");
  if (cargo.includes("fiscal")) tags.add("#fiscaldetributos");
  if (cargo.includes("analista")) tags.add("#analistacontabil");
  if (cargo.includes("contador")) tags.add("#contador");

  if (c.banca !== "-") tags.add("#" + c.banca.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (ESTADO_HASHTAG[c.estado]) tags.add(ESTADO_HASHTAG[c.estado]);

  const cat = categoriaPost(c);
  if (cat === "federal") tags.add("#concursofederal");
  if (cat === "estadual") tags.add("#concursoestadual");
  if (cat === "municipal") tags.add("#concursomunicipal");

  const ano = new Date().getFullYear();
  tags.add("#aprovado");
  tags.add("#servidorpublico");
  tags.add("#estudandoparaconcurso");
  tags.add("#concurso" + ano);
  tags.add("#vagas" + ano);
  tags.add("#oportunidade");

  return Array.from(tags).join(" ");
}

export function gerarLegenda(c: Concurso): string {
  const bancaEmoji = Object.entries(EMOJI_BANCA).find(([k]) => c.banca.toUpperCase().includes(k))?.[1] ?? "";
  const statusStr  = statusDisplay(c.status);
  const urgente    = c.diasRestantes >= 0 && c.diasRestantes <= 7;

  const cabecalho = urgente
    ? "URGENTE - " + c.diasRestantes + "d RESTANTES | " + c.cargo.toUpperCase()
    : statusStr.toUpperCase() + " | " + c.cargo.toUpperCase();

  const temProva     = c.dataProva     && c.dataProva     !== "-";
  const temResultado = c.dataResultado && c.dataResultado !== "-";
  const cronograma   = temProva || temResultado
    ? "\n\nCRONOGRAMA" +
      (temProva     ? "\nProva: "     + c.dataProva     : "") +
      (temResultado ? "\nResultado: " + c.dataResultado : "")
    : "";

  return cabecalho + "\n\n" +
    "Orgao: " + c.orgao + "\n" +
    "Estado: " + c.estado + "\n" +
    "Nivel: " + c.nivel + "\n" +
    "Vagas: " + c.vagas + "\n" +
    "Salario: " + c.salario + "\n" +
    (bancaEmoji ? bancaEmoji + " " : "") + "Banca: " + c.banca + "\n" +
    "Inscricoes: " + (c.inscricao !== "-" ? c.inscricao : "ate " + c.inscricaoAte) +
    cronograma + "\n\n" +
    chamadaParaAcao(c) + "\n\n" +
    "Edital no link da bio ou:\n" + (c.linkEdital || c.linkNoticia) + "\n\n" +
    "SALVE para nao perder o prazo!\n" +
    "MARQUE um colega da Contabilidade!\n" +
    "ATIVE as notificacoes!\n\n" +
    gerarHashtags(c);
}
