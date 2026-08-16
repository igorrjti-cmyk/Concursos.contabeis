// src/lib/card-renderer.ts
// Renderiza o card do Instagram direto no Canvas do navegador.
// Usado pelo botão "Publicar" na aba Lista — evita o erro "Card não encontrado".
// O desenho em si vive em card-draw.ts (compartilhado com o renderer server-side).

import type { Concurso } from "./scraper";
import { desenharCard } from "./card-draw";

// Aguarda a fonte Sora estar carregada
async function garantirFonte(): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    await document.fonts.load("800 20px Sora");
    await document.fonts.load("700 14px Sora");
    await document.fonts.load("600 12px Sora");
  } catch { /* ignora — usa fallback */ }
}

export async function renderCardCanvas(
  c: Concurso,
  formato: "feed" | "stories" = "feed"
): Promise<HTMLCanvasElement> {
  await garantirFonte();

  const W = formato === "feed" ? 1080 : 1080;
  const H = formato === "feed" ? 1350 : 1920;

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  desenharCard(ctx, c, formato, "Sora, -apple-system, sans-serif");

  return canvas;
}
