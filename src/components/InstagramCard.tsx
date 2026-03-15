"use client";
// src/components/InstagramCard.tsx — v5
// Data da prova SEMPRE presente no card (feed + stories)
// Cargo já vem filtrado para só os contábeis (via filtrarCargosContabeis no scraper)

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
  const temProva  = c.dataProva && c.dataProva !== "-";
  const temRes    = c.dataResultado && c.dataResultado !== "-";
  const urgente   = c.diasRestantes >= 0 && c.diasRestantes <= 7;
  const isStories = formato === "stories";

  const W   = isStories ? 270 : 480;
  const H   = isStories ? 480 : 480;
  const PAD = isStories ? 20  : 28;

  const statusText = statusDisplay(c.status);
  const titleSize  = isStories ? 13 : c.cargo.length > 28 ? 16 : 21;

  // Grid de campos principais (sem data de prova — ela fica em bloco próprio)
  const campos = [
    { icon: "💰", label: "Salário",  value: c.salario },
    { icon: "🎯", label: "Vagas",    value: c.vagas   },
    {
      icon: "📅",
      label: c.status === "Inscricoes Abertas" ? "Inscrições até" : "Edital",
      value: c.inscricaoAte,
    },
    { icon: "🏦", label: "Banca",    value: c.banca !== "-" ? c.banca : "A definir" },
  ];

  const gridCols = isStories ? "1fr 1fr" : "1fr 1fr";

  return (
    <div
      id={"card-" + c.id + "-" + formato}
      style={{
        width: W, height: H,
        background: "linear-gradient(155deg,#060E20 0%,#0B1A38 50%,#060E20 100%)",
        borderRadius: 20,
        fontFamily: "'Sora',sans-serif",
        position: "relative", overflow: "hidden",
        boxSizing: "border-box",
        display: "flex", flexDirection: "column",
        padding: PAD,
        gap: 9,
        flexShrink: 0,
      }}
    >
      {/* ── Faixa lateral colorida por status ── */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
        background: `linear-gradient(to bottom, ${st.bg}, transparent)`,
      }} />

      {/* ── Grid de fundo ── */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px)," +
          "linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)",
        backgroundSize: "32px 32px", pointerEvents: "none",
      }} />

      {/* ── Glow de status ── */}
      <div style={{
        position: "absolute", top: -60, right: -60, width: 200, height: 200,
        background: `radial-gradient(circle, ${st.glow} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* ── TOP: marca + badge status ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
        <span style={{
          background: "linear-gradient(90deg,#00C896,#00E5A8)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
        }}>
          Concursos Contábeis
        </span>
        <span style={{
          background: st.bg, color: st.color,
          fontSize: 8, fontWeight: 800,
          padding: "4px 10px", borderRadius: 20,
          letterSpacing: 0.8, textTransform: "uppercase",
          boxShadow: `0 0 12px ${st.glow}`,
        }}>
          {statusText}
        </span>
      </div>

      {/* ── URGÊNCIA ── */}
      {urgente && (
        <div style={{
          background: "linear-gradient(135deg,#FF4B4B,#FF2222)",
          borderRadius: 12, padding: "7px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 4px 20px rgba(255,75,75,0.4)",
          position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🚨</span>
            <div>
              <div style={{ color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>
                URGENTE — INSCRIÇÕES ENCERRAM EM
              </div>
              <div style={{ color: "rgba(255,255,255,.75)", fontSize: 8 }}>Corra para não perder!</div>
            </div>
          </div>
          <div style={{
            background: "rgba(0,0,0,0.25)", borderRadius: 8,
            padding: "3px 9px", textAlign: "center",
          }}>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{c.diasRestantes}</div>
            <div style={{ color: "rgba(255,255,255,.7)", fontSize: 7, fontWeight: 700, letterSpacing: 1 }}>DIAS</div>
          </div>
        </div>
      )}

      {/* ── CARGO + ÓRGÃO ── */}
      <div style={{ position: "relative" }}>
        <div style={{
          color: "#fff", fontSize: titleSize, fontWeight: 800,
          lineHeight: 1.2, letterSpacing: "-0.3px", marginBottom: 3,
        }}>
          {c.cargo}
        </div>
        <div style={{ color: "#00C896", fontSize: isStories ? 10 : 12, fontWeight: 700, marginBottom: 3 }}>
          {c.orgao}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <span style={{
            background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)",
            fontSize: 8, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
          }}>
            📍 {c.estado}
          </span>
          <span style={{
            background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)",
            fontSize: 8, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
          }}>
            🎓 {c.nivel}
          </span>
        </div>
      </div>

      {/* ── DATA DA PROVA — SEMPRE VISÍVEL ─────────────────────────────────────
           Se não tem data, mostra "A definir" para manter o layout consistente  */}
      <div style={{
        background: temProva
          ? "linear-gradient(135deg,rgba(167,139,250,0.18),rgba(139,92,246,0.12))"
          : "rgba(255,255,255,.03)",
        border: temProva
          ? "1px solid rgba(167,139,250,0.35)"
          : "1px solid rgba(255,255,255,.08)",
        borderRadius: 10, padding: "8px 12px",
        display: "flex", alignItems: "center", gap: 10,
        position: "relative",
      }}>
        <span style={{ fontSize: 16 }}>📝</span>
        <div style={{ flex: 1 }}>
          <div style={{
            color: temProva ? "rgba(167,139,250,0.8)" : "rgba(255,255,255,.3)",
            fontSize: 7.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
            marginBottom: 1,
          }}>
            Data da Prova
          </div>
          <div style={{
            color: temProva ? "#C4B5FD" : "rgba(255,255,255,.25)",
            fontSize: isStories ? 13 : 16, fontWeight: 800, letterSpacing: "-0.3px",
          }}>
            {temProva ? c.dataProva : "A definir"}
          </div>
        </div>
        {/* Resultado ao lado se disponível */}
        {temRes && (
          <div style={{ textAlign: "right" }}>
            <div style={{
              color: "rgba(167,139,250,0.7)", fontSize: 7.5,
              fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 1,
            }}>
              Resultado
            </div>
            <div style={{ color: "#C4B5FD", fontSize: isStories ? 11 : 13, fontWeight: 700 }}>
              {c.dataResultado}
            </div>
          </div>
        )}
      </div>

      {/* ── GRID DE CAMPOS ── */}
      <div style={{
        display: "grid", gridTemplateColumns: gridCols,
        gap: 7, position: "relative",
      }}>
        {campos.map(item => (
          <div key={item.label} style={{
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 10, padding: "7px 10px",
          }}>
            <div style={{
              color: "rgba(255,255,255,.3)", fontSize: 7.5,
              letterSpacing: .8, marginBottom: 2, textTransform: "uppercase",
            }}>
              {item.icon} {item.label}
            </div>
            <div style={{
              color: "#fff", fontSize: isStories ? 10 : 12,
              fontWeight: 700, lineHeight: 1.3,
            }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── STORIES: CTA de arrastar ── */}
      {isStories && (
        <div style={{
          background: "rgba(0,200,150,.08)", border: "1px solid rgba(0,200,150,.2)",
          borderRadius: 10, padding: "8px 12px", textAlign: "center",
        }}>
          <div style={{ color: "rgba(255,255,255,.35)", fontSize: 7.5, marginBottom: 2 }}>
            ARRASTE PARA CIMA
          </div>
          <div style={{ color: "#00C896", fontSize: 10, fontWeight: 800 }}>
            Ver edital completo →
          </div>
        </div>
      )}

      {/* ── RODAPÉ ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 9,
        position: "relative", marginTop: "auto",
      }}>
        <div>
          <div style={{
            color: "rgba(255,255,255,.2)", fontSize: 7.5,
            letterSpacing: 1.5, textTransform: "uppercase",
          }}>
            Siga no Instagram
          </div>
          <div style={{ color: "#00C896", fontSize: isStories ? 10 : 13, fontWeight: 800 }}>
            {handle}
          </div>
        </div>
        {!isStories && (
          <div style={{
            background: "linear-gradient(135deg,#00C896,#00A87A)",
            color: "#002D1F", fontSize: 9, fontWeight: 800,
            padding: "7px 14px", borderRadius: 20, letterSpacing: .5,
          }}>
            VER EDITAL
          </div>
        )}
      </div>
    </div>
  );
}
