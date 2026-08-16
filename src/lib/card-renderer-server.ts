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
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import type { Concurso } from "./scraper";
import { desenharCard, type DesenhavelCtx } from "./card-draw";

let fonteRegistrada = false;

function registrarFonteSora() {
  if (fonteRegistrada) return;
  try {
    const caminho = path.join(process.cwd(), "public", "fonts", "Sora-Variable.ttf");
    GlobalFonts.registerFromPath(caminho, "Sora");
    fonteRegistrada = true;
  } catch (e) {
    // Se falhar (ex: arquivo não encontrado no bundle), o card ainda é
    // gerado, mas o texto pode sair invisível — loga alto para aparecer
    // nos logs da Vercel e no e-mail de erro do cron.
    console.error("[card-renderer-server] Falha ao registrar fonte Sora:", e);
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
  registrarFonteSora();

  const W = 1080;
  const H = formato === "feed" ? 1350 : 1920;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as DesenhavelCtx;

  const fontFamily = "Sora, sans-serif";
  desenharCard(ctx, c, formato, fontFamily);

  const buffer = canvas.toBuffer("image/png");
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
