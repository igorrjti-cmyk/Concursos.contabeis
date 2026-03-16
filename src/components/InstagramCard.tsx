"use client";
// src/components/InstagramCard.tsx — v7
// Feed  : 480×600px preview (= 1080×1350px real @ 2.25x) — proporção 4:5 padrão Instagram
// Stories: 270×480px preview — disponível só para download manual (não publicar via web)
// Zona segura: padding lateral inclui 15px extra para compensar corte da grade do Instagram

import { Concurso, statusDisplay } from "@/lib/scraper";

interface Props {
  concurso: Concurso;
  handle?: string;
  formato?: "feed" | "stories";
}

const STATUS_STYLE: Record<string, { bg: string; color: string; glow: string }> = {
  "Inscricoes Abertas": { bg: "#00C896", color: "#002D1F", glow: "rgba(0,200,150,0.35)" },
  "Previsto":           { bg: "#FFB800", color: "#2D1F00", glow: "rgba(255,184,0,0.3)"  },
  "Encerrado":          { bg: "#FF4B4B", color: "#fff",    glow: "rgba(255,75,75,0.3)"  },
};

export default function InstagramCard({
  concurso: c,
  handle = "@concursos.contabeis",
  formato = "feed",
}: Props) {
  const st        = STATUS_STYLE[c.status] ?? STATUS_STYLE["Previsto"];
  const temProva  = c.dataProva     && c.dataProva     !== "-";
  const temRes    = c.dataResultado && c.dataResultado !== "-";
  const urgente   = c.diasRestantes >= 0 && c.diasRestantes <= 7;
  const isStories = formato === "stories";

  // Feed 4:5: 480×600px no preview → html2canvas scale 2.25 = 1080×1350px real
  // Stories:  270×480px no preview → html2canvas scale 4   = 1080×1920px real
  const W = isStories ? 270 : 480;
  const H = isStories ? 480 : 600;

  // Zona segura feed: Instagram corta 34px de cada lado (1080→1012px visível na grade)
  // Proporcional ao preview: 34/1080 × 480 ≈ 15px por lado
  const SAFE = isStories ? 0 : 15;
  const PAD_V = isStories ? 18 : 24;
  const PAD_H = isStories ? 18 : 28 + SAFE;

  const statusText  = statusDisplay(c.status);
  const MAX_CARGO   = isStories ? 28 : 38;
  const cargoDisplay = c.cargo.length > MAX_CARGO
    ? c.cargo.slice(0, MAX_CARGO - 1).trimEnd() + "…"
    : c.cargo;
  const titleSize = isStories ? 12 : c.cargo.length > 40 ? 13 : c.cargo.length > 28 ? 16 : 21;

  const campos = [
    { icon: "💰", label: "Salário",  value: c.salario },
    { icon: "🎯", label: "Vagas",    value: c.vagas   },
    {
      icon: "📅",
      label: c.status === "Inscricoes Abertas" ? "Inscrições até" : "Edital",
      value: c.inscricaoAte,
    },
    { icon: "🏦", label: "Banca", value: c.banca !== "-" ? c.banca : "A definir" },
  ];

  return (
    <div
      id={"card-" + c.id + "-" + formato}
      style={{
        width: W, height: H,
        background: "linear-gradient(155deg,#060E20 0%,#0B1A38 50%,#060E20 100%)",
        borderRadius: 16,
        fontFamily: "'Sora',sans-serif",
        position: "relative", overflow: "hidden",
        boxSizing: "border-box",
        display: "flex", flexDirection: "column",
        paddingTop: PAD_V, paddingBottom: PAD_V,
        paddingLeft: PAD_H, paddingRight: PAD_H,
        gap: isStories ? 7 : 10,
        flexShrink: 0,
      }}
    >
      {/* Faixa lateral de status */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 7,
        background: `linear-gradient(to bottom, ${st.bg} 60%, transparent)`,
        borderRadius: "16px 0 0 16px",
      }} />

      {/* Indicador de zona segura — linhas tracejadas nas laterais (só feed) */}
      {!isStories && (
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: SAFE, right: SAFE,
          borderLeft: "1px dashed rgba(255,255,255,.08)",
          borderRight: "1px dashed rgba(255,255,255,.08)",
          pointerEvents: "none",
        }} />
      )}

      {/* Grid de fundo */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px)," +
          "linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)",
        backgroundSize: "32px 32px", pointerEvents: "none",
      }} />

      {/* Glow de status */}
      <div style={{
        position: "absolute", top: -60, right: -60, width: 200, height: 200,
        background: `radial-gradient(circle, ${st.glow} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* TOP: marca + badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="6.5" fill="none" stroke="#00C896" strokeWidth="1"/>
            <text x="7" y="11" textAnchor="middle" fill="#00C896"
              style={{ fontSize: "9px", fontWeight: 800, fontFamily: "sans-serif" }}>$</text>
          </svg>
          <span style={{
            background: "linear-gradient(90deg,#00C896,#00E5A8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
          }}>Concursos Contábeis</span>
        </div>
        <span style={{
          background: st.bg, color: st.color, fontSize: 8, fontWeight: 800,
          padding: "4px 10px", borderRadius: 20, letterSpacing: 0.8, textTransform: "uppercase",
          boxShadow: `0 0 12px ${st.glow}`,
        }}>{statusText}</span>
      </div>

      {/* URGÊNCIA */}
      {urgente && (
        <div style={{
          background: "linear-gradient(135deg,#FF4B4B,#FF2222)",
          borderRadius: 12, padding: isStories ? "5px 10px" : "7px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 4px 20px rgba(255,75,75,0.4)", position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>🚨</span>
            <div>
              <div style={{ color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>URGENTE — INSCRIÇÕES ENCERRAM EM</div>
              <div style={{ color: "rgba(255,255,255,.75)", fontSize: 8 }}>Corra para não perder!</div>
            </div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "3px 9px", textAlign: "center" }}>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{c.diasRestantes}</div>
            <div style={{ color: "rgba(255,255,255,.7)", fontSize: 7, fontWeight: 700, letterSpacing: 1 }}>DIAS</div>
          </div>
        </div>
      )}

      {/* CARGO + ÓRGÃO */}
      <div style={{ position: "relative" }}>
        <div style={{ color: "#fff", fontSize: titleSize, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.3px", marginBottom: isStories ? 2 : 4 }}>
          {cargoDisplay}
        </div>
        <div style={{ color: "#00C896", fontSize: isStories ? 10 : 12, fontWeight: 700, marginBottom: isStories ? 2 : 4 }}>
          {c.orgao}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <span style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)", fontSize: 8, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>📍 {c.estado}</span>
          <span style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)", fontSize: 8, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>🎓 {c.nivel}</span>
        </div>
      </div>

      {/* DATA DA PROVA */}
      {temProva && (
        <div style={{
          background: "linear-gradient(135deg,rgba(167,139,250,0.18),rgba(139,92,246,0.12))",
          border: "1px solid rgba(167,139,250,0.35)",
          borderRadius: 10, padding: isStories ? "6px 10px" : "8px 12px",
          display: "flex", alignItems: "center", gap: 10, position: "relative",
        }}>
          <span style={{ fontSize: isStories ? 14 : 16 }}>📝</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "rgba(167,139,250,0.8)", fontSize: 7.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 1 }}>Data da Prova</div>
            <div style={{ color: "#C4B5FD", fontSize: isStories ? 13 : 16, fontWeight: 800, letterSpacing: "-0.3px" }}>{c.dataProva}</div>
          </div>
          {temRes && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "rgba(167,139,250,0.7)", fontSize: 7.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 1 }}>Resultado</div>
              <div style={{ color: "#C4B5FD", fontSize: isStories ? 11 : 13, fontWeight: 700 }}>{c.dataResultado}</div>
            </div>
          )}
        </div>
      )}

      {/* GRID DE CAMPOS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isStories ? 6 : 8, position: "relative" }}>
        {campos.map(item => (
          <div key={item.label} style={{
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 10, padding: isStories ? "5px 8px" : "7px 10px",
          }}>
            <div style={{ color: "rgba(255,255,255,.3)", fontSize: 7.5, letterSpacing: .8, marginBottom: 2, textTransform: "uppercase" }}>
              {item.icon} {item.label}
            </div>
            <div style={{ color: "#fff", fontSize: isStories ? 10 : 12, fontWeight: 700, lineHeight: 1.3 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* STORIES: CTA arrastar */}
      {isStories && (
        <div style={{ background: "rgba(0,200,150,.08)", border: "1px solid rgba(0,200,150,.2)", borderRadius: 10, padding: "7px 12px", textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,.35)", fontSize: 7.5, marginBottom: 2 }}>ARRASTE PARA CIMA</div>
          <div style={{ color: "#00C896", fontSize: 10, fontWeight: 800 }}>Ver edital completo →</div>
        </div>
      )}

      {/* RODAPÉ */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: isStories ? 7 : 9,
        position: "relative", marginTop: "auto",
      }}>
        <div>
          <div style={{ color: "rgba(255,255,255,.2)", fontSize: 7.5, letterSpacing: 1.5, textTransform: "uppercase" }}>Siga no Instagram</div>
          <div style={{ color: "#00C896", fontSize: isStories ? 10 : 13, fontWeight: 800 }}>{handle}</div>
        </div>
        <div style={{
          background: "linear-gradient(135deg,#00C896,#00A87A)",
          color: "#002D1F", fontSize: 9, fontWeight: 800,
          padding: isStories ? "5px 10px" : "7px 14px", borderRadius: 20, letterSpacing: .5,
        }}>VER EDITAL</div>
      </div>
    </div>
  );
}
