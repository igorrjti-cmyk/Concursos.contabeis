// src/app/api/og/route.ts
// Gera o card PNG de um concurso via Satori (renderização server-side)
// Usado pelo worker para obter a imagem antes de publicar no Instagram

import { NextResponse } from "next/server";
import { getSupabase }  from "@/lib/supabase";
import type { Concurso } from "@/lib/scraper";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id      = searchParams.get("id")     ?? "";
  const formato = (searchParams.get("formato") ?? "feed") as "feed" | "stories";

  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  // Busca o concurso no cache
  const sb = getSupabase();
  let concurso: Concurso | null = null;

  if (sb) {
    const { data } = await sb
      .from("cache_concursos")
      .select("dados")
      .eq("chave", "concursos:v2")
      .single<{ dados: { concursos: Concurso[] } }>();

    if (data?.dados?.concursos) {
      concurso = data.dados.concursos.find(c => c.id === id) ?? null;
    }
  }

  if (!concurso) {
    return NextResponse.json({ error: "Concurso não encontrado" }, { status: 404 });
  }

  try {
    const satori   = (await import("satori")).default;
    const { Resvg } = await import("@resvg/resvg-js");
    const { React } = await import("react");

    const W = formato === "stories" ? 1080 : 1080;
    const H = formato === "stories" ? 1920 : 1080;

    const statusColor = concurso.status === "Inscricoes Abertas" ? "#00C896" : "#FFB800";
    const statusLabel = concurso.status === "Inscricoes Abertas" ? "Inscrições Abertas" : concurso.status;
    const urgente     = concurso.diasRestantes >= 0 && concurso.diasRestantes <= 7;
    const temProva    = concurso.dataProva && concurso.dataProva !== "-";

    // Fetch da fonte Sora
    const fontRes  = await fetch(
      "https://fonts.gstatic.com/s/sora/v12/xMQOuFFYT72X5wkB_18qmnndmSdSnk-DKQJRBg.woff"
    );
    const fontData = await fontRes.arrayBuffer();

    const svg = await satori(
      // JSX como objeto React (compatível com Satori)
      {
        type: "div",
        props: {
          style: {
            width: W, height: H,
            background: "linear-gradient(155deg,#060E20 0%,#0B1A38 50%,#060E20 100%)",
            display: "flex",
            flexDirection: "column",
            padding: 60,
            fontFamily: "Sora",
            position: "relative",
          },
          children: [
            // Faixa lateral
            { type: "div", props: { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: `linear-gradient(to bottom, ${statusColor}, transparent)` } } },

            // Header
            { type: "div", props: {
              style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 },
              children: [
                { type: "span", props: { style: { color: "#00C896", fontSize: 24, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase" }, children: "Concursos Contábeis" } },
                { type: "span", props: { style: { background: statusColor, color: "#002D1F", fontSize: 20, fontWeight: 800, padding: "8px 20px", borderRadius: 40 }, children: statusLabel } },
              ]
            }},

            // Urgente
            ...(urgente ? [{ type: "div", props: {
              style: { background: "#FF4B4B", borderRadius: 16, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 },
              children: [
                { type: "span", props: { style: { color: "#fff", fontSize: 28, fontWeight: 800 }, children: `🚨 URGENTE — ENCERRA EM ${concurso.diasRestantes} DIA(S)` } },
              ]
            }}] : []),

            // Cargo
            { type: "div", props: {
              style: { color: "#fff", fontSize: formato === "stories" ? 64 : 56, fontWeight: 900, lineHeight: 1.2, marginBottom: 16 },
              children: concurso.cargo
            }},
            { type: "div", props: { style: { color: "#00C896", fontSize: 36, fontWeight: 700, marginBottom: 12 }, children: concurso.orgao } },
            { type: "div", props: { style: { color: "rgba(255,255,255,0.4)", fontSize: 24, marginBottom: 48 }, children: `${concurso.estado} · ${concurso.nivel}${concurso.banca !== "-" ? ` · ${concurso.banca}` : ""}` } },

            // Data da prova em destaque
            ...(temProva ? [{ type: "div", props: {
              style: { background: "rgba(167,139,250,0.15)", border: "2px solid rgba(167,139,250,0.4)", borderRadius: 16, padding: "20px 28px", display: "flex", alignItems: "center", gap: 20, marginBottom: 32 },
              children: [
                { type: "span", props: { style: { color: "#C4B5FD", fontSize: 28, fontWeight: 700 }, children: `📝 Data da Prova: ${concurso.dataProva}` } },
              ]
            }}] : []),

            // Grid de campos
            { type: "div", props: {
              style: { display: "flex", gap: 20, flexWrap: "wrap", flex: 1 },
              children: [
                ["💰", "Salário",   concurso.salario],
                ["🎯", "Vagas",     concurso.vagas],
                ["📅", "Inscrições até", concurso.inscricaoAte],
                ["🏦", "Banca",     concurso.banca !== "-" ? concurso.banca : "A definir"],
              ].map(([icon, label, value]) => ({
                type: "div",
                props: {
                  style: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "20px 24px", minWidth: 200, flex: 1 },
                  children: [
                    { type: "div", props: { style: { color: "rgba(255,255,255,0.35)", fontSize: 18, marginBottom: 8 }, children: `${icon} ${label}` } },
                    { type: "div", props: { style: { color: "#fff", fontSize: 26, fontWeight: 700 }, children: value as string } },
                  ]
                }
              }))
            }},

            // Rodapé
            { type: "div", props: {
              style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 32, marginTop: 32 },
              children: [
                { type: "div", props: { style: { color: "#00C896", fontSize: 32, fontWeight: 800 }, children: "@concursos.contabeis" } },
                { type: "div", props: { style: { background: "linear-gradient(135deg,#00C896,#00A87A)", color: "#002D1F", fontSize: 24, fontWeight: 800, padding: "16px 32px", borderRadius: 40 }, children: "VER EDITAL" } },
              ]
            }},
          ],
        }
      },
      {
        width: W, height: H,
        fonts: [{ name: "Sora", data: fontData, weight: 700, style: "normal" }],
      }
    );

    const resvg  = new Resvg(svg, { fitTo: { mode: "width", value: W } });
    const png    = resvg.render().asPng();

    return new NextResponse(png, {
      headers: {
        "Content-Type":  "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });

  } catch (err) {
    console.error("Erro ao gerar imagem:", err);
    return NextResponse.json({ error: "Erro ao gerar imagem" }, { status: 500 });
  }
}
