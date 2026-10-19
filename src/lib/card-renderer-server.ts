// src/lib/card-renderer-server.ts
// Versão server-side do renderer de cards — roda dentro de uma rota/cron
// da Vercel, sem precisar de navegador. Usa @napi-rs/canvas (binário nativo
// pré-compilado, compatível com o runtime Node.js da Vercel).
//
// IMPORTANTE: o ambiente serverless da Vercel NÃO tem nenhuma fonte de
// sistema instalada (diferente do seu PC/Mac). Sem registrar uma fonte
// manualmente, o @napi-rs/canvas desenha as formas do card normalmente,
// mas o texto sai invisível. Por isso a fonte Sora vem empacotada em
// public/fonts/Sora-Variable.ttf e é sempre registrada abaixo.

import path from "node:path";
import { createCanvas, GlobalFonts, clearAllCache } from "@napi-rs/canvas";
import type { Concurso } from "./scraper";
import { desenharCard, type DesenhavelCtx } from "./card-draw";

let fonteRegistrada: ReturnType<typeof GlobalFonts.registerFromPath> = null;
let sequenciaFonte = 0;

function registrarFonteSora() {
  // A distinct alias prevents the native variable-font glyph cache from
  // dropping repeated characters on subsequent canvases in the same process.
  const familia = `SoraRender${++sequenciaFonte}`;
  try {
    if(fonteRegistrada) GlobalFonts.remove(fonteRegistrada);
    clearAllCache();
    const caminho = path.join(process.cwd(), "public", "fonts", "Sora-Variable.ttf");
    fonteRegistrada = GlobalFonts.registerFromPath(caminho, familia);
    if(!fonteRegistrada) throw new Error("Não foi possível carregar a fonte Sora");
    return familia;
  } catch (e) {
    // Interrompe a geração se a fonte não estiver disponível no bundle.
    console.error("[card-renderer-server] Falha ao registrar fonte Sora:", e);
    throw e;
  }
}

/**
 * Gera o PNG do card em memória e devolve como data URL base64
 * (mesmo formato que `canvas.toDataURL("image/png")` no navegador),
 * pronto para salvar direto em `agendamentos_posts.feed_base64` /
 * `stories_base64`.
 */
export function renderCardServer(
  c: Concurso,
  formato: "feed" | "stories" = "feed"
): string {
  const fontFamily = registrarFonteSora();

  const W = 1080;
  const H = formato === "feed" ? 1350 : 1920;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as DesenhavelCtx;

  desenharCard(ctx, c, formato, fontFamily);

  const buffer = canvas.toBuffer("image/png");
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
