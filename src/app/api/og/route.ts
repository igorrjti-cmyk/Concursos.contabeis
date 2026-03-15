// src/app/api/og/route.ts
// Gera o card PNG via Satori (SVG) + Sharp (SVG→PNG).
// Sharp é muito mais compatível com ambientes Linux/Railway do que @resvg/resvg-js.

import { NextResponse } from "next/server";
import { getSupabase }  from "@/lib/supabase";
import type { Concurso } from "@/lib/scraper";

export const runtime = "nodejs"; // garante Node.js runtime (não Edge)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id      = searchParams.get("id")     ?? "";
  const formato = (searchParams.get("formato") ?? "feed") as "feed" | "stories";

  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  // Busca o concurso no cache do Supabase
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
    return NextResponse.json({ error: "Concurso não encontrado: " + id }, { status: 404 });
  }

  try {
    // Importações dinâmicas — carregadas só no runtime, não no build
    const satori = (await import("satori")).default;
    const sharp  = (await import("sharp")).default;

    const W = 1080;
    const H = formato === "stories" ? 1920 : 1080;

    const statusColor = concurso.status === "Inscricoes Abertas" ? "#00C896" : "#FFB800";
    const statusLabel = concurso.status === "Inscricoes Abertas" ? "Inscrições Abertas" : concurso.status;
    const urgente     = concurso.diasRestantes >= 0 && concurso.diasRestantes <= 7;
    const temProva    = concurso.dataProva && concurso.dataProva !== "-";

    // Carrega fonte Sora via Google Fonts
    const fontRes  = await fetch(
      "https://fonts.gstatic.com/s/sora/v12/xMQOuFFYT72X5wkB_18qmnndmSdSnk-DKQJRBg.woff"
    );
    const fontData = await fontRes.arrayBuffer();

    // ── Monta o layout como objeto React (compatível com Satori) ──────────
    const layout = {
      type: "div",
      props: {
        style: {
          width: W, height: H,
          background: "linear-gradient(155deg,#060E20 0%,#0B1A38 55%,#060E20 100%)",
          display: "flex",
          flexDirection: "column",
          padding: 60,
          fontFamily: "Sora",
          position: "relative",
          overflow: "hidden",
        },
        children: [
          // Faixa lateral esquerda
          {
            type: "div",
            props: {
              style: {
                position: "absolute", left: 0, top: 0, bottom: 0, width: 8,
                background: `linear-gradient(to bottom, ${statusColor}, transparent)`,
              },
            },
          },

          // Glow top-right
          {
            type: "div",
            props: {
              style: {
                position: "absolute", top: -80, right: -80,
                width: 300, height: 300,
                background: `radial-gradient(circle, ${statusColor}30 0%, transparent 70%)`,
              },
            },
          },

          // ── Header: marca + badge de status ──
          {
            type: "div",
            props: {
              style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 44 },
              children: [
                {
                  type: "span",
                  props: {
                    style: { color: "#00C896", fontSize: 22, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase" },
                    children: "Concursos Contábeis",
                  },
                },
                {
                  type: "span",
                  props: {
                    style: {
                      background: statusColor, color: "#002D1F",
                      fontSize: 18, fontWeight: 800,
                      padding: "8px 22px", borderRadius: 40,
                    },
                    children: statusLabel,
                  },
                },
              ],
            },
          },

          // ── Badge de urgência ──
          ...(urgente ? [{
            type: "div",
            props: {
              style: {
                background: "linear-gradient(135deg,#FF4B4B,#CC0000)",
                borderRadius: 16, padding: "18px 28px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 32,
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: { color: "#fff", fontSize: 26, fontWeight: 800 },
                    children: `🚨 URGENTE — ENCERRA EM ${concurso.diasRestantes} DIA(S)`,
                  },
                },
              ],
            },
          }] : []),

          // ── Cargo ──
          {
            type: "div",
            props: {
              style: {
                color: "#fff",
                fontSize: formato === "stories" ? 72 : concurso.cargo.length > 25 ? 52 : 62,
                fontWeight: 900, lineHeight: 1.15, marginBottom: 16,
              },
              children: concurso.cargo,
            },
          },

          // ── Órgão ──
          {
            type: "div",
            props: {
              style: { color: "#00C896", fontSize: 32, fontWeight: 700, marginBottom: 10 },
              children: concurso.orgao,
            },
          },

          // ── Metadados: estado · nível · banca ──
          {
            type: "div",
            props: {
              style: {
                display: "flex", gap: 16, marginBottom: 40, flexWrap: "wrap",
              },
              children: [concurso.estado, concurso.nivel, concurso.banca !== "-" ? concurso.banca : null]
                .filter(Boolean)
                .map(txt => ({
                  type: "span",
                  props: {
                    style: {
                      background: "rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: 20, padding: "4px 14px", borderRadius: 8, fontWeight: 600,
                    },
                    children: txt,
                  },
                })),
            },
          },

          // ── Destaque data da prova ──
          ...(temProva ? [{
            type: "div",
            props: {
              style: {
                background: "rgba(167,139,250,0.12)",
                border: "2px solid rgba(167,139,250,0.35)",
                borderRadius: 16, padding: "18px 28px",
                display: "flex", alignItems: "center", gap: 20,
                marginBottom: 32,
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: { color: "#C4B5FD", fontSize: 26, fontWeight: 700 },
                    children: `📝  Data da Prova: ${concurso.dataProva}`,
                  },
                },
              ],
            },
          }] : []),

          // ── Grid de campos ──
          {
            type: "div",
            props: {
              style: { display: "flex", gap: 18, flexWrap: "wrap", flex: 1, alignContent: "flex-start" },
              children: [
                ["💰", "Salário",          concurso.salario],
                ["🎯", "Vagas",            concurso.vagas],
                ["📅", "Inscrições até",   concurso.inscricaoAte],
                ["🏦", "Banca",            concurso.banca !== "-" ? concurso.banca : "A definir"],
              ].map(([icon, label, value]) => ({
                type: "div",
                props: {
                  style: {
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 16, padding: "18px 22px",
                    minWidth: 200, flex: 1,
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { color: "rgba(255,255,255,0.3)", fontSize: 16, marginBottom: 8 },
                        children: `${icon}  ${label}`,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1.3 },
                        children: value,
                      },
                    },
                  ],
                },
              })),
            },
          },

          // ── Rodapé ──
          {
            type: "div",
            props: {
              style: {
                display: "flex", justifyContent: "space-between", alignItems: "center",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 28, marginTop: 28,
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: { color: "#00C896", fontSize: 28, fontWeight: 800 },
                    children: "@concursos.contabeis",
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      background: "linear-gradient(135deg,#00C896,#00A87A)",
                      color: "#002D1F", fontSize: 20, fontWeight: 800,
                      padding: "14px 30px", borderRadius: 40,
                    },
                    children: "VER EDITAL",
                  },
                },
              ],
            },
          },
        ],
      },
    };

    // ── Gera SVG via Satori ──────────────────────────────────────────────
    const svg = await satori(layout as Parameters<typeof satori>[0], {
      width: W,
      height: H,
      fonts: [
        { name: "Sora", data: fontData, weight: 700, style: "normal" },
        { name: "Sora", data: fontData, weight: 800, style: "normal" },
        { name: "Sora", data: fontData, weight: 900, style: "normal" },
      ],
    });

    // ── SVG → PNG via Sharp (sem dependências nativas problemáticas) ──────
    const png = await sharp(Buffer.from(svg))
      .png({ quality: 95 })
      .toBuffer();

    return new NextResponse(png, {
      headers: {
        "Content-Type":  "image/png",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(png.length),
      },
    });

  } catch (err) {
    console.error("Erro ao gerar card PNG:", err);
    return NextResponse.json(
      { error: "Erro ao gerar imagem", detalhe: String(err) },
      { status: 500 }
    );
  }
}
