// src/lib/card-renderer-server.ts
// Versão server-side do renderer de cards — roda dentro de uma rota/cron
// da Vercel, sem precisar de navegador. Usa @napi-rs/canvas (binário nativo
// pré-compilado, compatível com o runtime Node.js da Vercel).
//
// Observação sobre a fonte: no navegador o card usa a fonte "Sora". Aqui,
// se você não registrar um arquivo .ttf da Sora, o desenho cai no fallback
// "sans-serif" do sistema — o layout continua igual, só a tipografia muda
// um pouco. Para ficar idêntico ao navegador, baixe a fonte (Google Fonts,
// arquivo .ttf) e ajuste `registrarFonteSora()` abaixo.

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import type { Concurso } from "./scraper";
import { desenharCard, type DesenhavelCtx } from "./card-draw";

let fonteRegistrada = false;

function registrarFonteSora() {
  if (fonteRegistrada) return;
  fonteRegistrada = true;
  // Se você adicionar o arquivo da fonte em /public/fonts/Sora-Bold.ttf (ou
  // similar) e quiser paridade visual total com o navegador, descomente e
  // ajuste o caminho abaixo:
  //
  // try {
  //   GlobalFonts.registerFromPath(
  //     process.cwd() + "/public/fonts/Sora-ExtraBold.ttf",
  //     "Sora"
  //   );
  // } catch {
  //   /* segue com fallback sans-serif */
  // }
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

  const fontFamily = fonteRegistrada ? "Sora, sans-serif" : "sans-serif";
  desenharCard(ctx, c, formato, fontFamily);

  const buffer = canvas.toBuffer("image/png");
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
