// src/lib/card-draw.ts
// Lógica de desenho do card — compartilhada entre o renderer do navegador
// (card-renderer.ts, usa <canvas> do DOM) e o renderer do servidor
// (card-renderer-server.ts, usa @napi-rs/canvas). Qualquer ajuste visual
// no card deve ser feito AQUI para valer nos dois lugares.

import type { Concurso } from "./scraper";
import { nomeCargoParaCard } from "./especialidades-contabeis";
import { atualizarPrazo, fonteData } from "./concurso-dados";

const STATUS_BG: Record<string, string> = {
  "Inscricoes Abertas": "#00C896",
  "Aguardando Prova":   "#A78BFA",
  "Inscricoes em breve": "#FFB800",
  "Previsto":           "#FFB800",
  "Encerrado":          "#FF4B4B",
};
const STATUS_COLOR: Record<string, string> = {
  "Inscricoes em breve": "#2D1F00",
  "Inscricoes Abertas": "#002D1F",
  "Aguardando Prova":   "#1A0050",
  "Previsto":           "#2D1F00",
  "Encerrado":          "#fff",
};
const STATUS_GLOW: Record<string, string> = {
  "Inscricoes em breve": "rgba(255,184,0,0.35)",
  "Inscricoes Abertas": "rgba(0,200,150,0.4)",
  "Aguardando Prova":   "rgba(167,139,250,0.35)",
  "Previsto":           "rgba(255,184,0,0.35)",
  "Encerrado":          "rgba(255,75,75,0.35)",
};
const STATUS_LABEL: Record<string, string> = {
  "Inscricoes em breve": "INSCRIÇÕES EM BREVE",
  "Inscricoes Abertas": "INSCRIÇÕES ABERTAS",
  "Aguardando Prova":   "AGUARDANDO PROVA",
  "Previsto":           "PREVISTO",
  "Encerrado":          "ENCERRADO",
};

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function textoEmLinhas(ctx: DesenhavelCtx, texto: string, x: number, y: number, largura: number, fonte: string, tamanho = 64): number {
  let linhas: string[] = [];
  do {
    ctx.font = `800 ${tamanho}px ${fonte}`;
    linhas = [''];
    for (const palavra of texto.split(/\s+/)) {
      const i=linhas.length-1;
      const tentativa=(linhas[i]+' '+palavra).trim();
      if(linhas[i] && ctx.measureText(tentativa).width>largura) linhas.push(palavra);
      else linhas[i]=tentativa;
    }
    if(linhas.length<=3 || tamanho<=34) break;
    tamanho-=2;
  } while(tamanho>=34);
  for(let i=0;i<linhas.length;i++) ctx.fillText(linhas[i],x,y+tamanho*.85+i*tamanho*1.1);
  return linhas.length*tamanho*1.1;
}

// Tipagem mínima e comum entre CanvasRenderingContext2D (DOM) e
// SKRSContext2D (@napi-rs/canvas) — só o que este arquivo usa.
export interface DesenhavelCtx {
  canvas: { width: number; height: number };
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textAlign: string;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): {
    addColorStop(offset: number, color: string): void;
  };
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): {
    addColorStop(offset: number, color: string): void;
  };
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

