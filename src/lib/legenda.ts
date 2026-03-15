// src/lib/legenda.ts
import { Concurso } from "./scraper";

const EMOJI_BANCA: Record<string, string> = {
  CESPE:"⚡", CEBRASPE:"⚡", FGV:"🏛️", FCC:"📘", VUNESP:"📗",
  IBFC:"📙", IDECAN:"📕", AOCP:"📔", FUNDATEC:"📒", FEPESE:"📓",
  IADES:"📃", QUADRIX:"🗂️", IMESO:"📋", CONSULPLAN:"📑",
};

const EMOJI_STATUS: Record<string, string> = {
  "Inscrições Abertas": "🟢",
  "Em Andamento":       "🔵",
  Previsto:             "🟡",
  Encerrado:            "🔴",
};

const ESTADO_HASHTAG: Record<string, string> = {
  SP:"#concursosp", MG:"#concursomg", RJ:"#concursorj", RS:"#concursors",
  PR:"#concursopr", SC:"#concursosc", BA:"#concursoba", GO:"#concursogo",
  DF:"#concursodf", PE:"#concursope", CE:"#concursoce", AM:"#concursoam",
  MT:"#concursomato", MS:"#concursoms", PA:"#concursopa", ES:"#concursoes",
  Nacional:"#concursonacional",
};

function categoriaPost(c: Concurso): "federal" | "estadual" | "municipal" {
  const org = c.orgao.toUpperCase();
  if (org.includes("FEDERAL") || org.includes("TCU") || org.includes("CGU") ||
      org.includes("STF") || org.includes("STJ") || org.includes("RECEITA FEDERAL") ||
      c.estado === "Nacional") return "federal";
  if (org.includes("SEFAZ") || org.includes("ESTADO") || org.includes("GOVERNO DO") ||
      org.includes("TRIBUNAL DE JUSTIÇA") || org.includes("TJ") || org.includes("TRF") ||
      org.includes("TCE")) return "estadual";
  return "municipal";
}

function chamadaParaAcao(c: Concurso): string {
  const cat = categoriaPost(c);
  const cargo = c.cargo.toLowerCase();

  if (cargo.includes("auditor") || cargo.includes("fiscal")) {
    return "🔥 Auditor Fiscal é um dos cargos mais cobiçados da Contabilidade. Não perca esse edital!";
  }
  if (cat === "federal") {
    return "🇧🇷 Concurso Federal com excelente remuneração e estabilidade. Vale muito a preparação!";
  }
  if (c.diasRestantes >= 0 && c.diasRestantes <= 7) {
    return `⚡ ATENÇÃO! Apenas ${c.diasRestantes} dia(s) para encerrar as inscrições. Corra!`;
  }
  if (cat === "estadual") {
    return "📌 Oportunidade estadual com boa remuneração. Confira os requisitos no edital!";
  }
  return "✅ Boa oportunidade para quem tem formação em Ciências Contábeis. Compartilhe com quem precisa!";
}

function gerarHashtags(c: Concurso): string {
  const tags = new Set<string>([
    "#concursospublicos", "#contabilidade", "#contador", "#contadora",
    "#cienciascontabeis", "#concursocontabilidade",
  ]);

  const cargo = c.cargo.toLowerCase();
  if (cargo.includes("técnico") || cargo.includes("tecnico")) tags.add("#tecnicoemcontabilidade");
  if (cargo.includes("auditor")) tags.add("#auditorfiscal");
  if (cargo.includes("fiscal")) tags.add("#fiscaldetributos");
  if (cargo.includes("analista")) tags.add("#analistacontabil");
  if (cargo.includes("contador")) tags.add("#contador");

  if (c.banca !== "—") tags.add(`#${c.banca.toLowerCase().replace(/[^a-z0-9]/g,"")}`);
  if (ESTADO_HASHTAG[c.estado]) tags.add(ESTADO_HASHTAG[c.estado]);

  const cat = categoriaPost(c);
  if (cat === "federal") tags.add("#concursofederal");
  if (cat === "estadual") tags.add("#concursoestadual");
  if (cat === "municipal") tags.add("#concursomunicipal");

  const ano = new Date().getFullYear();
  tags.add("#aprovado"); tags.add("#servidorpublico");
  tags.add("#estudandoparaconcurso"); tags.add(`#concurso${ano}`);
  tags.add(`#vagas${ano}`); tags.add("#oportunidade");

  return Array.from(tags).join(" ");
}

export function gerarLegenda(c: Concurso): string {
  const bancaEmoji = Object.entries(EMOJI_BANCA).find(([k]) => c.banca.toUpperCase().includes(k))?.[1] ?? "📋";
  const statusEmoji = EMOJI_STATUS[c.status] ?? "📋";
  const temProva = c.dataProva && c.dataProva !== "—";
  const temResultado = c.dataResultado && c.dataResultado !== "—";
  const urgente = c.diasRestantes >= 0 && c.diasRestantes <= 7;

  const cabecalho = urgente
    ? `⚡ URGENTE — ${c.diasRestantes}d RESTANTES | ${c.cargo.toUpperCase()}`
    : `${statusEmoji} CONCURSO | ${c.cargo.toUpperCase()}`;

  const cronograma = temProva || temResultado ? `
━━━━━━━━━━━━━━━━━━━━━
📆 CRONOGRAMA${temProva ? `\n📝 Prova: ${c.dataProva}` : ""}${temResultado ? `\n🏆 Resultado: ${c.dataResultado}` : ""}` : "";

  return `${cabecalho}

🏛️ Órgão: ${c.orgao}
📍 Estado: ${c.estado}
💼 Nível: ${c.nivel}
🎯 Vagas: ${c.vagas}
💰 Salário: ${c.salario}
${bancaEmoji} Banca: ${c.banca}
📅 Inscrições: ${c.inscricao !== "—" ? c.inscricao : `até ${c.inscricaoAte}`}${cronograma}

${chamadaParaAcao(c)}

🔗 Edital no link da bio ou:
${c.linkEdital || c.linkNoticia}

━━━━━━━━━━━━━━━━━━━━━
💾 SALVE para não perder o prazo!
👥 MARQUE um colega da Contabilidade!
🔔 ATIVE as notificações!

${gerarHashtags(c)}`;
}