function roundRect(
  ctx: DesenhavelCtx,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Desenha o card completo no contexto 2D fornecido.
 * `fontFamily` permite trocar a fonte usada (ex: navegador usa "Sora",
 * servidor pode usar uma fonte registrada manualmente ou o fallback padrão).
 */
export function desenharCard(
  ctx: DesenhavelCtx,
  c: Concurso,
  formato: "feed" | "stories" = "feed",
  fontFamily = "Sora, -apple-system, sans-serif"
): void {
  c = atualizarPrazo(c);
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  const stBg    = STATUS_BG[c.status]    ?? "#FFB800";
  const stColor = STATUS_COLOR[c.status] ?? "#000";
  const stGlow  = STATUS_GLOW[c.status]  ?? "rgba(255,184,0,0.35)";
  const stLabel = STATUS_LABEL[c.status] ?? c.status;

  const urgente = c.status === "Inscricoes Abertas" && c.diasRestantes >= 0 && c.diasRestantes <= 7;
  const temProva = c.dataProva && c.dataProva !== "-";
  const isStories = formato === "stories";

  // ── Fundo gradiente ──────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W * 0.7, H);
  bgGrad.addColorStop(0,   "#050D1E");
  bgGrad.addColorStop(0.45,"#091630");
  bgGrad.addColorStop(1,   "#050D1E");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── Grade sutil ──────────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  const GRID = 72;
  for (let x = 0; x < W; x += GRID) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += GRID) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // ── Glow superior direito ────────────────────────────────────────────────
  const glowR = ctx.createRadialGradient(W - 60, 60, 0, W - 60, 60, 480);
  glowR.addColorStop(0, stGlow);
  glowR.addColorStop(1, "transparent");
  ctx.fillStyle = glowR;
  ctx.fillRect(0, 0, W, H);

  // ── Faixa lateral esquerda ───────────────────────────────────────────────
  const faixaGrad = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  faixaGrad.addColorStop(0, stBg);
  faixaGrad.addColorStop(1, "transparent");
  ctx.fillStyle = faixaGrad;
  ctx.fillRect(0, 0, 10, H);

  const PAD   = isStories ? 72 : 80;
  const PAD_T = isStories
    ? (urgente ? 60  : 180)
    : (urgente ? 80  : 200);
  let Y = PAD_T;
  const FONT = fontFamily;

  // ── Marca "CONCURSOS CONTÁBEIS" ──────────────────────────────────────────
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = "#00C896";
  ctx.fillText("CONCURSOS CONTÁBEIS", PAD, Y);
  Y += 60;

  // ── Badge de status ──────────────────────────────────────────────────────
  const badgeW = 340; const badgeH = 52; const badgeX = W - PAD - badgeW;
  const badgeY = PAD_T - 46;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 26);
  ctx.fillStyle = stBg;
  ctx.fill();
  ctx.font = `800 22px ${FONT}`;
  ctx.fillStyle = stColor;
  ctx.textAlign = "center";
  ctx.fillText(stLabel, badgeX + badgeW / 2, badgeY + 35);
  ctx.textAlign = "left";

  // ── Banner urgente ───────────────────────────────────────────────────────
  if (urgente) {
    const urgGrad = ctx.createLinearGradient(PAD, Y, PAD + W - PAD * 2, Y);
    urgGrad.addColorStop(0, "#FF4B4B");
    urgGrad.addColorStop(1, "#FF2222");
    roundRect(ctx, PAD, Y, W - PAD * 2, 100, 16);
    ctx.fillStyle = urgGrad;
    ctx.fill();
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = "#fff";
    ctx.fillText("ATENÇÃO AO PRAZO DE INSCRIÇÃO", PAD + 24, Y + 42);
    ctx.font = `900 48px ${FONT}`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "right";
    ctx.fillText(`${c.diasRestantes} DIAS`, W - PAD - 20, Y + 82);
    ctx.textAlign = "left";
    Y += 120;
  }

  // ── Cargo ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#fff";
  Y += textoEmLinhas(ctx, nomeCargoParaCard(c.cargo), PAD, Y, W-PAD*2, FONT, 64);

  // ── Órgão ────────────────────────────────────────────────────────────────
  ctx.font = `700 38px ${FONT}`;
  ctx.fillStyle = "#00C896";
  Y += textoEmLinhas(ctx, c.orgao, PAD, Y+8, W-PAD*2, FONT, 34)+20;

  // ── Tags estado + nível ──────────────────────────────────────────────────
  const tags = [`${c.cidade ? c.cidade + "/" : ""}${c.estado}`, `${c.nivel}`];
  let tagX = PAD;
  for (const tag of tags) {
    ctx.font = `600 24px ${FONT}`;
    const tw = ctx.measureText(tag).width;
    roundRect(ctx, tagX, Y, tw + 28, 44, 8);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(tag, tagX + 14, Y + 31);
    tagX += tw + 48;
  }
  Y += 70;

  // ── Bloco data da prova ──────────────────────────────────────────────────
  if (temProva) {
    const provaH = 130;
    roundRect(ctx, PAD, Y, W - PAD * 2, provaH, 20);
    const provaBg = ctx.createLinearGradient(PAD, Y, W - PAD, Y + provaH);
    provaBg.addColorStop(0, "rgba(167,139,250,0.20)");
    provaBg.addColorStop(1, "rgba(99,60,220,0.14)");
    ctx.fillStyle = provaBg;
    ctx.fill();
    ctx.strokeStyle = "rgba(167,139,250,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = "rgba(196,181,253,0.7)";
    ctx.fillText("DATA PREVISTA DA PROVA", PAD + 30, Y + 44);
    ctx.font = `900 62px ${FONT}`;
    ctx.fillStyle = "#E9D5FF";
    ctx.fillText(c.dataProva, PAD + 30, Y + 110);
    Y += provaH + 32;
  }

  // ── Grid de campos ───────────────────────────────────────────────────────
  const campos = [
    { icon: "", label: "Salário",  value: fonteData(c.salario) },
    { icon: "", label: "Vagas",    value: fonteData(c.vagas) },
    { icon: "", label: c.status === "Inscricoes em breve" ? "Inscrições a partir de" : "Inscrições até",
                  value: fonteData(c.status === "Inscricoes em breve" ? c.inscricaoInicio || "-" : c.inscricaoAte) },
    { icon: "", label: "Banca",    value: fonteData(c.banca) },
  ];

  const cW = (W - PAD * 2 - 16) / 2;
  const cH = 120;
  const cGap = 16;

  for (let i = 0; i < campos.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = PAD + col * (cW + cGap);
    const cy = Y + row * (cH + cGap);
    roundRect(ctx, cx, cy, cW, cH, 14);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillText(campos[i].label.toUpperCase(), cx + 18, cy + 34);
    ctx.font = `700 32px ${FONT}`;
    ctx.fillStyle = "#fff";
    let size=32;
    while(ctx.measureText(campos[i].value).width>cW-36 && size>18) { size-=1; ctx.font=`700 ${size}px ${FONT}`; }
    ctx.fillText(campos[i].value, cx + 18, cy + 82);
  }
  Y += 2 * cH + 2 * cGap + 32;

  // ── Rodapé ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, Y); ctx.lineTo(W - PAD, Y); ctx.stroke();
  Y += 36;

  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillText("SIGA NO INSTAGRAM", PAD, Y);
  Y += 42;
  ctx.font = `800 36px ${FONT}`;
  ctx.fillStyle = "#00C896";
  ctx.fillText("@concursos.contabeis", PAD, Y);

  const btnW = 240; const btnH = 60;
  const btnX = W - PAD - btnW;
  const btnY = Y - 46;
  roundRect(ctx, btnX, btnY, btnW, btnH, 30);
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
  btnGrad.addColorStop(0, "#00C896");
  btnGrad.addColorStop(1, "#00A87A");
  ctx.fillStyle = btnGrad;
  ctx.fill();
  ctx.font = `800 24px ${FONT}`;
  ctx.fillStyle = "#002D1F";
  ctx.textAlign = "center";
  ctx.fillText("VER EDITAL", btnX + btnW / 2, btnY + 40);
  ctx.textAlign = "left";

  // ── Stories: CTA "Link na bio" ────────────────────────────────────────────
  if (isStories) {
    const ctaY = H - 130;
    roundRect(ctx, PAD, ctaY, W - PAD * 2, 90, 18);
    ctx.fillStyle = "rgba(0,200,150,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,200,150,0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    ctx.fillText("ACESSE O LINK", W / 2, ctaY + 34);
    ctx.font = `800 32px ${FONT}`;
    ctx.fillStyle = "#00C896";
    ctx.fillText("Link na bio", W / 2, ctaY + 74);
    ctx.textAlign = "left";
  }
  ctx.font=`500 17px ${FONT}`;
  ctx.fillStyle="rgba(255,255,255,.5)";
  const captura=new Date(c.dataCaptura || Date.now());
  const dataFonte=Number.isFinite(captura.getTime()) ? captura.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '';
  ctx.fillText(`Fonte: PCI Concursos | Consulta: ${dataFonte} | Confira retificações no edital`,PAD,H-18);
}
